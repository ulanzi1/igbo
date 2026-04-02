// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetFollowingPage = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/follows", () => ({
  getFollowingPage: (...args: unknown[]) => mockGetFollowingPage(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    FOLLOW_LIST: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
    limit: 60,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";

const mockFollowing = {
  userId: "00000000-0000-4000-8000-000000000003",
  displayName: "Bob",
  photoUrl: null,
  locationCity: null,
  locationCountry: "UK",
  followedAt: "2026-02-01T00:00:00.000Z",
};

function makeGetRequest(targetUserId = TARGET_ID, searchParams = "") {
  return new Request(
    `https://example.com/api/v1/members/${targetUserId}/following${searchParams}`,
    { method: "GET", headers: { Host: "example.com" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetFollowingPage.mockResolvedValue([]);
});

describe("GET /api/v1/members/[userId]/following", () => {
  it("returns 200 { members: [], nextCursor: null } when less than limit results", async () => {
    mockGetFollowingPage.mockResolvedValue([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  it("returns nextCursor (ISO string) when exactly limit results returned", async () => {
    const members = Array.from({ length: 20 }, (_, i) => ({
      ...mockFollowing,
      userId: `00000000-0000-4000-8000-00000000000${i}`,
      followedAt: `2026-02-0${Math.floor(i / 10) + 1}T00:00:00.000Z`,
    }));
    mockGetFollowingPage.mockResolvedValue(members);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.members).toHaveLength(20);
    expect(body.data.nextCursor).toBe(members.at(-1)?.followedAt);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new (await import("@/lib/api-error")).ApiError({ status: 401, title: "Unauthorized" }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when userId path segment is invalid UUID", async () => {
    const res = await GET(makeGetRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("clamps invalid limit to default 20", async () => {
    mockGetFollowingPage.mockResolvedValue([]);

    await GET(makeGetRequest(TARGET_ID, "?limit=abc"));

    expect(mockGetFollowingPage).toHaveBeenCalledWith(TARGET_ID, undefined, 20);
  });

  it("clamps negative limit to 1", async () => {
    mockGetFollowingPage.mockResolvedValue([]);

    await GET(makeGetRequest(TARGET_ID, "?limit=-5"));

    expect(mockGetFollowingPage).toHaveBeenCalledWith(TARGET_ID, undefined, 1);
  });

  it("passes cursor param to getFollowingPage", async () => {
    const cursor = "2026-02-01T00:00:00.000Z";
    mockGetFollowingPage.mockResolvedValue([]);

    await GET(makeGetRequest(TARGET_ID, `?cursor=${encodeURIComponent(cursor)}`));

    expect(mockGetFollowingPage).toHaveBeenCalledWith(TARGET_ID, cursor, 20);
  });
});
