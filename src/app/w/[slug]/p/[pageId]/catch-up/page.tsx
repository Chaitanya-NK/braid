import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeReport } from "@/components/change-report";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, requirePage } from "@/lib/dal";
import { buildChangesSince } from "@/lib/session-recap";

export const metadata = { title: "Catch up" };

const dateFmt = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function PageCatchUp(props: PageProps<"/w/[slug]/p/[pageId]/catch-up">) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 md:px-10">
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" aria-busy="true" />}>
        <CatchUp {...props} />
      </Suspense>
    </div>
  );
}

async function CatchUp({ params, searchParams }: PageProps<"/w/[slug]/p/[pageId]/catch-up">) {
  const [{ slug, pageId }, query] = await Promise.all([params, searchParams]);
  const { user, workspace, page } = await requirePage(slug, pageId);
  const raw = Number(Array.isArray(query.since) ? query.since[0] : query.since);
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;
  const [{ recap, since }, members] = await Promise.all([
    buildChangesSince(page.id, page.kind, Number.isFinite(raw) ? new Date(raw) : null),
    listMembers(workspace.id),
  ]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={pageUrl}>
          <ArrowLeft aria-hidden="true" /> Back to {page.title}
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Catch up</p>
          <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">What changed since {dateFmt.format(since)}</p>
        </div>
        {recap.firstStepId !== null && (
          <Button asChild variant="outline">
            <Link href={`${pageUrl}/rewind?at=${recap.firstStepId}`}>
              <History aria-hidden="true" /> Replay from there
            </Link>
          </Button>
        )}
      </div>
      <ChangeReport
        recap={recap}
        kind={page.kind}
        members={members}
        exclude={user.id}
        peopleDescription="Edits other people made while you were away. Your own aren't counted here, but they're part of “What changed”."
      />
    </>
  );
}
