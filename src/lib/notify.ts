import "server-only";
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NotificationKind } from "@/db/schema";

type Notice = {
  workspaceId: string;
  actorId: string;
  kind: NotificationKind;
  pageId?: string | null;
  subject: string;
  snippet?: string | null;
  url: string;
};

/**
 * Puts a notification in each person's inbox. Never notifies the person
 * who caused it, and skips anyone who got the same one in the last two
 * minutes (so mentioning someone twice in a row is one notification).
 * Only people who are members of the workspace are notified.
 */
export async function notify(userIds: string[], notice: Notice) {
  const targets = [...new Set(userIds)].filter((id) => id !== notice.actorId);
  if (targets.length === 0) return 0;

  const members = await db
    .select({ userId: schema.workspaceMember.userId })
    .from(schema.workspaceMember)
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, notice.workspaceId),
        inArray(schema.workspaceMember.userId, targets),
      ),
    );
  const recent = await db
    .select({ userId: schema.notification.userId })
    .from(schema.notification)
    .where(
      and(
        inArray(schema.notification.userId, targets),
        eq(schema.notification.kind, notice.kind),
        eq(schema.notification.url, notice.url),
        eq(schema.notification.actorId, notice.actorId),
        gt(schema.notification.createdAt, new Date(Date.now() - 2 * 60_000)),
      ),
    );
  const skip = new Set(recent.map((r) => r.userId));
  const rows = members
    .map((m) => m.userId)
    .filter((id) => !skip.has(id))
    .map((userId) => ({
      userId,
      workspaceId: notice.workspaceId,
      actorId: notice.actorId,
      kind: notice.kind,
      pageId: notice.pageId ?? null,
      subject: notice.subject.slice(0, 200),
      snippet: notice.snippet?.slice(0, 280) ?? null,
      url: notice.url,
    }));
  if (rows.length) await db.insert(schema.notification).values(rows);
  return rows.length;
}

/** Owners and admins of a workspace, except one person. */
export async function workspaceManagers(workspaceId: string, except: string) {
  const rows = await db
    .select({ userId: schema.workspaceMember.userId })
    .from(schema.workspaceMember)
    .where(
      and(
        eq(schema.workspaceMember.workspaceId, workspaceId),
        inArray(schema.workspaceMember.role, ["owner", "admin"]),
        ne(schema.workspaceMember.userId, except),
      ),
    );
  return rows.map((r) => r.userId);
}
