"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";

type WorkspaceItem = { id: string; name: string; slug: string };

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceItem;
  workspaces: WorkspaceItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="mb-2 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left font-semibold outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-xs text-white">
          {initials(current.name)}
        </span>
        <span className="flex-1 truncate">{current.name}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} asChild>
            <Link href={`/w/${ws.slug}`}>
              <span className="grid size-6 shrink-0 place-items-center rounded bg-zinc-100 text-[10px] font-semibold text-zinc-700">
                {initials(ws.name)}
              </span>
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === current.id && <Check className="size-4 text-brand" aria-label="Current" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus /> New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
