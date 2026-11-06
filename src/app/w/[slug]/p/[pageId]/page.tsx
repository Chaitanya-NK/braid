import Link from "next/link";
import { Archive } from "lucide-react";
import { Suspense } from "react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { archivePage } from "@/lib/actions";
import { requirePage } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";
import { TitleEditor } from "./title-editor";

const comingIn = { doc: "Phase 1", board: "Phase 2", canvas: "Phase 9" } as const;

export default function PageView({ params }: PageProps<"/w/[slug]/p/[pageId]">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse" aria-busy="true" />}>
      <PageContent params={params} />
    </Suspense>
  );
}

async function PageContent({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  const { workspace, page, role } = await requirePage(slug, pageId);
  const canEdit = role !== "guest" && !page.archivedAt;

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted">
          <Link href={`/w/${workspace.slug}`} className="hover:text-ink">
            {workspace.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <PageIcon kind={page.kind} />
            {page.title}
          </span>
        </nav>
        {canEdit && (
          <form action={archivePage}>
            <input type="hidden" name="pageId" value={page.id} />
            <button
              type="submit"
              className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-zinc-100 hover:text-ink"
            >
              <Archive className="size-4" aria-hidden="true" /> Move to Trash
            </button>
          </form>
        )}
      </header>

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-14">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-ink-2">
          <PageIcon kind={page.kind} className="size-3.5" /> {KIND_LABEL[page.kind]}
        </span>
        {canEdit ? (
          <TitleEditor pageId={page.id} initialTitle={page.title} />
        ) : (
          <h1 className="text-4xl font-bold tracking-tight">{page.title}</h1>
        )}
        <p className="text-sm text-muted">Last updated {timeAgo(page.updatedAt)}</p>

        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-surface p-10 text-center">
          <p className="font-medium">The live {KIND_LABEL[page.kind].toLowerCase()} editor arrives in {comingIn[page.kind]}.</p>
          <p className="mt-1 text-sm text-muted">For now you can rename this page, or move it to Trash.</p>
        </div>
      </article>
    </div>
  );
}
