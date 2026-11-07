"use client";

import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Follow mode: click a teammate's avatar and your view follows theirs, like
 * looking over their shoulder. Everyone publishes where they're looking in
 * Yjs awareness (`view`); followers copy it. Scrolling, clicking or typing
 * yourself stops following, as does Esc.
 *
 * Where you're looking is described in a way that works across screen sizes:
 * for docs, which block is at the top and how far into it; for boards, how
 * far across the board you've scrolled, and which card is open.
 */

export type View =
  | { kind: "doc"; block: number; offset: number }
  | { kind: "board"; x: number; y: number; card: string | null };

export type Leader = { clientId: number; name: string; color: string };

/** Publishes my view whenever I scroll (or `deps` change), a few times a second at most. */
export function useBroadcastView(provider: HocuspocusProvider, read: () => View | null, deps: unknown[] = []) {
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        provider.awareness?.setLocalStateField("view", readRef.current());
      }, 120);
    };
    publish();
    window.addEventListener("scroll", publish, { capture: true, passive: true });
    window.addEventListener("resize", publish);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", publish, { capture: true });
      window.removeEventListener("resize", publish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, ...deps]);
}

/** Follow someone: applies their view as it changes until you take over. */
export function useFollow(provider: HocuspocusProvider, apply: (view: View) => void) {
  const [leader, setLeader] = useState<Leader | null>(null);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  const stop = useCallback(() => setLeader(null), []);

  // Copy their view as it changes; stop if they leave the page.
  useEffect(() => {
    const awareness = provider.awareness;
    if (!leader || !awareness) return;
    let last = "";
    const sync = () => {
      const state = awareness.getStates().get(leader.clientId);
      if (!state) {
        toast(`${leader.name} left the page`, { description: "Stopped following." });
        setLeader(null);
        return;
      }
      const view = state.view as View | null | undefined;
      const key = JSON.stringify(view ?? null);
      if (view && key !== last) {
        last = key;
        applyRef.current(view);
      }
    };
    sync();
    awareness.on("change", sync);
    return () => awareness.off("change", sync);
  }, [provider, leader]);

  // Taking over (scrolling, clicking, typing) stops following.
  useEffect(() => {
    if (!leader) return;
    const takeOver = (event: Event) => {
      if ((event.target as Element | null)?.closest?.("[data-follow-ui]")) return;
      if (event instanceof KeyboardEvent && ["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
      setLeader(null);
    };
    // Starting to follow was itself a click: listen from the next tick.
    const id = setTimeout(() => {
      for (const name of ["wheel", "touchstart", "mousedown", "keydown"]) {
        window.addEventListener(name, takeOver, { capture: true, passive: true });
      }
    }, 0);
    return () => {
      clearTimeout(id);
      for (const name of ["wheel", "touchstart", "mousedown", "keydown"]) {
        window.removeEventListener(name, takeOver, { capture: true });
      }
    };
  }, [leader]);

  return { leader, follow: setLeader, stop };
}

/** The coloured frame and "Following Ravi" chip shown while following. */
export function FollowFrame({ leader, onStop }: { leader: Leader | null; onStop: () => void }) {
  if (!leader) return null;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50"
        style={{ boxShadow: `inset 0 0 0 3px ${leader.color}` }}
      />
      <div
        data-follow-ui
        role="status"
        className="fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full py-1 pr-1 pl-4 text-sm font-medium text-white shadow-lg"
        style={{ background: leader.color }}
      >
        Following {leader.name}
        <Button size="sm" variant="secondary" className="h-7 rounded-full" onClick={onStop}>
          Stop
        </Button>
      </div>
    </>
  );
}

/* ----------------------------- Doc and board views ---------------------------- */

/** Height of the sticky bars at the top of a doc page. */
const DOC_TOP = 120;

export function readDocView(root: HTMLElement | null): View | null {
  if (!root) return null;
  const blocks = Array.from(root.children) as HTMLElement[];
  for (let i = 0; i < blocks.length; i++) {
    const rect = blocks[i].getBoundingClientRect();
    if (rect.bottom > DOC_TOP) {
      return { kind: "doc", block: i, offset: Math.max(0, Math.min(1, (DOC_TOP - rect.top) / (rect.height || 1))) };
    }
  }
  return { kind: "doc", block: Math.max(0, blocks.length - 1), offset: 1 };
}

export function applyDocView(root: HTMLElement | null, view: View) {
  if (!root || view.kind !== "doc") return;
  const block = root.children[Math.min(view.block, root.children.length - 1)] as HTMLElement | undefined;
  if (!block) return;
  const rect = block.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top + view.offset * rect.height - DOC_TOP, behavior: "smooth" });
}

const fraction = (pos: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, pos / max)) : 0);

export function readBoardView(scroller: HTMLElement | null, card: string | null): View | null {
  if (!scroller) return null;
  return {
    kind: "board",
    x: fraction(scroller.scrollLeft, scroller.scrollWidth - scroller.clientWidth),
    y: fraction(scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight),
    card,
  };
}

export function applyBoardView(scroller: HTMLElement | null, view: View, openCard: (id: string | null) => void) {
  if (!scroller || view.kind !== "board") return;
  scroller.scrollTo({
    left: view.x * (scroller.scrollWidth - scroller.clientWidth),
    top: view.y * (scroller.scrollHeight - scroller.clientHeight),
    behavior: "smooth",
  });
  openCard(view.card);
}
