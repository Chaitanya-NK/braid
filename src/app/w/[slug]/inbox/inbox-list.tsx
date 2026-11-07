"use client";

import { AtSign, CheckCheck, GitMerge, Inbox, SquareKanban, UserPlus, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { NotificationKind } from "@/db/schema";
import { INBOX_CHANGED_EVENT, describe } from "@/lib/inbox-text";
import { markAllRead, markRead, markUnread } from "@/lib/notification-actions";
import { cn, timeAgo } from "@/lib/utils";

type Item = {
  id: string;
  kind: NotificationKind;
  subject: string;
  snippet: string | null;
  url: string;
  createdAt: number;
  read: boolean;
  actorName: string | null;
  actorColor: string;
};

const ICON: Record<NotificationKind, LucideIcon> = {
  mention: AtSign,
  assigned: SquareKanban,
  branch_merged: GitMerge,
  member_joined: UserPlus,
};

const changed = () => window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));

export function InboxList({ workspaceId, items }: { workspaceId: string; items: Item[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => !i.read).length;
  const shown = filter === "unread" ? items.filter((i) => !i.read) : items;

  function open(item: Item) {
    if (!item.read) void markRead([item.id]).then(changed);
    router.push(item.url);
  }

  function toggleRead(item: Item) {
    startTransition(async () => {
      await (item.read ? markUnread(item.id) : markRead([item.id]));
      changed();
      router.refresh();
    });
  }

  function readAll() {
    startTransition(async () => {
      await markAllRead(workspaceId);
      changed();
      toast.success("All caught up");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unread === 0 ? "You're all caught up." : `${unread} unread`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={readAll} disabled={unread === 0 || pending}>
            <CheckCheck aria-hidden="true" /> Mark all as read
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-card p-10 text-center">
          <Inbox className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 font-medium">{filter === "unread" ? "Nothing unread" : "Nothing here yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When someone @mentions you, assigns you a card or merges your branch, it shows up here.
          </p>
        </div>
      ) : (
        <ul aria-label="Notifications" className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((item) => {
            const Icon = ICON[item.kind];
            return (
              <li key={item.id} className={cn("group relative flex gap-3 px-4 py-3", !item.read && "bg-brand-soft/40")}>
                <span className="relative shrink-0">
                  <MemberAvatar name={item.actorName ?? "?"} color={item.actorColor} />
                  <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full border bg-card">
                    <Icon className="size-2.5" aria-hidden="true" />
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left after:absolute after:inset-0"
                >
                  <span className={cn("text-sm", !item.read && "font-semibold")}>
                    {!item.read && <span className="sr-only">Unread: </span>}
                    {describe(item)}
                  </span>
                  {item.snippet && item.kind === "mention" && (
                    <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">“{item.snippet}”</span>
                  )}
                  <span className="mt-0.5 text-xs text-muted-foreground">{timeAgo(new Date(item.createdAt))}</span>
                </button>
                <span className="relative z-10 flex items-center gap-2 self-center">
                  {!item.read && <span className="size-2 rounded-full bg-brand" aria-hidden="true" />}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => toggleRead(item)}
                    disabled={pending}
                  >
                    {item.read ? "Mark unread" : "Mark read"}
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
