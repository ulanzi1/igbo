// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockSearchMembersInDirectory = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/geo-search", () => ({
  searchMembersInDirectory: (...args: unknown[]) => mockSearchMembersInDirectory(...args),
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
      locationCity: "Lagos",
      locationState: null,
      locationCountry: "Nigeria",
      interests: ["music"],
      languages: ["Igbo"],
      membershipTier: "BASIC" as const,
    },
  ],
  hasMore: false,
  nextCursor: null,
};

function makeGetRequest(params: Record<string, string | string[]> = {}) {
  const url = new URL("https://example.com/api/v1/discover");
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      v.forEach((item) => url.searchParams.append(k, item));
    } else {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockSearchMembersInDirectory.mockResolvedValue(MOCK_RESULT);
});

describe("GET /api/v1/discover", () => {
  it("returns 200 with { members, hasMore, nextCursor } on success", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members).toHaveLength(1);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("passes query params to searchMembersInDirectory", async () => {
    await GET(
      makeGetRequest({
        q: "Alice",
        city: "Lagos",
        country: "Nigeria",
        language: "Igbo",
        tier: "BASIC",
        cursor: "abc123",
        limit: "10",
        interests: ["music", "culture"],
      }),
    );

    expect(mockSearchMembersInDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerUserId: USER_ID,
        query: "Alice",
        locationCity: "Lagos",
        locationCountry: "Nigeria",
        language: "Igbo",
        membershipTier: "BASIC",
        cursor: "abc123",
        limit: 10,
        interests: ["music", "culture"],
      }),
    );
  });

  it("coerces invalid tier value to undefined without error", async () => {
    await GET(makeGetRequest({ tier: "INVALID_TIER" }));

    expect(mockSearchMembersInDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipTier: undefined,
      }),
    );
    // Should return 200 normally
    const res = await GET(makeGetRequest({ tier: "INVALID_TIER" }));
    expect(res.status).toBe(200);
  });

  it("includes rate limit headers in response", async () => {
    const res = await GET(makeGetRequest());
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
  });
});
