// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@/services/post-interaction-service", () => ({
  getPostComments: vi.fn(),
}));
vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { POST_COMMENTS_READ: { maxRequests: 60, windowMs: 60_000 } },
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
import { getPostComments } from "@/services/post-interaction-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetPostComments = vi.mocked(getPostComments);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(postId: string, params = "") {
  return new Request(`http://localhost/api/v1/posts/${postId}/comments${params}`);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetPostComments.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
});

describe("GET /api/v1/posts/[postId]/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await GET(makeRequest(POST_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid postId", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns paginated comments on success", async () => {
    mockGetPostComments.mockResolvedValue({ comments: [], nextCursor: null });

    const res = await GET(makeRequest(POST_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ comments: [], nextCursor: null });
  });

  it("passes cursor and limit query params to service", async () => {
    mockGetPostComments.mockResolvedValue({ comments: [], nextCursor: null });

    await GET(makeRequest(POST_ID, "?limit=20&cursor=2026-01-01T00:00:00Z"));

    expect(mockGetPostComments).toHaveBeenCalledWith(
      POST_ID,
      expect.objectContaining({ limit: 20, cursor: "2026-01-01T00:00:00Z" }),
    );
  });
});
