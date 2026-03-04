// No "server-only" — consistent with follows.ts, posts.ts, feed.ts.
// Used by post-interaction-service.ts (server-only) and tests.
import { eq, and, isNull, sql, desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts, communityPostMedia } from "@/db/schema/community-posts";
import { inArray } from "drizzle-orm";
import { communityPostReactions, communityPostComments } from "@/db/schema/post-interactions";
import { communityProfiles } from "@/db/schema/community-profiles";
import type { PostReactionType } from "@/db/schema/post-interactions";

// ─── Reactions ────────────────────────────────────────────────────────────────

/**
 * Get the viewer's current reaction type for a post, or null if none.
 */
export async function getViewerReaction(
  postId: string,
  userId: string,
): Promise<PostReactionType | null> {
  const [row] = await db
    .select({ reactionType: communityPostReactions.reactionType })
    .from(communityPostReactions)
    .where(
      and(eq(communityPostReactions.postId, postId), eq(communityPostReactions.userId, userId)),
    );
  return row?.reactionType ?? null;
}

/**
 * Get reaction counts by type for a post.
 * Returns a record of { reactionType: count }.
 */
export async function getReactionCounts(postId: string): Promise<Record<PostReactionType, number>> {
  const rows = await db
    .select({
      reactionType: communityPostReactions.reactionType,
      count: sql<number>`count(*)::int`,
    })
    .from(communityPostReactions)
    .where(eq(communityPostReactions.postId, postId))
    .groupBy(communityPostReactions.reactionType);

  const result: Record<PostReactionType, number> = {
    like: 0,
    love: 0,
    celebrate: 0,
    insightful: 0,
    funny: 0,
  };
  for (const row of rows) {
    result[row.reactionType] = row.count;
  }
  return result;
}

export interface ToggleReactionResult {
  /** null = reaction was removed (toggled off) */
  newReactionType: PostReactionType | null;
  /** +1 = added new, 0 = changed type, -1 = removed */
  countDelta: number;
}

/**
 * Toggle/set reaction atomically using a DB transaction.
 * Logic:
 *   - No existing reaction: INSERT + increment likeCount (+1)
 *   - Same reaction type: DELETE + decrement likeCount (-1) [toggle off]
 *   - Different reaction type: UPDATE reaction_type (no count change, delta=0)
 * Returns the new reaction type and count delta for optimistic updates.
 */
export async function toggleReaction(
  postId: string,
  userId: string,
  reactionType: PostReactionType,
): Promise<ToggleReactionResult> {
  return db.transaction(async (tx) => {
    // Check existing — use FOR UPDATE to serialize concurrent reactions from the same user
    const [existing] = await tx
      .select({ reactionType: communityPostReactions.reactionType })
      .from(communityPostReactions)
      .where(
        and(eq(communityPostReactions.postId, postId), eq(communityPostReactions.userId, userId)),
      )
      .for("update");

    if (!existing) {
      // New reaction: INSERT + increment likeCount
      await tx.insert(communityPostReactions).values({ postId, userId, reactionType });
      await tx
        .update(communityPosts)
        .set({ likeCount: sql`like_count + 1` })
        .where(eq(communityPosts.id, postId));
      return { newReactionType: reactionType, countDelta: 1 };
    }

    if (existing.reactionType === reactionType) {
      // Same type: toggle off (DELETE + decrement likeCount)
      await tx
        .delete(communityPostReactions)
        .where(
          and(eq(communityPostReactions.postId, postId), eq(communityPostReactions.userId, userId)),
        );
      await tx
        .update(communityPosts)
        .set({ likeCount: sql`GREATEST(like_count - 1, 0)` })
        .where(eq(communityPosts.id, postId));
      return { newReactionType: null, countDelta: -1 };
    }

    // Different type: UPDATE (count unchanged)
    await tx
      .update(communityPostReactions)
      .set({ reactionType })
      .where(
        and(eq(communityPostReactions.postId, postId), eq(communityPostReactions.userId, userId)),
      );
    return { newReactionType: reactionType, countDelta: 0 };
  });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  parentCommentId: string | null;
  deletedAt: string | null;
  createdAt: string;
  replies: PostComment[];
}

// Private type for the raw DB row
type CommunityPostCommentRow = typeof communityPostComments.$inferSelect;

/**
 * Insert a new comment and increment commentCount on the post.
 * Validates parentCommentId belongs to the same post (if provided).
 * Returns the new comment (without replies array — not needed server-side).
 */
export async function insertComment(data: {
  postId: string;
  authorId: string;
  content: string;
  parentCommentId?: string | null;
}): Promise<CommunityPostCommentRow> {
  return db.transaction(async (tx) => {
    // Validate parentCommentId belongs to same post AND is a top-level comment
    // (AC #2: "nested replies (one level deep)")
    if (data.parentCommentId) {
      const [parent] = await tx
        .select({
          postId: communityPostComments.postId,
          parentCommentId: communityPostComments.parentCommentId,
        })
        .from(communityPostComments)
        .where(
          and(
            eq(communityPostComments.id, data.parentCommentId),
            isNull(communityPostComments.deletedAt),
          ),
        );
      if (!parent || parent.postId !== data.postId) {
        throw new Error("Parent comment not found or belongs to different post");
      }
      if (parent.parentCommentId !== null) {
        throw new Error("Cannot reply to a reply — only one level of nesting is allowed");
      }
    }

    const [comment] = await tx
      .insert(communityPostComments)
      .values({
        postId: data.postId,
        authorId: data.authorId,
        content: data.content,
        parentCommentId: data.parentCommentId ?? null,
      })
      .returning();

    // Increment commentCount (not decremented on soft-delete)
    await tx
      .update(communityPosts)
      .set({ commentCount: sql`comment_count + 1` })
      .where(eq(communityPosts.id, data.postId));

    return comment!;
  });
}

/**
 * Soft-delete a comment (set deleted_at).
 * Only the comment's author can delete their comment.
 * Admin/moderator delete is NOT implemented in Story 4.3 — out of scope.
 * Returns true if deleted, false if not found or not authorized.
 */
export async function softDeleteComment(commentId: string, requesterId: string): Promise<boolean> {
  const result = await db
    .update(communityPostComments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(communityPostComments.id, commentId),
        eq(communityPostComments.authorId, requesterId),
        isNull(communityPostComments.deletedAt),
      ),
    )
    .returning({ id: communityPostComments.id });
  return result.length > 0;
}

/**
 * Soft-delete a group comment by a moderator (leader/creator).
 * Bypasses the author check — for moderation use only.
 * Returns true if deleted, false if not found.
 */
export async function softDeleteGroupComment(commentId: string, postId: string): Promise<boolean> {
  const result = await db
    .update(communityPostComments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(communityPostComments.id, commentId),
        eq(communityPostComments.postId, postId),
        isNull(communityPostComments.deletedAt),
      ),
    )
    .returning({ id: communityPostComments.id });
  return result.length > 0;
}

/**
 * Get top-level comments for a post with their replies embedded.
 * Pagination is on top-level comments only (cursor = last comment's createdAt ISO string).
 * Replies are fetched in a second query (all replies for the page's comment IDs).
 * Comment count limit per top-level comment is not enforced here — UI caps display.
 *
 * Soft-deleted comments: returned with content = "" so UI can show "[deleted]" placeholder.
 */
export async function getComments(
  postId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<{ comments: PostComment[]; nextCursor: string | null }> {
  const limit = options.limit ?? 10;
  const cursorDate = options.cursor ? new Date(options.cursor) : undefined;

  // Fetch top-level comments (no parent)
  const topLevelRows = await db
    .select({
      id: communityPostComments.id,
      postId: communityPostComments.postId,
      authorId: communityPostComments.authorId,
      authorDisplayName: communityProfiles.displayName,
      authorPhotoUrl: communityProfiles.photoUrl,
      content: communityPostComments.content,
      parentCommentId: communityPostComments.parentCommentId,
      deletedAt: communityPostComments.deletedAt,
      createdAt: communityPostComments.createdAt,
    })
    .from(communityPostComments)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPostComments.authorId),
        isNull(communityProfiles.deletedAt),
      ),
    )
    .where(
      and(
        eq(communityPostComments.postId, postId),
        isNull(communityPostComments.parentCommentId),
        cursorDate
          ? sql`${communityPostComments.createdAt} > ${cursorDate.toISOString()}`
          : undefined,
      ),
    )
    .orderBy(asc(communityPostComments.createdAt))
    .limit(limit + 1);

  const hasMore = topLevelRows.length > limit;
  const pageRows = hasMore ? topLevelRows.slice(0, limit) : topLevelRows;
  const nextCursor =
    hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.createdAt.toISOString() : null;

  if (pageRows.length === 0) return { comments: [], nextCursor: null };

  // Fetch all replies for the page's top-level comment IDs in one query
  const topLevelIds = pageRows.map((r) => r.id);
  const replyRows = await db
    .select({
      id: communityPostComments.id,
      postId: communityPostComments.postId,
      authorId: communityPostComments.authorId,
      authorDisplayName: communityProfiles.displayName,
      authorPhotoUrl: communityProfiles.photoUrl,
      content: communityPostComments.content,
      parentCommentId: communityPostComments.parentCommentId,
      deletedAt: communityPostComments.deletedAt,
      createdAt: communityPostComments.createdAt,
    })
    .from(communityPostComments)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPostComments.authorId),
        isNull(communityProfiles.deletedAt),
      ),
    )
    .where(
      sql`${communityPostComments.parentCommentId} = ANY(ARRAY[${sql.join(
        topLevelIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]::uuid[])`,
    )
    .orderBy(asc(communityPostComments.createdAt));

  // Group replies by parentCommentId
  const repliesByParent = new Map<string, typeof replyRows>();
  for (const reply of replyRows) {
    const parentId = reply.parentCommentId!;
    if (!repliesByParent.has(parentId)) repliesByParent.set(parentId, []);
    repliesByParent.get(parentId)!.push(reply);
  }

  const mapRow = (r: (typeof pageRows)[0], replies: PostComment[] = []): PostComment => ({
    id: r.id,
    postId: r.postId,
    authorId: r.authorId,
    authorDisplayName: r.authorDisplayName,
    authorPhotoUrl: r.authorPhotoUrl,
    content: r.deletedAt ? "" : r.content, // Blank content for deleted comments
    parentCommentId: r.parentCommentId,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    replies,
  });

  const comments = pageRows.map((r) => {
    const replies = (repliesByParent.get(r.id) ?? []).map((reply) =>
      mapRow(reply as (typeof pageRows)[0]),
    );
    return mapRow(r, replies);
  });

  return { comments, nextCursor };
}

// ─── Reposts ──────────────────────────────────────────────────────────────────

/**
 * Increment shareCount on a post (used for reposts and share-to-DM).
 * Does NOT create the new post — that's handled by post-interaction-service.ts.
 */
export async function incrementShareCount(postId: string): Promise<void> {
  await db
    .update(communityPosts)
    .set({ shareCount: sql`share_count + 1` })
    .where(eq(communityPosts.id, postId));
}

export interface OriginalPostEmbedMedia {
  mediaUrl: string;
  mediaType: string;
  altText: string | null;
}

export interface OriginalPostEmbed {
  id: string;
  content: string;
  contentType: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  media: OriginalPostEmbedMedia[];
}

/**
 * Get the original post data for a repost embed display or share-to-conversation.
 * Returns post metadata + media attachments, or null if deleted/not found.
 */
export async function getOriginalPostEmbed(postId: string): Promise<OriginalPostEmbed | null> {
  const [row] = await db
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
        isNull(communityProfiles.deletedAt),
      ),
    )
    .where(and(eq(communityPosts.id, postId), isNull(communityPosts.deletedAt)));
  if (!row) return null;

  const mediaRows = await db
    .select({
      mediaUrl: communityPostMedia.mediaUrl,
      mediaType: communityPostMedia.mediaType,
      altText: communityPostMedia.altText,
    })
    .from(communityPostMedia)
    .where(eq(communityPostMedia.postId, postId))
    .orderBy(communityPostMedia.sortOrder);

  return { ...row, media: mediaRows };
}
