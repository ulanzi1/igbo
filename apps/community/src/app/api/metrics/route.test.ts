// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, string | undefined> = {
    METRICS_SECRET: "test-secret-token",
    NODE_ENV: "test",
  };
  return { mockEnv };
});
vi.mock("@/env", () => ({
  get env() {
    return mockEnv;
  },
}));

vi.mock("@/lib/metrics", () => ({
  metricsRegistry: {
    metrics: () => Promise.resolve("# HELP test_metric A test metric\ntest_metric 1\n"),
    contentType: "text/plain; version=0.0.4",
  },
  httpDuration: { observe: vi.fn() },
  httpRequestsTotal: { inc: vi.fn() },
  appErrorsTotal: { inc: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("@/lib/request-context", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  buildRateLimitHeaders: vi.fn(() => ({})),
}));

import { GET } from "./route";

describe("GET /api/metrics", () => {
  beforeAll(() => {
    mockEnv.METRICS_SECRET = "test-secret-token";
    mockEnv.NODE_ENV = "test";
  });

  it("returns 200 with Prometheus text format when correct bearer token provided", async () => {
    const request = new Request("http://localhost:3000/api/metrics", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret-token" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("test_metric");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const request = new Request("http://localhost:3000/api/metrics", {
      method: "GET",
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 401 when bearer token is wrong", async () => {
    const request = new Request("http://localhost:3000/api/metrics", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("uses skipCsrf: true (no CSRF validation for GET)", async () => {
    // GET routes are not subject to CSRF validation (only mutating methods are checked)
    const request = new Request("http://localhost:3000/api/metrics", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret-token" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("response Content-Type is Prometheus text format", async () => {
    const request = new Request("http://localhost:3000/api/metrics", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret-token" },
    });
    const response = await GET(request);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });

  it("returns 503 in production when METRICS_SECRET is not configured", async () => {
    const origSecret = mockEnv.METRICS_SECRET;
    const origNodeEnv = mockEnv.NODE_ENV;
    mockEnv.METRICS_SECRET = "";
    mockEnv.NODE_ENV = "production";
    try {
      const request = new Request("http://localhost:3000/api/metrics", { method: "GET" });
      const response = await GET(request);
      expect(response.status).toBe(503);
      const text = await response.text();
      expect(text).toContain("METRICS_SECRET not configured");
    } finally {
      mockEnv.METRICS_SECRET = origSecret;
      mockEnv.NODE_ENV = origNodeEnv;
    }
  });
});
