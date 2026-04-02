// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@igbo/db/queries/post-interactions", () => ({
  getViewerReaction: vi.fn(),
  getReactionCounts: vi.fn(),
}));
vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { POST_REACTIONS_READ: { maxRequests: 60, windowMs: 60_000 } },
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000, limit: 60 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getViewerReaction, getReactionCounts } from "@igbo/db/queries/post-interactions";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetViewerReaction = vi.mocked(getViewerReaction);
const mockGetReactionCounts = vi.mocked(getReactionCounts);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(postId: string) {
  return new Request(`http://localhost/api/v1/posts/${postId}/reactions/me`);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetViewerReaction.mockReset();
  mockGetReactionCounts.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
});

describe("GET /api/v1/posts/[postId]/reactions/me", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await GET(makeRequest(POST_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid postId", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns { userReaction, counts } on success", async () => {
    mockGetViewerReaction.mockResolvedValue("like");
    mockGetReactionCounts.mockResolvedValue({
      like: 3,
      love: 1,
      celebrate: 0,
      insightful: 0,
      funny: 0,
    });

    const res = await GET(makeRequest(POST_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({
      userReaction: "like",
      counts: { like: 3, love: 1, celebrate: 0, insightful: 0, funny: 0 },
    });
  });
});
