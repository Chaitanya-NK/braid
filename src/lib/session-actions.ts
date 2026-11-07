"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/dal";
import { notify } from "@/lib/notify";

/**
 * Live sessions: a timed, shared working block on a page. One at a time per
 * page. Members start, extend and end them; anyone in the workspace can join.
 *
 * A session nobody ends is closed automatically a couple of minutes after
 * its timer runs out (see `finishAbandoned`).
 */

export type SessionResult = { ok: true; id: string } | { ok: false; error: string };

export type LiveSession = {
  id: string;
  title: string;
  goal: string | null;
  startedBy: string;
  startedByName: string;
  startedAt: number;
  endsAt: number;
  participants: { id: string; name: string; color: string }[];
};

const ABANDONED_AFTER_MS = 2 * 60_000;

async function pageAccess(pageId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({
      page: schema.page,
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
  return row ? { user, ...row } : null;
}

async function sessionAccess(sessionId: string) {
  const [session] = await db
    .select()
    .from(schema.workSession)
    .where(eq(schema.workSession.id, sessionId))
    .limit(1);
  if (!session) return null;
  const access = await pageAccess(session.pageId);
  return access ? { ...access, session } : null;
}

/** Closes sessions whose timer ran out a while ago with nobody there to end them. */
async function finishAbandoned(pageId: string) {
  await db
    .update(schema.workSession)
    .set({ endedAt: schema.workSession.endsAt })
    .where(
      and(
        eq(schema.workSession.pageId, pageId),
        isNull(schema.workSession.endedAt),
        sql`${schema.workSession.endsAt} < now() - (${ABANDONED_AFTER_MS / 1000} * interval '1 second')`,
      ),
    );
}

/** The page's live session, if there is one. Everyone who can see the page can see it. */
export async function getLiveSession(pageId: string): Promise<LiveSession | null> {
  const access = await pageAccess(pageId);
  if (!access) return null;
  await finishAbandoned(pageId);
  const [session] = await db
    .select({ session: schema.workSession, startedByName: schema.user.name })
    .from(schema.workSession)
    .innerJoin(schema.user, eq(schema.user.id, schema.workSession.startedBy))
    .where(and(eq(schema.workSession.pageId, pageId), isNull(schema.workSession.endedAt)))
    .limit(1);
  if (!session) return null;
  const participants = await db
    .select({ id: schema.user.id, name: schema.user.name, color: schema.workspaceMember.color })
    .from(schema.sessionParticipant)
    .innerJoin(schema.user, eq(schema.user.id, schema.sessionParticipant.userId))
    .innerJoin(
      schema.workspaceMember,
      and(
        eq(schema.workspaceMember.userId, schema.sessionParticipant.userId),
        eq(schema.workspaceMember.workspaceId, session.session.workspaceId),
      ),
    )
    .where(eq(schema.sessionParticipant.sessionId, session.session.id))
    .orderBy(asc(schema.sessionParticipant.joinedAt));
  const s = session.session;
  return {
    id: s.id,
    title: s.title,
    goal: s.goal,
    startedBy: s.startedBy,
    startedByName: session.startedByName,
    startedAt: s.startedAt.getTime(),
    endsAt: s.endsAt.getTime(),
    participants,
  };
}

const startInput = z.object({
  title: z.string().trim().min(1, "Give the session a name").max(80, "Keep the name under 80 characters"),
  goal: z.string().trim().max(200, "Keep the goal under 200 characters").optional(),
  minutes: z.number().int().min(5).max(180),
});

export async function startSession(
  pageId: string,
  input: { title: string; goal?: string; minutes: number },
): Promise<SessionResult> {
  const access = await pageAccess(pageId);
  if (!access) return { ok: false, error: "That page no longer exists" };
  if (access.role === "guest") return { ok: false, error: "Guests can join sessions, but not start them" };
  if (access.page.archivedAt) return { ok: false, error: "Restore the page from Trash first" };
  if (access.page.kind === "canvas") return { ok: false, error: "Sessions on canvases arrive in Phase 9" };
  const parsed = startInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await finishAbandoned(pageId);
  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [live] = await tx
      .select({ id: schema.workSession.id })
      .from(schema.workSession)
      .where(and(eq(schema.workSession.pageId, pageId), isNull(schema.workSession.endedAt)))
      .limit(1);
    if (live) return null;
    const [session] = await tx
      .insert(schema.workSession)
      .values({
        pageId,
        workspaceId: access.page.workspaceId,
        title: parsed.data.title,
        goal: parsed.data.goal || null,
        startedBy: access.user.id,
        startedAt: now,
        endsAt: new Date(now.getTime() + parsed.data.minutes * 60_000),
      })
      .returning({ id: schema.workSession.id });
    await tx.insert(schema.sessionParticipant).values({ sessionId: session.id, userId: access.user.id });
    return session;
  });
  if (!created) return { ok: false, error: "A session is already running here. Join it instead." };

  // Let the whole workspace know, so people can drop in.
  const members = await db
    .select({ id: schema.workspaceMember.userId })
    .from(schema.workspaceMember)
    .where(eq(schema.workspaceMember.workspaceId, access.page.workspaceId));
  await notify(
    members.map((m) => m.id),
    {
      workspaceId: access.page.workspaceId,
      actorId: access.user.id,
      kind: "session_started",
      pageId,
      subject: access.page.title,
      snippet: parsed.data.title,
      url: `/w/${access.slug}/p/${pageId}`,
    },
  );
  revalidatePath(`/w/${access.slug}`, "layout");
  return { ok: true, id: created.id };
}

export async function joinSession(sessionId: string): Promise<SessionResult> {
  const access = await sessionAccess(sessionId);
  if (!access) return { ok: false, error: "That session no longer exists" };
  if (access.session.endedAt) return { ok: false, error: "That session has ended" };
  await db
    .insert(schema.sessionParticipant)
    .values({ sessionId, userId: access.user.id })
    .onConflictDoNothing();
  return { ok: true, id: sessionId };
}

export async function extendSession(sessionId: string, minutes = 5): Promise<SessionResult> {
  const access = await sessionAccess(sessionId);
  if (!access) return { ok: false, error: "That session no longer exists" };
  if (access.role === "guest") return { ok: false, error: "Guests can't change the timer" };
  if (access.session.endedAt) return { ok: false, error: "That session has ended" };
  const add = Math.max(1, Math.min(60, Math.round(minutes)));
  await db
    .update(schema.workSession)
    .set({ endsAt: sql`greatest(${schema.workSession.endsAt}, now()) + (${add} * interval '1 minute')` })
    .where(eq(schema.workSession.id, sessionId));
  return { ok: true, id: sessionId };
}

export async function endSession(sessionId: string): Promise<SessionResult> {
  const access = await sessionAccess(sessionId);
  if (!access) return { ok: false, error: "That session no longer exists" };
  if (access.role === "guest") return { ok: false, error: "Guests can't end sessions" };
  if (!access.session.endedAt) {
    await db
      .update(schema.workSession)
      .set({ endedAt: new Date(), endedBy: access.user.id })
      .where(and(eq(schema.workSession.id, sessionId), isNull(schema.workSession.endedAt)));
  }
  revalidatePath(`/w/${access.slug}`, "layout");
  return { ok: true, id: sessionId };
}
