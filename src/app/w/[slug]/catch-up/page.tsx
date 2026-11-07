import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageIcon } from "@/components/page-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { listMembers, requireWorkspace } from "@/lib/dal";
import { catchUpList } from "@/lib/catch-up";
import { namesList, timeAgo } from "@/lib/utils";
import { MarkAllSeenButton } from "./mark-all";

export const metadata = { title: "Catch up" };

export default function CatchUpPage({ params }: PageProps<"/w/[slug]/catch-up">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 md:px-10">
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" aria-busy="true" />}>
        <CatchUp params={params} />
      </Suspense>
    </div>
  );
}

async function CatchUp({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const [items, members] = await Promise.all([catchUpList(user.id, workspace.id), listMembers(workspace.id)]);
  const name = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? "Someone") : "automations");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catch up</h1>
          <p className="mt-1 text-muted-foreground">
            {items.length === 0
              ? "You're all caught up."
              : `${items.length} ${items.length === 1 ? "page has" : "pages have"} changed since you last looked.`}
          </p>
        </div>
        {items.length > 0 && <MarkAllSeenButton workspaceId={workspace.id} />}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
          <Sparkles className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 font-medium">Nothing new</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When teammates change pages while you&apos;re away, they show up here with what changed.
          </p>
        </div>
      ) : (
        <ul aria-label="Changed pages" className="flex flex-col divide-y rounded-xl border bg-card">
          {items.map((item) => (
            <li key={item.pageId}>
              <Link
                href={`/w/${workspace.slug}/p/${item.pageId}/catch-up?since=${item.since.getTime()}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/60"
              >
                <PageIcon kind={item.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {namesList(item.people.map(name))} · {item.edits} {item.edits === 1 ? "edit" : "edits"}
                    {item.visited ? "" : " · new to you"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{timeAgo(item.lastAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
