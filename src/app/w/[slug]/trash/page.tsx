import { Suspense } from "react";
import { PageIcon } from "@/components/page-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { listArchivedPages, requireWorkspace } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";
import { TrashRowActions } from "./trash-row-actions";

export const metadata = { title: "Trash" };

export default function TrashPage({ params }: PageProps<"/w/[slug]/trash">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8 md:px-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trash</h1>
        <p className="mt-1.5 text-muted-foreground">Restore pages, or delete them for good.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-40 rounded-xl" aria-busy="true" />}>
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
      <p className="rounded-xl border border-dashed border-zinc-300 bg-card p-8 text-center text-muted-foreground">
        Trash is empty.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border bg-card">
      {pages.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 border-t px-5 py-3.5 first:border-t-0">
          <PageIcon kind={p.kind} className="size-4 text-muted-foreground" />
          <span className="flex-1 font-medium">{p.title}</span>
          <span className="text-sm text-muted-foreground">
            Trashed {p.archivedAt ? timeAgo(p.archivedAt) : ""}
          </span>
          <TrashRowActions pageId={p.id} title={p.title} />
        </li>
      ))}
    </ul>
  );
}
