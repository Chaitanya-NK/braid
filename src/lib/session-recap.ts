import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import * as Y from "yjs";
import { db, schema } from "@/db";
import { diffBoards, diffDocs, type BoardChange, type DiffRow } from "@/lib/branch-diff";
import { diffCanvases } from "@/lib/canvas-model";

/**
 * A session's recap, worked out from the page's Rewind history: the page
 * just before the session versus just after, and how much each person
 * changed in between.
 */

export type Recap = {
  people: { userId: string | null; edits: number; steps: number }[];
  doc?: { rows: DiffRow[]; added: number; removed: number; changed: number };
  board?: BoardChange[];
  firstStepId: number | null;
  stepCount: number;
};

/** History rows are written up to ~5s after the edit, so look a little past the end. */
export const FLUSH_GRACE_MS = 6000;

export async function buildRecap(
  pageId: string,
  kind: "doc" | "board" | "canvas",
  startedAt: Date,
  endedAt: Date,
): Promise<Recap> {
  const until = new Date(endedAt.getTime() + FLUSH_GRACE_MS);
  const rows = await db
    .select()
    .from(schema.pageUpdate)
    .where(and(eq(schema.pageUpdate.pageId, pageId), lte(schema.pageUpdate.createdAt, until)))
    .orderBy(asc(schema.pageUpdate.id));

  const before = new Y.Doc();
  const after = new Y.Doc();
  const people = new Map<string | null, { edits: number; steps: number }>();
  let firstStepId: number | null = null;
  let stepCount = 0;

  for (const row of rows) {
    const update = new Uint8Array(row.update);
    Y.applyUpdate(after, update);
    if (row.createdAt <= startedAt) {
      Y.applyUpdate(before, update);
      continue;
    }
    firstStepId ??= row.id;
    stepCount++;
    // Braid's own baseline isn't an edit by anyone.
    if (row.userId === null && row.edits === 0) continue;
    const p = people.get(row.userId) ?? { edits: 0, steps: 0 };
    p.edits += row.edits;
    p.steps += 1;
    people.set(row.userId, p);
  }

  const recap: Recap = {
    people: [...people].map(([userId, p]) => ({ userId, ...p })).sort((a, b) => b.edits - a.edits),
    firstStepId,
    stepCount,
  };
  if (kind === "doc") {
    const diff = diffDocs(before, after, 1);
    recap.doc = { ...diff, rows: diff.rows.slice(0, 80) };
  } else {
    // Boards and canvases are both shown as a list of changes ("board" is that list).
    // Only which fields changed is shown, so member names aren't needed here.
    recap.board = kind === "board" ? diffBoards(before, after, []) : diffCanvases(before, after);
  }
  return recap;
}

/**
 * Brings a session up to date before showing it: closes it if its timer ran
 * out a while ago with nobody there, and builds its recap once the last
 * edits have had time to be saved. Returns the end time and recap (either
 * may still be null).
 */
export async function settleSession(
  session: { id: string; endedAt: Date | null; endsAt: Date; startedAt: Date; recap: unknown },
  pageId: string,
  kind: "doc" | "board" | "canvas",
) {
  const now = Date.now();
  let endedAt = session.endedAt;
  if (!endedAt && now > session.endsAt.getTime() + 2 * 60_000) {
    endedAt = session.endsAt;
    await db.update(schema.workSession).set({ endedAt }).where(eq(schema.workSession.id, session.id));
  }
  let recap = (session.recap as Recap | null) ?? null;
  if (endedAt && !recap && now > endedAt.getTime() + FLUSH_GRACE_MS) {
    recap = await buildRecap(pageId, kind, session.startedAt, endedAt);
    await db.update(schema.workSession).set({ recap }).where(eq(schema.workSession.id, session.id));
  }
  return { endedAt, recap };
}

/**
 * Catch-up: the page now compared with how it was at `since` (default: a
 * day ago). `since` comes from the URL, so it's clamped to the last 90 days.
 */
export async function buildChangesSince(pageId: string, kind: "doc" | "board" | "canvas", since: Date | null) {
  const now = Date.now();
  const from = new Date(Math.min(now, Math.max(now - 90 * 86_400_000, since?.getTime() ?? now - 86_400_000)));
  const recap = await buildRecap(pageId, kind, from, new Date(now));
  return { recap, since: from };
}
