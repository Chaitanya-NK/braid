/**
 * Braid sync server.
 *
 * A Hocuspocus (Yjs) WebSocket server that keeps every open page in sync
 * between browsers and saves it to Postgres. Runs next to Next.js:
 * `npm run dev` starts both. Port 1234 by default (SYNC_PORT to change).
 */
import { Database } from "@hocuspocus/extension-database";
import { Server, type Connection, type Document } from "@hocuspocus/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as Y from "yjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seedBoard } from "../src/lib/board-model";
import { AutomationEngine } from "./automations";
import { HistoryRecorder } from "./history";
import { docName, parseDocName, verifySyncToken, type SyncClaims } from "../src/lib/sync-token";

try {
  process.loadEnvFile();
} catch {}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

const db = drizzle(postgres(process.env.DATABASE_URL, { max: 5 }), { schema });
const port = Number(process.env.SYNC_PORT ?? 1234);
const history = new HistoryRecorder(db);
const automations = new AutomationEngine(db);

/**
 * A new branch starts as a copy of its page, made here the first time the
 * branch is opened. The page is opened through the server (not read from
 * the database) so unsaved edits and a new board's starter columns are
 * included. Returns the copy, which is also saved as the branch's base.
 */
async function forkBranch(pageId: string, branchId: string) {
  const main = await server.hocuspocus.openDirectConnection(docName(pageId));
  let state: Uint8Array;
  try {
    state = Y.encodeStateAsUpdate(main.document!);
  } finally {
    await main.disconnect();
  }
  await db
    .update(schema.pageBranch)
    .set({ base: Buffer.from(state), state: Buffer.from(state), updatedAt: new Date() })
    .where(and(eq(schema.pageBranch.id, branchId), isNull(schema.pageBranch.state)));
  console.log(`Branched ${branchId} from page ${pageId}`);
  return state;
}

/**
 * Huddles are peer-to-peer WebRTC calls; the sync server only passes the
 * setup messages between the two browsers involved. Each browser in a
 * huddle has a random peer id. The first message from a peer id ties it to
 * that connection, so nobody can pose as someone else's peer, and the
 * sender's real user id (from their sync ticket) is stamped on.
 */
const rtcPeers = new Map<string, Connection<{ user: SyncClaims }>>();

function relayRtc(document: Document, from: Connection<{ user: SyncClaims }>, payload: string) {
  if (payload.length > 64_000) return;
  let message: { from?: unknown; to?: unknown };
  try {
    message = JSON.parse(payload);
  } catch {
    return;
  }
  if (typeof message.from !== "string" || typeof message.to !== "string") return;
  const owner = rtcPeers.get(message.from);
  const open = new Set(document.getConnections());
  if (owner && owner !== from && open.has(owner)) return; // someone else's peer id
  rtcPeers.set(message.from, from);
  if ((message as { kind?: unknown }).kind === "hello") return; // just registering
  const target = rtcPeers.get(message.to);
  if (!target || !open.has(target)) return;
  document.broadcastStateless(
    JSON.stringify({ ...message, fromUser: from.context?.user?.userId ?? null }),
    (connection) => connection === target,
  );
}

/** Forget huddle peers whose connection has closed. */
function forgetRtcPeers(document: Document) {
  const open = new Set(document.getConnections());
  for (const [peerId, connection] of rtcPeers) {
    if (connection.document === document && !open.has(connection)) rtcPeers.delete(peerId);
  }
}

/** The `type` of a small JSON message from a browser, or null. */
function pingType(payload: string) {
  try {
    const message = JSON.parse(payload) as { type?: unknown };
    return typeof message.type === "string" ? message.type : null;
  } catch {
    return null;
  }
}

const server = new Server<{ user: SyncClaims }>({
  port,
  address: "0.0.0.0",
  name: "braid-sync",
  // Save a second after people stop typing, and at least every 10 seconds.
  debounce: 1000,
  maxDebounce: 10_000,

  async onAuthenticate({ token, documentName, connectionConfig }) {
    const claims = verifySyncToken(token);
    if (!claims) throw new Error("Invalid or expired token");
    if (documentName !== docName(claims.pageId, claims.branchId)) throw new Error("Token is for a different page");
    connectionConfig.readOnly = claims.readOnly;
    return { user: claims };
  },

  // A board opened for the first time gets its starter columns, here on the
  // server, so two people opening it at once can't both add them.
  async afterLoadDocument({ document, documentName }) {
    const { pageId, branchId } = parseDocName(documentName);
    if (branchId) return; // branches are copies: no seeding, no history of their own
    // Before seeding, so a brand-new board's history starts with its columns.
    await history.ensureBaseline(pageId, document);
    const [row] = await db
      .select({ kind: schema.page.kind })
      .from(schema.page)
      .where(eq(schema.page.id, pageId))
      .limit(1);
    if (row?.kind === "board") {
      if (seedBoard(document)) console.log(`Seeded new board ${pageId}`);
      automations.track(documentName, pageId, document);
    }
  },

  // Every change goes into Rewind history, credited to whoever made it.
  // Merging a branch shows up here too, credited to whoever merged it.
  async onChange({ documentName, update, context, transactionOrigin }) {
    const { pageId, branchId } = parseDocName(documentName);
    if (branchId) return;
    history.record(pageId, context?.user?.userId ?? null, update);
    // Branches don't run automations: they run once the branch is merged.
    automations.changed(documentName, transactionOrigin, context?.user?.userId ?? null);
  },

  // After a branch is merged or closed, the browser that did it asks us to
  // lock the branch. We check the database ourselves, then make everyone's
  // connection view-only and tell them, so nobody keeps typing into it.
  async onStateless({ documentName, document, payload, connection }) {
    const { branchId } = parseDocName(documentName);
    const type = pingType(payload);
    // Huddle (WebRTC) setup: pass it to the one person it's for.
    if (!branchId && type === "rtc") {
      relayRtc(document, connection, payload);
      return;
    }
    // "A live session on this page changed": pass it on so everyone re-checks.
    // It carries no data, so there's nothing to trust or check here.
    if (!branchId && type === "session-changed") {
      document.broadcastStateless(JSON.stringify({ type }), (other) => other !== connection);
      return;
    }
    if (!branchId || type !== "branch-status") return;
    const [branch] = await db
      .select({ status: schema.pageBranch.status })
      .from(schema.pageBranch)
      .where(eq(schema.pageBranch.id, branchId))
      .limit(1);
    if (!branch || branch.status === "open") return;
    for (const connection of document.getConnections()) connection.readOnly = true;
    // Not back to the sender: they already know, and showed their own toast.
    document.broadcastStateless(
      JSON.stringify({ type: "branch-status", status: branch.status }),
      (other) => other !== connection,
    );
  },

  async onDisconnect({ document }) {
    forgetRtcPeers(document);
  },

  async beforeUnloadDocument({ documentName }) {
    const { pageId, branchId } = parseDocName(documentName);
    automations.forget(documentName);
    if (!branchId) await history.flushPage(pageId);
  },

  async onDestroy() {
    await history.flushAll();
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const { pageId, branchId } = parseDocName(documentName);
        if (branchId) {
          const [branch] = await db
            .select({ state: schema.pageBranch.state })
            .from(schema.pageBranch)
            .where(and(eq(schema.pageBranch.id, branchId), eq(schema.pageBranch.pageId, pageId)))
            .limit(1);
          if (!branch) throw new Error(`Unknown branch ${branchId}`);
          return branch.state ? new Uint8Array(branch.state) : forkBranch(pageId, branchId);
        }
        const [row] = await db
          .select({ state: schema.pageDoc.state })
          .from(schema.pageDoc)
          .where(eq(schema.pageDoc.pageId, pageId))
          .limit(1);
        return row ? new Uint8Array(row.state) : null;
      },

      async store({ documentName, state }) {
        const { pageId, branchId } = parseDocName(documentName);
        const now = new Date();
        if (branchId) {
          await db
            .update(schema.pageBranch)
            .set({ state, updatedAt: now })
            .where(eq(schema.pageBranch.id, branchId));
          return;
        }
        await db
          .insert(schema.pageDoc)
          .values({ pageId, state, updatedAt: now })
          .onConflictDoUpdate({
            target: schema.pageDoc.pageId,
            set: { state: sql`excluded.state`, updatedAt: now },
          });
        await db.update(schema.page).set({ updatedAt: now }).where(eq(schema.page.id, pageId));
      },
    }),
  ],

  async onListen() {
    console.log(`Braid sync server listening on ws://0.0.0.0:${port}`);
  },
});

server.listen();

// Save any half-finished history batches when the server is stopped.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await history.flushAll();
    process.exit(0);
  });
}
