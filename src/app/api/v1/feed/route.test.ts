// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks ──────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetFeed = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/feed-service", () => ({
  getFeed: (...args: unknown[]) => mockGetFeed(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    FEED_READ: { maxRequests: 60, windowMs: 60_000 },
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
import { ApiError } from "@/lib/api-error";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_FEED_PAGE = {
  posts: [
    {
      id: "post-1",
      authorId: "user-b",
      authorDisplayName: "Test User",
      authorPhotoUrl: null,
      content: "Hello world",
      contentType: "text" as const,
      visibility: "members_only" as const,
      groupId: null,
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      media: [],
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
  ],
  nextCursor: null,
  isColdStart: false,
};

function makeGetRequest(queryString = "") {
  const url = queryString
    ? `https://example.com/api/v1/feed?${queryString}`
    : "https://example.com/api/v1/feed";
  return new Request(url, {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: VIEWER_ID });
  mockGetFeed.mockResolvedValue(MOCK_FEED_PAGE);
});

describe("GET /api/v1/feed", () => {
  it("returns 200 with { posts, nextCursor, isColdStart } on success", async () => {
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof MOCK_FEED_PAGE };
    expect(body.data.posts).toHaveLength(1);
    expect(body.data.nextCursor).toBeNull();
    expect(body.data.isColdStart).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("passes sort=algorithmic query param correctly to getFeed", async () => {
    await GET(makeGetRequest("sort=algorithmic"));

    expect(mockGetFeed).toHaveBeenCalledWith(
      VIEWER_ID,
      expect.objectContaining({ sort: "algorithmic" }),
    );
  });

  it("passes filter=announcements query param correctly to getFeed", async () => {
    await GET(makeGetRequest("filter=announcements"));

    expect(mockGetFeed).toHaveBeenCalledWith(
      VIEWER_ID,
      expect.objectContaining({ filter: "announcements" }),
    );
  });

  it("passes cursor query param correctly to getFeed", async () => {
    const cursor = "dGVzdGN1cnNvcg=="; // base64 test cursor
    await GET(makeGetRequest(`cursor=${cursor}`));

    expect(mockGetFeed).toHaveBeenCalledWith(VIEWER_ID, expect.objectContaining({ cursor }));
  });

  it("returns 400 for invalid sort param", async () => {
    const res = await GET(makeGetRequest("sort=invalid"));
    expect(res.status).toBe(400);
    expect(mockGetFeed).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid filter param", async () => {
    const res = await GET(makeGetRequest("filter=badvalue"));
    expect(res.status).toBe(400);
    expect(mockGetFeed).not.toHaveBeenCalled();
  });

  it("clamps limit to max 50", async () => {
    await GET(makeGetRequest("limit=100"));

    expect(mockGetFeed).toHaveBeenCalledWith(VIEWER_ID, expect.objectContaining({ limit: 50 }));
  });

  it("does NOT require Origin header (read-only, no CSRF needed)", async () => {
    // GET with no Origin header should still succeed
    const req = new Request("https://example.com/api/v1/feed", {
      method: "GET",
      headers: { Host: "example.com" },
      // No Origin header
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
