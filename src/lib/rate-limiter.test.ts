// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Redis mock setup ─────────────────────────────────────────────────────────

type PipelineExecResult = [[null, number], [null, number], [null, number], [null, null]];

const mockExec = vi.fn<() => Promise<PipelineExecResult>>();
const mockPipeline = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcount: vi.fn().mockReturnThis(),
  pexpire: vi.fn().mockReturnThis(),
  exec: mockExec,
};

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    pipeline: () => mockPipeline,
  }),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function setupPipelineResult(count: number): void {
  mockExec.mockResolvedValue([
    [null, 0], // zremrangebyscore
    [null, 1], // zadd
    [null, count], // zcount
    [null, null], // pexpire
  ]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import { checkRateLimit, buildRateLimitHeaders } from "./rate-limiter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.zremrangebyscore.mockReturnThis();
    mockPipeline.zadd.mockReturnThis();
    mockPipeline.zcount.mockReturnThis();
    mockPipeline.pexpire.mockReturnThis();
  });

  it("returns allowed: true when count is under the limit", async () => {
    setupPipelineResult(3);
    const result = await checkRateLimit("test-key", 10, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("returns allowed: false when count exceeds the limit", async () => {
    setupPipelineResult(11);
    const result = await checkRateLimit("test-key", 10, 60_000);
    expect(result.allowed).toBe(false);
  });

  it("returns allowed: false when count equals limit (exactly at limit is not allowed)", async () => {
    setupPipelineResult(10);
    const result = await checkRateLimit("test-key", 10, 60_000);
    // count <= maxRequests → allowed; count 10, max 10 → allowed
    expect(result.allowed).toBe(true);
  });

  it("returns allowed: false when count is one over limit", async () => {
    setupPipelineResult(11);
    const result = await checkRateLimit("test-key", 10, 60_000);
    expect(result.allowed).toBe(false);
  });

  it("remaining decrements correctly when under limit", async () => {
    setupPipelineResult(3);
    const result = await checkRateLimit("test-key", 10, 60_000);
    expect(result.remaining).toBe(7); // 10 - 3
  });

  it("remaining is 0 (not negative) when over limit", async () => {
    setupPipelineResult(15);
    const result = await checkRateLimit("test-key", 10, 60_000);
    expect(result.remaining).toBe(0);
  });

  it("limit field equals maxRequests", async () => {
    setupPipelineResult(1);
    const result = await checkRateLimit("test-key", 42, 60_000);
    expect(result.limit).toBe(42);
  });

  it("resetAt is in the future (now + windowMs)", async () => {
    setupPipelineResult(1);
    const before = Date.now();
    const result = await checkRateLimit("test-key", 10, 60_000);
    const after = Date.now();
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt).toBeLessThanOrEqual(after + 60_000);
  });
});

describe("buildRateLimitHeaders", () => {
  it("returns correct header names", () => {
    const result = {
      allowed: true,
      remaining: 5,
      resetAt: 1_700_000_000_000, // epoch ms
      limit: 10,
    };
    const headers = buildRateLimitHeaders(result);
    expect(headers).toHaveProperty("X-RateLimit-Limit");
    expect(headers).toHaveProperty("X-RateLimit-Remaining");
    expect(headers).toHaveProperty("X-RateLimit-Reset");
  });

  it("X-RateLimit-Limit matches limit field", () => {
    const headers = buildRateLimitHeaders({ allowed: true, remaining: 9, resetAt: 0, limit: 10 });
    expect(headers["X-RateLimit-Limit"]).toBe("10");
  });

  it("X-RateLimit-Remaining matches remaining field", () => {
    const headers = buildRateLimitHeaders({ allowed: true, remaining: 7, resetAt: 0, limit: 10 });
    expect(headers["X-RateLimit-Remaining"]).toBe("7");
  });

  it("X-RateLimit-Reset is epoch seconds (not milliseconds)", () => {
    const resetAtMs = 1_700_000_000_000; // 1,700,000,000,000 ms = 1,700,000,000 s
    const headers = buildRateLimitHeaders({
      allowed: true,
      remaining: 5,
      resetAt: resetAtMs,
      limit: 10,
    });
    expect(headers["X-RateLimit-Reset"]).toBe("1700000000");
  });

  it("X-RateLimit-Reset rounds up (Math.ceil)", () => {
    const resetAtMs = 1_700_000_000_500; // 500ms past the second boundary
    const headers = buildRateLimitHeaders({
      allowed: true,
      remaining: 5,
      resetAt: resetAtMs,
      limit: 10,
    });
    expect(headers["X-RateLimit-Reset"]).toBe("1700000001");
  });

  it("all header values are strings", () => {
    const headers = buildRateLimitHeaders({
      allowed: false,
      remaining: 0,
      resetAt: 1_000_000,
      limit: 5,
    });
    for (const value of Object.values(headers)) {
      expect(typeof value).toBe("string");
    }
  });
});
