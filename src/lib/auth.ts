import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";

/**
 * Hosts the app can be served from: local dev, GitHub Codespaces and, when
 * deployed, this project's own Vercel addresses (production, this
 * deployment and its branch), which Vercel provides as environment
 * variables. Only these exact hosts, not every *.vercel.app site.
 * A custom domain goes in BETTER_AUTH_URL.
 * Codespaces and Vercel forward the public host in x-forwarded-host, hence
 * trustedProxyHeaders.
 */
const vercelHosts = [
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_URL,
].filter((h): h is string => Boolean(h));
const customHost = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).host : null;
const allowedHosts = [
  "localhost:3000",
  "localhost",
  "*.app.github.dev",
  ...vercelHosts,
  ...(customHost ? [customHost] : []),
];

export const auth = betterAuth({
  baseURL: {
    allowedHosts,
    fallback:
      process.env.BETTER_AUTH_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  },
  trustedOrigins: [
    "http://localhost:3000",
    "https://*.app.github.dev",
    ...vercelHosts.map((h) => `https://${h}`),
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ],
  advanced: { trustedProxyHeaders: true },
  // Counted in the database: on Vercel each function instance has its own
  // memory, so in-memory counts wouldn't add up across instances.
  rateLimit: { storage: "database" },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Must be the last plugin: lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});
