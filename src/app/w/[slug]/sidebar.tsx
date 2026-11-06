import Link from "next/link";
import { ChevronsUpDown, House, Plus, Settings, Trash2 } from "lucide-react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { Avatar } from "@/components/ui";
import { createPage } from "@/lib/actions";
import { listMyWorkspaces, listPages, requireWorkspace } from "@/lib/dal";
import { initials } from "@/lib/utils";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

const asideClass =
  "flex flex-[1_1_248px] flex-col gap-1 border-r border-line bg-surface px-3 py-4 text-sm md:sticky md:top-0 md:h-screen md:max-w-[280px] md:overflow-y-auto";

export async function Sidebar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, color } = await requireWorkspace(slug);
  const [pages, workspaces] = await Promise.all([listPages(workspace.id), listMyWorkspaces(user.id)]);
  const base = `/w/${workspace.slug}`;

  return (
    <aside aria-label="Workspace" className={asideClass}>
      <details className="group relative mb-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 font-semibold hover:bg-zinc-100 [&::-webkit-details-marker]:hidden">
          <span className="grid size-7 place-items-center rounded-md bg-brand text-xs text-white">
            {initials(workspace.name)}
          </span>
          <span className="flex-1 truncate">{workspace.name}</span>
          <ChevronsUpDown className="size-4 text-muted" aria-hidden="true" />
        </summary>
        <div className="absolute inset-x-0 top-full z-10 mt-1 flex flex-col gap-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/w/${ws.slug}`}
              className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 hover:bg-zinc-100"
            >
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === workspace.id && <span className="text-xs text-brand">Current</span>}
            </Link>
          ))}
          <Link
            href="/onboarding"
            className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-muted hover:bg-zinc-100"
          >
            <Plus className="size-4" aria-hidden="true" /> New workspace
          </Link>
        </div>
      </details>

      <nav aria-label="Workspace sections" className="flex flex-col gap-0.5">
        <NavLink href={base} exact>
          <House className="size-4" aria-hidden="true" /> Home
        </NavLink>
        <NavLink href={`${base}/trash`}>
          <Trash2 className="size-4" aria-hidden="true" /> Trash
        </NavLink>
        <NavLink href={`${base}/settings`}>
          <Settings className="size-4" aria-hidden="true" /> Settings
        </NavLink>
      </nav>

      <div className="mx-2.5 mb-1.5 mt-5 text-xs font-semibold uppercase tracking-wide text-faint">
        Pages
      </div>
      <nav aria-label="Pages" className="flex flex-col gap-0.5">
        {pages.length === 0 && <p className="px-2.5 py-2 text-muted">No pages yet.</p>}
        {pages.map((p) => (
          <NavLink key={p.id} href={`${base}/p/${p.id}`}>
            <PageIcon kind={p.kind} />
            <span className="truncate">{p.title}</span>
          </NavLink>
        ))}
      </nav>

      <form action={createPage} className="mt-2 flex gap-1 px-1">
        <input type="hidden" name="workspaceId" value={workspace.id} />
        {(["doc", "board", "canvas"] as const).map((kind) => (
          <button
            key={kind}
            type="submit"
            name="kind"
            value={kind}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 text-xs text-muted hover:border-brand hover:text-brand"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {KIND_LABEL[kind]}
          </button>
        ))}
      </form>

      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-1.5 pt-3">
        <Avatar name={user.name} color={color} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted">{user.email}</div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}

export function SidebarSkeleton() {
  return (
    <aside aria-label="Workspace" className={asideClass} aria-busy="true">
      <div className="h-11 animate-pulse rounded-lg bg-zinc-100" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mt-1 h-9 animate-pulse rounded-lg bg-zinc-100/70" />
      ))}
    </aside>
  );
}
