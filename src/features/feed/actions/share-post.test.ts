// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { repostAction, shareToConversationAction } from "./share-post";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
vi.mock("@/services/rate-limiter", () => ({
  applyRateLimit: vi.fn(),
  RATE_LIMIT_PRESETS: { POST_SHARE: { maxRequests: 10, windowMs: 60_000 } },
}));
vi.mock("@/services/post-interaction-service", () => ({
  repostToFeed: vi.fn(),
  shareToConversation: vi.fn(),
}));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://example.com" } }));

import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit } from "@/services/rate-limiter";
import { repostToFeed, shareToConversation } from "@/services/post-interaction-service";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockApplyRateLimit = vi.mocked(applyRateLimit);
const mockRepostToFeed = vi.mocked(repostToFeed);
const mockShareToConversation = vi.mocked(shareToConversation);

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockApplyRateLimit.mockReset();
  mockRepostToFeed.mockReset();
  mockShareToConversation.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockApplyRateLimit.mockResolvedValue({
    allowed: true,
    limit: 10,
    remaining: 9,
    retryAfter: null,
  });
});

const originalPostId = "550e8400-e29b-41d4-a716-446655440000";
const conversationId = "660e8400-e29b-41d4-a716-446655440001";

describe("repostAction", () => {
  it("returns VALIDATION_ERROR when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const result = await repostAction({ originalPostId });

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Unauthorized",
    });
  });

  it("returns VALIDATION_ERROR when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfter: 30,
    });

    const result = await repostAction({ originalPostId });

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Rate limit exceeded",
    });
    expect(mockRepostToFeed).not.toHaveBeenCalled();
  });

  it("calls repostToFeed with originalPostId and commentText", async () => {
    mockRepostToFeed.mockResolvedValue({ success: true, postId: "repost-1" });

    await repostAction({ originalPostId, commentText: "My thoughts" });

    expect(mockRepostToFeed).toHaveBeenCalledWith(originalPostId, "user-1", "My thoughts");
  });

  it("handles ORIGINAL_NOT_FOUND from service", async () => {
    mockRepostToFeed.mockResolvedValue({
      success: false,
      errorCode: "ORIGINAL_NOT_FOUND",
      reason: "Original post not found or deleted",
    });

    const result = await repostAction({ originalPostId });

    expect(result).toMatchObject({ success: false, errorCode: "ORIGINAL_NOT_FOUND" });
  });
});

describe("shareToConversationAction", () => {
  it("returns failure when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const result = await shareToConversationAction({
      postId: originalPostId,
      conversationId,
    });

    expect(result).toMatchObject({ success: false, reason: "Unauthorized" });
  });

  it("returns failure when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfter: 30,
    });

    const result = await shareToConversationAction({ postId: originalPostId, conversationId });

    expect(result).toMatchObject({ success: false, reason: "Rate limit exceeded" });
    expect(mockShareToConversation).not.toHaveBeenCalled();
  });

  it("calls shareToConversation with correct args including appUrl", async () => {
    mockShareToConversation.mockResolvedValue({ success: true });

    await shareToConversationAction({ postId: originalPostId, conversationId });

    expect(mockShareToConversation).toHaveBeenCalledWith(
      originalPostId,
      "user-1",
      conversationId,
      "https://example.com",
    );
  });
});
