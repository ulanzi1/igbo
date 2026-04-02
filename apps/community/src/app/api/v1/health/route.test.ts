// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbExecute = vi.fn();
vi.mock("@igbo/db", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

// drizzle-orm sql tag mock — just needs to be importable
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join(""),
    values,
  }),
}));

const mockRedisPing = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ ping: () => mockRedisPing() }),
}));

// ─── Suppress metrics side-effects ───────────────────────────────────────────
vi.mock("@/lib/metrics", () => ({
  httpDuration: { observe: vi.fn() },
  httpRequestsTotal: { inc: vi.fn() },
  appErrorsTotal: { inc: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from "./route";

function createRequest(options: { headers?: Record<string, string> } = {}): Request {
  return new Request("http://localhost:3000/api/v1/health", {
    method: "GET",
    headers: new Headers({ Host: "localhost:3000", ...options.headers }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: both healthy
  mockDbExecute.mockResolvedValue([{ "?column?": 1 }]);
  mockRedisPing.mockResolvedValue("PONG");
});

describe("GET /api/v1/health", () => {
  it("returns status=ok when DB and Redis are healthy", async () => {
    const res = await GET(createRequest());
    const body = (await res.json()) as {
      data: { status: string; components: object; timestamp: string };
    };

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(body.data.components).toMatchObject({
      db: "ok",
      redis: "ok",
      realtime: "ok",
    });
  });

  it("returns status=degraded when DB is down", async () => {
    mockDbExecute.mockRejectedValue(new Error("Connection refused"));

    const res = await GET(createRequest());
    const body = (await res.json()) as {
      data: { status: string; components: { db: string; redis: string; realtime: string } };
    };

    expect(res.status).toBe(200); // Health endpoint itself works
    expect(body.data.status).toBe("degraded");
    expect(body.data.components.db).toBe("down");
    expect(body.data.components.redis).toBe("ok");
  });

  it("returns status=degraded when Redis is down", async () => {
    mockRedisPing.mockRejectedValue(new Error("Redis unreachable"));

    const res = await GET(createRequest());
    const body = (await res.json()) as {
      data: { status: string; components: { db: string; redis: string; realtime: string } };
    };

    expect(res.status).toBe(200); // Health endpoint itself works
    expect(body.data.status).toBe("degraded");
    expect(body.data.components.redis).toBe("down");
    expect(body.data.components.realtime).toBe("unknown");
  });

  it("returns status=degraded when both DB and Redis are down", async () => {
    mockDbExecute.mockRejectedValue(new Error("DB down"));
    mockRedisPing.mockRejectedValue(new Error("Redis down"));

    const res = await GET(createRequest());
    const body = (await res.json()) as {
      data: { status: string; components: { db: string; redis: string; realtime: string } };
    };

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("degraded");
    expect(body.data.components.db).toBe("down");
    expect(body.data.components.redis).toBe("down");
    expect(body.data.components.realtime).toBe("unknown");
  });

  it("returns a valid ISO 8601 timestamp", async () => {
    const res = await GET(createRequest());
    const body = (await res.json()) as { data: { timestamp: string } };
    expect(new Date(body.data.timestamp).toISOString()).toBe(body.data.timestamp);
  });

  it("includes X-Request-Id in response", async () => {
    const res = await GET(createRequest({ headers: { "X-Request-Id": "health-check-trace" } }));
    expect(res.headers.get("X-Request-Id")).toBe("health-check-trace");
  });

  it("realtime=ok when Redis is healthy (proxy for realtime status)", async () => {
    const res = await GET(createRequest());
    const body = (await res.json()) as { data: { components: { realtime: string } } };
    expect(body.data.components.realtime).toBe("ok");
  });

  it("realtime=unknown when Redis is down (cannot determine realtime state)", async () => {
    mockRedisPing.mockRejectedValue(new Error("Redis down"));

    const res = await GET(createRequest());
    const body = (await res.json()) as { data: { components: { realtime: string } } };
    expect(body.data.components.realtime).toBe("unknown");
  });
});
