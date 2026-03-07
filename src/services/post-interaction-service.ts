import "server-only";
import {
  toggleReaction,
  insertComment,
  softDeleteComment,
  getComments,
  incrementShareCount,
  getOriginalPostEmbed,
  type ToggleReactionResult,
  type PostComment,
} from "@/db/queries/post-interactions";
import { insertPost, getPostGroupId, getPostAuthorId } from "@/db/queries/posts";
import { getGroupMemberFull } from "@/db/queries/groups";
import { eventBus } from "@/services/event-bus";
import { ApiError } from "@/lib/api-error";
import type { PostReactionType } from "@/db/schema/post-interactions";

export type { ToggleReactionResult, PostComment };

// ─── Reactions ────────────────────────────────────────────────────────────────

export interface ReactToPostResult {
  newReactionType: PostReactionType | null;
  countDelta: number; // +1 added, 0 changed, -1 removed
}

export async function reactToPost(
  postId: string,
  userId: string,
  reactionType: PostReactionType,
): Promise<ReactToPostResult> {
  // 1. Fetch authorId FIRST (needed for self-block and event emit)
  const authorId = await getPostAuthorId(postId);
  if (!authorId) {
    throw new ApiError({ title: "Post not found", status: 404 });
  }
  // 2. Block self-reactions (FR28 anti-gaming)
  if (userId === authorId) {
    throw new ApiError({ title: "You cannot react to your own content", status: 403 });
  }

  // 3. Toggle the reaction
  const result = await toggleReaction(postId, userId, reactionType);

  // 4. Emit post.reacted only when reaction is added or changed (not removed)
  // authorId already in scope — no second DB query needed
  if (result.newReactionType !== null) {
    try {
      await eventBus.emit("post.reacted", {
        postId,
        userId,
        reaction: result.newReactionType,
        timestamp: new Date().toISOString(),
        authorId,
      });
    } catch {
      // Non-critical — EventBus failure must not roll back the reaction
    }
  }

  return result;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface AddCommentResult {
  success: true;
  comment: {
    id: string;
    postId: string;
    content: string;
    parentCommentId: string | null;
    createdAt: string;
  };
}

export interface AddCommentError {
  success: false;
  errorCode: "PARENT_NOT_FOUND" | "GROUP_MODERATION" | "INTERNAL_ERROR";
  reason: string;
}

export async function addComment(
  postId: string,
  authorId: string,
  content: string,
  parentCommentId?: string | null,
): Promise<AddCommentResult | AddCommentError> {
  // Enforce mute/ban for group posts
  const groupId = await getPostGroupId(postId);
  if (groupId) {
    const membership = await getGroupMemberFull(groupId, authorId);
    if (!membership || membership.status === "banned") {
      return {
        success: false,
        errorCode: "GROUP_MODERATION",
        reason: "Groups.moderation.bannedCannotComment",
      };
    }
    if (membership.mutedUntil && membership.mutedUntil > new Date()) {
      return {
        success: false,
        errorCode: "GROUP_MODERATION",
        reason: "Groups.moderation.mutedCannotComment",
      };
    }
  }

  try {
    const comment = await insertComment({ postId, authorId, content, parentCommentId });

    try {
      await eventBus.emit("post.commented", {
        postId,
        commentId: comment.id,
        userId: authorId,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Non-critical
    }

    return {
      success: true,
      comment: {
        id: comment.id,
        postId: comment.postId,
        content: comment.content,
        parentCommentId: comment.parentCommentId,
        createdAt: comment.createdAt.toISOString(),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Parent comment not found")) {
      return { success: false, errorCode: "PARENT_NOT_FOUND", reason: message };
    }
    return { success: false, errorCode: "INTERNAL_ERROR", reason: "Failed to add comment" };
  }
}

export async function deleteComment(
  commentId: string,
  requesterId: string,
): Promise<{ deleted: boolean }> {
  const deleted = await softDeleteComment(commentId, requesterId);
  return { deleted };
}

export async function getPostComments(
  postId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  return getComments(postId, options);
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

export interface RepostResult {
  success: true;
  postId: string; // The new repost's ID
}

export interface RepostError {
  success: false;
  errorCode: "ORIGINAL_NOT_FOUND" | "INTERNAL_ERROR";
  reason: string;
}

/**
 * Repost a post to the member's own feed.
 * Creates a new community_posts row with original_post_id set.
 * Increments shareCount on the original post.
 * The repost content is the optional comment text (or empty string).
 */
export async function repostToFeed(
  originalPostId: string,
  authorId: string,
  commentText?: string,
): Promise<RepostResult | RepostError> {
  // Verify original post exists
  const original = await getOriginalPostEmbed(originalPostId);
  if (!original) {
    return {
      success: false,
      errorCode: "ORIGINAL_NOT_FOUND",
      reason: "Original post not found or deleted",
    };
  }

  try {
    // Create the repost via insertPost (from posts.ts)
    const repostContent = commentText?.trim() ?? "";
    const repost = await insertPost({
      authorId,
      content: repostContent,
      contentType: "text",
      visibility: "members_only",
      category: "discussion",
      originalPostId, // Pass through to posts.ts insertPost
    });

    // Increment shareCount on original
    await incrementShareCount(originalPostId);

    return { success: true, postId: repost.id };
  } catch {
    return { success: false, errorCode: "INTERNAL_ERROR", reason: "Failed to create repost" };
  }
}

/**
 * Share a post link to a DM conversation.
 * Sends a message with the post URL embedded.
 * Increments shareCount on the original post.
 */
export async function shareToConversation(
  postId: string,
  senderId: string,
  conversationId: string,
  appUrl: string,
): Promise<{ success: true } | { success: false; reason: string }> {
  // Verify post exists
  const post = await getOriginalPostEmbed(postId);
  if (!post) {
    return { success: false, reason: "Post not found or deleted" };
  }

  try {
    // Import MessageService lazily to avoid circular deps
    const { messageService } = await import("@/services/message-service");
    const postUrl = `${appUrl}/feed?post=${postId}`;

    // Send as structured shared_post content type so the chat UI can render
    // an embedded card with media, author info, and a link to the original post.
    const payload = JSON.stringify({
      postId: post.id,
      postUrl,
      authorName: post.authorDisplayName,
      authorPhotoUrl: post.authorPhotoUrl,
      text: post.content,
      postContentType: post.contentType,
      media: post.media.map((m) => ({
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        altText: m.altText,
      })),
    });
    await messageService.sendMessage({
      conversationId,
      senderId,
      content: payload,
      contentType: "shared_post",
    });
    await incrementShareCount(postId);
    return { success: true };
  } catch {
    return { success: false, reason: "Failed to share post" };
  }
}
