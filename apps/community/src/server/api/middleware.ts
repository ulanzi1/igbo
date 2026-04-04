import "server-only";
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { ApiError } from "@/lib/api-error";
import { errorResponse } from "@/lib/api-response";
import { getRequestContext, runWithContext } from "@/lib/request-context";
import { logger } from "@/lib/logger";
import { httpDuration, httpRequestsTotal, appErrorsTotal } from "@/lib/metrics";
import { env } from "@/env";
import type { RateLimitResult } from "@/lib/rate-limiter";

type RouteHandler = (request: Request) => Promise<Response>;

interface ApiHandlerOptions {
  /** Skip CSRF Origin/Host validation for ALL mutating methods (POST, PATCH, PUT, DELETE).
   * Use ONLY for machine-to-machine endpoints (e.g. inbound webhook routes from external
   * systems that cannot supply a browser Origin header). Never use on user-facing routes.
   * The endpoint must use its own authentication mechanism (e.g. HMAC signature). */
  skipCsrf?: boolean;
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
    // Secondary allow-list: accept cross-subdomain origins explicitly configured via ALLOWED_ORIGINS.
    // Compare parsed hosts (not full URLs) to prevent misconfiguration-based bypasses
    // (e.g. ALLOWED_ORIGINS="https://job.igbo.com" must also match "http://job.igbo.com").
    const allowedHosts = (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => {
        try {
          return new URL(s.trim()).host;
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    if (!allowedHosts.includes(originHost)) {
      throw new ApiError({
        title: "Forbidden",
        status: 403,
        detail: "CSRF validation failed: Origin does not match Host",
      });
    }
  }
}

export function normalizeRoute(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}

/**
 * Paths exempt from maintenance mode blocking in the API handler.
 * These must remain accessible during maintenance.
 */
const MAINTENANCE_EXEMPT_PATHS = new Set(["/api/v1/health", "/api/v1/maintenance-status"]);

export function withApiHandler(handler: RouteHandler, options?: ApiHandlerOptions): RouteHandler {
  return async (request: Request): Promise<Response> => {
    const traceId = request.headers.get("X-Request-Id") ?? randomUUID();
    const startTime = Date.now();

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
      // Maintenance mode check — env var approach (O(1), zero failure modes)
      if (process.env.MAINTENANCE_MODE === "true") {
        // ci-allow-process-env — runtime flag set by admin maintenance route
        const pathname = new URL(request.url).pathname;
        const isExempt = MAINTENANCE_EXEMPT_PATHS.has(pathname);
        if (!isExempt) {
          const maintenanceResponse = errorResponse({
            type: "https://httpstatuses.io/503",
            title: "Service Unavailable",
            status: 503,
            detail:
              "The platform is currently undergoing scheduled maintenance. Please try again later.",
          });
          return new Response(maintenanceResponse.body, {
            status: 503,
            headers: {
              ...Object.fromEntries(maintenanceResponse.headers.entries()),
              "Retry-After": "3600",
            },
          });
        }
      }

      if (!options?.skipCsrf) {
        validateCsrf(request);
      }

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

      // Record HTTP metrics
      const route = normalizeRoute(new URL(request.url).pathname);
      const durationSeconds = (Date.now() - startTime) / 1000;
      httpDuration.observe(
        { method: request.method, route, status_code: String(response.status) },
        durationSeconds,
      );
      httpRequestsTotal.inc({
        method: request.method,
        route,
        status_code: String(response.status),
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        const errResponse = errorResponse(error.toProblemDetails());
        // Record HTTP metrics for API errors
        const route = normalizeRoute(new URL(request.url).pathname);
        const durationSeconds = (Date.now() - startTime) / 1000;
        httpDuration.observe(
          { method: request.method, route, status_code: String(errResponse.status) },
          durationSeconds,
        );
        httpRequestsTotal.inc({
          method: request.method,
          route,
          status_code: String(errResponse.status),
        });
        return new Response(errResponse.body, {
          status: errResponse.status,
          headers: enrichHeaders(errResponse.headers),
        });
      }

      // Unknown error — capture in Sentry + log server-side
      if (env.SENTRY_DSN) {
        const userId = getRequestContext()?.userId;
        Sentry.captureException(error, {
          tags: { traceId },
          user: userId ? { id: userId } : undefined,
        });
      }
      appErrorsTotal.inc({ type: "api" });
      logger.error("unhandled_route_error", { error, traceId });

      // Record HTTP metrics for 500 errors
      const route = normalizeRoute(new URL(request.url).pathname);
      const durationSeconds = (Date.now() - startTime) / 1000;
      httpDuration.observe({ method: request.method, route, status_code: "500" }, durationSeconds);
      httpRequestsTotal.inc({ method: request.method, route, status_code: "500" });

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
