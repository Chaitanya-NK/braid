"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { cn } from "@/lib/utils";
import type { OfflineTracker, SyncState } from "./use-collab";

/* Presence avatars, the saved/offline badge and connection toasts,
   shared by docs and boards. */

type PresencePeer = { clientId: number; name: string; color: string };

/**
 * Everyone else on the page. With `onFollow`, each avatar is a button that
 * starts (or stops) following that person.
 */
export function Presence({
  peers,
  following = null,
  onFollow,
}: {
  peers: PresencePeer[];
  following?: number | null;
  onFollow?: (peer: PresencePeer | null) => void;
}) {
  if (peers.length === 0) return <span className="text-xs text-muted-foreground">Only you here</span>;
  const shown = peers.slice(0, 4);
  return (
    <div className="flex items-center gap-2" aria-label={`Also here: ${peers.map((p) => p.name).join(", ")}`}>
      <div className="flex -space-x-2">
        {shown.map((p) => {
          const avatar = (
            <MemberAvatar
              name={p.name}
              color={p.color}
              className={cn("size-7 ring-2 ring-background", following === p.clientId && "ring-offset-1")}
            />
          );
          if (!onFollow) return <span key={p.clientId}>{avatar}</span>;
          const on = following === p.clientId;
          return (
            <button
              key={p.clientId}
              type="button"
              data-follow-ui
              onClick={() => onFollow(on ? null : p)}
              aria-pressed={on}
              aria-label={on ? `Stop following ${p.name}` : `Follow ${p.name}`}
              title={on ? `Stop following ${p.name}` : `Follow ${p.name}`}
              className="rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring"
              style={on ? { boxShadow: `0 0 0 2px ${p.color}` } : undefined}
            >
              {avatar}
            </button>
          );
        })}
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
  offline: { text: "Offline", dot: "bg-amber-500" },
};

/** "Saved", "Saving…", or while offline "Offline · changes saved on this device". */
export function SyncBadge({ state, pending = 0 }: { state: SyncState; pending?: number }) {
  const { text, dot } = syncLabel[state];
  const label =
    state === "offline"
      ? pending > 0
        ? "Offline · changes saved on this device"
        : "Offline · up to date on this device"
      : text;
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Toast when the connection drops after being live, and when it's back (with what got synced). */
export function useConnectionToasts(state: SyncState, tracker: OfflineTracker) {
  const wasLive = useRef(false);
  const lostShown = useRef(false);
  useEffect(() => {
    if (state === "saved") {
      if (lostShown.current) {
        // Counts are per keystroke in Yjs, so describe what happened instead of counting.
        const synced = tracker.pending > 0;
        const merged = tracker.mergedFromOthers > 0;
        toast.success("Back online", {
          id: "connection",
          description: synced
            ? `Your offline edits are synced${merged ? " and merged with edits from others" : ""}.`
            : "You're up to date.",
        });
        tracker.reset();
      }
      wasLive.current = true;
      lostShown.current = false;
    } else if (state === "offline" && wasLive.current && !lostShown.current) {
      lostShown.current = true;
      toast.warning("You're offline", {
        id: "connection",
        description: "Keep working. Changes are saved on this device and sync when you're back.",
      });
    }
  }, [state, tracker]);
}
