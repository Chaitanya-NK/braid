"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { INBOX_CHANGED_EVENT, describe } from "@/lib/inbox-text";
import { getInboxStatus, markRead } from "@/lib/notification-actions";

const POLL_MS = 15_000;

/**
 * The unread count next to "Inbox" in the sidebar. Checks for new
 * notifications every 15 seconds while the tab is visible (and when you come
 * back to it), and shows a toast for each new one.
 */
export function UnreadBadge({ workspaceId, initial }: { workspaceId: string; initial: number }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initial);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      clearTimeout(timer);
      if (document.visibilityState === "visible" && navigator.onLine) {
        try {
          const status = await getInboxStatus(workspaceId);
          if (stopped) return;
          setUnread(status.unread);
          // The first check just learns what's already there; later ones toast what's new.
          if (seen.current) {
            for (const item of status.latest.filter((i) => !seen.current!.has(i.id)).reverse()) {
              toast(describe(item), {
                id: `notification-${item.id}`,
                description: item.snippet && item.kind === "mention" ? `“${item.snippet}”` : undefined,
                action: {
                  label: "Open",
                  onClick: () => {
                    void markRead([item.id]).then(() => window.dispatchEvent(new Event(INBOX_CHANGED_EVENT)));
                    router.push(item.url);
                  },
                },
              });
            }
          }
          seen.current = new Set([...(seen.current ?? []), ...status.latest.map((i) => i.id)]);
        } catch {
          // Offline or signed out: try again next time.
        }
      }
      if (!stopped) timer = setTimeout(check, POLL_MS);
    }

    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    const onChanged = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(INBOX_CHANGED_EVENT, onChanged);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(INBOX_CHANGED_EVENT, onChanged);
    };
  }, [workspaceId, router]);

  if (unread === 0) return null;
  return (
    <span
      className="ml-auto rounded-full bg-brand px-1.5 py-px text-xs font-semibold text-white tabular-nums"
      aria-label={`${unread} unread`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}
