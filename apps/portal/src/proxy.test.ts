// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Mock next-intl/middleware ─────────────────────────────────────────────────
// next-intl/middleware imports from "next/server" which is unavailable in tests.
// We mock it to return a simple pass-through response.
vi.mock("next-intl/middleware", () => ({
  default: () => (_req: unknown) => {
    const { NextResponse } = require("next/server");
    return NextResponse.next();
  },
}));

// ─── Mock @/i18n/routing ─────────────────────────────────────────────────────
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "ig"], defaultLocale: "en" },
}));

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

import { proxy } from "./proxy";
import type { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = "test-secret-32-bytes-long-minimum-for-hs256";
  process.env.AUTH_URL = "http://localhost:3000";
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.COMMUNITY_URL;
});

describe("Portal proxy", () => {
  describe("public routes", () => {
    it("passes through root path without auth check", async () => {
      const req = makeRequest("http://localhost:3001/");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /api/auth/* routes without auth check", async () => {
      const req = makeRequest("http://localhost:3001/api/auth/session");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });
  });

  describe("unauthenticated requests — Safari ITP silent refresh", () => {
    it("redirects to verify-session (not login) when no session cookie and no _itp_refresh param", async () => {
      const req = makeRequest("http://localhost:3001/dashboard");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/api/auth/verify-session");
      expect(location).toContain("callbackUrl=");
    });

    it("verify-session callbackUrl includes _itp_refresh=1 for loop prevention", async () => {
      const req = makeRequest("http://localhost:3001/dashboard");
      const result = await proxy(req as unknown as NextRequest);
      const location = result.headers.get("Location") ?? "";
      const verifyUrl = new URL(location);
      const callbackUrl = verifyUrl.searchParams.get("callbackUrl") ?? "";
      expect(new URL(callbackUrl).searchParams.get("_itp_refresh")).toBe("1");
    });

    it("falls back to community login when no session cookie AND _itp_refresh=1 is present", async () => {
      const req = makeRequest("http://localhost:3001/dashboard?_itp_refresh=1");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("http://localhost:3000/login");
      expect(location).toContain("callbackUrl=");
      expect(location).not.toContain("verify-session");
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
      const result = await proxy(req as unknown as NextRequest);
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
      const result = await proxy(req as unknown as NextRequest);
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
      const result = await proxy(req as unknown as NextRequest);
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
      const result = await proxy(req as unknown as NextRequest);
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
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
    });
  });

  describe("malformed/expired JWT — Safari ITP silent refresh", () => {
    it("redirects to verify-session when decode throws and no _itp_refresh param", async () => {
      mockDecode.mockRejectedValue(new Error("Invalid JWT"));
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "malformed-token" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/api/auth/verify-session");
      expect(location).toContain("callbackUrl=");
    });

    it("falls back to login when decode throws AND _itp_refresh=1 is present", async () => {
      mockDecode.mockRejectedValue(new Error("Invalid JWT"));
      const req = makeRequest("http://localhost:3001/dashboard?_itp_refresh=1", {
        cookies: { "authjs.session-token": "malformed-token" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
      expect(location).not.toContain("verify-session");
    });

    it("redirects to verify-session when decode returns null and no _itp_refresh param", async () => {
      mockDecode.mockResolvedValue(null);
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "expired-token" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/api/auth/verify-session");
      expect(location).toContain("callbackUrl=");
    });

    it("falls back to login when decode returns null AND _itp_refresh=1 is present", async () => {
      mockDecode.mockResolvedValue(null);
      const req = makeRequest("http://localhost:3001/dashboard?_itp_refresh=1", {
        cookies: { "authjs.session-token": "expired-token" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("/login");
      expect(location).not.toContain("verify-session");
    });
  });

  describe("_itp_refresh param stripping", () => {
    it("redirects authenticated request with ?_itp_refresh=1 to clean URL without the param", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest("http://localhost:3001/dashboard?_itp_refresh=1", {
        cookies: { "authjs.session-token": "valid-token" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307);
      const location = result.headers.get("Location") ?? "";
      expect(location).toContain("http://localhost:3001/dashboard");
      expect(location).not.toContain("_itp_refresh");
    });

    it("passes through authenticated request without _itp_refresh unchanged", async () => {
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "valid-token" },
      });
      const result = await proxy(req as unknown as NextRequest);
      // Should proceed (not redirect to strip _itp_refresh since it's not present)
      expect(result.status).not.toBe(307);
    });
  });

  describe("AUTH_SECRET guard", () => {
    it("returns 500 when AUTH_SECRET is not set", async () => {
      delete process.env.AUTH_SECRET;
      const req = makeRequest("http://localhost:3001/dashboard");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(500);
    });
  });

  describe("response headers", () => {
    it("adds X-Request-Id header to responses", async () => {
      const req = makeRequest("http://localhost:3001/");
      const result = await proxy(req as unknown as NextRequest);
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
      const result = await proxy(req as unknown as NextRequest);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    });

    it("does not set CORS headers for unknown origins", async () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:3000";
      mockDecode.mockResolvedValue({ id: "user-1", accountStatus: "APPROVED" });
      const req = makeRequest("http://localhost:3001/dashboard", {
        cookies: { "authjs.session-token": "valid-token" },
        headers: { Origin: "http://evil.com" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("handles CORS preflight OPTIONS request with 204", async () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:3000";
      const req = makeRequest("http://localhost:3001/api/some-endpoint", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000" },
      });
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(204);
      expect(result.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    });
  });

  describe("locale-prefixed public route bypass", () => {
    it("passes through /en without auth check", async () => {
      const req = makeRequest("http://localhost:3001/en");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /ig without auth check", async () => {
      const req = makeRequest("http://localhost:3001/ig");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /en/jobs without auth check", async () => {
      const req = makeRequest("http://localhost:3001/en/jobs");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /en/search without auth check (guest browsing)", async () => {
      const req = makeRequest("http://localhost:3001/en/search");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /ig/search without auth check (guest browsing)", async () => {
      const req = makeRequest("http://localhost:3001/ig/search");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("passes through /en/search with query params without auth check", async () => {
      const req = makeRequest(
        "http://localhost:3001/en/search?q=engineer&employmentType=full_time",
      );
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).not.toBe(307);
      expect(mockDecode).not.toHaveBeenCalled();
    });

    it("requires auth for /en/applications (protected path)", async () => {
      const req = makeRequest("http://localhost:3001/en/applications");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307); // redirected (no session)
    });

    it("requires auth for /en/dashboard (protected path)", async () => {
      const req = makeRequest("http://localhost:3001/en/dashboard");
      const result = await proxy(req as unknown as NextRequest);
      expect(result.status).toBe(307); // redirected (no session)
    });
  });

  describe("callbackUrl includes full portal URL", () => {
    it("callbackUrl includes the full portal URL (not just path)", async () => {
      const req = makeRequest("http://localhost:3001/en/dashboard");
      const result = await proxy(req as unknown as NextRequest);
      const location = result.headers.get("Location") ?? "";
      // callbackUrl should include the full URL with host
      const verifyUrl = new URL(location);
      const callbackUrl = verifyUrl.searchParams.get("callbackUrl") ?? "";
      expect(callbackUrl).toContain("http://localhost:3001");
    });
  });
});
