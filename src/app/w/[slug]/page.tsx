import Link from "next/link";
import { Suspense } from "react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createPage } from "@/lib/actions";
import { listLiveSessions, listRecentPages, requireWorkspace } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";

export default function WorkspaceHome({ params }: PageProps<"/w/[slug]">) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8 md:px-10">
      <Suspense fallback={<HomeSkeleton />}>
        <Home params={params} />
      </Suspense>
    </div>
  );
}

async function Home({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const [recent, live] = await Promise.all([listRecentPages(workspace.id), listLiveSessions(workspace.id)]);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hi, {firstName}</h1>
          <p className="mt-1.5 text-muted-foreground">{workspace.name}</p>
        </div>
        <form action={createPage} className="flex flex-wrap gap-2">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <Button type="submit" name="kind" value="doc" variant="outline">
            New doc
          </Button>
          <Button type="submit" name="kind" value="canvas" variant="outline">
            New canvas
          </Button>
          <Button type="submit" name="kind" value="board">
            New board
          </Button>
        </form>
      </header>

      {live.length > 0 && (
        <section aria-labelledby="live-h">
          <h2 id="live-h" className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
            <span className="size-2 rounded-full bg-red-600" aria-hidden="true" /> Live now
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {live.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/w/${workspace.slug}/p/${s.pageId}`}
                  className="flex flex-col rounded-xl border border-red-200 bg-red-50/60 p-4 hover:border-red-300"
                >
                  <span className="font-medium">{s.title}</span>
                  <span className="text-sm text-muted-foreground">
                    on {s.pageTitle} · started by {s.startedByName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-sm font-semibold text-muted-foreground">
          Recently edited
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-card p-8 text-center text-muted-foreground">
            Nothing here yet. Create a doc or board to get started.
          </p>
        ) : (
          <div className="rounded-xl border bg-card">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/w/${workspace.slug}/p/${p.id}`}
                        className="flex items-center gap-2.5 font-medium hover:text-brand"
                      >
                        <PageIcon kind={p.kind} className="size-4 text-muted-foreground" />
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{KIND_LABEL[p.kind]}</TableCell>
                    <TableCell>{p.createdByName}</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(p.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <Skeleton className="h-16 w-64" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
