import { ArrowLeft, Radio } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSessions, requirePage } from "@/lib/dal";
import { minutesBetween } from "@/lib/utils";

export const metadata = { title: "Sessions" };

export default function SessionsPage({ params }: PageProps<"/w/[slug]/p/[pageId]/sessions">) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 md:px-10">
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" aria-busy="true" />}>
        <Sessions params={params} />
      </Suspense>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Sessions({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  const { workspace, page } = await requirePage(slug, pageId);
  const sessions = await listSessions(page.id);
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={pageUrl}>
          <ArrowLeft aria-hidden="true" /> Back to {page.title}
        </Link>
      </Button>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="mt-1 text-muted-foreground">Live sessions on “{page.title}”, each with a recap of what changed.</p>
      </div>
      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
          <Radio className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 font-medium">No sessions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start one from <strong>Session</strong> in the page&apos;s header: a timer everyone shares, and a recap at
            the end.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Started by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`${pageUrl}/sessions/${s.id}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    {!s.endedAt && <Badge className="ml-2 bg-red-100 text-red-800">Live</Badge>}
                    {s.goal && <span className="block text-xs text-muted-foreground">{s.goal}</span>}
                  </TableCell>
                  <TableCell>{dateFmt.format(s.startedAt)}</TableCell>
                  <TableCell>{s.endedAt ? `${minutesBetween(s.startedAt, s.endedAt)} min` : "—"}</TableCell>
                  <TableCell>{s.startedByName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
