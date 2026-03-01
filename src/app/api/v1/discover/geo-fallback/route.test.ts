// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockSearchMembersWithGeoFallback = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/geo-search", () => ({
  searchMembersWithGeoFallback: (...args: unknown[]) => mockSearchMembersWithGeoFallback(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MEMBER_SEARCH: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
    limit: 60,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({ "X-RateLimit-Limit": "60" }),
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_RESULT = {
  members: [
    {
      userId: "00000000-0000-4000-8000-000000000002",
      displayName: "Alice",
      bio: "Community member",
      photoUrl: null,
      locationCity: "Houston",
      locationState: "Texas",
      locationCountry: "United States",
      interests: ["music"],
      languages: ["Igbo"],
      membershipTier: "BASIC" as const,
    },
  ],
  hasMore: false,
  nextCursor: null,
  activeLevel: "city" as const,
  levelCounts: { city: 10, state: 25, country: 50, global: 200 },
  activeLocationLabel: "Houston",
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/discover/geo-fallback");
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
  mockSearchMembersWithGeoFallback.mockResolvedValue(MOCK_RESULT);
});

describe("GET /api/v1/discover/geo-fallback", () => {
  it("returns 200 with { members, hasMore, nextCursor, activeLevel, levelCounts } on success", async () => {
    const res = await GET(
      makeGetRequest({ city: "Houston", state: "Texas", country: "United States" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members).toHaveLength(1);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();
    expect(body.data.activeLevel).toBe("city");
    expect(body.data.levelCounts).toEqual(MOCK_RESULT.levelCounts);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("passes city, state, country, cursor, limit to searchMembersWithGeoFallback", async () => {
    await GET(
      makeGetRequest({
        city: "Houston",
        state: "Texas",
        country: "USA",
        cursor: "abc123",
        limit: "10",
      }),
    );

    expect(mockSearchMembersWithGeoFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerUserId: USER_ID,
        locationCity: "Houston",
        locationState: "Texas",
        locationCountry: "USA",
        cursor: "abc123",
        limit: 10,
      }),
    );
  });

  it("uses default limit of 12 when limit param is absent", async () => {
    await GET(makeGetRequest({ city: "Houston" }));

    expect(mockSearchMembersWithGeoFallback).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 12 }),
    );
  });

  it("includes rate limit headers in response", async () => {
    const res = await GET(makeGetRequest());
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
  });
});
