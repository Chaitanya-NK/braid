import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import * as Y from "yjs";
import { RulesList } from "@/components/automations/rules-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Action, Trigger } from "@/lib/automation-model";
import { readBoard } from "@/lib/board-model";
import { listAutomationRuns, listAutomations, listMembers, loadPageDoc, requirePage } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Automations" };

export default function AutomationsPage({ params }: PageProps<"/w/[slug]/p/[pageId]/automations">) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8 md:px-10">
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" aria-busy="true" />}>
        <Automations params={params} />
      </Suspense>
    </div>
  );
}

async function Automations({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  const { workspace, page, role } = await requirePage(slug, pageId);
  if (page.kind !== "board") notFound();
  const [rules, runs, members, state] = await Promise.all([
    listAutomations(page.id),
    listAutomationRuns(page.id),
    listMembers(workspace.id),
    loadPageDoc(page.id),
  ]);
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, new Uint8Array(state));
  const columns = readBoard(doc).columns.map((c) => ({ id: c.id, title: c.title }));
  const ruleName = new Map(rules.map((r) => [r.id, r.name]));
  const pageUrl = `/w/${workspace.slug}/p/${page.id}`;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href={pageUrl}>
            <ArrowLeft aria-hidden="true" /> Back to {page.title}
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
          <p className="mt-1 text-muted-foreground">
            Rules for “{page.title}”. They run on Braid&apos;s server, once per change, whoever makes it — even edits
            made offline that sync later.
          </p>
        </div>
      </div>

      <RulesList
        pageId={page.id}
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          trigger: r.trigger as Trigger,
          actions: r.actions as Action[],
          runCount: r.runCount,
          lastRunAt: r.lastRunAt?.getTime() ?? null,
        }))}
        columns={columns}
        people={members.map((m) => ({ id: m.id, name: m.name }))}
        canEdit={role !== "guest" && !page.archivedAt}
      />

      <section aria-labelledby="runs-heading" className="flex flex-col gap-3">
        <h2 id="runs-heading" className="text-lg font-semibold">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Runs show up here as rules fire.</p>
        ) : (
          <ul aria-label="Recent runs" className="flex flex-col divide-y rounded-xl border bg-card text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5">
                <span className="font-medium">{ruleName.get(run.automationId) ?? "A deleted rule"}</span>{" "}
                <span className="text-muted-foreground">ran on</span> <span>“{run.cardTitle}”</span>{" "}
                <span className="text-muted-foreground">
                  after {run.actorName ?? "someone"}&apos;s change · {timeAgo(run.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
