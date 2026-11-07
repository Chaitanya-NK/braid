"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { markSeen } from "@/lib/catch-up-actions";

/** Fired on window with `{ pageId }` when a page is marked as seen. */
const SEEN_EVENT = "braid:page-seen";

/**
 * Marks the open page as seen: when it opens, every minute while it's on
 * screen, when you switch away, and when you leave. What you watched happen
 * live won't turn up in Catch-up later.
 */
export function SeenTracker({ pageId }: { pageId: string }) {
  useEffect(() => {
    const mark = () => {
      void markSeen(pageId).catch(() => {});
      window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { pageId } }));
    };
    // Leaving by closing the tab or a full page load: a beacon still gets through.
    const beacon = () =>
      navigator.sendBeacon("/api/seen", new Blob([JSON.stringify({ pageId })], { type: "application/json" }));
    mark();
    const timer = setInterval(() => document.visibilityState === "visible" && mark(), 60_000);
    const onHide = () => document.visibilityState === "hidden" && beacon();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", beacon);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", beacon);
      mark();
    };
  }, [pageId]);
  return null;
}

/** The number next to "Catch up" in the sidebar; drops as you open those pages. */
export function CatchUpBadge({ pageIds }: { pageIds: string[] }) {
  const [unseen, setUnseen] = useState(() => new Set(pageIds));
  const [lastIds, setLastIds] = useState(pageIds);
  // New list from the server (e.g. after "Mark all as caught up"): start again from it.
  if (lastIds !== pageIds) {
    setLastIds(pageIds);
    setUnseen(new Set(pageIds));
  }
  useEffect(() => {
    const onSeen = (e: Event) => {
      const { pageId } = (e as CustomEvent<{ pageId: string }>).detail;
      setUnseen((prev) => {
        if (!prev.has(pageId)) return prev;
        const next = new Set(prev);
        next.delete(pageId);
        return next;
      });
    };
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SEEN_EVENT, onSeen);
  }, []);
  if (unseen.size === 0) return null;
  return (
    <span
      className="ml-auto rounded-full bg-zinc-200 px-1.5 py-px text-xs font-semibold text-zinc-800 tabular-nums"
      aria-label={`${unseen.size} ${unseen.size === 1 ? "page" : "pages"} changed`}
    >
      {unseen.size}
    </span>
  );
}

/** "Since you were here…" at the top of a page someone else changed. */
export function CatchUpBanner({ summary, href }: { summary: string; href: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <section
      aria-label="Catch up"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-sky-50 px-6 py-2.5 text-sm"
    >
      <Sparkles className="size-4 text-sky-700" aria-hidden="true" />
      <span className="flex-1">{summary}</span>
      <Button asChild size="sm" variant="outline" className="bg-white">
        <Link href={href}>See what changed</Link>
      </Button>
      <Button size="icon" variant="ghost" className="size-8" aria-label="Dismiss" onClick={() => setOpen(false)}>
        <X aria-hidden="true" />
      </Button>
    </section>
  );
}
