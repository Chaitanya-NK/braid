"use server";

import { randomBytes } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { MemberRole } from "@/db/schema";
import { findInvite, requireUser } from "@/lib/dal";
import { notify, workspaceManagers } from "@/lib/notify";
import { assignableRoles, canChangeRole, canLeave, canManage, canManageMembers } from "@/lib/permissions";
import { pickColor } from "@/lib/utils";

/**
 * Invites and membership. Every action re-checks the caller's role in the
 * workspace using the shared rules in permissions.ts.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function myMembership(workspaceId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ role: schema.workspaceMember.role, slug: schema.workspace.slug, name: schema.workspace.name })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, user.id)))
    .limit(1);
  return row ? { user, ...row } : null;
}

async function ownerCount(workspaceId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.role, "owner")));
  return row.n;
}

async function roleOf(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ role: schema.workspaceMember.role })
    .from(schema.workspaceMember)
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

/* --------------------------------- Invites -------------------------------- */

const inviteInput = z.object({
  role: z.enum(["owner", "admin", "member", "guest"]),
  note: z.string().trim().max(80, "Keep the note under 80 characters").optional(),
  days: z.number().int().min(1).max(30),
});

export async function createInvite(
  workspaceId: string,
  input: { role: MemberRole; note?: string; days: number },
): Promise<Result<{ token: string }>> {
  const me = await myMembership(workspaceId);
  if (!me || !canManageMembers(me.role)) return { ok: false, error: "Only owners and admins can invite people" };
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!assignableRoles(me.role).includes(parsed.data.role)) {
    return { ok: false, error: `You can't invite people as ${parsed.data.role}` };
  }
  const token = randomBytes(18).toString("base64url");
  await db.insert(schema.workspaceInvite).values({
    workspaceId,
    token,
    role: parsed.data.role,
    note: parsed.data.note || null,
    createdBy: me.user.id,
    expiresAt: new Date(Date.now() + parsed.data.days * 86_400_000),
  });
  refresh(me.slug);
  return { ok: true, token };
}

export async function revokeInvite(inviteId: string): Promise<Result> {
  const [invite] = await db
    .select({ workspaceId: schema.workspaceInvite.workspaceId })
    .from(schema.workspaceInvite)
    .where(eq(schema.workspaceInvite.id, inviteId))
    .limit(1);
  if (!invite) return { ok: false, error: "That invite no longer exists" };
  const me = await myMembership(invite.workspaceId);
  if (!me || !canManageMembers(me.role)) return { ok: false, error: "Only owners and admins can revoke invites" };
  await db.update(schema.workspaceInvite).set({ revokedAt: new Date() }).where(eq(schema.workspaceInvite.id, inviteId));
  refresh(me.slug);
  return { ok: true };
}

export async function acceptInvite(token: string): Promise<Result<{ url: string; workspace: string }>> {
  const user = await requireUser();
  const found = await findInvite(token);
  if (!found) return { ok: false, error: "This invite link has expired or was revoked. Ask for a new one." };
  const { invite, workspace } = found;
  const url = `/w/${workspace.slug}`;
  if (await roleOf(workspace.id, user.id)) return { ok: true, url, workspace: workspace.name };

  await db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(schema.workspaceMember)
      .where(eq(schema.workspaceMember.workspaceId, workspace.id));
    await tx
      .insert(schema.workspaceMember)
      .values({ workspaceId: workspace.id, userId: user.id, role: invite.role, color: pickColor(n) })
      .onConflictDoNothing();
    await tx
      .update(schema.workspaceInvite)
      .set({ uses: sql`${schema.workspaceInvite.uses} + 1` })
      .where(eq(schema.workspaceInvite.id, invite.id));
  });

  const managers = await workspaceManagers(workspace.id, user.id);
  await notify([invite.createdBy, ...managers], {
    workspaceId: workspace.id,
    actorId: user.id,
    kind: "member_joined",
    subject: workspace.name,
    snippet: `Joined as ${invite.role}`,
    url: `${url}/settings`,
  });
  refresh(workspace.slug);
  return { ok: true, url, workspace: workspace.name };
}

/* --------------------------------- Members -------------------------------- */

export async function changeRole(workspaceId: string, userId: string, next: MemberRole): Promise<Result> {
  const me = await myMembership(workspaceId);
  if (!me) return { ok: false, error: "You're not in this workspace" };
  if (userId === me.user.id) return { ok: false, error: "Ask another owner or admin to change your role" };
  const current = await roleOf(workspaceId, userId);
  if (!current) return { ok: false, error: "They're no longer in this workspace" };
  if (!canChangeRole(me.role, current, next)) return { ok: false, error: "You can't give them that role" };
  await db
    .update(schema.workspaceMember)
    .set({ role: next })
    .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
  refresh(me.slug);
  return { ok: true };
}

async function dropMember(workspaceId: string, userId: string) {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.workspaceMember)
      .where(and(eq(schema.workspaceMember.workspaceId, workspaceId), eq(schema.workspaceMember.userId, userId)));
    await tx
      .delete(schema.notification)
      .where(and(eq(schema.notification.workspaceId, workspaceId), eq(schema.notification.userId, userId)));
  });
}

export async function removeMember(workspaceId: string, userId: string): Promise<Result> {
  const me = await myMembership(workspaceId);
  if (!me) return { ok: false, error: "You're not in this workspace" };
  if (userId === me.user.id) return { ok: false, error: "Use “Leave workspace” instead" };
  const current = await roleOf(workspaceId, userId);
  if (!current) return { ok: true };
  if (!canManage(me.role, current)) return { ok: false, error: "You can't remove them" };
  await dropMember(workspaceId, userId);
  refresh(me.slug);
  return { ok: true };
}

export async function leaveWorkspace(workspaceId: string): Promise<Result> {
  const me = await myMembership(workspaceId);
  if (!me) return { ok: true };
  if (!canLeave(me.role, await ownerCount(workspaceId))) {
    return { ok: false, error: "You're the only owner. Make someone else an owner first." };
  }
  await dropMember(workspaceId, me.user.id);
  refresh(me.slug);
  return { ok: true };
}
