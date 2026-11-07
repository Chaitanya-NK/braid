import { GitBranch, GitMerge, GitPullRequestArrow, GitPullRequestClosed } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BoardView } from "@/components/board/board-view";
import { BranchMenuActions, BranchStatusWatcher, ReopenBranchButton } from "@/components/branch/branch-controls";
import { BranchStatusBadge } from "@/components/branch/status-badge";
import { DocEditor } from "@/components/editor/doc-editor";
import { PageIcon } from "@/components/page-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, requireBranch } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";

export default function BranchPage({ params }: PageProps<"/w/[slug]/p/[pageId]/b/[branchId]">) {
  return (
    <Suspense fallback={<BranchSkeleton />}>
      <BranchContent params={params} />
    </Suspense>
  );
}

async function BranchContent({ params }: { params: Promise<{ slug: string; pageId: string; branchId: string }> }) {
  const { slug, pageId, branchId } = await params;
  const { user, color, workspace, page, role, branch } = await requireBranch(slug, pageId, branchId);
  const members = await listMembers(workspace.id);
  const isMember = role !== "guest" && !page.archivedAt;
  const canEdit = isMember && branch.status === "open";
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;
  const closedBy = members.find((m) => m.id === branch.closedBy)?.name ?? "someone";
  const me = { id: user.id, name: user.name, color };

  const header = (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-2">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/w/${workspace.slug}`} className="hover:text-foreground">
          {workspace.name}
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={pageUrl} className="flex items-center gap-1.5 hover:text-foreground">
          <PageIcon kind={page.kind} />
          {page.title}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <GitBranch className="size-4" aria-hidden="true" />
          {branch.name}
        </span>
        <BranchStatusBadge status={branch.status} />
      </nav>
      <div className="flex items-center gap-1">
        {branch.status === "open" && (
          <>
            <Button asChild variant="brand" size="sm">
              <Link href={`${pageUrl}/b/${branch.id}/review`}>
                <GitPullRequestArrow aria-hidden="true" /> Review &amp; merge
              </Link>
            </Button>
            {isMember && <BranchMenuActions branchId={branch.id} name={branch.name} />}
          </>
        )}
        {branch.status === "closed" && isMember && <ReopenBranchButton branchId={branch.id} />}
        {branch.status !== "open" && (
          <Button asChild variant="ghost" size="sm">
            <Link href={pageUrl}>Open the page</Link>
          </Button>
        )}
      </div>
    </header>
  );

  const banner =
    branch.status === "open" ? (
      <Alert className="border-emerald-200 bg-emerald-50/60">
        <GitBranch aria-hidden="true" />
        <AlertTitle>You&apos;re on a branch of “{page.title}”</AlertTitle>
        <AlertDescription>
          Started by {branch.authorName} {timeAgo(branch.createdAt)}. Edits here stay on this branch until it&apos;s
          merged, so the page doesn&apos;t change.
        </AlertDescription>
      </Alert>
    ) : branch.status === "merged" ? (
      <Alert className="border-violet-200 bg-violet-50/60">
        <GitMerge aria-hidden="true" />
        <AlertTitle>Merged into “{page.title}”</AlertTitle>
        <AlertDescription>
          {closedBy} merged this branch {branch.closedAt ? timeAgo(branch.closedAt) : ""}. It&apos;s view-only now.
        </AlertDescription>
      </Alert>
    ) : (
      <Alert>
        <GitPullRequestClosed aria-hidden="true" />
        <AlertTitle>Closed without merging</AlertTitle>
        <AlertDescription>
          {closedBy} closed this branch {branch.closedAt ? timeAgo(branch.closedAt) : ""}. The page wasn&apos;t
          changed. Reopen it to keep working.
        </AlertDescription>
      </Alert>
    );

  const watcher = branch.status === "open" ? <BranchStatusWatcher branchId={branch.id} /> : null;

  if (page.kind === "board") {
    return (
      <div className="flex h-dvh flex-col">
        {header}
        {watcher}
        <div className="flex flex-col gap-3 bg-card px-6 pt-4 pb-1">
          {banner}
          <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
        </div>
        <BoardView
          pageId={page.id}
          branchId={branch.id}
          me={me}
          members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
          readOnly={!canEdit}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {header}
      {watcher}
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        {banner}
        <h1 className="mt-4 text-4xl font-bold tracking-tight">{page.title}</h1>
        <div className="mt-4">
          <DocEditor
            pageId={page.id}
            branchId={branch.id}
            me={me}
            readOnly={!canEdit}
            members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
          />
        </div>
      </article>
    </div>
  );
}

function BranchSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col">
      <Skeleton className="h-14 rounded-none" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    </div>
  );
}
