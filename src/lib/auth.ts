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

/** The origin a request was sent to, as the browser saw it (behind Vercel's or Codespaces' proxy). */
function ownOrigin(request: Request) {
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const host = first(request.headers.get("x-forwarded-host")) ?? first(request.headers.get("host"));
  if (!host) return null;
  const proto = first(request.headers.get("x-forwarded-proto")) ?? new URL(request.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const auth = betterAuth({
  baseURL: {
    allowedHosts,
    fallback:
      process.env.BETTER_AUTH_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  },
  // Sign-in and sign-up must come from Braid's own pages. Besides the fixed
  // list, trust the address this request was sent to: a request from the
  // same address is same-origin, which is exactly what this check is for.
  // (A Vercel project has several addresses, e.g. per deployment, so a
  // fixed list can miss the one you're on.)
  trustedOrigins: (request?: Request) => {
    const fixed = [
      "http://localhost:3000",
      "https://*.app.github.dev",
      ...vercelHosts.map((h) => `https://${h}`),
      ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ];
    const self = request ? ownOrigin(request) : null;
    return self ? [...fixed, self] : fixed;
  },
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
