// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Mock next/server
vi.mock("next/server", () => {
  class MockHeaders extends Map<string, string> {
    set(key: string, value: string) {
      return super.set(key, value);
    }
    get(key: string) {
      return super.get(key);
    }
  }

  class MockNextResponse {
    headers: MockHeaders;
    constructor() {
      this.headers = new MockHeaders();
    }
    static next(options?: {
      request?: { headers?: Headers };
      headers?: Record<string, string>;
    }) {
      const response = new MockNextResponse();
      if (options?.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          response.headers.set(key, value);
        }
      }
      return response;
    }
  }

  return {
    NextResponse: MockNextResponse,
  };
});

describe("middleware", () => {
  it("echoes existing X-Request-Id to the response", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers({
        "X-Request-Id": "existing-trace-id",
      }),
      nextUrl: { pathname: "/dashboard" },
    };

    const response = middleware(mockRequest as never);
    expect(response.headers.get("X-Request-Id")).toBe("existing-trace-id");
  });

  it("generates and echoes a UUID X-Request-Id when not provided", async () => {
    const { middleware } = await import("./middleware");

    const mockRequest = {
      headers: new Headers(),
      nextUrl: { pathname: "/dashboard" },
    };

    const response = middleware(mockRequest as never);
    const traceId = response.headers.get("X-Request-Id");
    expect(traceId).toBeDefined();
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("has matcher config that excludes api routes", async () => {
    const { config } = await import("./middleware");
    expect(config.matcher).toBeDefined();
    expect(config.matcher[0]).toContain("api");
  });
});
