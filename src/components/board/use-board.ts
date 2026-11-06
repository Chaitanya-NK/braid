"use client";

import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useMemo, useRef, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import { readBoard, type BoardSnapshot } from "@/lib/board-model";

/** The board as plain objects, re-read whenever the Yjs doc changes. */
export function useBoardSnapshot(doc: Y.Doc): BoardSnapshot {
  const cache = useRef<{ version: number; value: BoardSnapshot } | null>(null);
  const version = useRef(0);
  return useSyncExternalStore(
    (notify) => {
      const onUpdate = () => {
        version.current++;
        notify();
      };
      doc.on("update", onUpdate);
      return () => doc.off("update", onUpdate);
    },
    () => {
      if (!cache.current || cache.current.version !== version.current) {
        cache.current = { version: version.current, value: readBoard(doc) };
      }
      return cache.current.value;
    },
    () => EMPTY,
  );
}
const EMPTY: BoardSnapshot = { columns: [], cardCount: 0 };

/* ------------------------------ Presence state ----------------------------- */

/**
 * What each person broadcasts on a board, via Yjs awareness. It's not saved;
 * it disappears when they close the tab.
 */
export type BoardPresence = {
  user: { id: string; name: string; color: string };
  pointer?: { x: number; y: number } | null;
  chat?: string | null;
  dragging?: string | null; // card id
  editing?: string | null; // card id
};

export function setPresence(provider: HocuspocusProvider, fields: Partial<BoardPresence>) {
  const awareness = provider.awareness;
  if (!awareness) return;
  for (const [key, value] of Object.entries(fields)) awareness.setLocalStateField(key, value);
}

type PeerState = BoardPresence & { clientId: number };

/** Subscribes to other people's awareness, re-rendering only when `select`'s output changes. */
function usePeerSelect<T>(provider: HocuspocusProvider, select: (peers: PeerState[]) => T): T {
  const snapshot = useSyncExternalStore(
    (notify) => {
      provider.awareness?.on("change", notify);
      return () => provider.awareness?.off("change", notify);
    },
    () => {
      const awareness = provider.awareness;
      if (!awareness) return "null";
      const peers: PeerState[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state.user) return;
        peers.push({ ...(state as BoardPresence), clientId });
      });
      return JSON.stringify(select(peers));
    },
    () => "null",
  );
  return useMemo(() => JSON.parse(snapshot) as T, [snapshot]);
}

export type PeerPointer = { clientId: number; name: string; color: string; x: number; y: number; chat: string | null };

/** Other people's mouse pointers (and cursor-chat messages). Updates often, so use it in a small component. */
export function usePeerPointers(provider: HocuspocusProvider): PeerPointer[] {
  return usePeerSelect(provider, (peers) =>
    peers
      .filter((p) => p.pointer)
      .map((p) => ({
        clientId: p.clientId,
        name: p.user.name,
        color: p.user.color,
        x: p.pointer!.x,
        y: p.pointer!.y,
        chat: p.chat ?? null,
      })),
  ) ?? [];
}

export type CardActivity = Record<string, { name: string; color: string; kind: "editing" | "dragging" }>;

/** Which cards other people are dragging or editing right now. */
export function useCardActivity(provider: HocuspocusProvider): CardActivity {
  return (
    usePeerSelect(provider, (peers) => {
      const out: CardActivity = {};
      for (const p of peers) {
        if (p.dragging) out[p.dragging] = { name: p.user.name, color: p.user.color, kind: "dragging" };
        else if (p.editing) out[p.editing] = { name: p.user.name, color: p.user.color, kind: "editing" };
      }
      return out;
    }) ?? {}
  );
}

/** Everyone else on the board, for the avatars in the toolbar. */
export function useBoardPeers(provider: HocuspocusProvider) {
  return (
    usePeerSelect(provider, (peers) =>
      peers
        .map((p) => ({ clientId: p.clientId, name: p.user.name, color: p.user.color }))
        .sort((a, b) => a.clientId - b.clientId),
    ) ?? []
  );
}
