/**
 * Runs board automations on the sync server.
 *
 * For each open board it remembers where every card was. A moment after a
 * person changes the board, it compares, finds the rules that fire, and does
 * their actions in one transaction tagged AUTOMATION. Changes with that tag
 * are not checked again, so rules can't set each other off in a loop.
 *
 * Because it runs here, a rule fires once however many people have the
 * board open, and also for edits made offline that sync later.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Y from "yjs";
import * as schema from "../src/db/schema";
import {
  applyActions,
  boardState,
  describeRule,
  matches,
  type Action,
  type BoardState,
  type Rule,
  type Trigger,
} from "../src/lib/automation-model";
import { readBoard } from "../src/lib/board-model";

export const AUTOMATION = Symbol("automation");

const SETTLE_MS = 300;
const RULES_TTL_MS = 3000;

type Db = PostgresJsDatabase<typeof schema>;

type Tracked = {
  pageId: string;
  doc: Y.Doc;
  state: BoardState;
  timer?: ReturnType<typeof setTimeout>;
  actorId: string | null;
};

export class AutomationEngine {
  private boards = new Map<string, Tracked>();
  private rules = new Map<string, { at: number; rules: Rule[] }>();

  constructor(private db: Db) {}

  /** Start watching a board that was just loaded. */
  track(documentName: string, pageId: string, doc: Y.Doc) {
    this.boards.set(documentName, { pageId, doc, state: boardState(doc), actorId: null });
  }

  forget(documentName: string) {
    const tracked = this.boards.get(documentName);
    if (tracked?.timer) clearTimeout(tracked.timer);
    this.boards.delete(documentName);
  }

  /** Called for every change to a document. */
  changed(documentName: string, origin: unknown, actorId: string | null) {
    const tracked = this.boards.get(documentName);
    if (!tracked) return;
    if (origin === AUTOMATION) {
      tracked.state = boardState(tracked.doc);
      return;
    }
    tracked.actorId = actorId ?? tracked.actorId;
    // Wait for a burst of changes (a drag, typing) to settle.
    clearTimeout(tracked.timer);
    tracked.timer = setTimeout(() => {
      this.run(tracked).catch((error) => console.error("Automation failed:", error));
    }, SETTLE_MS);
  }

  private async rulesFor(pageId: string) {
    const cached = this.rules.get(pageId);
    if (cached && Date.now() - cached.at < RULES_TTL_MS) return cached.rules;
    const rows = await this.db
      .select()
      .from(schema.automation)
      .where(and(eq(schema.automation.pageId, pageId), eq(schema.automation.enabled, true)));
    const rules: Rule[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      trigger: r.trigger as Trigger,
      actions: r.actions as Action[],
    }));
    this.rules.set(pageId, { at: Date.now(), rules });
    return rules;
  }

  /** Forget cached rules, e.g. after someone edits them (the cache expires on its own too). */
  invalidate(pageId: string) {
    this.rules.delete(pageId);
  }

  private async run(tracked: Tracked) {
    const { doc, pageId } = tracked;
    const before = tracked.state;
    tracked.state = boardState(doc);
    const actorId = tracked.actorId;
    tracked.actorId = null;

    const rules = await this.rulesFor(pageId);
    if (rules.length === 0) return;
    const fired = matches(before, doc, rules);
    if (fired.length === 0) return;

    const [page] = await this.db
      .select({ title: schema.page.title, workspaceId: schema.page.workspaceId, slug: schema.workspace.slug })
      .from(schema.page)
      .innerJoin(schema.workspace, eq(schema.workspace.id, schema.page.workspaceId))
      .where(eq(schema.page.id, pageId))
      .limit(1);
    if (!page) return;
    const members = await this.db
      .select({ id: schema.workspaceMember.userId, name: schema.user.name })
      .from(schema.workspaceMember)
      .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
      .where(eq(schema.workspaceMember.workspaceId, page.workspaceId));
    const memberIds = new Set(members.map((m) => m.id));
    const names = {
      columns: new Map(readBoard(doc).columns.map((c) => [c.id, c.title])),
      people: new Map(members.map((m) => [m.id, m.name])),
    };

    const runs: (typeof schema.automationRun.$inferInsert)[] = [];
    const notices: (typeof schema.notification.$inferInsert)[] = [];
    doc.transact(() => {
      for (const { rule, card } of fired) {
        for (const notice of applyActions(doc, card, rule.actions, memberIds)) {
          // Not the person whose change set it off: they just did it.
          for (const userId of new Set(notice.to.filter((id) => id !== actorId))) {
            notices.push({
              userId,
              workspaceId: page.workspaceId,
              actorId,
              kind: "automation",
              pageId,
              subject: page.title,
              snippet: `${rule.name}: “${notice.message}”`,
              url: `/w/${page.slug}/p/${pageId}`,
            });
          }
        }
        runs.push({
          automationId: rule.id,
          pageId,
          cardId: card.id,
          cardTitle: card.title,
          actorId,
          summary: describeRule(rule, names),
        });
      }
    }, AUTOMATION);

    await this.db.insert(schema.automationRun).values(runs);
    if (notices.length) await this.db.insert(schema.notification).values(notices);
    const counts = new Map<string, number>();
    for (const r of runs) counts.set(r.automationId, (counts.get(r.automationId) ?? 0) + 1);
    for (const [id, n] of counts) {
      await this.db
        .update(schema.automation)
        .set({ runCount: sql`${schema.automation.runCount} + ${n}`, lastRunAt: new Date() })
        .where(eq(schema.automation.id, id));
    }
    // Keep the log short: the newest 200 runs per board.
    await this.db.execute(sql`
      delete from automation_run where page_id = ${pageId} and id not in (
        select id from automation_run where page_id = ${pageId} order by id desc limit 200
      )`);
    console.log(`Automations on ${pageId}: ${runs.length} run(s)`);
  }
}
