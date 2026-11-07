import "server-only";
import { and, asc, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

/**
 * Data Access Layer.
 * Every read and write that needs a user goes through here, so the
 * "who is asking, and are they allowed?" check lives in one place.
 */

export type CurrentUser = { id: string; name: string; email: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function listMyWorkspaces(userId: string) {
  return db
    .select({
      id: schema.workspace.id,
      name: schema.workspace.name,
      slug: schema.workspace.slug,
      role: schema.workspaceMember.role,
    })
    .from(schema.workspaceMember)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceMember.workspaceId))
    .where(eq(schema.workspaceMember.userId, userId))
    .orderBy(asc(schema.workspace.createdAt));
}

/** Loads a workspace by slug and checks the user is a member. 404s otherwise. */
export async function requireWorkspace(slug: string) {
  const user = await requireUser();
  const [row] = await db
    .select({
      workspace: schema.workspace,
      role: schema.workspaceMember.role,
      color: schema.workspaceMember.color,
    })
    .from(schema.workspace)
    .innerJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.workspaceId, schema.workspace.id),
        eq(schema.workspaceMember.userId, user.id),
      ),
    )
    .where(eq(schema.workspace.slug, slug))
    .limit(1);
  if (!row) notFound();
  return { user, workspace: row.workspace, role: row.role, color: row.color };
}

/** Same check, by id. Used by Server Actions, which receive ids from forms. */
export async function requireWorkspaceById(workspaceId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ workspace: schema.workspace, role: schema.workspaceMember.role })
    .from(schema.workspace)
    .innerJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.workspaceId, schema.workspace.id),
        eq(schema.workspaceMember.userId, user.id),
      ),
    )
    .where(eq(schema.workspace.id, workspaceId))
    .limit(1);
  if (!row) throw new Error("Workspace not found");
  return { user, workspace: row.workspace, role: row.role };
}

export async function listPages(workspaceId: string) {
  return db
    .select()
    .from(schema.page)
    .where(and(eq(schema.page.workspaceId, workspaceId), isNull(schema.page.archivedAt)))
    .orderBy(asc(schema.page.position), asc(schema.page.createdAt));
}

export async function listRecentPages(workspaceId: string, limit = 8) {
  return db
    .select({
      id: schema.page.id,
      title: schema.page.title,
      kind: schema.page.kind,
      updatedAt: schema.page.updatedAt,
      createdByName: schema.user.name,
    })
    .from(schema.page)
    .innerJoin(schema.user, eq(schema.user.id, schema.page.createdBy))
    .where(and(eq(schema.page.workspaceId, workspaceId), isNull(schema.page.archivedAt)))
    .orderBy(desc(schema.page.updatedAt))
    .limit(limit);
}

export async function listArchivedPages(workspaceId: string) {
  return db
    .select()
    .from(schema.page)
    .where(and(eq(schema.page.workspaceId, workspaceId), isNotNull(schema.page.archivedAt)))
    .orderBy(desc(schema.page.archivedAt));
}

/** Loads a page and checks the user belongs to its workspace. */
export async function requirePage(slug: string, pageId: string) {
  const ctx = await requireWorkspace(slug);
  if (!isUuid(pageId)) notFound();
  const [found] = await db
    .select()
    .from(schema.page)
    .where(and(eq(schema.page.id, pageId), eq(schema.page.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!found) notFound();
  return { ...ctx, page: found };
}

export async function listMembers(workspaceId: string) {
  return db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.workspaceMember.role,
      color: schema.workspaceMember.color,
      joinedAt: schema.workspaceMember.joinedAt,
    })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(eq(schema.workspaceMember.workspaceId, workspaceId))
    .orderBy(asc(schema.workspaceMember.joinedAt));
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/* -------------------------------- Branches -------------------------------- */

const branchColumns = {
  id: schema.pageBranch.id,
  pageId: schema.pageBranch.pageId,
  name: schema.pageBranch.name,
  status: schema.pageBranch.status,
  createdBy: schema.pageBranch.createdBy,
  createdAt: schema.pageBranch.createdAt,
  updatedAt: schema.pageBranch.updatedAt,
  closedAt: schema.pageBranch.closedAt,
  closedBy: schema.pageBranch.closedBy,
  authorName: schema.user.name,
};

/** A page's branches, newest first, with who started each one. */
export async function listBranches(pageId: string) {
  return db
    .select(branchColumns)
    .from(schema.pageBranch)
    .innerJoin(schema.user, eq(schema.user.id, schema.pageBranch.createdBy))
    .where(eq(schema.pageBranch.pageId, pageId))
    .orderBy(desc(schema.pageBranch.createdAt));
}

export type BranchSummary = Awaited<ReturnType<typeof listBranches>>[number];

/** Loads a branch of a page the user can see. `withBase` also returns the starting copy, for review. */
export async function requireBranch(slug: string, pageId: string, branchId: string, withBase = false) {
  const ctx = await requirePage(slug, pageId);
  if (!isUuid(branchId)) notFound();
  const [found] = await db
    .select({ ...branchColumns, base: schema.pageBranch.base })
    .from(schema.pageBranch)
    .innerJoin(schema.user, eq(schema.user.id, schema.pageBranch.createdBy))
    .where(and(eq(schema.pageBranch.id, branchId), eq(schema.pageBranch.pageId, pageId)))
    .limit(1);
  if (!found) notFound();
  const { base, ...branch } = found;
  return { ...ctx, branch, base: withBase && base ? base.toString("base64") : null };
}

/* --------------------------------- Invites -------------------------------- */

/** A usable invite (not revoked, not expired), with its workspace and who made it. */
export async function findInvite(token: string) {
  const [row] = await db
    .select({
      invite: schema.workspaceInvite,
      workspace: { id: schema.workspace.id, name: schema.workspace.name, slug: schema.workspace.slug },
      inviter: schema.user.name,
    })
    .from(schema.workspaceInvite)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.workspaceInvite.workspaceId))
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceInvite.createdBy))
    .where(
      and(
        eq(schema.workspaceInvite.token, token),
        isNull(schema.workspaceInvite.revokedAt),
        gt(schema.workspaceInvite.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Invites that still work, newest first. */
export async function listInvites(workspaceId: string) {
  return db
    .select({
      id: schema.workspaceInvite.id,
      token: schema.workspaceInvite.token,
      role: schema.workspaceInvite.role,
      note: schema.workspaceInvite.note,
      uses: schema.workspaceInvite.uses,
      expiresAt: schema.workspaceInvite.expiresAt,
      createdAt: schema.workspaceInvite.createdAt,
      createdBy: schema.user.name,
    })
    .from(schema.workspaceInvite)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceInvite.createdBy))
    .where(
      and(
        eq(schema.workspaceInvite.workspaceId, workspaceId),
        isNull(schema.workspaceInvite.revokedAt),
        gt(schema.workspaceInvite.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(schema.workspaceInvite.createdAt));
}

/* ------------------------------ Notifications ----------------------------- */

export async function listNotifications(userId: string, workspaceId: string, limit = 100) {
  return db
    .select({
      id: schema.notification.id,
      kind: schema.notification.kind,
      subject: schema.notification.subject,
      snippet: schema.notification.snippet,
      url: schema.notification.url,
      createdAt: schema.notification.createdAt,
      readAt: schema.notification.readAt,
      actorName: schema.user.name,
      actorId: schema.notification.actorId,
    })
    .from(schema.notification)
    .leftJoin(schema.user, eq(schema.user.id, schema.notification.actorId))
    .where(and(eq(schema.notification.userId, userId), eq(schema.notification.workspaceId, workspaceId)))
    .orderBy(desc(schema.notification.createdAt))
    .limit(limit);
}

/* ------------------------------- Automations ------------------------------ */

export async function listAutomations(pageId: string) {
  return db
    .select()
    .from(schema.automation)
    .where(eq(schema.automation.pageId, pageId))
    .orderBy(asc(schema.automation.createdAt));
}

export async function listAutomationRuns(pageId: string, limit = 20) {
  return db
    .select({
      id: schema.automationRun.id,
      automationId: schema.automationRun.automationId,
      cardTitle: schema.automationRun.cardTitle,
      summary: schema.automationRun.summary,
      createdAt: schema.automationRun.createdAt,
      actorName: schema.user.name,
    })
    .from(schema.automationRun)
    .leftJoin(schema.user, eq(schema.user.id, schema.automationRun.actorId))
    .where(eq(schema.automationRun.pageId, pageId))
    .orderBy(desc(schema.automationRun.id))
    .limit(limit);
}

/** A page's saved Yjs state (may be a few seconds behind live edits). */
export async function loadPageDoc(pageId: string) {
  const [row] = await db
    .select({ state: schema.pageDoc.state })
    .from(schema.pageDoc)
    .where(eq(schema.pageDoc.pageId, pageId))
    .limit(1);
  return row?.state ?? null;
}

/* -------------------------------- Sessions -------------------------------- */

export async function listSessions(pageId: string) {
  return db
    .select({
      id: schema.workSession.id,
      title: schema.workSession.title,
      goal: schema.workSession.goal,
      startedAt: schema.workSession.startedAt,
      endsAt: schema.workSession.endsAt,
      endedAt: schema.workSession.endedAt,
      startedByName: schema.user.name,
    })
    .from(schema.workSession)
    .innerJoin(schema.user, eq(schema.user.id, schema.workSession.startedBy))
    .where(eq(schema.workSession.pageId, pageId))
    .orderBy(desc(schema.workSession.startedAt));
}

export async function getSessionWithPeople(pageId: string, sessionId: string) {
  if (!isUuid(sessionId)) return null;
  const [session] = await db
    .select({ session: schema.workSession, startedByName: schema.user.name })
    .from(schema.workSession)
    .innerJoin(schema.user, eq(schema.user.id, schema.workSession.startedBy))
    .where(and(eq(schema.workSession.id, sessionId), eq(schema.workSession.pageId, pageId)))
    .limit(1);
  if (!session) return null;
  const joined = await db
    .select({ userId: schema.sessionParticipant.userId })
    .from(schema.sessionParticipant)
    .where(eq(schema.sessionParticipant.sessionId, sessionId));
  return { ...session.session, startedByName: session.startedByName, joined: joined.map((j) => j.userId) };
}

/** Live sessions anywhere in a workspace, for "Live now" on the home page. */
export async function listLiveSessions(workspaceId: string) {
  return db
    .select({
      id: schema.workSession.id,
      title: schema.workSession.title,
      pageId: schema.workSession.pageId,
      pageTitle: schema.page.title,
      endsAt: schema.workSession.endsAt,
      startedByName: schema.user.name,
    })
    .from(schema.workSession)
    .innerJoin(schema.page, eq(schema.page.id, schema.workSession.pageId))
    .innerJoin(schema.user, eq(schema.user.id, schema.workSession.startedBy))
    .where(
      and(
        eq(schema.workSession.workspaceId, workspaceId),
        isNull(schema.workSession.endedAt),
        // Not ones whose timer ran out a while ago with nobody there.
        sql`${schema.workSession.endsAt} > now() - interval '2 minutes'`,
      ),
    )
    .orderBy(desc(schema.workSession.startedAt));
}
