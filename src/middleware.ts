import { decode } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

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
  /^\/[^/]+\/(login|register|forgot-password|reset-password|verify|2fa-setup)(\/|$)/,
  // Offline page
  /^\/[^/]+\/~offline(\/|$)/,
];

const ONBOARDING_PATTERN = /^\/[^/]+\/onboarding(\/|$)/;
const ADMIN_PATTERN = /^\/[^/]+\/admin(\/|$)/;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATTERN.test(pathname);
}

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATTERN.test(pathname);
}

function hasSessionCookie(request: NextRequest): boolean {
  return !!(
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token")
  );
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Ensure X-Request-Id is present for downstream tracing
  if (!requestHeaders.has("X-Request-Id")) {
    requestHeaders.set("X-Request-Id", crypto.randomUUID());
  }

  const requestId = requestHeaders.get("X-Request-Id")!;

  const { pathname } = request.nextUrl;
  const hasLocalePrefix = routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

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
