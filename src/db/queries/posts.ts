// No "server-only" — consistent with follows.ts and feed.ts.
// This file is used by post-service.ts (server-only) and tests.
import { eq, and, gte, gt, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/env";
import { communityPosts, communityPostMedia } from "@/db/schema/community-posts";
import { communityProfiles } from "@/db/schema/community-profiles";
import { platformFileUploads } from "@/db/schema/file-uploads";

export interface CreatePostData {
  authorId: string;
  content: string;
  contentType: "text" | "rich_text" | "media" | "announcement";
  visibility: "public" | "group" | "members_only";
  category: "discussion" | "event" | "announcement";
  groupId?: string | null; // Group-scoped posts (Story 5.3)
  originalPostId?: string | null; // Reposts
  status?: "active" | "pending_approval"; // 'pending_approval' for moderated groups (CP-1)
}

export interface CreatePostMediaData {
  fileUploadId: string; // Used to look up processedUrl from platform_file_uploads
  mediaType: "image" | "video" | "audio";
  altText?: string;
  sortOrder: number;
}

export interface PendingGroupPost {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  contentType: string;
  createdAt: Date;
  media: Array<{ id: string; mediaUrl: string; mediaType: string; sortOrder: number }>;
}

/**
 * Count general feed posts (non-deleted, no group_id) by authorId
 * since the start of the current ISO week (Monday 00:00 UTC).
 * Used to enforce FR51 weekly posting limits.
 */
export async function getWeeklyFeedPostCount(authorId: string): Promise<number> {
  // Start of current ISO week (Monday 00:00 UTC)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysSinceMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityPosts)
    .where(
      and(
        eq(communityPosts.authorId, authorId),
        sql`${communityPosts.deletedAt} IS NULL`,
        sql`${communityPosts.groupId} IS NULL`, // General feed posts only
        gte(communityPosts.createdAt, weekStart),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Insert a new post into community_posts.
 * Returns the created post row.
 */
export async function insertPost(data: CreatePostData) {
  const [post] = await db
    .insert(communityPosts)
    .values({
      authorId: data.authorId,
      content: data.content,
      contentType: data.contentType,
      visibility: data.visibility,
      category: data.category,
      groupId: data.groupId ?? null,
      originalPostId: data.originalPostId ?? null,
      status: data.status ?? "active",
    })
    .returning();
  return post!;
}

/**
 * Look up processedUrl for each fileUploadId from platform_file_uploads.
 * Falls back to objectKey-derived URL if processing isn't complete yet.
 * Returns a map of fileUploadId → { mediaUrl, fileType }
 */
export async function resolveFileUploadUrls(
  fileUploadIds: string[],
): Promise<Map<string, { mediaUrl: string; fileType: string }>> {
  if (fileUploadIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: platformFileUploads.id,
      processedUrl: platformFileUploads.processedUrl,
      objectKey: platformFileUploads.objectKey,
      fileType: platformFileUploads.fileType,
    })
    .from(platformFileUploads)
    .where(inArray(platformFileUploads.id, fileUploadIds));
  const result = new Map<string, { mediaUrl: string; fileType: string }>();
  for (const row of rows) {
    const mediaUrl = row.processedUrl ?? `${env.HETZNER_S3_PUBLIC_URL}/${row.objectKey}`;
    result.set(row.id, { mediaUrl, fileType: row.fileType ?? "" });
  }
  return result;
}

/**
 * Toggle a post's pin state. Sets isPinned and pinnedAt accordingly.
 * Returns the updated post or null if not found.
 */
export async function togglePostPin(
  postId: string,
  isPinned: boolean,
): Promise<typeof communityPosts.$inferSelect | null> {
  const [updated] = await db
    .update(communityPosts)
    .set({
      isPinned,
      pinnedAt: isPinned ? new Date() : null,
    })
    .where(eq(communityPosts.id, postId))
    .returning();
  return updated ?? null;
}

/**
 * Soft-delete a group post by a moderator (leader/creator).
 * Returns the deleted post row or null if not found or not in the specified group.
 */
export async function softDeleteGroupPost(
  postId: string,
  groupId: string,
): Promise<typeof communityPosts.$inferSelect | null> {
  const [updated] = await db
    .update(communityPosts)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(communityPosts.id, postId),
        eq(communityPosts.groupId, groupId),
        sql`${communityPosts.deletedAt} IS NULL`,
      ),
    )
    .returning();
  return updated ?? null;
}

/**
 * Get the character length of a post's content.
 * Returns null if the post is not found or has been deleted.
 * Uses PostgreSQL LENGTH() which counts characters (not bytes) — correct for multi-byte Igbo text.
 */
export async function getPostContentLength(postId: string): Promise<number | null> {
  const [row] = await db
    .select({ len: sql<number>`LENGTH(REGEXP_REPLACE(${communityPosts.content}, '\\s', '', 'g'))` })
    .from(communityPosts)
    .where(and(eq(communityPosts.id, postId), sql`${communityPosts.deletedAt} IS NULL`))
    .limit(1);
  return row?.len ?? null;
}

/**
 * Get the authorId (creatorId) of a post.
 * Returns null if the post is not found.
 */
export async function getPostAuthorId(postId: string): Promise<string | null> {
  const [row] = await db
    .select({ authorId: communityPosts.authorId })
    .from(communityPosts)
    .where(and(eq(communityPosts.id, postId), sql`${communityPosts.deletedAt} IS NULL`))
    .limit(1);
  return row?.authorId ?? null;
}

/**
 * Get a post's groupId (or null for general feed posts).
 * Returns null if post not found.
 */
export async function getPostGroupId(postId: string): Promise<string | null | undefined> {
  const [row] = await db
    .select({ groupId: communityPosts.groupId })
    .from(communityPosts)
    .where(and(eq(communityPosts.id, postId), sql`${communityPosts.deletedAt} IS NULL`))
    .limit(1);
  // undefined means post not found; null means found but no group (general feed)
  if (!row) return undefined;
  return row.groupId;
}

/**
 * List pending-approval posts for a group (for leader moderation queue).
 * Returns posts sorted by creation date (oldest first), with author info and media.
 * Supports cursor pagination (oldest-first FIFO queue).
 */
export async function listPendingGroupPosts(
  groupId: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<{ posts: PendingGroupPost[]; nextCursor: string | null }> {
  const { cursor, limit = 10 } = params;
  const parsedDate = cursor ? new Date(cursor) : undefined;
  const cursorDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  const rows = await db
    .select({
      id: communityPosts.id,
      authorId: communityPosts.authorId,
      authorDisplayName: communityProfiles.displayName,
      authorPhotoUrl: communityProfiles.photoUrl,
      content: communityPosts.content,
      contentType: communityPosts.contentType,
      createdAt: communityPosts.createdAt,
    })
    .from(communityPosts)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPosts.authorId),
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .where(
      and(
        eq(communityPosts.groupId, groupId),
        eq(communityPosts.status, "pending_approval"),
        sql`${communityPosts.deletedAt} IS NULL`,
        ...(cursorDate ? [gt(communityPosts.createdAt, cursorDate)] : []),
      ),
    )
    .orderBy(communityPosts.createdAt)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const postIds = pageRows.map((r) => r.id);

  const mediaRows =
    postIds.length > 0
      ? await db
          .select()
          .from(communityPostMedia)
          .where(inArray(communityPostMedia.postId, postIds))
          .orderBy(communityPostMedia.sortOrder)
      : [];

  const mediaByPostId = new Map<string, typeof mediaRows>();
  for (const m of mediaRows) {
    if (!mediaByPostId.has(m.postId)) mediaByPostId.set(m.postId, []);
    mediaByPostId.get(m.postId)!.push(m);
  }

  const posts: PendingGroupPost[] = pageRows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorDisplayName: r.authorDisplayName,
    authorPhotoUrl: r.authorPhotoUrl ?? null,
    content: r.content,
    contentType: r.contentType,
    createdAt: r.createdAt,
    media: (mediaByPostId.get(r.id) ?? []).map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      sortOrder: m.sortOrder,
    })),
  }));

  const nextCursor = hasMore ? pageRows[pageRows.length - 1].createdAt.toISOString() : null;
  return { posts, nextCursor };
}

/**
 * Approve a pending post in a group — transitions status from pending_approval to active.
 * Returns true if the post was found and approved; false if not found or already active.
 */
export async function approveGroupPost(postId: string, groupId: string): Promise<boolean> {
  const [updated] = await db
    .update(communityPosts)
    .set({ status: "active" })
    .where(
      and(
        eq(communityPosts.id, postId),
        eq(communityPosts.groupId, groupId),
        eq(communityPosts.status, "pending_approval"),
        sql`${communityPosts.deletedAt} IS NULL`,
      ),
    )
    .returning({ id: communityPosts.id });
  return !!updated;
}

/**
 * Insert media attachments for a post.
 * Accepts resolved media URLs (call resolveFileUploadUrls first).
 */
export async function insertPostMedia(
  postId: string,
  media: Array<{
    mediaUrl: string;
    mediaType: "image" | "video" | "audio";
    altText?: string;
    sortOrder: number;
  }>,
): Promise<void> {
  if (media.length === 0) return;
  await db.insert(communityPostMedia).values(
    media.map((m) => ({
      postId,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      altText: m.altText ?? null,
      sortOrder: m.sortOrder,
    })),
  );
}
