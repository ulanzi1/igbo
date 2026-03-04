// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reactToPost,
  addComment,
  deleteComment,
  repostToFeed,
  shareToConversation,
} from "./post-interaction-service";

vi.mock("server-only", () => ({}));
vi.mock("@/db/queries/post-interactions", () => ({
  toggleReaction: vi.fn(),
  insertComment: vi.fn(),
  softDeleteComment: vi.fn(),
  getComments: vi.fn(),
  incrementShareCount: vi.fn(),
  getOriginalPostEmbed: vi.fn(),
}));
vi.mock("@/db/queries/posts", () => ({
  insertPost: vi.fn(),
  getPostGroupId: vi.fn(),
}));
vi.mock("@/db/queries/groups", () => ({
  getGroupMemberFull: vi.fn(),
}));
vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

import {
  toggleReaction,
  insertComment,
  softDeleteComment,
  incrementShareCount,
  getOriginalPostEmbed,
} from "@/db/queries/post-interactions";
import { insertPost, getPostGroupId } from "@/db/queries/posts";
import { getGroupMemberFull } from "@/db/queries/groups";
import { eventBus } from "@/services/event-bus";

const mockToggleReaction = vi.mocked(toggleReaction);
const mockInsertComment = vi.mocked(insertComment);
const mockSoftDeleteComment = vi.mocked(softDeleteComment);
const mockIncrementShareCount = vi.mocked(incrementShareCount);
const mockGetOriginalPostEmbed = vi.mocked(getOriginalPostEmbed);
const mockInsertPost = vi.mocked(insertPost);
const mockGetPostGroupId = vi.mocked(getPostGroupId);
const mockGetGroupMemberFull = vi.mocked(getGroupMemberFull);
const mockEventBusEmit = vi.mocked(eventBus.emit);

beforeEach(() => {
  mockToggleReaction.mockReset();
  mockInsertComment.mockReset();
  mockSoftDeleteComment.mockReset();
  mockIncrementShareCount.mockReset();
  mockGetOriginalPostEmbed.mockReset();
  mockInsertPost.mockReset();
  mockGetPostGroupId.mockReset();
  mockGetGroupMemberFull.mockReset();
  mockEventBusEmit.mockReset();

  // Default: non-group post (skip muted/banned check)
  mockGetPostGroupId.mockResolvedValue(null);
});

// ─── reactToPost ──────────────────────────────────────────────────────────────

describe("reactToPost", () => {
  it("calls toggleReaction with correct args and returns result", async () => {
    mockToggleReaction.mockResolvedValue({ newReactionType: "like", countDelta: 1 });
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await reactToPost("post-1", "user-1", "like");

    expect(mockToggleReaction).toHaveBeenCalledWith("post-1", "user-1", "like");
    expect(result).toEqual({ newReactionType: "like", countDelta: 1 });
  });

  it("emits post.reacted when reaction is added (countDelta=1)", async () => {
    mockToggleReaction.mockResolvedValue({ newReactionType: "like", countDelta: 1 });
    mockEventBusEmit.mockResolvedValue(undefined);

    await reactToPost("post-1", "user-1", "like");

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "post.reacted",
      expect.objectContaining({ postId: "post-1", userId: "user-1", reaction: "like" }),
    );
  });

  it("emits post.reacted when reaction is changed (countDelta=0)", async () => {
    mockToggleReaction.mockResolvedValue({ newReactionType: "love", countDelta: 0 });
    mockEventBusEmit.mockResolvedValue(undefined);

    await reactToPost("post-1", "user-1", "love");

    expect(mockEventBusEmit).toHaveBeenCalledWith("post.reacted", expect.any(Object));
  });

  it("does NOT emit when reaction is removed (newReactionType=null)", async () => {
    mockToggleReaction.mockResolvedValue({ newReactionType: null, countDelta: -1 });

    await reactToPost("post-1", "user-1", "like");

    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("does not throw if EventBus fails", async () => {
    mockToggleReaction.mockResolvedValue({ newReactionType: "like", countDelta: 1 });
    mockEventBusEmit.mockRejectedValue(new Error("Bus down"));

    await expect(reactToPost("post-1", "user-1", "like")).resolves.toEqual({
      newReactionType: "like",
      countDelta: 1,
    });
  });
});

// ─── addComment ───────────────────────────────────────────────────────────────

describe("addComment", () => {
  const commentRow = {
    id: "comment-1",
    postId: "post-1",
    authorId: "user-1",
    content: "Hello",
    parentCommentId: null,
    deletedAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
  };

  it("returns success result with comment data", async () => {
    mockInsertComment.mockResolvedValue(commentRow);
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await addComment("post-1", "user-1", "Hello");

    expect(result).toMatchObject({
      success: true,
      comment: {
        id: "comment-1",
        postId: "post-1",
        content: "Hello",
        parentCommentId: null,
      },
    });
  });

  it("emits post.commented on success", async () => {
    mockInsertComment.mockResolvedValue(commentRow);
    mockEventBusEmit.mockResolvedValue(undefined);

    await addComment("post-1", "user-1", "Hello");

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "post.commented",
      expect.objectContaining({ postId: "post-1", commentId: "comment-1", userId: "user-1" }),
    );
  });

  it("returns PARENT_NOT_FOUND when parent validation fails", async () => {
    mockInsertComment.mockRejectedValue(
      new Error("Parent comment not found or belongs to different post"),
    );

    const result = await addComment("post-1", "user-1", "Hello", "bad-parent");

    expect(result).toMatchObject({ success: false, errorCode: "PARENT_NOT_FOUND" });
  });

  it("does not throw if EventBus fails", async () => {
    mockInsertComment.mockResolvedValue(commentRow);
    mockEventBusEmit.mockRejectedValue(new Error("Bus down"));

    await expect(addComment("post-1", "user-1", "Hello")).resolves.toMatchObject({
      success: true,
    });
  });

  it("returns GROUP_MODERATION error when commenting on group post while banned", async () => {
    mockGetPostGroupId.mockResolvedValue("group-1");
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "banned",
      mutedUntil: null,
    });

    const result = await addComment("post-1", "user-1", "Hello");

    expect(result).toMatchObject({
      success: false,
      errorCode: "GROUP_MODERATION",
      reason: "Groups.moderation.bannedCannotComment",
    });
  });

  it("returns GROUP_MODERATION error when commenting on group post while muted", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    mockGetPostGroupId.mockResolvedValue("group-1");
    mockGetGroupMemberFull.mockResolvedValue({
      role: "member",
      status: "active",
      mutedUntil: futureDate,
    });

    const result = await addComment("post-1", "user-1", "Hello");

    expect(result).toMatchObject({
      success: false,
      errorCode: "GROUP_MODERATION",
      reason: "Groups.moderation.mutedCannotComment",
    });
  });

  it("allows commenting on non-group posts without membership check", async () => {
    mockGetPostGroupId.mockResolvedValue(null);
    mockInsertComment.mockResolvedValue(commentRow);
    mockEventBusEmit.mockResolvedValue(undefined);

    const result = await addComment("post-1", "user-1", "Hello");

    expect(result).toMatchObject({ success: true });
    expect(mockGetGroupMemberFull).not.toHaveBeenCalled();
  });
});

// ─── deleteComment ────────────────────────────────────────────────────────────

describe("deleteComment", () => {
  it("returns { deleted: true } when soft delete succeeds", async () => {
    mockSoftDeleteComment.mockResolvedValue(true);
    const result = await deleteComment("comment-1", "user-1");
    expect(result).toEqual({ deleted: true });
  });

  it("returns { deleted: false } when not authorized", async () => {
    mockSoftDeleteComment.mockResolvedValue(false);
    const result = await deleteComment("comment-1", "other-user");
    expect(result).toEqual({ deleted: false });
  });
});

// ─── repostToFeed ─────────────────────────────────────────────────────────────

describe("repostToFeed", () => {
  it("returns ORIGINAL_NOT_FOUND when post doesn't exist", async () => {
    mockGetOriginalPostEmbed.mockResolvedValue(null);

    const result = await repostToFeed("post-1", "user-1");

    expect(result).toMatchObject({ success: false, errorCode: "ORIGINAL_NOT_FOUND" });
  });

  it("calls insertPost with originalPostId and increments shareCount", async () => {
    mockGetOriginalPostEmbed.mockResolvedValue({
      id: "post-1",
      content: "Original",
      contentType: "text",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
      media: [],
    });
    mockInsertPost.mockResolvedValue({ id: "repost-1" } as ReturnType<
      typeof mockInsertPost
    > extends Promise<infer T>
      ? T
      : never);
    mockIncrementShareCount.mockResolvedValue(undefined);

    await repostToFeed("post-1", "user-2", "My thoughts");

    expect(mockInsertPost).toHaveBeenCalledWith(
      expect.objectContaining({ originalPostId: "post-1", authorId: "user-2" }),
    );
    expect(mockIncrementShareCount).toHaveBeenCalledWith("post-1");
  });

  it("returns success with new postId", async () => {
    mockGetOriginalPostEmbed.mockResolvedValue({
      id: "post-1",
      content: "Original",
      contentType: "text",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
      media: [],
    });
    mockInsertPost.mockResolvedValue({ id: "repost-1" } as ReturnType<
      typeof mockInsertPost
    > extends Promise<infer T>
      ? T
      : never);
    mockIncrementShareCount.mockResolvedValue(undefined);

    const result = await repostToFeed("post-1", "user-2");

    expect(result).toEqual({ success: true, postId: "repost-1" });
  });
});

// ─── shareToConversation ──────────────────────────────────────────────────────

// Mock the message-service module at the top level so the dynamic import resolves correctly
const mockSendMessage = vi.fn();
vi.mock("@/services/message-service", () => ({
  messageService: { sendMessage: mockSendMessage },
}));

describe("shareToConversation", () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
    mockSendMessage.mockResolvedValue({});
  });

  it("sends DM with shared_post payload and increments shareCount on success", async () => {
    mockGetOriginalPostEmbed.mockResolvedValue({
      id: "post-1",
      content: "Hello",
      contentType: "text",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
      media: [{ mediaUrl: "https://example.com/img.jpg", mediaType: "image", altText: "Photo" }],
    });
    mockIncrementShareCount.mockResolvedValue(undefined);

    const result = await shareToConversation("post-1", "user-1", "conv-1", "https://example.com");

    expect(result).toEqual({ success: true });
    expect(mockGetOriginalPostEmbed).toHaveBeenCalledWith("post-1");
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        senderId: "user-1",
        contentType: "shared_post",
      }),
    );
    // Verify JSON payload contains post data and media
    const payload = JSON.parse(mockSendMessage.mock.calls[0]![0].content);
    expect(payload.postId).toBe("post-1");
    expect(payload.postUrl).toBe("https://example.com/feed?post=post-1");
    expect(payload.authorName).toBe("Ada");
    expect(payload.media).toHaveLength(1);
    expect(payload.media[0].mediaUrl).toBe("https://example.com/img.jpg");
    expect(mockIncrementShareCount).toHaveBeenCalledWith("post-1");
  });

  it("returns failure when post not found", async () => {
    mockGetOriginalPostEmbed.mockResolvedValue(null);

    const result = await shareToConversation("post-1", "user-1", "conv-1", "https://example.com");

    expect(result).toEqual({ success: false, reason: "Post not found or deleted" });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("returns failure when sendMessage throws", async () => {
    mockGetOriginalPostEmbed.mockResolvedValue({
      id: "post-1",
      content: "Hello",
      contentType: "text",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
      media: [],
    });
    mockSendMessage.mockRejectedValue(new Error("Network error"));

    const result = await shareToConversation("post-1", "user-1", "conv-1", "https://example.com");

    expect(result).toEqual({ success: false, reason: "Failed to share post" });
  });
});
