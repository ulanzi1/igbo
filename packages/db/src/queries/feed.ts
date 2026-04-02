// No "server-only" — consistent with follows.ts and block-mute.ts
import { eq, and, lt, desc, sql, inArray, or, type SQL } from "drizzle-orm";
import { db } from "../index";
import { communityPosts, communityPostMedia } from "../schema/community-posts";
import { communityProfiles } from "../schema/community-profiles";
import { communityMemberFollows } from "../schema/community-connections";
import { communityPostBookmarks } from "../schema/bookmarks";
import { FEED_CONFIG, type FeedSortMode, type FeedFilter } from "@igbo/config/feed";
import { communityUserBadges } from "../schema/community-badges";

export interface FeedPostMedia {
  id: string;
  mediaUrl: string;
  mediaType: string;
  altText: string | null;
  sortOrder: number;
}

export interface FeedPostOriginal {
  id: string;
  content: string;
  contentType: "text" | "rich_text" | "media" | "announcement";
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  media: FeedPostMedia[];
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
  pinnedAt: string | null; // ISO string, set when admin pins; null if not pinned
  likeCount: number;
  commentCount: number;
  shareCount: number;
  category: "discussion" | "event" | "announcement";
  originalPostId: string | null;
  originalPost: FeedPostOriginal | null;
  media: FeedPostMedia[];
  status: "active" | "pending_approval";
  isBookmarked: boolean; // true if current viewer has bookmarked this post
  authorBadgeType: "blue" | "red" | "purple" | null;
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
 * Shared select columns for feed queries.
 * Add new FeedPost fields here — both chronological and algorithmic modes pick them up automatically.
 */
const FEED_SELECT_COLUMNS = {
  id: communityPosts.id,
  authorId: communityPosts.authorId,
  authorDisplayName: communityProfiles.displayName,
  authorPhotoUrl: communityProfiles.photoUrl,
  content: communityPosts.content,
  contentType: communityPosts.contentType,
  visibility: communityPosts.visibility,
  groupId: communityPosts.groupId,
  isPinned: communityPosts.isPinned,
  pinnedAt: communityPosts.pinnedAt,
  likeCount: communityPosts.likeCount,
  commentCount: communityPosts.commentCount,
  shareCount: communityPosts.shareCount,
  category: communityPosts.category,
  originalPostId: communityPosts.originalPostId,
  status: communityPosts.status,
  createdAt: communityPosts.createdAt,
  updatedAt: communityPosts.updatedAt,
  isBookmarked: sql<boolean>`${communityPostBookmarks.userId} IS NOT NULL`,
  authorBadgeType: communityUserBadges.badgeType,
} as const;

type FeedSelectRow = {
  id: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoUrl: string | null;
  content: string;
  contentType: string;
  visibility: string;
  groupId: string | null;
  isPinned: boolean;
  pinnedAt: Date | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  category: string;
  originalPostId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  isBookmarked: boolean;
  authorBadgeType: "blue" | "red" | "purple" | null;
  score?: number;
};

/**
 * Load media + original embeds for a page of rows, then map to FeedPost[].
 * Shared by both chronological and algorithmic modes — update mapping here once.
 */
async function _assemblePostPage(rows: FeedSelectRow[]): Promise<FeedPost[]> {
  const postIds = rows.map((r) => r.id);
  const [mediaRows, originalEmbeds] = await Promise.all([
    postIds.length > 0
      ? db
          .select()
          .from(communityPostMedia)
          .where(inArray(communityPostMedia.postId, postIds))
          .orderBy(communityPostMedia.sortOrder)
      : Promise.resolve([]),
    _loadOriginalPostEmbeds(rows),
  ]);

  type MediaRow = (typeof mediaRows)[number];
  const mediaByPostId = new Map<string, MediaRow[]>();
  for (const m of mediaRows) {
    if (!mediaByPostId.has(m.postId)) mediaByPostId.set(m.postId, []);
    mediaByPostId.get(m.postId)!.push(m);
  }

  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorDisplayName: r.authorDisplayName,
    authorPhotoUrl: r.authorPhotoUrl,
    content: r.content,
    contentType: r.contentType as FeedPost["contentType"],
    visibility: r.visibility as FeedPost["visibility"],
    groupId: r.groupId,
    isPinned: r.isPinned,
    pinnedAt: r.pinnedAt?.toISOString() ?? null,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    shareCount: r.shareCount,
    category: r.category as FeedPost["category"],
    originalPostId: r.originalPostId,
    status: r.status as FeedPost["status"],
    originalPost: r.originalPostId ? (originalEmbeds.get(r.originalPostId) ?? null) : null,
    media: (mediaByPostId.get(r.id) ?? []).map((m) => ({
      id: m.id,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
      altText: m.altText,
      sortOrder: m.sortOrder,
    })),
    isBookmarked: r.isBookmarked,
    authorBadgeType: r.authorBadgeType ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    ...(r.score !== undefined ? { score: r.score } : {}),
  }));
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
    // Normal feed: own posts + followed member posts + announcements
    const feedAuthorIds = [viewerId, ...followedIds];
    eligibilityCondition = and(
      sql`${communityPosts.deletedAt} IS NULL`,
      or(
        and(
          inArray(communityPosts.authorId, feedAuthorIds),
          sql`${communityPosts.groupId} IS NULL`, // Group posts deferred to Epic 5
        ),
        announcementCondition,
      ),
    );
  }

  if (effectiveSort === "algorithmic") {
    return _getAlgorithmicFeedPage(viewerId, eligibilityCondition, isColdStart, cursor, limit);
  } else {
    return _getChronologicalFeedPage(viewerId, eligibilityCondition, isColdStart, cursor, limit);
  }
}

/**
 * Load original post embeds for repost items.
 * Batch-fetches original posts + their media in two queries.
 */
async function _loadOriginalPostEmbeds(
  posts: Array<{ originalPostId: string | null }>,
): Promise<Map<string, FeedPostOriginal>> {
  const originalIds = [
    ...new Set(posts.map((p) => p.originalPostId).filter((id): id is string => id != null)),
  ];
  if (originalIds.length === 0) return new Map();

  const origRows = await db
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
    .where(and(inArray(communityPosts.id, originalIds), sql`${communityPosts.deletedAt} IS NULL`));

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

  const origMediaByPostId = new Map<string, typeof origMediaRows>();
  for (const m of origMediaRows) {
    if (!origMediaByPostId.has(m.postId)) origMediaByPostId.set(m.postId, []);
    origMediaByPostId.get(m.postId)!.push(m);
  }

  const result = new Map<string, FeedPostOriginal>();
  for (const r of origRows) {
    result.set(r.id, {
      id: r.id,
      content: r.content,
      contentType: r.contentType as FeedPostOriginal["contentType"],
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
  return result;
}

async function _getChronologicalFeedPage(
  userId: string,
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
    .select(FEED_SELECT_COLUMNS)
    .from(communityPosts)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPosts.authorId),
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .leftJoin(
      communityPostBookmarks,
      and(
        eq(communityPostBookmarks.postId, communityPosts.id),
        eq(communityPostBookmarks.userId, userId),
      ),
    )
    .leftJoin(communityUserBadges, eq(communityUserBadges.userId, communityPosts.authorId))
    .where(
      cursorDate
        ? and(eligibilityCondition, lt(communityPosts.createdAt, cursorDate))
        : eligibilityCondition,
    )
    .orderBy(
      // Pinned first by pinnedAt desc (most recently pinned first), then by createdAt desc
      sql`CASE WHEN ${communityPosts.isPinned} THEN ${communityPosts.pinnedAt} ELSE NULL END DESC NULLS LAST`,
      desc(communityPosts.createdAt),
    )
    .limit(limit + 1); // Fetch one extra to detect next page

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.createdAt.toISOString() : null;

  const posts = await _assemblePostPage(pageRows);
  return { posts, nextCursor, isColdStart };
}

/**
 * Get posts for a group feed (member-only, pinned first, then newest).
 * Reuses FEED_SELECT_COLUMNS and _assemblePostPage to avoid duplication.
 */
export async function getGroupFeedPosts(
  groupId: string,
  params: { cursor?: string; limit?: number; viewerId?: string },
): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const { cursor, limit = 20, viewerId } = params;
  const parsedDate = cursor ? new Date(cursor) : undefined;
  const cursorDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;

  const baseColumns = {
    ...FEED_SELECT_COLUMNS,
    // Override isBookmarked: only meaningful if viewerId provided
    isBookmarked: viewerId
      ? sql<boolean>`${communityPostBookmarks.userId} IS NOT NULL`
      : sql<boolean>`false`,
  };

  const query = db
    .select(baseColumns)
    .from(communityPosts)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPosts.authorId),
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .leftJoin(
      communityPostBookmarks,
      viewerId
        ? and(
            eq(communityPostBookmarks.postId, communityPosts.id),
            eq(communityPostBookmarks.userId, viewerId),
          )
        : sql`false`,
    )
    .leftJoin(communityUserBadges, eq(communityUserBadges.userId, communityPosts.authorId))
    .where(
      cursorDate
        ? and(
            eq(communityPosts.groupId, groupId),
            sql`${communityPosts.deletedAt} IS NULL`,
            viewerId
              ? or(
                  eq(communityPosts.status, "active"),
                  and(
                    eq(communityPosts.status, "pending_approval"),
                    eq(communityPosts.authorId, viewerId),
                  ),
                )
              : eq(communityPosts.status, "active"),
            lt(communityPosts.createdAt, cursorDate),
          )
        : and(
            eq(communityPosts.groupId, groupId),
            sql`${communityPosts.deletedAt} IS NULL`,
            viewerId
              ? or(
                  eq(communityPosts.status, "active"),
                  and(
                    eq(communityPosts.status, "pending_approval"),
                    eq(communityPosts.authorId, viewerId),
                  ),
                )
              : eq(communityPosts.status, "active"),
          ),
    )
    .orderBy(
      sql`CASE WHEN ${communityPosts.isPinned} THEN ${communityPosts.pinnedAt} ELSE NULL END DESC NULLS LAST`,
      desc(communityPosts.createdAt),
    )
    .limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1]!.createdAt.toISOString() : null;

  const posts = await _assemblePostPage(pageRows);
  return { posts, nextCursor };
}

async function _getAlgorithmicFeedPage(
  userId: string,
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
    .select(FEED_SELECT_COLUMNS)
    .from(communityPosts)
    .innerJoin(
      communityProfiles,
      and(
        eq(communityProfiles.userId, communityPosts.authorId),
        sql`${communityProfiles.deletedAt} IS NULL`,
      ),
    )
    .leftJoin(
      communityPostBookmarks,
      and(
        eq(communityPostBookmarks.postId, communityPosts.id),
        eq(communityPostBookmarks.userId, userId),
      ),
    )
    .leftJoin(communityUserBadges, eq(communityUserBadges.userId, communityPosts.authorId))
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

  // Pinned posts always first (sorted by pinnedAt desc — most recently pinned first); non-pinned sorted by score then id
  const pinned = scored
    .filter((r) => r.isPinned)
    .sort((a, b) => {
      const aPinnedAt = a.pinnedAt ? a.pinnedAt.getTime() : 0;
      const bPinnedAt = b.pinnedAt ? b.pinnedAt.getTime() : 0;
      return bPinnedAt - aPinnedAt;
    });
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
  const posts = await _assemblePostPage(allPageRows);
  return { posts, nextCursor, isColdStart };
}
