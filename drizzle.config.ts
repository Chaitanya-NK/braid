import { defineConfig } from "drizzle-kit";

// Load .env when present (Node 22 built-in, no dotenv needed).
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://braid:braid@localhost:5432/braid",
  },
});
