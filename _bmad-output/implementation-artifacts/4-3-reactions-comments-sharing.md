# Story 4.3: Reactions, Comments & Sharing

Status: done

## Story

As a member,
I want to like, react to, comment on, and share posts within the platform,
So that I can engage with community content and participate in conversations.

## Acceptance Criteria

1. **Given** a member views a post in the feed
   **When** they tap the reaction button
   **Then** they can select from multiple reaction types: like, love, celebrate, insightful, funny (FR52)
   **And** the selected reaction appears with a count beneath the post
   **And** tapping an existing reaction toggles it off (removes the reaction)
   **And** tapping a different reaction type replaces the previous (single-select per member per post)
   **And** reactions are saved immediately (optimistic update) and a `post.reacted` event is emitted via EventBus

2. **Given** a member wants to comment on a post
   **When** they tap "Comment" and type a response
   **Then** the comment appears beneath the post in chronological order (FR52)
   **And** comments support text and emoji (no media attachments in comments)
   **And** nested replies (one level deep) are supported via "Reply" on any top-level comment
   **And** the system emits a `post.commented` event via EventBus on new comments

3. **Given** a member wants to share a post
   **When** they tap "Share"
   **Then** they can choose: repost to their own feed (with optional comment), share to a direct message conversation, or copy link (FR52)
   **And** for reposts: the original post is embedded with author attribution in the repost display
   **And** the share count on the original post increments for repost and share-to-DM actions
   **And** "Share to group" is shown as a disabled option labeled "Coming soon (requires groups)"

4. **Given** the database needs to support interactions
   **When** this story is implemented
   **Then** migration `0020_post_interactions.sql` creates:
   - `community_post_reactions` table (post_id, user_id, reaction_type, created_at; composite PK on post_id + user_id; INDEX on post_id)
   - `community_post_comments` table (id UUID PK, post_id FK, author_id FK, content, parent_comment_id nullable self-ref FK, deleted_at, created_at; INDEX on post_id and parent_comment_id)
   - `original_post_id` nullable FK column on `community_posts` for reposts
     **And** the `community_post_reaction_type` PostgreSQL enum is created with: like, love, celebrate, insightful, funny

## Tasks / Subtasks

### Task 1: Migration `0020_post_interactions.sql` (AC: #4)

- [ ] 1.1 Create `src/db/migrations/0020_post_interactions.sql`:

  ```sql
  -- Post reactions: single-select per member per post.
  -- Composite PK (post_id, user_id) enforces one reaction type per member.
  -- Changing reaction type: UPDATE existing row (count unchanged).
  -- Toggling same type: DELETE row (decrement likeCount on community_posts).
  -- Design note: Single-select (unlike chat emoji reactions) to prevent points inflation
  -- in the future points engine (Story 8.1).

  CREATE TYPE community_post_reaction_type AS ENUM ('like', 'love', 'celebrate', 'insightful', 'funny');

  CREATE TABLE community_post_reactions (
      post_id     UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id     UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      reaction_type community_post_reaction_type NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT pk_community_post_reactions PRIMARY KEY (post_id, user_id)
  );

  CREATE INDEX idx_community_post_reactions_post_id ON community_post_reactions(post_id);

  -- Post comments: one level of nested replies via parent_comment_id.
  -- Soft-delete via deleted_at (content blanked at display layer, not DB level).
  -- commentCount on community_posts increments on insert, NOT decremented on soft-delete.

  CREATE TABLE community_post_comments (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id          UUID        NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      author_id        UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      content          TEXT        NOT NULL,
      parent_comment_id UUID       REFERENCES community_post_comments(id) ON DELETE CASCADE,
      deleted_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX idx_community_post_comments_post_id   ON community_post_comments(post_id);
  CREATE INDEX idx_community_post_comments_parent_id ON community_post_comments(parent_comment_id);

  -- Reposts: nullable self-referential FK for repost attribution.
  -- When a repost is created, original_post_id points to the original post.
  -- ON DELETE SET NULL: if original is deleted, repost remains but loses attribution.

  ALTER TABLE community_posts
      ADD COLUMN original_post_id UUID REFERENCES community_posts(id) ON DELETE SET NULL;

  CREATE INDEX idx_community_posts_original_post_id ON community_posts(original_post_id)
      WHERE original_post_id IS NOT NULL;
  ```

  **CRITICAL:** Hand-write SQL — `drizzle-kit generate` fails with `server-only` import errors. This is the established pattern. Migration `0019` was the last; `0020` is next.

### Task 2: Schema File `src/db/schema/post-interactions.ts` + Update `community-posts.ts` (AC: #4)

- [ ] 2.1 Create `src/db/schema/post-interactions.ts`:

  ```ts
  import { pgTable, pgEnum, uuid, text, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
  import { authUsers } from "./auth-users";
  import { communityPosts } from "./community-posts";

  export const postReactionTypeEnum = pgEnum("community_post_reaction_type", [
    "like",
    "love",
    "celebrate",
    "insightful",
    "funny",
  ]);

  export const communityPostReactions = pgTable(
    "community_post_reactions",
    {
      postId: uuid("post_id")
        .notNull()
        .references(() => communityPosts.id, { onDelete: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      reactionType: postReactionTypeEnum("reaction_type").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.postId, t.userId] }),
      index("idx_community_post_reactions_post_id").on(t.postId),
    ],
  );

  export const communityPostComments = pgTable(
    "community_post_comments",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      postId: uuid("post_id")
        .notNull()
        .references(() => communityPosts.id, { onDelete: "cascade" }),
      authorId: uuid("author_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      content: text("content").notNull(),
      // Self-referential FK — enforced by migration SQL, not by Drizzle .references().
      // Using plain uuid() avoids circular reference issues in Drizzle schema loading.
      parentCommentId: uuid("parent_comment_id"),
      deletedAt: timestamp("deleted_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
      index("idx_community_post_comments_post_id").on(t.postId),
      index("idx_community_post_comments_parent_id").on(t.parentCommentId),
    ],
  );

  export type PostReactionType = "like" | "love" | "celebrate" | "insightful" | "funny";
  export type CommunityPostReaction = typeof communityPostReactions.$inferSelect;
  export type CommunityPostComment = typeof communityPostComments.$inferSelect;
  export type NewCommunityPostComment = typeof communityPostComments.$inferInsert;
  ```

  **Self-referential FK note:** Use `uuid("parent_comment_id")` without `.references()` — the FK is enforced by migration SQL. Same pattern as `originalPostId`. Do NOT use `ReturnType<typeof communityPostComments.id.getSQL>` — that's not a valid Drizzle API. If you need Drizzle-level FK, use `import { type AnyPgColumn } from "drizzle-orm/pg-core"` with `() => communityPostComments.id` typed as `(): AnyPgColumn => communityPostComments.id`. But the plain `uuid()` approach is simpler and proven.

- [ ] 2.2 Update `src/db/schema/community-posts.ts` — add `originalPostId` column:

  ```ts
  // Add to imports:
  // (no new imports needed — uuid, timestamp etc. already imported)

  // Add to communityPosts table definition after shareCount:
  originalPostId: uuid("original_post_id"), // FK to self: enforced in migration, lazy ref to avoid circular
  ```

  **Why no `.references()` on `originalPostId`:** Self-referential FK with `{ onDelete: "set null" }` can cause circular reference issues in Drizzle schema loading. The FK is enforced by the migration SQL. This is the same approach used for `communityPosts.groupId` (Story 4.1 comment: "FK to community_groups added in Story 5.1").

  Also add to TypeScript exports at the bottom of `community-posts.ts`:

  ```ts
  // Extend CommunityPost type (auto-generated from $inferSelect)
  // originalPostId is now included automatically
  ```

- [ ] 2.3 Register `postInteractionsSchema` in `src/db/index.ts`:

  ```ts
  // Add import (after communityPostsSchema):
  import * as postInteractionsSchema from "./schema/post-interactions";

  // Add to drizzle() schema spread:
  ...postInteractionsSchema,
  ```

  **CRITICAL:** `communityPostsSchema` was already registered in Story 4.1. Only add `postInteractionsSchema` for the new schema file. Do not re-register `communityPostsSchema`.

### Task 3: DB Queries `src/db/queries/post-interactions.ts` (AC: #1, #2, #3)

- [ ] 3.1 Create `src/db/queries/post-interactions.ts`:

  ```ts
  // No "server-only" — consistent with follows.ts, posts.ts, feed.ts.
  // Used by post-interaction-service.ts (server-only) and tests.
  import { eq, and, isNull, sql, desc, asc } from "drizzle-orm";
  import { db } from "@/db";
  import { communityPosts } from "@/db/schema/community-posts";
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
  export async function getReactionCounts(
    postId: string,
  ): Promise<Record<PostReactionType, number>> {
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
      // Check existing
      const [existing] = await tx
        .select({ reactionType: communityPostReactions.reactionType })
        .from(communityPostReactions)
        .where(
          and(eq(communityPostReactions.postId, postId), eq(communityPostReactions.userId, userId)),
        );

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
            and(
              eq(communityPostReactions.postId, postId),
              eq(communityPostReactions.userId, userId),
            ),
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
      // Validate parentCommentId belongs to same post
      if (data.parentCommentId) {
        const [parent] = await tx
          .select({ postId: communityPostComments.postId })
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

  // Private type for the raw DB row
  type CommunityPostCommentRow = typeof communityPostComments.$inferSelect;

  /**
   * Soft-delete a comment (set deleted_at).
   * Only the comment's author can delete their comment.
   * Admin/moderator delete is NOT implemented in Story 4.3 — out of scope.
   * Returns true if deleted, false if not found or not authorized.
   */
  export async function softDeleteComment(
    commentId: string,
    requesterId: string,
  ): Promise<boolean> {
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
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1]!.createdAt.toISOString()
        : null;

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

  /**
   * Get the original post data for a repost embed display.
   * Returns { id, content, contentType, authorDisplayName } or null.
   */
  export async function getOriginalPostEmbed(postId: string): Promise<{
    id: string;
    content: string;
    contentType: string;
    authorDisplayName: string;
    authorPhotoUrl: string | null;
  } | null> {
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
    return row ?? null;
  }
  ```

  **Note on reply query with `ANY(ARRAY[...])` pattern:** This avoids importing `inArray` which requires the array to be non-empty. If `topLevelIds` is empty, the function returns early before this query runs.

  **Alternative for reply query:** If the `ANY(ARRAY[...])` SQL template causes issues, use `import { inArray } from "drizzle-orm"` with a guard: `topLevelIds.length > 0 ? inArray(communityPostComments.parentCommentId, topLevelIds) : sql\`false\``.

- [ ] 3.2 Create `src/db/queries/post-interactions.test.ts` (`@vitest-environment node`):

  Mock pattern:

  ```ts
  vi.mock("@/db");
  vi.mock("@/db/schema/community-posts", () => ({
    communityPosts: {
      id: "id",
      likeCount: "like_count",
      commentCount: "comment_count",
      shareCount: "share_count",
      deletedAt: "deleted_at",
      authorId: "author_id",
      originalPostId: "original_post_id",
    },
  }));
  vi.mock("@/db/schema/post-interactions", () => ({
    communityPostReactions: {
      postId: "post_id",
      userId: "user_id",
      reactionType: "reaction_type",
      createdAt: "created_at",
    },
    communityPostComments: {
      id: "id",
      postId: "post_id",
      authorId: "author_id",
      content: "content",
      parentCommentId: "parent_comment_id",
      deletedAt: "deleted_at",
      createdAt: "created_at",
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

  Use `mockReset()` in `beforeEach` for all db mocks.

  Tests:
  - `getViewerReaction` returns null when no reaction exists
  - `getViewerReaction` returns reaction type when reaction exists
  - `getReactionCounts` returns zeros when no reactions
  - `getReactionCounts` returns correct counts by type
  - `toggleReaction` inserts new reaction and returns `{ newReactionType: "like", countDelta: 1 }` when no existing
  - `toggleReaction` deletes reaction and returns `{ newReactionType: null, countDelta: -1 }` when toggling same type
  - `toggleReaction` updates reaction type and returns `{ newReactionType: "love", countDelta: 0 }` when changing type
  - `insertComment` inserts comment and increments commentCount (no parent)
  - `insertComment` validates parentCommentId belongs to same post — throws if not found
  - `softDeleteComment` returns true when own comment is deleted
  - `softDeleteComment` returns false when comment not found or not authorized
  - `getComments` returns empty array when no comments
  - `getComments` returns top-level comments with embedded replies
  - `getComments` blank content for deleted comments
  - `incrementShareCount` calls db.update with share_count + 1
  - `getOriginalPostEmbed` returns null when post not found
  - `getOriginalPostEmbed` returns post data when found

### Task 4: Post Interaction Service `src/services/post-interaction-service.ts` (AC: #1, #2, #3)

- [ ] 4.1 Create `src/services/post-interaction-service.ts`:

  ```ts
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
  import { insertPost } from "@/db/queries/posts";
  import { eventBus } from "@/services/event-bus";
  import type { PostReactionType } from "@/db/schema/post-interactions";

  export type { ToggleReactionResult, PostComment };

  // ─── Reactions ────────────────────────────────────────────────────────────────

  export interface ReactToPostResult {
    newReactionType: PostReactionType | null;
    countDelta: number; // +1 added, 0 changed, -1 removed
  }

  // TODO (Story 8.1): Block self-reactions (post.authorId === userId → return error)
  export async function reactToPost(
    postId: string,
    userId: string,
    reactionType: PostReactionType,
  ): Promise<ReactToPostResult> {
    const result = await toggleReaction(postId, userId, reactionType);

    // Emit post.reacted only when reaction is added or changed (not removed)
    if (result.newReactionType !== null) {
      try {
        await eventBus.emit("post.reacted", {
          postId,
          userId,
          reaction: result.newReactionType,
          timestamp: new Date().toISOString(),
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
    errorCode: "PARENT_NOT_FOUND" | "INTERNAL_ERROR";
    reason: string;
  }

  export async function addComment(
    postId: string,
    authorId: string,
    content: string,
    parentCommentId?: string | null,
  ): Promise<AddCommentResult | AddCommentError> {
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
      const messageContent = `📢 Shared a post by ${post.authorDisplayName}: ${postUrl}`;
      await messageService.sendMessage({
        conversationId,
        senderId,
        content: messageContent,
        contentType: "text",
      });
      await incrementShareCount(postId);
      return { success: true };
    } catch {
      return { success: false, reason: "Failed to share post" };
    }
  }
  ```

  **`insertPost` update needed (Task 5):** The `insertPost` function in `src/db/queries/posts.ts` needs to accept `originalPostId` in `CreatePostData`. Add it as an optional field.

- [ ] 4.2 Create `src/services/post-interaction-service.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/db/queries/post-interactions", () => ({
    toggleReaction: vi.fn(),
    insertComment: vi.fn(),
    softDeleteComment: vi.fn(),
    getComments: vi.fn(),
    incrementShareCount: vi.fn(),
    getOriginalPostEmbed: vi.fn(),
  }));
  vi.mock("@/db/queries/posts", () => ({
    insertPost: vi.fn(),
  }));
  vi.mock("@/services/event-bus", () => ({
    eventBus: { emit: vi.fn() },
  }));
  ```

  Use `mockReset()` in `beforeEach`.

  Tests:
  - `reactToPost` calls `toggleReaction` with correct args and returns result
  - `reactToPost` emits `post.reacted` when reaction is added (countDelta=1)
  - `reactToPost` emits `post.reacted` when reaction is changed (countDelta=0)
  - `reactToPost` does NOT emit when reaction is removed (newReactionType=null)
  - `reactToPost` does not throw if EventBus fails
  - `addComment` returns success result with comment data
  - `addComment` emits `post.commented` on success
  - `addComment` returns PARENT_NOT_FOUND when parent validation fails
  - `addComment` does not throw if EventBus fails
  - `deleteComment` returns { deleted: true } when soft delete succeeds
  - `deleteComment` returns { deleted: false } when not authorized
  - `repostToFeed` returns ORIGINAL_NOT_FOUND when post doesn't exist
  - `repostToFeed` calls insertPost with originalPostId and increments shareCount
  - `repostToFeed` returns success with new postId
  - `shareToConversation` sends DM and increments shareCount
  - `shareToConversation` returns failure when post not found

### Task 5: Update `CreatePostData` + `insertPost` in `posts.ts` (AC: #3)

**⚠️ DEPENDS ON Task 2.2** — `originalPostId` must already exist in `community-posts.ts` schema before `insertPost` can reference it. Complete Task 2.2 first.

- [ ] 5.1 Update `src/db/queries/posts.ts` — add `originalPostId` to `CreatePostData` and `insertPost`:

  ```ts
  export interface CreatePostData {
    authorId: string;
    content: string;
    contentType: "text" | "rich_text" | "media" | "announcement";
    visibility: "public" | "group" | "members_only";
    category: "discussion" | "event" | "announcement";
    originalPostId?: string | null; // NEW — for reposts
  }

  export async function insertPost(data: CreatePostData) {
    const [post] = await db
      .insert(communityPosts)
      .values({
        authorId: data.authorId,
        content: data.content,
        contentType: data.contentType,
        visibility: data.visibility,
        category: data.category,
        originalPostId: data.originalPostId ?? null, // NEW
      })
      .returning();
    return post!;
  }
  ```

  **No test changes needed:** The existing `posts.test.ts` tests for `insertPost` mock `communityPosts` as a plain object — adding `originalPostId` to the insert values doesn't break existing mock patterns. Add one new test: `insertPost passes originalPostId when provided`.

### Task 6: Rate Limiter Presets (AC: #1, #2, #3)

- [ ] 6.1 Add to `src/services/rate-limiter.ts` (after `POST_CREATE`):

  ```ts
  // Story 4.3 additions
  // Used by REST API routes (Tasks 8.1–8.3):
  POST_COMMENTS_READ: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  POST_COMMENT_DELETE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  POST_REACTIONS_READ: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
  // Reserved for future REST API routes or manual rate-limit checks in Server Actions:
  POST_REACT: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId (reaction spam guard)
  POST_COMMENT: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId (comment spam guard)
  POST_SHARE: { maxRequests: 10, windowMs: 60_000 }, // 10/min per userId
  ```

  **Note:** `POST_REACT`, `POST_COMMENT`, and `POST_SHARE` are not used by any route in this story — the corresponding mutations use Server Actions (not REST routes). These presets are defined now for consistency and future use.

### Task 7: Server Actions (AC: #1, #2, #3)

- [ ] 7.1 Create `src/features/feed/actions/react-to-post.ts`:

  ```ts
  "use server";

  import { z } from "zod/v4";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { reactToPost } from "@/services/post-interaction-service";
  import type { ReactToPostResult } from "@/services/post-interaction-service";

  const schema = z.object({
    postId: z.string().uuid(),
    reactionType: z.enum(["like", "love", "celebrate", "insightful", "funny"]),
  });

  export async function reactToPostAction(
    rawData: unknown,
  ): Promise<
    ReactToPostResult | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
  > {
    let userId: string;
    try {
      const session = await requireAuthenticatedSession();
      userId = session.userId;
    } catch {
      return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
    }

    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "VALIDATION_ERROR",
        reason: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    return reactToPost(parsed.data.postId, userId, parsed.data.reactionType);
  }
  ```

  **IMPORTANT — Asymmetric return type (do NOT "fix" this):** `reactToPost` returns `ReactToPostResult` = `{ newReactionType, countDelta }` — it has NO `success` field. The action wraps auth/validation errors in `{ success: false, errorCode, reason }`. The `ReactionBar` component distinguishes success vs error by checking `"errorCode" in result`. Do NOT add a `success: true` field to `ReactToPostResult` — that would break the detection logic and is unnecessary.

- [ ] 7.2 Create `src/features/feed/actions/add-comment.ts`:

  ```ts
  "use server";

  import { z } from "zod/v4";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { addComment } from "@/services/post-interaction-service";
  import type { AddCommentResult, AddCommentError } from "@/services/post-interaction-service";

  const schema = z.object({
    postId: z.string().uuid(),
    content: z.string().min(1, "Comment cannot be empty").max(2_000),
    parentCommentId: z.string().uuid().nullable().optional(),
  });

  export async function addCommentAction(
    rawData: unknown,
  ): Promise<
    | AddCommentResult
    | AddCommentError
    | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
  > {
    let userId: string;
    try {
      const session = await requireAuthenticatedSession();
      userId = session.userId;
    } catch {
      return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
    }

    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "VALIDATION_ERROR",
        reason: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    return addComment(parsed.data.postId, userId, parsed.data.content, parsed.data.parentCommentId);
  }
  ```

- [ ] 7.3 Create `src/features/feed/actions/share-post.ts`:

  ```ts
  "use server";

  import { z } from "zod/v4";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { repostToFeed, shareToConversation } from "@/services/post-interaction-service";
  import { env } from "@/env";

  const repostSchema = z.object({
    originalPostId: z.string().uuid(),
    commentText: z.string().max(2_000).optional(),
  });

  const shareToConvSchema = z.object({
    postId: z.string().uuid(),
    conversationId: z.string().uuid(),
  });

  export async function repostAction(rawData: unknown) {
    let userId: string;
    try {
      const session = await requireAuthenticatedSession();
      userId = session.userId;
    } catch {
      return { success: false, errorCode: "VALIDATION_ERROR" as const, reason: "Unauthorized" };
    }

    const parsed = repostSchema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "VALIDATION_ERROR" as const,
        reason: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    return repostToFeed(parsed.data.originalPostId, userId, parsed.data.commentText);
  }

  export async function shareToConversationAction(rawData: unknown) {
    let userId: string;
    try {
      const session = await requireAuthenticatedSession();
      userId = session.userId;
    } catch {
      return { success: false, reason: "Unauthorized" };
    }

    const parsed = shareToConvSchema.safeParse(rawData);
    if (!parsed.success) {
      return { success: false, reason: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    return shareToConversation(
      parsed.data.postId,
      userId,
      parsed.data.conversationId,
      env.NEXT_PUBLIC_APP_URL,
    );
  }
  ```

- [ ] 7.4 Create test files for each action (`@vitest-environment node`):

  ```ts
  // Common mocks for all action tests:
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/permissions", () => ({ requireAuthenticatedSession: vi.fn() }));
  vi.mock("@/services/post-interaction-service", () => ({
    reactToPost: vi.fn(),
    addComment: vi.fn(),
    repostToFeed: vi.fn(),
    shareToConversation: vi.fn(),
  }));
  vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://example.com" } }));
  ```

  `react-to-post.test.ts` tests:
  - Returns VALIDATION_ERROR when not authenticated
  - Returns VALIDATION_ERROR for invalid postId (not UUID)
  - Returns VALIDATION_ERROR for invalid reactionType
  - Calls `reactToPost` with correct userId and parsed data
  - Returns service result on success

  `add-comment.test.ts` tests:
  - Returns VALIDATION_ERROR when not authenticated
  - Returns VALIDATION_ERROR for empty content
  - Returns VALIDATION_ERROR for content > 2000 chars
  - Calls `addComment` with correct authorId, content, parentCommentId
  - Passes null for parentCommentId when not provided
  - Returns service success result

  `share-post.test.ts` tests:
  - `repostAction` returns VALIDATION_ERROR when not authenticated
  - `repostAction` calls `repostToFeed` with originalPostId and commentText
  - `repostAction` handles ORIGINAL_NOT_FOUND from service
  - `shareToConversationAction` returns failure when not authenticated
  - `shareToConversationAction` calls `shareToConversation` with correct args including appUrl

### Task 8: REST API Routes (AC: #2, #1)

- [ ] 8.1 Create `src/app/api/v1/posts/[postId]/comments/route.ts`:

  ```ts
  // GET  /api/v1/posts/[postId]/comments  → paginated comments list
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getPostComments } from "@/services/post-interaction-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extractPostId(url: string): string {
    // /api/v1/posts/{postId}/comments → .at(-2) = postId
    const postId = new URL(url).pathname.split("/").at(-2) ?? "";
    if (!uuidRegex.test(postId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
    }
    return postId;
  }

  const getHandler = async (request: Request) => {
    await requireAuthenticatedSession();
    const postId = extractPostId(request.url);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 50);

    const result = await getPostComments(postId, { cursor, limit });
    return successResponse(result);
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `post-comments-read:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.POST_COMMENTS_READ,
    },
  });
  ```

- [ ] 8.2 Create `src/app/api/v1/posts/[postId]/comments/[commentId]/route.ts`:

  ```ts
  // DELETE /api/v1/posts/[postId]/comments/[commentId]  → soft delete own comment
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { deleteComment } from "@/services/post-interaction-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extractCommentId(url: string): string {
    // /api/v1/posts/{postId}/comments/{commentId} → .at(-1) = commentId
    const commentId = new URL(url).pathname.split("/").at(-1) ?? "";
    if (!uuidRegex.test(commentId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid comment ID" });
    }
    return commentId;
  }

  const deleteHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const commentId = extractCommentId(request.url);
    const result = await deleteComment(commentId, userId);
    if (!result.deleted) {
      throw new ApiError({
        title: "Forbidden",
        status: 403,
        detail: "Comment not found or you are not the author",
      });
    }
    return successResponse({ deleted: true });
  };

  export const DELETE = withApiHandler(deleteHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `post-comment-delete:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.POST_COMMENT_DELETE,
    },
  });
  ```

- [ ] 8.3 Create `src/app/api/v1/posts/[postId]/reactions/me/route.ts`:

  ```ts
  // GET /api/v1/posts/[postId]/reactions/me  → viewer's current reaction
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getViewerReaction, getReactionCounts } from "@/db/queries/post-interactions";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extractPostId(url: string): string {
    // /api/v1/posts/{postId}/reactions/me → .at(-3) = postId
    const postId = new URL(url).pathname.split("/").at(-3) ?? "";
    if (!uuidRegex.test(postId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
    }
    return postId;
  }

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const postId = extractPostId(request.url);
    const [userReaction, counts] = await Promise.all([
      getViewerReaction(postId, userId),
      getReactionCounts(postId),
    ]);
    return successResponse({ userReaction, counts });
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `post-reactions-read:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.POST_REACTIONS_READ,
    },
  });
  ```

- [ ] 8.4 Create route test files (`@vitest-environment node`) for each route. Use the established pattern:

  ```ts
  // Common mocks for all route tests:
  vi.mock("server-only", () => ({}));
  vi.mock("@/server/api/middleware", () => ({
    withApiHandler: (handler: (req: Request) => Promise<Response>) => handler,
  }));
  vi.mock("@/services/permissions", () => ({
    requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
  }));
  vi.mock("@/services/post-interaction-service", () => ({
    getPostComments: vi.fn(),
    deleteComment: vi.fn(),
  }));
  vi.mock("@/db/queries/post-interactions", () => ({
    getViewerReaction: vi.fn(),
    getReactionCounts: vi.fn(),
  }));
  vi.mock("@/services/rate-limiter", () => ({
    RATE_LIMIT_PRESETS: {
      POST_COMMENTS_READ: {},
      POST_COMMENT_DELETE: {},
      POST_REACTIONS_READ: {},
    },
  }));
  ```

  `comments/route.test.ts` tests:
  - Returns 401 when not authenticated
  - Returns 400 for invalid postId
  - Returns paginated comments on success
  - Passes cursor and limit query params to service

  `comments/[commentId]/route.test.ts` tests:
  - Returns 401 when not authenticated
  - Returns 400 for invalid commentId
  - Returns 403 when comment not found or not authorized
  - Returns `{ deleted: true }` on success

  `reactions/me/route.test.ts` tests:
  - Returns 401 when not authenticated
  - Returns 400 for invalid postId
  - Returns `{ userReaction, counts }` on success

### Task 9: i18n Translations (AC: all UI text)

**Add ALL keys BEFORE component work (Tasks 10–13)**

- [ ] 9.1 Add `Feed.reactions.*`, `Feed.comments.*`, `Feed.share.*` keys to `messages/en.json` under the existing `"Feed"` namespace:

  ```json
  "reactions": {
    "react": "React",
    "like": "Like",
    "love": "Love",
    "celebrate": "Celebrate",
    "insightful": "Insightful",
    "funny": "Funny",
    "reactionCount": "{count, plural, =0 {0 reactions} =1 {1 reaction} other {# reactions}}",
    "pickerLabel": "Choose a reaction",
    "removeReaction": "Remove reaction",
    "reactAriaLabel": "React to post"
  },
  "comments": {
    "comment": "Comment",
    "addComment": "Add a comment…",
    "reply": "Reply",
    "replyTo": "Replying to {name}",
    "submit": "Post",
    "submitting": "Posting…",
    "cancel": "Cancel",
    "delete": "Delete",
    "deleteConfirm": "Delete this comment?",
    "deleted": "[Comment deleted]",
    "viewReplies": "{count, plural, =1 {View 1 reply} other {View {count} replies}}",
    "hideReplies": "Hide replies",
    "noComments": "No comments yet. Be the first!",
    "loadMore": "Load more comments",
    "errorGeneric": "Something went wrong. Please try again.",
    "errorParentNotFound": "This comment or reply no longer exists."
  },
  "share": {
    "share": "Share",
    "repost": "Repost",
    "repostWithComment": "Repost with your thoughts…",
    "repostSubmit": "Repost",
    "repostSuccess": "Reposted!",
    "shareToConversation": "Share to conversation",
    "shareToConversationHint": "Select a conversation",
    "shareToGroup": "Share to group",
    "shareToGroupComingSoon": "Coming soon — requires groups (Epic 5)",
    "copyLink": "Copy link",
    "linkCopied": "Link copied!",
    "shareCount": "{count, plural, =0 {0 shares} =1 {1 share} other {# shares}}",
    "errorGeneric": "Could not share. Please try again.",
    "originalPostBy": "Originally posted by {name}",
    "repostLabel": "Repost"
  }
  ```

- [ ] 9.2 Add corresponding Igbo keys to `messages/ig.json` under `"Feed"`:

  ```json
  "reactions": {
    "react": "Mee ihe",
    "like": "Á masị m",
    "love": "Ọ masị m nke ọma",
    "celebrate": "Emesị",
    "insightful": "Ọ na-enye ọmụmụ",
    "funny": "Ọ na-atọ ọchị",
    "reactionCount": "{count, plural, =0 {Ọ dịghị mmegharị} =1 {Mmegharị 1} other {Mmegharị #}}",
    "pickerLabel": "Họrọ mmegharị",
    "removeReaction": "Wepụ mmegharị",
    "reactAriaLabel": "Mee ihe na post"
  },
  "comments": {
    "comment": "Okwu",
    "addComment": "Tinye okwu…",
    "reply": "Zaghachi",
    "replyTo": "Na-azaghachi {name}",
    "submit": "Zipu",
    "submitting": "Na-ezipu…",
    "cancel": "Kagbuo",
    "delete": "Hichapụ",
    "deleteConfirm": "Hichapụ okwu a?",
    "deleted": "[Okwu hichapụrụ]",
    "viewReplies": "{count, plural, =1 {Hụ nzaghachi 1} other {Hụ nzaghachi {count}}}",
    "hideReplies": "Zobe nzaghachi",
    "noComments": "Ọ dịghị okwu. Bụrụ onye mbụ!",
    "loadMore": "Bulite okwu ndị ọzọ",
    "errorGeneric": "Ihe ọjọọ mere. Nwaa ọzọ.",
    "errorParentNotFound": "Okwu a adịghị ọzọ."
  },
  "share": {
    "share": "Kesaa",
    "repost": "Kesaa ọzọ",
    "repostWithComment": "Kesaa na echiche gị…",
    "repostSubmit": "Kesaa ọzọ",
    "repostSuccess": "Ekesarịla!",
    "shareToConversation": "Kesaa na mkparịta ụka",
    "shareToConversationHint": "Họrọ mkparịta ụka",
    "shareToGroup": "Kesaa na ìgwè",
    "shareToGroupComingSoon": "Na-abịa — chefuo ìgwè (Epic 5)",
    "copyLink": "Detuo njikọ",
    "linkCopied": "Edetụola njikọ!",
    "shareCount": "{count, plural, =0 {Ọ dịghị nkesa} =1 {Nkesa 1} other {Nkesa #}}",
    "errorGeneric": "Enweghị ike ịkesa. Nwaa ọzọ.",
    "originalPostBy": "Onye mbụ de ya bụ {name}",
    "repostLabel": "Nkesa"
  }
  ```

### Task 10: `FeedPost` Type + `feed.ts` Updates (AC: #3)

- [ ] 10.1 Update `src/db/queries/feed.ts` — add `originalPostId` to `FeedPost` interface and both page functions:

  ```ts
  // Add to FeedPost interface (after shareCount):
  originalPostId: string | null;

  // Add to _getChronologicalFeedPage .select():
  originalPostId: communityPosts.originalPostId,

  // Add to chronological posts mapping:
  originalPostId: r.originalPostId,

  // Add to _getAlgorithmicFeedPage .select():
  originalPostId: communityPosts.originalPostId,

  // Add to algorithmic posts mapping:
  originalPostId: r.originalPostId,
  ```

  **Note:** We do NOT join to the original post for display in Story 4.3. `FeedItem` will show a simplified "↩ Reposted" banner when `originalPostId` is set. The full repost embed (original content + author) can be enhanced in a future story when the need arises.

- [ ] 10.2 Update `src/features/feed/types/index.ts` — no changes needed (FeedPost is re-exported from `@/db/queries/feed` which already exports the updated type).

### Task 11: `ReactionBar` Component (AC: #1)

- [ ] 11.1 Create `src/features/feed/components/ReactionBar.tsx`:

  ```tsx
  "use client";

  import { useState, useRef, useCallback } from "react";
  import { useTranslations } from "next-intl";
  import { reactToPostAction } from "../actions/react-to-post";
  import type { PostReactionType } from "@/db/schema/post-interactions";

  const REACTION_EMOJIS: Record<PostReactionType, string> = {
    like: "👍",
    love: "❤️",
    celebrate: "🎉",
    insightful: "💡",
    funny: "😄",
  };

  const REACTION_TYPES: PostReactionType[] = ["like", "love", "celebrate", "insightful", "funny"];

  interface ReactionBarProps {
    postId: string;
    initialCount: number; // from post.likeCount
  }

  export function ReactionBar({ postId, initialCount }: ReactionBarProps) {
    const t = useTranslations("Feed");
    const [count, setCount] = useState(initialCount);
    const [userReaction, setUserReaction] = useState<PostReactionType | null>(null);
    const [isFetchedReaction, setIsFetchedReaction] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isPending, setIsPending] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Fetch viewer's current reaction lazily (on first picker open)
    const fetchReaction = useCallback(async () => {
      if (isFetchedReaction) return;
      setIsFetchedReaction(true);
      try {
        const res = await fetch(`/api/v1/posts/${postId}/reactions/me`);
        if (res.ok) {
          const json = (await res.json()) as { data: { userReaction: PostReactionType | null } };
          setUserReaction(json.data.userReaction);
        }
      } catch {
        // Ignore — viewer reaction unknown, no impact on UX
      }
    }, [postId, isFetchedReaction]);

    const handleTogglePicker = async () => {
      if (!isPickerOpen) {
        await fetchReaction();
      }
      setIsPickerOpen((prev) => !prev);
    };

    const handleReact = async (type: PostReactionType) => {
      if (isPending) return;
      setIsPending(true);
      setIsPickerOpen(false);

      // Optimistic update
      const prevReaction = userReaction;
      const prevCount = count;
      if (prevReaction === null) {
        setCount((c) => c + 1);
        setUserReaction(type);
      } else if (prevReaction === type) {
        setCount((c) => Math.max(c - 1, 0));
        setUserReaction(null);
      } else {
        setUserReaction(type); // Count unchanged
      }

      try {
        const result = await reactToPostAction({ postId, reactionType: type });
        if ("errorCode" in result) {
          // Rollback optimistic update
          setCount(prevCount);
          setUserReaction(prevReaction);
        } else {
          // Sync with server's authoritative delta from pre-optimistic baseline
          // (prevCount is saved before optimistic update — avoids double-counting)
          setCount(prevCount + result.countDelta);
          setUserReaction(result.newReactionType);
        }
      } catch {
        setCount(prevCount);
        setUserReaction(prevReaction);
      } finally {
        setIsPending(false);
      }
    };

    const currentEmoji = userReaction ? REACTION_EMOJIS[userReaction] : "👍";

    return (
      <div className="relative">
        {/* Reaction trigger button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTogglePicker}
          disabled={isPending}
          aria-label={t("reactions.reactAriaLabel")}
          aria-pressed={userReaction !== null}
          aria-expanded={isPickerOpen}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium min-h-[36px] border transition-colors ${
            userReaction
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-accent"
          }`}
        >
          <span aria-hidden="true">{currentEmoji}</span>
          <span>{count > 0 ? t("reactions.reactionCount", { count }) : t("reactions.react")}</span>
        </button>

        {/* Reaction picker popover */}
        {isPickerOpen && (
          <div
            role="dialog"
            aria-label={t("reactions.pickerLabel")}
            className="absolute bottom-full mb-2 left-0 z-50 flex gap-1 rounded-full border border-border bg-card p-2 shadow-lg"
          >
            {REACTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => void handleReact(type)}
                aria-label={t(`reactions.${type}` as Parameters<typeof t>[0])}
                aria-pressed={userReaction === type}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 min-h-[40px] ${
                  userReaction === type ? "bg-primary/20 scale-110" : "hover:bg-accent"
                }`}
              >
                {REACTION_EMOJIS[type]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] 11.2 Create `src/features/feed/components/ReactionBar.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../actions/react-to-post", () => ({
    reactToPostAction: vi.fn(),
  }));
  vi.mock("next-intl", () => ({
    useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) =>
      params ? `${ns}.${key}(${JSON.stringify(params)})` : `${ns}.${key}`,
  }));
  ```

  Mock `global.fetch` to return viewer reaction in beforeEach.

  Tests:
  - Renders reaction trigger button with count from `initialCount`
  - Shows "React" text when count is 0 and no user reaction
  - Shows reaction emoji and count when user has reacted (after fetch)
  - Clicking trigger opens reaction picker with 5 emoji buttons
  - Clicking same reaction type optimistically decrements count and closes picker
  - Clicking new reaction type optimistically increments count
  - Rolls back optimistic update when server action returns errorCode
  - `reactToPostAction` called with correct postId and reactionType
  - Picker has correct `aria-label` and `role="dialog"`
  - Trigger has `aria-expanded` reflecting picker open state

### Task 12: `CommentSection` + `CommentItem` Components (AC: #2)

- [ ] 12.1 Create `src/features/feed/components/CommentItem.tsx`:

  ```tsx
  "use client";

  import { useState, useTransition } from "react";
  import { useTranslations } from "next-intl";
  import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
  import { Button } from "@/components/ui/button";
  import type { PostComment } from "@/db/queries/post-interactions";

  interface CommentItemProps {
    comment: PostComment;
    currentUserId: string;
    onReply: (parentCommentId: string, parentAuthorName: string) => void;
    onDelete: (commentId: string) => Promise<void>;
    isReply?: boolean;
  }

  export function CommentItem({
    comment,
    currentUserId,
    onReply,
    onDelete,
    isReply = false,
  }: CommentItemProps) {
    const t = useTranslations("Feed");
    const [isDeleting, startDeleteTransition] = useTransition();

    const initials = comment.authorDisplayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const isDeleted = comment.deletedAt !== null;
    const isOwn = comment.authorId === currentUserId;

    const handleDelete = () => {
      startDeleteTransition(async () => {
        await onDelete(comment.id);
      });
    };

    return (
      <div className={`flex gap-2 ${isReply ? "ml-10" : ""}`}>
        <Avatar className="h-8 w-8 shrink-0 mt-0.5">
          <AvatarImage src={comment.authorPhotoUrl ?? undefined} alt={comment.authorDisplayName} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            {isDeleted ? (
              <p className="text-muted-foreground italic">{t("comments.deleted")}</p>
            ) : (
              <>
                <span className="font-medium text-sm">{comment.authorDisplayName}</span>
                <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{comment.content}</p>
              </>
            )}
          </div>
          {/* Actions: Reply + Delete (own comments only) */}
          {!isDeleted && (
            <div className="flex gap-3 mt-1 px-1">
              {!isReply && (
                <button
                  type="button"
                  onClick={() => onReply(comment.id, comment.authorDisplayName)}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium"
                >
                  {t("comments.reply")}
                </button>
              )}
              {isOwn && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-xs text-muted-foreground hover:text-destructive font-medium"
                >
                  {t("comments.delete")}
                </button>
              )}
            </div>
          )}
          {/* Nested replies */}
          {!isReply && comment.replies.length > 0 && (
            <div className="mt-2 space-y-2">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  onDelete={onDelete}
                  isReply
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] 12.2 Create `src/features/feed/components/CommentSection.tsx`:

  ```tsx
  "use client";

  import { useState, useEffect, useTransition, useCallback } from "react";
  import { useMutation, useQueryClient } from "@tanstack/react-query";
  import { useTranslations } from "next-intl";
  import { Button } from "@/components/ui/button";
  import { CommentItem } from "./CommentItem";
  import { addCommentAction } from "../actions/add-comment";
  import type { PostComment } from "@/db/queries/post-interactions";

  interface CommentSectionProps {
    postId: string;
    initialCount: number; // from post.commentCount
    currentUserId: string;
  }

  export function CommentSection({ postId, initialCount, currentUserId }: CommentSectionProps) {
    const t = useTranslations("Feed");
    const queryClient = useQueryClient();
    const [inputValue, setInputValue] = useState("");
    const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [localCount, setLocalCount] = useState(initialCount);

    // Manual cursor-based pagination with accumulated comments
    const [comments, setComments] = useState<PostComment[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);

    const fetchComments = useCallback(
      async (cursor?: string) => {
        const isMore = !!cursor;
        if (isMore) setIsLoadingMore(true);
        else setIsLoading(true);
        try {
          const url = cursor
            ? `/api/v1/posts/${postId}/comments?limit=10&cursor=${encodeURIComponent(cursor)}`
            : `/api/v1/posts/${postId}/comments?limit=10`;
          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to fetch comments");
          const json = (await res.json()) as {
            data: { comments: PostComment[]; nextCursor: string | null };
          };
          setComments((prev) => (isMore ? [...prev, ...json.data.comments] : json.data.comments));
          setNextCursor(json.data.nextCursor);
        } finally {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      },
      [postId],
    );

    // Fetch initial page on mount — MUST use useEffect (not conditional in render body).
    // Setting state during render causes infinite loops in React 18+ strict mode.
    useEffect(() => {
      if (!hasFetched) {
        setHasFetched(true);
        void fetchComments();
      }
    }, [hasFetched, fetchComments]);

    const deleteCommentMutation = useMutation({
      mutationFn: async (commentId: string) => {
        const res = await fetch(`/api/v1/posts/${postId}/comments/${commentId}`, {
          method: "DELETE",
          headers: { Origin: window.location.origin },
        });
        if (!res.ok && res.status !== 204) throw new Error("Failed to delete");
      },
      onSuccess: () => {
        // Reset and refetch from scratch
        setHasFetched(false);
        setComments([]);
        setNextCursor(null);
      },
    });

    const handleReply = (parentId: string, parentName: string) => {
      setReplyTo({ id: parentId, name: parentName });
      setInputValue("");
    };

    const handleSubmit = () => {
      const content = inputValue.trim();
      if (!content) return;
      setSubmitError(null);

      startTransition(async () => {
        const result = await addCommentAction({
          postId,
          content,
          parentCommentId: replyTo?.id ?? null,
        });

        if (!result.success) {
          if (result.errorCode === "PARENT_NOT_FOUND") {
            setSubmitError(t("comments.errorParentNotFound"));
          } else {
            setSubmitError(t("comments.errorGeneric"));
          }
          return;
        }

        setInputValue("");
        setReplyTo(null);
        setLocalCount((c) => c + 1);
        // Reset and refetch from scratch to include the new comment
        setHasFetched(false);
        setComments([]);
        setNextCursor(null);
      });
    };

    return (
      <div className="space-y-3 pt-2 border-t border-border">
        {/* Comment input */}
        <div className="space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t("comments.replyTo", { name: replyTo.name })}</span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-xs hover:text-foreground"
              >
                ×
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("comments.addComment")}
              rows={2}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={isPending || !inputValue.trim()}
              onClick={handleSubmit}
              className="self-end"
            >
              {isPending ? t("comments.submitting") : t("comments.submit")}
            </Button>
          </div>
          {submitError && (
            <p className="text-xs text-destructive" role="alert">
              {submitError}
            </p>
          )}
        </div>

        {/* Comments list */}
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{t("comments.noComments")}</p>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                currentUserId={currentUserId}
                onReply={handleReply}
                onDelete={async (id) => {
                  await deleteCommentMutation.mutateAsync(id);
                }}
              />
            ))}
            {nextCursor && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => void fetchComments(nextCursor)}
                disabled={isLoadingMore}
              >
                {t("comments.loadMore")}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
  ```

  **Note on pagination approach:** `CommentSection` uses manual cursor state (`nextCursor` + accumulated `comments[]`) with plain `fetch()` — NOT `useQuery`/`useInfiniteQuery`. This avoids the complexity of `useInfiniteQuery`'s `getNextPageParam`/`select` for a simple load-more pattern. `useMutation` is used for delete only. If richer cache management is needed in Story 4.4+, migrate to `useInfiniteQuery`.

  **IMPORTANT:** `CommentSection` uses React Query — any test file that renders a parent component containing `CommentSection` needs `QueryClientProvider` wrapping.

- [ ] 12.3 Create test files:

  `CommentItem.test.tsx` tests (`@vitest-environment jsdom`):
  - Renders author display name and content
  - Shows "[Comment deleted]" placeholder when `deletedAt` is set
  - Shows Reply button for top-level comments (not replies)
  - Does NOT show Reply button when `isReply=true`
  - Shows Delete button only for own comments (`authorId === currentUserId`)
  - Calls `onReply` with comment ID and author name when Reply clicked
  - Calls `onDelete` with comment ID when Delete clicked
  - Renders reply comments when `comment.replies` is non-empty
  - Replies are indented (`isReply=true` adds `ml-10`)

  `CommentSection.test.tsx` tests (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../actions/add-comment", () => ({ addCommentAction: vi.fn() }));
  vi.mock("./CommentItem", () => ({
    CommentItem: ({ comment }: { comment: PostComment }) => (
      <div data-testid={`comment-${comment.id}`}>{comment.content}</div>
    ),
  }));
  vi.mock("react", async () => ({
    ...(await vi.importActual("react")),
    useTransition: () => [false, (fn: () => void) => { void fn(); }],
  }));
  ```

  Mock `global.fetch` to return `{ data: { comments: [], nextCursor: null } }`.

  Tests:
  - Renders textarea for new comment
  - Shows "No comments yet" when comments list is empty
  - Shows "Reply to {name}" indicator when reply mode is active
  - Calls `addCommentAction` on submit
  - Adds `parentCommentId` to action call when replying
  - Shows error message when action returns `PARENT_NOT_FOUND`
  - Shows error message when action returns `INTERNAL_ERROR`
  - Does NOT submit when textarea is empty
  - Clears input and cancels reply on success

### Task 13: `ShareDialog` Component (AC: #3)

- [ ] 13.1 Create `src/features/feed/components/ShareDialog.tsx`:

  ```tsx
  "use client";

  import { useState, useEffect, useTransition } from "react";
  import { useTranslations } from "next-intl";
  import { useQueryClient } from "@tanstack/react-query";
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { repostAction, shareToConversationAction } from "../actions/share-post";

  interface ShareDialogProps {
    postId: string;
    postAuthorName: string;
    isOpen: boolean;
    onClose: () => void;
    onShareComplete: () => void; // Increments local shareCount in parent
    sort: string;
    filter: string;
  }

  type ShareTab = "repost" | "conversation" | "group";

  export function ShareDialog({
    postId,
    postAuthorName,
    isOpen,
    onClose,
    onShareComplete,
    sort,
    filter,
  }: ShareDialogProps) {
    const t = useTranslations("Feed");
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<ShareTab>("repost");
    const [commentText, setCommentText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleRepost = () => {
      setError(null);
      startTransition(async () => {
        const result = await repostAction({ originalPostId: postId, commentText });
        if (!result.success) {
          setError(t("share.errorGeneric"));
          return;
        }
        setSuccess(t("share.repostSuccess"));
        onShareComplete();
        await queryClient.invalidateQueries({ queryKey: ["feed", sort, filter] });
        setTimeout(() => onClose(), 1500);
      });
    };

    const handleCopyLink = async () => {
      const url = `${window.location.origin}/feed?post=${postId}`;
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch {
        setError(t("share.errorGeneric"));
      }
    };

    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("share.share")}</DialogTitle>
          </DialogHeader>

          {/* Tab navigation */}
          <div className="flex gap-2 border-b border-border pb-2">
            {(["repost", "conversation", "group"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                disabled={tab === "group"}
                aria-pressed={activeTab === tab}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {tab === "repost"
                  ? t("share.repost")
                  : tab === "conversation"
                    ? t("share.shareToConversation")
                    : t("share.shareToGroup")}
                {tab === "group" && (
                  <span className="ml-1 text-xs opacity-60">
                    ({t("share.shareToGroupComingSoon").split("—")[0]?.trim()})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Repost tab */}
          {activeTab === "repost" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("share.originalPostBy", { name: postAuthorName })}
              </p>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t("share.repostWithComment")}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                maxLength={2000}
              />
              {error && (
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-xs text-green-600" role="status">
                  {success}
                </p>
              )}
              <Button type="button" className="w-full" disabled={isPending} onClick={handleRepost}>
                {isPending ? t("composer.submitting") : t("share.repostSubmit")}
              </Button>
            </div>
          )}

          {/* Share to conversation tab */}
          {activeTab === "conversation" && (
            <ConversationPicker
              postId={postId}
              onShareComplete={() => {
                onShareComplete();
                onClose();
              }}
            />
          )}

          {/* Copy link (always available) */}
          <div className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => void handleCopyLink()}
            >
              {linkCopied ? t("share.linkCopied") : t("share.copyLink")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Inline sub-component: shows existing conversations to pick for sharing
  function ConversationPicker({
    postId,
    onShareComplete,
  }: {
    postId: string;
    onShareComplete: () => void;
  }) {
    const t = useTranslations("Feed");
    const [conversations, setConversations] = useState<Array<{ id: string; displayName: string }>>(
      [],
    );
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const fetchConversations = async () => {
      if (hasFetched) return;
      setIsLoading(true);
      setHasFetched(true);
      try {
        const res = await fetch("/api/v1/conversations?limit=20");
        if (res.ok) {
          // Actual response shape from GET /api/v1/conversations (chat-conversations.ts):
          // Direct convos: { id, type, otherMember: { id, displayName, photoUrl }, ... }
          // Group convos: { id, type, groupName, members: [...], ... }
          const json = (await res.json()) as {
            data: {
              conversations: Array<{
                id: string;
                type: "direct" | "group" | "channel";
                otherMember: { id: string; displayName: string; photoUrl: string | null };
                groupName?: string | null;
              }>;
            };
          };
          setConversations(
            json.data.conversations.map((c) => ({
              id: c.id,
              displayName:
                c.type === "group" ? (c.groupName ?? "Group") : c.otherMember.displayName,
            })),
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch on mount
    useEffect(() => {
      void fetchConversations();
    }, []);

    const handleShare = (conversationId: string) => {
      setError(null);
      startTransition(async () => {
        const result = await shareToConversationAction({ postId, conversationId });
        if (!result.success) {
          setError(t("share.errorGeneric"));
          return;
        }
        onShareComplete();
      });
    };

    if (isLoading) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("share.shareToConversationHint")}</p>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <ul className="max-h-48 overflow-y-auto space-y-1">
          {conversations.map((conv) => (
            <li key={conv.id}>
              <button
                type="button"
                onClick={() => handleShare(conv.id)}
                disabled={isPending}
                className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
              >
                {conv.displayName}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  ```

- [ ] 13.2 Create `src/features/feed/components/ShareDialog.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../actions/share-post", () => ({
    repostAction: vi.fn(),
    shareToConversationAction: vi.fn(),
  }));
  vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  }));
  vi.mock("react", async () => ({
    ...(await vi.importActual("react")),
    useTransition: () => [false, (fn: () => void) => { void fn(); }],
  }));
  ```

  Mock `global.fetch` for conversations list and `navigator.clipboard.writeText`.

  Tests:
  - Does not render when `isOpen=false`
  - Renders dialog with share options when `isOpen=true`
  - Shows Repost tab by default
  - Clicking "Repost" tab shows repost textarea
  - Calls `repostAction` with postId and commentText on repost submit
  - Calls `onShareComplete` on successful repost
  - Shows success message then calls `onClose` after delay
  - Shows error message when repost action fails
  - Copy link button calls `navigator.clipboard.writeText` with correct URL
  - Shows "Link copied!" after copy
  - Group tab button is disabled

### Task 14: Update `FeedItem.tsx` (AC: #1, #2, #3)

- [ ] 14.1 Update `src/features/feed/components/FeedItem.tsx` — replace static engagement bar with interactive `ReactionBar`, comment toggle, and share button; add repost display:

  The current static engagement bar (lines 171–176):

  ```tsx
  {
    /* Engagement counts — display only in Story 4.1 (interaction in Story 4.3) */
  }
  <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
    <span>{t("likeCount", { count: post.likeCount })}</span>
    <span>{t("commentCount", { count: post.commentCount })}</span>
    <span>{t("shareCount", { count: post.shareCount })}</span>
  </div>;
  ```

  Replace with:

  ```tsx
  "use client"; // FeedItem is already "use client" (it uses useState, useRef)

  // Add to imports:
  import { ReactionBar } from "./ReactionBar";
  import { CommentSection } from "./CommentSection";
  import { ShareDialog } from "./ShareDialog";

  // Add to component state (add these after existing useState declarations):
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [localCommentCount, setLocalCommentCount] = useState(post.commentCount);
  const [localShareCount, setLocalShareCount] = useState(post.shareCount);

  // NOTE: currentUserId needs to be passed as prop (from FeedList → FeedItem).
  // Add to FeedItemProps:
  // currentUserId: string;

  // Repost attribution banner (add before content section):
  {
    post.originalPostId && (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true">↩</span>
        <span>{t("share.repostLabel")}</span>
      </div>
    );
  }

  // Replace static engagement bar:
  <div className="flex items-center gap-3 pt-2 border-t border-border flex-wrap">
    <ReactionBar postId={post.id} initialCount={post.likeCount} />
    <button
      type="button"
      onClick={() => setShowComments((prev) => !prev)}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium min-h-[36px] border border-border bg-background text-muted-foreground hover:bg-accent transition-colors"
      aria-expanded={showComments}
    >
      💬{" "}
      <span>
        {t("comments.comment")} ({localCommentCount})
      </span>
    </button>
    <button
      type="button"
      onClick={() => setShowShare(true)}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium min-h-[36px] border border-border bg-background text-muted-foreground hover:bg-accent transition-colors"
    >
      🔄{" "}
      <span>
        {t("share.share")} ({localShareCount})
      </span>
    </button>
  </div>;

  {
    /* Comments section (expandable) */
  }
  {
    showComments && (
      <CommentSection
        postId={post.id}
        initialCount={localCommentCount}
        currentUserId={currentUserId}
      />
    );
  }

  {
    /* Share dialog */
  }
  <ShareDialog
    postId={post.id}
    postAuthorName={post.authorDisplayName}
    isOpen={showShare}
    onClose={() => setShowShare(false)}
    onShareComplete={() => setLocalShareCount((c) => c + 1)}
    sort={sort}
    filter={filter}
  />;
  ```

  **`currentUserId`, `sort`, `filter` props:** `FeedItem` needs these new props for `CommentSection` and `ShareDialog`. Update `FeedItemProps`:

  ```ts
  interface FeedItemProps {
    post: FeedPost;
    currentUserId: string; // NEW
    sort: FeedSortMode; // NEW
    filter: FeedFilter; // NEW
  }
  ```

  **Update `FeedList.tsx`** — pass the new props to each `<FeedItem>`:

  ```tsx
  <FeedItem
    key={post.id} // This is already the list key
    post={post}
    currentUserId={userName} // Use userId from FeedListProps — rename `userName` to `userId` or add new prop
    sort={sort}
    filter={filter}
  />
  ```

  **IMPORTANT:** `FeedList` currently has `userName?: string` prop. For `CommentSection` we need `currentUserId` (a UUID), not the display name. Update `FeedList` to also accept `currentUserId?: string` and pass it through to `FeedItem`. Update `FeedPage` server component to pass `session.user.id` as `currentUserId`.

- [ ] 14.2 Update `src/features/feed/components/FeedItem.test.tsx` — add mocks and new tests:

  ```ts
  // Add to existing mocks:
  vi.mock("./ReactionBar", () => ({
    ReactionBar: ({ postId, initialCount }: { postId: string; initialCount: number }) => (
      <div data-testid="reaction-bar" data-post-id={postId} data-count={initialCount} />
    ),
  }));
  vi.mock("./CommentSection", () => ({
    CommentSection: ({ postId }: { postId: string }) => (
      <div data-testid="comment-section" data-post-id={postId} />
    ),
  }));
  vi.mock("./ShareDialog", () => ({
    ShareDialog: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div data-testid="share-dialog" /> : null,
  }));
  ```

  Update `makePost` factory and all existing test renders to include new required props:

  ```ts
  function renderPost(overrides: Partial<FeedPost> = {}) {
    return render(
      <FeedItem
        post={makePost(overrides)}
        currentUserId="user-1"
        sort="chronological"
        filter="all"
      />
    );
  }
  ```

  New tests:
  - Renders `ReactionBar` with `postId` and `likeCount`
  - Renders Comment button with comment count
  - Clicking Comment button shows `CommentSection`
  - Clicking Comment button again hides `CommentSection`
  - Renders Share button with share count
  - Clicking Share button opens `ShareDialog`
  - Renders repost banner when `originalPostId` is set
  - Does NOT render repost banner when `originalPostId` is null

### Task 15: Update `FeedPage` — Pass `currentUserId` (AC: #2)

- [ ] 15.1 Update `src/app/[locale]/(app)/feed/page.tsx` — add `currentUserId` to `FeedList`:

  ```tsx
  // Add currentUserId to FeedList call:
  <FeedList
    canCreatePost={canPost.allowed}
    userName={session.user.name ?? ""}
    currentUserId={userId} // NEW
  />
  ```

- [ ] 15.2 Update `src/features/feed/components/FeedList.tsx` — add `currentUserId` prop and pass to `FeedItem`:

  ```ts
  interface FeedListProps {
    // ... existing props ...
    currentUserId?: string; // NEW
  }
  ```

  Pass through in each `<FeedItem>` render:

  ```tsx
  <FeedItem post={post} currentUserId={currentUserId ?? ""} sort={sort} filter={filter} />
  ```

- [ ] 15.3 Update `FeedList.test.tsx` and `FeedPage.test.tsx` — update mocks and add tests:

  `FeedList.test.tsx`:
  - Update `FeedItem` mock to accept new props (add `currentUserId`, `sort`, `filter` to mock props)
  - Add test: `FeedItem` receives `currentUserId` from `FeedList`

  `FeedPage.test.tsx`:
  - Add test: Passes `currentUserId` (from `session.user.id`) to `FeedList`

### Task 16: Barrel Export Updates

- [ ] 16.1 Update `src/features/feed/index.ts`:

  ```ts
  export { ReactionBar } from "./components/ReactionBar";
  export { CommentSection } from "./components/CommentSection";
  export { CommentItem } from "./components/CommentItem";
  export { ShareDialog } from "./components/ShareDialog";
  ```

### Task 17: Sprint Status Update

- [ ] 17.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Change `4-3-reactions-comments-sharing: backlog` → `4-3-reactions-comments-sharing: ready-for-dev`

## Dev Notes

### DB Design: `likeCount` = Total Reaction Count (All Types)

The `community_posts.likeCount` column was named before the multi-type reaction design was finalized. In Story 4.3, it represents the **total reaction count** across all 5 types (like + love + celebrate + insightful + funny). This is consistent with the algorithmic feed scoring in `feed.ts`:

```ts
r.likeCount * FEED_CONFIG.LIKE_WEIGHT; // Treats all reactions equally for scoring
```

No column rename or migration is needed — the name is a historical artifact. The `REACTION_TYPES` enum in `post-interactions.ts` documents all valid types.

### Single-Select vs Multi-Select Reaction Design

Post reactions are **single-select per member per post** — enforced by the composite PK `(post_id, user_id)`. This contrasts with chat message reactions (Story 2.4) which are multi-emoji per user. The asymmetry is intentional (see epics.md note): post reactions feed the future points engine (Story 8.1) and multi-reaction would allow points inflation via reaction stacking.

- **Adding reaction:** INSERT into `community_post_reactions`, `likeCount + 1`
- **Changing reaction type:** UPDATE `reaction_type`, count unchanged
- **Removing reaction (same type toggle):** DELETE from `community_post_reactions`, `likeCount - 1` (with `GREATEST(..., 0)` guard against negative)

### Drizzle Self-Referential FK Pattern

Both `communityPostComments.parentCommentId` and `communityPosts.originalPostId` use plain `uuid()` **without** `.references()` — the FK constraints are enforced by migration SQL only. This avoids circular reference issues in Drizzle schema loading.

```ts
// CORRECT — plain uuid, FK in migration SQL
parentCommentId: uuid("parent_comment_id"),
originalPostId: uuid("original_post_id"),
```

If you want Drizzle-level FK awareness, use `import { type AnyPgColumn } from "drizzle-orm/pg-core"` and `(): AnyPgColumn => communityPostComments.id`. Do NOT use `ReturnType<typeof communityPostComments.id.getSQL>` — that's not a valid Drizzle API.

The service-layer validates `parentCommentId` belongs to the same post before insert (defense in depth).

### Migration 0020 Sequence

Last migration: `0019_post_category.sql` (Story 4.2). Next: `0020_post_interactions.sql`. Always hand-write SQL — `drizzle-kit generate` fails with `server-only` import errors (established since Epic 1).

### Events.ts: No Changes Needed

`PostReactedEvent`, `PostCommentedEvent`, "post.reacted", "post.commented" are ALL already defined in `src/types/events.ts` (added in advance during earlier stories). Do NOT re-add them.

### OptimisticUpdate Pattern in `ReactionBar`

`ReactionBar` uses local state for optimistic updates (not TanStack Query's `useMutation`). This is appropriate because:

1. The count shown is a local mirror of `post.likeCount` (the feed doesn't re-fetch after reactions)
2. The reaction picker needs to respond instantly without React Query complexity
3. Rollback is straightforward: `setCount(prevCount); setUserReaction(prevReaction)`

If the Server Action fails, the count and reaction type are rolled back to pre-action values.

**Future optimization (NOT in Story 4.3):** `ReactionBar` fetches the viewer's reaction lazily per post. For a feed with 20 posts, this means 20 individual fetches on first interaction. A batch endpoint (`GET /api/v1/posts/reactions/me?postIds=...`) similar to `follow-status` batch (Epic 3 retro) would reduce N+1 calls.

### `CommentSection` Refetch-on-Mutate Pattern

After adding or deleting a comment, `CommentSection` resets all state and refetches from scratch (`setHasFetched(false) + setComments([])`). This is simple but wasteful for large comment lists. An optimistic local insert would be more efficient but adds complexity — acceptable for MVP.

### `CommentSection` React Query Key

The query key is `["post-comments", postId]`. Invalidate this when:

- Adding a new comment (after success)
- Deleting a comment (via `deleteCommentMutation.onSuccess`)

Do NOT invalidate the main feed query `["feed", sort, filter]` on comment/reaction actions — the feed data is stale after ~30s and these events don't need immediate refetch of the entire feed.

### `FeedItem` is Already `"use client"` — No SSR Concern

`FeedItem` already uses `useState`, `useRef` (Story 4.1). Adding `ReactionBar`, `CommentSection`, `ShareDialog` (all `"use client"`) is fine. No `dynamic(() => import(...), { ssr: false })` needed.

### Test: FeedItem Now Has Required Props

All existing `FeedItem.test.tsx` tests need to be updated to pass the new required props `currentUserId`, `sort`, `filter`. The simplest fix is a helper:

```ts
function renderPost(overrides: Partial<FeedPost> = {}) {
  return render(
    <FeedItem post={makePost(overrides)} currentUserId="user-1" sort="chronological" filter="all" />
  );
}
```

Replace all inline `render(<FeedItem post={makePost()} />)` calls with `renderPost()`.

### `CommentSection` React Query Cascade Warning

`CommentSection` uses `useQuery` from TanStack Query. Any test file that renders a component **containing** `CommentSection` (directly or transitively) needs a `QueryClientProvider` wrapper in the test setup. Since `FeedItem.test.tsx` mocks `CommentSection`, this cascade is blocked at the mock boundary. But if future tests render `FeedItem` without mocking its children, `QueryClientProvider` will be needed.

### ShareDialog Conversation List

`ShareDialog` calls `GET /api/v1/conversations?limit=20` to list conversations for the share-to-DM feature. This uses the existing conversations REST endpoint (Story 2.2). The response shape (from `getUserConversations` in `chat-conversations.ts`) is:

```json
{
  "data": {
    "conversations": [
      { "id": "...", "type": "direct", "otherMember": { "id": "...", "displayName": "Ada", "photoUrl": null }, ... },
      { "id": "...", "type": "group", "groupName": "Group Name", ... }
    ],
    "meta": { "cursor": "...", "hasMore": false }
  }
}
```

Direct conversations have `otherMember.displayName`. Group conversations have `groupName`. The `ConversationPicker` maps by `type`.

### Mock Pattern Reminders

- **`mockReset()` not `clearAllMocks()`**: Any test using `mockResolvedValueOnce` sequences.
- **Explicit factory mocks for DB query files**: `vi.mock("@/db/queries/post-interactions", () => ({ fn: vi.fn() }))` — NEVER bare auto-mock.
- **`vi.mock("server-only", () => ({}))`**: Required in all `@vitest-environment node` tests importing service files.
- **Tiptap is NOT used in Story 4.3**: `ReactionBar`, `CommentSection`, `CommentItem`, `ShareDialog` are plain React — no Tiptap mocks needed for these components.
- **Dialog mock**: In jsdom, Dialog CSS (`md:hidden` etc.) doesn't apply. ShareDialog tests should mock `@/components/ui/dialog` to render a simple div when `open=true`, null when `open=false` (same pattern as PostComposer.test.tsx).
- **`useTransition` mock**: Same pattern as Story 4.2 for sync testing of transition-wrapped handlers.

### Project Structure Notes

**New files (Story 4.3):**

- `src/db/migrations/0020_post_interactions.sql`
- `src/db/schema/post-interactions.ts`
- `src/db/queries/post-interactions.ts`
- `src/db/queries/post-interactions.test.ts`
- `src/services/post-interaction-service.ts`
- `src/services/post-interaction-service.test.ts`
- `src/features/feed/actions/react-to-post.ts`
- `src/features/feed/actions/react-to-post.test.ts`
- `src/features/feed/actions/add-comment.ts`
- `src/features/feed/actions/add-comment.test.ts`
- `src/features/feed/actions/share-post.ts`
- `src/features/feed/actions/share-post.test.ts`
- `src/app/api/v1/posts/[postId]/comments/route.ts`
- `src/app/api/v1/posts/[postId]/comments/route.test.ts`
- `src/app/api/v1/posts/[postId]/comments/[commentId]/route.ts`
- `src/app/api/v1/posts/[postId]/comments/[commentId]/route.test.ts`
- `src/app/api/v1/posts/[postId]/reactions/me/route.ts`
- `src/app/api/v1/posts/[postId]/reactions/me/route.test.ts`
- `src/features/feed/components/ReactionBar.tsx`
- `src/features/feed/components/ReactionBar.test.tsx`
- `src/features/feed/components/CommentSection.tsx`
- `src/features/feed/components/CommentSection.test.tsx`
- `src/features/feed/components/CommentItem.tsx`
- `src/features/feed/components/CommentItem.test.tsx`
- `src/features/feed/components/ShareDialog.tsx`
- `src/features/feed/components/ShareDialog.test.tsx`

**Modified files:**

- `src/db/schema/community-posts.ts` — add `originalPostId` column
- `src/db/index.ts` — register `postInteractionsSchema`
- `src/db/queries/posts.ts` — add `originalPostId` to `CreatePostData` + `insertPost`
- `src/db/queries/posts.test.ts` — add `originalPostId` test
- `src/db/queries/feed.ts` — add `originalPostId` to `FeedPost` + select/map in both page fns
- `src/services/rate-limiter.ts` — add 6 new presets
- `src/features/feed/components/FeedItem.tsx` — replace static bar with interactive components; add props
- `src/features/feed/components/FeedItem.test.tsx` — update for new props + add new tests
- `src/features/feed/components/FeedList.tsx` — add `currentUserId` prop; pass to `FeedItem`
- `src/features/feed/components/FeedList.test.tsx` — update mocks + add tests
- `src/features/feed/index.ts` — export 4 new components
- `src/app/[locale]/(app)/feed/page.tsx` — pass `currentUserId` to `FeedList`
- `src/app/[locale]/(app)/feed/page.test.tsx` — add `currentUserId` prop test
- `messages/en.json` — add `Feed.reactions.*`, `Feed.comments.*`, `Feed.share.*`
- `messages/ig.json` — add Igbo translations
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update status

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 4, Story 4.3, lines ~1822–1853]
- [Source: `_bmad-output/planning-artifacts/epics.md` — FR52: "Members can like, react to, comment on, and share posts within the platform"]
- [Source: `src/db/schema/community-posts.ts` — existing `likeCount`, `commentCount`, `shareCount` columns (denormalized counters); `postCategoryEnum` pattern for enum creation]
- [Source: `src/db/queries/feed.ts` — `FeedPost` interface; `originalPostId` addition follows same pattern as `category` added in Story 4.2]
- [Source: `src/db/queries/posts.ts` — `insertPost` pattern; `CreatePostData` interface to extend with `originalPostId`]
- [Source: `src/services/post-interaction-service.ts` vs `src/services/post-service.ts` — service layer pattern: `import "server-only"`, EventBus try/catch, delegate to query layer]
- [Source: `src/features/feed/components/FeedItem.tsx` — existing component structure; engagement bar at line 171 is the replacement target]
- [Source: `src/features/feed/actions/create-post.ts` — Server Action pattern: `"use server"`, `zod/v4`, `parsed.error.issues[0]`, auth via `requireAuthenticatedSession`]
- [Source: `src/app/api/v1/members/[userId]/follow/route.ts` — route pattern: `withApiHandler`, `requireAuthenticatedSession`, `ApiError`, URL extraction with `.at(-2)`]
- [Source: `src/app/api/v1/conversations/[conversationId]/messages/[messageId]/reactions/route.ts` — reaction route pattern with explicit URL index extraction]
- [Source: `src/services/rate-limiter.ts` — `RATE_LIMIT_PRESETS` — add after `POST_CREATE` (line 51)]
- [Source: `src/types/events.ts` — `PostReactedEvent`, `PostCommentedEvent` already defined at lines 29-39; `post.reacted` and `post.commented` in EventName and EventMap]
- [Source: `_bmad-output/implementation-artifacts/4-2-post-creation-rich-media.md` — Tiptap mock pattern, Dialog mock-to-null pattern, `useTransition` mock]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — Optimistic updates for post interactions; single-select reaction design note re: points inflation (Story 8.1)]
- [Source: `src/test/vi-patterns.ts` — `mockReset()` over `clearAllMocks()`, explicit factory mocks]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
