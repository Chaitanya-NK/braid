import { Suspense } from "react";
import { Avatar } from "@/components/ui";
import { listMembers, requireWorkspace } from "@/lib/dal";
import { RenameWorkspaceForm } from "./rename-form";

export const metadata = { title: "Settings" };

export default function SettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-8 md:px-10">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-200/40" aria-busy="true" />}>
        <Settings params={params} />
      </Suspense>
    </div>
  );
}

async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace, role } = await requireWorkspace(slug);
  const members = await listMembers(workspace.id);
  const canManage = role === "owner" || role === "admin";

  return (
    <>
      <section aria-labelledby="general-h" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
        <h2 id="general-h" className="text-lg font-semibold">General</h2>
        {canManage ? (
          <RenameWorkspaceForm workspaceId={workspace.id} name={workspace.name} />
        ) : (
          <p>{workspace.name}</p>
        )}
        <p className="text-sm text-muted">
          URL: <span className="font-mono">/w/{workspace.slug}</span>
        </p>
      </section>

      <section aria-labelledby="members-h" className="flex flex-col gap-4">
        <div>
          <h2 id="members-h" className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted">Inviting teammates arrives in Phase 6.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-faint">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Cursor colour</th>
                <th className="px-5 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-zinc-100">
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-3">
                      <Avatar name={m.name} color={m.color} size={30} />
                      <span>
                        <span className="block font-medium">{m.name}</span>
                        <span className="text-muted">{m.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-block size-4 rounded align-middle" style={{ background: m.color }} />
                  </td>
                  <td className="px-5 py-3.5 capitalize">{m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
