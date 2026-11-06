import { Suspense } from "react";
import { PageIcon } from "@/components/page-icon";
import { buttonClass } from "@/components/ui";
import { deletePageForever, restorePage } from "@/lib/actions";
import { listArchivedPages, requireWorkspace } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Trash" };

export default function TrashPage({ params }: PageProps<"/w/[slug]/trash">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8 md:px-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trash</h1>
        <p className="mt-1.5 text-muted">Restore pages, or delete them for good.</p>
      </div>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-zinc-200/40" aria-busy="true" />}>
        <TrashList params={params} />
      </Suspense>
    </div>
  );
}

async function TrashList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const pages = await listArchivedPages(workspace.id);

  if (pages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 bg-surface p-8 text-center text-muted">
        Trash is empty.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-surface">
      {pages.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-zinc-100 px-5 py-3.5 first:border-t-0">
          <PageIcon kind={p.kind} className="size-4 text-muted" />
          <span className="flex-1 font-medium">{p.title}</span>
          <span className="text-sm text-muted">Trashed {p.archivedAt ? timeAgo(p.archivedAt) : ""}</span>
          <form action={restorePage}>
            <input type="hidden" name="pageId" value={p.id} />
            <button type="submit" className={buttonClass("secondary", "min-h-9")}>
              Restore
            </button>
          </form>
          <form action={deletePageForever}>
            <input type="hidden" name="pageId" value={p.id} />
            <button type="submit" className={buttonClass("danger", "min-h-9")}>
              Delete forever
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
