import { defineConfig } from "drizzle-kit";

// Load .env when present (Node 22 built-in, no dotenv needed).
try {
  process.loadEnvFile();
} catch {}

/**
 * Migrations run against MIGRATION_DATABASE_URL when it's set (the
 * database's direct string: Neon without "-pooler", Supabase's session
 * pooler on port 5432; transaction poolers can't run migrations), otherwise
 * DATABASE_URL. Remote databases get TLS.
 */
function migrationUrl() {
  const raw = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || "postgres://braid:braid@localhost:5432/braid";
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "db", "::1"].includes(url.hostname);
  if (!local && !url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  return url.toString();
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl(),
  },
});
