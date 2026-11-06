import "server-only";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
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
