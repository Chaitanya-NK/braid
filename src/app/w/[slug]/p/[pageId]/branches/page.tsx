import { ArrowLeft, GitBranch } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NewBranchButton } from "@/components/branch/branch-menu";
import { BranchStatusBadge } from "@/components/branch/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBranches, listMembers, requirePage } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";

export default function BranchesPage({ params }: PageProps<"/w/[slug]/p/[pageId]/branches">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="mx-auto w-full max-w-4xl px-6 py-10">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      }
    >
      <BranchesContent params={params} />
    </Suspense>
  );
}

async function BranchesContent({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  const { workspace, page, role } = await requirePage(slug, pageId);
  const [branches, members] = await Promise.all([listBranches(page.id), listMembers(workspace.id)]);
  const canCreate = role !== "guest" && !page.archivedAt;
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "someone";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={pageUrl}>
          <ArrowLeft aria-hidden="true" /> Back to {page.title}
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Copies of “{page.title}” that people edit on their own, then review and merge back.
          </p>
        </div>
        {canCreate && <NewBranchButton pageId={page.id} pageTitle={page.title} />}
      </div>

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
          <GitBranch className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 font-medium">No branches yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a branch for a big rewrite, or to suggest changes without touching the page.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started by</TableHead>
                <TableHead>Last change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`${pageUrl}/b/${b.id}`} className="font-medium hover:underline">
                      {b.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <BranchStatusBadge status={b.status} />
                  </TableCell>
                  <TableCell>{b.authorName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {b.status === "open"
                      ? `Edited ${timeAgo(b.updatedAt)}`
                      : `${b.status === "merged" ? "Merged" : "Closed"} by ${nameOf(b.closedBy)} ${b.closedAt ? timeAgo(b.closedAt) : ""}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
