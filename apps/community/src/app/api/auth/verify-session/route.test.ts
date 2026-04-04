// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Env mock ────────────────────────────────────────────────────────────────
const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, string | undefined> = {
    NODE_ENV: "test",
    AUTH_SECRET: "test-secret-32-bytes-long-minimum-for-hs256",
    COMMUNITY_URL: "http://localhost:3000",
  };
  return { mockEnv };
});
vi.mock("@/env", () => ({
  get env() {
    return mockEnv;
  },
}));

// ─── Mock next-auth/jwt ───────────────────────────────────────────────────────
const mockDecode = vi.fn();

vi.mock("next-auth/jwt", () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}));

// ─── Mock rate-limiter ────────────────────────────────────────────────────────
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

function makeRequest(
  url: string,
  options: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Request {
  const req = new Request(url, {
    method: "GET",
    headers: options.headers ?? {},
  }) as unknown as Request & {
    cookies: { get: (name: string) => { name: string; value: string } | undefined };
    nextUrl: URL;
  };

  Object.defineProperty(req, "nextUrl", {
    get: () => new URL(url),
    configurable: true,
  });

  const cookieMap = new Map(Object.entries(options.cookies ?? {}));
  Object.defineProperty(req, "cookies", {
    get: () => ({
      get: (name: string) =>
        cookieMap.has(name) ? { name, value: cookieMap.get(name) } : undefined,
    }),
    configurable: true,
  });

  return req as unknown as Request;
}

import { GET } from "./route";
import type { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.AUTH_SECRET = "test-secret-32-bytes-long-minimum-for-hs256";
  mockEnv.COMMUNITY_URL = "http://localhost:3000";
  mockEnv.NODE_ENV = "test";
  delete mockEnv.ALLOWED_ORIGINS;
  delete mockEnv.COOKIE_DOMAIN;
  delete mockEnv.SESSION_TTL_SECONDS;
  // Default: rate limit allows
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60000,
    limit: 10,
  });
});

describe("GET /api/auth/verify-session", () => {
  describe("AUTH_SECRET guard", () => {
    it("returns 500 when AUTH_SECRET is not set", async () => {
      delete mockEnv.AUTH_SECRET;
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(500);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60000,
        limit: 10,
      });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(429);
    });

    it("uses IP from X-Forwarded-For header for rate limit key", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        {
          cookies: { "authjs.session-token": "valid-token" },
          headers: { "X-Forwarded-For": "1.2.3.4, 5.6.7.8" },
        },
      );
      await GET(req as unknown as NextRequest);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("rl:verify-session:1.2.3.4", 10, 60000);
    });
  });

  describe("missing returnTo", () => {
    it("redirects to community home when returnTo is absent", async () => {
      const req = makeRequest("http://localhost:3000/api/auth/verify-session");
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(302);
      const location = result.headers.get("Location") ?? "";
      expect(location).toBe("http://localhost:3000/");
    });
  });

  describe("returnTo validation", () => {
    it("returns 400 when returnTo origin is not in ALLOWED_ORIGINS", async () => {
      mockEnv.ALLOWED_ORIGINS = "http://localhost:3001";
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://evil.com/steal",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(400);
    });

    it("returns 400 when returnTo is a malformed URL (when ALLOWED_ORIGINS is set)", async () => {
      mockEnv.ALLOWED_ORIGINS = "http://localhost:3001";
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=not-a-valid-url",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(400);
    });

    it("returns 400 for javascript: scheme returnTo even without ALLOWED_ORIGINS", async () => {
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=javascript:alert(1)",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(400);
    });

    it("returns 400 for malformed returnTo URL even without ALLOWED_ORIGINS", async () => {
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=not-a-valid-url",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(400);
    });

    it("allows any returnTo when ALLOWED_ORIGINS is not set (dev mode)", async () => {
      // No ALLOWED_ORIGINS set — skip validation (dev-friendly)
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      // Should proceed normally (not 400)
      expect(result.status).not.toBe(400);
    });
  });

  describe("no session cookie on community domain", () => {
    it("redirects to login when no session cookie is present", async () => {
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(302);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
      expect(location).toContain("returnTo=");
    });
  });

  describe("invalid/expired session", () => {
    it("redirects to login when decode returns null (expired JWT)", async () => {
      mockDecode.mockResolvedValue(null);
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "expired-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(302);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
      expect(location).toContain("returnTo=");
    });

    it("redirects to login when decode throws (malformed JWT)", async () => {
      mockDecode.mockRejectedValue(new Error("Invalid JWT"));
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "malformed-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(302);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
    });
  });

  describe("valid session — ITP cookie refresh", () => {
    it("redirects to returnTo with Set-Cookie header for valid session", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      expect(result.status).toBe(302);
      const location = result.headers.get("Location") ?? "";
      expect(location).toBe("http://localhost:3001/dashboard");
    });

    it("includes Set-Cookie header to reset Safari ITP timer", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      const setCookie = result.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain("authjs.session-token=valid-token");
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
    });

    it("includes Max-Age=86400 (default SESSION_TTL_SECONDS) in Set-Cookie", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      const setCookie = result.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain("Max-Age=86400");
    });

    it("includes Domain in Set-Cookie when COOKIE_DOMAIN is set", async () => {
      mockEnv.COOKIE_DOMAIN = ".igbo.com";
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      const setCookie = result.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain("Domain=.igbo.com");
    });

    it("does not include Domain in Set-Cookie when COOKIE_DOMAIN is not set", async () => {
      delete mockEnv.COOKIE_DOMAIN;
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      const setCookie = result.headers.get("Set-Cookie") ?? "";
      expect(setCookie).not.toContain("Domain=");
    });

    it("passes correct cookie name and salt to decode()", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      await GET(req as unknown as NextRequest);
      expect(mockDecode).toHaveBeenCalledWith({
        token: "valid-token",
        secret: "test-secret-32-bytes-long-minimum-for-hs256",
        salt: "authjs.session-token",
      });
    });

    it("respects SESSION_TTL_SECONDS env var in Set-Cookie Max-Age", async () => {
      mockEnv.SESSION_TTL_SECONDS = "7200";
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest(
        "http://localhost:3000/api/auth/verify-session?returnTo=http://localhost:3001/dashboard",
        { cookies: { "authjs.session-token": "valid-token" } },
      );
      const result = await GET(req as unknown as NextRequest);
      const setCookie = result.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain("Max-Age=7200");
    });
  });
});
