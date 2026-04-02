// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockRunGlobalSearch = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/search", () => ({
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
    limit: 10,
    hasNextPage: false,
    cursor: null,
    nextCursor: null,
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

// ── Existing regression tests ─────────────────────────────────────────────────

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

// ── New filter param validation tests (Story 10.2) ────────────────────────────

describe("GET /api/v1/search — filter params (Story 10.2)", () => {
  it("accepts valid dateRange=today", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", dateRange: "today" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ dateRange: "today" }) }),
    );
  });

  it("accepts valid dateRange=week", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", dateRange: "week" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ dateRange: "week" }) }),
    );
  });

  it("accepts valid dateRange=month", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", dateRange: "month" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for dateRange=custom without dateFrom", async () => {
    const res = await GET(
      makeGetRequest({ q: "igbo", type: "posts", dateRange: "custom", dateTo: "2026-03-08" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/dateFrom/i);
  });

  it("returns 400 for dateRange=custom without dateTo", async () => {
    const res = await GET(
      makeGetRequest({ q: "igbo", type: "posts", dateRange: "custom", dateFrom: "2026-03-01" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/dateTo/i);
  });

  it("accepts dateRange=custom with both dateFrom and dateTo", async () => {
    const res = await GET(
      makeGetRequest({
        q: "igbo",
        type: "posts",
        dateRange: "custom",
        dateFrom: "2026-03-01",
        dateTo: "2026-03-08",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          dateRange: "custom",
          dateFrom: "2026-03-01",
          dateTo: "2026-03-08",
        }),
      }),
    );
  });

  it("returns 400 for invalid dateRange value", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", dateRange: "yesterday" }));
    expect(res.status).toBe(400);
  });

  it("accepts valid category=discussion for posts", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", category: "discussion" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ category: "discussion" }) }),
    );
  });

  it("accepts valid category=event", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", category: "event" }));
    expect(res.status).toBe(200);
  });

  it("accepts valid category=announcement", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", category: "announcement" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid category value", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", category: "unknown" }));
    expect(res.status).toBe(400);
  });

  it("accepts valid membershipTier=BASIC", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "members", membershipTier: "BASIC" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ membershipTier: "BASIC" }) }),
    );
  });

  it("accepts valid membershipTier=PROFESSIONAL", async () => {
    const res = await GET(
      makeGetRequest({ q: "igbo", type: "members", membershipTier: "PROFESSIONAL" }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts valid membershipTier=TOP_TIER", async () => {
    const res = await GET(
      makeGetRequest({ q: "igbo", type: "members", membershipTier: "TOP_TIER" }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid membershipTier value", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "members", membershipTier: "GOLD" }));
    expect(res.status).toBe(400);
  });

  it("accepts location filter for members", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "members", location: "Lagos" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ location: "Lagos" }) }),
    );
  });

  it("accepts authorId filter", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "posts", authorId: USER_ID }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ authorId: USER_ID }) }),
    );
  });

  it("passes cursor param to runGlobalSearch", async () => {
    const cursor = "eyJyYW5rIjowLjksInNvcnRWYWwiOiJBbGljZSIsImlkIjoidTEifQ==";
    const res = await GET(makeGetRequest({ q: "alice", type: "members", cursor }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
  });

  it("does not pass filters to runGlobalSearch when type=all (overview mode)", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", type: "all", membershipTier: "BASIC" }));
    expect(res.status).toBe(200);
    expect(mockRunGlobalSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: undefined }),
    );
  });

  it("response includes nextCursor in pageInfo", async () => {
    mockRunGlobalSearch.mockResolvedValueOnce({
      ...MOCK_RESULT,
      pageInfo: { ...MOCK_RESULT.pageInfo, nextCursor: "abc123" },
    });
    const res = await GET(makeGetRequest({ q: "alice", type: "members" }));
    const body = await res.json();
    expect(body.data.pageInfo.nextCursor).toBe("abc123");
  });

  it("inapplicable filter for type is silently accepted (not error)", async () => {
    // category filter sent for members type — should be silently ignored (no 400)
    const res = await GET(makeGetRequest({ q: "igbo", type: "members", category: "discussion" }));
    expect(res.status).toBe(200);
  });
});
