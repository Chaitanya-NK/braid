import type { Options } from "postgres";

/**
 * Connection settings for Postgres, shared by the Next.js app and the sync
 * server. The same code runs against local Postgres (Codespaces), Neon and
 * Supabase:
 *
 * - Through a transaction-mode pooler (Neon's "-pooler" hostnames, Supabase's
 *   port 6543), which Vercel functions use, prepared statements are off.
 * - Remote databases need TLS; local ones (localhost, the Codespaces "db"
 *   container) don't have it.
 * - On Vercel each function instance keeps a single connection; the pooler
 *   shares the database's connections between all of them.
 * - Idle connections to a remote database close after a minute, so a
 *   database that sleeps when unused (Neon) can actually go to sleep.
 */
export function connectionOptions(url: string, role: "app" | "sync"): Options<Record<string, never>> {
  const { hostname, port } = new URL(url);
  const local = ["localhost", "127.0.0.1", "db", "::1"].includes(hostname) || process.env.DATABASE_SSL === "disable";
  const pooled = port === "6543" || hostname.includes("-pooler.");
  const serverless = Boolean(process.env.VERCEL);
  return {
    max: role === "sync" ? 5 : serverless ? 1 : 10,
    prepare: !pooled,
    ssl: local ? false : "require",
    connect_timeout: 15,
    ...(local ? {} : { idle_timeout: serverless ? 20 : 60 }),
  };
}
