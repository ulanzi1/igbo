import "server-only";
import { canCreateFeedPost, getMaxFeedPostsPerWeek } from "@/services/permissions";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import {
  getWeeklyFeedPostCount,
  insertPost,
  insertPostMedia,
  resolveFileUploadUrls,
} from "@/db/queries/posts";
import { getGroupById, getGroupMemberFull } from "@/db/queries/groups";
import { eventBus } from "@/services/event-bus";

// Re-export for use in Server Action
export type { CreatePostData, CreatePostMediaData } from "@/db/queries/posts";

export interface CreateFeedPostInput {
  authorId: string;
  content: string; // Plain text OR Tiptap JSON (stringified) for rich_text
  contentType: "text" | "rich_text" | "media";
  category: "discussion" | "event" | "announcement";
  fileUploadIds?: string[]; // IDs from platform_file_uploads (from FileUpload.onUploadComplete)
  mediaTypes?: ("image" | "video" | "audio")[]; // Parallel array to fileUploadIds
}

export interface CreateFeedPostResult {
  success: true;
  postId: string;
}

export interface CreateFeedPostError {
  success: false;
  errorCode: "TIER_BLOCKED" | "LIMIT_REACHED" | "INTERNAL_ERROR";
  reason: string;
  resetDate?: string; // ISO string — next Monday 00:00 UTC for LIMIT_REACHED
}

export type CreateFeedPostResponse = CreateFeedPostResult | CreateFeedPostError;

/**
 * Create a general feed post with permission and weekly limit checks.
 *
 * Flow:
 * 1. Tier gate: canCreateFeedPost() → Basic members blocked
 * 2. Weekly count gate: getWeeklyFeedPostCount() vs maxFeedPostsPerWeek
 * 3. Resolve media URLs from fileUploadIds
 * 4. Insert post + media
 * 5. Emit post.published via EventBus
 */
export async function createFeedPost(input: CreateFeedPostInput): Promise<CreateFeedPostResponse> {
  // Step 1: Tier gate
  const tierCheck = await canCreateFeedPost(input.authorId);
  if (!tierCheck.allowed) {
    return {
      success: false,
      errorCode: "TIER_BLOCKED",
      reason: tierCheck.reason ?? "Permissions.feedPostRequired",
    };
  }

  // Step 2: Weekly limit gate
  const tier = await getUserMembershipTier(input.authorId);
  const weeklyLimit = getMaxFeedPostsPerWeek(tier);
  const currentCount = await getWeeklyFeedPostCount(input.authorId);
  if (currentCount >= weeklyLimit) {
    const nextMonday = getNextMonday();
    return {
      success: false,
      errorCode: "LIMIT_REACHED",
      reason: "Feed.composer.limitReached",
      resetDate: nextMonday.toISOString(),
    };
  }

  // Step 3: Resolve media URLs
  const fileUploadIds = input.fileUploadIds ?? [];
  const urlMap = await resolveFileUploadUrls(fileUploadIds);
  const media = fileUploadIds
    .map((id, i) => {
      const resolved = urlMap.get(id);
      return {
        mediaUrl: resolved?.mediaUrl ?? "",
        mediaType: (input.mediaTypes?.[i] ?? "image") as "image" | "video" | "audio",
        sortOrder: i,
      };
    })
    .filter((m) => m.mediaUrl !== ""); // Skip unresolvable uploads

  // Determine actual contentType
  const contentType =
    media.length > 0 && input.contentType === "text" ? "media" : input.contentType;

  // Step 4: Insert post
  const post = await insertPost({
    authorId: input.authorId,
    content: input.content,
    contentType,
    visibility: "members_only", // General feed posts are members-only (AC: default)
    category: input.category,
  });
  await insertPostMedia(post.id, media);

  // Step 5: Emit EventBus event
  try {
    await eventBus.emit("post.published", {
      postId: post.id,
      authorId: input.authorId,
      category: input.category,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical: EventBus failure must not roll back post creation
  }

  return { success: true, postId: post.id };
}

export interface CreateGroupPostInput {
  authorId: string;
  groupId: string;
  content: string;
  contentType: "text" | "rich_text" | "media";
  category: "discussion" | "event" | "announcement";
  fileUploadIds?: string[];
  mediaTypes?: ("image" | "video" | "audio")[];
}

/**
 * Create a post within a specific group.
 * Verifies: group exists, not archived, caller is active, not muted/banned, postingPermission respected.
 */
export async function createGroupPost(
  input: CreateGroupPostInput,
): Promise<CreateFeedPostResponse> {
  const group = await getGroupById(input.groupId);
  if (!group) {
    return { success: false, errorCode: "INTERNAL_ERROR", reason: "Group not found" };
  }

  // Archived check — getGroupById already returns null for deleted groups,
  // but archiveGroup sets deleted_at, so this is a safety guard for direct calls.
  if (group.deletedAt) {
    return { success: false, errorCode: "TIER_BLOCKED", reason: "Groups.archived.postingDenied" };
  }

  const membership = await getGroupMemberFull(input.groupId, input.authorId);
  if (!membership || membership.status === "banned") {
    return {
      success: false,
      errorCode: "TIER_BLOCKED",
      reason: "Groups.moderation.bannedCannotPost",
    };
  }
  if (membership.status !== "active") {
    return { success: false, errorCode: "TIER_BLOCKED", reason: "Not an active group member" };
  }

  // Check muted status
  if (membership.mutedUntil && membership.mutedUntil > new Date()) {
    return {
      success: false,
      errorCode: "TIER_BLOCKED",
      reason: "Groups.moderation.mutedCannotPost",
    };
  }

  // Enforce postingPermission
  if (
    group.postingPermission === "leaders_only" &&
    membership.role !== "creator" &&
    membership.role !== "leader"
  ) {
    return {
      success: false,
      errorCode: "TIER_BLOCKED",
      reason: "Groups.feed.postingPermissionDenied",
    };
  }

  // Resolve media
  const fileUploadIds = input.fileUploadIds ?? [];
  const urlMap = await resolveFileUploadUrls(fileUploadIds);
  const media = fileUploadIds
    .map((id, i) => {
      const resolved = urlMap.get(id);
      return {
        mediaUrl: resolved?.mediaUrl ?? "",
        mediaType: (input.mediaTypes?.[i] ?? "image") as "image" | "video" | "audio",
        sortOrder: i,
      };
    })
    .filter((m) => m.mediaUrl !== "");

  const contentType =
    media.length > 0 && input.contentType === "text" ? "media" : input.contentType;

  const post = await insertPost({
    authorId: input.authorId,
    content: input.content,
    contentType,
    visibility: "group",
    category: input.category,
    groupId: input.groupId,
  });

  await insertPostMedia(post.id, media);

  try {
    await eventBus.emit("post.published", {
      postId: post.id,
      authorId: input.authorId,
      groupId: input.groupId,
      category: input.category,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical
  }

  return { success: true, postId: post.id };
}

/** Returns the next Monday at 00:00 UTC (the weekly limit reset time). */
function getNextMonday(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun...6=Sat
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  return nextMonday;
}
