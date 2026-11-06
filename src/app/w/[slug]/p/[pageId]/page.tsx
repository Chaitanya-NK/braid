import Link from "next/link";
import { Suspense } from "react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, requirePage } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";
import { BoardView } from "@/components/board/board-view";
import { DocEditor } from "@/components/editor/doc-editor";
import { MoveToTrashButton } from "../../page-actions";
import { TitleEditor } from "./title-editor";

export default function PageView({ params }: PageProps<"/w/[slug]/p/[pageId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PageContent params={params} />
    </Suspense>
  );
}

async function PageContent({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  const { user, color, workspace, page, role } = await requirePage(slug, pageId);
  const canEdit = role !== "guest" && !page.archivedAt;

  const header = (
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
  );

  const title = canEdit ? (
    <TitleEditor pageId={page.id} initialTitle={page.title} size={page.kind === "board" ? "md" : "lg"} />
  ) : (
    <h1 className={page.kind === "board" ? "text-2xl font-bold tracking-tight" : "text-4xl font-bold tracking-tight"}>
      {page.title}
    </h1>
  );

  // Boards use the full width and height, with their own scrolling.
  if (page.kind === "board") {
    const members = await listMembers(workspace.id);
    return (
      <div className="flex h-dvh flex-col">
        {header}
        <div className="flex items-center gap-3 bg-card px-6 pt-4 pb-1">{title}</div>
        <BoardView
          pageId={page.id}
          me={{ id: user.id, name: user.name, color }}
          members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
          readOnly={!canEdit}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {header}
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-14">
        <Badge variant="secondary">
          <PageIcon kind={page.kind} /> {KIND_LABEL[page.kind]}
        </Badge>
        {title}
        <p className="text-sm text-muted-foreground">Last updated {timeAgo(page.updatedAt)}</p>

        {page.kind === "doc" ? (
          <div className="mt-4">
            <DocEditor pageId={page.id} me={{ id: user.id, name: user.name, color }} readOnly={!canEdit} />
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
            <p className="font-medium">The live canvas arrives in Phase 9.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              For now you can rename this page, or move it to Trash.
            </p>
          </div>
        )}
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
