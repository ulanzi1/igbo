// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockRunGlobalSearch = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/search", () => ({
  runGlobalSearch: (...args: unknown[]) => mockRunGlobalSearch(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GLOBAL_SEARCH: { maxRequests: 30, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 60_000,
    limit: 30,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({ "X-RateLimit-Limit": "30" }),
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_RESULT = {
  sections: [
    {
      type: "members",
      items: [
        {
          id: "u1",
          type: "members",
          title: "Alice Obi",
          subtitle: "Lagos",
          imageUrl: null,
          href: "/profiles/u1",
          rank: 0.9,
        },
      ],
      hasMore: false,
    },
  ],
  pageInfo: {
    query: "alice",
    limit: 5,
    hasNextPage: false,
    cursor: null,
  },
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/search");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockRunGlobalSearch.mockResolvedValue(MOCK_RESULT);
});

describe("GET /api/v1/search", () => {
  it("returns 200 with sections and pageInfo for valid query", async () => {
    const res = await GET(makeGetRequest({ q: "alice" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.query).toBe("alice");
    expect(body.data.sections).toHaveLength(1);
    expect(body.data.sections[0].type).toBe("members");
    expect(body.data.pageInfo.hasNextPage).toBe(false);
  });

  it("returns 400 when q is shorter than 3 characters", async () => {
    const res = await GET(makeGetRequest({ q: "ab" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/3 characters/i);
  });

  it("returns 400 when q is empty", async () => {
    const res = await GET(makeGetRequest({ q: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type parameter", async () => {
    const res = await GET(makeGetRequest({ q: "hello", type: "invalid" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/type/i);
  });

  it("returns 400 for out-of-range limit", async () => {
    const res = await GET(makeGetRequest({ q: "hello", limit: "100" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/limit/i);
  });

  it("accepts valid type=members filter", async () => {
    const res = await GET(makeGetRequest({ q: "alice", type: "members" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(expect.objectContaining({ type: "members" }));
  });

  it("accepts type=all (default) filter", async () => {
    const res = await GET(makeGetRequest({ q: "alice", type: "all" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(expect.objectContaining({ type: "all" }));
  });

  it("passes trimmed query and limit to runGlobalSearch", async () => {
    await GET(makeGetRequest({ q: "  alice  ", limit: "3" }));
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "alice", limit: 3 }),
    );
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeGetRequest({ q: "alice" }));
    expect(res.status).toBe(401);
  });

  it("passes viewerUserId to runGlobalSearch", async () => {
    await GET(makeGetRequest({ q: "alice" }));
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: USER_ID }),
    );
  });

  it("includes rate limit headers", async () => {
    const res = await GET(makeGetRequest({ q: "alice" }));
    expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
  });
});
