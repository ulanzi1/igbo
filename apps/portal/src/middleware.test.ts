// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Mock next-auth/jwt ───────────────────────────────────────────────────────
const mockDecode = vi.fn();

vi.mock("next-auth/jwt", () => ({
  decode: (...args: unknown[]) => mockDecode(...args),
}));

function makeRequest(
  url: string,
  options: {
    cookies?: Record<string, string>;
    method?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const req = new Request(url, {
    method: options.method ?? "GET",
    headers: options.headers ?? {},
  }) as unknown as Request & {
    cookies: { get: (name: string) => { name: string; value: string } | undefined };
    nextUrl: URL;
  };

  // Override nextUrl
  Object.defineProperty(req, "nextUrl", {
    get: () => new URL(url),
    configurable: true,
  });

  // Mock cookies.get
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

import { middleware } from "./middleware";
import type { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = "test-secret-32-bytes-long-minimum-for-hs256";
  process.env.AUTH_URL = "http://localhost:3000";
  delete process.env.ALLOWED_ORIGINS;
});

describe("Portal middleware", () => {
  describe("public routes", () => {
    it("passes through root path without auth check", async () => {
      const req = makeRequest("http://localhost:3001/");
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /api/auth/* routes without auth check", async () => {
      const req = makeRequest("http://localhost:3001/api/auth/session");
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });
  });

  describe("unauthenticated requests", () => {
    it("redirects to community login with returnTo when no session cookie", async () => {
      const req = makeRequest("http://localhost:3001/dashboard");
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("http://localhost:3000/login");
      expect(location).toContain("returnTo=");
    });
  });

  describe("authenticated requests", () => {
    it("passes through for valid APPROVED session", async () => {
      mockDecode.mockResolvedValue({
        id: "user-1",
        accountStatus: "APPROVED",
        role: "MEMBER",
      });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "valid-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
    });
  });

  describe("banned/suspended/deleted users", () => {
    it("redirects BANNED user to community /login?banned=true", async () => {
      mockDecode.mockResolvedValue({
        id: "user-banned",
        accountStatus: "BANNED",
        role: "MEMBER",
      });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "banned-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("banned=true");
    });

    it("redirects SUSPENDED user to community /suspended", async () => {
      mockDecode.mockResolvedValue({
        id: "user-suspended",
        accountStatus: "SUSPENDED",
        role: "MEMBER",
      });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "suspended-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/suspended");
    });

    it("redirects PENDING_DELETION user to community /login", async () => {
      mockDecode.mockResolvedValue({
        id: "user-pending",
        accountStatus: "PENDING_DELETION",
        role: "MEMBER",
      });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "pending-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
    });

    it("redirects ANONYMIZED user to community /login", async () => {
      mockDecode.mockResolvedValue({
        id: "user-anon",
        accountStatus: "ANONYMIZED",
        role: "MEMBER",
      });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "anon-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
    });
  });

  describe("malformed/expired JWT", () => {
    it("redirects to community login when decode throws (malformed JWT)", async () => {
      mockDecode.mockRejectedValue(new Error("Invalid JWT"));
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "malformed-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
    });

    it("redirects to community login when decode returns null (expired JWT)", async () => {
      mockDecode.mockResolvedValue(null);
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "expired-token" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
    });
  });

  describe("AUTH_SECRET guard", () => {
    it("returns 500 when AUTH_SECRET is not set", async () => {
      delete process.env.AUTH_SECRET;
      const req = makeRequest("http://localhost:3001/dashboard");
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(500);
    });
  });

  describe("response headers", () => {
    it("adds X-Request-Id header to responses", async () => {
      const req = makeRequest("http://localhost:3001/");
      const result = await middleware(req as unknown as NextRequest);
      expect(result.headers.get("X-Request-Id")).toBeTruthy();
    });
  });

  describe("CORS headers", () => {
    it("sets CORS headers for allowed origins on authenticated requests", async () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:3000";
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "valid-token" },
        headers: { Origin: "http://localhost:3000" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    });

    it("does not set CORS headers for unknown origins", async () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:3000";
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "valid-token" },
        headers: { Origin: "http://evil.com" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("handles CORS preflight OPTIONS request with 204", async () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:3000";
      const req = makeRequest("http://localhost:3001/api/some-endpoint", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000" },
      });
      const result = await middleware(req as unknown as NextRequest);
      expect(result.status).toBe(204);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    });
  });
});
