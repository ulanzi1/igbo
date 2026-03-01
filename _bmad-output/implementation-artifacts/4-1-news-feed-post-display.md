# Story 4.1: News Feed & Post Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to view a personalized news feed with posts from my followed members and platform announcements,
So that I stay informed about community activity and feel connected to what's happening.

## Acceptance Criteria

1. **Given** a member navigates to `/[locale]/feed`
   **When** the feed loads
   **Then** a personalized feed displays posts from the member's followed members and platform announcements in reverse chronological order by default (FR49)
   **And** the feed uses cursor-based pagination with infinite scroll (20 posts per page)
   **And** skeleton loading states display during initial load (warm grey pulse, matching FeedItem layout)
   **And** the SSR shell renders immediately (layout, sort controls) with CSR content streaming in

2. **Given** a member wants to change feed sorting
   **When** they click the sort toggle
   **Then** they can switch between "Chronological" (default) and "Algorithmic" modes (FR55)
   **And** the preference persists in `sessionStorage` for the current session
   **And** algorithmic sorting ranks posts by: `score = (recency_decay × 0.6) + (engagement_normalized × 0.4)`
   - `recency_decay` = `exp(-ln(2)/12 * hours_since_post)` — half-life 12 hours, decays from 1.0 to 0.0 over 7 days
   - `engagement_normalized` = `(like_count + 2×comment_count + 3×share_count) / max_engagement_in_window` capped at 1.0
   - Constants defined in `src/config/feed.ts` (RECENCY_WEIGHT=0.6, ENGAGEMENT_WEIGHT=0.4, HALF_LIFE_HOURS=12)
   - Platform cold-start: when total post count < 50, always sort chronologically regardless of mode

3. **Given** a member wants only official communications
   **When** they click "Announcements only" filter
   **Then** the feed shows only posts with `is_pinned = true` OR `content_type = 'announcement'` (FR56)
   **And** a visible "Announcements only" badge appears with a "Show all" button to return to full feed

4. **Given** a member has zero follows and zero group memberships (cold-start)
   **When** they load the feed
   **Then** the system displays engagement-ranked platform-wide posts from the last 7 days (fallback)
   **And** a prompt appears: "Follow members and join groups to personalize your feed"
   **And** once the member follows at least one member, the standard personalized feed activates

5. **Given** posts contain images
   **When** an image post displays in the feed
   **Then** images show with a blurred LQIP placeholder that transitions to the full image on load (per UX spec)
   **And** single images display full-width; multiple images display in a responsive grid (max 4)
   **And** all images use the Next.js `<Image>` component with WebP/AVIF optimization and responsive `srcset` (NFR-P12)

6. **Given** posts contain videos
   **When** a video post displays in the feed
   **Then** the video shows a play button overlay; clicking plays it inline without page navigation
   **And** video plays with sound off by default; tapping toggles sound

7. **Given** the database needs the post data model
   **When** migration `0018_community_posts.sql` is applied
   **Then** the `community_posts` table is created with: id (UUID PK), author_id (FK→auth_users CASCADE), content (TEXT), content_type (enum: text/rich_text/media/announcement), visibility (enum: public/group/members_only, default: members_only), group_id (UUID nullable — FK to community_groups added in Story 5.1), is_pinned (BOOLEAN default false), like_count (INTEGER default 0), comment_count (INTEGER default 0), share_count (INTEGER default 0), deleted_at (TIMESTAMPTZ nullable), created_at, updated_at
   **And** the `community_post_media` table is created with: id (UUID PK), post_id (FK→community_posts CASCADE), media_url (TEXT), media_type (VARCHAR(20): 'image'|'video'), alt_text (TEXT nullable), sort_order (INTEGER default 0), created_at
   **And** indexes exist on: `community_posts(author_id)`, `community_posts(created_at DESC)`, `community_posts(is_pinned) WHERE is_pinned = true`, `community_post_media(post_id)`

8. **Given** the feed feature module is needed
   **When** this story is implemented
   **Then** the `src/features/feed/` module exists with: `FeedList.tsx`, `FeedItem.tsx`, `FeedItemSkeleton.tsx`, `use-feed.ts`, `types/index.ts`, `index.ts`
   **And** the feed page exists at `src/app/[locale]/(app)/feed/page.tsx`
   **And** the feed API exists at `src/app/api/v1/feed/route.ts` (GET, cursor-paginated)
   **And** the feed config exists at `src/config/feed.ts`

## Tasks / Subtasks

### Task 1: DB Schema — `src/db/schema/community-posts.ts` (AC: #7)

- [x] 1.1 Create `src/db/schema/community-posts.ts`:

  ```ts
  import {
    pgTable,
    pgEnum,
    uuid,
    text,
    varchar,
    integer,
    boolean,
    timestamp,
    index,
  } from "drizzle-orm/pg-core";
  import { authUsers } from "./auth-users";

  export const postContentTypeEnum = pgEnum("community_post_content_type", [
    "text",
    "rich_text",
    "media",
    "announcement",
  ]);

  export const postVisibilityEnum = pgEnum("community_post_visibility", [
    "public",
    "group",
    "members_only",
  ]);

  export const communityPosts = pgTable(
    "community_posts",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      authorId: uuid("author_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      content: text("content").notNull(),
      contentType: postContentTypeEnum("content_type").notNull().default("text"),
      visibility: postVisibilityEnum("visibility").notNull().default("members_only"),
      groupId: uuid("group_id"), // FK to community_groups added in Story 5.1
      isPinned: boolean("is_pinned").notNull().default(false),
      likeCount: integer("like_count").notNull().default(0),
      commentCount: integer("comment_count").notNull().default(0),
      shareCount: integer("share_count").notNull().default(0),
      deletedAt: timestamp("deleted_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
      index("idx_community_posts_author_id").on(t.authorId),
      index("idx_community_posts_created_at").on(t.createdAt.desc()),
      index("idx_community_posts_is_pinned").on(t.isPinned),
    ],
  );

  export const communityPostMedia = pgTable(
    "community_post_media",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      postId: uuid("post_id")
        .notNull()
        .references(() => communityPosts.id, { onDelete: "cascade" }),
      mediaUrl: text("media_url").notNull(),
      mediaType: varchar("media_type", { length: 20 }).notNull(), // 'image' | 'video'
      altText: text("alt_text"),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [index("idx_community_post_media_post_id").on(t.postId)],
  );

  export type CommunityPost = typeof communityPosts.$inferSelect;
  export type NewCommunityPost = typeof communityPosts.$inferInsert;
  export type CommunityPostMedia = typeof communityPostMedia.$inferSelect;
  export type NewCommunityPostMedia = typeof communityPostMedia.$inferInsert;
  ```

- [x] 1.2 Register the new schema in `src/db/index.ts`:

  ```ts
  import * as communityPostsSchema from "./schema/community-posts";
  ```

  And spread in the `drizzle()` call: `...communityPostsSchema,`

  **CRITICAL:** Follow the exact pattern used for `communityConnectionsSchema` (added in Story 3.4). The drizzle-kit glob auto-discovers schema files, but the runtime `db` client needs manual registration.

### Task 2: Migration `0018_community_posts.sql` (AC: #7)

- [x] 2.1 Create `src/db/migrations/0018_community_posts.sql`:

  ```sql
  -- community_posts: the core content unit for the news feed.
  -- group_id is intentionally unkeyed in this migration — FK to community_groups
  -- will be added in Story 5.1 once that table exists.
  -- content_type 'announcement' is used for admin communications (always visible).
  -- is_pinned posts always appear at the top of the feed regardless of sort mode.

  CREATE TYPE community_post_content_type AS ENUM ('text', 'rich_text', 'media', 'announcement');
  CREATE TYPE community_post_visibility AS ENUM ('public', 'group', 'members_only');

  CREATE TABLE IF NOT EXISTS community_posts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    author_id     UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    content       TEXT        NOT NULL,
    content_type  community_post_content_type NOT NULL DEFAULT 'text',
    visibility    community_post_visibility   NOT NULL DEFAULT 'members_only',
    group_id      UUID,
    is_pinned     BOOLEAN     NOT NULL DEFAULT false,
    like_count    INTEGER     NOT NULL DEFAULT 0,
    comment_count INTEGER     NOT NULL DEFAULT 0,
    share_count   INTEGER     NOT NULL DEFAULT 0,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
  );

  CREATE INDEX IF NOT EXISTS idx_community_posts_author_id
    ON community_posts (author_id);

  CREATE INDEX IF NOT EXISTS idx_community_posts_created_at
    ON community_posts (created_at DESC);

  -- Partial index: only index pinned posts since most posts are unpinned.
  CREATE INDEX IF NOT EXISTS idx_community_posts_is_pinned
    ON community_posts (is_pinned) WHERE is_pinned = true;

  -- community_post_media: stores ordered media attachments for a post.
  -- sort_order determines display sequence (0 = first).
  CREATE TABLE IF NOT EXISTS community_post_media (
    id         UUID        NOT NULL DEFAULT gen_random_uuid(),
    post_id    UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    media_url  TEXT        NOT NULL,
    media_type VARCHAR(20) NOT NULL,  -- 'image' | 'video'
    alt_text   TEXT,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id)
  );

  CREATE INDEX IF NOT EXISTS idx_community_post_media_post_id
    ON community_post_media (post_id);
  ```

  **Migration naming**: Hand-write SQL only — `drizzle-kit generate` fails with `server-only` errors. Next sequence number after Story 3.4's `0017` is **`0018`**.

### Task 3: Feed Config — `src/config/feed.ts` (AC: #2)

- [x] 3.1 Create `src/config/feed.ts`:

  ```ts
  /**
   * Feed algorithm configuration constants.
   *
   * Two-factor score: score = (recency_decay × RECENCY_WEIGHT) + (engagement_normalized × ENGAGEMENT_WEIGHT)
   *
   * recency_decay = exp(-ln(2) / HALF_LIFE_HOURS * hours_since_post)
   *   → 1.0 when just posted, approaches 0.0 asymptotically over 7 days
   *
   * engagement_normalized = (likes + 2×comments + 3×shares) / max_engagement_in_window, capped at 1.0
   */
  export const FEED_CONFIG = {
    RECENCY_WEIGHT: 0.6,
    ENGAGEMENT_WEIGHT: 0.4,
    HALF_LIFE_HOURS: 12,
    ENGAGEMENT_WINDOW_DAYS: 7,

    /** Multipliers for engagement signal normalization. */
    LIKE_WEIGHT: 1,
    COMMENT_WEIGHT: 2,
    SHARE_WEIGHT: 3,

    /**
     * Platform-level cold-start threshold.
     * Below this number of total posts, always sort chronologically
     * (engagement scores produce noise with too few data points).
     */
    COLD_START_POST_THRESHOLD: 50,

    /** Default page size for cursor-based pagination. */
    PAGE_SIZE: 20,
  } as const;

  export type FeedSortMode = "chronological" | "algorithmic";
  export type FeedFilter = "all" | "announcements";
  ```

### Task 4: DB Queries — `src/db/queries/feed.ts` (AC: #1, #2, #3, #4)

- [x] 4.1 Create `src/db/queries/feed.ts`:

  ```ts
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
   *   Computed in SQL as a CTE. Cursor format: base64(JSON({score, id})).
   *   Platform cold-start (totalPosts < COLD_START_POST_THRESHOLD): force chronological.
   */
  export async function getFeedPosts(
    viewerId: string,
    followedIds: string[],
    totalPosts: number,
    options: GetFeedOptions = {},
  ): Promise<FeedPage> {
    const {
      sort = "chronological",
      filter = "all",
      cursor,
      limit = FEED_CONFIG.PAGE_SIZE,
    } = options;

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
    // Regular posts use created_at cursor
    const cursorDate = cursor ? new Date(cursor) : undefined;

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
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1]!.createdAt.toISOString()
        : null;

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
            return (
              JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as { offset: number }
            ).offset;
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
  ```

  **Notes on the algorithmic implementation:**
  - Application-layer scoring avoids `db.execute()` raw SQL — postgres.js returns a `RowList` (array-like), NOT `{ rows: [...] }`. Accessing `.rows` would be `undefined`.
  - Cursor is a base64-encoded `{ offset: number }` — a stable numeric offset into the sorted result
  - Pinned posts are prepended only on the first page (offset = 0)
  - `halfLifeDecayConstant = ln(2)/12 ≈ 0.0578` computed in JS, avoids SQL float precision issues
  - Safe for MVP: < 500 members × ~5 posts/week = < 500 posts in a 7-day window — scoring 500 rows in Node.js is ~1ms

- [x] 4.2 Create `src/db/queries/feed.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("@/db");
  vi.mock("@/config/feed", () => ({
    FEED_CONFIG: {
      RECENCY_WEIGHT: 0.6,
      ENGAGEMENT_WEIGHT: 0.4,
      HALF_LIFE_HOURS: 12,
      ENGAGEMENT_WINDOW_DAYS: 7,
      LIKE_WEIGHT: 1,
      COMMENT_WEIGHT: 2,
      SHARE_WEIGHT: 3,
      COLD_START_POST_THRESHOLD: 50,
      PAGE_SIZE: 20,
    },
    // FeedSortMode and FeedFilter are type exports — no mock needed
  }));
  ```

  **Mock pattern:** The query functions call `db.select().from().innerJoin().where().orderBy().limit()` chains. Mock `db` with a chainable builder: each method returns `this`, with the terminal method (e.g., `.limit()` or the final `.where()`) returning `mockResolvedValue(rows)`. Alternatively, test the query functions indirectly via `feed-service.test.ts` (mock `@/db/queries/feed` entirely) and keep `feed.test.ts` focused on the scoring/pagination logic using a thin wrapper approach. Use `mockReset()` in `beforeEach`.

  Tests:
  - `getTotalPostCount` returns integer count of non-deleted posts
  - `getFollowedUserIds` returns array of followingId strings for viewerId
  - `getFollowedUserIds` returns empty array when viewerId has no follows
  - `getFeedPosts` chronological: returns posts ordered by `is_pinned DESC, created_at DESC`
  - `getFeedPosts` chronological: applies cursor correctly (posts before cursor date)
  - `getFeedPosts` chronological: `nextCursor` is null when fewer than limit posts returned
  - `getFeedPosts` chronological: `nextCursor` is ISO string when exactly limit posts returned
  - `getFeedPosts` cold-start: `isColdStart = true` when `followedIds` is empty
  - `getFeedPosts` announcements filter: only fetches pinned/announcement posts
  - `getFeedPosts` algorithmic: scores posts correctly (higher engagement = higher score)
  - `getFeedPosts` algorithmic: cursor encodes `{ offset: number }` as base64 JSON

### Task 5: Feed Service — `src/services/feed-service.ts` (AC: #1, #2, #3, #4)

- [x] 5.1 Create `src/services/feed-service.ts`:

  ```ts
  import "server-only";
  import {
    getTotalPostCount,
    getFollowedUserIds,
    getFeedPosts,
    type FeedPage,
    type GetFeedOptions,
  } from "@/db/queries/feed";

  export type { FeedPage, FeedPost, FeedPostMedia } from "@/db/queries/feed";

  export async function getFeed(viewerId: string, options: GetFeedOptions = {}): Promise<FeedPage> {
    const [totalPosts, followedIds] = await Promise.all([
      getTotalPostCount(),
      getFollowedUserIds(viewerId),
    ]);
    return getFeedPosts(viewerId, followedIds, totalPosts, options);
  }
  ```

- [x] 5.2 Create `src/services/feed-service.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/db/queries/feed", () => ({
    getTotalPostCount: vi.fn(),
    getFollowedUserIds: vi.fn(),
    getFeedPosts: vi.fn(),
  }));
  ```

  Tests:
  - `getFeed` calls `getTotalPostCount` and `getFollowedUserIds` in parallel (Promise.all)
  - `getFeed` passes results to `getFeedPosts` with the viewerId and options
  - `getFeed` returns the page from `getFeedPosts`

### Task 6: Rate Limiter Preset (AC: #1)

- [x] 6.1 Add to `src/services/rate-limiter.ts` (after the `FOLLOW_LIST` entry):

  ```ts
  // Story 4.1 additions
  FEED_READ: { maxRequests: 60, windowMs: 60_000 },  // 60/min per userId
  ```

### Task 7: API Route — `GET /api/v1/feed/route.ts` (AC: #1, #2, #3)

- [x] 7.1 Create `src/app/api/v1/feed/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getFeed } from "@/services/feed-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
  import type { FeedSortMode, FeedFilter } from "@/config/feed";

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const url = new URL(request.url);

    const sort = (url.searchParams.get("sort") ?? "chronological") as FeedSortMode;
    const filter = (url.searchParams.get("filter") ?? "all") as FeedFilter;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 1), 50) : undefined;

    // Validate sort and filter values
    if (!["chronological", "algorithmic"].includes(sort)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid sort parameter" });
    }
    if (!["all", "announcements"].includes(filter)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid filter parameter" });
    }

    const page = await getFeed(userId, { sort, filter, cursor, limit });
    return successResponse(page);
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `feed-read:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.FEED_READ,
    },
  });
  ```

- [x] 7.2 Create `src/app/api/v1/feed/route.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/feed-service", () => ({
    getFeed: vi.fn(),
  }));
  ```

  Tests:
  - `GET` returns 200 with `{ posts, nextCursor, isColdStart }` on success
  - `GET` returns 401 when not authenticated
  - `GET` passes `sort=algorithmic` query param correctly to `getFeed`
  - `GET` passes `filter=announcements` query param correctly to `getFeed`
  - `GET` passes `cursor` query param correctly to `getFeed`
  - `GET` returns 400 for invalid `sort` param
  - `GET` returns 400 for invalid `filter` param
  - `GET` clamps `limit` to max 50
  - `GET` does NOT require `Origin` header (read-only, no CSRF needed)

### Task 8: i18n Translations (AC: all UI text)

**Add ALL keys BEFORE any component work (Tasks 9–12)**

- [x] 8.1 Add a new `"Feed"` namespace to `messages/en.json`:

  ```json
  "Feed": {
    "title": "Feed",
    "sortChronological": "Latest",
    "sortAlgorithmic": "Top",
    "filterAll": "All posts",
    "filterAnnouncements": "Announcements",
    "announcementsOnlyBadge": "Announcements only",
    "showAllPosts": "Show all posts",
    "pinnedLabel": "Pinned",
    "noPostsYet": "No posts yet",
    "noPostsInMode": "No posts match the current filter",
    "coldStartHeading": "Welcome to the feed!",
    "coldStartPrompt": "Follow members and join groups to personalize your feed",
    "coldStartCta": "Discover members",
    "loadMore": "Load more",
    "loading": "Loading posts…",
    "justNow": "Just now",
    "minutesAgo": "{count, plural, =1 {1 minute ago} other {# minutes ago}}",
    "hoursAgo": "{count, plural, =1 {1 hour ago} other {# hours ago}}",
    "daysAgo": "{count, plural, =1 {1 day ago} other {# days ago}}",
    "likeCount": "{count, plural, =0 {0 likes} =1 {1 like} other {# likes}}",
    "commentCount": "{count, plural, =0 {0 comments} =1 {1 comment} other {# comments}}",
    "shareCount": "{count, plural, =0 {0 shares} =1 {1 share} other {# shares}}",
    "soundOff": "Sound off",
    "soundOn": "Sound on",
    "announcementBadge": "Announcement",
    "playVideo": "Play video"
  }
  ```

- [x] 8.2 Add corresponding Igbo keys to `messages/ig.json` under `"Feed"`:

  ```json
  "Feed": {
    "title": "Nkọwa",
    "sortChronological": "Ọhụrụ",
    "sortAlgorithmic": "Kacha mma",
    "filterAll": "Ozi niile",
    "filterAnnouncements": "Mkọwa",
    "announcementsOnlyBadge": "Mkọwa naanị",
    "showAllPosts": "Gosi ozi niile",
    "pinnedLabel": "Tụbere",
    "noPostsYet": "Enweghị ozi ka ugbu a",
    "noPostsInMode": "Enweghị ozi dabara na nhọrọ a",
    "coldStartHeading": "Nnabata na nkọwa!",
    "coldStartPrompt": "Soro ndị otu wee sonye na ìgwè ka i mezuo nkọwa gị",
    "coldStartCta": "Chọta ndị otu",
    "loadMore": "Bulite ndị ọzọ",
    "loading": "Na-ebugo ozi…",
    "justNow": "Ugbu a",
    "minutesAgo": "{count, plural, =1 {Otu nkeji gara aga} other {# nkeji gara aga}}",
    "hoursAgo": "{count, plural, =1 {Otu awa gara aga} other {# awa gara aga}}",
    "daysAgo": "{count, plural, =1 {Otu ụbọchị gara aga} other {# ụbọchị gara aga}}",
    "likeCount": "{count, plural, =0 {0 enyemaka} =1 {1 enyemaka} other {# enyemaka}}",
    "commentCount": "{count, plural, =0 {0 nkọwa} =1 {1 nkọwa} other {# nkọwa}}",
    "shareCount": "{count, plural, =0 {0 nkesa} =1 {1 nkesa} other {# nkesa}}",
    "soundOff": "Ụda anọghị",
    "soundOn": "Ụda na-abịa",
    "announcementBadge": "Mkpọsa",
    "playVideo": "Kọọ vidiyo"
  }
  ```

### Task 9: `FeedItemSkeleton` Component (AC: #1)

- [x] 9.1 Create `src/features/feed/components/FeedItemSkeleton.tsx`:

  ```tsx
  export function FeedItemSkeleton() {
    return (
      <div
        className="animate-pulse rounded-lg border border-border bg-card p-4 space-y-3"
        aria-hidden="true"
      >
        {/* Author row */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-3 w-20 rounded bg-muted" />
          </div>
        </div>
        {/* Content lines */}
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="h-3 w-3/5 rounded bg-muted" />
        </div>
        {/* Action row */}
        <div className="flex gap-4 pt-1">
          <div className="h-3 w-12 rounded bg-muted" />
          <div className="h-3 w-14 rounded bg-muted" />
          <div className="h-3 w-10 rounded bg-muted" />
        </div>
      </div>
    );
  }
  ```

  **Note:** Use `animate-pulse` (Tailwind v4) NOT a spinner. Skeleton matches FeedItem layout (avatar row + content lines + action row). The `aria-hidden="true"` hides skeleton from screen readers.

- [x] 9.2 Create `src/features/feed/components/FeedItemSkeleton.test.tsx` (`@vitest-environment jsdom`):

  Tests:
  - Renders with `aria-hidden="true"`
  - Renders the animate-pulse container

### Task 10: `FeedItem` Component (AC: #5, #6)

- [x] 10.1 Create `src/features/feed/components/FeedItem.tsx`:

  ```tsx
  "use client";

  import Image from "next/image";
  import { useTranslations } from "next-intl";
  import { useState, useRef } from "react";
  import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
  import { Badge } from "@/components/ui/badge";
  import { Link } from "@/i18n/navigation";
  import type { FeedPost } from "@/features/feed/types";

  interface FeedItemProps {
    post: FeedPost;
  }

  export function FeedItem({ post }: FeedItemProps) {
    const t = useTranslations("Feed");
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);

    const initials = post.authorDisplayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const relativeTime = formatRelativeTime(new Date(post.createdAt), t);
    const images = post.media.filter((m) => m.mediaType === "image");
    const videos = post.media.filter((m) => m.mediaType === "video");

    const handleVideoClick = () => {
      if (!videoRef.current) return;
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        void videoRef.current.play();
        setIsVideoPlaying(true);
      }
    };

    const handleMuteToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!videoRef.current) return;
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    };

    return (
      <article
        className="rounded-lg border border-border bg-card p-4 space-y-3"
        aria-label={`Post by ${post.authorDisplayName}`}
      >
        {/* Pinned indicator */}
        {post.isPinned && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true">📌</span>
            <span>{t("pinnedLabel")}</span>
          </div>
        )}

        {/* Author row */}
        <div className="flex items-center gap-3">
          <Link href={`/profiles/${post.authorId}`} aria-label={post.authorDisplayName}>
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.authorPhotoUrl ?? undefined} alt={post.authorDisplayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/profiles/${post.authorId}`}
              className="text-sm font-medium hover:underline"
            >
              {post.authorDisplayName}
            </Link>
            <p className="text-xs text-muted-foreground">{relativeTime}</p>
          </div>
          {post.contentType === "announcement" && (
            <Badge variant="secondary">{t("announcementBadge")}</Badge>
          )}
        </div>

        {/* Content */}
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {post.content}
        </div>

        {/* Images — LQIP pattern via Next.js Image */}
        {images.length > 0 && (
          <div
            className={`grid gap-2 ${
              images.length === 1
                ? "grid-cols-1"
                : images.length <= 4
                  ? "grid-cols-2"
                  : "grid-cols-2"
            }`}
          >
            {images.slice(0, 4).map((img) => (
              <div
                key={img.id}
                className="relative aspect-video overflow-hidden rounded-md bg-muted"
              >
                <Image
                  src={img.mediaUrl}
                  alt={img.altText ?? ""}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  placeholder="blur"
                  blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23e5e7eb'/%3E%3C/svg%3E"
                />
              </div>
            ))}
          </div>
        )}

        {/* Video — inline playback, muted by default */}
        {videos.length > 0 && videos[0] && (
          <div className="relative aspect-video overflow-hidden rounded-md bg-black">
            <video
              ref={videoRef}
              src={videos[0].mediaUrl}
              className="h-full w-full object-contain"
              muted
              playsInline
              preload="metadata"
              onClick={handleVideoClick}
              aria-label={t("playVideo")}
            />
            {/* Play/pause overlay — shown when not playing */}
            {!isVideoPlaying && (
              <button
                type="button"
                onClick={handleVideoClick}
                className="absolute inset-0 flex items-center justify-center bg-black/20 min-h-[44px] min-w-[44px]"
                aria-label={t("playVideo")}
              >
                <span className="text-4xl text-white drop-shadow-lg">▶</span>
              </button>
            )}
            {/* Sound toggle — 44×44px tap target (NFR-A5) */}
            <button
              type="button"
              onClick={handleMuteToggle}
              className="absolute bottom-2 right-2 rounded-full bg-black/50 p-2 min-h-[44px] min-w-[44px] text-white text-xs"
              aria-label={isMuted ? t("soundOff") : t("soundOn")}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          </div>
        )}

        {/* Engagement counts — display only in Story 4.1 (interaction in Story 4.3) */}
        <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
          <span>{t("likeCount", { count: post.likeCount })}</span>
          <span>{t("commentCount", { count: post.commentCount })}</span>
          <span>{t("shareCount", { count: post.shareCount })}</span>
        </div>
      </article>
    );
  }

  function formatRelativeTime(
    date: Date,
    t: (key: string, values?: Record<string, unknown>) => string,
  ): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMins < 1) return t("justNow");
    if (diffHours < 1) return t("minutesAgo", { count: diffMins });
    if (diffDays < 1) return t("hoursAgo", { count: diffHours });
    return t("daysAgo", { count: diffDays });
  }
  ```

  **Key notes:**
  - `content_type = "rich_text"` posts render as `whitespace-pre-wrap` plain text in Story 4.1. Full Tiptap rendering (`RichTextRenderer` from `src/features/chat/components/`) deferred to Story 4.2 when the rich text editor is integrated.
  - LQIP: the `blurDataURL` uses an inline SVG data URI for the grey placeholder. Use actual LQIP hashes from the upload pipeline (Story 1.14) when available.
  - 44×44px tap target for video controls (NFR-A5). Play button overlay + sound toggle both enforce `min-h-[44px] min-w-[44px]`.
  - `FeedPost` type imported from `@/features/feed/types` (barrel, see Task 12).

- [x] 10.2 Create `src/features/feed/components/FeedItem.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  // next/image renders nothing in jsdom without this mock
  vi.mock("next/image", () => ({
    default: (props: Record<string, unknown>) => <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />,
  }));
  vi.mock("@/i18n/navigation", () => ({
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
      <a href={href} {...props}>{children}</a>
    ),
  }));
  ```

  Tests:
  - Renders author display name and avatar initials
  - Renders post content text
  - Renders "Pinned" indicator when `isPinned = true`
  - Does NOT render pinned indicator when `isPinned = false`
  - Renders image element for media posts with image type
  - Renders video element with `muted` attribute for video posts
  - Does NOT render image grid when `media` is empty
  - Renders engagement counts (likeCount, commentCount, shareCount)
  - Author name and avatar link to `/profiles/${authorId}`
  - Renders `Badge` for `announcement` content type

### Task 11: `FeedList` Component — Infinite Scroll (AC: #1, #2, #3, #4)

- [x] 11.1 Create `src/features/feed/hooks/use-feed.ts`:

  ```ts
  "use client";

  import { useInfiniteQuery } from "@tanstack/react-query";
  import type { FeedSortMode, FeedFilter } from "@/config/feed";
  import type { FeedPage } from "@/features/feed/types";

  interface UseFeedOptions {
    sort: FeedSortMode;
    filter: FeedFilter;
  }

  export function useFeed({ sort, filter }: UseFeedOptions) {
    return useInfiniteQuery<FeedPage, Error, { pages: FeedPage[] }, string[], string | null>({
      queryKey: ["feed", sort, filter],
      queryFn: async ({ pageParam }) => {
        const url = new URL("/api/v1/feed", window.location.origin);
        url.searchParams.set("sort", sort);
        url.searchParams.set("filter", filter);
        if (pageParam) url.searchParams.set("cursor", pageParam);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Failed to fetch feed");
        const json = (await res.json()) as { data: FeedPage };
        return json.data;
      },
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 30_000, // 30s — feed is semi-real-time
    });
  }
  ```

  **React Query v5 notes:**
  - `useInfiniteQuery` in v5 requires `initialPageParam` (no longer inferred)
  - `getNextPageParam` returns `undefined` (not `null` or `false`) to signal no more pages
  - `pageParam` is typed as `string | null` — the cursor or null for first page

- [x] 11.2 Create `src/features/feed/components/FeedList.tsx`:

  ```tsx
  "use client";

  import { useEffect, useRef, useCallback, useState } from "react";
  import { useTranslations } from "next-intl";
  import { Link } from "@/i18n/navigation";
  import { useFeed } from "../hooks/use-feed";
  import { FeedItem } from "./FeedItem";
  import { FeedItemSkeleton } from "./FeedItemSkeleton";
  import { Button } from "@/components/ui/button";
  import type { FeedSortMode, FeedFilter } from "@/config/feed";

  interface FeedListProps {
    initialSort?: FeedSortMode;
    initialFilter?: FeedFilter;
  }

  export function FeedList({
    initialSort = "chronological",
    initialFilter = "all",
  }: FeedListProps) {
    const t = useTranslations("Feed");

    // Sort preference persisted in sessionStorage
    const [sort, setSort] = useState<FeedSortMode>(() => {
      if (typeof window === "undefined") return initialSort;
      return (sessionStorage.getItem("feed-sort") as FeedSortMode | null) ?? initialSort;
    });

    const [filter, setFilter] = useState<FeedFilter>(initialFilter);

    const handleSortChange = (newSort: FeedSortMode) => {
      setSort(newSort);
      sessionStorage.setItem("feed-sort", newSort);
    };

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useFeed({
      sort,
      filter,
    });

    // Infinite scroll via IntersectionObserver
    const sentinelRef = useRef<HTMLDivElement>(null);
    const fetchNextPageStable = useCallback(() => {
      if (hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    useEffect(() => {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) fetchNextPageStable();
        },
        { threshold: 0.1 },
      );
      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [fetchNextPageStable]);

    const allPosts = data?.pages.flatMap((p) => p.posts) ?? [];
    const isColdStart = data?.pages[0]?.isColdStart ?? false;

    // Initial loading
    if (isLoading) {
      return (
        <div className="space-y-4">
          <FeedControls
            sort={sort}
            filter={filter}
            onSortChange={handleSortChange}
            onFilterChange={setFilter}
          />
          {Array.from({ length: 3 }).map((_, i) => (
            <FeedItemSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{t("noPostsYet")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <FeedControls
          sort={sort}
          filter={filter}
          onSortChange={handleSortChange}
          onFilterChange={setFilter}
        />

        {/* Announcements-only badge */}
        {filter === "announcements" && (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="font-medium">{t("announcementsOnlyBadge")}</span>
            <Button variant="ghost" size="sm" onClick={() => setFilter("all")}>
              {t("showAllPosts")}
            </Button>
          </div>
        )}

        {/* Cold-start empty state */}
        {isColdStart && allPosts.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
            <h2 className="text-lg font-semibold">{t("coldStartHeading")}</h2>
            <p className="text-sm text-muted-foreground">{t("coldStartPrompt")}</p>
            <Link href="/discover">
              <Button variant="outline" size="sm">
                {t("coldStartCta")}
              </Button>
            </Link>
          </div>
        )}

        {/* Cold-start prompt when cold-start but some platform posts are shown */}
        {isColdStart && allPosts.length > 0 && (
          <div className="rounded-lg border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("coldStartPrompt")} —{" "}
            <Link href="/discover" className="underline hover:text-foreground">
              {t("coldStartCta")}
            </Link>
          </div>
        )}

        {/* Feed items */}
        {allPosts.length > 0 ? (
          <>
            <ul className="space-y-4" aria-label="Feed posts">
              {allPosts.map((post) => (
                <li key={post.id}>
                  <FeedItem post={post} />
                </li>
              ))}
            </ul>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} aria-hidden="true" className="h-4" />

            {/* Manual load-more fallback (e.g., if IntersectionObserver not supported) */}
            {hasNextPage && !isFetchingNextPage && (
              <Button variant="outline" className="w-full" onClick={() => void fetchNextPage()}>
                {t("loadMore")}
              </Button>
            )}

            {isFetchingNextPage && (
              <div className="space-y-4">
                <FeedItemSkeleton />
              </div>
            )}
          </>
        ) : (
          !isColdStart && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filter === "announcements" ? t("noPostsInMode") : t("noPostsYet")}
            </p>
          )
        )}
      </div>
    );
  }

  interface FeedControlsProps {
    sort: FeedSortMode;
    filter: FeedFilter;
    onSortChange: (s: FeedSortMode) => void;
    onFilterChange: (f: FeedFilter) => void;
  }

  function FeedControls({ sort, filter, onSortChange, onFilterChange }: FeedControlsProps) {
    const t = useTranslations("Feed");
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Sort toggle */}
        <div
          className="flex rounded-md border border-border overflow-hidden"
          role="group"
          aria-label="Feed sort"
        >
          {(["chronological", "algorithmic"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSortChange(mode)}
              aria-pressed={sort === mode}
              className={`px-3 py-1.5 text-sm font-medium transition-colors min-h-[44px] ${
                sort === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "chronological" ? t("sortChronological") : t("sortAlgorithmic")}
            </button>
          ))}
        </div>

        {/* Announcements filter */}
        <button
          type="button"
          onClick={() => onFilterChange(filter === "announcements" ? "all" : "announcements")}
          aria-pressed={filter === "announcements"}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-border transition-colors min-h-[44px]"
        >
          {t("filterAnnouncements")}
        </button>
      </div>
    );
  }
  ```

  **Key implementation notes:**
  - `useState(() => sessionStorage.getItem(...) ?? initialSort)` with SSR guard (`typeof window === "undefined"`)
  - IntersectionObserver pattern with `useCallback` for stable reference in `useEffect`
  - Pinned posts: the API route always sorts by `is_pinned DESC` first, so no special handling needed client-side
  - `aria-pressed` on sort/filter toggles for accessibility
  - `min-h-[44px]` on all interactive controls (NFR-A5)

- [x] 11.3 Create `src/features/feed/components/FeedList.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../hooks/use-feed");
  vi.mock("./FeedItem", () => ({
    FeedItem: ({ post }: { post: { id: string; authorDisplayName: string } }) => (
      <div data-testid={`feed-item-${post.id}`}>{post.authorDisplayName}</div>
    ),
  }));
  vi.mock("./FeedItemSkeleton", () => ({
    FeedItemSkeleton: () => <div data-testid="skeleton" />,
  }));
  vi.mock("@/i18n/navigation", () => ({
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
      <a href={href}>{children}</a>
    ),
  }));
  ```

  Use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` if any test awaits React Query data.

  Tests:
  - Shows 3 `FeedItemSkeleton` elements when `isLoading = true`
  - Renders `FeedItem` for each post when data is loaded
  - Shows cold-start heading and CTA when `isColdStart = true` and `allPosts.length === 0`
  - Shows cold-start inline prompt when `isColdStart = true` but posts are present
  - Does NOT show cold-start UI when `isColdStart = false`
  - Renders "Announcements only" badge when `filter = "announcements"`
  - "Show all posts" button sets filter back to `"all"`
  - Sort buttons render with `aria-pressed` attribute
  - "Load more" button appears when `hasNextPage = true` and `!isFetchingNextPage`
  - Clicking sort toggle calls sessionStorage and re-queries with new sort
  - Empty state shows `noPostsYet` text when no posts and not cold-start

- [x] 11.4 Create `src/features/feed/hooks/use-feed.test.ts` (`@vitest-environment jsdom`):

  Use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` — React Query's `useInfiniteQuery` requires real timers.

  Tests:
  - Initial fetch calls `/api/v1/feed?sort=chronological&filter=all` (no cursor)
  - Returns posts from first page
  - `fetchNextPage` called when `hasNextPage = true` sends cursor param
  - `hasNextPage` is `false` when `nextCursor = null`
  - Re-fetches when `sort` changes

### Task 12: Types barrel and feature module (AC: #8)

- [x] 12.1 Create `src/features/feed/types/index.ts`:

  ```ts
  // Re-export types used across feed feature components
  export type { FeedPost, FeedPostMedia, FeedPage, GetFeedOptions } from "@/db/queries/feed";
  export type { FeedSortMode, FeedFilter } from "@/config/feed";
  ```

- [x] 12.2 Create `src/features/feed/index.ts`:

  ```ts
  export { FeedList } from "./components/FeedList";
  export { FeedItem } from "./components/FeedItem";
  export { FeedItemSkeleton } from "./components/FeedItemSkeleton";
  export { useFeed } from "./hooks/use-feed";
  export type { FeedPost, FeedPostMedia, FeedPage, FeedSortMode, FeedFilter } from "./types";
  ```

### Task 13: Feed Page Route (AC: #1, #8)

- [x] 13.1 Create `src/app/[locale]/(app)/feed/page.tsx`:

  ```tsx
  import { redirect } from "next/navigation";
  import { getTranslations } from "next-intl/server";
  import { auth } from "@/auth";
  import { FeedList } from "@/features/feed";

  export const dynamic = "force-dynamic"; // Personalized — never cache at SSR level

  export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Feed" });
    return { title: t("title") };
  }

  export default async function FeedPage() {
    const session = await auth();
    if (!session?.user) redirect("/");

    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <FeedList />
      </main>
    );
  }
  ```

  **Notes:**
  - `export const dynamic = "force-dynamic"` — feed is personalized, never static. Architecture says SSR shell + CSR content for `/feed`.
  - `auth()` is the server-side session check (Auth.js v5 pattern used in profiles page).
  - `FeedList` is the CSR client component — it handles all data fetching via TanStack Query.

- [x] 13.2 Create `src/app/[locale]/(app)/feed/page.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("@/auth", () => ({ auth: vi.fn() }));
  vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
  vi.mock("@/features/feed", () => ({
    FeedList: () => <div data-testid="feed-list" />,
  }));
  vi.mock("next-intl/server", () => ({
    getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  }));
  ```

  Tests:
  - Renders `FeedList` when session exists
  - Calls `redirect("/")` when session is null
  - Page has `export const dynamic = "force-dynamic"`

### Task 14: Sprint Status Update

- [x] 14.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Change `4-1-news-feed-post-display: backlog` → `4-1-news-feed-post-display: ready-for-dev` (already done by SM)
  - Change `epic-4: backlog` → `epic-4: in-progress` (already done by SM)

## Dev Notes

### DB Schema — Two New Tables, No Existing Schema Touches

Story 4.1 creates two entirely new tables — `community_posts` and `community_post_media`. No existing schema files need modification. The only existing files touched are:

- `src/db/index.ts` — register `communityPostsSchema`
- `src/services/rate-limiter.ts` — add `FEED_READ` preset

The `group_id` column in `community_posts` is deliberately left without a FK constraint. The `community_groups` table doesn't exist until Epic 5. Adding the FK in Story 5.1 is the correct approach — attempting a forward-reference FK would fail migration at deploy time.

### Migration: 0018 (Next Sequence)

The last migration was `0017_member_following.sql` (Story 3.4). The next is `0018_community_posts.sql`. **Hand-write the SQL** — `drizzle-kit generate` fails with `server-only` import errors in the project setup. This is the established pattern since Epic 1.

### Feed Route: SSR Shell + CSR Content

Per architecture rendering strategy: `/feed` uses **SSR shell + CSR content**. This means:

- `page.tsx` is a server component that renders instantly (the layout shell)
- `FeedList` is a client component (`"use client"`) that fetches posts via TanStack Query
- Do NOT use `fetch` with `cache` or ISR revalidation on the feed page — it's personalized

### Feed API Route: GET Only (No Mutations)

`GET /api/v1/feed` is read-only — no CSRF Origin header needed in tests. Post creation (`POST /api/v1/posts`) is Story 4.2.

### Algorithm Constants in `src/config/feed.ts`

The `FEED_CONFIG` object is the single source of truth for algorithm weights. The values are:

- `RECENCY_WEIGHT = 0.6` — per epics.md and feed-algorithm.md decision record
- `ENGAGEMENT_WEIGHT = 0.4` — remaining weight (must sum to 1.0)
- `HALF_LIFE_HOURS = 12` — post half-life for recency decay

The comment in `feed.ts` explains the exponential decay formula. `ln(2) / 12 ≈ 0.0578` is the decay constant.

### Algorithmic Feed — Application-layer Scoring (NOT raw SQL)

The algorithmic feed uses **application-layer scoring** (fetch candidates with Drizzle, score in JS, sort, paginate by offset). Do NOT use `db.execute()` raw SQL for this:

- `db.execute(sql\`...\`)`with postgres.js driver returns a`RowList`(array-like object) — accessing`.rows`on the result is`undefined`. Raw SQL scoring requires casting and is brittle.
- Drizzle SQL CTEs with dynamic `eligibilityCondition` objects are complex to type correctly.
- Application-layer scoring is simpler, fully testable with mocked DB, and safe at MVP scale (< 500 members × ~5 posts/week = < 500 posts in a 7-day window — scoring in Node.js is ~1ms).

**Cursor format:** base64-encoded `{ offset: number }` — a numeric offset into the sorted result set. This is stable because the sort order is deterministic for a given query (score DESC, id DESC) even if absolute scores shift slightly over time.

**Platform cold-start check:** `totalPosts < COLD_START_POST_THRESHOLD (50)` → force chronological. Computed via separate `getTotalPostCount()` query in `feed-service.ts` using `Promise.all` with `getFollowedUserIds`.

### TanStack Query v5 — `useInfiniteQuery` Changes

The project uses TanStack Query (React Query) **v5**. In v5:

- `useInfiniteQuery` requires `initialPageParam` (no longer inferred as `undefined`)
- `getNextPageParam` must return `undefined` (not `null` or `false`) to signal no more pages
- `onSuccess` was removed from `useQuery` and `useInfiniteQuery` — use `useEffect` for side effects on data
- All page data is accessed via `data.pages` (array of page objects)

```ts
// ✅ CORRECT — React Query v5
useInfiniteQuery({
  queryKey: ["feed", sort, filter],
  initialPageParam: null,  // REQUIRED
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined, // undefined = no more pages
  queryFn: async ({ pageParam }) => { ... },
});

// ❌ WRONG — React Query v4 pattern
useInfiniteQuery({
  getNextPageParam: (lastPage) => lastPage.nextCursor || false, // v4 pattern, breaks in v5
});
```

### Mock Pattern for DB Query Files

**CRITICAL:** DB query files that are imported in service tests MUST use explicit factory mocks:

```ts
// ✅ CORRECT — explicit factory
vi.mock("@/db/queries/feed", () => ({
  getTotalPostCount: vi.fn(),
  getFollowedUserIds: vi.fn(),
  getFeedPosts: vi.fn(),
}));

// ❌ WRONG — bare auto-mock triggers @/db cascade
vi.mock("@/db/queries/feed");
```

This pattern is established from Stories 3.3, 3.4, and the Epic 3 retro. Bare `vi.mock` causes Vitest to auto-import the module for structure analysis, loading `@/db` and all transitive deps including `server-only`.

### `mockReset()` Not `clearAllMocks()` for Once Sequences

When tests use `mockResolvedValueOnce` sequences (e.g., `getTotalPostCount` returns 100, then `getFollowedUserIds` returns [...]), use `mockReset()` in `beforeEach`:

```ts
beforeEach(() => {
  mockGetTotalPostCount.mockReset();
  mockGetFollowedUserIds.mockReset();
  mockGetFeedPosts.mockReset();
});
```

`vi.clearAllMocks()` only clears call history. It does NOT clear queued `Once` return values. Leftover `Once` values bleed into subsequent tests — established pattern from Stories 3.3 and Epic 3 retro.

### New Feature Module — FeedList Uses React Query Cascade

`FeedList.tsx` uses `useFeed` which calls `useInfiniteQuery`. Any test rendering `FeedList` without mocking `useFeed` will fail with "No QueryClient set". Mock at the hook level:

```ts
vi.mock("../hooks/use-feed");
```

Similarly, `FeedItem.tsx` uses Next.js `<Image>` and `Link` from `@/i18n/navigation` — mock these in `FeedItem.test.tsx`.

If any existing component test renders `FeedList` (unlikely in Story 4.1 since this is a new feature), add the mock.

### SSR Guard for sessionStorage

`FeedList` reads sessionStorage in the `useState` initializer. This must guard against SSR:

```ts
useState<FeedSortMode>(() => {
  if (typeof window === "undefined") return initialSort; // SSR: use default
  return (sessionStorage.getItem("feed-sort") as FeedSortMode | null) ?? initialSort;
});
```

This matches the `localStorage` pattern from Story 3.2 (geo-fallback indicator). Both return the default during SSR to prevent hydration mismatches.

**Intentional one-shot hydration discrepancy:** If the user previously selected "Algorithmic" sort (stored in sessionStorage), the server renders with `initialSort = "chronological"` and the client immediately updates to "algorithmic" after hydration. React may log a hydration warning in dev mode — this is acceptable and intentional (session memory wins). The `typeof window === "undefined"` guard prevents a full hydration mismatch by returning the same value both SSR and CSR _on first render_; the sessionStorage value takes effect on the subsequent re-render triggered by React's hydration pass.

### `Link` Import — `@/i18n/navigation`

All navigation `<Link>` components must import from `@/i18n/navigation` (not `next/link`). This wraps Next.js Link with locale-aware routing from next-intl. Pattern established from Story 2.2 onwards.

### `FeedItem` — Rich Text Rendering Deferred

`content_type = "rich_text"` posts are rendered as plain `whitespace-pre-wrap` text in Story 4.1. The `RichTextRenderer` component from `src/features/chat/components/RichTextRenderer.tsx` handles Tiptap content (mentions, bold, etc.) and WILL be reused in Story 4.2 when the post composer is built. In Story 4.1:

- Import `RichTextRenderer` is NOT needed
- Plain `<div className="whitespace-pre-wrap">` is sufficient
- This avoids pulling the Tiptap dependency into the feed before it's needed

### LQIP — Inline SVG Base64 Placeholder

The `blurDataURL` for Next.js `<Image>` uses an inline grey SVG as the LQIP placeholder:

```
data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23e5e7eb'/%3E%3C/svg%3E
```

This is a 40×40 grey rect — visually matches the `bg-muted` class used elsewhere. Actual per-image LQIP hashes from the upload pipeline (Story 1.14's `sharp` processing) can be stored and used in the `community_post_media.alt_text` field (or a dedicated `blur_data_url` column) in a future story. For Story 4.1, use this static placeholder.

### Infinite Scroll — IntersectionObserver

The `FeedList` component uses `IntersectionObserver` to trigger `fetchNextPage` when the sentinel div scrolls into view. The `useCallback` wrapper on `fetchNextPageStable` prevents the observer from being recreated on every render:

```ts
const fetchNextPageStable = useCallback(() => {
  if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
}, [fetchNextPage, hasNextPage, isFetchingNextPage]);
```

A manual "Load more" button is also rendered as a fallback for environments where IntersectionObserver is not supported.

### NFR-A5: 44×44px Minimum Tap Targets

All interactive controls must meet the 44×44px minimum touch target (WCAG 2.1 AA + NFR-A5):

- Sort toggle buttons: `min-h-[44px]`
- Announcements filter button: `min-h-[44px]`
- Video play overlay: `min-h-[44px] min-w-[44px]`
- Video sound toggle: `min-h-[44px] min-w-[44px]`

### Feed Page Route — `export const dynamic = "force-dynamic"`

The feed page must not be cached at the CDN or Next.js ISR level. Add:

```ts
export const dynamic = "force-dynamic";
```

This forces the page to re-render on every request (no static generation). Compare with `profiles/[userId]/page.tsx` which uses `export const revalidate = 300` — profiles are semi-static; feed is fully personalized.

### Groups Integration Deferred (Story 4.1 Scope)

The feed query's `eligibilityCondition` for normal mode includes:

```ts
sql`${communityPosts.groupId} IS NULL`; // Group posts deferred to Epic 5
```

This explicitly excludes group posts from Story 4.1's feed. When Epic 5 adds group membership tables, Story 5.x will add a new condition to the feed query to include posts where the viewer is a member of the post's group.

### EventBus — No Events in Story 4.1

Post feed display does not emit EventBus events. Story 4.2 (post creation) will emit `post.published`. Story 4.3 (reactions) will emit `post.reacted` and `post.commented`.

### Test Count Estimate

- `feed.test.ts`: ~9 new tests
- `feed-service.test.ts`: ~3 new tests
- `feed/route.test.ts`: ~9 new tests
- `FeedItemSkeleton.test.tsx`: ~2 new tests
- `FeedItem.test.tsx`: ~9 new tests
- `FeedList.test.tsx`: ~10 new tests
- `use-feed.test.ts`: ~5 new tests
- `feed/page.test.tsx`: ~3 new tests

**Estimated new tests: ~50** (bringing total from ~1875 to ~1925)

### Project Structure Notes

**New files (Story 4.1):**

- `src/config/feed.ts`
- `src/db/schema/community-posts.ts`
- `src/db/migrations/0018_community_posts.sql`
- `src/db/queries/feed.ts`
- `src/db/queries/feed.test.ts`
- `src/services/feed-service.ts`
- `src/services/feed-service.test.ts`
- `src/app/api/v1/feed/route.ts`
- `src/app/api/v1/feed/route.test.ts`
- `src/app/[locale]/(app)/feed/page.tsx`
- `src/app/[locale]/(app)/feed/page.test.tsx`
- `src/features/feed/components/FeedItem.tsx`
- `src/features/feed/components/FeedItem.test.tsx`
- `src/features/feed/components/FeedItemSkeleton.tsx`
- `src/features/feed/components/FeedItemSkeleton.test.tsx`
- `src/features/feed/components/FeedList.tsx`
- `src/features/feed/components/FeedList.test.tsx`
- `src/features/feed/hooks/use-feed.ts`
- `src/features/feed/hooks/use-feed.test.ts`
- `src/features/feed/types/index.ts`
- `src/features/feed/index.ts`

**Modified files:**

- `src/db/index.ts` — register `communityPostsSchema`
- `src/services/rate-limiter.ts` — add `FEED_READ` preset
- `messages/en.json` — add `"Feed"` namespace
- `messages/ig.json` — add Igbo `"Feed"` namespace
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — already updated

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 4, Story 4.1, lines 1741–1789]
- [Source: `docs/decisions/feed-algorithm.md` — Two-factor score algorithm, cold-start thresholds, weight constants]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Frontend-Architecture` — SSR shell + CSR content for /feed, FeedList/FeedItem/FeedItemSkeleton component names, feature module structure]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Data-Architecture` — Table naming convention (community_ prefix), cursor-based pagination, soft-delete pattern]
- [Source: `_bmad-output/planning-artifacts/architecture.md#API-Communication-Patterns` — Cursor-based pagination for feeds, successResponse format]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — NFR-A5 44px tap targets, NFR-P12 WebP/AVIF image optimization, WCAG 2.1 AA]
- [Source: `src/db/schema/community-connections.ts` — Drizzle schema pattern: imports, pgTable, index, composite PK]
- [Source: `src/db/schema/chat-messages.ts` — pgEnum pattern, relations, timestamp pattern]
- [Source: `src/db/index.ts` — Manual schema registration pattern (communityConnectionsSchema model)]
- [Source: `src/services/rate-limiter.ts` — RATE_LIMIT_PRESETS pattern, FOLLOW_LIST (60/min read) as reference]
- [Source: `src/server/api/middleware.ts` — withApiHandler, rateLimit option]
- [Source: `src/lib/api-response.ts` — successResponse, errorResponse pattern (single ProblemDetails arg)]
- [Source: `src/lib/api-error.ts` — ApiError({ title, status, detail }) for route errors]
- [Source: `src/services/permissions.ts` — requireAuthenticatedSession() pattern]
- [Source: `src/test/vi-patterns.ts` — useRealTimersForReactQuery() for React Query tests]
- [Source: `_bmad-output/implementation-artifacts/3-4-member-following.md` — Explicit factory mock pattern for DB queries, mockReset() in beforeEach, useRealTimersForReactQuery usage]
- [Source: `_bmad-output/implementation-artifacts/3-2-geographic-fallback-discovery.md` — SSR guard for localStorage/sessionStorage in useState initializer]
- [Source: `src/features/chat/components/RichTextRenderer.tsx` — Tiptap rich text rendering (deferred to Story 4.2)]
- [Source: `src/i18n/navigation.ts` — Link import path for locale-aware navigation]
- [Source: `src/db/queries/follows.ts` — db.transaction pattern, sql template tag for complex conditions]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- IntersectionObserver not defined in jsdom — fixed with class-based mock (not arrow function)
- `@/auth` import path wrong — corrected to `@/server/auth/config` (matches profiles page pattern)
- `sessionStorage.setItem` spy via `vi.spyOn(Storage.prototype, "setItem")` did not fire in jsdom — changed assertion to `sessionStorage.getItem("feed-sort")` check

### Completion Notes List

- ✅ Task 1: DB Schema `community-posts.ts` + `communityPostsSchema` registered in `src/db/index.ts`
- ✅ Task 2: Migration `0018_community_posts.sql` hand-written (drizzle-kit generate fails with server-only)
- ✅ Task 3: Feed config `src/config/feed.ts` with RECENCY_WEIGHT=0.6, ENGAGEMENT_WEIGHT=0.4, HALF_LIFE_HOURS=12
- ✅ Task 4: DB queries `src/db/queries/feed.ts` — chronological + algorithmic (application-layer scoring) + tests
- ✅ Task 5: Feed service `src/services/feed-service.ts` with Promise.all for parallel DB calls + tests
- ✅ Task 6: `FEED_READ` rate limit preset added to `src/services/rate-limiter.ts`
- ✅ Task 7: API route `GET /api/v1/feed` with sort/filter/cursor/limit params + tests (9 tests)
- ✅ Task 8: i18n — `"Feed"` namespace added to both `messages/en.json` and `messages/ig.json`
- ✅ Task 9: `FeedItemSkeleton` component with `aria-hidden=true` + tests (2 tests)
- ✅ Task 10: `FeedItem` component — LQIP images, inline video with mute toggle, engagement counts + tests (9 tests)
- ✅ Task 11: `FeedList` component — infinite scroll via IntersectionObserver, sort/filter controls, cold-start state, sessionStorage sort persistence + tests (10 component tests + 5 hook tests)
- ✅ Task 12: `src/features/feed/types/index.ts` + `src/features/feed/index.ts` barrel
- ✅ Task 13: Feed page `src/app/[locale]/(app)/feed/page.tsx` with `force-dynamic` + tests (3 tests)
- ✅ Task 14: Sprint status already updated (SM had set epic-4: in-progress, 4-1: ready-for-dev)

**Test count: 59 new tests (1875 → 1934 total, all passing)**

**Key technical decisions made during implementation:**

- `import { auth } from "@/server/auth/config"` — not `@/auth` (consistent with profiles page)
- `global.IntersectionObserver = class { ... }` (class, NOT `vi.fn().mockImplementation(() => ...)`) — arrow functions can't be used with `new`
- `sessionStorage.getItem()` assertion instead of `Storage.prototype.setItem` spy — jsdom intercept issue

### File List

**New files:**

- `src/config/feed.ts`
- `src/db/schema/community-posts.ts`
- `src/db/migrations/0018_community_posts.sql`
- `src/db/queries/feed.ts`
- `src/db/queries/feed.test.ts`
- `src/services/feed-service.ts`
- `src/services/feed-service.test.ts`
- `src/app/api/v1/feed/route.ts`
- `src/app/api/v1/feed/route.test.ts`
- `src/app/[locale]/(app)/feed/page.tsx`
- `src/app/[locale]/(app)/feed/page.test.tsx`
- `src/features/feed/components/FeedItem.tsx`
- `src/features/feed/components/FeedItem.test.tsx`
- `src/features/feed/components/FeedItemSkeleton.tsx`
- `src/features/feed/components/FeedItemSkeleton.test.tsx`
- `src/features/feed/components/FeedList.tsx`
- `src/features/feed/components/FeedList.test.tsx`
- `src/features/feed/hooks/use-feed.ts`
- `src/features/feed/hooks/use-feed.test.ts`
- `src/features/feed/types/index.ts`
- `src/features/feed/index.ts`

**Modified files:**

- `src/db/index.ts` — registered `communityPostsSchema`
- `src/services/rate-limiter.ts` — added `FEED_READ` preset
- `messages/en.json` — added `"Feed"` namespace
- `messages/ig.json` — added Igbo `"Feed"` namespace
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated `4-1-news-feed-post-display: in-progress`

## Change Log

- 2026-03-01: Story 4.1 implemented by claude-sonnet-4-6 — news feed and post display. Created community_posts and community_post_media DB schema + migration 0018, feed algorithm config, cursor-paginated feed API with chronological/algorithmic modes, cold-start detection, FeedItem/FeedList/FeedItemSkeleton components, use-feed hook, feed page at /[locale]/feed. 59 new tests added (1875→1934 total).
- 2026-03-01: Code review by claude-opus-4-6 — 3 HIGH, 4 MEDIUM, 1 LOW findings. 6 issues fixed (H1: partial index mismatch in Drizzle schema, H2: 3 hardcoded English aria-labels → i18n keys, H3: validation-before-cast in route handler, M2: error state misleading message, M3: clearAllMocks→mockReset in feed.test.ts, M4: chronological cursor validation). M1 (double requireAuthenticatedSession) deferred — established codebase-wide pattern. L1 (mixed uncommitted work items) noted. All 1934 tests pass.
