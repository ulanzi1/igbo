// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-secret",
    DATABASE_URL: "postgres://test",
    ADMIN_PASSWORD: "test",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_TTL_SECONDS: 86400,
  },
}));

const mockGetActiveSuspension = vi.fn();
vi.mock("@igbo/db/queries/member-discipline", () => ({
  getActiveSuspension: (...args: unknown[]) => mockGetActiveSuspension(...args),
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn((col: unknown, val: unknown) => ({ col, val })) }));

const mockDbSelectChain = { from: vi.fn() };
const mockDbFromChain = { where: vi.fn() };
const mockDbWhereChain = { limit: vi.fn() };
vi.mock("@igbo/db", () => ({
  db: { select: vi.fn(() => mockDbSelectChain) },
}));
vi.mock("@igbo/db/schema/auth-users", () => ({
  authUsers: { id: "id", accountStatus: "account_status" },
}));

// Mock i18n routing
vi.mock("./i18n/routing", () => ({
  routing: { locales: ["en", "ig"], defaultLocale: "en" },
}));

// Mock next-intl/middleware to simulate locale routing behavior.
// lastEnrichedRequest captures the enriched NextRequest passed to handleI18nRouting
// so tests can assert on forwarded headers like X-Client-IP.
let lastEnrichedRequest: { headers: { get(k: string): string | null } } | null = null;
vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => {
    return vi.fn(
      (req: { nextUrl?: { pathname: string }; headers: { get(k: string): string | null } }) => {
        lastEnrichedRequest = req;
        const pathname = req.nextUrl?.pathname ?? "/";
        const headers = new Map<string, string>();
        const isLocalePrefixed = pathname.startsWith("/en") || pathname.startsWith("/ig");
        const status = isLocalePrefixed ? 200 : 307;
        if (status === 307) {
          headers.set("Location", "/en" + (pathname === "/" ? "/" : pathname));
        }
        return {
          headers: {
            set(k: string, v: string) {
              headers.set(k, v);
            },
            get(k: string) {
              return headers.get(k) ?? null;
            },
            has(k: string) {
              return headers.has(k);
            },
          },
          status,
        };
      },
    );
  }),
}));

// Mock next-auth/jwt for Edge-compatible JWT decode
const mockDecode = vi.fn();
vi.mock("next-auth/jwt", () => ({ decode: (...args: unknown[]) => mockDecode(...args) }));

// Mock next/server with NextResponse and NextRequest
vi.mock("next/server", () => {
  class MockHeaders extends Map<string, string> {
    override set(key: string, value: string) {
      return super.set(key.toLowerCase(), value);
    }
    override get(key: string) {
      return super.get(key.toLowerCase()) ?? null;
    }
    override has(key: string) {
      return super.has(key.toLowerCase());
    }
  }

  class MockCookies {
    private _cookies: Map<string, string>;
    constructor(cookies: Record<string, string> = {}) {
      this._cookies = new Map(Object.entries(cookies));
    }
    get(name: string) {
      const value = this._cookies.get(name);
      return value !== undefined ? { value } : undefined;
    }
  }

  class MockNextRequest {
    headers: MockHeaders;
    nextUrl: { pathname: string };
    url: string;
    cookies: MockCookies;

    constructor(
      input: {
        headers: {
          entries?: () => IterableIterator<[string, string]>;
          has?: (k: string) => boolean;
          get?: (k: string) => string | null;
        };
        nextUrl?: { pathname: string };
        url?: string;
        cookies?: Record<string, string>;
      },
      init?: { headers?: Map<string, string> | Headers },
    ) {
      this.headers = new MockHeaders();
      this.nextUrl = input.nextUrl ?? { pathname: "/" };
      this.url = input.url ?? "http://localhost:3000" + this.nextUrl.pathname;
      this.cookies = new MockCookies((input as { cookies?: Record<string, string> }).cookies ?? {});

      if (typeof input.headers.entries === "function") {
        for (const [k, v] of input.headers.entries()) {
          this.headers.set(k, v);
        }
      }
      if (init?.headers) {
        const initHeaders = init.headers as { entries(): IterableIterator<[string, string]> };
        for (const [k, v] of initHeaders.entries()) {
          this.headers.set(k, v);
        }
      }
    }
  }

  class MockNextResponse {
    headers: MockHeaders;
    status: number;

    constructor(status: number) {
      this.headers = new MockHeaders();
      this.status = status;
    }

    static redirect(url: URL | string) {
      const response = new MockNextResponse(307);
      response.headers.set("Location", typeof url === "string" ? url : url.href);
      return response;
    }
  }

  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCookies(cookies: Record<string, string> = {}) {
  return {
    get(name: string) {
      const value = cookies[name];
      return value !== undefined ? { value } : undefined;
    },
  };
}

function makeRequest(
  pathname: string,
  cookiesMap: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
) {
  return {
    headers: new Headers(extraHeaders),
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    cookies: makeCookies(cookiesMap),
  };
}

const SESSION_COOKIE = "authjs.session-token";
const WITH_SESSION = { [SESSION_COOKIE]: "fake-jwt-token" };

beforeEach(() => {
  vi.clearAllMocks();
  mockDecode.mockResolvedValue(null);
  mockGetActiveSuspension.mockResolvedValue(null);
  lastEnrichedRequest = null;
  // Default DB select chain: returns empty array (no suspended/banned status)
  mockDbWhereChain.limit.mockResolvedValue([]);
  mockDbFromChain.where.mockReturnValue(mockDbWhereChain);
  mockDbSelectChain.from.mockReturnValue(mockDbFromChain);
});

// ─── Request-Id tests ─────────────────────────────────────────────────────────

describe("middleware — request tracing", () => {
  it("echoes existing X-Request-Id to the response", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(
      makeRequest("/en/about", {}, { "X-Request-Id": "existing-trace-id" }) as never,
    );
    expect(response.headers.get("X-Request-Id")).toBe("existing-trace-id");
  });

  it("generates a UUID X-Request-Id when not provided", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/en/about") as never);
    const traceId = response.headers.get("X-Request-Id");
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("echoes X-Request-Id on locale redirect responses", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/") as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ─── Auth redirect tests ──────────────────────────────────────────────────────

describe("middleware — auth protection", () => {
  it("redirects unauthenticated access to /en/dashboard to login", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/en/dashboard") as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toContain("/en/login");
  });

  it("redirects unauthenticated /ig/chat to /ig/login", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/ig/chat") as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toContain("/ig/login");
  });

  it("allows access to public guest routes without session", async () => {
    const { middleware } = await import("./middleware");
    for (const pathname of [
      "/en",
      "/en/about",
      "/en/articles",
      "/en/events",
      "/en/blog",
      "/en/apply",
      "/en/terms",
      "/en/privacy",
    ]) {
      const response = await middleware(makeRequest(pathname) as never);
      expect(response.status, `Expected 200 for ${pathname}`).toBe(200);
    }
  });

  it("allows access to auth routes without session", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/en/login") as never);
    expect(response.status).toBe(200);
  });

  it("allows authenticated access to protected routes", async () => {
    const { middleware } = await import("./middleware");
    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: true });
    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);
    expect(response.status).toBe(200);
  });

  it("redirects authenticated users from /en/login to /en/dashboard", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/en/login", WITH_SESSION) as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toContain("/en/dashboard");
  });

  it("redirects authenticated users from /ig/register to /ig/dashboard", async () => {
    const { middleware } = await import("./middleware");
    const response = await middleware(makeRequest("/ig/register", WITH_SESSION) as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toContain("/ig/dashboard");
  });

  it("redirects authenticated users from all auth routes to dashboard", async () => {
    const { middleware } = await import("./middleware");
    for (const path of [
      "/en/forgot-password",
      "/en/reset-password",
      "/en/verify",
      "/en/2fa-setup",
    ]) {
      const response = await middleware(makeRequest(path, WITH_SESSION) as never);
      expect(response.status, `Expected 307 for ${path}`).toBe(307);
      expect(response.headers.get("Location")).toContain("/en/dashboard");
    }
  });

  it("does NOT redirect authenticated users from guest routes like /en/about", async () => {
    const { middleware } = await import("./middleware");
    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: true });
    const response = await middleware(makeRequest("/en/about", WITH_SESSION) as never);
    expect(response.status).toBe(200);
  });
});

// ─── Onboarding gate tests ────────────────────────────────────────────────────

describe("middleware — onboarding gate", () => {
  it("redirects APPROVED user without profileCompleted to onboarding", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: false });
    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toContain("/en/onboarding");
  });

  it("does NOT redirect when profileCompleted is true", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: true });
    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("does NOT redirect on onboarding path (no redirect loop)", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: false });
    const response = await middleware(makeRequest("/en/onboarding", WITH_SESSION) as never);

    expect(response.status).toBe(200);
  });

  it("does NOT redirect admin paths to onboarding", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: false });
    const response = await middleware(makeRequest("/en/admin/approvals", WITH_SESSION) as never);

    expect(response.status).not.toBe(307);
  });

  it("does NOT redirect non-APPROVED users to onboarding", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({ accountStatus: "PENDING_APPROVAL", profileCompleted: false });
    // Unauthenticated (no session) — login redirect will fire first
    const response = await middleware(makeRequest("/en/dashboard") as never);

    expect(response.headers.get("Location")).not.toContain("/onboarding");
  });

  it("does NOT redirect when AUTH_SECRET is missing (fail-open safely)", async () => {
    const { middleware } = await import("./middleware");
    delete process.env.AUTH_SECRET;

    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: false });
    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    // Without AUTH_SECRET, decode is skipped — should not redirect to onboarding
    const location = response.headers.get("Location");
    expect(location === null || !location.includes("/onboarding")).toBe(true);
  });
});

// ─── JWT profileCompleted flag tests ─────────────────────────────────────────

describe("middleware — JWT profileCompleted flag", () => {
  it("calls decode with the session cookie token", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({ accountStatus: "APPROVED", profileCompleted: true });
    await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    expect(mockDecode).toHaveBeenCalledWith(
      expect.objectContaining({ token: "fake-jwt-token", secret: "test-secret" }),
    );
  });

  it("treats null decoded token as no onboarding redirect needed", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue(null);
    // With session cookie but null decode result (e.g., invalid token)
    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    // No onboarding redirect — falls through to normal i18n routing
    const location = response.headers.get("Location");
    expect(location === null || !location.includes("/onboarding")).toBe(true);
  });
});

// ─── X-Client-IP extraction tests ────────────────────────────────────────────

describe("middleware — X-Client-IP extraction", () => {
  it("sets X-Client-IP from CF-Connecting-IP (highest priority)", async () => {
    const { middleware } = await import("./middleware");
    await middleware(
      makeRequest(
        "/en/about",
        {},
        {
          "CF-Connecting-IP": "1.2.3.4",
          "X-Real-IP": "5.6.7.8",
          "X-Forwarded-For": "9.10.11.12, 13.14.15.16",
        },
      ) as never,
    );
    expect(lastEnrichedRequest).not.toBeNull();
    expect(lastEnrichedRequest!.headers.get("X-Client-IP")).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP when CF-Connecting-IP is absent", async () => {
    const { middleware } = await import("./middleware");
    await middleware(
      makeRequest(
        "/en/about",
        {},
        {
          "X-Real-IP": "5.6.7.8",
          "X-Forwarded-For": "9.10.11.12",
        },
      ) as never,
    );
    expect(lastEnrichedRequest).not.toBeNull();
    expect(lastEnrichedRequest!.headers.get("X-Client-IP")).toBe("5.6.7.8");
  });

  it("falls back to first entry of X-Forwarded-For when CF and X-Real-IP absent", async () => {
    const { middleware } = await import("./middleware");
    await middleware(
      makeRequest(
        "/en/about",
        {},
        {
          "X-Forwarded-For": "9.10.11.12, 13.14.15.16",
        },
      ) as never,
    );
    expect(lastEnrichedRequest).not.toBeNull();
    expect(lastEnrichedRequest!.headers.get("X-Client-IP")).toBe("9.10.11.12");
  });

  it("sets X-Client-IP to 'unknown' when no IP headers present", async () => {
    const { middleware } = await import("./middleware");
    await middleware(makeRequest("/en/about") as never);
    expect(lastEnrichedRequest).not.toBeNull();
    expect(lastEnrichedRequest!.headers.get("X-Client-IP")).toBe("unknown");
  });
});

// ─── Suspension redirect tests ───────────────────────────────────────────────

describe("middleware — suspension redirect", () => {
  it("redirects SUSPENDED JWT to /suspended with ?until and ?reason from DB", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    const endsAt = new Date("2026-04-01T12:00:00Z");
    mockDecode.mockResolvedValue({
      accountStatus: "SUSPENDED",
      id: "user-1",
      profileCompleted: true,
    });
    mockGetActiveSuspension.mockResolvedValue({
      suspensionEndsAt: endsAt,
      reason: "Test suspension",
    });

    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    expect(response.status).toBe(307);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("/en/suspended");
    expect(location).toContain("until=2026-04-01T12%3A00%3A00.000Z");
    expect(location).toContain("reason=Test");
  });

  it("redirects SUSPENDED JWT to /suspended without params if DB lookup fails", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({
      accountStatus: "SUSPENDED",
      id: "user-1",
      profileCompleted: true,
    });
    mockGetActiveSuspension.mockRejectedValue(new Error("DB error"));

    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    expect(response.status).toBe(307);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("/en/suspended");
    expect(location).not.toContain("until=");
  });

  it("redirects APPROVED JWT to /suspended when DB shows user is SUSPENDED (stale JWT)", async () => {
    const { middleware } = await import("./middleware");
    process.env.AUTH_SECRET = "test-secret";

    mockDecode.mockResolvedValue({
      accountStatus: "APPROVED",
      id: "user-stale",
      profileCompleted: true,
    });
    mockDbWhereChain.limit.mockResolvedValue([{ accountStatus: "SUSPENDED" }]);
    const endsAt = new Date("2026-04-02T00:00:00Z");
    mockGetActiveSuspension.mockResolvedValue({ suspensionEndsAt: endsAt, reason: "Stale reason" });

    const response = await middleware(makeRequest("/en/dashboard", WITH_SESSION) as never);

    expect(response.status).toBe(307);
    const location = response.headers.get("Location") ?? "";
    expect(location).toContain("/en/suspended");
    expect(location).toContain("until=");
  });
});

// ─── Config tests ─────────────────────────────────────────────────────────────

describe("middleware — config", () => {
  it("has matcher that excludes api routes", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher[0]).toContain("api");
  });

  it("has matcher that excludes _vercel paths", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher[0]).toContain("_vercel");
  });

  it("has matcher that excludes static file extensions", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher[0]).toContain(".");
  });
});
