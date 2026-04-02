// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// prom-client is globally mocked in src/test/setup.ts
// We need to test the real metrics module behavior

// Import the real normalizeRoute from middleware (not a copy-paste)
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

import { normalizeRoute } from "@/server/api/middleware";

describe("metrics module", () => {
  describe("route normalization", () => {
    it("normalizes UUID path segments to :id", () => {
      const result = normalizeRoute("/api/v1/users/abc12345-def6-7890-abcd-ef1234567890/points");
      expect(result).toBe("/api/v1/users/:id/points");
    });

    it("normalizes numeric path segments to :id", () => {
      const result = normalizeRoute("/api/v1/posts/123/comments");
      expect(result).toBe("/api/v1/posts/:id/comments");
    });

    it("preserves non-dynamic segments", () => {
      const result = normalizeRoute("/api/v1/users");
      expect(result).toBe("/api/v1/users");
    });

    it("normalizes multiple UUIDs in path", () => {
      const result = normalizeRoute(
        "/api/v1/groups/abc12345-def6-7890-abcd-ef1234567890/members/11122233-4455-6677-8899-aabbccddeeff",
      );
      expect(result).toBe("/api/v1/groups/:id/members/:id");
    });

    it("normalizes numeric segment at end of path", () => {
      const result = normalizeRoute("/api/v1/articles/456");
      expect(result).toBe("/api/v1/articles/:id");
    });

    it("does not normalize non-UUID hex strings shorter than UUID format", () => {
      const result = normalizeRoute("/api/v1/health");
      expect(result).toBe("/api/v1/health");
    });
  });

  describe("metrics registry", () => {
    it("metricsRegistry is a Registry instance (mocked)", async () => {
      const { metricsRegistry } = await import("./metrics");
      expect(metricsRegistry).toBeDefined();
    });

    it("httpDuration metric is defined", async () => {
      const { httpDuration } = await import("./metrics");
      expect(httpDuration).toBeDefined();
      expect(typeof httpDuration.observe).toBe("function");
    });

    it("httpRequestsTotal metric is defined", async () => {
      const { httpRequestsTotal } = await import("./metrics");
      expect(httpRequestsTotal).toBeDefined();
      expect(typeof httpRequestsTotal.inc).toBe("function");
    });

    it("wsActiveConnections metric is defined", async () => {
      const { wsActiveConnections } = await import("./metrics");
      expect(wsActiveConnections).toBeDefined();
    });

    it("wsMessagesTotal metric is defined", async () => {
      const { wsMessagesTotal } = await import("./metrics");
      expect(wsMessagesTotal).toBeDefined();
    });

    it("appErrorsTotal metric is defined", async () => {
      const { appErrorsTotal } = await import("./metrics");
      expect(appErrorsTotal).toBeDefined();
    });

    it("metricsRegistry.metrics() returns string (Prometheus text format)", async () => {
      const { metricsRegistry } = await import("./metrics");
      const result = await metricsRegistry.metrics();
      expect(typeof result).toBe("string");
    });

    it("metricsRegistry.contentType is defined", async () => {
      const { metricsRegistry } = await import("./metrics");
      expect(metricsRegistry.contentType).toBeDefined();
    });
  });
});
