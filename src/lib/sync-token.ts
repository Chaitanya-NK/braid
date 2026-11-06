import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A short-lived, signed ticket that lets a browser open one page on the
 * sync server. Next.js issues it after checking workspace membership;
 * the sync server verifies the signature and expiry before letting the
 * connection in. Shared by both, so it must not import Next.js code.
 */

export type SyncClaims = {
  pageId: string;
  userId: string;
  name: string;
  color: string;
  readOnly: boolean;
  /** Expiry, in seconds since the epoch. */
  exp: number;
};

const TTL_SECONDS = 10 * 60;

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value === "change-me") throw new Error("BETTER_AUTH_SECRET is not set");
  return value;
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSyncToken(claims: Omit<SyncClaims, "exp">) {
  const full: SyncClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Returns the claims if the token is genuine and unexpired, otherwise null. */
export function verifySyncToken(token: string): SyncClaims | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as SyncClaims;
    if (typeof claims.exp !== "number" || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

export { docName } from "./doc-name";
