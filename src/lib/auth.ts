import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";

// Hosts the app can be served from: local dev and GitHub Codespaces.
// Codespaces forwards the public host in x-forwarded-host, hence trustedProxyHeaders.
const allowedHosts = ["localhost:3000", "localhost", "*.app.github.dev"];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL
    ? process.env.BETTER_AUTH_URL
    : { allowedHosts, fallback: "http://localhost:3000" },
  trustedOrigins: ["http://localhost:3000", "https://*.app.github.dev"],
  advanced: { trustedProxyHeaders: true },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Must be the last plugin: lets Server Actions set auth cookies.
  plugins: [nextCookies()],
});
