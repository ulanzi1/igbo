import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

// Public routes that pass through without auth check
const PUBLIC_PATHS = new Set([
  "/",
  "/api/auth",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

const COMMUNITY_BASE_URL = process.env.AUTH_URL ?? "http://localhost:3000";

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function middleware(request: NextRequest) {
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

  if (isPublicPath(pathname)) {
    return NextResponse.next({ headers: responseHeaders });
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
    const loginUrl = new URL("/login", COMMUNITY_BASE_URL);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
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
    // Malformed JWT — redirect to login
    const loginUrl = new URL("/login", COMMUNITY_BASE_URL);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  if (!token) {
    // Expired or invalid JWT
    const loginUrl = new URL("/login", COMMUNITY_BASE_URL);
    loginUrl.searchParams.set("returnTo", request.nextUrl.href);
    return NextResponse.redirect(loginUrl);
  }

  // Check account status
  const accountStatus = token.accountStatus as string | undefined;

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

  return NextResponse.next({ headers: responseHeaders });
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
