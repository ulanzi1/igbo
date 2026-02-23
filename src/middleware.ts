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
  /^\/[^/]+\/(login|register|forgot-password|reset-password|verify)(\/|$)/,
  // Offline page
  /^\/[^/]+\/~offline(\/|$)/,
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Ensure X-Request-Id is present for downstream tracing
  if (!requestHeaders.has("X-Request-Id")) {
    requestHeaders.set("X-Request-Id", crypto.randomUUID());
  }

  const requestId = requestHeaders.get("X-Request-Id")!;

  // Guest route protection: redirect unauthenticated users from protected routes
  const { pathname } = request.nextUrl;
  const hasLocalePrefix = routing.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (hasLocalePrefix && !isPublicPath(pathname)) {
    // Extract locale from path
    const locale = pathname.split("/")[1];
    const redirectUrl = new URL(`/${locale}`, request.url);
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set("X-Request-Id", requestId);
    return response;
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
