// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Mock i18n routing
vi.mock("./i18n/routing", () => ({
  routing: { locales: ["en", "ig"], defaultLocale: "en" },
}));

// Mock next-intl/middleware to simulate locale routing behavior
vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => {
    return vi.fn((req: { nextUrl?: { pathname: string } }) => {
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
    });
  }),
}));

// Mock next/server with NextResponse and NextRequest
vi.mock("next/server", () => {
  class MockHeaders extends Map<string, string> {
    override set(key: string, value: string) {
      return super.set(key, value);
    }
    override get(key: string) {
      return super.get(key) ?? null;
    }
    override has(key: string) {
      return super.has(key);
    }
  }

  class MockNextRequest {
    headers: MockHeaders;
    nextUrl: { pathname: string };
    url: string;

    constructor(
      input: {
        headers: {
          entries?: () => IterableIterator<[string, string]>;
          has?: (k: string) => boolean;
          get?: (k: string) => string | null;
        };
        nextUrl?: { pathname: string };
        url?: string;
      },
      init?: { headers?: Map<string, string> | Headers },
    ) {
      this.headers = new MockHeaders();
      this.nextUrl = input.nextUrl ?? { pathname: "/" };
      this.url = input.url ?? "http://localhost:3000" + this.nextUrl.pathname;

      // Copy headers from input
      if (typeof input.headers.entries === "function") {
        for (const [k, v] of input.headers.entries()) {
          this.headers.set(k, v);
        }
      }

      // Apply init headers (overrides from enrichedRequest construction)
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
      response.headers.set("Location", typeof url === "string" ? url : url.pathname);
      return response;
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  };
});

describe("middleware", () => {
  it("echoes existing X-Request-Id to the response", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers({ "X-Request-Id": "existing-trace-id" }),
      nextUrl: { pathname: "/en/about" },
      url: "http://localhost:3000/en/about",
    };

    const response = middleware(mockRequest as never);
    expect(response.headers.get("X-Request-Id")).toBe("existing-trace-id");
  });

  it("generates and echoes a UUID X-Request-Id when not provided", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/en/about" },
      url: "http://localhost:3000/en/about",
    };

    const response = middleware(mockRequest as never);
    const traceId = response.headers.get("X-Request-Id");
    expect(traceId).toBeDefined();
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("echoes X-Request-Id on locale redirect responses", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/" },
      url: "http://localhost:3000/",
    };

    const response = middleware(mockRequest as never);
    expect(response.status).toBe(307);
    const traceId = response.headers.get("X-Request-Id");
    expect(traceId).toBeDefined();
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("echoes X-Request-Id on pass-through responses from i18n routing", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers({ "X-Request-Id": "pass-through-id" }),
      nextUrl: { pathname: "/en/about" },
      url: "http://localhost:3000/en/about",
    };

    const response = middleware(mockRequest as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBe("pass-through-id");
  });

  it("has matcher config that excludes api routes", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher).toBeDefined();
    expect(config.matcher[0]).toContain("api");
  });

  it("has matcher config that excludes _vercel paths", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher[0]).toContain("_vercel");
  });

  it("has matcher config that excludes static file extensions", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher[0]).toContain(".");
  });

  // Route protection tests
  it("redirects unauthenticated access to protected routes to splash page", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/en/dashboard" },
      url: "http://localhost:3000/en/dashboard",
    };

    const response = middleware(mockRequest as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/en");
  });

  it("redirects protected /ig routes to /ig splash", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/ig/chat" },
      url: "http://localhost:3000/ig/chat",
    };

    const response = middleware(mockRequest as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/ig");
  });

  it("allows access to guest routes without redirect", async () => {
    const { middleware } = await import("./middleware");

    const publicPaths = [
      "/en",
      "/en/about",
      "/en/articles",
      "/en/events",
      "/en/blog",
      "/en/apply",
      "/en/terms",
      "/en/privacy",
    ];

    for (const pathname of publicPaths) {
      const mockRequest = {
        headers: new Headers(),
        nextUrl: { pathname },
        url: `http://localhost:3000${pathname}`,
      };

      const response = middleware(mockRequest as never);
      expect(response.status).toBe(200);
    }
  });

  it("allows access to auth routes without redirect", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/en/login" },
      url: "http://localhost:3000/en/login",
    };

    const response = middleware(mockRequest as never);
    expect(response.status).toBe(200);
  });

  it("redirects protected admin routes", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/en/admin/moderation" },
      url: "http://localhost:3000/en/admin/moderation",
    };

    const response = middleware(mockRequest as never);
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("/en");
  });
});
