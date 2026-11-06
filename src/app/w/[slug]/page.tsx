import Link from "next/link";
import { Suspense } from "react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { createPage } from "@/lib/actions";
import { listRecentPages, requireWorkspace } from "@/lib/dal";
import { timeAgo } from "@/lib/utils";
import { buttonClass } from "@/components/ui";

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
  const recent = await listRecentPages(workspace.id);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hi, {firstName}</h1>
          <p className="mt-1.5 text-muted">{workspace.name}</p>
        </div>
        <form action={createPage} className="flex flex-wrap gap-2">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <button type="submit" name="kind" value="doc" className={buttonClass("secondary")}>
            New doc
          </button>
          <button type="submit" name="kind" value="canvas" className={buttonClass("secondary")}>
            New canvas
          </button>
          <button type="submit" name="kind" value="board" className={buttonClass("primary")}>
            New board
          </button>
        </form>
      </header>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-sm font-semibold text-muted">
          Recently edited
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-surface p-8 text-center text-muted">
            Nothing here yet. Create a doc or board to get started.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Created by</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/w/${workspace.slug}/p/${p.id}`}
                        className="flex items-center gap-2.5 font-medium hover:text-brand"
                      >
                        <PageIcon kind={p.kind} className="size-4 text-muted" />
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-muted">{KIND_LABEL[p.kind]}</td>
                    <td className="px-5 py-3.5">{p.createdByName}</td>
                    <td className="px-5 py-3.5 text-muted">{timeAgo(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <div className="h-16 w-64 animate-pulse rounded-lg bg-zinc-200/60" />
      <div className="h-64 animate-pulse rounded-xl bg-zinc-200/40" />
    </div>
  );
}
