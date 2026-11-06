/**
 * Braid sync server.
 *
 * A Hocuspocus (Yjs) WebSocket server that keeps every open page in sync
 * between browsers and saves it to Postgres. Runs next to Next.js:
 * `npm run dev` starts both. Port 1234 by default (SYNC_PORT to change).
 */
import { Database } from "@hocuspocus/extension-database";
import { Server } from "@hocuspocus/server";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seedBoard } from "../src/lib/board-model";
import { docName, verifySyncToken, type SyncClaims } from "../src/lib/sync-token";

try {
  process.loadEnvFile();
} catch {}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

const db = drizzle(postgres(process.env.DATABASE_URL, { max: 5 }), { schema });
const port = Number(process.env.SYNC_PORT ?? 1234);

const PAGE_DOC = /^page:([0-9a-f-]{36})$/i;

/** Pulls the page id out of a document name like "page:<uuid>". */
function pageIdOf(documentName: string) {
  const match = PAGE_DOC.exec(documentName);
  if (!match) throw new Error(`Unknown document "${documentName}"`);
  return match[1];
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
    if (documentName !== docName(claims.pageId)) throw new Error("Token is for a different page");
    connectionConfig.readOnly = claims.readOnly;
    return { user: claims };
  },

  // A board opened for the first time gets its starter columns, here on the
  // server, so two people opening it at once can't both add them.
  async afterLoadDocument({ document, documentName }) {
    const pageId = pageIdOf(documentName);
    const [row] = await db
      .select({ kind: schema.page.kind })
      .from(schema.page)
      .where(eq(schema.page.id, pageId))
      .limit(1);
    if (row?.kind === "board" && seedBoard(document)) {
      console.log(`Seeded new board ${pageId}`);
    }
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const [row] = await db
          .select({ state: schema.pageDoc.state })
          .from(schema.pageDoc)
          .where(eq(schema.pageDoc.pageId, pageIdOf(documentName)))
          .limit(1);
        return row ? new Uint8Array(row.state) : null;
      },

      async store({ documentName, state }) {
        const pageId = pageIdOf(documentName);
        const now = new Date();
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
