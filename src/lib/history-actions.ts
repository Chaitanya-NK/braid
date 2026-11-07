"use server";

import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/dal";

export type HistoryEntry = {
  id: number;
  at: number; // ms since epoch
  userId: string | null;
  edits: number;
  update: string; // base64 Yjs update
};

/**
 * Every recorded change to a page, oldest first, for the Rewind player.
 * Only workspace members can read a page's history.
 */
export async function getPageHistory(pageId: string): Promise<HistoryEntry[] | null> {
  const user = await requireUser();
  const [member] = await db
    .select({ role: schema.workspaceMember.role })
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
  if (!member) return null;

  const rows = await db
    .select()
    .from(schema.pageUpdate)
    .where(eq(schema.pageUpdate.pageId, pageId))
    .orderBy(asc(schema.pageUpdate.id));

  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.getTime(),
    userId: r.userId,
    edits: r.edits,
    update: r.update.toString("base64"),
  }));
}
