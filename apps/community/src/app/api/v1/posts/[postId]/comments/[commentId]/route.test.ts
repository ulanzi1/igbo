// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@/services/post-interaction-service", () => ({
  deleteComment: vi.fn(),
}));
vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: { POST_COMMENT_DELETE: { maxRequests: 20, windowMs: 60_000 } },
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000, limit: 20 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { DELETE } from "./route";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { deleteComment } from "@/services/post-interaction-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockDeleteComment = vi.mocked(deleteComment);

const POST_ID = "550e8400-e29b-41d4-a716-446655440000";
const COMMENT_ID = "660e8400-e29b-41d4-a716-446655440001";

function makeRequest(postId: string, commentId: string) {
  return new Request(`http://localhost/api/v1/posts/${postId}/comments/${commentId}`, {
    method: "DELETE",
    headers: { Origin: "http://localhost", Host: "localhost" },
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockDeleteComment.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
});

describe("DELETE /api/v1/posts/[postId]/comments/[commentId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await DELETE(makeRequest(POST_ID, COMMENT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid commentId", async () => {
    const res = await DELETE(makeRequest(POST_ID, "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 403 when comment not found or not authorized", async () => {
    mockDeleteComment.mockResolvedValue({ deleted: false });

    const res = await DELETE(makeRequest(POST_ID, COMMENT_ID));
    expect(res.status).toBe(403);
  });

  it("returns { deleted: true } on success", async () => {
    mockDeleteComment.mockResolvedValue({ deleted: true });

    const res = await DELETE(makeRequest(POST_ID, COMMENT_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual({ deleted: true });
  });
});
