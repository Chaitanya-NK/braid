import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { PageIcon } from "@/components/page-icon";
import { RewindPlayer } from "@/components/rewind/rewind-player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, requirePage } from "@/lib/dal";

export const metadata = { title: "Rewind" };

export default function RewindPage({ params, searchParams }: PageProps<"/w/[slug]/p/[pageId]/rewind">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-96 rounded-xl" aria-busy="true" />}>
      <Rewind params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Rewind({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, pageId }, query] = await Promise.all([params, searchParams]);
  const { user, color, workspace, page, role } = await requirePage(slug, pageId);
  const members = await listMembers(workspace.id);
  const backHref = `/w/${workspace.slug}/p/${page.id}`;
  const at = Number(Array.isArray(query.at) ? query.at[0] : query.at);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" /> Back to {page.kind}
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <PageIcon kind={page.kind} /> Rewind · {page.title}
          </h1>
        </div>
      </header>
      <RewindPlayer
        pageId={page.id}
        kind={page.kind}
        me={{ id: user.id, name: user.name, color }}
        members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
        canRestore={role !== "guest" && !page.archivedAt}
        backHref={backHref}
        initialStepId={Number.isFinite(at) && at > 0 ? at : null}
      />
    </div>
  );
}
