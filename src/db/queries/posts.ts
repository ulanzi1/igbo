// No "server-only" — consistent with follows.ts and feed.ts.
// This file is used by post-service.ts (server-only) and tests.
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/env";
import { communityPosts, communityPostMedia } from "@/db/schema/community-posts";
import { platformFileUploads } from "@/db/schema/file-uploads";

export interface CreatePostData {
  authorId: string;
  content: string;
  contentType: "text" | "rich_text" | "media" | "announcement";
  visibility: "public" | "group" | "members_only";
  category: "discussion" | "event" | "announcement";
}

export interface CreatePostMediaData {
  fileUploadId: string; // Used to look up processedUrl from platform_file_uploads
  mediaType: "image" | "video" | "audio";
  altText?: string;
  sortOrder: number;
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
    result.set(row.id, { mediaUrl, fileType: row.fileType });
  }
  return result;
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
