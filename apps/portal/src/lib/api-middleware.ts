import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "./api-error";
import { errorResponse } from "./api-response";

interface ApiHandlerOptions {
  /** Skip CSRF Origin/Host validation for ALL mutating methods (POST, PATCH, PUT, DELETE).
   * Use ONLY for machine-to-machine endpoints (e.g. inbound webhook routes from external
   * systems that cannot supply a browser Origin header). Never use on user-facing routes.
   * The endpoint must use its own authentication mechanism (e.g. HMAC signature). */
  skipCsrf?: boolean;
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
    // (e.g. ALLOWED_ORIGINS="https://jobs.igbo.com" must also match "http://jobs.igbo.com").
    // portal has no @/env module; follows @igbo/auth pattern of direct process.env reads
    const allowedHosts = (process.env.ALLOWED_ORIGINS ?? "") // ci-allow-process-env
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

export function withApiHandler(
  handler: (req: Request) => Promise<Response>,
  options?: ApiHandlerOptions,
): (req: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const traceId = request.headers.get("X-Request-Id") ?? randomUUID();

    function enrichHeaders(baseHeaders: Headers): Headers {
      const headers = new Headers(baseHeaders);
      headers.set("X-Request-Id", traceId);
      return headers;
    }

    try {
      if (!options?.skipCsrf) {
        validateCsrf(request);
      }

      const response = await handler(request);

      const headers = enrichHeaders(response.headers);
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
