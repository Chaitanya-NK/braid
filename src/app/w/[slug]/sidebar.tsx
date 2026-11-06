import { House, Plus, Settings, Trash2 } from "lucide-react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { createPage } from "@/lib/actions";
import { listMyWorkspaces, listPages, requireWorkspace } from "@/lib/dal";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

const asideClass =
  "flex flex-[1_1_248px] flex-col gap-1 border-r bg-card px-3 py-4 text-sm md:sticky md:top-0 md:h-screen md:max-w-[280px] md:overflow-y-auto";

export async function Sidebar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, color } = await requireWorkspace(slug);
  const [pages, workspaces] = await Promise.all([listPages(workspace.id), listMyWorkspaces(user.id)]);
  const base = `/w/${workspace.slug}`;

  return (
    <aside aria-label="Workspace" className={asideClass}>
      <WorkspaceSwitcher current={workspace} workspaces={workspaces} />

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

      <div className="mx-2.5 mt-5 mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        Pages
      </div>
      <nav aria-label="Pages" className="flex flex-col gap-0.5">
        {pages.length === 0 && <p className="px-2.5 py-2 text-muted-foreground">No pages yet.</p>}
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
            aria-label={`New ${KIND_LABEL[kind].toLowerCase()}`}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-zinc-300 text-xs text-muted-foreground hover:border-brand hover:text-brand"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {KIND_LABEL[kind]}
          </button>
        ))}
      </form>

      <div className="mt-auto border-t pt-3">
        <UserMenu name={user.name} email={user.email} color={color} settingsHref={`${base}/settings`} />
      </div>
    </aside>
  );
}

export function SidebarSkeleton() {
  return (
    <aside aria-label="Workspace" className={asideClass} aria-busy="true">
      <Skeleton className="h-11" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="mt-1 h-9 bg-zinc-100" />
      ))}
    </aside>
  );
}
