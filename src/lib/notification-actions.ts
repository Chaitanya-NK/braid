"use server";

import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NotificationKind } from "@/db/schema";
import { requireUser } from "@/lib/dal";
import { notify } from "@/lib/notify";

/**
 * Inbox reads and writes, plus the two notifications the browser triggers:
 * @mentions in docs and card assignments. (Branch merges and new members are
 * notified by their own actions on the server.)
 */

/** The page (or branch) the caller is editing, if they're allowed to edit it. */
async function editablePage(pageId: string, branchId: string | null) {
  const user = await requireUser();
  const [row] = await db
    .select({
      page: { id: schema.page.id, title: schema.page.title, workspaceId: schema.page.workspaceId },
      slug: schema.workspace.slug,
      role: schema.workspaceMember.role,
    })
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
  if (!row || row.role === "guest") return null;
  let url = `/w/${row.slug}/p/${pageId}`;
  let where = row.page.title;
  if (branchId) {
    const [branch] = await db
      .select({ name: schema.pageBranch.name })
      .from(schema.pageBranch)
      .where(and(eq(schema.pageBranch.id, branchId), eq(schema.pageBranch.pageId, pageId)))
      .limit(1);
    if (!branch) return null;
    url += `/b/${branchId}`;
    where = `${row.page.title} · ${branch.name}`;
  }
  return { user, ...row, url, where };
}

const cleanIds = (ids: string[]) => ids.filter((id) => typeof id === "string" && id.length < 100).slice(0, 20);

export async function notifyMention(pageId: string, branchId: string | null, userIds: string[], snippet: string) {
  const ctx = await editablePage(pageId, branchId);
  if (!ctx) return 0;
  return notify(cleanIds(userIds), {
    workspaceId: ctx.page.workspaceId,
    actorId: ctx.user.id,
    kind: "mention",
    pageId,
    subject: ctx.where,
    snippet: snippet.trim() || null,
    url: ctx.url,
  });
}

export async function notifyAssigned(pageId: string, branchId: string | null, userIds: string[], cardTitle: string) {
  const ctx = await editablePage(pageId, branchId);
  if (!ctx) return 0;
  return notify(cleanIds(userIds), {
    workspaceId: ctx.page.workspaceId,
    actorId: ctx.user.id,
    kind: "assigned",
    pageId,
    subject: ctx.where,
    snippet: cardTitle.trim() || "Untitled card",
    url: ctx.url,
  });
}

export type InboxItem = {
  id: string;
  kind: NotificationKind;
  subject: string;
  snippet: string | null;
  url: string;
  actorName: string | null;
  createdAt: number;
};

/** Unread count and the newest unread items, for the sidebar badge and "new notification" toasts. */
export async function getInboxStatus(workspaceId: string): Promise<{ unread: number; latest: InboxItem[] }> {
  const user = await requireUser();
  const mine = and(
    eq(schema.notification.userId, user.id),
    eq(schema.notification.workspaceId, workspaceId),
    isNull(schema.notification.readAt),
  );
  const [[{ n }], latest] = await Promise.all([
    db.select({ n: count() }).from(schema.notification).where(mine),
    db
      .select({
        id: schema.notification.id,
        kind: schema.notification.kind,
        subject: schema.notification.subject,
        snippet: schema.notification.snippet,
        url: schema.notification.url,
        actorName: schema.user.name,
        createdAt: schema.notification.createdAt,
      })
      .from(schema.notification)
      .leftJoin(schema.user, eq(schema.user.id, schema.notification.actorId))
      .where(mine)
      .orderBy(desc(schema.notification.createdAt))
      .limit(5),
  ]);
  return { unread: n, latest: latest.map((l) => ({ ...l, createdAt: l.createdAt.getTime() })) };
}

export async function markRead(ids: string[]) {
  const user = await requireUser();
  if (ids.length === 0) return;
  await db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notification.userId, user.id),
        inArray(schema.notification.id, ids.slice(0, 200)),
        isNull(schema.notification.readAt),
      ),
    );
}

export async function markUnread(id: string) {
  const user = await requireUser();
  await db
    .update(schema.notification)
    .set({ readAt: null })
    .where(and(eq(schema.notification.userId, user.id), eq(schema.notification.id, id)));
}

export async function markAllRead(workspaceId: string) {
  const user = await requireUser();
  await db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notification.userId, user.id),
        eq(schema.notification.workspaceId, workspaceId),
        isNull(schema.notification.readAt),
      ),
    );
}
