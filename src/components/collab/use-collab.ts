"use client";

import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { docName } from "@/lib/doc-name";
import { getSyncToken } from "@/lib/sync-actions";
import { syncServerUrl } from "@/lib/sync-url";

export type Collab = { doc: Y.Doc; provider: HocuspocusProvider };

/**
 * Opens a page's Yjs document on the sync server. Returns null until the
 * connection object exists (it's browser-only). Fetches a fresh ticket on
 * every (re)connect, so expired tickets never strand a long-open tab.
 */
export function useCollab(pageId: string, onAccessDenied: () => void): Collab | null {
  const [collab, setCollab] = useState<Collab | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: syncServerUrl(),
      name: docName(pageId),
      document: doc,
      token: async () => (await getSyncToken(pageId)) ?? "",
      onAuthenticationFailed: onAccessDenied,
    });
    // Created in an effect because it's browser-only; this runs once per page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollab({ doc, provider });
    return () => {
      provider.destroy();
      doc.destroy();
      setCollab(null);
    };
    // onAccessDenied is intentionally not a dependency: reconnecting on every render would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  return collab;
}

export type SyncState = "connecting" | "syncing" | "saving" | "saved" | "offline";

/** One word for the header: are my edits safely on the server? */
export function useSyncState(provider: HocuspocusProvider): SyncState {
  return useSyncExternalStore(
    (notify) => {
      const events = ["status", "synced", "unsyncedChanges", "disconnect", "connect"];
      events.forEach((e) => provider.on(e, notify));
      return () => events.forEach((e) => provider.off(e, notify));
    },
    () => {
      const status = provider.configuration.websocketProvider.status;
      if (status === WebSocketStatus.Disconnected) return "offline";
      if (status === WebSocketStatus.Connecting) return "connecting";
      if (!provider.isSynced) return "syncing";
      return provider.hasUnsyncedChanges ? "saving" : "saved";
    },
    () => "connecting",
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
