"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Collab } from "./use-collab";

/**
 * The live connection of the page that's open, for UI outside the editor or
 * board that needs it (the huddle button and panel). The editor or board
 * publishes it; anything else on the page reads it.
 */

const open = new Map<string, Collab>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** Called by the doc editor or board for the page itself (not branches). */
export function usePublishCollab(pageId: string, collab: Collab | null) {
  useEffect(() => {
    if (!collab) return;
    open.set(pageId, collab);
    emit();
    return () => {
      if (open.get(pageId) === collab) open.delete(pageId);
      emit();
    };
  }, [pageId, collab]);
}

export function usePageCollab(pageId: string): Collab | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => open.get(pageId) ?? null,
    () => null,
  );
}
