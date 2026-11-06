"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

export function UserMenu({
  name,
  email,
  color,
  settingsHref,
}: {
  name: string;
  email: string;
  color: string;
  settingsHref: string;
}) {
  async function signOut() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error("Couldn't sign out", { description: error.message });
      return;
    }
    // Full page load on purpose, so no workspace pages stay cached in the
    // browser after signing out. The toast is shown on the landing page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/?signed-out=1");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex min-h-12 w-full items-center gap-2.5 rounded-lg px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent"
      >
        <MemberAvatar name={name} color={color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          Signed in as {email}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={settingsHref}>
            <Settings /> Workspace settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
