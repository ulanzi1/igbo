import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api-error";
import { errorResponse } from "@/lib/api-response";
import { runWithContext } from "@/lib/request-context";

type RouteHandler = (request: Request) => Promise<Response>;

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

export function withApiHandler(handler: RouteHandler): RouteHandler {
  return async (request: Request): Promise<Response> => {
    const traceId =
      request.headers.get("X-Request-Id") ?? randomUUID();

    try {
      validateCsrf(request);

      const response = await runWithContext({ traceId }, () =>
        handler(request),
      );

      // Add traceId to response headers
      const headers = new Headers(response.headers);
      headers.set("X-Request-Id", traceId);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        const response = errorResponse(error.toProblemDetails());
        const headers = new Headers(response.headers);
        headers.set("X-Request-Id", traceId);
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }

      // Unknown error — never expose internals
      const response = errorResponse({
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
      });
      const headers = new Headers(response.headers);
      headers.set("X-Request-Id", traceId);
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }
  };
}
