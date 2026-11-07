import { Suspense } from "react";
import { BranchReview } from "@/components/branch/branch-review";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, requireBranch } from "@/lib/dal";
import { redirect } from "next/navigation";

export default function ReviewPage({ params }: PageProps<"/w/[slug]/p/[pageId]/b/[branchId]/review">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="mx-auto w-full max-w-4xl px-6 py-8">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      }
    >
      <ReviewContent params={params} />
    </Suspense>
  );
}

async function ReviewContent({ params }: { params: Promise<{ slug: string; pageId: string; branchId: string }> }) {
  const { slug, pageId, branchId } = await params;
  const { user, color, workspace, page, role, branch, base } = await requireBranch(slug, pageId, branchId, true);
  const branchUrl = `/w/${workspace.slug}/p/${page.id}/b/${branch.id}`;
  // Merged and closed branches have nothing to review: show the branch itself.
  if (branch.status !== "open" || page.kind === "canvas") redirect(branchUrl);
  const members = await listMembers(workspace.id);

  return (
    <BranchReview
      pageId={page.id}
      branchId={branch.id}
      branchName={branch.name}
      pageTitle={page.title}
      kind={page.kind}
      base={base}
      me={{ id: user.id, name: user.name, color }}
      members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
      canMerge={role !== "guest" && !page.archivedAt}
      pageUrl={`/w/${workspace.slug}/p/${page.id}`}
      branchUrl={branchUrl}
    />
  );
}
