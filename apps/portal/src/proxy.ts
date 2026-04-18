import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Create the i18n routing handler once at module scope
const handleI18nRouting = createIntlMiddleware(routing);

// Locale-aware public path pattern:
// Matches: /, /en, /ig, /en/jobs, /ig/jobs, /en/jobs/[id], /en/search, /ig/search, /en/apprenticeships, etc.
const PUBLIC_PATH_PATTERN = /^\/(?:en|ig)(?:\/jobs(?:\/[^/]+)?|\/search|\/apprenticeships)?$/;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/api/auth/")) return true;
  return PUBLIC_PATH_PATTERN.test(pathname);
}

const COMMUNITY_BASE_URL =
  process.env.COMMUNITY_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Safari ITP workaround: on the first unauthenticated attempt, redirect to
 * the community verify-session endpoint instead of the login page. The
 * verify-session endpoint re-sets the session cookie via HTTP 302 + Set-Cookie,
 * which counts as a first-party interaction and resets Safari's 7-day ITP timer.
 *
 * To prevent infinite redirect loops, the returnTo URL includes `_itp_refresh=1`.
 * If the middleware sees `_itp_refresh=1` already present, the refresh was already
 * attempted and failed — fall through to the login page.
 */
function itpRefreshOrLogin(request: NextRequest): NextResponse {
  const hasRefreshed = request.nextUrl.searchParams.get("_itp_refresh") === "1";

  if (hasRefreshed) {
    // Second attempt — refresh already tried, fall back to login
    const loginUrl = new URL("/login", COMMUNITY_BASE_URL);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  // First attempt — redirect to verify-session with _itp_refresh=1 in callbackUrl
  const returnToUrl = new URL(request.nextUrl.href);
  returnToUrl.searchParams.set("_itp_refresh", "1");

  const verifyUrl = new URL("/api/auth/verify-session", COMMUNITY_BASE_URL);
  verifyUrl.searchParams.set("callbackUrl", returnToUrl.href);
  return NextResponse.redirect(verifyUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fail-closed: AUTH_SECRET must be set for JWT decoding
  if (!process.env.AUTH_SECRET) {
    return new NextResponse("Server configuration error", { status: 500 });
  }

  // Add request tracing headers
  const requestId = request.headers.get("X-Request-Id") ?? crypto.randomUUID();
  const clientIp =
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    request.headers.get("X-Real-IP") ??
    "unknown";

  const responseHeaders = new Headers();
  responseHeaders.set("X-Request-Id", requestId);
  responseHeaders.set("X-Client-IP", clientIp);

  // CORS: allow configured cross-subdomain origins (e.g. community app)
  const origin = request.headers.get("Origin");
  if (origin) {
    const allowedOrigins = getAllowedOrigins();
    if (allowedOrigins.includes(origin)) {
      responseHeaders.set("Access-Control-Allow-Origin", origin);
      responseHeaders.set("Access-Control-Allow-Credentials", "true");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: responseHeaders });
  }

  // API routes bypass i18n routing entirely — they handle their own auth
  if (pathname.startsWith("/api/")) {
    const response = NextResponse.next({ headers: responseHeaders });
    return response;
  }

  if (isPublicPath(pathname)) {
    // Public paths still need locale routing for cookie detection
    const intlResponse = handleI18nRouting(request);
    // Propagate tracing headers to i18n response
    responseHeaders.forEach((value, key) => {
      intlResponse.headers.set(key, value);
    });
    return intlResponse;
  }

  // Determine cookie name based on environment
  const cookieName =
    process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

  const sessionToken =
    request.cookies.get(cookieName)?.value ??
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    return itpRefreshOrLogin(request);
  }

  // Decode and validate JWT
  let token: Awaited<ReturnType<typeof decode>>;
  try {
    token = await decode({
      token: sessionToken,
      secret: process.env.AUTH_SECRET!,
      salt: cookieName,
    });
  } catch {
    // Malformed JWT — try ITP refresh before falling back to login
    return itpRefreshOrLogin(request);
  }

  if (!token) {
    // Expired or invalid JWT — try ITP refresh before falling back to login
    return itpRefreshOrLogin(request);
  }

  // Check account status
  const accountStatus = (token as Record<string, unknown>).accountStatus as string | undefined;

  if (accountStatus === "BANNED") {
    const loginUrl = new URL("/login", COMMUNITY_BASE_URL);
    loginUrl.searchParams.set("banned", "true");
    return NextResponse.redirect(loginUrl);
  }

  if (accountStatus === "SUSPENDED") {
    // Redirect to community /suspended — community middleware enriches URL with expiry/reason
    const suspendedUrl = new URL("/suspended", COMMUNITY_BASE_URL);
    return NextResponse.redirect(suspendedUrl);
  }

  if (accountStatus === "PENDING_DELETION" || accountStatus === "ANONYMIZED") {
    const loginUrl = new URL("/login", COMMUNITY_BASE_URL);
    return NextResponse.redirect(loginUrl);
  }

  // Strip _itp_refresh param from URL after successful auth (clean bookmarks/analytics)
  if (request.nextUrl.searchParams.has("_itp_refresh")) {
    const cleanUrl = new URL(request.nextUrl.href);
    cleanUrl.searchParams.delete("_itp_refresh");
    return NextResponse.redirect(cleanUrl);
  }

  // Authenticated: run locale routing, then propagate CORS/tracing headers
  const intlResponse = handleI18nRouting(request);
  responseHeaders.forEach((value, key) => {
    intlResponse.headers.set(key, value);
  });
  return intlResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
