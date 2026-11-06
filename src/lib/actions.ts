"use server";

import { and, eq, isNotNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, requireWorkspaceById } from "@/lib/dal";
import { pickColor, slugify } from "@/lib/utils";

/**
 * Server Actions. Each one re-checks who is calling and whether they
 * belong to the workspace — never trust ids coming from the browser.
 */

export type FormState = { error?: string; savedAt?: number } | undefined;

/* ----------------------------- Workspaces ----------------------------- */

const workspaceInput = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/, "Use 3–40 lowercase letters, numbers or dashes"),
});

export async function createWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = workspaceInput.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || slugify(String(formData.get("name") ?? "")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, slug } = parsed.data;

  const [taken] = await db
    .select({ id: schema.workspace.id })
    .from(schema.workspace)
    .where(eq(schema.workspace.slug, slug))
    .limit(1);
  if (taken) return { error: `“${slug}” is taken. Try another URL.` };

  await db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(schema.workspace)
      .values({ name, slug, createdBy: user.id })
      .returning();
    await tx.insert(schema.workspaceMember).values({
      workspaceId: ws.id,
      userId: user.id,
      role: "owner",
      color: pickColor(0),
    });
    // Starter content, like the mockups promised.
    await tx.insert(schema.page).values([
      { workspaceId: ws.id, title: "Welcome to Braid", kind: "doc", position: 0, createdBy: user.id },
      { workspaceId: ws.id, title: "First board", kind: "board", position: 1, createdBy: user.id },
    ]);
  });

  redirect(`/w/${slug}`);
}

export async function renameWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const { role } = await requireWorkspaceById(workspaceId);
  if (role !== "owner" && role !== "admin") return { error: "Only owners and admins can rename" };

  const name = z.string().trim().min(2).max(60).safeParse(formData.get("name"));
  if (!name.success) return { error: "Name needs 2–60 characters" };

  const [ws] = await db
    .update(schema.workspace)
    .set({ name: name.data })
    .where(eq(schema.workspace.id, workspaceId))
    .returning({ slug: schema.workspace.slug });
  revalidatePath(`/w/${ws.slug}`, "layout");
  return { savedAt: Date.now() };
}

/* -------------------------------- Pages -------------------------------- */

const kinds = z.enum(["doc", "board", "canvas"]);

export async function createPage(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const kind = kinds.parse(formData.get("kind") ?? "doc");
  const { user, workspace } = await requireWorkspaceById(workspaceId);

  const [{ last }] = await db
    .select({ last: max(schema.page.position) })
    .from(schema.page)
    .where(eq(schema.page.workspaceId, workspaceId));

  const [created] = await db
    .insert(schema.page)
    .values({
      workspaceId,
      kind,
      title: kind === "board" ? "Untitled board" : kind === "canvas" ? "Untitled canvas" : "Untitled",
      position: (last ?? -1) + 1,
      createdBy: user.id,
    })
    .returning({ id: schema.page.id });

  revalidatePath(`/w/${workspace.slug}`, "layout");
  redirect(`/w/${workspace.slug}/p/${created.id}`);
}

/** Result returned to the browser, so the UI can show a toast. */
export type ActionResult = { ok: true; slug: string } | { ok: false; error: string };

/** Finds a page and checks the caller is a member of its workspace. */
async function requirePageAccess(pageId: string) {
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
  if (!row) return { error: "That page no longer exists" } as const;
  if (row.role === "guest") return { error: "Guests can't change pages" } as const;
  return row;
}

export async function renamePage(pageId: string, title: string): Promise<ActionResult> {
  const access = await requirePageAccess(pageId);
  if ("error" in access) return { ok: false, error: access.error };
  const clean = title.trim().slice(0, 120) || "Untitled";
  await db
    .update(schema.page)
    .set({ title: clean, updatedAt: new Date() })
    .where(eq(schema.page.id, pageId));
  revalidatePath(`/w/${access.slug}`, "layout");
  return { ok: true, slug: access.slug };
}

export async function archivePage(pageId: string): Promise<ActionResult> {
  const access = await requirePageAccess(pageId);
  if ("error" in access) return { ok: false, error: access.error };
  await db.update(schema.page).set({ archivedAt: new Date() }).where(eq(schema.page.id, pageId));
  revalidatePath(`/w/${access.slug}`, "layout");
  return { ok: true, slug: access.slug };
}

export async function restorePage(pageId: string): Promise<ActionResult> {
  const access = await requirePageAccess(pageId);
  if ("error" in access) return { ok: false, error: access.error };
  await db.update(schema.page).set({ archivedAt: null }).where(eq(schema.page.id, pageId));
  revalidatePath(`/w/${access.slug}`, "layout");
  return { ok: true, slug: access.slug };
}

export async function deletePageForever(pageId: string): Promise<ActionResult> {
  const access = await requirePageAccess(pageId);
  if ("error" in access) return { ok: false, error: access.error };
  if (!access.page.archivedAt) return { ok: false, error: "Move the page to Trash first" };
  await db
    .delete(schema.page)
    .where(and(eq(schema.page.id, pageId), isNotNull(schema.page.archivedAt)));
  revalidatePath(`/w/${access.slug}`, "layout");
  return { ok: true, slug: access.slug };
}
