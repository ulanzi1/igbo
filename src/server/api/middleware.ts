import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-error";
import { errorResponse } from "@/lib/api-response";
import { runWithContext } from "@/lib/request-context";
import type { RateLimitResult } from "@/lib/rate-limiter";

type RouteHandler = (request: Request) => Promise<Response>;

interface ApiHandlerOptions {
  rateLimit?: {
    key: (request: Request) => string | Promise<string>;
    maxRequests: number;
    windowMs: number;
  };
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function validateCsrf(request: Request): void {
  if (!MUTATING_METHODS.has(request.method)) {
    return;
  }

  const origin = request.headers.get("Origin");
  if (!origin) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "CSRF validation failed: missing Origin header",
    });
  }

  // Use only the Host header for CSRF validation.
  // X-Forwarded-Host is intentionally excluded here: it can be set by any
  // client via fetch() custom headers and would allow a CSRF bypass where an
  // attacker sends matching Origin + X-Forwarded-Host values.
  // Infrastructure-level proxies should rewrite Host before forwarding.
  const host = request.headers.get("Host");

  if (!host) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "CSRF validation failed: missing Host header",
    });
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "CSRF validation failed: invalid Origin header",
    });
  }

  if (originHost !== host) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "CSRF validation failed: Origin does not match Host",
    });
  }
}

export function withApiHandler(handler: RouteHandler, options?: ApiHandlerOptions): RouteHandler {
  return async (request: Request): Promise<Response> => {
    const traceId = request.headers.get("X-Request-Id") ?? randomUUID();

    let rateLimitResult: RateLimitResult | undefined;
    let buildRateLimitHeadersFn: ((r: RateLimitResult) => Record<string, string>) | undefined;

    function enrichHeaders(baseHeaders: Headers): Headers {
      const headers = new Headers(baseHeaders);
      headers.set("X-Request-Id", traceId);
      if (rateLimitResult && buildRateLimitHeadersFn) {
        const rlHeaders = buildRateLimitHeadersFn(rateLimitResult);
        for (const [k, v] of Object.entries(rlHeaders)) headers.set(k, v);
      }
      return headers;
    }

    try {
      validateCsrf(request);

      if (options?.rateLimit) {
        const rl = await import("@/lib/rate-limiter");
        buildRateLimitHeadersFn = rl.buildRateLimitHeaders;
        const key = await options.rateLimit.key(request);
        rateLimitResult = await rl.checkRateLimit(
          key,
          options.rateLimit.maxRequests,
          options.rateLimit.windowMs,
        );
        if (!rateLimitResult.allowed) {
          throw new ApiError({
            title: "Too Many Requests",
            status: 429,
            detail: "Rate limit exceeded. Please try again later.",
          });
        }
      }

      const response = await runWithContext({ traceId }, () => handler(request));

      const headers = enrichHeaders(response.headers);
      // Prevent browser/SW caching of API responses — data must always be fresh
      if (!headers.has("Cache-Control")) {
        headers.set("Cache-Control", "no-store");
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        const errResponse = errorResponse(error.toProblemDetails());
        return new Response(errResponse.body, {
          status: errResponse.status,
          headers: enrichHeaders(errResponse.headers),
        });
      }

      // Unknown error — never expose internals
      const errResponse = errorResponse({
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
      });
      return new Response(errResponse.body, {
        status: errResponse.status,
        headers: enrichHeaders(errResponse.headers),
      });
    }
  };
}
