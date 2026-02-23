import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Ensure X-Request-Id is present for downstream tracing
  if (!requestHeaders.has("X-Request-Id")) {
    requestHeaders.set("X-Request-Id", crypto.randomUUID());
  }

  const requestId = requestHeaders.get("X-Request-Id")!;

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
