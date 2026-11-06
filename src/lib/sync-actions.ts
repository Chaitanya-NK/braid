"use server";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/dal";
import { createSyncToken } from "@/lib/sync-token";

/**
 * Issues a ticket for the sync server. Called by the editor every time it
 * (re)connects, so tickets can stay short-lived. Returns null if the user
 * isn't a member of the page's workspace.
 */
export async function getSyncToken(pageId: string): Promise<string | null> {
  const user = await requireUser();
  const [row] = await db
    .select({
      archivedAt: schema.page.archivedAt,
      role: schema.workspaceMember.role,
      color: schema.workspaceMember.color,
    })
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
  if (!row) return null;

  return createSyncToken({
    pageId,
    userId: user.id,
    name: user.name,
    color: row.color,
    // Guests and trashed pages are view-only.
    readOnly: row.role === "guest" || row.archivedAt !== null,
  });
}
