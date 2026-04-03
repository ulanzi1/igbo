// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
vi.mock("@/services/rate-limiter", () => ({
  applyRateLimit: vi.fn(),
  RATE_LIMIT_PRESETS: { POST_BOOKMARK: { maxRequests: 30, windowMs: 60_000 } },
}));
vi.mock("@/services/bookmark-service", () => ({ toggleBookmark: vi.fn() }));

import { toggleBookmarkAction } from "./toggle-bookmark";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { applyRateLimit } from "@/services/rate-limiter";
import { toggleBookmark } from "@/services/bookmark-service";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockApplyRateLimit = vi.mocked(applyRateLimit);
const mockToggleBookmark = vi.mocked(toggleBookmark);

const USER_ID = "00000000-0000-4000-8000-000000000001";
const POST_ID = "00000000-0000-4000-8000-000000000002";

const allowedRateLimit = { allowed: true, limit: 30, remaining: 29, retryAfter: null };

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockApplyRateLimit.mockReset();
  mockToggleBookmark.mockReset();
  // Default: authenticated
  mockRequireAuth.mockResolvedValue({ userId: USER_ID, role: "MEMBER" } as Awaited<
    ReturnType<typeof requireAuthenticatedSession>
  >);
  // Default: rate limit allowed
  mockApplyRateLimit.mockResolvedValue(
    allowedRateLimit as Awaited<ReturnType<typeof applyRateLimit>>,
  );
});

describe("toggleBookmarkAction", () => {
  it("returns VALIDATION_ERROR when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));

    const result = await toggleBookmarkAction({ postId: POST_ID });

    expect(result).toEqual({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Unauthorized",
    });
    expect(mockToggleBookmark).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR when rate limited", async () => {
    mockApplyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 30,
      remaining: 0,
      retryAfter: 60,
    } as Awaited<ReturnType<typeof applyRateLimit>>);

    const result = await toggleBookmarkAction({ postId: POST_ID });

    expect(result).toEqual({
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: "Rate limit exceeded",
    });
  });

  it("returns VALIDATION_ERROR for non-UUID postId", async () => {
    const result = await toggleBookmarkAction({ postId: "not-a-uuid" });

    expect(result).toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
    });
    expect(mockToggleBookmark).not.toHaveBeenCalled();
  });

  it("calls toggleBookmark with correct userId and postId", async () => {
    mockToggleBookmark.mockResolvedValueOnce({ bookmarked: true });

    await toggleBookmarkAction({ postId: POST_ID });

    expect(mockToggleBookmark).toHaveBeenCalledWith(USER_ID, POST_ID);
  });

  it("returns { bookmarked: true } when service returns bookmarked", async () => {
    mockToggleBookmark.mockResolvedValueOnce({ bookmarked: true });

    const result = await toggleBookmarkAction({ postId: POST_ID });

    expect(result).toEqual({ bookmarked: true });
  });

  it("returns { bookmarked: false } when service returns un-bookmarked", async () => {
    mockToggleBookmark.mockResolvedValueOnce({ bookmarked: false });

    const result = await toggleBookmarkAction({ postId: POST_ID });

    expect(result).toEqual({ bookmarked: false });
  });
});
