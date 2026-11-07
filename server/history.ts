/**
 * Records Rewind history on the sync server.
 *
 * Every change to a page arrives as a tiny Yjs update (often one keystroke).
 * Storing each one would be wasteful, so updates are grouped per page and per
 * author: a batch is written after a second with no new edits from that
 * person, or after five seconds of continuous typing, whichever comes first.
 * Merging is lossless (Y.mergeUpdates), so replaying the batches in order
 * rebuilds the page exactly.
 */
import { count, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as Y from "yjs";
import * as schema from "../src/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

const IDLE_MS = 1000;
const MAX_MS = 5000;

type Batch = {
  pageId: string;
  userId: string | null;
  updates: Uint8Array[];
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
};

export class HistoryRecorder {
  private batches = new Map<string, Batch>();
  private writing = Promise.resolve();

  constructor(private db: Db) {}

  /** Queue one update. `userId` is null for changes Braid makes itself. */
  record(pageId: string, userId: string | null, update: Uint8Array) {
    const key = `${pageId}:${userId ?? "braid"}`;
    // Someone else's edit on this page closes the other open batches first,
    // so rows are stored in the order things happened (Ravi's reply always
    // lands after the text of Asha's that it builds on).
    for (const other of this.batches.keys()) {
      if (other !== key && other.startsWith(`${pageId}:`)) void this.flushKey(other);
    }
    const batch = this.batches.get(key);
    if (batch) {
      clearTimeout(batch.timer);
      batch.updates.push(update);
      const due = Date.now() - batch.startedAt >= MAX_MS ? 0 : IDLE_MS;
      batch.timer = setTimeout(() => this.flushKey(key), due);
      return;
    }
    this.batches.set(key, {
      pageId,
      userId,
      updates: [update],
      startedAt: Date.now(),
      timer: setTimeout(() => this.flushKey(key), IDLE_MS),
    });
  }

  /**
   * Pages created before Rewind existed have content but no history. The
   * first time one loads, record its current state as the starting point.
   */
  async ensureBaseline(pageId: string, document: Y.Doc) {
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(schema.pageUpdate)
      .where(eq(schema.pageUpdate.pageId, pageId));
    if (n > 0) return;
    const state = Y.encodeStateAsUpdate(document);
    // An empty doc encodes to a couple of bytes; nothing worth recording.
    if (state.byteLength <= 2) return;
    await this.db.insert(schema.pageUpdate).values({ pageId, userId: null, update: Buffer.from(state), edits: 0 });
  }

  /** Writes every pending batch for one page (before it unloads). */
  async flushPage(pageId: string) {
    for (const key of [...this.batches.keys()]) {
      if (key.startsWith(`${pageId}:`)) await this.flushKey(key);
    }
  }

  /** Writes everything (on shutdown). */
  async flushAll() {
    for (const key of [...this.batches.keys()]) await this.flushKey(key);
    await this.writing;
  }

  private flushKey(key: string) {
    const batch = this.batches.get(key);
    if (!batch) return this.writing;
    clearTimeout(batch.timer);
    this.batches.delete(key);
    const merged = batch.updates.length === 1 ? batch.updates[0] : Y.mergeUpdates(batch.updates);
    // Chain writes so rows land in the order the edits happened.
    this.writing = this.writing
      .then(async () => {
        await this.db.insert(schema.pageUpdate).values({
          pageId: batch.pageId,
          userId: batch.userId,
          update: Buffer.from(merged),
          edits: batch.updates.length,
          createdAt: new Date(batch.startedAt),
        });
      })
      .catch((error) => console.error("Couldn't save history for", batch.pageId, error));
    return this.writing;
  }
}
