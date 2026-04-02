// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { addCommentAction } from "./add-comment";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
vi.mock("@/services/rate-limiter", () => ({
  applyRateLimit: vi.fn(),
  RATE_LIMIT_PRESETS: { POST_COMMENT: { maxRequests: 20, windowMs: 60_000 } },
}));
vi.mock("@/services/post-interaction-service", () => ({
  addComment: vi.fn(),
}));

import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { applyRateLimit } from "@/services/rate-limiter";
import { addComment } from "@/services/post-interaction-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockApplyRateLimit = vi.mocked(applyRateLimit);
const mockAddComment = vi.mocked(addComment);

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockApplyRateLimit.mockReset();
  mockAddComment.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockApplyRateLimit.mockResolvedValue({
    allowed: true,
    limit: 20,
    remaining: 19,
    retryAfter: null,
  });
});

const postId = "550e8400-e29b-41d4-a716-446655440000";

describe("addCommentAction", () => {
  it("returns VALIDATION_ERROR when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const result = await addCommentAction({ postId, content: "Hello" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Unauthorized",
    });
  });

  it("returns VALIDATION_ERROR for empty content", async () => {
    const result = await addCommentAction({ postId, content: "" });

    expect(result).toMatchObject({ success: false, errorCode: "VALIDATION_ERROR" });
  });

  it("returns VALIDATION_ERROR when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 20,
      remaining: 0,
      retryAfter: 30,
    });

    const result = await addCommentAction({ postId, content: "Hello" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Rate limit exceeded",
    });
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR for content > 2000 chars", async () => {
    const result = await addCommentAction({ postId, content: "x".repeat(2001) });

    expect(result).toMatchObject({ success: false, errorCode: "VALIDATION_ERROR" });
  });

  it("calls addComment with correct authorId, content, parentCommentId", async () => {
    const parentId = "660e8400-e29b-41d4-a716-446655440001";
    mockAddComment.mockResolvedValue({
      success: true,
      comment: {
        id: "c1",
        postId,
        content: "Hello",
        parentCommentId: parentId,
        createdAt: "2026-03-01T00:00:00Z",
      },
    });

    await addCommentAction({ postId, content: "Hello", parentCommentId: parentId });

    expect(mockAddComment).toHaveBeenCalledWith(postId, "user-1", "Hello", parentId);
  });

  it("passes null for parentCommentId when not provided", async () => {
    mockAddComment.mockResolvedValue({
      success: true,
      comment: {
        id: "c1",
        postId,
        content: "Hello",
        parentCommentId: null,
        createdAt: "2026-03-01T00:00:00Z",
      },
    });

    await addCommentAction({ postId, content: "Hello" });

    expect(mockAddComment).toHaveBeenCalledWith(postId, "user-1", "Hello", undefined);
  });

  it("returns service success result", async () => {
    const successResult = {
      success: true as const,
      comment: {
        id: "c1",
        postId,
        content: "Hello",
        parentCommentId: null,
        createdAt: "2026-03-01T00:00:00Z",
      },
    };
    mockAddComment.mockResolvedValue(successResult);

    const result = await addCommentAction({ postId, content: "Hello" });

    expect(result).toEqual(successResult);
  });
});
