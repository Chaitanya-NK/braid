"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/dal";

/**
 * Records that I've seen a page up to now. Called while a page is open (so
 * changes I watched happen live don't show up in Catch-up later).
 * Deliberately doesn't refresh the page: its "since you were here" banner
 * should stay put while I read it.
 */
export async function markSeen(pageId: string) {
  const user = await requireUser();
  const [member] = await db
    .select({ id: schema.page.id })
    .from(schema.page)
    .innerJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.workspaceId, schema.page.workspaceId),
        eq(schema.workspaceMember.userId, user.id),
      ),
    )
    .where(eq(schema.page.id, pageId))
    .limit(1);
  if (!member) return;
  await db
    .insert(schema.pageVisit)
    .values({ userId: user.id, pageId, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.pageVisit.userId, schema.pageVisit.pageId],
      set: { lastSeenAt: sql`excluded.last_seen_at` },
    });
}

/** "Mark all as caught up" for a workspace. */
export async function markAllSeen(workspaceId: string) {
  const user = await requireUser();
  const pages = await db
    .select({ id: schema.page.id, slug: schema.workspace.slug })
    .from(schema.page)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.page.workspaceId))
    .innerJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.workspaceId, schema.page.workspaceId),
        eq(schema.workspaceMember.userId, user.id),
      ),
    )
    .where(and(eq(schema.page.workspaceId, workspaceId), isNull(schema.page.archivedAt)));
  if (pages.length === 0) return;
  const now = new Date();
  await db
    .insert(schema.pageVisit)
    .values(pages.map((p) => ({ userId: user.id, pageId: p.id, lastSeenAt: now })))
    .onConflictDoUpdate({
      target: [schema.pageVisit.userId, schema.pageVisit.pageId],
      set: { lastSeenAt: sql`excluded.last_seen_at` },
    });
  revalidatePath(`/w/${pages[0].slug}`, "layout");
}
