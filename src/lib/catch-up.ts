import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Catch-up: what other people changed on pages while you were away, from
 * Rewind history and when you last had each page open. Your own changes and
 * Braid's starting snapshot don't count; automations do.
 */

export async function lastSeen(userId: string, pageId: string) {
  const [row] = await db
    .select({ at: schema.pageVisit.lastSeenAt })
    .from(schema.pageVisit)
    .where(and(eq(schema.pageVisit.userId, userId), eq(schema.pageVisit.pageId, pageId)))
    .limit(1);
  return row?.at ?? null;
}

const byOthers = (me: string) =>
  sql`${schema.pageUpdate.userId} is distinct from ${me} and not (${schema.pageUpdate.userId} is null and ${schema.pageUpdate.edits} = 0)`;

/** Changes by others to one page since a time: how many, and by whom. */
export async function changesSince(pageId: string, me: string, since: Date) {
  const rows = await db
    .select({ userId: schema.pageUpdate.userId, edits: sql<number>`sum(${schema.pageUpdate.edits})::int` })
    .from(schema.pageUpdate)
    .where(and(eq(schema.pageUpdate.pageId, pageId), gt(schema.pageUpdate.createdAt, since), byOthers(me)))
    .groupBy(schema.pageUpdate.userId);
  return { edits: rows.reduce((n, r) => n + r.edits, 0), people: rows.map((r) => r.userId) };
}

export type CatchUpItem = {
  pageId: string;
  title: string;
  kind: "doc" | "board" | "canvas";
  since: Date;
  visited: boolean;
  edits: number;
  people: (string | null)[];
  lastAt: Date;
};

/**
 * Pages in a workspace that others changed since you last looked (or, for
 * pages you've never opened, since you joined), newest first.
 */
export async function catchUpList(userId: string, workspaceId: string): Promise<CatchUpItem[]> {
  const rows = await db.execute<{
    page_id: string;
    title: string;
    kind: "doc" | "board" | "canvas";
    since: number;
    visited: boolean;
    edits: number;
    people: (string | null)[];
    last_at: number;
  }>(sql`
    select p.id as page_id, p.title, p.kind,
           -- Epoch milliseconds: the columns are UTC timestamps without a time zone.
           (extract(epoch from coalesce(v.last_seen_at, m.joined_at)) * 1000)::float8 as since,
           (v.last_seen_at is not null) as visited,
           sum(u.edits)::int as edits,
           array_agg(distinct u.user_id) as people,
           (extract(epoch from max(u.created_at)) * 1000)::float8 as last_at
    from page p
    join workspace_member m on m.workspace_id = p.workspace_id and m.user_id = ${userId}
    left join page_visit v on v.page_id = p.id and v.user_id = ${userId}
    join page_update u on u.page_id = p.id
      and u.created_at > coalesce(v.last_seen_at, m.joined_at)
      and u.user_id is distinct from ${userId}
      and not (u.user_id is null and u.edits = 0)
    where p.workspace_id = ${workspaceId} and p.archived_at is null
    group by p.id, v.last_seen_at, m.joined_at
    order by max(u.created_at) desc
  `);
  return rows.map((r) => ({
    pageId: r.page_id,
    title: r.title,
    kind: r.kind,
    since: new Date(Number(r.since)),
    visited: r.visited,
    edits: r.edits,
    people: r.people,
    lastAt: new Date(Number(r.last_at)),
  }));
}
