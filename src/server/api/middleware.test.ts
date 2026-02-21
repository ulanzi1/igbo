// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withApiHandler } from "./middleware";
import { ApiError } from "@/lib/api-error";
import { getRequestContext } from "@/lib/request-context";

function createRequest(
  method: string = "GET",
  options: {
    headers?: Record<string, string>;
    url?: string;
  } = {},
): Request {
  const url = options.url ?? "http://localhost:3000/api/v1/test";
  return new Request(url, {
    method,
    headers: new Headers({
      Host: "localhost:3000",
      ...options.headers,
    }),
  });
}

describe("withApiHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("success path", () => {
    it("passes request to handler and returns response", async () => {
      const handler = withApiHandler(async (req) => {
        return Response.json({ data: { message: "ok" } });
      });

      const request = createRequest();
      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ data: { message: "ok" } });
    });

    it("sets up request context with traceId from X-Request-Id header", async () => {
      let capturedTraceId: string | undefined;

      const handler = withApiHandler(async () => {
        const ctx = getRequestContext();
        capturedTraceId = ctx?.traceId;
        return Response.json({ data: {} });
      });

      const request = createRequest("GET", {
        headers: { "X-Request-Id": "custom-trace-abc" },
      });
      await handler(request);

      expect(capturedTraceId).toBe("custom-trace-abc");
    });

    it("generates UUID traceId when X-Request-Id is not present", async () => {
      let capturedTraceId: string | undefined;

      const handler = withApiHandler(async () => {
        const ctx = getRequestContext();
        capturedTraceId = ctx?.traceId;
        return Response.json({ data: {} });
      });

      const request = createRequest();
      await handler(request);

      expect(capturedTraceId).toBeDefined();
      // UUID v4 format
      expect(capturedTraceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
  });

  describe("ApiError handling", () => {
    it("converts ApiError to RFC 7807 response", async () => {
      const handler = withApiHandler(async () => {
        throw new ApiError({
          type: "https://example.com/not-found",
          title: "Not Found",
          status: 404,
          detail: "Resource not found",
        });
      });

      const request = createRequest();
      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe(
        "application/problem+json",
      );
      expect(body).toEqual({
        type: "https://example.com/not-found",
        title: "Not Found",
        status: 404,
        detail: "Resource not found",
      });
    });
  });

  describe("unknown error handling", () => {
    it("converts unknown errors to 500 Problem Details without exposing internals", async () => {
      const handler = withApiHandler(async () => {
        throw new Error("Database connection failed");
      });

      const request = createRequest();
      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(response.headers.get("Content-Type")).toBe(
        "application/problem+json",
      );
      expect(body.title).toBe("Internal Server Error");
      expect(body.status).toBe(500);
      // Must not expose the actual error message
      expect(body.detail).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("Database connection failed");
    });
  });

  describe("CSRF validation", () => {
    it("allows GET requests without Origin header", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("GET");
      const response = await handler(request);
      expect(response.status).toBe(200);
    });

    it("allows POST requests with matching Origin", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: { created: true } });
      });

      const request = createRequest("POST", {
        headers: { Origin: "http://localhost:3000" },
      });
      const response = await handler(request);
      expect(response.status).toBe(200);
    });

    it("rejects POST requests with mismatched Origin", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("POST", {
        headers: { Origin: "http://evil.com" },
      });
      const response = await handler(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.title).toBe("Forbidden");
      expect(body.detail).toContain("CSRF");
    });

    it("rejects PATCH requests with mismatched Origin", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("PATCH", {
        headers: { Origin: "http://evil.com" },
      });
      const response = await handler(request);
      expect(response.status).toBe(403);
    });

    it("rejects DELETE requests with mismatched Origin", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("DELETE", {
        headers: { Origin: "http://evil.com" },
      });
      const response = await handler(request);
      expect(response.status).toBe(403);
    });

    it("ignores X-Forwarded-Host for CSRF (can be forged by clients)", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      // Attacker forges X-Forwarded-Host to match their Origin — must be rejected
      const request = createRequest("POST", {
        headers: {
          Origin: "http://evil.com",
          "X-Forwarded-Host": "evil.com",
        },
      });
      const response = await handler(request);
      expect(response.status).toBe(403);
    });

    it("rejects PUT requests with mismatched Origin", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("PUT", {
        headers: { Origin: "http://evil.com" },
      });
      const response = await handler(request);
      expect(response.status).toBe(403);
    });

    it("rejects POST requests without Origin header", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("POST");
      const response = await handler(request);
      expect(response.status).toBe(403);
    });
  });

  describe("request tracing", () => {
    it("includes X-Request-Id in the response", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const request = createRequest("GET", {
        headers: { "X-Request-Id": "trace-response-test" },
      });
      const response = await handler(request);

      expect(response.headers.get("X-Request-Id")).toBe("trace-response-test");
    });
  });
});
