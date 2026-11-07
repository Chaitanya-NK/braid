import { ArrowLeft, History, Radio } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChangeReport } from "@/components/change-report";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionWithPeople, listMembers, requirePage } from "@/lib/dal";
import { settleSession } from "@/lib/session-recap";
import { minutesBetween } from "@/lib/utils";
import { RefreshSoon } from "./refresh-soon";

export const metadata = { title: "Session recap" };

export default function RecapPage({ params }: PageProps<"/w/[slug]/p/[pageId]/sessions/[sessionId]">) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 md:px-10">
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" aria-busy="true" />}>
        <RecapContent params={params} />
      </Suspense>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

async function RecapContent({ params }: { params: Promise<{ slug: string; pageId: string; sessionId: string }> }) {
  const { slug, pageId, sessionId } = await params;
  const { workspace, page } = await requirePage(slug, pageId);
  await connection();
  const session = await getSessionWithPeople(page.id, sessionId);
  if (!session) notFound();
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;
  const { endedAt, recap } = await settleSession(session, page.id, page.kind);

  const members = await listMembers(workspace.id);

  const back = (
    <Button asChild variant="ghost" size="sm" className="w-fit">
      <Link href={`${pageUrl}/sessions`}>
        <ArrowLeft aria-hidden="true" /> All sessions
      </Link>
    </Button>
  );

  const heading = (
    <div>
      <p className="text-sm text-muted-foreground">
        Session on <Link href={pageUrl} className="font-medium text-foreground hover:underline">{page.title}</Link>
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {dateFmt.format(session.startedAt)}
        {endedAt && ` · ${minutesBetween(session.startedAt, endedAt)} min`} · started by {session.startedByName}
      </p>
      {session.goal && <p className="mt-2">Goal: {session.goal}</p>}
    </div>
  );

  if (!endedAt) {
    return (
      <>
        {back}
        {heading}
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
          <p className="flex items-center gap-2 font-medium">
            <Radio className="size-4 text-red-600" aria-hidden="true" /> This session is still running
          </p>
          <p className="mt-1 text-sm text-muted-foreground">The recap appears here when it ends.</p>
          <Button asChild variant="brand" size="sm" className="mt-4">
            <Link href={pageUrl}>Join it</Link>
          </Button>
        </div>
      </>
    );
  }

  if (!recap) {
    return (
      <>
        {back}
        {heading}
        <RefreshSoon />
        <div aria-busy="true" className="rounded-2xl border bg-card p-6">
          <p className="font-medium">Putting the recap together…</p>
          <p className="mt-1 text-sm text-muted-foreground">Waiting a few seconds for the last edits to be saved.</p>
          <Skeleton className="mt-4 h-24 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        {heading}
        {recap.firstStepId !== null && (
          <Button asChild variant="outline">
            <Link href={`${pageUrl}/rewind?at=${recap.firstStepId}`}>
              <History aria-hidden="true" /> Replay this session
            </Link>
          </Button>
        )}
      </div>
      <ChangeReport
        recap={recap}
        kind={page.kind}
        members={members}
        alsoPresent={session.joined}
        peopleDescription="Share of the edits made during the session."
      />
    </>
  );
}
