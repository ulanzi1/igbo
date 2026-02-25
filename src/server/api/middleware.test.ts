// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Rate limiter mock ────────────────────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
const mockBuildRateLimitHeaders = vi.fn();
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildRateLimitHeaders: (...args: unknown[]) => mockBuildRateLimitHeaders(...args),
}));

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
    vi.clearAllMocks();
    // Default: rate limiter allows the request
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
      limit: 10,
    });
    mockBuildRateLimitHeaders.mockReturnValue({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "9",
      "X-RateLimit-Reset": "9999999999",
    });
  });

  describe("success path", () => {
    it("passes request to handler and returns response", async () => {
      const handler = withApiHandler(async () => {
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
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
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
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
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

  describe("rate limiting", () => {
    const rateLimitOptions = {
      rateLimit: {
        key: () => "test-key",
        maxRequests: 10,
        windowMs: 60_000,
      },
    };

    it("passes through when allowed: true and adds X-RateLimit-* headers to success response", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60_000,
        limit: 10,
      });
      mockBuildRateLimitHeaders.mockReturnValue({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "9",
        "X-RateLimit-Reset": "9999999999",
      });

      const handler = withApiHandler(async () => {
        return Response.json({ data: { ok: true } });
      }, rateLimitOptions);

      const response = await handler(createRequest("GET"));

      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("9");
      expect(response.headers.get("X-RateLimit-Reset")).toBe("9999999999");
    });

    it("returns 429 RFC 7807 body when allowed: false", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        limit: 10,
      });
      mockBuildRateLimitHeaders.mockReturnValue({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "9999999999",
      });

      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      }, rateLimitOptions);

      const response = await handler(createRequest("GET"));
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
      expect(body.title).toBe("Too Many Requests");
      expect(body.status).toBe(429);
    });

    it("adds X-RateLimit-* headers to 429 response when rate limited", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        limit: 10,
      });
      mockBuildRateLimitHeaders.mockReturnValue({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "9999999999",
      });

      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      }, rateLimitOptions);

      const response = await handler(createRequest("GET"));

      expect(response.status).toBe(429);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Reset")).toBe("9999999999");
    });

    it("does NOT add rate limit headers when options.rateLimit is not set", async () => {
      const handler = withApiHandler(async () => {
        return Response.json({ data: {} });
      });

      const response = await handler(createRequest("GET"));

      expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
      expect(response.headers.get("X-RateLimit-Remaining")).toBeNull();
      expect(response.headers.get("X-RateLimit-Reset")).toBeNull();
    });

    it("adds X-RateLimit-* headers to non-429 error responses when rate limiting is enabled", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60_000,
        limit: 10,
      });
      mockBuildRateLimitHeaders.mockReturnValue({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "9",
        "X-RateLimit-Reset": "9999999999",
      });

      const handler = withApiHandler(async () => {
        throw new ApiError({ title: "Not Found", status: 404, detail: "Resource not found" });
      }, rateLimitOptions);

      const response = await handler(createRequest("GET"));

      expect(response.status).toBe(404);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("9");
      expect(response.headers.get("X-RateLimit-Reset")).toBe("9999999999");
    });

    it("adds X-RateLimit-* headers to 500 error responses when rate limiting is enabled", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 8,
        resetAt: Date.now() + 60_000,
        limit: 10,
      });
      mockBuildRateLimitHeaders.mockReturnValue({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "8",
        "X-RateLimit-Reset": "9999999999",
      });

      const handler = withApiHandler(async () => {
        throw new Error("Unexpected failure");
      }, rateLimitOptions);

      const response = await handler(createRequest("GET"));

      expect(response.status).toBe(500);
      expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("8");
      expect(response.headers.get("X-RateLimit-Reset")).toBe("9999999999");
    });

    it("calls key resolver with the request", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 60_000,
        limit: 10,
      });
      mockBuildRateLimitHeaders.mockReturnValue({});

      const keyResolver = vi.fn().mockReturnValue("resolved-key");
      const handler = withApiHandler(async () => Response.json({ data: {} }), {
        rateLimit: { key: keyResolver, maxRequests: 10, windowMs: 60_000 },
      });

      const request = createRequest("GET");
      await handler(request);

      expect(keyResolver).toHaveBeenCalledWith(request);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("resolved-key", 10, 60_000);
    });
  });
});
