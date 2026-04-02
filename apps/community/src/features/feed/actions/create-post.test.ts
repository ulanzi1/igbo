// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn(),
}));

vi.mock("@/services/rate-limiter", () => ({
  applyRateLimit: vi.fn(),
  RATE_LIMIT_PRESETS: { POST_CREATE: { maxRequests: 5, windowMs: 60_000 } },
}));

vi.mock("@/services/post-service", () => ({
  createFeedPost: vi.fn(),
}));

import { createPost } from "./create-post";
import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit } from "@/services/rate-limiter";
import { createFeedPost } from "@/services/post-service";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockApplyRateLimit = vi.mocked(applyRateLimit);
const mockCreateFeedPost = vi.mocked(createFeedPost);

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockApplyRateLimit.mockReset();
  mockCreateFeedPost.mockReset();
  // Default: rate limit passes
  mockApplyRateLimit.mockResolvedValue({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  });
});

const validInput = {
  content: "Hello world",
  contentType: "text" as const,
  category: "discussion" as const,
};

describe("createPost server action", () => {
  it("returns VALIDATION_ERROR when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));

    const result = await createPost(validInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
      expect(result.reason).toBe("Unauthorized");
    }
  });

  it("returns VALIDATION_ERROR for empty content", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });

    const result = await createPost({ ...validInput, content: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
    }
  });

  it("returns VALIDATION_ERROR for content > 10,000 chars", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });

    const result = await createPost({ ...validInput, content: "x".repeat(10_001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
    }
  });

  it("returns VALIDATION_ERROR for invalid category value", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });

    const result = await createPost({ ...validInput, category: "invalid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
    }
  });

  it("returns VALIDATION_ERROR when fileUploadIds and mediaTypes have mismatched lengths", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });

    const result = await createPost({
      ...validInput,
      fileUploadIds: [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
      ],
      mediaTypes: ["image"], // Only 1 type for 2 IDs
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
    }
  });

  it("returns VALIDATION_ERROR for too many fileUploadIds (> 4)", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });

    const result = await createPost({
      ...validInput,
      fileUploadIds: [
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
        "00000000-0000-0000-0000-000000000005",
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
    }
  });

  it("calls createFeedPost with correct authorId and parsed data on valid input", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-42", role: "MEMBER" });
    mockCreateFeedPost.mockResolvedValue({ success: true, postId: "post-1" });

    await createPost(validInput);

    expect(mockCreateFeedPost).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "user-42",
        content: "Hello world",
        contentType: "text",
        category: "discussion",
      }),
    );
  });

  it("returns createFeedPost result on success", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockCreateFeedPost.mockResolvedValue({ success: true, postId: "post-xyz" });

    const result = await createPost(validInput);
    expect(result).toEqual({ success: true, postId: "post-xyz" });
  });

  it("passes through TIER_BLOCKED error from createFeedPost", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockCreateFeedPost.mockResolvedValue({
      success: false,
      errorCode: "TIER_BLOCKED",
      reason: "Permissions.feedPostRequired",
    });

    const result = await createPost(validInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("TIER_BLOCKED");
    }
  });

  it("returns VALIDATION_ERROR when rate limit is exceeded", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER" });
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const result = await createPost(validInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
      expect(result.reason).toBe("Rate limit exceeded");
    }
  });

  it("calls applyRateLimit with post-create:{userId} key", async () => {
    mockRequireAuth.mockResolvedValue({ userId: "user-99", role: "MEMBER" });
    mockCreateFeedPost.mockResolvedValue({ success: true, postId: "post-1" });

    await createPost(validInput);

    expect(mockApplyRateLimit).toHaveBeenCalledWith(
      "post-create:user-99",
      expect.objectContaining({ maxRequests: 5 }),
    );
  });
});
