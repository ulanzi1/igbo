// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockRedisExists = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockGetRedisClient = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    DND_TOGGLE: { maxRequests: 10, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
    limit: 10,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET, PATCH } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeGetRequest() {
  return new Request("https://example.com/api/v1/user/dnd", {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

function makePatchRequest(body: unknown) {
  return new Request("https://example.com/api/v1/user/dnd", {
    method: "PATCH",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockRedisExists.mockResolvedValue(0);
  mockRedisSet.mockResolvedValue("OK");
  mockRedisDel.mockResolvedValue(1);
  mockGetRedisClient.mockReturnValue({
    exists: mockRedisExists,
    set: mockRedisSet,
    del: mockRedisDel,
  });
});

describe("GET /api/v1/user/dnd", () => {
  it("returns { dnd: false } when Redis key does not exist", async () => {
    mockRedisExists.mockResolvedValue(0);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dnd).toBe(false);
    expect(mockRedisExists).toHaveBeenCalledWith(`dnd:${USER_ID}`);
  });

  it("returns { dnd: true } when Redis key exists", async () => {
    mockRedisExists.mockResolvedValue(1);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dnd).toBe(true);
  });
});

describe("PATCH /api/v1/user/dnd", () => {
  it("sets Redis key when enabled: true", async () => {
    const res = await PATCH(makePatchRequest({ enabled: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.dnd).toBe(true);
    expect(mockRedisSet).toHaveBeenCalledWith(`dnd:${USER_ID}`, "1");
  });

  it("deletes Redis key when enabled: false", async () => {
    const res = await PATCH(makePatchRequest({ enabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.dnd).toBe(false);
    expect(mockRedisDel).toHaveBeenCalledWith(`dnd:${USER_ID}`);
  });

  it("returns 400 when enabled is missing", async () => {
    const res = await PATCH(makePatchRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/enabled/);
  });

  it("returns 400 when enabled is not a boolean (string)", async () => {
    const res = await PATCH(makePatchRequest({ enabled: "true" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when enabled is not a boolean (number)", async () => {
    const res = await PATCH(makePatchRequest({ enabled: 1 }));
    expect(res.status).toBe(400);
  });

  it("requires Origin header (CSRF)", async () => {
    const req = new Request("https://example.com/api/v1/user/dnd", {
      method: "PATCH",
      headers: {
        Host: "example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });
});
