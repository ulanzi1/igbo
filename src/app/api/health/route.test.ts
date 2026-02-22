// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

const mockPing = vi.fn().mockResolvedValue("PONG");

// Mock the shared Redis client
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    ping: mockPing,
  })),
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
    mockPing.mockRejectedValueOnce(new Error("Connection refused"));

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.redis).toBe("disconnected");
  });
});
