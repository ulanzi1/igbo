import { decode } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { routing } from "./i18n/routing";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";
import { getActiveSuspension } from "@/db/queries/member-discipline";

export const runtime = "nodejs";

const handleI18nRouting = createMiddleware(routing);

/**
 * Public paths that do not require authentication.
 * Maps to routes under (guest) and (auth) route groups.
 * All other locale-prefixed paths are treated as protected.
 */
const PUBLIC_PATH_PATTERNS = [
  // Guest pages
  /^\/[^/]+\/?$/, // Root / splash page: /en, /ig, /en/
  /^\/[^/]+\/(about|articles|events|blog|apply|terms|privacy)(\/|$)/,
  // Auth pages
  /^\/[^/]+\/(login|register|forgot-password|reset-password|verify|2fa-setup|suspended)(\/|$)/,
  // Offline page
  /^\/[^/]+\/~offline(\/|$)/,
];

const AUTH_PATH_PATTERN =
  /^\/[^/]+\/(login|register|forgot-password|reset-password|verify|2fa-setup)(\/|$)/;
const ONBOARDING_PATTERN = /^\/[^/]+\/onboarding(\/|$)/;
const ADMIN_PATTERN = /^\/[^/]+\/admin(\/|$)/;
const MAINTENANCE_PAGE_PATTERN = /^\/[^/]+\/maintenance(\/|$)/;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATH_PATTERN.test(pathname);
}

function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATTERN.test(pathname);
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATTERN.test(pathname);
}

function isMaintenancePage(pathname: string): boolean {
  return MAINTENANCE_PAGE_PATTERN.test(pathname);
}

function hasSessionCookie(request: NextRequest): boolean {
  return !!(
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token")
  );
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const { pathname: checkPathname } = request.nextUrl;

  // Maintenance mode — env var check (O(1), no Redis/DB).
  // Exempt: admin routes and the maintenance page itself.
  if (process.env.MAINTENANCE_MODE === "true") {
    if (!isAdminPath(checkPathname) && !isMaintenancePage(checkPathname)) {
      const locale = checkPathname.split("/")[1] ?? "en";
      const maintenanceUrl = new URL(`/${locale}/maintenance`, request.url);
      const response = NextResponse.redirect(maintenanceUrl, { status: 307 });
      response.headers.set("Retry-After", "3600");
      return response;
    }
  }

  // Extract real client IP from Cloudflare or proxy headers for IP-based rate limiting
  const clientIp =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Real-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
  requestHeaders.set("X-Client-IP", clientIp);

  // Ensure X-Request-Id is present for downstream tracing
  if (!requestHeaders.has("X-Request-Id")) {
    requestHeaders.set("X-Request-Id", crypto.randomUUID());
  }

  const requestId = requestHeaders.get("X-Request-Id")!;

  const { pathname } = request.nextUrl;
  const hasLocalePrefix = routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  // Reverse auth: redirect authenticated users away from auth pages to dashboard
  if (hasLocalePrefix && isAuthPath(pathname) && hasSessionCookie(request)) {
    const locale = pathname.split("/")[1];
    const response = NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  // Auth protection: redirect unauthenticated users from protected routes to login
  if (hasLocalePrefix && !isPublicPath(pathname) && !hasSessionCookie(request)) {
    const locale = pathname.split("/")[1];
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  // Onboarding gate: APPROVED members who haven't completed their profile
  // must complete onboarding before accessing any protected (app) route.
  // Uses next-auth/jwt decode (Edge-compatible) — does NOT import full auth config.
  if (
    hasLocalePrefix &&
    !isPublicPath(pathname) &&
    !isOnboardingPath(pathname) &&
    !isAdminPath(pathname) &&
    hasSessionCookie(request)
  ) {
    const cookieName =
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token";
    const rawToken = request.cookies.get(cookieName)?.value;

    if (rawToken && process.env.AUTH_SECRET) {
      const decoded = await decode({
        token: rawToken,
        secret: process.env.AUTH_SECRET,
        salt: cookieName,
      });
      // membershipTier is available at decoded.membershipTier for client-side checks;
      // tier enforcement is handled at the PermissionService level, not in middleware.
      if (decoded?.accountStatus === "BANNED") {
        const locale = pathname.split("/")[1];
        const loginUrl = new URL(`/${locale}/login`, request.url);
        loginUrl.searchParams.set("banned", "true");
        const response = NextResponse.redirect(loginUrl);
        response.headers.set("X-Request-Id", requestId);
        return response;
      }
      if (decoded?.accountStatus === "SUSPENDED") {
        if (!pathname.includes("/suspended")) {
          const locale = pathname.split("/")[1];
          const suspendedUrl = new URL(`/${locale}/suspended`, request.url);
          // Bug fix: fetch suspension details to populate countdown and reason
          try {
            const suspension = await getActiveSuspension(decoded.id as string);
            if (suspension?.suspensionEndsAt) {
              suspendedUrl.searchParams.set("until", suspension.suspensionEndsAt.toISOString());
            }
            if (suspension?.reason) {
              suspendedUrl.searchParams.set("reason", suspension.reason);
            }
          } catch {
            // Non-critical — redirect without params if DB unavailable
          }
          const response = NextResponse.redirect(suspendedUrl);
          response.headers.set("X-Request-Id", requestId);
          return response;
        }
      }
      // Stale JWT guard: JWT accountStatus may be APPROVED but DB may say SUSPENDED/BANNED
      // (happens when admin suspends/bans a user who is already logged in)
      if (decoded?.accountStatus === "APPROVED" && decoded?.id) {
        try {
          const [currentUser] = await db
            .select({ accountStatus: authUsers.accountStatus })
            .from(authUsers)
            .where(eq(authUsers.id, decoded.id as string))
            .limit(1);
          if (currentUser?.accountStatus === "SUSPENDED" && !pathname.includes("/suspended")) {
            const locale = pathname.split("/")[1];
            const suspendedUrl = new URL(`/${locale}/suspended`, request.url);
            const suspension = await getActiveSuspension(decoded.id as string);
            if (suspension?.suspensionEndsAt) {
              suspendedUrl.searchParams.set("until", suspension.suspensionEndsAt.toISOString());
            }
            if (suspension?.reason) {
              suspendedUrl.searchParams.set("reason", suspension.reason);
            }
            const response = NextResponse.redirect(suspendedUrl);
            response.headers.set("X-Request-Id", requestId);
            return response;
          }
          if (currentUser?.accountStatus === "BANNED") {
            const locale = pathname.split("/")[1];
            const loginUrl = new URL(`/${locale}/login`, request.url);
            loginUrl.searchParams.set("banned", "true");
            const response = NextResponse.redirect(loginUrl);
            response.headers.set("X-Request-Id", requestId);
            return response;
          }
          if (
            currentUser?.accountStatus === "PENDING_DELETION" ||
            currentUser?.accountStatus === "ANONYMIZED"
          ) {
            const locale = pathname.split("/")[1];
            const loginUrl = new URL(`/${locale}/login`, request.url);
            const response = NextResponse.redirect(loginUrl);
            response.headers.set("X-Request-Id", requestId);
            return response;
          }
        } catch {
          // Non-critical — continue with JWT-derived status if DB unavailable
        }
      }
      if (decoded?.accountStatus === "APPROVED" && decoded?.profileCompleted === false) {
        const locale = pathname.split("/")[1];
        const response = NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url));
        response.headers.set("X-Request-Id", requestId);
        return response;
      }
    }
  }

  // Pass enriched request so X-Request-Id is forwarded to route handlers and RSCs
  const enrichedRequest = new NextRequest(request, { headers: requestHeaders });
  const response = handleI18nRouting(enrichedRequest);

  // Echo X-Request-Id in response headers for client-side correlation
  response.headers.set("X-Request-Id", requestId);

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
