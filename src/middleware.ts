import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // Ensure X-Request-Id is present for downstream tracing
  if (!requestHeaders.has("X-Request-Id")) {
    requestHeaders.set("X-Request-Id", randomUUID());
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Echo X-Request-Id in the response for client-side correlation
  response.headers.set(
    "X-Request-Id",
    requestHeaders.get("X-Request-Id")!,
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
