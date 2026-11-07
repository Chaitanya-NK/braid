"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/dal";
import { parseRule, type Action, type Trigger } from "@/lib/automation-model";

/**
 * Saving, switching and deleting board rules. Members (not guests) of the
 * board's workspace can manage them. The sync server picks up changes within
 * a few seconds.
 */

export type AutomationResult = { ok: true } | { ok: false; error: string };

async function boardAccess(pageId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ page: schema.page, slug: schema.workspace.slug, role: schema.workspaceMember.role })
    .from(schema.page)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.page.workspaceId))
    .innerJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.workspaceId, schema.page.workspaceId),
        eq(schema.workspaceMember.userId, user.id),
      ),
    )
    .where(eq(schema.page.id, pageId))
    .limit(1);
  if (!row) return { ok: false, error: "That board no longer exists" } as const;
  if (row.role === "guest") return { ok: false, error: "Guests can't change automations" } as const;
  if (row.page.kind !== "board") return { ok: false, error: "Automations are for boards" } as const;
  return { ok: true, user, ...row } as const;
}

async function automationAccess(id: string) {
  const [rule] = await db.select().from(schema.automation).where(eq(schema.automation.id, id)).limit(1);
  if (!rule) return { ok: false, error: "That rule no longer exists" } as const;
  const access = await boardAccess(rule.pageId);
  if (!access.ok) return access;
  return { ...access, rule } as const;
}

const refresh = (slug: string, pageId: string) => revalidatePath(`/w/${slug}/p/${pageId}/automations`);

export async function saveAutomation(
  pageId: string,
  input: { id?: string; name: string; trigger: Trigger; actions: Action[] },
): Promise<AutomationResult> {
  const access = await boardAccess(pageId);
  if (!access.ok) return access;
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give the rule a name" };
  const rule = parseRule(input);
  if (typeof rule === "string") return { ok: false, error: rule };

  // People in "assign" and "notify" steps must be in this workspace.
  const people = rule.actions.flatMap((a) =>
    a.type === "assign" ? [a.userId] : a.type === "notify" && a.to !== "assignees" && a.to !== "creator" ? [a.to] : [],
  );
  if (people.length) {
    const members = await db
      .select({ id: schema.workspaceMember.userId })
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.workspaceId, access.page.workspaceId));
    const ids = new Set(members.map((m) => m.id));
    if (people.some((id) => !ids.has(id))) return { ok: false, error: "Pick someone in this workspace" };
  }

  if (input.id) {
    const existing = await automationAccess(input.id);
    if (!existing.ok) return existing;
    if (existing.rule.pageId !== pageId) return { ok: false, error: "That rule belongs to another board" };
    await db
      .update(schema.automation)
      .set({ name, trigger: rule.trigger, actions: rule.actions, updatedAt: new Date() })
      .where(eq(schema.automation.id, input.id));
  } else {
    await db
      .insert(schema.automation)
      .values({ pageId, name, trigger: rule.trigger, actions: rule.actions, createdBy: access.user.id });
  }
  refresh(access.slug, pageId);
  return { ok: true };
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<AutomationResult> {
  const access = await automationAccess(id);
  if (!access.ok) return access;
  await db.update(schema.automation).set({ enabled, updatedAt: new Date() }).where(eq(schema.automation.id, id));
  refresh(access.slug, access.rule.pageId);
  return { ok: true };
}

export async function deleteAutomation(id: string): Promise<AutomationResult> {
  const access = await automationAccess(id);
  if (!access.ok) return access;
  await db.delete(schema.automation).where(eq(schema.automation.id, id));
  refresh(access.slug, access.rule.pageId);
  return { ok: true };
}
