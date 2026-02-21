// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

// Mock ioredis — use regular function (not arrow) so it works as a constructor with `new` in Vitest v4
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (this: {
    ping: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  }) {
    this.ping = vi.fn().mockResolvedValue("PONG");
    this.quit = vi.fn().mockResolvedValue("OK");
  });
  return { default: MockRedis };
});

// Mock the env module
vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    DATABASE_URL: "postgresql://igbo:igbo@localhost:5432/igbo",
    DATABASE_POOL_SIZE: 20,
  },
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy status with db and redis connected", async () => {
    const { db } = await import("@/db");
    vi.mocked(db.execute).mockResolvedValue([{ result: 1 }] as never);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("connected");
    expect(body.redis).toBe("connected");
    expect(body).toHaveProperty("uptime");
  });

  it("returns degraded status when db is down", async () => {
    const { db } = await import("@/db");
    vi.mocked(db.execute).mockRejectedValue(new Error("Connection refused"));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("disconnected");
  });

  it("returns degraded status when redis is down", async () => {
    const { db } = await import("@/db");
    vi.mocked(db.execute).mockResolvedValue([{ result: 1 }] as never);

    const { default: Redis } = await import("ioredis");
    vi.mocked(Redis).mockImplementation(function (this: {
      ping: ReturnType<typeof vi.fn>;
      quit: ReturnType<typeof vi.fn>;
    }) {
      this.ping = vi.fn().mockRejectedValue(new Error("Connection refused"));
      this.quit = vi.fn().mockResolvedValue("OK");
    });

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.redis).toBe("disconnected");
  });
});
