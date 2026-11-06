import { Suspense } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMembers, requireWorkspace } from "@/lib/dal";
import { RenameWorkspaceForm } from "./rename-form";

export const metadata = { title: "Settings" };

export default function SettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-8 md:px-10">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" aria-busy="true" />}>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">General</CardTitle>
          <CardDescription>
            URL: <span className="font-mono">/w/{workspace.slug}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <RenameWorkspaceForm workspaceId={workspace.id} name={workspace.name} />
          ) : (
            <p>{workspace.name}</p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 pb-0">
        <CardHeader>
          <CardTitle className="text-lg">Members</CardTitle>
          <CardDescription>Inviting teammates arrives in Phase 6.</CardDescription>
        </CardHeader>
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Cursor colour</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <span className="flex items-center gap-3">
                    <MemberAvatar name={m.name} color={m.color} />
                    <span>
                      <span className="block font-medium">{m.name}</span>
                      <span className="text-muted-foreground">{m.email}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="inline-block size-4 rounded align-middle" style={{ background: m.color }} />
                </TableCell>
                <TableCell className="capitalize">{m.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
