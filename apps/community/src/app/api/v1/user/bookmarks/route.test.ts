// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@/services/bookmark-service", () => ({
  getUserBookmarks: vi.fn(),
}));
vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    BOOKMARK_LIST: { maxRequests: 60, windowMs: 60_000 },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, limit: 60 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getUserBookmarks } from "@/services/bookmark-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetUserBookmarks = vi.mocked(getUserBookmarks);

const BASE_URL = "http://localhost";

function makeRequest(query = "") {
  return new Request(`${BASE_URL}/api/v1/user/bookmarks${query}`);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetUserBookmarks.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
});

describe("GET /api/v1/user/bookmarks", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("calls getUserBookmarks with userId, default cursor and limit", async () => {
    mockGetUserBookmarks.mockResolvedValueOnce({ posts: [], nextCursor: null });

    await GET(makeRequest());

    expect(mockGetUserBookmarks).toHaveBeenCalledWith("user-1", {
      cursor: undefined,
      limit: 10,
    });
  });

  it("calls getUserBookmarks with cursor and limit from query params", async () => {
    const cursor = "2026-03-01T10:00:00.000Z";
    mockGetUserBookmarks.mockResolvedValueOnce({ posts: [], nextCursor: null });

    await GET(makeRequest(`?cursor=${encodeURIComponent(cursor)}&limit=20`));

    expect(mockGetUserBookmarks).toHaveBeenCalledWith("user-1", {
      cursor,
      limit: 20,
    });
  });

  it("returns paginated posts with nextCursor", async () => {
    const mockPost = {
      id: "post-1",
      content: "Test",
      isBookmarked: true,
      bookmarkedAt: "2026-03-01T10:00:00.000Z",
    };
    mockGetUserBookmarks.mockResolvedValueOnce({
      posts: [mockPost] as Parameters<
        typeof mockGetUserBookmarks.mockResolvedValueOnce
      >[0]["posts"],
      nextCursor: "2026-03-01T09:00:00.000Z",
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { posts: unknown[]; nextCursor: string | null } };
    expect(body.data.posts).toHaveLength(1);
    expect(body.data.nextCursor).toBe("2026-03-01T09:00:00.000Z");
  });

  it("caps limit at 50 regardless of query param", async () => {
    mockGetUserBookmarks.mockResolvedValueOnce({ posts: [], nextCursor: null });

    await GET(makeRequest("?limit=100"));

    expect(mockGetUserBookmarks).toHaveBeenCalledWith("user-1", {
      cursor: undefined,
      limit: 50,
    });
  });

  it("defaults limit to 10 when limit param is non-numeric", async () => {
    mockGetUserBookmarks.mockResolvedValueOnce({ posts: [], nextCursor: null });

    await GET(makeRequest("?limit=abc"));

    expect(mockGetUserBookmarks).toHaveBeenCalledWith("user-1", {
      cursor: undefined,
      limit: 10,
    });
  });
});
