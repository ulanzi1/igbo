// No "server-only" — consistent with follows.ts and block-mute.ts
import { eq, and, lt, desc, sql, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { communityPosts, communityPostMedia } from "@/db/schema/community-posts";
import { communityProfiles } from "@/db/schema/community-profiles";
import { communityMemberFollows } from "@/db/schema/community-connections";
import { FEED_CONFIG, type FeedSortMode, type FeedFilter } from "@/config/feed";

export interface FeedPostMedia {
  id: string;
  mediaUrl: string;
  mediaType: string;
  altText: string | null;
  sortOrder: number;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  contentType: "text" | "rich_text" | "media" | "announcement";
  visibility: "public" | "group" | "members_only";
  groupId: string | null;
  isPinned: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  media: FeedPostMedia[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  score?: number; // Only present in algorithmic mode
}

export interface FeedPage {
  posts: FeedPost[];
  nextCursor: string | null;
  isColdStart: boolean; // true when viewer has no follows — show "Follow members" prompt
}

export interface GetFeedOptions {
  sort?: FeedSortMode;
  filter?: FeedFilter;
  cursor?: string; // ISO string for chrono; base64-encoded JSON for algorithmic
  limit?: number;
}

/**
 * Count total non-deleted posts to detect platform-level cold-start.
 * If < COLD_START_POST_THRESHOLD, always sort chronologically.
 */
export async function getTotalPostCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityPosts)
    .where(sql`${communityPosts.deletedAt} IS NULL`);
  return row?.count ?? 0;
}

/**
 * Get the list of userIds that viewerId follows.
 * Returns empty array if viewerId has no follows (triggers cold-start fallback).
 */
export async function getFollowedUserIds(viewerId: string): Promise<string[]> {
  const rows = await db
    .select({ followingId: communityMemberFollows.followingId })
    .from(communityMemberFollows)
    .where(eq(communityMemberFollows.followerId, viewerId));
  return rows.map((r) => r.followingId);
}

/**
 * Fetch feed posts with cursor-based pagination.
 *
 * Personalization scope (Story 4.1):
 *   - Posts by followed members (visibility = public or members_only, no group_id)
 *   - Admin announcements (content_type = 'announcement' OR is_pinned = true)
 *
 * Cold-start fallback (when followedIds is empty):
 *   - Platform-wide posts from last ENGAGEMENT_WINDOW_DAYS, ranked by engagement score
 *
 * Algorithmic sort:
 *   Computed in application layer. Cursor format: base64(JSON({offset: number})).
 *   Platform cold-start (totalPosts < COLD_START_POST_THRESHOLD): force chronological.
 */
export async function getFeedPosts(
  viewerId: string,
  followedIds: string[],
  totalPosts: number,
  options: GetFeedOptions = {},
): Promise<FeedPage> {
  const { sort = "chronological", filter = "all", cursor, limit = FEED_CONFIG.PAGE_SIZE } = options;

  const isColdStart = followedIds.length === 0;
  const effectiveSort =
    sort === "algorithmic" && totalPosts < FEED_CONFIG.COLD_START_POST_THRESHOLD
      ? "chronological"
      : sort;

  const windowStart = new Date(
    Date.now() - FEED_CONFIG.ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Build the WHERE predicate for eligible posts
  // Announcements filter: only pinned/announcement posts
  // Full feed: followed member posts + announcements (pinned or content_type=announcement)
  const announcementCondition = or(
    eq(communityPosts.isPinned, true),
    eq(communityPosts.contentType, "announcement"),
  );

  let eligibilityCondition;
  if (filter === "announcements") {
    eligibilityCondition = and(sql`${communityPosts.deletedAt} IS NULL`, announcementCondition);
  } else if (isColdStart) {
    // Cold-start: platform-wide posts within the engagement window
    eligibilityCondition = and(
      sql`${communityPosts.deletedAt} IS NULL`,
      sql`${communityPosts.createdAt} >= ${windowStart.toISOString()}`,
    );
  } else {
    // Normal feed: followed member posts + announcements
    eligibilityCondition = and(
      sql`${communityPosts.deletedAt} IS NULL`,
      or(
        and(
          inArray(communityPosts.authorId, followedIds),
          sql`${communityPosts.groupId} IS NULL`, // Group posts deferred to Epic 5
        ),
        announcementCondition,
      ),
    );
  }

  if (effectiveSort === "algorithmic") {
    return _getAlgorithmicFeedPage(eligibilityCondition, isColdStart, cursor, limit);
  } else {
    return _getChronologicalFeedPage(eligibilityCondition, isColdStart, cursor, limit);
  }
}

async function _getChronologicalFeedPage(
  eligibilityCondition: SQL | undefined, // and() returns SQL | undefined; always defined here
  isColdStart: boolean,
  cursor: string | undefined,
  limit: number,
): Promise<FeedPage> {
  // Pinned posts are always fetched separately and prepended (no cursor filtering for them)
  // Regular posts use created_at cursor; invalid cursor falls back to first page
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
      visibility: communityPosts.visibility,
      groupId: communityPosts.groupId,
      isPinned: communityPosts.isPinned,
      likeCount: communityPosts.likeCount,
      commentCount: communityPosts.commentCount,
      shareCount: communityPosts.shareCount,
      createdAt: communityPosts.createdAt,
      updatedAt: communityPosts.updatedAt,
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
      cursorDate
        ? and(eligibilityCondition, lt(communityPosts.createdAt, cursorDate))
        : eligibilityCondition,
    )
    .orderBy(desc(communityPosts.isPinned), desc(communityPosts.createdAt))
    .limit(limit + 1); // Fetch one extra to detect next page

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.createdAt.toISOString() : null;

  // Load media for returned posts
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

  const posts: FeedPost[] = pageRows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorDisplayName: r.authorDisplayName,
    authorPhotoUrl: r.authorPhotoUrl,
    content: r.content,
    contentType: r.contentType as FeedPost["contentType"],
    visibility: r.visibility as FeedPost["visibility"],
    groupId: r.groupId,
    isPinned: r.isPinned,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    shareCount: r.shareCount,
    media: (mediaByPostId.get(r.id) ?? []).map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      altText: m.altText,
      sortOrder: m.sortOrder,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { posts, nextCursor, isColdStart };
}

async function _getAlgorithmicFeedPage(
  eligibilityCondition: SQL | undefined,
  isColdStart: boolean,
  cursor: string | undefined,
  limit: number,
): Promise<FeedPage> {
  // Application-layer scoring: fetch ALL eligible posts from the 7-day window,
  // score and sort in JS, then paginate by numeric offset.
  //
  // WHY not raw SQL CTE: db.execute() with postgres.js returns a RowList (array-like,
  // NOT {rows: ...}). The CTE with dynamic Drizzle conditions is error-prone in raw SQL.
  // Application-layer is simpler, fully testable, and safe at MVP scale
  // (< 500 members × < 20 posts/week = < 2000 posts in a 7-day window).
  //
  // Cursor format: base64(JSON({offset: number})) — stable offset into sorted result set.
  const parsedOffset = cursor
    ? (() => {
        try {
          return (JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as { offset: number })
            .offset;
        } catch {
          return 0;
        }
      })()
    : 0;

  const halfLifeDecayConstant = Math.log(2) / FEED_CONFIG.HALF_LIFE_HOURS;
  const windowStart = new Date(
    Date.now() - FEED_CONFIG.ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Fetch all candidate posts within the engagement window using standard Drizzle select
  const allRows = await db
    .select({
      id: communityPosts.id,
      authorId: communityPosts.authorId,
      authorDisplayName: communityProfiles.displayName,
      authorPhotoUrl: communityProfiles.photoUrl,
      content: communityPosts.content,
      contentType: communityPosts.contentType,
      visibility: communityPosts.visibility,
      groupId: communityPosts.groupId,
      isPinned: communityPosts.isPinned,
      likeCount: communityPosts.likeCount,
      commentCount: communityPosts.commentCount,
      shareCount: communityPosts.shareCount,
      createdAt: communityPosts.createdAt,
      updatedAt: communityPosts.updatedAt,
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
      and(eligibilityCondition, sql`${communityPosts.createdAt} >= ${windowStart.toISOString()}`),
    );

  // Score each post in JS
  const engagementSums = allRows.map(
    (r) =>
      r.likeCount * FEED_CONFIG.LIKE_WEIGHT +
      r.commentCount * FEED_CONFIG.COMMENT_WEIGHT +
      r.shareCount * FEED_CONFIG.SHARE_WEIGHT,
  );
  const maxEngagement = Math.max(1, ...engagementSums);
  const now = Date.now();

  const scored = allRows.map((r, i) => {
    const hoursSince = (now - r.createdAt.getTime()) / 3_600_000;
    const recencyDecay = Math.exp(-halfLifeDecayConstant * hoursSince);
    const engagementNorm = Math.min(engagementSums[i]! / maxEngagement, 1.0);
    const score =
      recencyDecay * FEED_CONFIG.RECENCY_WEIGHT + engagementNorm * FEED_CONFIG.ENGAGEMENT_WEIGHT;
    return { ...r, score };
  });

  // Pinned posts always first (sorted by date); non-pinned sorted by score then id
  const pinned = scored
    .filter((r) => r.isPinned)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const nonPinned = scored
    .filter((r) => !r.isPinned)
    .sort((a, b) => b.score - a.score || b.id.localeCompare(a.id));

  // Pinned posts only shown on first page (offset = 0)
  const prefix = parsedOffset === 0 ? pinned : [];
  const pageRows = nonPinned.slice(parsedOffset, parsedOffset + limit);
  const hasMore = parsedOffset + limit < nonPinned.length;
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ offset: parsedOffset + limit })).toString("base64")
    : null;

  const allPageRows = [...prefix, ...pageRows];
  const postIds = allPageRows.map((r) => r.id);
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

  const posts: FeedPost[] = allPageRows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorDisplayName: r.authorDisplayName,
    authorPhotoUrl: r.authorPhotoUrl,
    content: r.content,
    contentType: r.contentType as FeedPost["contentType"],
    visibility: r.visibility as FeedPost["visibility"],
    groupId: r.groupId,
    isPinned: r.isPinned,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    shareCount: r.shareCount,
    media: (mediaByPostId.get(r.id) ?? []).map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      altText: m.altText,
      sortOrder: m.sortOrder,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    score: r.score,
  }));

  return { posts, nextCursor, isColdStart };
}
