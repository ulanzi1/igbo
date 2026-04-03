/**
 * Safari ITP Session Verification + Redirect Endpoint
 *
 * Safari ITP (Intelligent Tracking Prevention) caps first-party cookie lifetimes
 * to 7 days for domains the user hasn't interacted with recently. "Interaction"
 * means a user gesture OR a top-level navigation that sets cookies via HTTP response.
 *
 * This endpoint implements the redirect-based ITP workaround:
 * 1. Portal middleware redirects (top-level navigation) here when it detects a missing session
 * 2. This endpoint validates the JWT in the community-domain cookie
 * 3. If valid, it re-sets the cookie via HTTP 302 + Set-Cookie response
 * 4. Safari treats HTTP redirect + Set-Cookie as first-party interaction → 7-day timer resets
 * 5. Portal receives the redirect and the user is authenticated
 *
 * Why NOT fetch/XHR: Safari ITP blocks third-party cookie reading via fetch/XHR.
 * Only top-level navigation (redirect) can reliably set cookies cross-subdomain in Safari.
 *
 * Fallback: portal middleware includes _itp_refresh=1 in the returnTo URL on the first
 * redirect attempt. If this endpoint is unreachable or the community session is also gone,
 * the next portal request (with _itp_refresh=1 present) falls through to the login page.
 * This prevents infinite redirect loops.
 *
 * Future-proofing: If Apple further restricts ITP (e.g., blocking redirect-based cookie
 * setting), the fallback path will route through the normal login flow. A visible interstitial
 * page may be needed to satisfy ITP's "user gesture" requirement in a stricter future.
 *
 * NOTE: This is NOT under /api/v1/ — it is a custom auth helper alongside /api/auth/[...nextauth].
 * Do NOT use withApiHandler() here — this endpoint returns redirects (not JSON) and is
 * accessed by users who may have no valid session (userId-based rate limiting would fail).
 */
import { NextResponse, type NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import { checkRateLimit } from "@/lib/rate-limiter";

const COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token";

function getCommunityBaseUrl(): string {
  return process.env.COMMUNITY_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
}

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  // Fail-closed: AUTH_SECRET must be set for JWT decoding
  if (!process.env.AUTH_SECRET) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  // IP-based rate limiting: 10 req/min per IP (consistent with LOGIN preset behavior)
  const ip =
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    request.headers.get("X-Real-IP") ??
    "unknown";

  const rateLimit = await checkRateLimit(`rl:verify-session:${ip}`, 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return new NextResponse("Too Many Requests", { status: 429 });
  }

  const { searchParams } = request.nextUrl;
  const returnTo = searchParams.get("returnTo");

  // Missing returnTo: redirect to community home
  if (!returnTo) {
    return NextResponse.redirect(new URL("/", getCommunityBaseUrl()), { status: 302 });
  }

  // Validate returnTo is a well-formed URL with http(s) scheme (always — prevents open redirect)
  let returnToUrl: URL;
  try {
    returnToUrl = new URL(returnTo);
  } catch {
    return new NextResponse("Invalid returnTo URL", { status: 400 });
  }
  if (returnToUrl.protocol !== "https:" && returnToUrl.protocol !== "http:") {
    return new NextResponse("Invalid returnTo URL scheme", { status: 400 });
  }

  // When ALLOWED_ORIGINS is configured, enforce origin allowlist (production)
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length > 0) {
    if (!allowedOrigins.includes(returnToUrl.origin)) {
      return new NextResponse("Invalid returnTo origin", { status: 400 });
    }
  }

  // Try to read the session cookie from this request (community-domain cookie)
  const sessionToken =
    request.cookies.get(COOKIE_NAME)?.value ??
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    // No session cookie on community domain — redirect to login
    const loginUrl = new URL("/login", getCommunityBaseUrl());
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // Decode and validate the JWT
  let token: Awaited<ReturnType<typeof decode>>;
  try {
    token = await decode({
      token: sessionToken,
      secret: process.env.AUTH_SECRET!,
      salt: COOKIE_NAME,
    });
  } catch {
    // Malformed JWT — redirect to login
    const loginUrl = new URL("/login", getCommunityBaseUrl());
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  if (!token) {
    // Expired or invalid JWT — redirect to login
    const loginUrl = new URL("/login", getCommunityBaseUrl());
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // Valid session: redirect back to portal with Set-Cookie to reset Safari ITP timer
  //
  // Re-setting the cookie via HTTP 302 + Set-Cookie counts as a "first-party interaction"
  // on the community domain, resetting Safari's 7-day ITP cap. The JWT value itself is
  // unchanged — we only re-issue the cookie wrapper to reset the browser's ITP timer.
  const response = NextResponse.redirect(returnTo, { status: 302 });

  const cookieParts = [
    `${COOKIE_NAME}=${sessionToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${process.env.SESSION_TTL_SECONDS ?? "86400"}`,
  ];
  if (process.env.NODE_ENV === "production") {
    cookieParts.push("Secure");
  }
  if (process.env.COOKIE_DOMAIN) {
    cookieParts.push(`Domain=${process.env.COOKIE_DOMAIN}`);
  }
  response.headers.set("Set-Cookie", cookieParts.join("; "));

  return response;
}
