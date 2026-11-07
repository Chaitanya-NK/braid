"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/dal";
import { notify } from "@/lib/notify";

/**
 * Branch Server Actions. Like every action, each one re-checks that the
 * caller is a member (not a guest) of the page's workspace.
 *
 * Merging itself happens in the browser, through the sync server, so it
 * lands live for everyone; `markBranchMerged` just records that it did.
 */

export type BranchResult = { ok: true; url: string } | { ok: false; error: string };

const nameInput = z.string().trim().min(1, "Give the branch a name").max(80, "Keep it under 80 characters");

async function pageAccess(pageId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ page: schema.page, slug: schema.workspace.slug, role: schema.workspaceMember.role })
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
  if (!row) return { ok: false, error: "That page no longer exists" } as const;
  if (row.role === "guest") return { ok: false, error: "Guests can't make or change branches" } as const;
  if (row.page.archivedAt) return { ok: false, error: "Restore the page from Trash first" } as const;
  return { ok: true, ...row, user } as const;
}

async function branchAccess(branchId: string) {
  const [branch] = await db.select().from(schema.pageBranch).where(eq(schema.pageBranch.id, branchId)).limit(1);
  if (!branch) return { ok: false, error: "That branch no longer exists" } as const;
  const access = await pageAccess(branch.pageId);
  if (!access.ok) return access;
  return { ...access, branch, url: `/w/${access.slug}/p/${branch.pageId}/b/${branch.id}` };
}

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

export async function createBranch(pageId: string, name: string): Promise<BranchResult> {
  const parsed = nameInput.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await pageAccess(pageId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.page.kind === "canvas") return { ok: false, error: "Canvases can't be branched yet" };
  const [branch] = await db
    .insert(schema.pageBranch)
    .values({ pageId, name: parsed.data, createdBy: access.user.id })
    .returning({ id: schema.pageBranch.id });
  refresh(access.slug);
  return { ok: true, url: `/w/${access.slug}/p/${pageId}/b/${branch.id}` };
}

export async function renameBranch(branchId: string, name: string): Promise<BranchResult> {
  const parsed = nameInput.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const access = await branchAccess(branchId);
  if (!access.ok) return { ok: false, error: access.error };
  await db.update(schema.pageBranch).set({ name: parsed.data }).where(eq(schema.pageBranch.id, branchId));
  refresh(access.slug);
  return { ok: true, url: access.url };
}

async function setStatus(branchId: string, status: "open" | "merged" | "closed"): Promise<BranchResult> {
  const access = await branchAccess(branchId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.branch.status === "merged") return { ok: false, error: "This branch was already merged" };
  if (status !== "open" && access.branch.status !== "open") return { ok: false, error: "This branch is already closed" };
  const closing = status !== "open";
  await db
    .update(schema.pageBranch)
    .set({ status, closedAt: closing ? new Date() : null, closedBy: closing ? access.user.id : null })
    .where(eq(schema.pageBranch.id, branchId));
  refresh(access.slug);
  return { ok: true, url: access.url };
}

/** Records a merge the browser has just made through the sync server, and tells whoever started the branch. */
export async function markBranchMerged(branchId: string) {
  const result = await setStatus(branchId, "merged");
  if (result.ok) {
    const access = await branchAccess(branchId);
    if (access.ok) {
      await notify([access.branch.createdBy], {
        workspaceId: access.page.workspaceId,
        actorId: access.user.id,
        kind: "branch_merged",
        pageId: access.page.id,
        subject: access.page.title,
        snippet: access.branch.name,
        url: `/w/${access.slug}/p/${access.page.id}`,
      });
    }
  }
  return result;
}

/** Closes a branch without merging it. It stays readable, and can be reopened. */
export async function closeBranch(branchId: string) {
  return setStatus(branchId, "closed");
}

export async function reopenBranch(branchId: string) {
  return setStatus(branchId, "open");
}

/**
 * After "Update from page" pulls the page's latest changes into a branch,
 * the browser sends the page as it was then, so review only shows what the
 * branch itself changed.
 */
export async function setBranchBase(branchId: string, base64: string): Promise<BranchResult> {
  const access = await branchAccess(branchId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.branch.status !== "open") return { ok: false, error: "This branch is closed" };
  const base = Buffer.from(base64, "base64");
  if (base.length === 0 || base.length > 5_000_000) return { ok: false, error: "That page is too big to compare" };
  await db.update(schema.pageBranch).set({ base }).where(eq(schema.pageBranch.id, branchId));
  return { ok: true, url: access.url };
}
