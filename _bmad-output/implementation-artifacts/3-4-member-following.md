# Story 3.4: Member Following

Status: done

## Story

As a member,
I want to follow other members so their posts appear in my news feed,
So that I stay connected to individuals whose content I find valuable.

## Acceptance Criteria

1. **Given** a member views another member's profile or member card
   **When** they click the "Follow" button
   **Then** the system creates a follow relationship and the button changes to "Following"
   **And** the followed member receives a notification: "[Name] started following you"
   **And** the follower's `following_count` and the followed member's `follower_count` are incremented atomically in the DB

2. **Given** a member wants to unfollow another member
   **When** they click "Following" (which shows "Unfollow" on hover/focus)
   **Then** the follow relationship is removed
   **And** the unfollow is silent — no notification is sent
   **And** the follower's `following_count` and the followed member's `follower_count` are decremented (floored at 0)

3. **Given** a member views their own profile or another member's profile
   **When** the profile page loads
   **Then** the profile displays the member's follower count and following count
   **And** "Followers" and "Following" tabs are available showing paginated lists (limit 20)
   **And** each list item shows: avatar, display name, location (city + country), and a "Follow"/"Following" toggle

4. **Given** a member views their own profile
   **When** they are on the "Followers" tab
   **Then** the list shows all members who follow them (ordered by most recent first)
   **And** they can follow back from the list (if not already following)

5. **Given** the database needs follow support
   **When** migration 0017 is applied
   **Then** the `community_member_follows` table is created with: `follower_id` (UUID FK), `following_id` (UUID FK), `created_at`; composite primary key on `(follower_id, following_id)`; index on `following_id`
   **And** `community_profiles` gains `follower_count INTEGER NOT NULL DEFAULT 0` and `following_count INTEGER NOT NULL DEFAULT 0` columns

## Tasks / Subtasks

### Task 1: DB Schema — `src/db/schema/community-connections.ts` (AC: #5)

- [x] 1.1 Create `src/db/schema/community-connections.ts`:

  ```ts
  import { pgTable, uuid, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
  import { authUsers } from "./auth-users";

  export const communityMemberFollows = pgTable(
    "community_member_follows",
    {
      followerId: uuid("follower_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      followingId: uuid("following_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.followerId, t.followingId] }),
      index("idx_community_member_follows_following_id").on(t.followingId),
      index("idx_community_member_follows_follower_id").on(t.followerId),
    ],
  );

  export type CommunityMemberFollow = typeof communityMemberFollows.$inferSelect;
  export type NewCommunityMemberFollow = typeof communityMemberFollows.$inferInsert;
  ```

- [x] 1.2 Register the new schema file in `src/db/index.ts`:

  Add after the existing platform-social import:

  ```ts
  import * as communityConnectionsSchema from "./schema/community-connections";
  ```

  And spread in the `drizzle(client, { schema: { ... } })` call:

  ```ts
  ...communityConnectionsSchema,
  ```

### Task 2: DB Schema — Update `community-profiles.ts` (AC: #5)

- [x] 2.1 Add `integer` to the import in `src/db/schema/community-profiles.ts`:

  ```ts
  import {
    pgTable,
    pgEnum,
    uuid,
    varchar,
    text,
    numeric,
    integer,
    timestamp,
    boolean,
    index,
    uniqueIndex,
  } from "drizzle-orm/pg-core";
  ```

- [x] 2.2 Add the two count columns to the `communityProfiles` table definition (after `deletedAt`, before `createdAt`):

  ```ts
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  ```

  **BREAKING TEST UPDATE:** `src/features/profiles/components/ProfileView.test.tsx` has a `baseProfile: CommunityProfile` fixture (around line 48). After this schema change, `CommunityProfile` includes `followerCount` and `followingCount`. Add these to the fixture:

  ```ts
  followerCount: 0,
  followingCount: 0,
  ```

  **WARNING:** The existing fixture has other field-name drift from the actual schema (e.g., `onboardingDisplayNameAt` vs schema's `profileCompletedAt`). Do NOT fix those — only add the two new fields. Broader fixture cleanup risks exposing the pre-existing `ProfileStep.test.tsx` failure.

### Task 3: Migration `0017_member_following.sql` (AC: #5)

- [x] 3.1 Create `src/db/migrations/0017_member_following.sql`:

  ```sql
  -- community_member_follows: tracks follower → following relationships.
  -- Composite primary key ensures uniqueness (one follow record per pair).
  -- Index on following_id supports efficient "who follows user X?" queries.
  CREATE TABLE IF NOT EXISTS community_member_follows (
    follower_id   UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    following_id  UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE INDEX IF NOT EXISTS idx_community_member_follows_following_id
    ON community_member_follows (following_id);

  CREATE INDEX IF NOT EXISTS idx_community_member_follows_follower_id
    ON community_member_follows (follower_id);

  -- Denormalized follow counts on community_profiles.
  -- Updated atomically in the same DB transaction as the follow/unfollow operation.
  -- GREATEST(..., 0) guard in application code prevents negative values on concurrent ops.
  ALTER TABLE community_profiles
    ADD COLUMN IF NOT EXISTS follower_count  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;
  ```

### Task 4: DB Queries — `src/db/queries/follows.ts` (AC: #1, #2, #3, #4)

- [x] 4.1 Create `src/db/queries/follows.ts`:

  ```ts
  // NOTE: No "server-only" — follows query patterns may be used by realtime server
  import { eq, and, desc, lt, sql } from "drizzle-orm";
  import { db } from "@/db";
  import { communityMemberFollows } from "@/db/schema/community-connections";
  import { communityProfiles } from "@/db/schema/community-profiles";
  import { authUsers } from "@/db/schema/auth-users";

  export interface FollowListMember {
    userId: string;
    displayName: string;
    photoUrl: string | null;
    locationCity: string | null;
    locationCountry: string | null;
    followedAt: string; // ISO 8601 — used as cursor
  }

  /** Follow: insert relationship + atomically increment counts in a transaction. */
  export async function followMember(followerId: string, followingId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(communityMemberFollows)
        .values({ followerId, followingId })
        .onConflictDoNothing()
        .returning();

      // Only update counts if the row was actually inserted (not a duplicate)
      if (inserted.length === 0) return;

      await tx
        .update(communityProfiles)
        .set({ followingCount: sql`${communityProfiles.followingCount} + 1` })
        .where(eq(communityProfiles.userId, followerId));

      await tx
        .update(communityProfiles)
        .set({ followerCount: sql`${communityProfiles.followerCount} + 1` })
        .where(eq(communityProfiles.userId, followingId));
    });
  }

  /** Unfollow: delete relationship + atomically decrement counts (floored at 0). */
  export async function unfollowMember(followerId: string, followingId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(communityMemberFollows)
        .where(
          and(
            eq(communityMemberFollows.followerId, followerId),
            eq(communityMemberFollows.followingId, followingId),
          ),
        )
        .returning();

      // Only update counts if a row was actually deleted
      if (deleted.length === 0) return;

      await tx
        .update(communityProfiles)
        .set({ followingCount: sql`GREATEST(${communityProfiles.followingCount} - 1, 0)` })
        .where(eq(communityProfiles.userId, followerId));

      await tx
        .update(communityProfiles)
        .set({ followerCount: sql`GREATEST(${communityProfiles.followerCount} - 1, 0)` })
        .where(eq(communityProfiles.userId, followingId));
    });
  }

  /** Check if follower is currently following following. */
  export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const [row] = await db
      .select({ followerId: communityMemberFollows.followerId })
      .from(communityMemberFollows)
      .where(
        and(
          eq(communityMemberFollows.followerId, followerId),
          eq(communityMemberFollows.followingId, followingId),
        ),
      )
      .limit(1);
    return !!row;
  }

  /**
   * List members who follow userId (ordered newest first, cursor = followedAt ISO string).
   * Cursor-based pagination: provide cursor from previous page's last item.
   */
  export async function getFollowersPage(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<FollowListMember[]> {
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const rows = await db
      .select({
        userId: communityProfiles.userId,
        displayName: communityProfiles.displayName,
        photoUrl: communityProfiles.photoUrl,
        locationCity: communityProfiles.locationCity,
        locationCountry: communityProfiles.locationCountry,
        followedAt: communityMemberFollows.createdAt,
      })
      .from(communityMemberFollows)
      .innerJoin(
        communityProfiles,
        and(
          eq(communityProfiles.userId, communityMemberFollows.followerId),
          sql`${communityProfiles.deletedAt} IS NULL`,
        ),
      )
      .where(
        cursorDate
          ? and(
              eq(communityMemberFollows.followingId, userId),
              lt(communityMemberFollows.createdAt, cursorDate),
            )
          : eq(communityMemberFollows.followingId, userId),
      )
      .orderBy(desc(communityMemberFollows.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      photoUrl: r.photoUrl,
      locationCity: r.locationCity,
      locationCountry: r.locationCountry,
      followedAt: r.followedAt.toISOString(),
    }));
  }

  /** List members that userId follows (ordered newest first, cursor = followedAt ISO string). */
  export async function getFollowingPage(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<FollowListMember[]> {
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const rows = await db
      .select({
        userId: communityProfiles.userId,
        displayName: communityProfiles.displayName,
        photoUrl: communityProfiles.photoUrl,
        locationCity: communityProfiles.locationCity,
        locationCountry: communityProfiles.locationCountry,
        followedAt: communityMemberFollows.createdAt,
      })
      .from(communityMemberFollows)
      .innerJoin(
        communityProfiles,
        and(
          eq(communityProfiles.userId, communityMemberFollows.followingId),
          sql`${communityProfiles.deletedAt} IS NULL`,
        ),
      )
      .where(
        cursorDate
          ? and(
              eq(communityMemberFollows.followerId, userId),
              lt(communityMemberFollows.createdAt, cursorDate),
            )
          : eq(communityMemberFollows.followerId, userId),
      )
      .orderBy(desc(communityMemberFollows.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      photoUrl: r.photoUrl,
      locationCity: r.locationCity,
      locationCountry: r.locationCountry,
      followedAt: r.followedAt.toISOString(),
    }));
  }
  ```

- [x] 4.2 Create `src/db/queries/follows.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("@/db");
  ```

  Tests:
  - `followMember` inserts row and increments both counts in a transaction
  - `followMember` is idempotent — duplicate call does NOT increment counts again (`onConflictDoNothing`)
  - `unfollowMember` deletes row and decrements both counts
  - `unfollowMember` is idempotent — call with non-existent follow does NOT decrement counts
  - `isFollowing` returns `true` when follow relationship exists
  - `isFollowing` returns `false` when no relationship exists
  - `getFollowersPage` returns paginated followers ordered by `createdAt DESC`
  - `getFollowersPage` respects `cursor` for next-page queries
  - `getFollowingPage` returns paginated following ordered by `createdAt DESC`

### Task 5: Follow Service — `src/services/follow-service.ts` (AC: #1, #2)

- [x] 5.1 Create `src/services/follow-service.ts`:

  ```ts
  import "server-only";
  import { followMember, unfollowMember, isFollowing } from "@/db/queries/follows";
  import { eventBus } from "@/services/event-bus";

  export async function followUser(followerId: string, followingId: string): Promise<void> {
    await followMember(followerId, followingId);
    eventBus.emit("member.followed", {
      followerId,
      followedId: followingId,
      timestamp: new Date().toISOString(),
    });
  }

  export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
    await unfollowMember(followerId, followingId);
    eventBus.emit("member.unfollowed", {
      followerId,
      followedId: followingId,
      timestamp: new Date().toISOString(),
    });
  }

  export async function isUserFollowing(followerId: string, followingId: string): Promise<boolean> {
    return isFollowing(followerId, followingId);
  }
  ```

  **Note:** `notification-service.ts` already has an `eventBus.on("member.followed", ...)` listener that delivers the "[Name] started following you" notification. The `"member.unfollowed"` event is emitted but currently has no listener — this is correct (unfollow is silent).

- [x] 5.2 Create `src/services/follow-service.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/db/queries/follows");
  vi.mock("@/services/event-bus", () => ({ eventBus: { emit: vi.fn() } }));
  ```

  Tests:
  - `followUser` calls `followMember` and emits `"member.followed"` with correct `followerId`/`followedId`
  - `unfollowUser` calls `unfollowMember` and emits `"member.unfollowed"` (no notification event)
  - `isUserFollowing` delegates to `isFollowing`

### Task 6: Rate Limiter Presets (AC: #1, #2)

- [x] 6.1 Add to `src/services/rate-limiter.ts` (after `SUGGESTION_DISMISS` entry):

  ```ts
  // Story 3.4 additions
  MEMBER_FOLLOW: { maxRequests: 30, windowMs: 60_000 },    // 30/min per userId
  FOLLOW_LIST: { maxRequests: 60, windowMs: 60_000 },      // 60/min per userId
  ```

### Task 7: i18n Translations (AC: all)

**CRITICAL — Add ALL keys BEFORE any component work (Tasks 10–12)**

- [x] 7.1 Add to `messages/en.json` under the existing `"Profile"` key:

  ```json
  "Profile": {
    // ...existing keys...
    "follow": "Follow",
    "following": "Following",
    "unfollow": "Unfollow",
    "followerCount": "{count, plural, =0 {0 followers} =1 {1 follower} other {# followers}}",
    "followingCount": "{count, plural, =0 {0 following} =1 {1 following} other {# following}}",
    "followersTab": "Followers",
    "followingTab": "Following",
    "aboutTab": "About",
    "followAriaLabel": "Follow {name}",
    "unfollowAriaLabel": "Unfollow {name}",
    "followingAriaLabel": "{name} — Following. Click to unfollow.",
    "noFollowers": "No followers yet.",
    "noFollowing": "Not following anyone yet.",
    "followListLoadMore": "Load more"
  }
  ```

- [x] 7.2 Add corresponding Igbo keys to `messages/ig.json` under `"Profile"`:

  ```json
  "follow": "Soro ya",
  "following": "Na-esozo",
  "unfollow": "Kwụsị iso ya",
  "followerCount": "{count, plural, =0 {0 ndị na-eso} =1 {Otu onye na-eso} other {# ndị na-eso}}",
  "followingCount": "{count, plural, =0 {0 na-esozo} =1 {1 na-esozo} other {# na-esozo}}",
  "followersTab": "Ndị na-eso",
  "followingTab": "Na-esozo",
  "aboutTab": "Maka",
  "followAriaLabel": "Soro {name}",
  "unfollowAriaLabel": "Kwụsị iso {name}",
  "followingAriaLabel": "{name} — Na-esozo. Pịa ka i kwụsị iso.",
  "noFollowers": "Enweghị onye na-eso ya ka ugbu a.",
  "noFollowing": "Asoghị onye ọ bụla ka ugbu a.",
  "followListLoadMore": "Bulite ndị ọzọ"
  ```

- [x] 7.3 Add notification i18n keys to `messages/en.json` under `"notifications"` (if not present):

  ```json
  "notifications": {
    // ...existing keys...
    "new_follower": {
      "title": "New follower",
      "body": "{name} started following you"
    }
  }
  ```

  And the Igbo equivalent in `messages/ig.json`:

  ```json
  "new_follower": {
    "title": "Onye ọhụrụ na-eso gị",
    "body": "{name} bidoro iso gị"
  }
  ```

  **Note:** `notification-service.ts` stores `title: "notifications.new_follower.title"` and `body: "notifications.new_follower.body"` as raw string keys in the DB. Currently `NotificationItem.tsx` renders these directly without i18n resolution (pre-existing architectural gap — same for `member_approved` notifications). Add the keys anyway so they're available when notification i18n is implemented. These keys must exist in both locale files.

### Task 8: API Route — Follow/Unfollow/Status (AC: #1, #2)

- [x] 8.1 Create `src/app/api/v1/members/[userId]/follow/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { followUser, unfollowUser, isUserFollowing } from "@/services/follow-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  // POST   /api/v1/members/[userId]/follow  → follow targetUserId
  // DELETE /api/v1/members/[userId]/follow  → unfollow targetUserId
  // GET    /api/v1/members/[userId]/follow  → { isFollowing: boolean }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extractTargetUserId(request: Request): string {
    // Path: /api/v1/members/{targetUserId}/follow
    // .at(-1) = "follow", .at(-2) = targetUserId
    const targetUserId = new URL(request.url).pathname.split("/").at(-2) ?? "";
    if (!uuidRegex.test(targetUserId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
    }
    return targetUserId;
  }

  const rateLimitConfig = {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `member-follow:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.MEMBER_FOLLOW,
  };

  const postHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const targetUserId = extractTargetUserId(request);

    if (targetUserId === userId) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Cannot follow yourself" });
    }

    await followUser(userId, targetUserId);
    return successResponse({ ok: true });
  };

  const deleteHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const targetUserId = extractTargetUserId(request);
    await unfollowUser(userId, targetUserId);
    return successResponse({ ok: true });
  };

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const targetUserId = extractTargetUserId(request);
    const following = await isUserFollowing(userId, targetUserId);
    return successResponse({ isFollowing: following });
  };

  export const POST = withApiHandler(postHandler, { rateLimit: rateLimitConfig });
  export const DELETE = withApiHandler(deleteHandler, { rateLimit: rateLimitConfig });
  export const GET = withApiHandler(getHandler, { rateLimit: rateLimitConfig });
  ```

  **Notes:**
  - `POST` and `DELETE` require `Origin` header in route tests (CSRF validation in `withApiHandler`)
  - `GET` is CSRF-exempt (no `Origin` header needed in route tests)
  - Same `extractTargetUserId` pattern as block/mute routes — `.at(-2)` for the segment before "follow"
  - Double `requireAuthenticatedSession()` call (rate-limit `key` + handler) — established project pattern, do NOT deduplicate

- [x] 8.2 Create `src/app/api/v1/members/[userId]/follow/route.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/follow-service");
  ```

  Tests:
  - `POST` returns 200 `{ ok: true }` on success
  - `POST` returns 401 when not authenticated
  - `POST` returns 400 when following yourself (`userId === targetUserId`)
  - `POST` returns 400 when targetUserId is not a valid UUID
  - `POST` requires `Origin` header (CSRF) — include `{ headers: { Origin: "http://localhost:3000", Host: "localhost:3000" } }`
  - `DELETE` returns 200 `{ ok: true }` on unfollow
  - `DELETE` requires `Origin` header (CSRF)
  - `GET` returns 200 `{ isFollowing: true/false }`
  - `GET` does NOT require `Origin` header

### Task 9: API Routes — Followers and Following Lists (AC: #3, #4)

- [x] 9.1 Create `src/app/api/v1/members/[userId]/followers/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { ApiError } from "@/lib/api-error";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getFollowersPage } from "@/db/queries/follows";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const getHandler = async (request: Request) => {
    await requireAuthenticatedSession();
    const url = new URL(request.url);
    const targetUserId = url.pathname.split("/").at(-2) ?? "";
    if (!uuidRegex.test(targetUserId)) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
    }
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
    const members = await getFollowersPage(targetUserId, cursor, limit);
    const nextCursor = members.length === limit ? (members.at(-1)?.followedAt ?? null) : null;
    return successResponse({ members, nextCursor });
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `follow-list:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.FOLLOW_LIST,
    },
  });
  ```

  **Note:** `targetUserId` is `.at(-2)` here too — path is `/api/v1/members/{userId}/followers`.

- [x] 9.2 Create `src/app/api/v1/members/[userId]/followers/route.test.ts` (`@vitest-environment node`):

  Tests:
  - Returns 200 `{ members: [...], nextCursor: null }` when < limit results
  - Returns `nextCursor` (ISO string) when exactly `limit` results returned
  - Returns 401 when not authenticated
  - Returns 400 when userId path segment is invalid UUID
  - Passes `cursor` param to `getFollowersPage`

- [x] 9.3 Create `src/app/api/v1/members/[userId]/following/route.ts` (same pattern as followers but calls `getFollowingPage` and `targetUserId` is `.at(-2)` from path `/api/v1/members/{userId}/following`):

  ```ts
  // Same structure as followers/route.ts but:
  // - Calls: getFollowingPage(targetUserId, cursor, limit)
  // - Rate limit key: `follow-list:${userId}` (same bucket — both are reads)
  ```

- [x] 9.4 Create `src/app/api/v1/members/[userId]/following/route.test.ts` (same test cases as 9.2 but for following endpoint)

### Task 10: `useFollow` Hook (AC: #1, #2, #3)

- [x] 10.1 Create `src/features/profiles/hooks/use-follow.ts`:

  ```ts
  "use client";

  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

  export function useFollow(targetUserId: string) {
    const queryClient = useQueryClient();

    const statusQuery = useQuery<{ isFollowing: boolean }>({
      queryKey: ["follow-status", targetUserId],
      queryFn: async () => {
        const res = await fetch(`/api/v1/members/${targetUserId}/follow`);
        if (!res.ok) throw new Error("Failed to get follow status");
        const json = (await res.json()) as { data: { isFollowing: boolean } };
        return json.data;
      },
      staleTime: 60_000, // 1 min — status can be slightly stale
    });

    const followMutation = useMutation({
      mutationFn: async () => {
        const res = await fetch(`/api/v1/members/${targetUserId}/follow`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to follow member");
      },
      onMutate: async () => {
        // Optimistic update
        await queryClient.cancelQueries({ queryKey: ["follow-status", targetUserId] });
        const previous = queryClient.getQueryData<{ isFollowing: boolean }>([
          "follow-status",
          targetUserId,
        ]);
        queryClient.setQueryData(["follow-status", targetUserId], { isFollowing: true });
        return { previous };
      },
      onError: (_err, _vars, context) => {
        // Rollback on error
        if (context?.previous !== undefined) {
          queryClient.setQueryData(["follow-status", targetUserId], context.previous);
        }
      },
    });

    const unfollowMutation = useMutation({
      mutationFn: async () => {
        const res = await fetch(`/api/v1/members/${targetUserId}/follow`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to unfollow member");
      },
      onMutate: async () => {
        // Optimistic update
        await queryClient.cancelQueries({ queryKey: ["follow-status", targetUserId] });
        const previous = queryClient.getQueryData<{ isFollowing: boolean }>([
          "follow-status",
          targetUserId,
        ]);
        queryClient.setQueryData(["follow-status", targetUserId], { isFollowing: false });
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous !== undefined) {
          queryClient.setQueryData(["follow-status", targetUserId], context.previous);
        }
      },
    });

    const isFollowing = statusQuery.data?.isFollowing ?? false;

    return {
      isFollowing,
      isLoading: statusQuery.isLoading,
      follow: followMutation.mutate,
      unfollow: unfollowMutation.mutate,
      isPending: followMutation.isPending || unfollowMutation.isPending,
    };
  }
  ```

  **Notes:**
  - Optimistic updates use `onMutate`/`onError` rollback pattern (from code review of Story 3.3 — H1 fix)
  - `staleTime: 60_000` (1 min) — follow status doesn't need to be real-time fresh
  - The hook does not handle the self-follow guard — that's enforced at the API level

- [x] 10.2 Create `src/features/profiles/hooks/use-follow.test.ts` (`@vitest-environment jsdom`):

  Use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` at the top of each test that awaits React Query data. This helper calls `vi.useRealTimers()` — do NOT mix with `vi.useFakeTimers()` in the same test. All tests in this file should use real timers.

  Tests:
  - `isFollowing` is `false` by default (status query returns `{ isFollowing: false }`)
  - `isFollowing` is `true` when API returns `{ isFollowing: true }`
  - `follow()` sends `POST` to correct URL
  - `unfollow()` sends `DELETE` to correct URL
  - Optimistic update: `isFollowing` becomes `true` immediately on `follow()` before response
  - Rollback: `isFollowing` reverts on `follow()` error
  - `isPending` is `true` during mutation

### Task 11: `FollowButton` Component (AC: #1, #2, #3)

- [x] 11.1 Create `src/features/profiles/components/FollowButton.tsx`:

  ```tsx
  "use client";

  import { useTranslations } from "next-intl";
  import { Button } from "@/components/ui/button";
  import { useFollow } from "../hooks/use-follow";

  interface FollowButtonProps {
    targetUserId: string;
    targetName: string; // For aria-label
    size?: "sm" | "default";
  }

  export function FollowButton({ targetUserId, targetName, size = "default" }: FollowButtonProps) {
    const t = useTranslations("Profile");
    const { isFollowing, isLoading, follow, unfollow, isPending } = useFollow(targetUserId);

    if (isLoading) {
      return (
        <Button variant="outline" size={size} disabled aria-busy="true">
          {t("follow")}
        </Button>
      );
    }

    if (isFollowing) {
      return (
        <Button
          variant="outline"
          size={size}
          onClick={() => unfollow()}
          disabled={isPending}
          aria-label={t("unfollowAriaLabel", { name: targetName })}
          className="group"
        >
          {/* Show "Following" normally, "Unfollow" on hover/focus */}
          <span className="group-hover:hidden group-focus:hidden">{t("following")}</span>
          <span className="hidden group-hover:inline group-focus:inline">{t("unfollow")}</span>
        </Button>
      );
    }

    return (
      <Button
        variant="default"
        size={size}
        onClick={() => follow()}
        disabled={isPending}
        aria-label={t("followAriaLabel", { name: targetName })}
      >
        {t("follow")}
      </Button>
    );
  }
  ```

  **Accessibility notes:**
  - `aria-busy="true"` during loading state
  - Explicit `aria-label` with name context for screen readers
  - Hover/focus toggle uses Tailwind `group` utility — no JS needed for the text swap

- [x] 11.2 Create `src/features/profiles/components/FollowButton.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../hooks/use-follow");
  ```

  Tests:
  - Renders loading state (disabled button) when `isLoading` is `true`
  - Renders "Follow" button when `isFollowing` is `false`
  - Renders "Following" button (with "Unfollow" accessible label) when `isFollowing` is `true`
  - Clicking "Follow" calls `follow()`
  - Clicking "Following" button calls `unfollow()`
  - Button is disabled when `isPending` is `true`
  - `aria-label` contains target member's name

### Task 12: `FollowList` Component (AC: #3, #4)

- [x] 12.1 Create `src/features/profiles/components/FollowList.tsx`:

  ```tsx
  "use client";

  import { useQuery } from "@tanstack/react-query";
  import { useState, useEffect, useRef } from "react";
  import { useTranslations } from "next-intl";
  import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
  import { Button } from "@/components/ui/button";
  import { FollowButton } from "./FollowButton";
  import type { FollowListMember } from "@/db/queries/follows";

  interface FollowListProps {
    userId: string; // Whose followers/following to load
    type: "followers" | "following";
    viewerUserId: string; // Logged-in viewer — to hide FollowButton on own entries
  }

  export function FollowList({ userId, type, viewerUserId }: FollowListProps) {
    const t = useTranslations("Profile");
    const [cursor, setCursor] = useState<string | null>(null);
    const [allMembers, setAllMembers] = useState<FollowListMember[]>([]);
    // Ref tracks whether the current page is a "load more" (cursor != null) to determine
    // whether to append or replace allMembers
    const isLoadMoreRef = useRef(false);

    const { data, isLoading, isFetching } = useQuery<{
      members: FollowListMember[];
      nextCursor: string | null;
    }>({
      queryKey: ["follow-list", userId, type, cursor],
      queryFn: async () => {
        const url = new URL(`/api/v1/members/${userId}/${type}`, window.location.origin);
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("Failed to load list");
        const json = (await res.json()) as {
          data: { members: FollowListMember[]; nextCursor: string | null };
        };
        return json.data;
      },
    });

    // React Query v5 removed onSuccess from useQuery — use useEffect instead
    useEffect(() => {
      if (!data) return;
      if (isLoadMoreRef.current) {
        setAllMembers((prev) => [...prev, ...data.members]);
        isLoadMoreRef.current = false;
      } else {
        setAllMembers(data.members);
      }
    }, [data]);

    const handleLoadMore = () => {
      if (data?.nextCursor) {
        isLoadMoreRef.current = true;
        setCursor(data.nextCursor);
      }
    };

    if (isLoading && allMembers.length === 0) {
      return <p className="text-sm text-muted-foreground py-4">Loading...</p>;
    }

    if (!isLoading && allMembers.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-4">
          {type === "followers" ? t("noFollowers") : t("noFollowing")}
        </p>
      );
    }

    return (
      <div>
        <ul className="divide-y">
          {allMembers.map((member) => {
            const initials = member.displayName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            const location = [member.locationCity, member.locationCountry]
              .filter(Boolean)
              .join(", ");

            return (
              <li key={member.userId} className="flex items-center gap-3 py-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.photoUrl ?? undefined} alt={member.displayName} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  {location && <p className="truncate text-xs text-muted-foreground">{location}</p>}
                </div>
                {member.userId !== viewerUserId && (
                  <FollowButton
                    targetUserId={member.userId}
                    targetName={member.displayName}
                    size="sm"
                  />
                )}
              </li>
            );
          })}
        </ul>
        {data?.nextCursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isFetching}
            className="mt-3 w-full"
          >
            {isFetching ? "Loading..." : t("followListLoadMore")}
          </Button>
        )}
      </div>
    );
  }
  ```

  **Notes:**
  - Does NOT show `FollowButton` for the viewer's own entry in the list (`member.userId !== viewerUserId`)
  - **React Query v5:** `onSuccess` was removed from `useQuery` in v5. Use `useEffect` watching `data` changes instead. The `isLoadMoreRef` ref distinguishes between initial/refresh loads (replace list) and "load more" (append to list) — prevents the ref from being stale in the `useEffect` closure.
  - `cursor` is the `followedAt` ISO string from the previous page's last item — passed as `?cursor=` query param
  - The `import type { FollowListMember }` from `@/db/queries/follows` is a type-only import — safe because TypeScript erases type imports at compile time. Even if `follows.ts` later gets `import "server-only"`, this type import will still work. Do NOT change to a re-export pattern.
  - **Background refetch note:** React Query returns a new `data` reference on every successful fetch. The `useEffect([data])` will fire on refetches and replace the list. For MVP this is acceptable. If list flickering occurs on background refetches, consider adding `staleTime: Infinity` to prevent automatic refetches.

- [x] 12.2 Create `src/features/profiles/components/FollowList.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("./FollowButton", () => ({
    FollowButton: ({ targetUserId }: { targetUserId: string }) => (
      <button data-testid={`follow-btn-${targetUserId}`}>Follow</button>
    ),
  }));
  ```

  Use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` at the top of each test that awaits data (required for React Query `waitFor` — same pattern as Stories 3.3 and 2.7).

  Tests:
  - Renders member names and locations from API response (use `waitFor`)
  - Shows `noFollowers` text when followers list is empty
  - Shows `noFollowing` text when following list is empty
  - Does NOT render `FollowButton` for viewer's own entry (`viewerUserId === member.userId`)
  - Renders `FollowButton` for other members
  - "Load more" button appears when `nextCursor` is non-null
  - "Load more" button is absent when `nextCursor` is null

### Task 13: Update `ProfileView` — Follow Button, Counts, and Tabs (AC: #1, #2, #3, #4)

- [x] 13.1 Update `src/features/profiles/components/ProfileView.tsx`:

  **Note:** The existing `MessageButton` sub-component uses `useSession()` for self-detection (line 29). Do NOT refactor it to use `viewerUserId` — that's out of scope. The new `FollowButton` and tab logic use the explicit `viewerUserId` prop instead.

  Add `viewerUserId: string` prop to `Props` (passed from server component):

  ```ts
  interface Props {
    profile: CommunityProfile;
    socialLinks: CommunitySocialLink[];
    viewerUserId: string; // ADD — viewer's own userId for self-detection
  }
  ```

  Add tab state and new imports:

  ```ts
  import { useState } from "react";
  import { FollowButton } from "./FollowButton";
  import { FollowList } from "./FollowList";
  ```

  Changes to `ProfileView` function body:

  ```tsx
  export function ProfileView({ profile, socialLinks, viewerUserId }: Props) {
    const t = useTranslations("Profile");
    const isOwnProfile = viewerUserId === profile.userId;
    const [activeTab, setActiveTab] = useState<"about" | "followers" | "following">("about");

    return (
      <div className="space-y-6">
        {/* Header: Avatar + name + follow button */}
        <div className="flex items-center gap-4">
          {/* existing avatar block */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
            {/* Follow counts */}
            <div className="flex gap-3 text-sm text-muted-foreground mt-1">
              <button
                type="button"
                onClick={() => setActiveTab("followers")}
                className="hover:underline"
              >
                {t("followerCount", { count: profile.followerCount })}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("following")}
                className="hover:underline"
              >
                {t("followingCount", { count: profile.followingCount })}
              </button>
            </div>
          </div>
          {/* FollowButton — only for other members' profiles */}
          {!isOwnProfile && (
            <div className="ml-auto">
              <FollowButton targetUserId={profile.userId} targetName={profile.displayName} />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex gap-4 border-b">
          {(["about", "followers", "following"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "about"
                ? t("aboutTab")
                : tab === "followers"
                  ? t("followersTab")
                  : t("followingTab")}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {activeTab === "about" && (
          <div role="tabpanel" className="space-y-6">
            {/* Move ALL existing content from lines 82-172 of the current file here:
                bio, location, interests, culturalConnections, languages, socialLinks, MessageButton.
                The avatar+name block (lines 62-80) stays ABOVE the tabs. */}
          </div>
        )}

        {activeTab === "followers" && (
          <div role="tabpanel">
            <FollowList userId={profile.userId} type="followers" viewerUserId={viewerUserId} />
          </div>
        )}

        {activeTab === "following" && (
          <div role="tabpanel">
            <FollowList userId={profile.userId} type="following" viewerUserId={viewerUserId} />
          </div>
        )}
      </div>
    );
  }
  ```

- [x] 13.2 Update `src/features/profiles/components/ProfileView.test.tsx`:
  - Add `followerCount: 0, followingCount: 0` to `baseProfile` fixture
  - Add mock for `FollowButton`: `vi.mock("./FollowButton", () => ({ FollowButton: () => <div data-testid="follow-button" /> }))`
  - Add mock for `FollowList`: `vi.mock("./FollowList", () => ({ FollowList: () => <div data-testid="follow-list" /> }))`
  - Update `ProfileView` render calls to pass `viewerUserId="current-user-id"` (matching existing session mock)
  - Add tests:
    - "Follow" button is NOT rendered for own profile (`viewerUserId === profile.userId`)
    - "Follow" button IS rendered for other profiles
    - Follower count and following count are visible in header
    - Clicking follower count switches to "Followers" tab
    - Clicking following count switches to "Following" tab
    - "About", "Followers", "Following" tab buttons are rendered

### Task 14: Update Profile Page — Pass `viewerUserId` (AC: #1, #2)

- [x] 14.1 Update `src/app/[locale]/(app)/profiles/[userId]/page.tsx`:

  Pass `viewerUserId` to `ProfileView`:

  ```tsx
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <ProfileView
        profile={profile}
        socialLinks={socialLinks}
        viewerUserId={session.user.id}  {/* ADD */}
      />
    </main>
  );
  ```

### Task 15: Update `MemberCard` — Optional Follow Button (AC: #1)

- [x] 15.1 Update `src/features/discover/components/MemberCard.tsx`:

  Add an optional `showFollowButton?: boolean` prop (defaults to `true`):

  ```tsx
  import { FollowButton } from "@/features/profiles/components/FollowButton";

  interface MemberCardProps {
    member: MemberCardData;
    viewerInterests: string[];
    onMessage?: (userId: string) => void;
    showFollowButton?: boolean; // ADD — default true
  }

  // Inside the card JSX, add FollowButton alongside the existing Message button:
  {
    showFollowButton !== false && (
      <FollowButton targetUserId={member.userId} targetName={member.displayName} size="sm" />
    );
  }
  ```

  **Notes:**
  - `showFollowButton` defaults to `true` — existing callers don't need to change unless they want to hide it
  - FollowButton is self-contained (fetches status via hook), so no follow state needs to be passed from parent

- [x] 15.2 Update `src/features/discover/components/MemberCard.test.tsx`:

  The `vi.mock("@/features/profiles/components/FollowButton", ...)` must appear at the **top** of the test file, before any component import. This prevents transitive import of `useFollow` → `@tanstack/react-query` which would fail in the test environment without a QueryClientProvider.
  - Add mock: `vi.mock("@/features/profiles/components/FollowButton", () => ({ FollowButton: () => <button data-testid="follow-button">Follow</button> }))`
  - Add test: renders `FollowButton` by default
  - Add test: does not render `FollowButton` when `showFollowButton={false}`

### Task 16: Barrel Export Update + Sprint Status

- [x] 16.1 Update `src/features/profiles/index.ts` — add:

  ```ts
  export { FollowButton } from "./components/FollowButton";
  export { FollowList } from "./components/FollowList";
  export { useFollow } from "./hooks/use-follow";
  export type { FollowListMember } from "@/db/queries/follows";
  ```

- [x] 16.2 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Change `3-4-member-following: backlog` → `3-4-member-following: ready-for-dev`

## Dev Notes

### What Stories 3.1, 3.2, 3.3 Built — Do Not Reinvent

- `searchMembersInDirectory()`, `searchMembersWithGeoFallback()` in `geo-search.ts` — untouched
- `getMemberSuggestions()`, `dismissSuggestion()` in `suggestion-service.ts` — untouched
- `GeoFallbackIndicator`, `MemberGrid`, `DiscoverContent`, `PeopleNearYouWidget` — untouched
- All existing `GET /api/v1/discover/*` routes — untouched
- `MemberCardData` type in `src/services/geo-search.ts` — import from there, do NOT redefine

### Atomic Count Updates — Why Transaction + `GREATEST(..., 0)`

Denormalized counts must be updated atomically with the follow/unfollow operation to prevent drift. Using `db.transaction()` ensures:

- If the INSERT fails (duplicate), the count is NOT incremented (thanks to `onConflictDoNothing().returning()` check)
- If the DELETE finds no row, the count is NOT decremented

The `GREATEST(..., 0)` guard in the decrement SQL prevents counts from going negative in the rare case of concurrent operations that race past the `returning()` check. This is a safety floor only — normal operation should never hit it.

### EventMap — Events Already Defined

`MemberFollowedEvent` and `MemberUnfollowedEvent` are ALREADY defined in `src/types/events.ts`:

```ts
export interface MemberFollowedEvent extends BaseEvent {
  followerId: string;
  followedId: string;
}
export interface MemberUnfollowedEvent extends BaseEvent {
  followerId: string;
  followedId: string;
}
```

Both `"member.followed"` and `"member.unfollowed"` are ALREADY in the `EventName` union type. Do NOT modify `src/types/events.ts`.

### Notification Service — Already Handles `member.followed`

`src/services/notification-service.ts` ALREADY has:

```ts
eventBus.on("member.followed", async (payload: MemberFollowedEvent) => {
  await deliverNotification({
    userId: payload.followedId,
    actorId: payload.followerId,
    type: "system",
    title: "notifications.new_follower.title",
    body: "notifications.new_follower.body",
    link: "/profile",
  });
});
```

The `follow-service.ts` just needs to emit the event. The notification delivery is already handled. Only add the i18n keys — do NOT modify `notification-service.ts`.

**Note on i18n key resolution:** The title/body are stored as raw key strings in the DB (e.g., `"notifications.new_follower.title"`). Currently `NotificationItem.tsx` renders them as-is without `useTranslations()` resolution — this is a pre-existing gap affecting all notification types. The i18n keys are still needed for future resolution.

### Block/Mute Route as Template for Follow Route

The follow API route at `/api/v1/members/[userId]/follow/route.ts` is structurally identical to the block route at `/api/v1/members/[userId]/block/route.ts`. Key pattern:

- `extractTargetUserId(request)`: `.at(-2)` from path split (segment before the action word)
- `rateLimitConfig.key`: async import of `requireAuthenticatedSession` for rate limit key
- Double `requireAuthenticatedSession()` call: in rate limit key AND in handler body

### Schema File vs. Query File Naming

Schema file = `community-connections.ts` (broader scope for future connection types like endorsements, mentoring). Query file = `follows.ts` (specific to follow operations). These names are intentionally different. The schema import in `src/db/index.ts` is `communityConnectionsSchema` — the table inside it is `communityMemberFollows`.

### `community-connections.ts` Schema File — Must Register in `src/db/index.ts`

The drizzle config uses `./src/db/schema/*` glob (auto-discovers for drizzle-kit). However, `src/db/index.ts` manually imports and spreads each schema file into the drizzle instance. A new schema file is invisible to the runtime drizzle client until added to `src/db/index.ts`. Add:

```ts
import * as communityConnectionsSchema from "./schema/community-connections";
// ...and in drizzle() call:
...communityConnectionsSchema,
```

### CSRF Rules — Which Routes Need Origin Header

All mutation methods (`POST`, `PATCH`, `PUT`, `DELETE`) are validated by `withApiHandler`. Route tests MUST include:

```ts
headers: { Origin: "http://localhost:3000", Host: "localhost:3000" }
```

Routes exempt (GET): followers list, following list, follow status.

### `import "server-only"` Boundary

- `follow-service.ts` has `import "server-only"` → service tests MUST include `vi.mock("server-only", () => ({}))`
- `FollowButton` and `FollowList` are client components → they import from `use-follow.ts` (also client), NOT from `follow-service.ts`
- The query file `follows.ts` does NOT have `import "server-only"` (consistent with `block-mute.ts`)

### ProfileView — Breaking Change in Test Fixture

`ProfileView.test.tsx` has a `baseProfile: CommunityProfile` fixture. After adding `followerCount` and `followingCount` to the schema, `CommunityProfile` type will include these fields. The test fixture WILL NOT compile without them. Update immediately:

```ts
const baseProfile: CommunityProfile = {
  // ...existing fields...
  followerCount: 0, // ADD
  followingCount: 0, // ADD
};
```

### Zod v4 UUID Validation (Not Used Here — Use Regex Instead)

The block/mute routes use a `uuidRegex` for UUID validation instead of Zod. Follow the same pattern for consistency. Do NOT use `z.string().uuid()` in the API routes for this story — the regex pattern is already established for `[userId]`-style routes.

### `getFollowersPage` / `getFollowingPage` — `deletedAt` Filter

The JOIN condition must include the soft-delete filter on `community_profiles`. The `sql` helper is needed for the IS NULL check since Drizzle doesn't currently support `isNull()` inside a join `ON` clause:

```ts
sql`${communityProfiles.deletedAt} IS NULL`;
```

This ensures deleted/anonymized profiles are excluded from follower/following lists.

### React Query v5 — No `onSuccess` on `useQuery`

**CRITICAL:** The project uses TanStack Query (React Query) v5. In v5, `onSuccess`, `onError`, and `onSettled` callbacks were removed from `useQuery`. They remain on `useMutation`. Do NOT use `onSuccess` in `useQuery` calls:

```ts
// ❌ WRONG — removed in React Query v5
useQuery({ onSuccess: (data) => { ... } });

// ✅ CORRECT — use useEffect to react to data changes
const { data } = useQuery({ ... });
useEffect(() => { if (data) { /* handle data */ } }, [data]);

// ✅ CORRECT — onSuccess is still valid on useMutation
useMutation({ onSuccess: (data) => { ... } });
```

Evidence from Story 3.3: `useMutation` uses `onSuccess`, but `useQuery` does not — confirms v5 usage.

### `FollowButton` — One GET Request Per Card on Discover Page

Each `FollowButton` renders independently and fetches follow status via `GET /api/v1/members/[userId]/follow`. On the discover page, a full results grid (20 cards) will fire 20 parallel GET requests. For MVP this is acceptable — each request is lightweight and the rate limit is 60/min (well above 20 requests per page load). React Query's `staleTime: 60_000` prevents redundant refetches during the session.

### Profile Page Cache — Stale Follow Counts for Other Viewers

`profiles/[userId]/page.tsx` has `export const revalidate = 300` (5-minute ISR cache). After a follow action, the DB `follower_count` is updated immediately, but other viewers loading the profile page may see cached counts for up to 5 minutes. The `FollowButton`'s own optimistic state is always current for the acting viewer. This is an acceptable MVP trade-off — do NOT change the `revalidate` value.

### Block/Mute Exclusion — NOT Applied to Follow Lists (MVP)

Followers/following lists do NOT filter out blocked or muted users. The block/mute system only affects content visibility, notifications, and member suggestions. Showing a blocked user in a follow list is intentional for MVP — unfollowing is the user's action if needed. Do NOT add block filtering to the follow list queries.

### Feed Integration — Deferred to Story 4.1

The epics.md states: "followed member's future posts appear in the follower's news feed (Story 4.1)". Story 3.4 creates the follow relationship table that Story 4.1 will JOIN when building the feed query. No feed-related code is needed in this story.

### Scroll/Pagination — Keep It Simple for MVP

The `FollowList` component uses a simple "load more" button pattern rather than infinite scroll. This is sufficient for MVP. The cursor is the `followedAt` ISO string (the `created_at` of the follow relationship, returned as `followedAt` in `FollowListMember`). The next page is signaled by `nextCursor !== null` in the API response.

### Project Structure Notes

**New files:**

- `src/db/schema/community-connections.ts`
- `src/db/migrations/0017_member_following.sql`
- `src/db/queries/follows.ts`
- `src/db/queries/follows.test.ts`
- `src/services/follow-service.ts`
- `src/services/follow-service.test.ts`
- `src/app/api/v1/members/[userId]/follow/route.ts`
- `src/app/api/v1/members/[userId]/follow/route.test.ts`
- `src/app/api/v1/members/[userId]/followers/route.ts`
- `src/app/api/v1/members/[userId]/followers/route.test.ts`
- `src/app/api/v1/members/[userId]/following/route.ts`
- `src/app/api/v1/members/[userId]/following/route.test.ts`
- `src/features/profiles/hooks/use-follow.ts`
- `src/features/profiles/hooks/use-follow.test.ts`
- `src/features/profiles/components/FollowButton.tsx`
- `src/features/profiles/components/FollowButton.test.tsx`
- `src/features/profiles/components/FollowList.tsx`
- `src/features/profiles/components/FollowList.test.tsx`

**Modified files:**

- `src/db/schema/community-profiles.ts` — add `followerCount`, `followingCount` columns + `integer` import
- `src/db/index.ts` — register `communityConnectionsSchema`
- `src/services/rate-limiter.ts` — add `MEMBER_FOLLOW`, `FOLLOW_LIST` presets
- `src/features/profiles/components/ProfileView.tsx` — add `viewerUserId` prop, `FollowButton`, follow counts, tabs
- `src/features/profiles/components/ProfileView.test.tsx` — update fixture + add tests
- `src/features/profiles/index.ts` — add new exports
- `src/features/discover/components/MemberCard.tsx` — add optional `FollowButton`
- `src/features/discover/components/MemberCard.test.tsx` — add follow button tests
- `src/app/[locale]/(app)/profiles/[userId]/page.tsx` — pass `viewerUserId` to `ProfileView`
- `messages/en.json` — follow i18n keys under `"Profile"` + notification keys
- `messages/ig.json` — Igbo translations
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update story status

**Test count estimate:**

- `follows.test.ts`: ~9 new tests
- `follow-service.test.ts`: ~3 new tests
- `follow/route.test.ts`: ~9 new tests
- `followers/route.test.ts`: ~5 new tests
- `following/route.test.ts`: ~5 new tests
- `use-follow.test.ts`: ~7 new tests
- `FollowButton.test.tsx`: ~6 new tests
- `FollowList.test.tsx`: ~4 new tests
- `ProfileView.test.tsx` (update): ~6 new tests
- `MemberCard.test.tsx` (update): ~2 new tests

**Estimated new tests: ~56** (bringing total from ~1776 to ~1832)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.4, lines 1706–1736]
- [Source: `src/db/schema/platform-social.ts` — `platformBlockedUsers` pattern for composite primary key + indexes]
- [Source: `src/db/schema/community-profiles.ts` — `communityProfiles` schema: column types, foreign key pattern, index naming]
- [Source: `src/db/queries/block-mute.ts` — `blockUser`, `unblockUser`, `isBlocked` as template for `followMember`, `unfollowMember`, `isFollowing`]
- [Source: `src/services/block-service.ts` — service wrapper pattern + `import "server-only"`]
- [Source: `src/app/api/v1/members/[userId]/block/route.ts` — `extractTargetUserId` pattern, `rateLimitConfig`, POST/DELETE/GET route structure]
- [Source: `src/services/notification-service.ts` — existing `member.followed` EventBus listener (do NOT modify)]
- [Source: `src/types/events.ts` — `MemberFollowedEvent`, `MemberUnfollowedEvent` (already defined, do NOT modify)]
- [Source: `src/services/event-bus.ts` — `eventBus.emit()` pattern]
- [Source: `src/services/rate-limiter.ts` — `RATE_LIMIT_PRESETS` pattern, `BLOCK_MUTE` (30/min) as reference rate]
- [Source: `src/features/profiles/components/ProfileView.tsx` — existing component to update]
- [Source: `src/features/profiles/components/ProfileView.test.tsx` — breaking fixture update required]
- [Source: `src/features/discover/components/MemberCard.tsx` — optional FollowButton integration]
- [Source: `src/db/index.ts` — manual schema registration pattern (must add communityConnectionsSchema)]
- [Source: `drizzle.config.ts` — `schema: "./src/db/schema/*"` glob (drizzle-kit auto-discovers files)]
- [Source: `src/db/migrations/0016_member_directory_search.sql` — migration file format + naming convention]
- [Source: `_bmad-output/implementation-artifacts/3-3-member-suggestions-dashboard-widget.md` — optimistic update pattern (onMutate/onError rollback, H1 code review fix), `useRealTimersForReactQuery` pattern]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — NFR-A5 44px tap targets, transaction patterns, EventBus architecture rules]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `community_member_follows` table + migration 0017
- Added `follower_count` / `following_count` denormalized columns to `community_profiles`
- Implemented `follows.ts` DB query file with transactional follow/unfollow + cursor-based pagination
- Implemented `follow-service.ts` with EventBus integration (member.followed/member.unfollowed)
- Added `MEMBER_FOLLOW` (30/min) and `FOLLOW_LIST` (60/min) rate limit presets
- Added all follow i18n keys to en.json and ig.json (Profile namespace + notifications.new_follower)
- Created follow/route.ts (POST/DELETE/GET) with CSRF handling and self-follow guard
- Created followers/route.ts and following/route.ts with cursor pagination
- Implemented `use-follow.ts` hook with optimistic updates and rollback on error
- Implemented `FollowButton.tsx` with hover/focus toggle (Following → Unfollow text swap)
- Implemented `FollowList.tsx` with cursor pagination and viewer self-entry guard
- Updated `ProfileView.tsx` with follow counts, 3-tab layout (About/Followers/Following), and FollowButton
- Updated `profiles/[userId]/page.tsx` to pass `viewerUserId` to ProfileView
- Updated `MemberCard.tsx` with optional `showFollowButton` prop (defaults true)
- Fixed `MemberGrid.test.tsx` cascade by adding FollowButton mock
- Fixed `follow-service.test.ts` by using explicit factory mock for `@/db/queries/follows`
- All 1843 tests pass (was 1776; +67 new tests)
- [Review] Fixed 4 MEDIUM issues: i18n Loading strings, limit validation, FollowList profile links, MemberCard self-follow guard; +6 tests (1849 total)

### File List

**New files:**

- src/db/schema/community-connections.ts
- src/db/migrations/0017_member_following.sql
- src/db/queries/follows.ts
- src/db/queries/follows.test.ts
- src/services/follow-service.ts
- src/services/follow-service.test.ts
- src/app/api/v1/members/[userId]/follow/route.ts
- src/app/api/v1/members/[userId]/follow/route.test.ts
- src/app/api/v1/members/[userId]/followers/route.ts
- src/app/api/v1/members/[userId]/followers/route.test.ts
- src/app/api/v1/members/[userId]/following/route.ts
- src/app/api/v1/members/[userId]/following/route.test.ts
- src/features/profiles/hooks/use-follow.ts
- src/features/profiles/hooks/use-follow.test.ts
- src/features/profiles/components/FollowButton.tsx
- src/features/profiles/components/FollowButton.test.tsx
- src/features/profiles/components/FollowList.tsx
- src/features/profiles/components/FollowList.test.tsx

**Modified files:**

- src/db/schema/community-profiles.ts
- src/db/index.ts
- src/services/rate-limiter.ts
- src/features/profiles/components/ProfileView.tsx
- src/features/profiles/components/ProfileView.test.tsx
- src/features/profiles/index.ts
- src/features/discover/components/MemberCard.tsx
- src/features/discover/components/MemberCard.test.tsx
- src/features/discover/components/MemberGrid.test.tsx
- src/app/[locale]/(app)/profiles/[userId]/page.tsx
- messages/en.json
- messages/ig.json
- \_bmad-output/implementation-artifacts/sprint-status.yaml

## Senior Developer Review (AI)

**Reviewer:** Dev | **Date:** 2026-03-01 | **Model:** claude-opus-4-6

**Verdict: APPROVED with fixes (4 MEDIUM fixed, 2 LOW accepted)**

### Issues Found & Fixed

| #   | Severity | Issue                                                                                              | Fix                                                                                                  |
| --- | -------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| M1  | MEDIUM   | `FollowList.tsx` had 2 hardcoded "Loading..." strings violating i18n pattern                       | Added `followListLoading` i18n key (en+ig), replaced hardcoded strings with `t("followListLoading")` |
| M2  | MEDIUM   | `limit` query param in followers/following routes not validated — NaN/negative/zero passed through | Added `Number.isFinite()` guard + `Math.max(1, ...)` floor clamp                                     |
| M3  | MEDIUM   | `FollowList` member names were plain text — no navigation to profiles                              | Wrapped avatar+name in `Link` from `@/i18n/navigation` to `/profiles/${member.userId}`               |
| M4  | MEDIUM   | `MemberCard` showed `FollowButton` for viewer's own card (no self-detection)                       | Added optional `viewerUserId` prop; hides FollowButton when `member.userId === viewerUserId`         |

### Accepted LOW Issues (no fix needed for MVP)

- **L1:** `useFollow` doesn't invalidate `follow-list` queries after mutation — stale follower lists possible until refetch
- **L2:** `FollowList` background refetch replaces accumulated "load more" pages (documented in Dev Notes as accepted)

### Test Impact

+6 new tests (1843 → 1849): limit validation tests for followers/following routes (×2 each), FollowList link test, MemberCard self-follow test.

### AC Validation

All 5 Acceptance Criteria verified as implemented:

1. Follow button creates relationship + notification + atomic count increment ✓
2. Unfollow removes relationship silently + atomic count decrement with floor ✓
3. Profile shows counts + tabs with paginated lists (avatar/name/location/toggle) ✓
4. Own profile followers tab shows followers with follow-back capability ✓
5. Migration 0017 creates correct schema ✓

### Task Audit

All 16 tasks marked [x] verified against implementation — all genuinely complete.

## Change Log

- 2026-03-01: Story 3.4 implemented — member following system with DB schema, service layer, REST API (follow/followers/following), useFollow hook with optimistic updates, FollowButton and FollowList components, ProfileView tab UI, MemberCard integration, i18n translations; +67 new tests (1843 total)
- 2026-03-01: Code review fixes — 4 MEDIUM issues fixed (i18n Loading strings, limit validation, FollowList profile links, MemberCard self-follow guard); +6 new tests (1849 total)
