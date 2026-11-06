"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { cn } from "@/lib/utils";
import type { SyncState } from "./use-collab";

/* Presence avatars, the saved/offline badge and connection toasts,
   shared by docs and boards. */

export function Presence({ peers }: { peers: { clientId: number; name: string; color: string }[] }) {
  if (peers.length === 0) return <span className="text-xs text-muted-foreground">Only you here</span>;
  const shown = peers.slice(0, 4);
  return (
    <div className="flex items-center gap-2" aria-label={`Also here: ${peers.map((p) => p.name).join(", ")}`}>
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <MemberAvatar key={p.clientId} name={p.name} color={p.color} className="size-7 ring-2 ring-background" />
        ))}
        {peers.length > shown.length && (
          <span className="grid size-7 place-items-center rounded-full bg-zinc-200 text-xs font-semibold ring-2 ring-background">
            +{peers.length - shown.length}
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {peers.length === 1 ? `${peers[0].name.split(" ")[0]} is here` : `${peers.length} others here`}
      </span>
    </div>
  );
}

const syncLabel: Record<SyncState, { text: string; dot: string }> = {
  connecting: { text: "Connecting…", dot: "bg-zinc-400" },
  syncing: { text: "Syncing…", dot: "bg-amber-500" },
  saving: { text: "Saving…", dot: "bg-amber-500" },
  saved: { text: "Saved", dot: "bg-green-600" },
  offline: { text: "Offline", dot: "bg-red-600" },
};

export function SyncBadge({ state }: { state: SyncState }) {
  const { text, dot } = syncLabel[state];
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
      {text}
    </span>
  );
}

/** Toast when the connection drops after being live, and when it comes back. */
export function useConnectionToasts(state: SyncState) {
  const wasLive = useRef(false);
  const lostShown = useRef(false);
  useEffect(() => {
    if (state === "saved" || state === "saving") {
      if (lostShown.current) toast.success("Back online", { id: "connection" });
      wasLive.current = true;
      lostShown.current = false;
    } else if (state === "offline" && wasLive.current && !lostShown.current) {
      lostShown.current = true;
      toast.warning("Connection lost", {
        id: "connection",
        description: "Keep this tab open. Your edits will sync when it reconnects.",
      });
    }
  }, [state]);
}

