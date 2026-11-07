import { ArrowLeft, History, Radio } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BoardChangesView, DocDiffView } from "@/components/branch/diff-views";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (!session || page.kind === "canvas") notFound();
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;
  const { endedAt, recap } = await settleSession(session, page.id, page.kind);

  const members = await listMembers(workspace.id);
  const person = (id: string | null) =>
    id === null
      ? { name: "Braid automations", color: "#52525b" }
      : (members.find((m) => m.id === id) ?? { name: "Someone who left", color: "#a1a1aa" });

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

  const totalEdits = recap.people.reduce((n, p) => n + p.edits, 0) || 1;
  // Everyone who joined, plus anyone who edited without pressing Join.
  const ids = [...new Set<string | null>([...session.joined, ...recap.people.map((p) => p.userId)])];
  const people = ids
    .map((id) => ({ id, ...person(id), edits: recap.people.find((p) => p.userId === id)?.edits ?? 0 }))
    .sort((a, b) => b.edits - a.edits);
  const changeCount = recap.doc ? recap.doc.added + recap.doc.removed + recap.doc.changed : (recap.board?.length ?? 0);

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="People" value={people.length} />
        <Stat label="Steps in Rewind" value={recap.stepCount} />
        <Stat label={page.kind === "doc" ? "Lines changed" : "Board changes"} value={changeCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Who did what</CardTitle>
          <CardDescription>Share of the edits made during the session.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul aria-label="People in this session" className="flex flex-col gap-3">
            {people.map((p) => (
              <li key={p.id ?? "braid"} className="flex items-center gap-3">
                <MemberAvatar name={p.name} color={p.color} />
                <span className="w-40 truncate text-sm font-medium">{p.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.round((p.edits / totalEdits) * 100)}%`, background: p.color }}
                  />
                </span>
                <span className="w-24 text-right text-sm text-muted-foreground tabular-nums">
                  {p.edits === 0 ? "watched" : `${p.edits} ${p.edits === 1 ? "edit" : "edits"}`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section aria-labelledby="changed-heading" className="flex flex-col gap-3">
        <h2 id="changed-heading" className="text-lg font-semibold">
          What changed
        </h2>
        {changeCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the page changed during this session.</p>
        ) : recap.doc ? (
          <DocDiffView rows={recap.doc.rows} label="What changed" />
        ) : (
          <BoardChangesView changes={recap.board ?? []} label="What changed" />
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
