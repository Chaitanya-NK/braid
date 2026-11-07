"use client";

import { ArrowRightLeft, House, Inbox, Plus, Search, Settings, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { KIND_LABEL, PageIcon } from "@/components/page-icon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { PageKind } from "@/db/schema";
import { createPage } from "@/lib/actions";

/** Fire on window to open the palette from anywhere (e.g. the sidebar's search button). */
export const OPEN_PALETTE_EVENT = "braid:open-palette";

type Props = {
  workspace: { id: string; slug: string; name: string };
  pages: { id: string; title: string; kind: PageKind }[];
  workspaces: { slug: string; name: string }[];
  canCreate: boolean;
  canInvite: boolean;
};

const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. */
export function useShortcutLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => (isMac() ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

/**
 * ⌘K / Ctrl+K: jump to any page, make a new one, or go anywhere in the
 * workspace, without touching the mouse.
 */
export function CommandPalette({ workspace, pages, workspaces, canCreate, canInvite }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const base = `/w/${workspace.slug}`;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const create = (kind: PageKind) => {
    setOpen(false);
    const form = new FormData();
    form.set("workspaceId", workspace.id);
    form.set("kind", kind);
    // The action opens the new page when it's made.
    startTransition(() => createPage(form));
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search Braid"
      description={`Jump to a page or run a command in ${workspace.name}`}
      showCloseButton={false}
    >
      <CommandInput placeholder="Search pages, or type a command…" aria-label="Search pages and commands" />
      <CommandList>
        <CommandEmpty>Nothing matches. Try another word.</CommandEmpty>

        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem key={p.id} value={`page ${p.title} ${p.id}`} onSelect={() => go(`${base}/p/${p.id}`)}>
                <PageIcon kind={p.kind} />
                <span className="truncate">{p.title}</span>
                <CommandShortcut className="tracking-normal">{KIND_LABEL[p.kind]}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {canCreate && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Create">
              {(["doc", "board", "canvas"] as const).map((kind) => (
                <CommandItem key={kind} value={`new ${kind} create`} onSelect={() => create(kind)}>
                  <Plus /> New {KIND_LABEL[kind].toLowerCase()}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Go to">
          <CommandItem value="go home" onSelect={() => go(base)}>
            <House /> Home
          </CommandItem>
          <CommandItem value="go inbox notifications mentions" onSelect={() => go(`${base}/inbox`)}>
            <Inbox /> Inbox
          </CommandItem>
          <CommandItem value="go trash deleted" onSelect={() => go(`${base}/trash`)}>
            <Trash2 /> Trash
          </CommandItem>
          <CommandItem value="go settings members" onSelect={() => go(`${base}/settings`)}>
            <Settings /> Settings
          </CommandItem>
          {canInvite && (
            <CommandItem value="invite people members teammates" onSelect={() => go(`${base}/settings#members`)}>
              <UserPlus /> Invite people
            </CommandItem>
          )}
        </CommandGroup>

        {workspaces.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch workspace">
              {workspaces
                .filter((w) => w.slug !== workspace.slug)
                .map((w) => (
                  <CommandItem key={w.slug} value={`workspace switch ${w.name}`} onSelect={() => go(`/w/${w.slug}`)}>
                    <ArrowRightLeft /> {w.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** The "Search" button in the sidebar. */
export function SearchButton() {
  const shortcut = useShortcutLabel();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      className="mt-2 mb-1 flex min-h-9 items-center gap-2.5 rounded-lg border bg-background px-2.5 text-muted-foreground hover:border-zinc-300 hover:text-foreground"
    >
      <Search className="size-4" aria-hidden="true" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border bg-card px-1.5 font-sans text-[11px]">{shortcut}</kbd>
    </button>
  );
}
