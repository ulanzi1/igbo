// No "server-only" — consistent with posts.ts, feed.ts, post-interactions.ts.
// Used by bookmark-service.ts (server-only) and tests.
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import { communityPostBookmarks } from "@/db/schema/bookmarks";
import { communityPosts, communityPostMedia } from "@/db/schema/community-posts";
import { communityProfiles } from "@/db/schema/community-profiles";
import type { FeedPost } from "@/db/queries/feed";

/**
 * Toggle a bookmark for a post.
 * Returns { bookmarked: true } if added, { bookmarked: false } if removed.
 * Wrapped in a transaction to prevent race conditions on concurrent requests.
 */
export async function toggleBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  return db.transaction(async (tx) => {
    // Check existing within transaction
    const [existing] = await tx
      .select({ userId: communityPostBookmarks.userId })
      .from(communityPostBookmarks)
      .where(
        and(eq(communityPostBookmarks.userId, userId), eq(communityPostBookmarks.postId, postId)),
      );

    if (existing) {
      // Remove bookmark
      await tx
        .delete(communityPostBookmarks)
        .where(
          and(eq(communityPostBookmarks.userId, userId), eq(communityPostBookmarks.postId, postId)),
        );
      return { bookmarked: false };
    }

    // Add bookmark
    await tx.insert(communityPostBookmarks).values({ userId, postId });
    return { bookmarked: true };
  });
}

/**
 * Add a bookmark (idempotent — does nothing if already bookmarked).
 * Used by REST POST route for proper REST semantics.
 */
export async function addBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  await db.insert(communityPostBookmarks).values({ userId, postId }).onConflictDoNothing();
  return { bookmarked: true };
}

/**
 * Remove a bookmark (idempotent — does nothing if not bookmarked).
 * Used by REST DELETE route for proper REST semantics.
 */
export async function removeBookmark(
  userId: string,
  postId: string,
): Promise<{ bookmarked: boolean }> {
  await db
    .delete(communityPostBookmarks)
    .where(
      and(eq(communityPostBookmarks.userId, userId), eq(communityPostBookmarks.postId, postId)),
    );
  return { bookmarked: false };
}

/**
 * Check if a specific post is bookmarked by a user.
 */
export async function isBookmarked(userId: string, postId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: communityPostBookmarks.userId })
    .from(communityPostBookmarks)
    .where(
      and(eq(communityPostBookmarks.userId, userId), eq(communityPostBookmarks.postId, postId)),
    );
  return row !== undefined;
}

export interface BookmarkedPost extends FeedPost {
  bookmarkedAt: string; // ISO string of when the post was bookmarked
}

/**
 * Get paginated bookmarked posts for a user, ordered by bookmark date (newest first).
 * Cursor = ISO string of last bookmarked_at for keyset pagination.
 */
export async function getUserBookmarks(
  userId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<{ posts: BookmarkedPost[]; nextCursor: string | null }> {
  const limit = options.limit ?? 10;
  const cursorDate = options.cursor ? new Date(options.cursor) : undefined;

  const rows = await db
    .select({
      // Post fields
      id: communityPosts.id,
      authorId: communityPosts.authorId,
      content: communityPosts.content,
      contentType: communityPosts.contentType,
      visibility: communityPosts.visibility,
      category: communityPosts.category,
      groupId: communityPosts.groupId,
      isPinned: communityPosts.isPinned,
      pinnedAt: communityPosts.pinnedAt,
      likeCount: communityPosts.likeCount,
      commentCount: communityPosts.commentCount,
      shareCount: communityPosts.shareCount,
      originalPostId: communityPosts.originalPostId,
      createdAt: communityPosts.createdAt,
      updatedAt: communityPosts.updatedAt,
      // Author profile
      authorDisplayName: communityProfiles.displayName,
      authorPhotoUrl: communityProfiles.photoUrl,
      // Bookmark metadata
      bookmarkedAt: communityPostBookmarks.createdAt,
      // isBookmarked is always true on this page
      isBookmarked: sql<boolean>`true`,
    })
    .from(communityPostBookmarks)
    .innerJoin(communityPosts, eq(communityPosts.id, communityPostBookmarks.postId))
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPosts.authorId),
        // Filter out deleted profiles
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .where(
      and(
        eq(communityPostBookmarks.userId, userId),
        sql`${communityPosts.deletedAt} IS NULL`,
        cursorDate
          ? sql`${communityPostBookmarks.createdAt} < ${cursorDate.toISOString()}`
          : undefined,
      ),
    )
    .orderBy(desc(communityPostBookmarks.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0
      ? pageRows[pageRows.length - 1]!.bookmarkedAt.toISOString()
      : null;

  // Fetch media for bookmarked posts + original post embeds for reposts
  const postIds = pageRows.map((r) => r.id);

  // Collect original post IDs for repost embeds
  const originalIds = [
    ...new Set(pageRows.map((r) => r.originalPostId).filter((id): id is string => id != null)),
  ];

  const [mediaRows, origRows] = await Promise.all([
    postIds.length > 0
      ? db
          .select({
            id: communityPostMedia.id,
            postId: communityPostMedia.postId,
            mediaUrl: communityPostMedia.mediaUrl,
            mediaType: communityPostMedia.mediaType,
            altText: communityPostMedia.altText,
            sortOrder: communityPostMedia.sortOrder,
          })
          .from(communityPostMedia)
          .where(
            sql`${communityPostMedia.postId} = ANY(ARRAY[${sql.join(
              postIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )}]::uuid[])`,
          )
      : Promise.resolve([]),
    originalIds.length > 0
      ? db
          .select({
            id: communityPosts.id,
            content: communityPosts.content,
            contentType: communityPosts.contentType,
            authorDisplayName: communityProfiles.displayName,
            authorPhotoUrl: communityProfiles.photoUrl,
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
            and(inArray(communityPosts.id, originalIds), sql`${communityPosts.deletedAt} IS NULL`),
          )
      : Promise.resolve([]),
  ]);

  // Fetch media for original post embeds
  const origMediaRows =
    origRows.length > 0
      ? await db
          .select()
          .from(communityPostMedia)
          .where(
            inArray(
              communityPostMedia.postId,
              origRows.map((r) => r.id),
            ),
          )
          .orderBy(communityPostMedia.sortOrder)
      : [];

  const mediaByPostId = new Map<string, typeof mediaRows>();
  for (const m of mediaRows) {
    if (!mediaByPostId.has(m.postId)) mediaByPostId.set(m.postId, []);
    mediaByPostId.get(m.postId)!.push(m);
  }

  // Build original post embeds map
  const origMediaByPostId = new Map<string, typeof origMediaRows>();
  for (const m of origMediaRows) {
    if (!origMediaByPostId.has(m.postId)) origMediaByPostId.set(m.postId, []);
    origMediaByPostId.get(m.postId)!.push(m);
  }

  const originalPostMap = new Map<string, FeedPost["originalPost"] & Record<string, unknown>>();
  for (const r of origRows) {
    originalPostMap.set(r.id, {
      id: r.id,
      content: r.content,
      contentType: r.contentType as "text" | "rich_text" | "media" | "announcement",
      authorDisplayName: r.authorDisplayName,
      authorPhotoUrl: r.authorPhotoUrl,
      media: (origMediaByPostId.get(r.id) ?? []).map((m) => ({
        id: m.id,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        altText: m.altText,
        sortOrder: m.sortOrder,
      })),
    });
  }

  const posts: BookmarkedPost[] = pageRows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorDisplayName: r.authorDisplayName,
    authorPhotoUrl: r.authorPhotoUrl,
    content: r.content,
    contentType: r.contentType as FeedPost["contentType"],
    visibility: r.visibility as FeedPost["visibility"],
    category: r.category as FeedPost["category"],
    groupId: r.groupId,
    isPinned: r.isPinned,
    pinnedAt: r.pinnedAt?.toISOString() ?? null,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    shareCount: r.shareCount,
    originalPostId: r.originalPostId,
    originalPost: r.originalPostId ? (originalPostMap.get(r.originalPostId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    media: (mediaByPostId.get(r.id) ?? []).map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType as "image" | "video" | "audio",
      altText: m.altText,
      sortOrder: m.sortOrder,
    })),
    isBookmarked: true,
    bookmarkedAt: r.bookmarkedAt.toISOString(),
  }));

  return { posts, nextCursor };
}
