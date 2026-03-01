// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/services/permissions", () => ({
  canCreateFeedPost: vi.fn(),
  getMaxFeedPostsPerWeek: vi.fn(),
}));

vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn(),
}));

vi.mock("@/db/queries/posts", () => ({
  getWeeklyFeedPostCount: vi.fn(),
  insertPost: vi.fn(),
  insertPostMedia: vi.fn(),
  resolveFileUploadUrls: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

import { createFeedPost } from "./post-service";
import { canCreateFeedPost, getMaxFeedPostsPerWeek } from "@/services/permissions";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import {
  getWeeklyFeedPostCount,
  insertPost,
  insertPostMedia,
  resolveFileUploadUrls,
} from "@/db/queries/posts";
import { eventBus } from "@/services/event-bus";

const mockCanCreateFeedPost = vi.mocked(canCreateFeedPost);
const mockGetMaxFeedPostsPerWeek = vi.mocked(getMaxFeedPostsPerWeek);
const mockGetUserMembershipTier = vi.mocked(getUserMembershipTier);
const mockGetWeeklyFeedPostCount = vi.mocked(getWeeklyFeedPostCount);
const mockInsertPost = vi.mocked(insertPost);
const mockInsertPostMedia = vi.mocked(insertPostMedia);
const mockResolveFileUploadUrls = vi.mocked(resolveFileUploadUrls);
const mockEventBusEmit = vi.mocked(eventBus.emit);

beforeEach(() => {
  mockCanCreateFeedPost.mockReset();
  mockGetMaxFeedPostsPerWeek.mockReset();
  mockGetUserMembershipTier.mockReset();
  mockGetWeeklyFeedPostCount.mockReset();
  mockInsertPost.mockReset();
  mockInsertPostMedia.mockReset();
  mockResolveFileUploadUrls.mockReset();
  mockEventBusEmit.mockReset();
});

const baseInput = {
  authorId: "user-1",
  content: "Hello world",
  contentType: "text" as const,
  category: "discussion" as const,
};

function setupHappyPath(options: { weeklyCount?: number; limit?: number; tier?: string } = {}) {
  const { weeklyCount = 0, limit = 1, tier = "PROFESSIONAL" } = options;
  mockCanCreateFeedPost.mockResolvedValue({ allowed: true });
  mockGetUserMembershipTier.mockResolvedValue(tier as "BASIC" | "PROFESSIONAL" | "TOP_TIER");
  mockGetMaxFeedPostsPerWeek.mockReturnValue(limit);
  mockGetWeeklyFeedPostCount.mockResolvedValue(weeklyCount);
  mockResolveFileUploadUrls.mockResolvedValue(new Map());
  mockInsertPost.mockResolvedValue({ id: "post-1" } as Awaited<ReturnType<typeof insertPost>>);
  mockInsertPostMedia.mockResolvedValue(undefined);
  mockEventBusEmit.mockResolvedValue(undefined);
}

describe("createFeedPost", () => {
  it("returns TIER_BLOCKED when canCreateFeedPost returns { allowed: false }", async () => {
    mockCanCreateFeedPost.mockResolvedValue({
      allowed: false,
      reason: "Permissions.feedPostRequired",
      tierRequired: "PROFESSIONAL",
    });

    const result = await createFeedPost(baseInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("TIER_BLOCKED");
    }
  });

  it("returns LIMIT_REACHED when PROFESSIONAL is at count 1 (limit 1)", async () => {
    mockCanCreateFeedPost.mockResolvedValue({ allowed: true });
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    mockGetMaxFeedPostsPerWeek.mockReturnValue(1);
    mockGetWeeklyFeedPostCount.mockResolvedValue(1); // already at limit

    const result = await createFeedPost(baseInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("LIMIT_REACHED");
    }
  });

  it("returns LIMIT_REACHED when TOP_TIER is at count 2 (limit 2)", async () => {
    mockCanCreateFeedPost.mockResolvedValue({ allowed: true });
    mockGetUserMembershipTier.mockResolvedValue("TOP_TIER");
    mockGetMaxFeedPostsPerWeek.mockReturnValue(2);
    mockGetWeeklyFeedPostCount.mockResolvedValue(2); // already at limit

    const result = await createFeedPost(baseInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("LIMIT_REACHED");
    }
  });

  it("includes resetDate (next Monday ISO) in LIMIT_REACHED response", async () => {
    mockCanCreateFeedPost.mockResolvedValue({ allowed: true });
    mockGetUserMembershipTier.mockResolvedValue("PROFESSIONAL");
    mockGetMaxFeedPostsPerWeek.mockReturnValue(1);
    mockGetWeeklyFeedPostCount.mockResolvedValue(1);

    const result = await createFeedPost(baseInput);
    expect(result.success).toBe(false);
    if (!result.success && result.errorCode === "LIMIT_REACHED") {
      expect(result.resetDate).toBeDefined();
      // Should be a valid ISO date string
      expect(new Date(result.resetDate!).toISOString()).toBe(result.resetDate);
    }
  });

  it("returns { success: true, postId } when within limits", async () => {
    setupHappyPath();

    const result = await createFeedPost(baseInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.postId).toBe("post-1");
    }
  });

  it("calls insertPost with correct fields", async () => {
    setupHappyPath();

    await createFeedPost({
      ...baseInput,
      content: "My content",
      category: "event",
    });

    expect(mockInsertPost).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: "user-1",
        content: "My content",
        category: "event",
        visibility: "members_only",
      }),
    );
  });

  it("calls insertPostMedia with resolved media URLs", async () => {
    setupHappyPath();
    mockResolveFileUploadUrls.mockResolvedValue(
      new Map([
        ["file-1", { mediaUrl: "https://cdn.example.com/img.webp", fileType: "image/jpeg" }],
      ]),
    );

    await createFeedPost({
      ...baseInput,
      fileUploadIds: ["file-1"],
      mediaTypes: ["image"],
    });

    expect(mockInsertPostMedia).toHaveBeenCalledWith(
      "post-1",
      expect.arrayContaining([
        expect.objectContaining({
          mediaUrl: "https://cdn.example.com/img.webp",
          mediaType: "image",
          sortOrder: 0,
        }),
      ]),
    );
  });

  it("skips insertPostMedia when no media", async () => {
    setupHappyPath();

    await createFeedPost(baseInput);

    expect(mockInsertPostMedia).toHaveBeenCalledWith("post-1", []);
  });

  it("emits post.published via EventBus on success", async () => {
    setupHappyPath();

    await createFeedPost(baseInput);

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "post.published",
      expect.objectContaining({
        postId: "post-1",
        authorId: "user-1",
        category: "discussion",
      }),
    );
  });

  it("does NOT throw if EventBus emit fails (non-critical)", async () => {
    setupHappyPath();
    mockEventBusEmit.mockRejectedValue(new Error("Bus down"));

    await expect(createFeedPost(baseInput)).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
  });

  it("sets contentType to 'media' when files are attached and input is 'text'", async () => {
    setupHappyPath();
    mockResolveFileUploadUrls.mockResolvedValue(
      new Map([
        ["file-1", { mediaUrl: "https://cdn.example.com/img.webp", fileType: "image/jpeg" }],
      ]),
    );

    await createFeedPost({
      ...baseInput,
      contentType: "text",
      fileUploadIds: ["file-1"],
      mediaTypes: ["image"],
    });

    expect(mockInsertPost).toHaveBeenCalledWith(expect.objectContaining({ contentType: "media" }));
  });

  it("preserves rich_text contentType even when files are attached", async () => {
    setupHappyPath();
    mockResolveFileUploadUrls.mockResolvedValue(
      new Map([
        ["file-1", { mediaUrl: "https://cdn.example.com/img.webp", fileType: "image/jpeg" }],
      ]),
    );

    await createFeedPost({
      ...baseInput,
      contentType: "rich_text",
      fileUploadIds: ["file-1"],
      mediaTypes: ["image"],
    });

    expect(mockInsertPost).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "rich_text" }),
    );
  });
});
