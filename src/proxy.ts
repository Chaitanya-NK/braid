import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: if there's no session cookie at all, send the
 * visitor to sign in before rendering anything. The real check happens
 * in the Data Access Layer (src/lib/dal.ts) on every request.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    // Build the redirect from the public host so it works behind the
    // Codespaces port-forwarding proxy, not just on localhost.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    const url = new URL("/sign-in", host ? `${proto}://${host}` : request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/onboarding", "/w/:path*"],
};
