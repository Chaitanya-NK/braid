"use client";

import { Check, Copy, LogOut, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MemberRole } from "@/db/schema";
import {
  changeRole,
  createInvite,
  leaveWorkspace,
  removeMember,
  revokeInvite,
} from "@/lib/member-actions";
import { ROLE_INFO } from "@/lib/permissions";

const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: (text: string, what = "Invite link") =>
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
          toast.success(`${what} copied`, { description: "Send it to them however you like." });
        },
        () => toast.error("Couldn't copy. Select the link and copy it yourself."),
      ),
  };
}

function RoleOptions({ roles }: { roles: MemberRole[] }) {
  return roles.map((r) => (
    <SelectItem key={r} value={r}>
      {ROLE_INFO[r].label}
    </SelectItem>
  ));
}

/* --------------------------------- Invites -------------------------------- */

export function InviteButton({ workspaceId, roles }: { workspaceId: string; roles: MemberRole[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<MemberRole>("member");
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { copied, copy } = useCopy();

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setLink(null);
      setNote("");
      setError(undefined);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createInvite(workspaceId, { role, note, days: Number(days) });
      if (!result.ok) return setError(result.error);
      setError(undefined);
      setLink(inviteUrl(result.token));
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="brand" size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden="true" /> Invite people
      </Button>
      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="sm:max-w-md">
          {link ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Invite link ready</DialogTitle>
                <DialogDescription>
                  Anyone with this link can join as {ROLE_INFO[role].label.toLowerCase()} for the next {days}{" "}
                  {days === "1" ? "day" : "days"}. Braid doesn&apos;t send email, so share it yourself.
                </DialogDescription>
              </DialogHeader>
              <InputGroup>
                <InputGroupInput aria-label="Invite link" value={link} readOnly onFocus={(e) => e.target.select()} />
                <InputGroupAddon align="inline-end">
                  <Button size="sm" variant="ghost" onClick={() => copy(link)} aria-label="Copy invite link">
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLink(null)}>
                  Make another
                </Button>
                <Button variant="brand" onClick={() => reset(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Invite people</DialogTitle>
                <DialogDescription>Make a link that lets people join this workspace.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-role">Join as</Label>
                <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <RoleOptions roles={roles} />
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_INFO[role].description}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-days">Link works for</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger id="invite-days" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-note">Note (optional)</Label>
                <Input
                  id="invite-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. For the design team"
                  maxLength={80}
                />
              </div>
              <FormError message={error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => reset(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand" disabled={pending}>
                  {pending ? "Creating…" : "Create link"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function InviteActions({ inviteId, token }: { inviteId: string; token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { copied, copy } = useCopy();
  return (
    <span className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => copy(inviteUrl(token))}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} Copy link
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-destructive hover:text-destructive"
        onClick={() =>
          startTransition(async () => {
            const result = await revokeInvite(inviteId);
            if (!result.ok) return void toast.error("Couldn't revoke", { description: result.error });
            toast.success("Invite revoked", { description: "The link no longer works." });
            router.refresh();
          })
        }
      >
        Revoke
      </Button>
    </span>
  );
}

/* --------------------------------- Members -------------------------------- */

export function RoleSelect({
  workspaceId,
  userId,
  name,
  role,
  roles,
}: {
  workspaceId: string;
  userId: string;
  name: string;
  role: MemberRole;
  roles: MemberRole[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Their current role is always listed, even if you couldn't hand it out.
  const options = roles.includes(role) ? roles : [role, ...roles];
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          const result = await changeRole(workspaceId, userId, next as MemberRole);
          if (!result.ok) return void toast.error("Couldn't change their role", { description: result.error });
          toast.success(`${name} is now ${ROLE_INFO[next as MemberRole].label.toLowerCase()}`);
          router.refresh();
        })
      }
    >
      <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <RoleOptions roles={options} />
      </SelectContent>
    </Select>
  );
}

export function MemberMenu({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Options for ${name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <UserMinus aria-hidden="true" /> Remove from workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to every page here. What they wrote stays. You can invite them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeMember(workspaceId, userId);
                  if (!result.ok) return void toast.error("Couldn't remove them", { description: result.error });
                  toast.success(`${name} was removed`);
                  router.refresh();
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function LeaveButton({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <LogOut aria-hidden="true" /> Leave workspace
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {workspaceName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll lose access to its pages. Someone will need to invite you again to come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await leaveWorkspace(workspaceId);
                  if (!result.ok) return void toast.error("Couldn't leave", { description: result.error });
                  toast.success(`You left ${workspaceName}`);
                  router.push("/app");
                })
              }
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
