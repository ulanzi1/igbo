# Story 4.4: Bookmarks & Pinned Announcements

Status: done

## Story

As a member,
I want to bookmark posts for later reference and see admin-pinned announcements at the top of my feed,
So that I can save important content and never miss official community communications.

## Acceptance Criteria

1. **Given** a member wants to save a post
   **When** they tap the bookmark icon on a post
   **Then** the system saves the post to their bookmarks collection (FR53)
   **And** the bookmark icon toggles to a filled state (optimistic update)
   **And** they can access all bookmarked posts from a dedicated "Saved" section at `/saved`
   **And** bookmarks are private — only the member can see their saved posts

2. **Given** an admin wants to pin an announcement
   **When** they tap the pin icon on a post (visible only to admins in the feed)
   **Then** the post appears at the top of all members' feeds with a "Pinned" label (FR54)
   **And** pinned posts remain at the top regardless of feed sorting mode
   **And** multiple pinned posts are ordered by pin date (most recent pin_date first)
   **And** only admins can pin/unpin posts
   **And** the pin action is also available via `PATCH /api/v1/posts/[postId]/pin`

3. **Given** the database needs bookmark support
   **When** this story is implemented
   **Then** migration `0022_post_bookmarks.sql` creates the `community_post_bookmarks` table with fields: `user_id` (FK CASCADE), `post_id` (FK CASCADE), `created_at` (composite PK on user_id + post_id)
   **And** the same migration adds a `pinned_at` (TIMESTAMPTZ, nullable) column to `community_posts` for pinned announcement ordering

4. **Given** the feed query needs to show bookmark state
   **When** the feed loads for a logged-in member
   **Then** each `FeedPost` entry includes `isBookmarked: boolean` (via LEFT JOIN on `community_post_bookmarks`)
   **And** the `BookmarkButton` renders filled/outline icon based on `initialIsBookmarked` prop without needing a separate API call

5. **Given** a member navigates to the "Saved" section
   **When** the page loads at `/saved`
   **Then** a paginated list of bookmarked posts is displayed in reverse bookmark-date order (most recently bookmarked first)
   **And** each post renders as a `FeedItem` with full interaction capabilities (react, comment, share, un-bookmark)
   **And** an empty state is shown when no bookmarks exist

## Tasks / Subtasks

### Task 1: Migration `0022_post_bookmarks.sql` (AC: #3)

- [x] 1.1 Create `src/db/migrations/0022_post_bookmarks.sql`:

  ```sql
  -- Bookmarks: private per-member save list for posts.
  -- Composite PK (user_id, post_id) — each member can bookmark a post only once.
  -- ON DELETE CASCADE on both FKs: bookmarks auto-removed when user or post is deleted.
  -- INDEX on user_id for efficient "get all bookmarks for user" queries.
  --
  -- pinned_at column on community_posts: tracks when the post was pinned for ordering.
  -- Multiple pinned posts shown in "most recently pinned first" order.
  -- NULL means post is not currently pinned (even if isPinned was previously true).

  CREATE TABLE community_post_bookmarks (
      user_id     UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      post_id     UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT pk_community_post_bookmarks PRIMARY KEY (user_id, post_id)
  );

  CREATE INDEX idx_community_post_bookmarks_user_id ON community_post_bookmarks(user_id);
  CREATE INDEX idx_community_post_bookmarks_post_id ON community_post_bookmarks(post_id);

  -- Add pinned_at to community_posts to enable ordering pinned posts by pin date.
  -- NULL = not currently pinned; set to NOW() when admin pins, set to NULL on unpin.
  ALTER TABLE community_posts
      ADD COLUMN pinned_at TIMESTAMPTZ;
  ```

  **CRITICAL:** Hand-write SQL — `drizzle-kit generate` fails with `server-only` import errors. Migration `0021` was the last; `0022` is next. Do not rename or reorder existing migrations.

### Task 2: Schema File `src/db/schema/bookmarks.ts` + Update `community-posts.ts` (AC: #3)

- [x] 2.1 Create `src/db/schema/bookmarks.ts`:

  ```ts
  import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
  import { authUsers } from "./auth-users";
  import { communityPosts } from "./community-posts";

  export const communityPostBookmarks = pgTable(
    "community_post_bookmarks",
    {
      userId: uuid("user_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      postId: uuid("post_id")
        .notNull()
        .references(() => communityPosts.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.postId] }),
      index("idx_community_post_bookmarks_user_id").on(t.userId),
      index("idx_community_post_bookmarks_post_id").on(t.postId),
    ],
  );

  export type CommunityPostBookmark = typeof communityPostBookmarks.$inferSelect;
  export type NewCommunityPostBookmark = typeof communityPostBookmarks.$inferInsert;
  ```

- [x] 2.2 Update `src/db/schema/community-posts.ts` — add `pinnedAt` column:

  ```ts
  // Add after isPinned:
  pinnedAt: timestamp("pinned_at", { withTimezone: true }), // Set when admin pins; null = not pinned
  ```

  Also update the exported type (auto-updated via `$inferSelect`).

- [x] 2.3 Register `bookmarksSchema` in `src/db/index.ts`:

  ```ts
  // Add import (after postInteractionsSchema):
  import * as bookmarksSchema from "./schema/bookmarks";

  // Add to drizzle() schema spread:
  ...bookmarksSchema,
  ```

  **CRITICAL:** `postInteractionsSchema` and `communityPostsSchema` are already registered. Only add `bookmarksSchema`. Do NOT re-register existing schemas.

### Task 3: DB Queries `src/db/queries/bookmarks.ts` (AC: #1, #3, #4, #5)

- [x] 3.1 Create `src/db/queries/bookmarks.ts`:

  ```ts
  // No "server-only" — consistent with posts.ts, feed.ts, post-interactions.ts.
  // Used by bookmark-service.ts (server-only) and tests.
  import { eq, and, desc, sql } from "drizzle-orm";
  import { db } from "@/db";
  import { communityPostBookmarks } from "@/db/schema/bookmarks";
  import { communityPosts } from "@/db/schema/community-posts";
  import { communityProfiles } from "@/db/schema/community-profiles";
  import { communityPostMedia } from "@/db/schema/community-posts";
  import type { FeedPost } from "@/db/queries/feed";

  /**
   * Toggle a bookmark for a post.
   * Returns { bookmarked: true } if added, { bookmarked: false } if removed.
   */
  export async function toggleBookmark(
    userId: string,
    postId: string,
  ): Promise<{ bookmarked: boolean }> {
    // Check existing
    const [existing] = await db
      .select({ userId: communityPostBookmarks.userId })
      .from(communityPostBookmarks)
      .where(
        and(eq(communityPostBookmarks.userId, userId), eq(communityPostBookmarks.postId, postId)),
      );

    if (existing) {
      // Remove bookmark
      await db
        .delete(communityPostBookmarks)
        .where(
          and(eq(communityPostBookmarks.userId, userId), eq(communityPostBookmarks.postId, postId)),
        );
      return { bookmarked: false };
    }

    // Add bookmark
    await db.insert(communityPostBookmarks).values({ userId, postId });
    return { bookmarked: true };
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

    // Fetch media for bookmarked posts
    const postIds = pageRows.map((r) => r.id);
    const mediaRows =
      postIds.length > 0
        ? await db
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
        : [];

    const mediaByPostId = new Map<string, typeof mediaRows>();
    for (const m of mediaRows) {
      if (!mediaByPostId.has(m.postId)) mediaByPostId.set(m.postId, []);
      mediaByPostId.get(m.postId)!.push(m);
    }

    const posts: BookmarkedPost[] = pageRows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorDisplayName: r.authorDisplayName,
      authorPhotoUrl: r.authorPhotoUrl,
      content: r.content,
      contentType: r.contentType,
      visibility: r.visibility,
      category: r.category,
      groupId: r.groupId,
      isPinned: r.isPinned,
      pinnedAt: r.pinnedAt?.toISOString() ?? null,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      shareCount: r.shareCount,
      originalPostId: r.originalPostId,
      originalPost: null, // Not needed for bookmarks list
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
  ```

  **Media fetch pattern:** Uses `ANY(ARRAY[...])` with `sql.join()` — same pattern as `getComments` in post-interactions.ts. Guard: `postIds.length > 0` ensures no DB call on empty page.

  **`FeedPost` import note:** `BookmarkedPost extends FeedPost` — import the type from `@/db/queries/feed` (the type-only export). If `FeedPost` is not yet exported from feed.ts, we can inline the interface fields.

- [x] 3.2 Create `src/db/queries/bookmarks.test.ts` (`@vitest-environment node`):

  Mock pattern (CRITICAL: use `mockReset()` not `clearAllMocks()`):

  ```ts
  // @vitest-environment node
  import { describe, it, expect, beforeEach, vi } from "vitest";
  import { toggleBookmark, isBookmarked, getUserBookmarks } from "./bookmarks";

  vi.mock("@/db");
  vi.mock("@/db/schema/bookmarks", () => ({
    communityPostBookmarks: {
      userId: "user_id",
      postId: "post_id",
      createdAt: "created_at",
    },
  }));
  vi.mock("@/db/schema/community-posts", () => ({
    communityPosts: {
      id: "id",
      authorId: "author_id",
      content: "content",
      contentType: "content_type",
      visibility: "visibility",
      category: "category",
      groupId: "group_id",
      isPinned: "is_pinned",
      pinnedAt: "pinned_at",
      likeCount: "like_count",
      commentCount: "comment_count",
      shareCount: "share_count",
      originalPostId: "original_post_id",
      deletedAt: "deleted_at",
      createdAt: "created_at",
    },
    communityPostMedia: {
      id: "id",
      postId: "post_id",
      mediaUrl: "media_url",
      mediaType: "media_type",
      altText: "alt_text",
      sortOrder: "sort_order",
    },
  }));
  vi.mock("@/db/schema/community-profiles", () => ({
    communityProfiles: {
      userId: "user_id",
      displayName: "display_name",
      photoUrl: "photo_url",
      deletedAt: "deleted_at",
    },
  }));
  ```

  Tests:
  - `toggleBookmark` inserts bookmark and returns `{ bookmarked: true }` when not bookmarked
  - `toggleBookmark` deletes bookmark and returns `{ bookmarked: false }` when already bookmarked
  - `isBookmarked` returns `true` when bookmark exists
  - `isBookmarked` returns `false` when no bookmark
  - `getUserBookmarks` returns empty array when no bookmarks
  - `getUserBookmarks` returns posts with bookmark metadata
  - `getUserBookmarks` paginates correctly (limit + 1 pattern, nextCursor)
  - `getUserBookmarks` applies cursor date filter

### Task 4: Bookmark Service `src/services/bookmark-service.ts` (AC: #1, #5)

- [x] 4.1 Create `src/services/bookmark-service.ts`:

  ```ts
  import "server-only";
  import {
    toggleBookmark as dbToggleBookmark,
    getUserBookmarks as dbGetUserBookmarks,
    type BookmarkedPost,
  } from "@/db/queries/bookmarks";

  export type { BookmarkedPost };

  export async function toggleBookmark(
    userId: string,
    postId: string,
  ): Promise<{ bookmarked: boolean }> {
    return dbToggleBookmark(userId, postId);
  }

  export async function getUserBookmarks(
    userId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<{ posts: BookmarkedPost[]; nextCursor: string | null }> {
    return dbGetUserBookmarks(userId, options);
  }
  ```

  **Thin wrapper pattern** — same as post-interaction-service.ts. No EventBus emit needed for bookmarks (private action, no notification needed per AC).

- [x] 4.2 Create `src/services/bookmark-service.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/db/queries/bookmarks", () => ({
    toggleBookmark: vi.fn(),
    getUserBookmarks: vi.fn(),
  }));
  ```

  Use `mockReset()` in `beforeEach`.

  Tests:
  - `toggleBookmark` calls db `toggleBookmark` with correct args and returns result
  - `getUserBookmarks` calls db `getUserBookmarks` with userId and options

### Task 5: Update `feed.ts` — Add `isBookmarked` + `pinnedAt` to `FeedPost` (AC: #4)

- [x] 5.1 Update `src/db/queries/feed.ts` — add `isBookmarked` and `pinnedAt` to `FeedPost` interface and both page functions:

  **In `FeedPost` interface** (after `originalPostId`):

  ```ts
  isBookmarked: boolean; // true if current viewer has bookmarked this post
  pinnedAt: string | null; // ISO string, set when admin pins; null if not pinned
  ```

  **In `_getChronologicalFeedPage` and `_getAlgorithmicFeedPage`**:
  - The functions already accept `userId` for personalized feed. Add a LEFT JOIN:

  ```ts
  // Add LEFT JOIN on community_post_bookmarks for viewer's bookmark status
  .leftJoin(
    communityPostBookmarks,
    and(
      eq(communityPostBookmarks.postId, communityPosts.id),
      eq(communityPostBookmarks.userId, userId),
    ),
  )
  ```

  - Add to `.select()`:

  ```ts
  isBookmarked: sql<boolean>`${communityPostBookmarks.userId} IS NOT NULL`,
  pinnedAt: communityPosts.pinnedAt,
  ```

  - Add to post mapping in both functions:

  ```ts
  isBookmarked: r.isBookmarked,
  pinnedAt: r.pinnedAt?.toISOString() ?? null,
  ```

  **CRITICAL:** Both `_getChronologicalFeedPage` and `_getAlgorithmicFeedPage` MUST be updated. Story 4.2 shows that forgetting to update one of the two functions is a common mistake.

  **Import:** Add `communityPostBookmarks` import:

  ```ts
  import { communityPostBookmarks } from "@/db/schema/bookmarks";
  ```

  **pinnedAt for pinned ordering:** Update the existing `orderBy` clause in chronological feed to use `pinnedAt` for pinned post ordering:

  ```ts
  // Chronological: pinned first (by pinnedAt desc), then by createdAt desc
  .orderBy(
    sql`CASE WHEN ${communityPosts.isPinned} THEN ${communityPosts.pinnedAt} ELSE NULL END DESC NULLS LAST`,
    desc(communityPosts.createdAt),
  )
  ```

  The existing ordering `desc(communityPosts.isPinned), desc(communityPosts.createdAt)` only ensures pinned posts are first but doesn't order multiple pinned posts by pin date. Update to use `pinnedAt` for correct ordering per AC.

  **Algorithmic feed pinned ordering:** `_getAlgorithmicFeedPage` also separates pinned and non-pinned posts. Currently it sorts pinned posts by `createdAt`. Update pinned post sorting there too — use `pinnedAt DESC` for consistent "most recently pinned first" ordering across BOTH feed modes per AC #2 ("pinned posts remain at the top regardless of feed sorting mode").

- [x] 5.2 Update `src/db/queries/feed.test.ts` — add `isBookmarked` and `pinnedAt` to feed post fixtures and any schema mocks that include `communityPosts` fields.

### Task 6: Rate Limiter Presets (AC: #1, #2)

- [x] 6.1 Add to `src/services/rate-limiter.ts` (after `POST_SHARE`):

  ```ts
  // Story 4.4 additions
  POST_BOOKMARK: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId (bookmark spam guard)
  BOOKMARK_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  PIN_POST: { maxRequests: 10, windowMs: 60_000 },      // 10/min per adminId (admin only)
  ```

### Task 7: Server Action `toggle-bookmark.ts` (AC: #1)

- [x] 7.1 Create `src/features/feed/actions/toggle-bookmark.ts`:

  ```ts
  "use server";

  import { z } from "zod/v4";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
  import { toggleBookmark } from "@/services/bookmark-service";

  const schema = z.object({
    postId: z.string().uuid(),
  });

  export async function toggleBookmarkAction(
    rawData: unknown,
  ): Promise<
    { bookmarked: boolean } | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
  > {
    let userId: string;
    try {
      const session = await requireAuthenticatedSession();
      userId = session.userId;
    } catch {
      return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
    }

    const rateLimit = await applyRateLimit(
      `post-bookmark:${userId}`,
      RATE_LIMIT_PRESETS.POST_BOOKMARK,
    );
    if (!rateLimit.allowed) {
      return { success: false, errorCode: "VALIDATION_ERROR", reason: "Rate limit exceeded" };
    }

    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "VALIDATION_ERROR",
        reason: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    return toggleBookmark(userId, parsed.data.postId);
  }
  ```

  **CRITICAL:** Server actions bypass `withApiHandler` middleware, so rate limiting MUST be applied manually via `applyRateLimit()` — same pattern as `reactToPostAction`.

  **Return type note:** `{ bookmarked: boolean }` has NO `success` field (same asymmetric pattern as `reactToPostAction`). `BookmarkButton` detects errors by checking `"errorCode" in result`. Do NOT add a `success: true` field.

- [x] 7.2 Create `src/features/feed/actions/toggle-bookmark.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
  vi.mock("@/services/rate-limiter", () => ({
    applyRateLimit: vi.fn(),
    RATE_LIMIT_PRESETS: { POST_BOOKMARK: { maxRequests: 30, windowMs: 60_000 } },
  }));
  vi.mock("@/services/bookmark-service", () => ({ toggleBookmark: vi.fn() }));
  ```

  Use `mockReset()` in `beforeEach`. Mock `applyRateLimit` to return `{ allowed: true, limit: 30, remaining: 29, retryAfter: null }` by default.

  Tests:
  - Returns VALIDATION_ERROR when not authenticated
  - Returns VALIDATION_ERROR when rate limited (`applyRateLimit` returns `{ allowed: false }`)
  - Returns VALIDATION_ERROR for non-UUID postId
  - Calls `toggleBookmark` with correct userId and postId
  - Returns `{ bookmarked: true }` when service returns bookmarked
  - Returns `{ bookmarked: false }` when service returns un-bookmarked

### Task 8: REST API Routes (AC: #1, #2, #5)

- [x] 8.1 Create `src/app/api/v1/posts/[postId]/bookmarks/route.ts`:

  ```ts
  // POST   /api/v1/posts/[postId]/bookmarks  → add bookmark
  // DELETE /api/v1/posts/[postId]/bookmarks  → remove bookmark
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { toggleBookmark } from "@/services/bookmark-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extractPostId(url: string): string {
    // /api/v1/posts/{postId}/bookmarks → .at(-2) = postId
    const postId = new URL(url).pathname.split("/").at(-2) ?? "";
    if (!uuidRegex.test(postId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
    }
    return postId;
  }

  const postHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const postId = extractPostId(request.url);
    const result = await toggleBookmark(userId, postId);
    return successResponse(result);
  };

  const deleteHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const postId = extractPostId(request.url);
    const result = await toggleBookmark(userId, postId);
    return successResponse(result);
  };

  const rateLimitConfig = {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `post-bookmark:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_BOOKMARK,
  };

  export const POST = withApiHandler(postHandler, { rateLimit: rateLimitConfig });
  export const DELETE = withApiHandler(deleteHandler, { rateLimit: rateLimitConfig });
  ```

  **Note:** Both POST and DELETE call `toggleBookmark` — the service determines whether to add or remove based on current state. This is idempotent: calling DELETE when not bookmarked returns `{ bookmarked: false }` without error. Add a code comment in each handler clarifying this toggle-based behavior so future maintainers don't assume POST always creates and DELETE always removes.

- [x] 8.2 Create `src/app/api/v1/user/bookmarks/route.ts`:

  ```ts
  // GET /api/v1/user/bookmarks → paginated list of bookmarked posts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getUserBookmarks } from "@/services/bookmark-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);

    const result = await getUserBookmarks(userId, { cursor, limit });
    return successResponse(result);
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `bookmark-list:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.BOOKMARK_LIST,
    },
  });
  ```

- [x] 8.3 Create `src/app/api/v1/posts/[postId]/pin/route.ts`:

  ```ts
  // PATCH /api/v1/posts/[postId]/pin  → admin pin/unpin post
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAdminSession } from "@/lib/admin-auth";
  import { db } from "@/db";
  import { communityPosts } from "@/db/schema/community-posts";
  import { eq, isNull, and } from "drizzle-orm";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
  import { z } from "zod/v4";

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const schema = z.object({ isPinned: z.boolean() });

  function extractPostId(url: string): string {
    // /api/v1/posts/{postId}/pin → .at(-2) = postId
    const postId = new URL(url).pathname.split("/").at(-2) ?? "";
    if (!uuidRegex.test(postId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
    }
    return postId;
  }

  const patchHandler = async (request: Request) => {
    await requireAdminSession(request);
    const postId = extractPostId(request.url);

    const body = (await request.json()) as unknown;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError({
        title: "Unprocessable Entity",
        status: 422,
        detail: parsed.error.issues[0]?.message ?? "isPinned boolean required",
      });
    }

    const { isPinned } = parsed.data;

    // Verify post exists and is not deleted
    const [post] = await db
      .select({ id: communityPosts.id })
      .from(communityPosts)
      .where(and(eq(communityPosts.id, postId), isNull(communityPosts.deletedAt)));

    if (!post) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Post not found" });
    }

    await db
      .update(communityPosts)
      .set({
        isPinned,
        pinnedAt: isPinned ? new Date() : null, // Set/clear pinnedAt for ordering
      })
      .where(eq(communityPosts.id, postId));

    return successResponse({ postId, isPinned });
  };

  export const PATCH = withApiHandler(patchHandler, {
    rateLimit: {
      key: async (request: Request) => {
        const { requireAdminSession: getAdmin } = await import("@/lib/admin-auth");
        const { adminId } = await getAdmin(request);
        return `pin-post:${adminId}`;
      },
      ...RATE_LIMIT_PRESETS.PIN_POST,
    },
  });
  ```

  **Admin auth note:** `requireAdminSession()` from `@/lib/admin-auth.ts` returns `{ adminId }` and throws on non-admin. This is the established admin route pattern (see Stories 1.6, 1.13).

- [x] 8.4 Create route test files (`@vitest-environment node`) for all 3 routes.

  **CRITICAL route test mock pattern (corrected from Story 4.3 review):**

  ```ts
  // DO NOT mock withApiHandler as passthrough — it strips ApiError handling.
  // Instead mock its dependencies so the real handler can run:
  vi.mock("server-only", () => ({}));
  vi.mock("@/lib/rate-limiter", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    buildRateLimitHeaders: vi.fn().mockReturnValue({}),
  }));
  vi.mock("@/lib/request-context", () => ({
    runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
  }));
  vi.mock("@/services/permissions", () => ({
    requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
  }));
  vi.mock("@/lib/admin-auth", () => ({
    requireAdminSession: vi.fn().mockResolvedValue({ adminId: "admin-1" }),
  }));
  vi.mock("@/services/bookmark-service", () => ({
    toggleBookmark: vi.fn(),
    getUserBookmarks: vi.fn(),
  }));
  // RATE_LIMIT_PRESETS lives in @/services/rate-limiter (route-level config).
  // checkRateLimit/buildRateLimitHeaders live in @/lib/rate-limiter (withApiHandler internals).
  // These are TWO DIFFERENT modules — one vi.mock each is correct. Do NOT combine them.
  vi.mock("@/services/rate-limiter", () => ({
    RATE_LIMIT_PRESETS: {
      POST_BOOKMARK: { maxRequests: 30, windowMs: 60_000 },
      BOOKMARK_LIST: { maxRequests: 60, windowMs: 60_000 },
      PIN_POST: { maxRequests: 10, windowMs: 60_000 },
    },
  }));
  ```

  `bookmarks/route.test.ts` tests:
  - POST returns 401 when not authenticated
  - POST returns 400 for invalid postId
  - POST calls `toggleBookmark` and returns `{ bookmarked: true }`
  - DELETE calls `toggleBookmark` and returns `{ bookmarked: false }`

  `user/bookmarks/route.test.ts` tests:
  - GET returns 401 when not authenticated
  - GET calls `getUserBookmarks` with userId, cursor, limit
  - GET returns paginated posts with nextCursor

  `pin/route.test.ts` tests:
  - PATCH returns 401 when not admin (requireAdminSession throws ApiError 401)
  - PATCH returns 400 for invalid postId
  - PATCH returns 422 for missing/invalid isPinned body
  - PATCH returns 404 when post not found
  - PATCH returns `{ postId, isPinned: true }` on successful pin
  - PATCH returns `{ postId, isPinned: false }` on successful unpin

### Task 9: i18n Translations (AC: all UI text)

**Add ALL keys BEFORE component work (Tasks 10–12)**

- [x] 9.1 Add `Feed.bookmarks.*` and `Feed.admin.*` keys to `messages/en.json` under the existing `"Feed"` namespace:

  ```json
  "bookmarks": {
    "bookmark": "Bookmark",
    "unbookmark": "Remove bookmark",
    "bookmarkAriaLabel": "Bookmark this post",
    "bookmarkedAriaLabel": "Remove bookmark",
    "bookmarkSuccess": "Post saved",
    "unbookmarkSuccess": "Bookmark removed",
    "savedPageTitle": "Saved Posts",
    "savedPageEmpty": "You haven't saved any posts yet.",
    "savedPageEmptyHint": "Tap the bookmark icon on any post to save it for later.",
    "loadMore": "Load more",
    "loading": "Loading…",
    "errorGeneric": "Could not update bookmark. Please try again."
  },
  "admin": {
    "pinPost": "Pin to top",
    "unpinPost": "Unpin",
    "pinSuccess": "Post pinned",
    "unpinSuccess": "Post unpinned",
    "pinAriaLabel": "Pin post to top of feed",
    "unpinAriaLabel": "Unpin post from top of feed"
  }
  ```

- [x] 9.2 Add corresponding Igbo keys to `messages/ig.json` under `"Feed"`:

  ```json
  "bookmarks": {
    "bookmark": "Chekwaa",
    "unbookmark": "Wepu nchekwa",
    "bookmarkAriaLabel": "Chekwaa post a",
    "bookmarkedAriaLabel": "Wepu nchekwa",
    "bookmarkSuccess": "Post echekwala",
    "unbookmarkSuccess": "Ewepụla nchekwa",
    "savedPageTitle": "Post ndị Echekwala",
    "savedPageEmpty": "Ichekwaghị post ọ bụla.",
    "savedPageEmptyHint": "Pị akara nchekwa n'ime post ọ bụla i chekwa ya maka oge ọzọ.",
    "loadMore": "Nweta ọzọ",
    "loading": "Na-ebugo…",
    "errorGeneric": "Enweghị ike ịmelite nchekwa. Nwaa ọzọ."
  },
  "admin": {
    "pinPost": "Mee ka o nọdụ n'elu",
    "unpinPost": "Wepu n'elu",
    "pinSuccess": "Post emeela ka o nọdụ n'elu",
    "unpinSuccess": "Ewepụla post n'elu",
    "pinAriaLabel": "Mee ka post a nọdụ n'elu feed",
    "unpinAriaLabel": "Wepu post a n'elu feed"
  }
  ```

### Task 10: `BookmarkButton` Component (AC: #1)

- [x] 10.1 Create `src/features/feed/components/BookmarkButton.tsx`:

  ```tsx
  "use client";

  import { useState, useTransition } from "react";
  import { useTranslations } from "next-intl";
  import { toggleBookmarkAction } from "../actions/toggle-bookmark";

  interface BookmarkButtonProps {
    postId: string;
    initialIsBookmarked: boolean;
  }

  export function BookmarkButton({ postId, initialIsBookmarked }: BookmarkButtonProps) {
    const t = useTranslations("Feed");
    const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked);
    const [isPending, startTransition] = useTransition();

    const handleToggle = () => {
      startTransition(async () => {
        const prevState = isBookmarked;
        // Optimistic update
        setIsBookmarked((prev) => !prev);

        const result = await toggleBookmarkAction({ postId });
        if ("errorCode" in result) {
          // Rollback
          setIsBookmarked(prevState);
        } else {
          // Sync with server response
          setIsBookmarked(result.bookmarked);
        }
      });
    };

    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={
          isBookmarked ? t("bookmarks.bookmarkedAriaLabel") : t("bookmarks.bookmarkAriaLabel")
        }
        aria-pressed={isBookmarked}
        className={`flex items-center justify-center rounded-full p-2 min-h-[36px] min-w-[36px] transition-colors ${
          isBookmarked ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-accent"
        }`}
      >
        {/* Lucide icons: filled when saved, outline when not */}
        {isBookmarked ? (
          <BookmarkCheck className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bookmark className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="sr-only">
          {isBookmarked ? t("bookmarks.unbookmark") : t("bookmarks.bookmark")}
        </span>
      </button>
    );
  }
  ```

  **Icon imports:** Use `Bookmark` and `BookmarkCheck` from `lucide-react` (already a project dependency via shadcn/ui). Add `import { Bookmark, BookmarkCheck } from "lucide-react";` at top. Provides clear filled/outline visual distinction consistent with the rest of the UI.

  **Rollback pattern:** Same as `ReactionBar` — save `prevState` before optimistic update, rollback on `errorCode`. `useTransition` allows the pending state without blocking UI.

- [x] 10.2 Create `src/features/feed/components/BookmarkButton.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../actions/toggle-bookmark", () => ({
    toggleBookmarkAction: vi.fn(),
  }));
  vi.mock("next-intl", () => ({
    useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  }));
  vi.mock("react", async () => ({
    ...(await vi.importActual("react")),
    useTransition: () => [
      false,
      (fn: () => void) => {
        void fn();
      },
    ],
  }));
  ```

  Tests:
  - Renders with outline state when `initialIsBookmarked=false`
  - Renders with filled state when `initialIsBookmarked=true`
  - Clicking toggles optimistically to filled state
  - Clicking filled toggles optimistically to outline state
  - Rolls back when server action returns `errorCode`
  - Syncs with server `bookmarked: true` after action
  - Button has correct `aria-pressed` attribute
  - Button has correct `aria-label` for each state (using mock t() key format)

### Task 11: Update `FeedItem` — Add `BookmarkButton` + Admin Pin (AC: #1, #2)

- [x] 11.1 Update `src/features/feed/components/FeedItem.tsx`:

  **Add `currentUserRole` to `FeedItemProps`:**

  ```ts
  interface FeedItemProps {
    post: FeedPost;
    currentUserId: string;
    currentUserRole: string; // e.g. "MEMBER" | "ADMIN" | "MODERATOR"
    sort: FeedSortMode;
    filter: FeedFilter;
  }
  ```

  **Add imports:**

  ```ts
  import { BookmarkButton } from "./BookmarkButton";
  ```

  **Add state for pin:**

  ```ts
  const [isPinned, setIsPinned] = useState(post.isPinned);
  const isAdmin = currentUserRole === "ADMIN";
  ```

  **In the engagement bar (after ShareDialog button, before closing div):**

  ```tsx
  {
    /* Bookmark button — right-aligned in engagement bar */
  }
  <div className="ml-auto">
    <BookmarkButton postId={post.id} initialIsBookmarked={post.isBookmarked} />
  </div>;
  ```

  **Admin pin button — in the author row header, next to badges:**

  ```tsx
  {
    isAdmin && (
      <button
        type="button"
        onClick={handlePinToggle}
        disabled={isPinPending}
        aria-label={isPinned ? t("admin.unpinAriaLabel") : t("admin.pinAriaLabel")}
        aria-pressed={isPinned}
        className="ml-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors min-h-[36px]"
      >
        {isPinned ? t("admin.unpinPost") : t("admin.pinPost")}
      </button>
    );
  }
  ```

  **Add `handlePinToggle` handler:**

  ```ts
  const [isPinPending, setIsPinPending] = useState(false);

  const handlePinToggle = async () => {
    if (isPinPending) return;
    setIsPinPending(true);
    const newState = !isPinned;
    setIsPinned(newState); // Optimistic update
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: newState }),
      });
      if (!res.ok) {
        setIsPinned(!newState); // Rollback
      }
    } catch {
      setIsPinned(!newState); // Rollback
    } finally {
      setIsPinPending(false);
    }
  };
  ```

  **CSRF note:** The pin PATCH uses `fetch` from a client component. Since `withApiHandler` validates CSRF via Origin header, the browser automatically includes it for same-origin requests. No manual header needed.

- [x] 11.2 Update `src/features/feed/components/FeedList.tsx` — pass `currentUserRole` down to `FeedItem`.

  The `FeedList` component currently receives `currentUserId`. Add `currentUserRole: string` to its props and thread it through to each `FeedItem`.

- [x] 11.3 Update `src/app/[locale]/(app)/feed/page.tsx` — pass `currentUserRole` from session.

  The feed page already calls `auth()` from `@/server/auth/config` to get the session. Extract the user role:

  ```ts
  const session = await auth();
  // session.user.role is available from Auth.js configuration
  const currentUserRole = session?.user?.role ?? "MEMBER";
  ```

  Pass to `FeedList`:

  ```tsx
  <FeedList currentUserId={userId} currentUserRole={currentUserRole} ... />
  ```

- [x] 11.4 Update `src/features/feed/components/FeedItem.test.tsx` and `FeedList.test.tsx` — add `currentUserRole` prop to all render calls.

  ```ts
  // Add to all FeedItem renders in test:
  currentUserRole = "MEMBER";
  // Or for admin tests:
  currentUserRole = "ADMIN";
  ```

  Add test cases:
  - FeedItem renders BookmarkButton with `initialIsBookmarked` from post
  - Admin sees pin/unpin button when `currentUserRole="ADMIN"`
  - Non-admin does NOT see pin/unpin button when `currentUserRole="MEMBER"`

### Task 12: Saved Posts Page (AC: #5)

- [x] 12.1 Create `src/app/[locale]/(app)/saved/page.tsx`:

  ```tsx
  import { auth } from "@/server/auth/config";
  import { redirect } from "@/i18n/navigation";
  import { getLocale } from "next-intl/server";
  import { getTranslations } from "next-intl/server";
  import { getUserBookmarks } from "@/services/bookmark-service";
  import { SavedPostsList } from "@/features/feed/components/SavedPostsList";

  export default async function SavedPage() {
    const session = await auth();
    if (!session?.user?.id) {
      const locale = await getLocale();
      redirect({ href: "/login", locale });
      return null;
    }

    const t = await getTranslations("Feed");
    const userId = session.user.id;
    const currentUserRole = session.user.role ?? "MEMBER";

    // SSR initial page of bookmarks
    const { posts, nextCursor } = await getUserBookmarks(userId, { limit: 10 });

    return (
      <main className="container max-w-2xl mx-auto py-6 px-4 space-y-4">
        <h1 className="text-2xl font-bold">{t("bookmarks.savedPageTitle")}</h1>
        <SavedPostsList
          initialPosts={posts}
          initialNextCursor={nextCursor}
          currentUserId={userId}
          currentUserRole={currentUserRole}
        />
      </main>
    );
  }
  ```

- [x] 12.2 Create `src/features/feed/components/SavedPostsList.tsx`:

  Client component with infinite scroll for bookmarked posts. Pattern is similar to `FeedList.tsx`:
  - Uses `useInfiniteQuery` (TanStack Query) or `useState` + `useEffect` for pagination
  - Renders `FeedItem` for each post (full interaction capabilities including un-bookmark)
  - Shows empty state when `posts.length === 0`
  - Loads more via `GET /api/v1/user/bookmarks?cursor=...`

  ```tsx
  "use client";

  import { useState, useCallback } from "react";
  import { useTranslations } from "next-intl";
  import { FeedItem } from "./FeedItem";
  import type { BookmarkedPost } from "@/services/bookmark-service";
  import type { FeedSortMode, FeedFilter } from "@/config/feed";

  interface SavedPostsListProps {
    initialPosts: BookmarkedPost[];
    initialNextCursor: string | null;
    currentUserId: string;
    currentUserRole: string;
  }

  export function SavedPostsList({
    initialPosts,
    initialNextCursor,
    currentUserId,
    currentUserRole,
  }: SavedPostsListProps) {
    const t = useTranslations("Feed");
    const [posts, setPosts] = useState(initialPosts);
    const [nextCursor, setNextCursor] = useState(initialNextCursor);
    const [isLoading, setIsLoading] = useState(false);

    const loadMore = useCallback(async () => {
      if (!nextCursor || isLoading) return;
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/v1/user/bookmarks?cursor=${encodeURIComponent(nextCursor)}&limit=10`,
        );
        if (res.ok) {
          const json = (await res.json()) as {
            data: { posts: BookmarkedPost[]; nextCursor: string | null };
          };
          setPosts((prev) => [...prev, ...json.data.posts]);
          setNextCursor(json.data.nextCursor);
        }
      } finally {
        setIsLoading(false);
      }
    }, [nextCursor, isLoading]);

    if (posts.length === 0) {
      return (
        <div className="text-center py-12 space-y-2">
          <p className="text-muted-foreground">{t("bookmarks.savedPageEmpty")}</p>
          <p className="text-sm text-muted-foreground">{t("bookmarks.savedPageEmptyHint")}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {posts.map((post) => (
          <FeedItem
            key={post.id}
            post={post}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            sort={"chronological" as FeedSortMode}
            filter={"all" as FeedFilter}
          />
        ))}
        {nextCursor && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoading}
            className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLoading ? t("bookmarks.loading") : t("bookmarks.loadMore")}
          </button>
        )}
      </div>
    );
  }
  ```

- [x] 12.3 Create `src/features/feed/components/SavedPostsList.test.tsx` (`@vitest-environment jsdom`):

  Mock `FeedItem` to avoid cascade:

  ```ts
  vi.mock("./FeedItem", () => ({
    FeedItem: ({ post }: { post: { id: string } }) => <div data-testid={`feed-item-${post.id}`} />,
  }));
  vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
  }));
  ```

  Tests:
  - Renders empty state when `initialPosts=[]`
  - Renders FeedItem for each initial post
  - Shows "Load more" button when `initialNextCursor` is set
  - Does NOT show "Load more" when `initialNextCursor=null`
  - Clicking "Load more" fetches next page (mock `global.fetch`)

- [x] 12.4 Create `src/app/[locale]/(app)/saved/page.test.tsx` (`@vitest-environment node`):

  ```ts
  vi.mock("@/server/auth/config", () => ({ auth: vi.fn() }));
  vi.mock("@/services/bookmark-service", () => ({ getUserBookmarks: vi.fn() }));
  vi.mock("@/features/feed/components/SavedPostsList", () => ({
    SavedPostsList: () => null,
  }));
  vi.mock("next-intl/server", () => ({
    getTranslations: vi.fn().mockResolvedValue((key: string) => key),
    getLocale: vi.fn().mockResolvedValue("en"),
  }));
  ```

  Tests:
  - Redirects when not authenticated
  - Calls `getUserBookmarks` with session userId
  - Renders page with correct title when authenticated

## Dev Notes

### Critical Architecture Constraints

- **Migrations**: Hand-write SQL — drizzle-kit generate fails with `server-only` import errors. Migration 0021 was last; **0022 is next**.
- **Zod**: Import from `"zod/v4"`, use `parsed.error.issues[0]` (NOT `parsed.issues[0]`).
- **API routes**: Always wrap with `withApiHandler()` from `@/server/api/middleware`.
- **Admin routes**: Use `requireAdminSession()` from `@/lib/admin-auth.ts` (returns `{ adminId }`).
- **User self-service routes**: Use `requireAuthenticatedSession()` from `@/services/permissions.ts` (returns `{ userId, role }`).
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`. Use `throw new ApiError({ title, status, detail })` from `@/lib/api-error` inside handlers.
- **EventBus**: Emit from services, never from routes. Bookmarks don't need EventBus (private action).
- **i18n**: All user-facing strings via `useTranslations()` — no hardcoded strings. Add ALL translation keys before writing components.
- **Auth.js session**: `import { auth } from "@/server/auth/config"` NOT `@/auth`.
- **DB schema registration**: No `src/db/schema/index.ts` — import directly in `src/db/index.ts` with `import * as bookmarksSchema`.
- **Tests**: Co-located with source (not `__tests__` dir), `@vitest-environment node` for server files, `@vitest-environment jsdom` for React components.
- **`mockReset()` not `clearAllMocks()`**: For tests using `mockResolvedValueOnce`/`mockRejectedValueOnce` sequences, ALWAYS use `mockReset()` in `beforeEach`.

### Route Test Pattern (CORRECTED — Do NOT use the passthrough mock)

Story 4.3 task descriptions used `withApiHandler: (handler) => handler` passthrough — **this is WRONG** and was corrected in the 4.3 code review. The correct pattern for route tests:

```ts
// DO NOT: vi.mock("@/server/api/middleware", () => ({ withApiHandler: (h) => h }))
// The above strips error handling and makes ApiError tests return 200 instead of 4xx.

// DO: Mock the dependencies of withApiHandler instead:
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
// Then the real withApiHandler runs and correctly converts ApiError → HTTP response
```

### DB Schema — Current State Relevant to Story 4.4

- `communityPosts` already has: `id`, `authorId`, `content`, `contentType`, `visibility`, `category`, `groupId`, `isPinned`, `likeCount`, `commentCount`, `shareCount`, `originalPostId`, `deletedAt`, `createdAt`, `updatedAt`
- `communityPostReactions` and `communityPostComments` already in `src/db/schema/post-interactions.ts`
- `communityPostBookmarks` is NEW (created in this story)
- `pinnedAt` column is NEW on `community_posts` (added in migration 0022)

### Feed Query — `isBookmarked` via LEFT JOIN

The chronological and algorithmic feed functions (`_getChronologicalFeedPage`, `_getAlgorithmicFeedPage`) in `feed.ts` both already accept `userId` for personalization. Adding:

```ts
.leftJoin(
  communityPostBookmarks,
  and(
    eq(communityPostBookmarks.postId, communityPosts.id),
    eq(communityPostBookmarks.userId, userId),
  ),
)
```

...adds `isBookmarked` to every post in a single query with no N+1 penalty. This is the correct approach — not a separate API call per post.

**FeedPost interface update:** Add BOTH `isBookmarked: boolean` AND `pinnedAt: string | null`. Both feed functions must be updated. Both posts mappings must include these fields.

### Admin Pin Ordering

The existing chronological feed `orderBy` uses `desc(communityPosts.isPinned)` for pinned-first ordering. **Update** this to use `pinnedAt` for consistent "most recently pinned first" ordering per AC. The boolean flag `isPinned` remains the primary condition; `pinnedAt` is the tiebreaker among pinned posts.

### Asymmetric Return Type from `toggleBookmarkAction`

`toggleBookmarkAction` returns `{ bookmarked: boolean }` (no `success` field) on success, and `{ success: false, errorCode, reason }` on error. `BookmarkButton` detects errors via `"errorCode" in result`. This is the same pattern as `reactToPostAction`. Do NOT add `success: true` to the success path.

### `BookmarkedPost` Type

`BookmarkedPost extends FeedPost` — it has all FeedPost fields plus `bookmarkedAt: string`. The `getUserBookmarks` DB query returns this type. When rendering bookmarked posts in `SavedPostsList`, cast to `FeedPost` for `FeedItem` or ensure `BookmarkedPost` is compatible with `FeedItem`'s `post` prop (it is, since it extends FeedPost).

### Previous Story Learnings (4.3)

- **`vi.hoisted()` for DB mock objects**: When `vi.mock("@/db", ...)` references `mockDb` that's `const`-declared after the call, use `vi.hoisted()` to avoid TDZ error.
- **Drizzle chain mocks**: Use per-call `mockReturnValueOnce(makeSelectChain(result))` with fresh chain objects when query has multiple terminal calls.
- **`getByText` vs `getByRole`**: When a button contains text nodes AND child spans that both match a regex, use `getByRole("button", { name: /pattern/ })` instead of `getByText`.
- **`useTranslations` mock in tests**: Mock returns `${ns}.${key}` format — test assertions must match this format, e.g. `{ name: /Feed.bookmarks.bookmarkAriaLabel/i }`.
- **Dialog mock to null in jsdom**: CSS `md:hidden` doesn't apply in jsdom — both mobile and desktop versions render. Mock dialog components to `null` if they cause duplicate testid issues.
- **`useTransition` mock for tests**: `useTransition: () => [false, (fn) => { void fn(); }]` enables sync testing of transition-wrapped handlers.

### Project Structure Notes

Files to create:

- `src/db/migrations/0022_post_bookmarks.sql` (NEW)
- `src/db/schema/bookmarks.ts` (NEW)
- `src/db/queries/bookmarks.ts` (NEW)
- `src/db/queries/bookmarks.test.ts` (NEW)
- `src/services/bookmark-service.ts` (NEW)
- `src/services/bookmark-service.test.ts` (NEW)
- `src/features/feed/actions/toggle-bookmark.ts` (NEW)
- `src/features/feed/actions/toggle-bookmark.test.ts` (NEW)
- `src/features/feed/components/BookmarkButton.tsx` (NEW)
- `src/features/feed/components/BookmarkButton.test.tsx` (NEW)
- `src/features/feed/components/SavedPostsList.tsx` (NEW)
- `src/features/feed/components/SavedPostsList.test.tsx` (NEW)
- `src/app/[locale]/(app)/saved/page.tsx` (NEW)
- `src/app/[locale]/(app)/saved/page.test.tsx` (NEW)
- `src/app/api/v1/posts/[postId]/bookmarks/route.ts` (NEW)
- `src/app/api/v1/posts/[postId]/bookmarks/route.test.ts` (NEW)
- `src/app/api/v1/posts/[postId]/pin/route.ts` (NEW)
- `src/app/api/v1/posts/[postId]/pin/route.test.ts` (NEW)
- `src/app/api/v1/user/bookmarks/route.ts` (NEW)
- `src/app/api/v1/user/bookmarks/route.test.ts` (NEW)

Files to modify:

- `src/db/schema/community-posts.ts` — add `pinnedAt` column
- `src/db/index.ts` — register `bookmarksSchema`
- `src/db/queries/feed.ts` — add `isBookmarked`, `pinnedAt` to FeedPost + LEFT JOIN + updated pinned ordering
- `src/db/queries/feed.test.ts` — add `isBookmarked`, `pinnedAt` to fixtures
- `src/services/rate-limiter.ts` — add `POST_BOOKMARK`, `BOOKMARK_LIST`, `PIN_POST` presets
- `src/features/feed/components/FeedItem.tsx` — add `BookmarkButton` + admin pin button + `currentUserRole` prop
- `src/features/feed/components/FeedItem.test.tsx` — add `currentUserRole` prop to renders
- `src/features/feed/components/FeedList.tsx` — add `currentUserRole` prop + thread to FeedItem
- `src/features/feed/components/FeedList.test.tsx` — add `currentUserRole` prop to renders
- `src/app/[locale]/(app)/feed/page.tsx` — extract and pass `currentUserRole` from session
- `src/app/[locale]/(app)/feed/page.test.tsx` — update mocks if needed
- `messages/en.json` — add `Feed.bookmarks.*` and `Feed.admin.*`
- `messages/ig.json` — add `Feed.bookmarks.*` and `Feed.admin.*`

### References

- AC source: [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4]
- `requireAdminSession()` pattern: [Source: src/lib/admin-auth.ts]
- `withApiHandler()` pattern: [Source: src/server/api/middleware]
- Route test mock pattern: [Source: MEMORY.md#Story 4.3 Key Technical Decisions]
- LEFT JOIN Drizzle pattern: [Source: src/db/queries/post-interactions.ts#getComments]
- `toggleReaction` optimistic pattern: [Source: src/features/feed/components/ReactionBar.tsx]
- Feed query structure: [Source: src/db/queries/feed.ts]
- Auth.js import pattern: [Source: src/app/[locale]/(app)/feed/page.tsx]
- Batch follow-status precedent: [Source: MEMORY.md#Epic 3 Retrospective Key Findings]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- `BookmarkButton` rollback test failure: the `"rolls back when server action returns errorCode"` test initially asserted synchronously after `fireEvent.click`. Since the rollback happens after `await toggleBookmarkAction()` resolves (a microtask), the DOM still showed the optimistic state (`icon-bookmark-check`) when the assertion ran. Fixed by wrapping the assertion in `await waitFor(() => { ... })`.

### Completion Notes List

- All 12 tasks implemented end-to-end: DB migration, schema, queries, service, rate limiter presets, server action, 3 REST API routes, i18n translations (en + ig), BookmarkButton component, FeedItem/FeedList updates, SavedPostsList, and Saved page.
- Migration `0022_post_bookmarks.sql` hand-written per project convention (drizzle-kit generate fails with `server-only`).
- `isBookmarked` enrichment uses LEFT JOIN in both `_getChronologicalFeedPage` and `_getAlgorithmicFeedPage` — no N+1 queries.
- `pinnedAt` replaces `isPinned DESC` in chronological orderBy; consistent "most recently pinned first" ordering in both feed modes.
- `toggleBookmarkAction` returns `{ bookmarked: boolean }` (no `success` field) on success — error detected via `"errorCode" in result`. Same asymmetric pattern as `reactToPostAction`.
- Route tests use the corrected mock pattern (mock `@/lib/rate-limiter` + `@/lib/request-context` dependencies instead of making `withApiHandler` a passthrough), ensuring `ApiError` → HTTP response conversion works correctly.
- `vi.hoisted()` used for `mockDb` in `pin/route.test.ts` to avoid TDZ errors.
- Final test count: **2181 tests passing across 253 test files** (0 failures). Previous baseline was 2117 after Story 4.3.

### Senior Developer Review (AI) — 2026-03-02

**Reviewer:** claude-opus-4-6 (adversarial code review)

**Issues Found:** 1 High, 3 Medium, 2 Low — all HIGH and MEDIUM fixed, 1 LOW fixed

| #   | Severity | Description                                                                                                                                                 | Resolution                                                                                        |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| H1  | HIGH     | `toggleBookmark` race condition — SELECT + INSERT/DELETE not atomic under concurrent requests                                                               | Wrapped in `db.transaction()`                                                                     |
| M1  | MEDIUM   | `parseInt` without NaN guard in `GET /api/v1/user/bookmarks` — non-numeric `?limit=abc` produces `NaN`                                                      | Added `\|\| 10` fallback                                                                          |
| M2  | MEDIUM   | POST and DELETE bookmark routes both call `toggleBookmark` — violates REST semantics, not truly idempotent                                                  | Split into `addBookmark` (INSERT ON CONFLICT DO NOTHING) and `removeBookmark` (DELETE) for routes |
| M3  | MEDIUM   | `getUserBookmarks` hardcodes `originalPost: null` — bookmarked reposts lose embedded original post content (violates AC #5 "full interaction capabilities") | Added original post embed loading via Promise.all with inArray query                              |
| L1  | LOW      | Pinned indicator reads `post.isPinned` (initial prop) instead of local `isPinned` state — optimistic pin updates don't show "Pinned" label until refresh    | Changed to local `isPinned` state                                                                 |
| L2  | LOW      | No test file for `feed/page.tsx` server component — `currentUserRole` prop addition has no test coverage                                                    | Not fixed (pre-existing gap, not a regression)                                                    |

**Post-review test count:** 2186/2186 passing (+5 new tests from review fixes)

### File List

**New files:**

- `src/db/migrations/0022_post_bookmarks.sql`
- `src/db/schema/bookmarks.ts`
- `src/db/queries/bookmarks.ts`
- `src/db/queries/bookmarks.test.ts`
- `src/services/bookmark-service.ts`
- `src/services/bookmark-service.test.ts`
- `src/features/feed/actions/toggle-bookmark.ts`
- `src/features/feed/actions/toggle-bookmark.test.ts`
- `src/features/feed/components/BookmarkButton.tsx`
- `src/features/feed/components/BookmarkButton.test.tsx`
- `src/features/feed/components/SavedPostsList.tsx`
- `src/features/feed/components/SavedPostsList.test.tsx`
- `src/app/[locale]/(app)/saved/page.tsx`
- `src/app/[locale]/(app)/saved/page.test.tsx`
- `src/app/api/v1/posts/[postId]/bookmarks/route.ts`
- `src/app/api/v1/posts/[postId]/bookmarks/route.test.ts`
- `src/app/api/v1/posts/[postId]/pin/route.ts`
- `src/app/api/v1/posts/[postId]/pin/route.test.ts`
- `src/app/api/v1/user/bookmarks/route.ts`
- `src/app/api/v1/user/bookmarks/route.test.ts`

**Modified files:**

- `src/db/schema/community-posts.ts` — added `pinnedAt` column
- `src/db/index.ts` — registered `bookmarksSchema`
- `src/db/queries/feed.ts` — added `isBookmarked`, `pinnedAt` to `FeedPost`, LEFT JOIN, updated pinned ordering in both page functions
- `src/db/queries/feed.test.ts` — updated mocks and `makePost` factory with `pinnedAt`/`isBookmarked`, added `leftJoin` to chain
- `src/services/rate-limiter.ts` — added `POST_BOOKMARK`, `BOOKMARK_LIST`, `PIN_POST` presets
- `src/features/feed/components/FeedItem.tsx` — added `BookmarkButton`, admin pin button, `currentUserRole` prop
- `src/features/feed/components/FeedItem.test.tsx` — updated `makePost`/`renderPost`, added admin/bookmark tests
- `src/features/feed/components/FeedList.tsx` — added `currentUserRole` prop, threads to `FeedItem`
- `src/features/feed/components/FeedList.test.tsx` — updated `FeedItem` mock, added `currentUserRole` test
- `src/app/[locale]/(app)/feed/page.tsx` — extracts and passes `currentUserRole` from session
- `messages/en.json` — added `Feed.bookmarks.*` and `Feed.admin.*` keys
- `messages/ig.json` — added `Feed.bookmarks.*` and `Feed.admin.*` keys (Igbo translations)

### Change Log

| Date       | Version | Description                                                                                                                     | Author          |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 2026-03-02 | 1.0     | Initial implementation — all 12 tasks complete, 2181/2181 tests passing                                                         | claude-opus-4-6 |
| 2026-03-02 | 1.1     | Code review fixes — H1 transaction, M1 NaN guard, M2 REST semantics, M3 repost embeds, L1 pinned label state; 2186/2186 passing | claude-opus-4-6 |
