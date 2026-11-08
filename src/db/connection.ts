import type { Options } from "postgres";

/**
 * Connection settings for Postgres, shared by the Next.js app and the sync
 * server. The same code runs against local Postgres (Codespaces) and
 * Supabase (deployed):
 *
 * - Supabase's transaction pooler (port 6543), which Vercel functions use,
 *   doesn't support prepared statements, so they're turned off there.
 * - Remote databases need TLS; local ones (localhost, the Codespaces "db"
 *   container) don't have it.
 * - On Vercel each function instance keeps a single connection; the pooler
 *   shares the database's connections between all of them.
 */
export function connectionOptions(url: string, role: "app" | "sync"): Options<Record<string, never>> {
  const { hostname, port } = new URL(url);
  const local = ["localhost", "127.0.0.1", "db", "::1"].includes(hostname) || process.env.DATABASE_SSL === "disable";
  const serverless = Boolean(process.env.VERCEL);
  return {
    max: role === "sync" ? 5 : serverless ? 1 : 10,
    prepare: port !== "6543",
    ssl: local ? false : "require",
    connect_timeout: 15,
    ...(serverless ? { idle_timeout: 20 } : {}),
  };
}
