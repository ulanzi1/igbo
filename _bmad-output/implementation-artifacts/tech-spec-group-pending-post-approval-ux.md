---
title: "Group Post Approval: Author, Media Preview & Pagination"
slug: "group-pending-post-approval-ux"
created: "2026-03-05"
status: "ready-for-dev"
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - Next.js 16 (App Router)
  - TypeScript strict
  - Drizzle ORM (PostgreSQL)
  - React Query v5 (useInfiniteQuery)
  - shadcn/ui (Avatar)
  - next-intl
  - Vitest
files_to_modify:
  - src/db/queries/posts.ts
  - src/db/queries/posts.test.ts
  - src/app/api/v1/groups/[groupId]/posts/route.ts
  - src/app/api/v1/groups/[groupId]/posts/route.test.ts
  - src/features/groups/components/GroupFeedTab.tsx
  - src/features/groups/components/GroupFeedTab.test.tsx
  - messages/en.json
  - messages/ig.json
code_patterns:
  - cursor-pagination (ISO date string, oldest-first for FIFO queue)
  - batch media fetch via inArray (same as _assemblePostPage in feed.ts)
  - INNER JOIN communityProfiles for author display name + photo
  - useInfiniteQuery for paginated pending posts panel
  - thenable chain mock for multi-step Drizzle queries
test_patterns:
  - vitest-environment node for DB query + route tests
  - vitest-environment jsdom for GroupFeedTab component
  - buildSelectChainWithLimit (thenable) for two-call select sequences
  - mockReturnValueOnce chaining for sequential db.select() calls
---

# Tech-Spec: Group Post Approval: Author, Media Preview & Pagination

**Created:** 2026-03-05

## Overview

### Problem Statement

The pending post approval panel (visible to group leaders/creators in moderated groups) shows only the post date and an Approve button. Two critical pieces of information are missing:

1. **Author identity** — Leaders cannot see who submitted the post. `listPendingGroupPosts` returns only `authorId` with no display name or profile photo.
2. **Media preview** — Media-only posts appear completely blank because `listPendingGroupPosts` does not fetch `communityPostMedia` rows.

Additionally, large groups with high post volumes have no pagination — the entire pending queue loads at once with no way to page through it.

### Solution

1. Extend `listPendingGroupPosts` to: (a) INNER JOIN `communityProfiles` for author display name + photo, (b) batch-fetch `communityPostMedia` for the result set, (c) accept `cursor` + `limit` params and return `nextCursor` (oldest-first cursor pagination).
2. Update the GET route to forward `cursor`/`limit` to the query and return `nextCursor` in the response.
3. Update `GroupFeedTab` to: (a) switch pending panel from `useQuery` → `useInfiniteQuery`, (b) render author avatar + display name linked to `/profiles/[authorId]`, (c) render image thumbnails and media-type badges, (d) show a "Load more pending posts" button when `nextCursor` is present.

### Scope

**In Scope:**

- `listPendingGroupPosts` DB query: author INNER JOIN, media batch fetch, cursor pagination, new `PendingGroupPost` export type
- GET `/api/v1/groups/[groupId]/posts?pending=true` route: forward `cursor`/`limit`, return `nextCursor`
- `GroupFeedTab` UI: author row (avatar + name + profile link), media preview (image thumbnails + media-type badges), Load More button
- Unit tests for all changed code
- i18n: 1 new key `Groups.feed.pendingLoadMore` in `en.json` + `ig.json`

**Out of Scope:**

- Approve/reject API changes
- Main group feed changes
- Email notifications for pending posts
- Reject / dismiss action (future story)
- Total pending count in the badge (badge shows loaded count; total count endpoint is future)

---

## Context for Development

### Codebase Patterns

- **Cursor pagination** (`feed.ts:389`): `cursor` = ISO date string of last row's `createdAt`. Guard: `const parsedDate = cursor ? new Date(cursor) : undefined; const cursorDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;`. For oldest-first queue, next page uses `gt(communityPosts.createdAt, cursorDate)`. Fetch `limit + 1` rows; if `rows.length > limit`, slice to `limit` and set `nextCursor = pageRows[pageRows.length-1].createdAt.toISOString()`.
- **Batch media fetch** (`feed.ts:144`): `db.select().from(communityPostMedia).where(inArray(communityPostMedia.postId, postIds)).orderBy(communityPostMedia.sortOrder)`. Build `Map<postId, mediaRows[]>`.
- **Author INNER JOIN** (`feed.ts:407`): `.innerJoin(communityProfiles, and(eq(communityProfiles.userId, communityPosts.authorId), sql\`${communityProfiles.deletedAt} IS NULL\`))`. Select `communityProfiles.displayName`as`authorDisplayName`, `communityProfiles.photoUrl`as`authorPhotoUrl`.
- **`communityProfiles` field names** (confirmed `community-profiles.ts:39,41`): `displayName` (varchar 255), `photoUrl` (varchar 2048).
- **`useInfiniteQuery` pattern** (`GroupFeedTab.tsx:46`): `initialPageParam: undefined`, `getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined`. Flatten with `.flatMap(p => p.posts)`.
- **Profile link**: `/profiles/[authorId]` — confirmed from `FeedItem.tsx:133`.
- **`Link` component**: Import from `@/i18n/navigation` (not `next/link`) for locale-aware routing.
- **Avatar**: `import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"`. Initials: `displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)`.
- **i18n in GroupFeedTab**: `const t = useTranslations("Groups")` — keys are under `Groups.feed.*`.
- **No migration needed** — no schema changes; `communityProfiles` and `communityPostMedia` already exist.

### Files to Reference

| File                                                      | Purpose                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/db/queries/posts.ts:162`                             | Current `listPendingGroupPosts` to rewrite                                    |
| `src/db/queries/posts.test.ts`                            | Existing test file to extend (already has `mockDbSelect`, `buildSelectChain`) |
| `src/db/queries/feed.ts:139`                              | `_assemblePostPage` — media batch fetch + map pattern                         |
| `src/db/queries/feed.ts:389`                              | `getGroupFeedPosts` — cursor pagination + author JOIN pattern                 |
| `src/db/queries/bookmarks.test.ts:72`                     | `makeSelectChain` — thenable chain helper pattern (copy for posts.test.ts)    |
| `src/features/groups/components/GroupFeedTab.tsx`         | Full component to update                                                      |
| `src/features/groups/components/GroupFeedTab.test.tsx`    | Existing 12 tests to update + new tests                                       |
| `src/features/groups/components/GroupCard.test.tsx:15`    | `@/i18n/navigation` Link mock pattern to copy                                 |
| `src/app/api/v1/groups/[groupId]/posts/route.ts:52`       | Pending branch — add cursor/limit forwarding                                  |
| `src/app/api/v1/groups/[groupId]/posts/route.test.ts:110` | Existing pending tests to update                                              |
| `src/features/feed/components/FeedItem.tsx:132`           | Author row UI reference                                                       |
| `messages/en.json:1189`                                   | `Groups.feed` — add `pendingLoadMore`                                         |
| `messages/ig.json`                                        | Mirror of en.json                                                             |

### Technical Decisions

1. **FIFO queue order**: Pending posts sorted oldest-first (`ASC createdAt`). Cursor uses `gt` (strictly greater than) to advance. This is fair — posts approved in submission order.
2. **Page size**: Default `limit = 10` (smaller than feed's 20 — each card is heavier with media preview). Route caps at `Math.min(limit, 20)`.
3. **Author JOIN type**: INNER JOIN — all posts must have an active author profile. A left-join null author would be a data integrity issue; INNER JOIN drops such rows rather than crashing the UI.
4. **Media rendering strategy**: Images → `<img>` thumbnails (max 4, `h-20 w-20`, `object-cover`, rounded). Audio/video → small muted badge showing media type (e.g. `"video"`, `"audio"`). Full playback is unnecessary for approval decisions.
5. **`refetch` after approve**: `useInfiniteQuery.refetch()` resets to page 1 and re-fetches all currently-loaded pages. Correct — the queue must be re-evaluated after any approval.
6. **i18n key choice**: Add `Groups.feed.pendingLoadMore` (not reusing `Groups.feed.loadMore`) for semantic clarity and accessibility. The pending panel's load-more button has a distinct context.

---

## Implementation Plan

### Tasks

- [ ] **Task 1: Extend `listPendingGroupPosts` in `src/db/queries/posts.ts`**
  - File: `src/db/queries/posts.ts`
  - Action 1.1 — Add imports: add `gt` to the existing drizzle-orm import line. Add `import { communityProfiles } from "@/db/schema/community-profiles";` after the existing schema imports.
  - Action 1.2 — Add `PendingGroupPost` export interface after the existing `CreatePostMediaData` interface:
    ```ts
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
    ```
  - Action 1.3 — Replace the entire `listPendingGroupPosts` function (lines 162–181) with the new implementation:

    ```ts
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
    ```

  - Notes: `and(...conditions)` with spread is valid Drizzle — existing usage confirmed in codebase. `communityPostMedia` is already imported at line 6. `status` field already exists in schema (added CP-1).

- [ ] **Task 2: Update GET route pending branch in `src/app/api/v1/groups/[groupId]/posts/route.ts`**
  - File: `src/app/api/v1/groups/[groupId]/posts/route.ts`
  - Action — Replace lines 53–63 (the `if (searchParams.get("pending") === "true")` block) with:
    ```ts
    if (searchParams.get("pending") === "true") {
      const isLeaderOrCreator = membership.role === "creator" || membership.role === "leader";
      if (!isLeaderOrCreator) {
        throw new ApiError({
          title: "Forbidden",
          status: 403,
          detail: "Only group creators or leaders can view pending posts",
        });
      }
      const cursor = searchParams.get("cursor") ?? undefined;
      const limitParam = parseInt(searchParams.get("limit") ?? "10", 10);
      const limit = Math.min(isNaN(limitParam) ? 10 : limitParam, 20);
      const result = await listPendingGroupPosts(groupId, { cursor, limit });
      return successResponse(result);
    }
    ```
  - Notes: Response shape changes from `{ posts: [...] }` to `{ posts: [...], nextCursor: string|null }`. The `GroupFeedTab` queryFn already reads `json.data` — update the type there in Task 3.

- [ ] **Task 3: Update `GroupFeedTab.tsx`**
  - File: `src/features/groups/components/GroupFeedTab.tsx`
  - Action 3.1 — Add imports at the top (after existing imports):
    ```ts
    import { Link } from "@/i18n/navigation";
    import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
    ```
  - Action 3.2 — Replace `PendingPost` interface and add `PendingPageData`:
    ```ts
    interface PendingPost {
      id: string;
      authorId: string;
      authorDisplayName: string;
      authorPhotoUrl: string | null;
      content: string;
      contentType: string;
      createdAt: string;
      media: Array<{ id: string; mediaUrl: string; mediaType: string; sortOrder: number }>;
    }
    interface PendingPageData {
      posts: PendingPost[];
      nextCursor: string | null;
    }
    ```
  - Action 3.3 — Replace the `useQuery<PendingPost[]>` block with `useInfiniteQuery<PendingPageData>`:
    ```ts
    const {
      data: pendingData,
      fetchNextPage: fetchNextPending,
      hasNextPage: hasPendingNextPage,
      isFetchingNextPage: isFetchingNextPending,
      isLoading: pendingLoading,
      refetch: refetchPending,
    } = useInfiniteQuery<PendingPageData>({
      queryKey: ["group-pending-posts", groupId],
      queryFn: async ({ pageParam }) => {
        const url = new URL(`/api/v1/groups/${groupId}/posts`, window.location.origin);
        url.searchParams.set("pending", "true");
        if (pageParam) url.searchParams.set("cursor", pageParam as string);
        const res = await fetch(url.toString(), { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch pending posts");
        const json = (await res.json()) as { data: PendingPageData };
        return json.data;
      },
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: isLeaderOrCreator && isModerated,
      staleTime: 30_000,
    });
    ```
  - Action 3.4 — Replace the `pendingPosts` and `pendingCount` lines:
    ```ts
    const pendingPosts = pendingData?.pages.flatMap((p) => p.posts) ?? [];
    const pendingCount = pendingPosts.length;
    ```
  - Action 3.5 — Replace the pending post card JSX (the `pendingPosts?.map(...)` block). Replace the entire inner `<div key={post.id} ...>` card with:
    ```tsx
    <div key={post.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
      {/* Author row */}
      <div className="flex items-center gap-2">
        <Link href={`/profiles/${post.authorId}`}>
          <Avatar className="h-7 w-7">
            <AvatarImage src={post.authorPhotoUrl ?? undefined} alt={post.authorDisplayName} />
            <AvatarFallback className="text-xs">
              {post.authorDisplayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </Link>
        <Link href={`/profiles/${post.authorId}`} className="text-sm font-medium hover:underline">
          {post.authorDisplayName}
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(post.createdAt).toLocaleDateString()}
        </span>
      </div>
      {/* Post text content */}
      {post.content && <p className="text-sm line-clamp-3">{post.content}</p>}
      {/* Media preview */}
      {post.media.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {post.media
            .filter((m) => m.mediaType === "image")
            .slice(0, 4)
            .map((m) => (
              <img key={m.id} src={m.mediaUrl} alt="" className="h-20 w-20 rounded object-cover" />
            ))}
          {post.media
            .filter((m) => m.mediaType !== "image")
            .map((m) => (
              <span key={m.id} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {m.mediaType}
              </span>
            ))}
        </div>
      )}
      {/* Approve button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleApprove(post.id)}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[32px]"
        >
          {t("feed.approvePending")}
        </button>
      </div>
    </div>
    ```
  - Action 3.6 — After the `pendingPosts?.map(...)` block and before the closing `</div>` of the pending panel, add the Load More button:
    ```tsx
    {
      hasPendingNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void fetchNextPending()}
            disabled={isFetchingNextPending}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors min-h-[36px]"
          >
            {isFetchingNextPending ? t("feed.loading") : t("feed.pendingLoadMore")}
          </button>
        </div>
      );
    }
    ```
  - Notes: Remove the old `pendingPosts?.map(...)` wrapper — the new card uses `pendingPosts.map(...)` (not optional chain, since it defaults to `[]`).

- [ ] **Task 4: Add i18n keys**
  - File: `messages/en.json`
  - Action — In the `Groups.feed` object (after `"approveSuccess": "Post approved."`), add:
    ```json
    "pendingLoadMore": "Load more pending posts"
    ```
  - File: `messages/ig.json`
  - Action — In the same `Groups.feed` object, add:
    ```json
    "pendingLoadMore": "Buo ozi ndị ọzọ na-atọ"
    ```

- [ ] **Task 5: Update `src/db/queries/posts.test.ts`**
  - File: `src/db/queries/posts.test.ts`
  - Action 5.1 — Add `communityProfiles` mock after the existing `communityPostMedia` mock (inside `vi.mock("@/db/schema/community-posts", ...)`), and add `communityProfiles` as a separate `vi.mock`:
    ```ts
    vi.mock("@/db/schema/community-profiles", () => ({
      communityProfiles: {
        userId: "user_id",
        displayName: "display_name",
        photoUrl: "photo_url",
        deletedAt: "deleted_at",
      },
    }));
    ```
  - Action 5.2 — Add `status: "status"` and `groupId: "group_id"` to the existing `communityPosts` mock object (it already has `groupId: "groupId"` — confirm exact value; if it already exists no change needed). Add `id: "id"` to the `communityPostMedia` mock object if missing.
  - Action 5.3 — Add the `buildSelectChainWithLimit` helper function (after `buildInsertChainNoReturn`, before `beforeEach`):
    ```ts
    function buildSelectChainWithLimit(result: unknown) {
      const resolved = Promise.resolve(result);
      const chain: Record<string, unknown> = {
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
      };
      ["from", "innerJoin", "where", "orderBy"].forEach((k) => {
        chain[k] = vi.fn().mockReturnValue(chain);
      });
      chain["limit"] = vi.fn().mockResolvedValue(result);
      return chain;
    }
    ```
  - Action 5.4 — Add `listPendingGroupPosts` to the import line:
    ```ts
    import {
      getWeeklyFeedPostCount,
      insertPost,
      insertPostMedia,
      resolveFileUploadUrls,
      listPendingGroupPosts,
    } from "./posts";
    ```
  - Action 5.5 — Add `describe("listPendingGroupPosts", ...)` test suite at the end of the file:

    ```ts
    describe("listPendingGroupPosts", () => {
      const GROUP_ID = "group-1";
      const POST_ID_1 = "post-1";
      const POST_ID_2 = "post-2";
      const AUTHOR_ID = "author-1";
      const BASE_DATE = new Date("2026-03-01T10:00:00Z");
      const LATER_DATE = new Date("2026-03-02T10:00:00Z");

      function makeRow(id: string, createdAt: Date) {
        return {
          id,
          authorId: AUTHOR_ID,
          authorDisplayName: "Bob Smith",
          authorPhotoUrl: "https://cdn.example.com/bob.jpg",
          content: "Hello",
          contentType: "text",
          createdAt,
        };
      }

      it("returns empty result when no pending posts", async () => {
        mockDbSelect
          .mockReturnValueOnce(buildSelectChainWithLimit([]))
          .mockReturnValueOnce(buildSelectChainWithLimit([]));

        const result = await listPendingGroupPosts(GROUP_ID);
        expect(result).toEqual({ posts: [], nextCursor: null });
      });

      it("returns enriched posts with author name and empty media when no attachments", async () => {
        const rows = [makeRow(POST_ID_1, BASE_DATE)];
        mockDbSelect
          .mockReturnValueOnce(buildSelectChainWithLimit(rows))
          .mockReturnValueOnce(buildSelectChainWithLimit([]));

        const result = await listPendingGroupPosts(GROUP_ID);
        expect(result.posts).toHaveLength(1);
        expect(result.posts[0].authorDisplayName).toBe("Bob Smith");
        expect(result.posts[0].authorPhotoUrl).toBe("https://cdn.example.com/bob.jpg");
        expect(result.posts[0].media).toEqual([]);
        expect(result.nextCursor).toBeNull();
      });

      it("attaches media to the correct post", async () => {
        const rows = [makeRow(POST_ID_1, BASE_DATE)];
        const mediaRows = [
          {
            id: "m1",
            postId: POST_ID_1,
            mediaUrl: "https://cdn.example.com/img.jpg",
            mediaType: "image",
            sortOrder: 0,
          },
        ];
        mockDbSelect
          .mockReturnValueOnce(buildSelectChainWithLimit(rows))
          .mockReturnValueOnce(buildSelectChainWithLimit(mediaRows));

        const result = await listPendingGroupPosts(GROUP_ID);
        expect(result.posts[0].media).toHaveLength(1);
        expect(result.posts[0].media[0].mediaUrl).toBe("https://cdn.example.com/img.jpg");
        expect(result.posts[0].media[0].mediaType).toBe("image");
      });

      it("sets nextCursor to last post's createdAt ISO string when more posts exist beyond limit", async () => {
        // Return limit+1 rows to signal hasMore
        const rows = Array.from({ length: 11 }, (_, i) =>
          makeRow(`post-${i}`, new Date(`2026-03-0${i + 1}T10:00:00Z`)),
        );
        mockDbSelect
          .mockReturnValueOnce(buildSelectChainWithLimit(rows))
          .mockReturnValueOnce(buildSelectChainWithLimit([]));

        const result = await listPendingGroupPosts(GROUP_ID, { limit: 10 });
        expect(result.posts).toHaveLength(10);
        expect(result.nextCursor).toBe(rows[9].createdAt.toISOString());
      });

      it("returns nextCursor null on last page", async () => {
        const rows = [makeRow(POST_ID_1, BASE_DATE), makeRow(POST_ID_2, LATER_DATE)];
        mockDbSelect
          .mockReturnValueOnce(buildSelectChainWithLimit(rows))
          .mockReturnValueOnce(buildSelectChainWithLimit([]));

        const result = await listPendingGroupPosts(GROUP_ID, { limit: 10 });
        expect(result.posts).toHaveLength(2);
        expect(result.nextCursor).toBeNull();
      });

      it("skips media fetch when no posts returned", async () => {
        mockDbSelect.mockReturnValueOnce(buildSelectChainWithLimit([]));

        await listPendingGroupPosts(GROUP_ID);
        // db.select called only once (no media fetch for empty result)
        expect(mockDbSelect).toHaveBeenCalledTimes(1);
      });
    });
    ```

- [ ] **Task 6: Update `src/app/api/v1/groups/[groupId]/posts/route.test.ts`**
  - File: `src/app/api/v1/groups/[groupId]/posts/route.test.ts`
  - Action 6.1 — Update existing `"returns pending posts for leader with ?pending=true"` test (line 110): change `mockListPendingGroupPosts.mockResolvedValue([{ id: POST_ID, content: "Pending" }])` to `mockListPendingGroupPosts.mockResolvedValue({ posts: [{ id: POST_ID, content: "Pending" }], nextCursor: null })`.
  - Action 6.2 — Add new tests in the `GET` describe block:

    ```ts
    it("forwards cursor and limit params to listPendingGroupPosts", async () => {
      mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
      mockListPendingGroupPosts.mockResolvedValue({ posts: [], nextCursor: null });

      const req = new Request(
        `${BASE_URL}?pending=true&cursor=2026-03-01T10%3A00%3A00.000Z&limit=5`,
      );
      await GET(req);

      expect(mockListPendingGroupPosts).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ cursor: "2026-03-01T10:00:00.000Z", limit: 5 }),
      );
    });

    it("returns nextCursor in response when more pending posts exist", async () => {
      mockGetGroupMember.mockResolvedValue({ role: "creator", status: "active" });
      mockListPendingGroupPosts.mockResolvedValue({
        posts: [{ id: POST_ID, content: "Pending" }],
        nextCursor: "2026-03-01T12:00:00.000Z",
      });

      const req = new Request(`${BASE_URL}?pending=true`);
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.nextCursor).toBe("2026-03-01T12:00:00.000Z");
    });

    it("caps limit at 20 even if larger value is provided", async () => {
      mockGetGroupMember.mockResolvedValue({ role: "leader", status: "active" });
      mockListPendingGroupPosts.mockResolvedValue({ posts: [], nextCursor: null });

      const req = new Request(`${BASE_URL}?pending=true&limit=100`);
      await GET(req);

      expect(mockListPendingGroupPosts).toHaveBeenCalledWith(
        GROUP_ID,
        expect.objectContaining({ limit: 20 }),
      );
    });
    ```

- [ ] **Task 7: Update `src/features/groups/components/GroupFeedTab.test.tsx`**
  - File: `src/features/groups/components/GroupFeedTab.test.tsx`
  - Action 7.1 — Add `@/i18n/navigation` mock at the top (after the existing `vi.mock("@/features/feed/components/FeedItem", ...)` block). Copy pattern from `GroupCard.test.tsx:15`:
    ```ts
    vi.mock("@/i18n/navigation", () => ({
      Link: ({
        href,
        children,
        className,
      }: {
        href: string;
        children: React.ReactNode;
        className?: string;
      }) => (
        <a href={href} className={className}>
          {children}
        </a>
      ),
    }));
    ```
  - Action 7.2 — Update `makePendingResponse` helper to accept `nextCursor` and use the new response shape:
    ```ts
    function makePendingResponse(posts = [], nextCursor: string | null = null) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: { posts, nextCursor } }), { status: 200 }),
      );
    }
    ```
  - Action 7.3 — Add `OTHER_USER_ID` constant: `const OTHER_USER_ID = "00000000-0000-4000-8000-000000000005";`
  - Action 7.4 — Update ALL existing test fixtures that create pending post objects (lines 191, 219, 266, 304) to include the new required fields. Replace bare `{ id, authorId, content, createdAt }` objects with the full shape:
    ```ts
    {
      id: PENDING_ID,
      authorId: OTHER_USER_ID,
      authorDisplayName: "Bob",
      authorPhotoUrl: null,
      content: "My pending content",
      contentType: "text",
      createdAt: new Date().toISOString(),
      media: [],
    }
    ```
  - Action 7.5 — Add new test suite `describe("pending panel enriched content", ...)` at the end of the main describe block:

    ```ts
    describe("pending panel enriched content", () => {
      function makePendingPost(overrides = {}) {
        return {
          id: PENDING_ID,
          authorId: OTHER_USER_ID,
          authorDisplayName: "Bob Smith",
          authorPhotoUrl: null,
          content: "Check this out",
          contentType: "text",
          createdAt: new Date().toISOString(),
          media: [],
          ...overrides,
        };
      }

      async function openPendingPanel(fetchMock: typeof global.fetch) {
        renderTab({ viewerRole: "leader", isModerated: true }, fetchMock);
        await waitFor(() => expect(screen.getByText("feed.reviewPending")).toBeInTheDocument());
        fireEvent.click(screen.getByText("feed.reviewPending"));
      }

      it("shows author display name in pending card", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true")) {
            return makePendingResponse([makePendingPost()]);
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
      });

      it("links author name to profile page", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true")) {
            return makePendingResponse([makePendingPost()]);
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
        const links = screen.getAllByRole("link");
        const profileLinks = links.filter((l) =>
          l.getAttribute("href")?.includes(`/profiles/${OTHER_USER_ID}`),
        );
        expect(profileLinks.length).toBeGreaterThan(0);
      });

      it("shows image thumbnail when pending post has image media", async () => {
        const post = makePendingPost({
          media: [
            {
              id: "m1",
              mediaUrl: "https://cdn.example.com/img.jpg",
              mediaType: "image",
              sortOrder: 0,
            },
          ],
        });
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true")) {
            return makePendingResponse([post]);
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => {
          const img = screen.getByRole("img", { hidden: true });
          expect(img).toHaveAttribute("src", "https://cdn.example.com/img.jpg");
        });
      });

      it("shows media type badge for non-image media", async () => {
        const post = makePendingPost({
          media: [
            {
              id: "m2",
              mediaUrl: "https://cdn.example.com/audio.mp3",
              mediaType: "audio",
              sortOrder: 0,
            },
          ],
        });
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true")) {
            return makePendingResponse([post]);
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => expect(screen.getByText("audio")).toBeInTheDocument());
      });

      it("shows Load More button when nextCursor is present", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true") && !url.includes("cursor=")) {
            return makePendingResponse([makePendingPost()], "2026-03-05T12:00:00.000Z");
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => expect(screen.getByText("feed.pendingLoadMore")).toBeInTheDocument());
      });

      it("does not show Load More when nextCursor is null", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true")) {
            return makePendingResponse([makePendingPost()], null);
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
        expect(screen.queryByText("feed.pendingLoadMore")).not.toBeInTheDocument();
      });

      it("fetches next page when Load More is clicked", async () => {
        let callCount = 0;
        const fetchMock = vi.fn().mockImplementation((url: string) => {
          if (typeof url === "string" && url.includes("pending=true")) {
            callCount++;
            if (callCount === 1) {
              return makePendingResponse([makePendingPost()], "2026-03-05T12:00:00.000Z");
            }
            return makePendingResponse([makePendingPost({ id: "pending-page-2" })], null);
          }
          return makeFeedResponse();
        });
        await openPendingPanel(fetchMock);
        await waitFor(() => expect(screen.getByText("feed.pendingLoadMore")).toBeInTheDocument());
        fireEvent.click(screen.getByText("feed.pendingLoadMore"));
        await waitFor(() => {
          const pendingCalls = fetchMock.mock.calls.filter(
            (c) => typeof c[0] === "string" && c[0].includes("pending=true"),
          );
          expect(pendingCalls.length).toBeGreaterThan(1);
          const secondCall = pendingCalls[1][0] as string;
          expect(secondCall).toContain("cursor=");
        });
      });
    });
    ```

---

### Acceptance Criteria

- [ ] **AC-1: Author identity displayed**
      Given a leader opens the pending posts panel on a moderated group with pending posts,
      when the panel renders,
      then each card shows the author's display name as a link pointing to `/profiles/[authorId]` and their avatar (initials fallback if no photo).

- [ ] **AC-2: Image media previews shown**
      Given a pending post has one or more image attachments,
      when a leader views the pending panel,
      then each image is displayed as a thumbnail `<img>` element with the correct `src` URL within the post card.

- [ ] **AC-3: Non-image media indicated**
      Given a pending post has audio or video attachments,
      when a leader views the pending panel,
      then a small badge showing the media type string (e.g. `"audio"`, `"video"`) is rendered within the post card.

- [ ] **AC-4: Text-only posts render correctly**
      Given a pending post has text content and no media,
      when a leader views the pending panel,
      then the post content is shown (line-clamped at 3 lines) and no media section is rendered.

- [ ] **AC-5: Pagination — Load More button appears when more posts exist**
      Given there are more than `limit` (10) pending posts,
      when a leader opens the pending panel and the first page loads,
      then a "Load more pending posts" button is visible below the list.

- [ ] **AC-6: Pagination — Load More fetches next page**
      Given the Load More button is visible,
      when a leader clicks it,
      then a second request is made to the pending posts endpoint with a `cursor=` query parameter appended.

- [ ] **AC-7: Pagination — No Load More on last page**
      Given all pending posts fit within one page (`nextCursor` is null),
      when a leader opens the pending panel,
      then no "Load more pending posts" button is shown.

- [ ] **AC-8: Approve still works with enriched cards**
      Given the enriched pending card is displayed,
      when a leader clicks the Approve button,
      then the approve endpoint is called and the post disappears from the queue (existing behaviour preserved).

- [ ] **AC-9: Members cannot access pending posts endpoint**
      Given an active group member (not leader/creator) is authenticated,
      when they call `GET /api/v1/groups/[groupId]/posts?pending=true`,
      then the route returns 403 Forbidden.

- [ ] **AC-10: Route caps limit at 20**
      Given a caller passes `?limit=100` to the pending endpoint,
      when the route processes the request,
      then `listPendingGroupPosts` is called with `limit: 20` (not 100).

---

## Additional Context

### Dependencies

- No schema migrations required — `communityProfiles` and `communityPostMedia` already exist.
- `communityProfiles` must be imported in `src/db/queries/posts.ts` (not currently imported there).
- `gt` must be added to the drizzle-orm import in `src/db/queries/posts.ts` (currently imports `eq, and, gte, sql, inArray` — add `gt`).

### Testing Strategy

- **DB query tests** (`posts.test.ts`): `@vitest-environment node`. Extend existing file. Use `buildSelectChainWithLimit` (thenable) for both sequential `db.select()` calls. First call = main query (terminal `.limit()`), second call = media batch (terminal `.orderBy()`, which returns the thenable chain).
- **Route tests** (`route.test.ts`): `@vitest-environment node`. Update mock return value shape. Add 3 new tests (cursor forwarding, nextCursor in response, limit cap).
- **Component tests** (`GroupFeedTab.test.tsx`): `@vitest-environment jsdom`. Add `@/i18n/navigation` mock. Update `makePendingResponse` helper. Update all 5 existing pending post fixtures. Add 7 new tests in `"pending panel enriched content"` describe block.
- **Estimated new test count**: +5 query tests + 3 route tests + 7 component tests = **+15 new tests**.

### Notes

- **`and(...conditions)` with spread**: Drizzle `and()` accepts variadic `SQL[]`. Spreading a conditional array `...(cursorDate ? [gt(...)] : [])` is valid — confirmed usage pattern in `getGroupFeedPosts`.
- **Thenable chain for media batch**: The `buildSelectChainWithLimit` chain is thenable, so `await db.select().from(...).where(...).orderBy(...)` resolves correctly even without calling `.limit()`.
- **Pending count badge**: With pagination, the badge count reflects loaded posts (not total). This is acceptable — the count is a UX indicator. A "total count" endpoint is out of scope for this spec.
- **`img` tag vs `Image`**: Using a plain `<img>` tag (not Next.js `<Image>`) to avoid `next.config` domain configuration requirements for media CDN URLs. Consistent with the preview context (approval thumbnail, not production display).
- **`aria-label` on avatar Link**: Not added explicitly — the `AvatarImage` alt text provides accessibility context. Consistent with `FeedItem.tsx` pattern.
