import { Suspense } from "react";
import { MemberAvatar } from "@/components/member-avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listInvites, listMembers, requireWorkspace } from "@/lib/dal";
import { assignableRoles, canLeave, canManage, canManageMembers, ROLE_INFO } from "@/lib/permissions";
import { timeAgo } from "@/lib/utils";
import { InviteActions, InviteButton, LeaveButton, MemberMenu, RoleSelect } from "./members";
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
  const { user, workspace, role } = await requireWorkspace(slug);
  const manager = canManageMembers(role);
  const [members, invites] = await Promise.all([
    listMembers(workspace.id),
    manager ? listInvites(workspace.id) : Promise.resolve([]),
  ]);
  const owners = members.filter((m) => m.role === "owner").length;
  const roles = assignableRoles(role);

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
          {manager ? (
            <RenameWorkspaceForm workspaceId={workspace.id} name={workspace.name} />
          ) : (
            <p>{workspace.name}</p>
          )}
        </CardContent>
      </Card>

      <Card id="members" className="scroll-mt-6 gap-4 pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-lg">Members</CardTitle>
            <CardDescription>
              {members.length} {members.length === 1 ? "person" : "people"} · You&apos;re{" "}
              {role === "admin" || role === "owner" ? "an" : "a"} {ROLE_INFO[role].label.toLowerCase()}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {canLeave(role, owners) && <LeaveButton workspaceId={workspace.id} workspaceName={workspace.name} />}
            {manager && <InviteButton workspaceId={workspace.id} roles={roles} />}
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Options</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isMe = m.id === user.id;
                const editable = !isMe && canManage(role, m.role);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <MemberAvatar name={m.name} color={m.color} />
                        <span>
                          <span className="flex items-center gap-2 font-medium">
                            {m.name}
                            {isMe && <Badge variant="secondary">You</Badge>}
                          </span>
                          <span className="text-muted-foreground">{m.email}</span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(m.joinedAt)}</TableCell>
                    <TableCell>
                      {editable ? (
                        <RoleSelect
                          workspaceId={workspace.id}
                          userId={m.id}
                          name={m.name}
                          role={m.role}
                          roles={roles}
                        />
                      ) : (
                        ROLE_INFO[m.role].label
                      )}
                    </TableCell>
                    <TableCell>
                      {editable && <MemberMenu workspaceId={workspace.id} userId={m.id} name={m.name} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {manager && (
        <Card className="gap-4 pb-0">
          <CardHeader>
            <CardTitle className="text-lg">Invite links</CardTitle>
            <CardDescription>Links that still work. Revoke one to stop it working straight away.</CardDescription>
          </CardHeader>
          {invites.length === 0 ? (
            <CardContent className="pb-6 text-sm text-muted-foreground">
              No active links. Use “Invite people” to make one.
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Joins as</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{ROLE_INFO[i.role].label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.note ?? "—"}
                        <span className="block text-xs">by {i.createdBy}</span>
                      </TableCell>
                      <TableCell>
                        {i.uses} {i.uses === 1 ? "time" : "times"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{timeAgo(i.expiresAt)}</TableCell>
                      <TableCell>
                        <InviteActions inviteId={i.id} token={i.token} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
