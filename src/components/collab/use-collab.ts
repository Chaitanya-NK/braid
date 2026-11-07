"use client";

import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { docName } from "@/lib/doc-name";
import { localDocName } from "@/lib/local-store";
import { getSyncToken } from "@/lib/sync-actions";
import { syncServerUrl } from "@/lib/sync-url";

/**
 * Tracks edits made while the sync server can't be reached, and whether
 * other people's edits arrived while we caught up. Drives the offline
 * status and the "Back online" toast.
 */
export class OfflineTracker {
  /** Number of my Yjs updates (roughly keystrokes) since the connection was last fully synced. */
  pending = 0;
  /** Updates from others received while my pending edits were catching up. */
  mergedFromOthers = 0;
  /** True once the local IndexedDB copy has loaded. */
  localReady = false;
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  emit() {
    this.listeners.forEach((fn) => fn());
  }
  reset() {
    this.pending = 0;
    this.mergedFromOthers = 0;
    this.emit();
  }
}

export type Collab = {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  local: IndexeddbPersistence;
  tracker: OfflineTracker;
};

/**
 * Opens a page's Yjs document: first from this browser's local copy, then
 * from the sync server. Returns null until it exists (it's browser-only).
 *
 * - Fetches a fresh sync ticket on every (re)connect.
 * - Disconnects the moment the browser goes offline and reconnects when it's
 *   back, so edits queue locally instead of waiting on a dead socket.
 */
export function useCollab(pageId: string, userId: string, onAccessDenied: () => void): Collab | null {
  const [collab, setCollab] = useState<Collab | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const tracker = new OfflineTracker();

    // Local copy first: the page shows its last-known content immediately.
    const local = new IndexeddbPersistence(localDocName(userId, pageId), doc);
    local.whenSynced.then(() => {
      tracker.localReady = true;
      tracker.emit();
    });

    const provider = new HocuspocusProvider({
      url: syncServerUrl(),
      name: docName(pageId),
      document: doc,
      token: async () => (await getSyncToken(pageId)) ?? "",
      onAuthenticationFailed: onAccessDenied,
    });
    const socket = provider.configuration.websocketProvider;

    const isLive = () => socket.status === WebSocketStatus.Connected && provider.isSynced;
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === local) return; // loading the local copy isn't a new edit
      if (origin === provider) {
        if (tracker.pending > 0) tracker.mergedFromOthers++;
        return;
      }
      if (!isLive()) {
        tracker.pending++;
        tracker.emit();
      }
    };
    doc.on("update", onUpdate);

    const goOffline = () => socket.disconnect();
    const goOnline = () => socket.connect();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (!navigator.onLine) goOffline();

    // Created in an effect because it's browser-only; this runs once per page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollab({ doc, provider, local, tracker });
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      doc.off("update", onUpdate);
      provider.destroy();
      local.destroy();
      doc.destroy();
      setCollab(null);
    };
    // onAccessDenied is intentionally not a dependency: reconnecting on every render would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, userId]);

  return collab;
}

export type SyncState = "connecting" | "syncing" | "saving" | "saved" | "offline";

/** One word for the header: are my edits safely on the server? (null provider = not created yet) */
export function useSyncState(provider: HocuspocusProvider | null): SyncState {
  return useSyncExternalStore(
    (notify) => {
      if (!provider) return () => {};
      const events = ["status", "synced", "unsyncedChanges", "disconnect", "connect"];
      events.forEach((e) => provider.on(e, notify));
      return () => events.forEach((e) => provider.off(e, notify));
    },
    () => {
      if (!provider) return "connecting";
      const status = provider.configuration.websocketProvider.status;
      if (status === WebSocketStatus.Disconnected) return "offline";
      if (status === WebSocketStatus.Connecting) return "connecting";
      if (!provider.isSynced) return "syncing";
      return provider.hasUnsyncedChanges ? "saving" : "saved";
    },
    () => "connecting",
  );
}

/** How many of my updates are waiting on this device for the connection (0 = none). */
export function usePendingChanges(tracker: OfflineTracker) {
  return useSyncExternalStore(
    tracker.subscribe,
    () => tracker.pending,
    () => 0,
  );
}

export type Peer = { clientId: number; name: string; color: string };

/** Everyone else currently in the document, from Yjs awareness. */
export function usePeers(provider: HocuspocusProvider): Peer[] {
  const snapshot = useSyncExternalStore(
    (notify) => {
      provider.awareness?.on("change", notify);
      return () => provider.awareness?.off("change", notify);
    },
    () => {
      const awareness = provider.awareness;
      if (!awareness) return "[]";
      const peers: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state.user) return;
        peers.push({ clientId, name: String(state.user.name), color: String(state.user.color) });
      });
      // A string snapshot keeps React from re-rendering when nothing changed.
      return JSON.stringify(peers.sort((a, b) => a.clientId - b.clientId));
    },
    () => "[]",
  );
  return useMemo(() => JSON.parse(snapshot) as Peer[], [snapshot]);
}
