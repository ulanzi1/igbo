// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRedisGet = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ get: (...args: unknown[]) => mockRedisGet(...args) }),
}));

vi.mock("@/lib/metrics", () => ({
  httpDuration: { observe: vi.fn() },
  httpRequestsTotal: { inc: vi.fn() },
  appErrorsTotal: { inc: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from "./route";

function createRequest(): Request {
  return new Request("http://localhost:3000/api/v1/maintenance-status", {
    headers: { Host: "localhost:3000" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
});

describe("GET /api/v1/maintenance-status", () => {
  it("returns enabled=false when no Redis key", async () => {
    const res = await GET(createRequest());
    const body = (await res.json()) as { data: { enabled: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.enabled).toBe(false);
  });

  it("returns maintenance data from Redis when set", async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({
        enabled: false,
        scheduledStart: "2026-03-25T02:00:00.000Z",
        expectedDuration: 60,
        reason: "Deploying v2",
      }),
    );

    const res = await GET(createRequest());
    const body = (await res.json()) as {
      data: { enabled: boolean; scheduledStart: string; expectedDuration: number };
    };
    expect(body.data.scheduledStart).toBe("2026-03-25T02:00:00.000Z");
    expect(body.data.expectedDuration).toBe(60);
  });

  it("returns enabled=false when Redis is unavailable (safe default)", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis down"));

    const res = await GET(createRequest());
    const body = (await res.json()) as { data: { enabled: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.enabled).toBe(false);
  });

  it("uses skipCsrf (no CSRF validation for public endpoint)", async () => {
    // POST without Origin should still get through if route allowed — but GET is the only method here
    // Verify GET works without CSRF Origin header
    const req = new Request("http://localhost:3000/api/v1/maintenance-status", {
      method: "GET",
      headers: { Host: "localhost:3000" },
      // Intentionally no Origin header
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
