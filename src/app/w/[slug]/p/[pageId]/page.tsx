import Link from "next/link";
import { Suspense } from "react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePage } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";
import { MoveToTrashButton } from "../../page-actions";
import { TitleEditor } from "./title-editor";

const comingIn = { doc: "Phase 1", board: "Phase 2", canvas: "Phase 9" } as const;

export default function PageView({ params }: PageProps<"/w/[slug]/p/[pageId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
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
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-2">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/w/${workspace.slug}`} className="hover:text-foreground">
            {workspace.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <PageIcon kind={page.kind} />
            {page.title}
          </span>
        </nav>
        {canEdit && <MoveToTrashButton pageId={page.id} title={page.title} />}
      </header>

      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-14">
        <Badge variant="secondary">
          <PageIcon kind={page.kind} /> {KIND_LABEL[page.kind]}
        </Badge>
        {canEdit ? (
          <TitleEditor pageId={page.id} initialTitle={page.title} />
        ) : (
          <h1 className="text-4xl font-bold tracking-tight">{page.title}</h1>
        )}
        <p className="text-sm text-muted-foreground">Last updated {timeAgo(page.updatedAt)}</p>

        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
          <p className="font-medium">
            The live {KIND_LABEL[page.kind].toLowerCase()} editor arrives in {comingIn[page.kind]}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            For now you can rename this page, or move it to Trash.
          </p>
        </div>
      </article>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      <Skeleton className="h-14 rounded-none" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-14">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </div>
  );
}
