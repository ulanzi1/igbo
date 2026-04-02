// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/services/permissions", () => ({
  canCreateFeedPost: vi.fn(),
  getMaxFeedPostsPerWeek: vi.fn(),
}));

vi.mock("@igbo/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn(),
}));

vi.mock("@igbo/db/queries/posts", () => ({
  getWeeklyFeedPostCount: vi.fn(),
  insertPost: vi.fn(),
  insertPostMedia: vi.fn(),
  resolveFileUploadUrls: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@igbo/db/queries/groups", () => ({
  getGroupById: vi.fn(),
  getGroupMember: vi.fn(),
  getGroupMemberFull: vi.fn(),
}));

import { createFeedPost, createGroupPost } from "./post-service";
import { canCreateFeedPost, getMaxFeedPostsPerWeek } from "@/services/permissions";
import { getUserMembershipTier } from "@igbo/db/queries/auth-permissions";
import {
  getWeeklyFeedPostCount,
  insertPost,
  insertPostMedia,
  resolveFileUploadUrls,
} from "@igbo/db/queries/posts";
import { eventBus } from "@/services/event-bus";
import { getGroupById, getGroupMember, getGroupMemberFull } from "@igbo/db/queries/groups";

const mockCanCreateFeedPost = vi.mocked(canCreateFeedPost);
const mockGetGroupById = vi.mocked(getGroupById);
const mockGetGroupMember = vi.mocked(getGroupMember);
const mockGetGroupMemberFull = vi.mocked(getGroupMemberFull);
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
  mockGetGroupById.mockReset();
  mockGetGroupMember.mockReset();
  mockGetGroupMemberFull.mockReset();
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

// ─── createGroupPost ────────────────────────────────────────────────────────

const groupPostInput = {
  authorId: "user-1",
  groupId: "group-1",
  content: "Group post",
  contentType: "text" as const,
  category: "discussion" as const,
};

const makeGroup = (overrides = {}) => ({
  id: "group-1",
  name: "Test Group",
  visibility: "public",
  joinType: "open",
  postingPermission: "all_members",
  memberCount: 5,
  memberLimit: null,
  ...overrides,
});

describe("createGroupPost", () => {
  it("returns error when group not found", async () => {
    mockGetGroupById.mockResolvedValue(null);

    const result = await createGroupPost(groupPostInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("INTERNAL_ERROR");
    }
  });

  it("returns error when user is not an active member", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup() as Awaited<ReturnType<typeof getGroupById>>);
    mockGetGroupMemberFull.mockResolvedValue(null);

    const result = await createGroupPost(groupPostInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("TIER_BLOCKED");
    }
  });

  it("returns error when member is muted", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    mockGetGroupById.mockResolvedValue(makeGroup() as Awaited<ReturnType<typeof getGroupById>>);
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: futureDate,
    });

    const result = await createGroupPost(groupPostInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("TIER_BLOCKED");
      expect(result.reason).toBe("Groups.moderation.mutedCannotPost");
    }
  });

  it("returns error when member is banned", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup() as Awaited<ReturnType<typeof getGroupById>>);
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "banned",
      mutedUntil: null,
    });

    const result = await createGroupPost(groupPostInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("TIER_BLOCKED");
      expect(result.reason).toBe("Groups.moderation.bannedCannotPost");
    }
  });

  it("returns error when posting is leaders_only and user is a member", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ postingPermission: "leaders_only" }) as Awaited<ReturnType<typeof getGroupById>>,
    );
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: null,
    });

    const result = await createGroupPost(groupPostInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("TIER_BLOCKED");
    }
  });

  it("allows leader to post when posting is leaders_only", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ postingPermission: "leaders_only" }) as Awaited<ReturnType<typeof getGroupById>>,
    );
    mockGetGroupMemberFull.mockResolvedValue({
      role: "leader",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-1" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await createGroupPost(groupPostInput);
    expect(result.success).toBe(true);
  });

  it("creates a post with visibility 'group' and groupId", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup() as Awaited<ReturnType<typeof getGroupById>>);
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-1" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await createGroupPost(groupPostInput);
    expect(result).toEqual({ success: true, postId: "post-1", status: "active" });
    expect(mockInsertPost).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: "group",
        groupId: "group-1",
        authorId: "user-1",
        status: "active",
      }),
    );
  });

  it("emits post.published with groupId", async () => {
    mockGetGroupById.mockResolvedValue(makeGroup() as Awaited<ReturnType<typeof getGroupById>>);
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-1" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);
    mockEventBusEmit.mockResolvedValue(undefined);

    await createGroupPost(groupPostInput);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "post.published",
      expect.objectContaining({ postId: "post-1", groupId: "group-1" }),
    );
  });

  // ── postingPermission = 'moderated' (CP-1 fix) ──

  it("holds member post as pending_approval in moderated group", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ postingPermission: "moderated" }) as Awaited<ReturnType<typeof getGroupById>>,
    );
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-2" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);

    const result = await createGroupPost(groupPostInput);
    expect(result).toEqual({ success: true, postId: "post-2", status: "pending_approval" });
    expect(mockInsertPost).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_approval" }),
    );
  });

  it("does NOT emit post.published for pending_approval posts", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ postingPermission: "moderated" }) as Awaited<ReturnType<typeof getGroupById>>,
    );
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-2" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);

    await createGroupPost(groupPostInput);
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("allows leader to post as active in moderated group", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ postingPermission: "moderated" }) as Awaited<ReturnType<typeof getGroupById>>,
    );
    mockGetGroupMemberFull.mockResolvedValue({
      role: "leader",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-3" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await createGroupPost(groupPostInput);
    expect(result).toEqual({ success: true, postId: "post-3", status: "active" });
    expect(mockInsertPost).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "post.published",
      expect.objectContaining({ postId: "post-3" }),
    );
  });

  it("all_members group: member posts with active status directly", async () => {
    mockGetGroupById.mockResolvedValue(
      makeGroup({ postingPermission: "all_members" }) as Awaited<ReturnType<typeof getGroupById>>,
    );
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: null,
    });
    mockResolveFileUploadUrls.mockResolvedValue(new Map());
    mockInsertPost.mockResolvedValue({ id: "post-4" } as Awaited<ReturnType<typeof insertPost>>);
    mockInsertPostMedia.mockResolvedValue(undefined);
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await createGroupPost(groupPostInput);
    expect(result).toEqual({ success: true, postId: "post-4", status: "active" });
    expect(mockInsertPost).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });
});
