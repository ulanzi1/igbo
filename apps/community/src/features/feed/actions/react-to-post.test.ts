// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactToPostAction } from "./react-to-post";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
vi.mock("@/services/rate-limiter", () => ({
  applyRateLimit: vi.fn(),
  RATE_LIMIT_PRESETS: { POST_REACT: { maxRequests: 60, windowMs: 60_000 } },
}));
vi.mock("@/services/post-interaction-service", () => ({
  reactToPost: vi.fn(),
}));

import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { applyRateLimit } from "@/services/rate-limiter";
import { reactToPost } from "@/services/post-interaction-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockApplyRateLimit = vi.mocked(applyRateLimit);
const mockReactToPost = vi.mocked(reactToPost);

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockApplyRateLimit.mockReset();
  mockReactToPost.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockApplyRateLimit.mockResolvedValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    retryAfter: null,
  });
});

const validPayload = {
  postId: "550e8400-e29b-41d4-a716-446655440000",
  reactionType: "like" as const,
};

describe("reactToPostAction", () => {
  it("returns VALIDATION_ERROR when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const result = await reactToPostAction(validPayload);

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Unauthorized",
    });
  });

  it("returns VALIDATION_ERROR for invalid postId (not UUID)", async () => {
    const result = await reactToPostAction({ postId: "not-a-uuid", reactionType: "like" });

    expect(result).toMatchObject({ success: false, errorCode: "VALIDATION_ERROR" });
  });

  it("returns VALIDATION_ERROR for invalid reactionType", async () => {
    const result = await reactToPostAction({
      postId: validPayload.postId,
      reactionType: "explode",
    });

    expect(result).toMatchObject({ success: false, errorCode: "VALIDATION_ERROR" });
  });

  it("calls reactToPost with correct userId and parsed data", async () => {
    mockReactToPost.mockResolvedValue({ newReactionType: "like", countDelta: 1 });

    await reactToPostAction(validPayload);

    expect(mockReactToPost).toHaveBeenCalledWith(validPayload.postId, "user-1", "like");
  });

  it("returns VALIDATION_ERROR when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      retryAfter: 30,
    });

    const result = await reactToPostAction(validPayload);

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Rate limit exceeded",
    });
    expect(mockReactToPost).not.toHaveBeenCalled();
  });

  it("returns service result on success", async () => {
    mockReactToPost.mockResolvedValue({ newReactionType: "like", countDelta: 1 });

    const result = await reactToPostAction(validPayload);

    expect(result).toEqual({ newReactionType: "like", countDelta: 1 });
  });
});
