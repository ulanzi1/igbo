# Story 4.2: Post Creation & Rich Media

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to create posts with rich media, text formatting, and category tags,
So that I can share updates, photos, and videos with my community.

## Acceptance Criteria

1. **Given** a member is on the feed page
   **When** they interact with the post composer at the top of the feed
   **Then** a composer appears with "What's on your mind, [Name]?" placeholder text (FR50)
   **And** the composer supports: plain text, rich text formatting (bold, italic, links), photo/video attachments via presigned URL upload, and category tags (Discussion, Announcement, Event)
   **And** on mobile, the composer expands to a full-screen Dialog; on desktop, it expands inline below the trigger

2. **Given** a Basic-tier member clicks the post composer
   **When** the system checks their tier
   **Then** the composer shows a blocked message: "General feed posts are available to Professional and Top-tier members. You can still post in group feeds."
   **And** the submit button is hidden; no editor is rendered for Basic members

3. **Given** a Professional or Top-tier member submits a post
   **When** they click "Post"
   **Then** the system calls `canCreateFeedPost()` (tier gate) and `checkFeedPostingLimit()` (weekly count gate) via the Server Action (FR51)
   **And** if within limits: the post is created in `community_posts`, media inserted in `community_post_media`, a `post.published` EventBus event is emitted, and the feed query is invalidated (React Query) so the new post appears at the top
   **And** if limit reached: the Server Action returns `{ errorCode: "LIMIT_REACHED" }` and the composer shows: "You've reached your weekly posting limit. Your limit resets on [date]."

4. **Given** a member attaches media to a post
   **When** they select photos or videos via the file picker
   **Then** files are uploaded via presigned URLs using the existing `FileUpload` component (`src/components/shared/FileUpload.tsx`)
   **And** images display as a preview grid within the composer (single image full-width, 2–4 images in 2-column grid)
   **And** videos display with a thumbnail/filename preview
   **And** each attachment has an "×" remove button

5. **Given** the `community_posts` table needs a category column
   **When** migration `0019_post_category.sql` is applied
   **Then** a `community_post_category` enum is created with values: `discussion`, `event`, `announcement`
   **And** a `category` column is added to `community_posts` with type `community_post_category`, NOT NULL, DEFAULT `discussion`
   **And** the Drizzle schema (`src/db/schema/community-posts.ts`) is updated with the new enum and column

## Tasks / Subtasks

### Task 1: Install Tiptap Dependencies (AC: #1)

- [x] 1.1 Run `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-mention @tiptap/extension-image @tiptap/extension-link` in the project root.

  **Rationale:** Tiptap was selected as the rich text editor in the Epic 3 retrospective decision record (`docs/decisions/rich-text-editor.md`). These are the MIT OSS packages. They are NOT yet in `package.json` — this must be done first.

  **Key notes:**
  - `@tiptap/react` — React bindings (`useEditor`, `EditorContent`) — **used in Story 4.2**
  - `@tiptap/starter-kit` — Bundled extensions: Bold, Italic, Strike, Code, Heading, BulletList, OrderedList, Blockquote, HardBreak, HorizontalRule, History — **used in Story 4.2**
  - `@tiptap/extension-link` — Link node with href validation — **used in Story 4.2**
  - `@tiptap/extension-mention` — `@mention` autocomplete (re-uses `searchMembers` from Story 2.3) — **installed now, wired in a future story**
  - `@tiptap/extension-image` — Image node for embedded images — **installed now, wired in a future story**

  **Do NOT import or configure `extension-mention` or `extension-image` in `PostComposer` or `PostRichTextRenderer` for Story 4.2.** Only `StarterKit` + `extension-link` are used. The other two are pre-installed for future use.

### Task 2: Migration `0019_post_category.sql` + Schema Update (AC: #5)

- [x] 2.1 Create `src/db/migrations/0019_post_category.sql`:

  ```sql
  -- community_post_category: member-facing label for post classification.
  -- Separate from content_type (which describes technical content format).
  -- 'announcement' here is a member-selected label (e.g., "I'm announcing an event
  -- in my area") — distinct from content_type='announcement' which is admin-only.
  -- 'discussion' is the default for standard member posts.
  -- 'event' allows members to tag posts as event-related.

  CREATE TYPE community_post_category AS ENUM ('discussion', 'event', 'announcement');

  ALTER TABLE community_posts
    ADD COLUMN category community_post_category NOT NULL DEFAULT 'discussion';
  ```

  **CRITICAL:** Hand-write SQL — `drizzle-kit generate` fails with `server-only` import errors. This is the established pattern since Epic 1. Migration `0018` was the last in Story 4.1; `0019` is next.

- [x] 2.2 Update `src/db/schema/community-posts.ts` — add the new enum and column:

  ```ts
  // Add after postVisibilityEnum:
  export const postCategoryEnum = pgEnum("community_post_category", [
    "discussion",
    "event",
    "announcement",
  ]);
  ```

  And in the `communityPosts` table definition, add after `visibility`:

  ```ts
  category: postCategoryEnum("category").notNull().default("discussion"),
  ```

  Also update the TypeScript type exports:

  ```ts
  // Add to existing exports:
  export type PostCategory = "discussion" | "event" | "announcement";
  ```

  **CRITICAL:** No changes needed to `src/db/index.ts` — `communityPostsSchema` was already registered in Story 4.1. The drizzle-kit glob auto-discovers the updated schema file.

### Task 3: PERMISSION_MATRIX Update — Add Feed Post Permissions (AC: #2, #3)

- [x] 3.1 Update `src/services/permissions.ts` — add `canCreateFeedPost` and `maxFeedPostsPerWeek` to all three tiers in `PERMISSION_MATRIX`:

  ```ts
  const PERMISSION_MATRIX = {
    BASIC: {
      // ... existing fields ...
      canCreateFeedPost: false,
      maxFeedPostsPerWeek: 0,
    },
    PROFESSIONAL: {
      // ... existing fields ...
      canCreateFeedPost: true,
      maxFeedPostsPerWeek: 1, // FR51: Professional 1/week
    },
    TOP_TIER: {
      // ... existing fields ...
      canCreateFeedPost: true,
      maxFeedPostsPerWeek: 2, // FR51: Top-tier 2/week
    },
  } as const;
  ```

  **Source:** PRD FR51 — "The system can enforce role-based posting permissions (Basic: no general posts; Professional: 1/week; Top-tier: 2/week)." The `maxFeedPostsPerWeek` limit is SEPARATE from `maxArticlesPerWeek` (FR25) — two independent weekly counters per the epics.md note: "General feed post limits (FR51) are tracked separately from article publishing limits (FR25)."

- [x] 3.2 Add `canCreateFeedPost()` function to `src/services/permissions.ts` (after `canPublishArticle`):

  ```ts
  export async function canCreateFeedPost(userId: string): Promise<PermissionResult> {
    const tier = await getUserMembershipTier(userId);
    if (!PERMISSION_MATRIX[tier].canCreateFeedPost) {
      const result: PermissionResult = {
        allowed: false,
        reason: getTierUpgradeMessage("createFeedPost", "PROFESSIONAL"),
        tierRequired: "PROFESSIONAL",
      };
      await emitPermissionDenied(userId, "createFeedPost", result.reason!);
      return result;
    }
    return { allowed: true };
  }
  ```

  Also add to `UPGRADE_MESSAGE_KEYS`:

  ```ts
  createFeedPost: "Permissions.feedPostRequired",
  ```

  Also add a helper to expose the weekly limit for use by the service layer:

  ```ts
  export function getMaxFeedPostsPerWeek(tier: MembershipTier): number {
    return PERMISSION_MATRIX[tier].maxFeedPostsPerWeek;
  }
  ```

  **Note:** `checkFeedPostingLimit` is in `post-service.ts` (not permissions.ts) because it requires a DB call to count weekly posts — it uses the `getWeeklyFeedPostCount` query. Permissions.ts handles the tier GATE; the weekly count CHECK is in the service layer. The `getMaxFeedPostsPerWeek` helper avoids duplicating the limit values in the service.

- [x] 3.3 Update `src/services/permissions.test.ts` — add tests for `canCreateFeedPost`:

  Tests:
  - `canCreateFeedPost` returns `{ allowed: false }` for BASIC tier
  - `canCreateFeedPost` returns `{ allowed: true }` for PROFESSIONAL tier
  - `canCreateFeedPost` returns `{ allowed: true }` for TOP_TIER tier
  - `canCreateFeedPost` emits `member.permission_denied` for BASIC tier
  - `PERMISSION_MATRIX` BASIC has `maxFeedPostsPerWeek: 0`
  - `PERMISSION_MATRIX` PROFESSIONAL has `maxFeedPostsPerWeek: 1`
  - `PERMISSION_MATRIX` TOP_TIER has `maxFeedPostsPerWeek: 2`
  - `getMaxFeedPostsPerWeek` returns 0 for BASIC, 1 for PROFESSIONAL, 2 for TOP_TIER

### Task 4: Rate Limiter Preset (AC: #3)

- [x] 4.1 Add to `src/services/rate-limiter.ts` (after the `FEED_READ` entry):

  ```ts
  // Story 4.2 additions
  POST_CREATE: { maxRequests: 5, windowMs: 60_000 },  // 5 per minute per userId (abuse guard)
  ```

  **Note:** This rate limit is an abuse guard (5 submissions/min). It does NOT replace the weekly tier limit (FR51) — the weekly limit is enforced by `checkFeedPostingLimit()` in the service layer.

### Task 5: DB Queries — `src/db/queries/posts.ts` (AC: #3, #4)

- [x] 5.1 Create `src/db/queries/posts.ts`:

  ```ts
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
    mediaType: "image" | "video";
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
      mediaType: "image" | "video";
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
  ```

  **`platformFileUploads` schema location:** `src/db/schema/file-uploads.ts`. Import as: `import { platformFileUploads } from "@/db/schema/file-uploads"`. Registered in `src/db/index.ts` since Story 1.14.

  **`env.HETZNER_S3_PUBLIC_URL`:** Server-side env var validated in `src/env.ts:32`. The fallback URL (`${env.HETZNER_S3_PUBLIC_URL}/${row.objectKey}`) is only needed for in-flight uploads — `processedUrl` is populated in the happy path. Since `posts.ts` imports `@/env` (which transitively imports `server-only`), this file is server-only in practice. This is safe because `posts.ts` is only called from `post-service.ts` (which has explicit `import "server-only"`).

- [x] 5.2 Create `src/db/queries/posts.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("@/env", () => ({
    env: { HETZNER_S3_PUBLIC_URL: "https://cdn.example.com" },
  }));
  vi.mock("@/db");
  vi.mock("@/db/schema/community-posts", () => ({
    communityPosts: {
      authorId: "authorId",
      deletedAt: "deletedAt",
      groupId: "groupId",
      createdAt: "createdAt",
      id: "id",
      content: "content",
      contentType: "contentType",
      visibility: "visibility",
      category: "category",
    },
    communityPostMedia: {
      postId: "postId",
      mediaUrl: "mediaUrl",
      mediaType: "mediaType",
      altText: "altText",
      sortOrder: "sortOrder",
    },
  }));
  vi.mock("@/db/schema/file-uploads", () => ({
    platformFileUploads: {
      id: "id",
      processedUrl: "processedUrl",
      objectKey: "objectKey",
      fileType: "fileType",
    },
  }));
  ```

  Use explicit factory mocks for `@/db` — same pattern as `feed.test.ts`. Use `mockReset()` in `beforeEach`.

  Tests:
  - `getWeeklyFeedPostCount` returns 0 when no posts this week
  - `getWeeklyFeedPostCount` returns count of posts from current week (non-deleted, no group_id)
  - `getWeeklyFeedPostCount` uses Monday 00:00 UTC as week start
  - `insertPost` inserts with correct fields and returns the created row
  - `insertPostMedia` calls db.insert with media rows (skips when empty array)
  - `resolveFileUploadUrls` returns processedUrl when available
  - `resolveFileUploadUrls` falls back to `${env.HETZNER_S3_PUBLIC_URL}/${objectKey}` when processedUrl is null
  - `resolveFileUploadUrls` returns empty map for empty input

### Task 6: Post Service — `src/services/post-service.ts` (AC: #3)

- [x] 6.1 Create `src/services/post-service.ts`:

  ```ts
  import "server-only";
  import { canCreateFeedPost, getMaxFeedPostsPerWeek } from "@/services/permissions";
  import { getUserMembershipTier } from "@/db/queries/auth-permissions";
  import {
    getWeeklyFeedPostCount,
    insertPost,
    insertPostMedia,
    resolveFileUploadUrls,
  } from "@/db/queries/posts";
  import { eventBus } from "@/services/event-bus";

  // Re-export for use in Server Action
  export type { CreatePostData, CreatePostMediaData } from "@/db/queries/posts";

  export interface CreateFeedPostInput {
    authorId: string;
    content: string; // Plain text OR Tiptap JSON (stringified) for rich_text
    contentType: "text" | "rich_text" | "media";
    category: "discussion" | "event" | "announcement";
    fileUploadIds?: string[]; // IDs from platform_file_uploads (from FileUpload.onUploadComplete)
    mediaTypes?: ("image" | "video")[]; // Parallel array to fileUploadIds
  }

  export interface CreateFeedPostResult {
    success: true;
    postId: string;
  }

  export interface CreateFeedPostError {
    success: false;
    errorCode: "TIER_BLOCKED" | "LIMIT_REACHED" | "INTERNAL_ERROR";
    reason: string;
    resetDate?: string; // ISO string — next Monday 00:00 UTC for LIMIT_REACHED
  }

  export type CreateFeedPostResponse = CreateFeedPostResult | CreateFeedPostError;

  /**
   * Create a general feed post with permission and weekly limit checks.
   *
   * Flow:
   * 1. Tier gate: canCreateFeedPost() → Basic members blocked
   * 2. Weekly count gate: getWeeklyFeedPostCount() vs maxFeedPostsPerWeek
   * 3. Resolve media URLs from fileUploadIds
   * 4. Insert post + media
   * 5. Emit post.published via EventBus
   */
  export async function createFeedPost(
    input: CreateFeedPostInput,
  ): Promise<CreateFeedPostResponse> {
    // Step 1: Tier gate
    const tierCheck = await canCreateFeedPost(input.authorId);
    if (!tierCheck.allowed) {
      return {
        success: false,
        errorCode: "TIER_BLOCKED",
        reason: tierCheck.reason ?? "Permissions.feedPostRequired",
      };
    }

    // Step 2: Weekly limit gate
    const tier = await getUserMembershipTier(input.authorId);
    const weeklyLimit = getMaxFeedPostsPerWeek(tier);
    const currentCount = await getWeeklyFeedPostCount(input.authorId);
    if (currentCount >= weeklyLimit) {
      const nextMonday = getNextMonday();
      return {
        success: false,
        errorCode: "LIMIT_REACHED",
        reason: "Feed.composer.limitReached",
        resetDate: nextMonday.toISOString(),
      };
    }

    // Step 3: Resolve media URLs
    const fileUploadIds = input.fileUploadIds ?? [];
    const urlMap = await resolveFileUploadUrls(fileUploadIds);
    const media = fileUploadIds
      .map((id, i) => {
        const resolved = urlMap.get(id);
        return {
          mediaUrl: resolved?.mediaUrl ?? "",
          mediaType: (input.mediaTypes?.[i] ?? "image") as "image" | "video",
          sortOrder: i,
        };
      })
      .filter((m) => m.mediaUrl !== ""); // Skip unresolvable uploads

    // Determine actual contentType
    const contentType =
      media.length > 0 && input.contentType === "text" ? "media" : input.contentType;

    // Step 4: Insert post
    const post = await insertPost({
      authorId: input.authorId,
      content: input.content,
      contentType,
      visibility: "members_only", // General feed posts are members-only (AC: default)
      category: input.category,
    });
    await insertPostMedia(post.id, media);

    // Step 5: Emit EventBus event
    try {
      await eventBus.emit("post.published", {
        postId: post.id,
        authorId: input.authorId,
        category: input.category,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Non-critical: EventBus failure must not roll back post creation
    }

    return { success: true, postId: post.id };
  }

  /** Returns the next Monday at 00:00 UTC (the weekly limit reset time). */
  function getNextMonday(): Date {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun...6=Sat
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(now);
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);
    return nextMonday;
  }
  ```

  **Note:** `getMaxFeedPostsPerWeek(tier)` is exported from `permissions.ts` (Task 3.2) so the service doesn't duplicate FR51 limit values.

  **EventBus event type:** `post.published` — add to `src/types/events.ts` if it doesn't already exist. The payload shape `{ postId, authorId, category, timestamp }` follows the `domain.action` pattern from architecture.

- [x] 6.2 Create `src/services/post-service.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/permissions", () => ({
    canCreateFeedPost: vi.fn(),
    getMaxFeedPostsPerWeek: vi.fn(),
  }));
  vi.mock("@/db/queries/auth-permissions", () => ({
    getUserMembershipTier: vi.fn(),
  }));
  vi.mock("@/db/queries/posts", () => ({
    getWeeklyFeedPostCount: vi.fn(),
    insertPost: vi.fn(),
    insertPostMedia: vi.fn(),
    resolveFileUploadUrls: vi.fn(),
  }));
  vi.mock("@/services/event-bus", () => ({
    eventBus: { emit: vi.fn() },
  }));
  ```

  Use `mockReset()` in `beforeEach` for all mocks (NOT `clearAllMocks()` — those queue `Once` values).

  Tests:
  - `createFeedPost` returns `{ success: false, errorCode: "TIER_BLOCKED" }` when `canCreateFeedPost` returns `{ allowed: false }`
  - `createFeedPost` returns `{ success: false, errorCode: "LIMIT_REACHED" }` when weekly count ≥ limit (PROFESSIONAL at count 1)
  - `createFeedPost` returns `{ success: false, errorCode: "LIMIT_REACHED" }` when weekly count ≥ limit (TOP_TIER at count 2)
  - `createFeedPost` returns `{ success: true, postId }` when within limits
  - `createFeedPost` calls `insertPost` with correct fields
  - `createFeedPost` calls `insertPostMedia` with resolved media URLs
  - `createFeedPost` skips `insertPostMedia` when no media
  - `createFeedPost` emits `post.published` via EventBus on success
  - `createFeedPost` does NOT throw if EventBus emit fails (non-critical)
  - `createFeedPost` sets `contentType = "media"` when files are attached and input is "text"
  - `createFeedPost` includes `resetDate` (next Monday ISO) in LIMIT_REACHED response

### Task 7: Server Action — `src/features/feed/actions/create-post.ts` (AC: #3)

- [x] 7.1 Create `src/features/feed/actions/create-post.ts`:

  ```ts
  "use server";

  import { z } from "zod/v4";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { createFeedPost } from "@/services/post-service";
  import type { CreateFeedPostResponse } from "@/services/post-service";

  const createPostSchema = z.object({
    content: z.string().min(1, "Content is required").max(10_000),
    contentType: z.enum(["text", "rich_text", "media"]),
    category: z.enum(["discussion", "event", "announcement"]),
    fileUploadIds: z.array(z.string().uuid()).max(4).optional(),
    mediaTypes: z
      .array(z.enum(["image", "video"]))
      .max(4)
      .optional(),
  });

  export async function createPost(
    rawData: unknown,
  ): Promise<
    CreateFeedPostResponse | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
  > {
    // Auth check
    let userId: string;
    try {
      const session = await requireAuthenticatedSession();
      userId = session.userId;
    } catch {
      return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
    }

    // Validate input
    const parsed = createPostSchema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        errorCode: "VALIDATION_ERROR",
        reason: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    // Delegate to service
    return createFeedPost({
      authorId: userId,
      content: parsed.data.content,
      contentType: parsed.data.contentType,
      category: parsed.data.category,
      fileUploadIds: parsed.data.fileUploadIds,
      mediaTypes: parsed.data.mediaTypes,
    });
  }
  ```

  **Zod import:** `from "zod/v4"` (NOT `"zod"`) — established project pattern. Use `parsed.error.issues[0]` (NOT `parsed.issues[0]` which is undefined).

  **`"use server"` directive:** Server Actions require this at the top of the file. The action is called directly from the client component (via `useTransition`/TanStack Query `useMutation`).

- [x] 7.2 Create `src/features/feed/actions/create-post.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/permissions", () => ({
    requireAuthenticatedSession: vi.fn(),
  }));
  vi.mock("@/services/post-service", () => ({
    createFeedPost: vi.fn(),
  }));
  ```

  Tests:
  - Returns `{ success: false, errorCode: "VALIDATION_ERROR" }` when not authenticated
  - Returns `{ success: false, errorCode: "VALIDATION_ERROR" }` for invalid input (empty content)
  - Returns `{ success: false, errorCode: "VALIDATION_ERROR" }` for content > 10,000 chars
  - Returns `{ success: false, errorCode: "VALIDATION_ERROR" }` for invalid `category` value
  - Returns `{ success: false, errorCode: "VALIDATION_ERROR" }` for too many fileUploadIds (> 4)
  - Calls `createFeedPost` with correct authorId and parsed data on valid input
  - Returns `createFeedPost` result (passes through success/error responses)

### Task 8: i18n Translations (AC: all UI text)

**Add ALL keys BEFORE any component work (Tasks 9–12)**

- [x] 8.1 Add `Feed.composer.*` keys to `messages/en.json` under the existing `"Feed"` namespace:

  ```json
  "composer": {
    "placeholder": "What's on your mind, {name}?",
    "placeholderCollapsed": "Share an update with your community…",
    "richTextToggle": "Rich text",
    "addPhoto": "Add photo",
    "addVideo": "Add video",
    "removeMedia": "Remove attachment",
    "categoryLabel": "Category",
    "categoryDiscussion": "Discussion",
    "categoryEvent": "Event",
    "categoryAnnouncement": "Announcement",
    "submit": "Post",
    "submitting": "Posting…",
    "cancel": "Cancel",
    "tierBlocked": "General feed posts are available to Professional and Top-tier members. You can still post in group feeds.",
    "limitReached": "You've reached your weekly posting limit. Your limit resets on {resetDate}.",
    "errorGeneric": "Something went wrong. Please try again.",
    "mediaPreviewAlt": "Attachment preview",
    "mediaCount": "{count, plural, =1 {1 file} other {# files}} attached",
    "modalTitle": "Create post",
    "bold": "Bold",
    "italic": "Italic",
    "link": "Add link",
    "characterCount": "{count}/10,000"
  }
  ```

- [x] 8.2 Add corresponding Igbo keys to `messages/ig.json` under `"Feed"."composer"`:

  ```json
  "composer": {
    "placeholder": "Gịnị dị n'obi gị, {name}?",
    "placeholderCollapsed": "Kesaa ihe ọhụrụ n'ọha gị…",
    "richTextToggle": "Ederede nke ọma",
    "addPhoto": "Tinye foto",
    "addVideo": "Tinye vidiyo",
    "removeMedia": "Wepụ ihe etinyere",
    "categoryLabel": "Ụdị",
    "categoryDiscussion": "Mkparịta ụka",
    "categoryEvent": "Mmemme",
    "categoryAnnouncement": "Mkpọsa",
    "submit": "Zipu",
    "submitting": "Na-ezipu…",
    "cancel": "Kagbuo",
    "tierBlocked": "Ozi nke ọha dị naanị maka ndị otu Professional na Top-tier. Ị nwere ike izo ya na ìgwè ụlọ.",
    "limitReached": "Ị eruo oke ozi gị n'izu a. Oke gị ga-atọghị aka na {resetDate}.",
    "errorGeneric": "Ihe ọjọọ mere. Nwaa ọzọ.",
    "mediaPreviewAlt": "Nlele ihe etinyere",
    "mediaCount": "{count, plural, =1 {1 faịlụ} other {# faịlụ}} etinyere",
    "modalTitle": "Mepụta ozi",
    "bold": "Ọnụ ike",
    "italic": "Dị elu",
    "link": "Tinye njikọ",
    "characterCount": "{count}/10,000"
  }
  ```

### Task 9: `PostComposer` Component (AC: #1, #2, #3, #4)

- [x] 9.1 Create `src/features/feed/components/PostComposer.tsx`:

  The `PostComposer` component handles the collapsed trigger, expanded inline form (desktop), and full-screen Dialog (mobile). Uses TanStack Query `useMutation` to call the `createPost` Server Action, and invalidates the feed query on success.

  ```tsx
  "use client";

  import { useState, useTransition, useCallback } from "react";
  import { useEditor, EditorContent } from "@tiptap/react";
  import StarterKit from "@tiptap/starter-kit";
  import TiptapLink from "@tiptap/extension-link";
  import { useTranslations } from "next-intl";
  import { useQueryClient } from "@tanstack/react-query";
  import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
  import { Button } from "@/components/ui/button";
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
  import { FileUpload } from "@/components/shared/FileUpload";
  import { createPost } from "../actions/create-post";
  import type { PostCategory } from "@/db/schema/community-posts";
  import type { FeedSortMode, FeedFilter } from "@/config/feed";

  interface PostComposerProps {
    /** From session — shown in "What's on your mind, [Name]?" */
    userName: string;
    /** From server — if false, show tier-blocked message instead of editor */
    canCreatePost: boolean;
    /** Avatar URL from the user's community profile, if available */
    photoUrl?: string | null;
    /** Current feed sort/filter — used to invalidate the correct query key */
    sort: FeedSortMode;
    filter: FeedFilter;
  }

  interface PendingMedia {
    fileUploadId: string;
    mediaType: "image" | "video";
    filename: string; // From objectKey — used for filename-only preview (Option B)
  }

  export function PostComposer({
    userName,
    canCreatePost,
    photoUrl,
    sort,
    filter,
  }: PostComposerProps) {
    const t = useTranslations("Feed");
    const queryClient = useQueryClient();

    const [isExpanded, setIsExpanded] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [category, setCategory] = useState<PostCategory>("discussion");
    const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [limitResetDate, setLimitResetDate] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const initials = userName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    // Tiptap editor — StarterKit + Link
    const editor = useEditor({
      extensions: [StarterKit, TiptapLink.configure({ openOnClick: false })],
      editorProps: {
        attributes: {
          class: "min-h-[80px] outline-none prose prose-sm max-w-none",
          "aria-label": t("composer.placeholder", { name: userName }),
        },
      },
    });

    const getContentType = () => {
      if (!editor) return "text" as const;
      // If editor has any formatting, it's rich_text; if only text nodes, it's text
      const json = editor.getJSON();
      const hasFormatting = JSON.stringify(json).includes('"marks"');
      return hasFormatting ? ("rich_text" as const) : ("text" as const);
    };

    const handleSubmit = () => {
      if (!editor) return;
      const rawContent = editor.getText().trim();
      if (!rawContent && pendingMedia.length === 0) return;

      const contentType = getContentType();
      const content = contentType === "rich_text" ? JSON.stringify(editor.getJSON()) : rawContent;

      setSubmitError(null);
      setLimitResetDate(null);

      startTransition(async () => {
        const result = await createPost({
          content,
          contentType,
          category,
          fileUploadIds: pendingMedia.map((m) => m.fileUploadId),
          mediaTypes: pendingMedia.map((m) => m.mediaType),
        });

        if (!result.success) {
          if (result.errorCode === "LIMIT_REACHED" && "resetDate" in result) {
            setLimitResetDate(result.resetDate ?? null);
          }
          setSubmitError(result.reason);
          return;
        }

        // Success: clean up + invalidate feed query
        editor.commands.clearContent();
        setPendingMedia([]);
        setCategory("discussion");
        setIsExpanded(false);
        setIsDialogOpen(false);
        await queryClient.invalidateQueries({ queryKey: ["feed", sort, filter] });
      });
    };

    // Option B: FileUpload only gives (fileUploadId, objectKey) — no File object.
    // Show filename-only preview. Derive filename from objectKey, default mediaType to "image".
    const handleMediaUploadComplete = (fileUploadId: string, objectKey: string) => {
      const filename = objectKey.split("/").pop() ?? "attachment";
      const mediaType: "image" | "video" = objectKey.match(/\.(mp4|mov|webm|avi)$/i)
        ? "video"
        : "image";
      setPendingMedia((prev) => [...prev, { fileUploadId, mediaType, filename }]);
    };

    const removeMedia = (fileUploadId: string) => {
      setPendingMedia((prev) => prev.filter((m) => m.fileUploadId !== fileUploadId));
    };

    // BLOCKED: Basic tier members see a message, not the editor
    if (!canCreatePost) {
      return (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("composer.tierBlocked")}
        </div>
      );
    }

    // Collapsed trigger
    const CollapsedTrigger = (
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left text-muted-foreground hover:bg-accent/50 transition-colors min-h-[44px]"
        onClick={() => {
          // Desktop: expand inline; Mobile: open Dialog
          // We use a CSS-visible approach: both states set isExpanded=true,
          // but the Dialog only renders on screens below md breakpoint (768px)
          setIsExpanded(true);
          setIsDialogOpen(true);
        }}
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={photoUrl ?? undefined} alt={userName} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <span className="text-sm">{t("composer.placeholderCollapsed")}</span>
      </button>
    );

    // The expanded editor form (shared between inline and Dialog)
    const EditorForm = (
      <div className="space-y-3">
        {/* Tiptap editor */}
        <EditorContent
          editor={editor}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />

        {/* Format toolbar */}
        {editor && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-label={t("composer.bold")}
              aria-pressed={editor.isActive("bold")}
              className={`rounded px-2 py-1 text-xs font-bold min-h-[32px] border border-border transition-colors ${
                editor.isActive("bold")
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent"
              }`}
            >
              B
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-label={t("composer.italic")}
              aria-pressed={editor.isActive("italic")}
              className={`rounded px-2 py-1 text-xs italic min-h-[32px] border border-border transition-colors ${
                editor.isActive("italic")
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent"
              }`}
            >
              I
            </button>
          </div>
        )}

        {/* Media previews */}
        {pendingMedia.length > 0 && (
          <div
            className={`grid gap-2 ${pendingMedia.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
          >
            {pendingMedia.slice(0, 4).map((m) => (
              <div
                key={m.fileUploadId}
                className="relative rounded-md overflow-hidden bg-muted aspect-video"
              >
                <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground p-2 text-center">
                  <span>{m.mediaType === "image" ? "🖼" : "🎬"}</span>
                  <span className="truncate max-w-full">{m.filename}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeMedia(m.fileUploadId)}
                  aria-label={t("composer.removeMedia")}
                  className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 min-h-[32px] min-w-[32px] flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Category selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{t("composer.categoryLabel")}:</span>
          {(["discussion", "event", "announcement"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`rounded-full px-2.5 py-1 text-xs font-medium min-h-[32px] border transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              {t(
                `composer.category${cat.charAt(0).toUpperCase()}${cat.slice(1)}` as Parameters<
                  typeof t
                >[0],
              )}
            </button>
          ))}
        </div>

        {/* File upload (images + videos, max 4 combined) */}
        {pendingMedia.length < 4 && (
          <div className="flex gap-2">
            <FileUpload
              category="image"
              onUploadComplete={handleMediaUploadComplete}
              disabled={isPending}
            />
          </div>
        )}

        {/* Error states */}
        {submitError && (
          <p className="text-sm text-destructive" role="alert">
            {submitError === "Feed.composer.limitReached" && limitResetDate
              ? t("composer.limitReached", {
                  resetDate: new Date(limitResetDate).toLocaleDateString(),
                })
              : t("composer.errorGeneric")}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsExpanded(false);
              setIsDialogOpen(false);
              setSubmitError(null);
              editor?.commands.clearContent();
              setPendingMedia([]);
            }}
          >
            {t("composer.cancel")}
          </Button>
          <Button type="button" size="sm" disabled={isPending} onClick={handleSubmit}>
            {isPending ? t("composer.submitting") : t("composer.submit")}
          </Button>
        </div>
      </div>
    );

    return (
      <div className="space-y-2">
        {/* Collapsed trigger — always visible */}
        {!isExpanded && CollapsedTrigger}

        {/* Desktop: inline expanded form (md and above) */}
        {isExpanded && (
          <div className="hidden md:block rounded-lg border border-border bg-card p-4">
            {EditorForm}
          </div>
        )}

        {/* Mobile: Dialog (below md breakpoint) */}
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setIsExpanded(false);
          }}
        >
          <DialogContent className="md:hidden flex flex-col h-[100dvh] max-h-[100dvh] p-0">
            <DialogHeader className="px-4 py-3 border-b">
              <DialogTitle>{t("composer.modalTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-4 py-3">{EditorForm}</div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  ```

  **IMPLEMENTATION NOTES:**
  1. **FileUpload uses filename-only preview**: `FileUpload.onUploadComplete` gives `(fileUploadId, objectKey)` — no `File` object. The composer shows filename + media type icon. Full image previews (via `URL.createObjectURL`) would require changes to `FileUpload.tsx` which is out of scope. The feed refreshes after submit showing the real image.

  2. **Tiptap + SSR**: `useEditor` is safe in a `"use client"` component. No `dynamic(() => import(...), { ssr: false })` needed.

  3. **Mobile Dialog hiding on desktop**: `className="md:hidden"` on `DialogContent` hides the Dialog overlay on desktop. The CSS-only approach avoids `window.matchMedia` JS.

  4. **`queryClient.invalidateQueries`**: Invalidate `["feed", sort, filter]` — the exact key used by `useFeed` in `use-feed.ts`.

  5. **Character count**: `editor.getText().length` shown as `{t("composer.characterCount", { count })}` below the editor — nice-to-have.

- [x] 9.2 Create `src/features/feed/components/PostComposer.test.tsx` (`@vitest-environment jsdom`):

  **Mock Tiptap** — Tiptap relies on browser DOM APIs (ProseMirror) that jsdom doesn't fully support:

  ```ts
  vi.mock("@tiptap/react", () => ({
    useEditor: vi.fn(() => ({
      getJSON: vi.fn(() => ({ type: "doc", content: [] })),
      getText: vi.fn(() => "test content"),
      isActive: vi.fn(() => false),
      chain: vi.fn(() => ({ focus: vi.fn(() => ({ toggleBold: vi.fn(() => ({ run: vi.fn() })), toggleItalic: vi.fn(() => ({ run: vi.fn() })) })) })),
      commands: { clearContent: vi.fn() },
    })),
    EditorContent: ({ className }: { className?: string }) => (
      <div data-testid="tiptap-editor" className={className} />
    ),
  }));
  vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
  vi.mock("@tiptap/extension-link", () => ({ default: { configure: vi.fn(() => ({})) } }));
  vi.mock("../actions/create-post", () => ({
    createPost: vi.fn(),
  }));
  vi.mock("@/components/shared/FileUpload", () => ({
    FileUpload: ({ onUploadComplete }: { onUploadComplete: (id: string, key: string) => void }) => (
      <button onClick={() => onUploadComplete("upload-1", "uploads/photo.jpg")}>Upload</button>
    ),
  }));
  ```

  Tests:
  - Renders collapsed trigger with placeholder text when NOT expanded
  - Shows tier-blocked message when `canCreatePost = false`; does NOT render editor
  - Does NOT render blocked message when `canCreatePost = true`
  - Renders `data-testid="tiptap-editor"` when expanded
  - Shows cancel button when expanded; clicking it collapses the composer
  - Shows category buttons (Discussion, Event, Announcement)
  - Clicking a category button marks it as selected (`aria-pressed = true`)
  - Shows submit button labeled "Post" when not pending
  - Calls `createPost` server action on submit button click
  - Shows `limitReached` error message when server action returns `LIMIT_REACHED`
  - Media remove button calls `removeMedia` and removes preview from DOM
  - Invalidates feed query on success (mock `useQueryClient().invalidateQueries`)

### Task 10: Update `FeedItem` — Render Tiptap JSON (AC: #1)

- [x] 10.1 Create `src/features/feed/components/PostRichTextRenderer.tsx`:

  A read-only Tiptap editor that renders stored Tiptap JSON content (`rich_text` posts):

  ```tsx
  "use client";

  import { useMemo } from "react";
  import { useEditor, EditorContent } from "@tiptap/react";
  import StarterKit from "@tiptap/starter-kit";
  import TiptapLink from "@tiptap/extension-link";

  interface PostRichTextRendererProps {
    content: string; // Stringified Tiptap JSON
  }

  export function PostRichTextRenderer({ content }: PostRichTextRendererProps) {
    // Parse BEFORE useEditor to avoid conditional hook call.
    // useMemo ensures stable reference across renders.
    const parsedContent = useMemo(() => {
      try {
        return JSON.parse(content) as object;
      } catch {
        return null;
      }
    }, [content]);

    const editor = useEditor({
      extensions: [StarterKit, TiptapLink.configure({ openOnClick: false })],
      content: parsedContent ?? undefined,
      editable: false,
      editorProps: {
        attributes: {
          class: "text-sm leading-relaxed prose prose-sm max-w-none",
        },
      },
    });

    // Fallback: render as plain text if JSON was invalid
    if (!parsedContent) {
      return (
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</div>
      );
    }

    return <EditorContent editor={editor} />;
  }
  ```

- [x] 10.2 Update `src/features/feed/components/FeedItem.tsx` — replace the placeholder `whitespace-pre-wrap` render for `rich_text` posts with `PostRichTextRenderer`:

  ```tsx
  // Add import at top:
  import { PostRichTextRenderer } from "./PostRichTextRenderer";

  // In the content section, replace:
  // <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
  //   {post.content}
  // </div>
  // WITH:
  <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
    {post.contentType === "rich_text" ? (
      <PostRichTextRenderer content={post.content} />
    ) : (
      post.content
    )}
  </div>;
  ```

  **Also update `FeedPost` type** in `src/db/queries/feed.ts` to include `category`:

  ```ts
  // Add to FeedPost interface:
  category: "discussion" | "event" | "announcement";
  ```

  And include it in both `_getChronologicalFeedPage` and `_getAlgorithmicFeedPage` select clauses:

  ```ts
  category: communityPosts.category,
  ```

  And in the `posts` mapping:

  ```ts
  category: r.category as FeedPost["category"],
  ```

  **Category badge on FeedItem**: Add a category badge below the announcement badge. Use `Badge` variant `"outline"` for category (contrast with `"secondary"` for announcement):

  ```tsx
  {
    post.category !== "discussion" && (
      <Badge variant="outline" className="text-xs">
        {post.category === "event"
          ? t("composer.categoryEvent")
          : t("composer.categoryAnnouncement")}
      </Badge>
    );
  }
  ```

  (Only show badge for event/announcement categories; discussion is the default and needs no badge.)

- [x] 10.3 Update `src/features/feed/components/FeedItem.test.tsx` — add tests:
  - Renders `PostRichTextRenderer` for `content_type = "rich_text"` posts (mock `PostRichTextRenderer`)
  - Renders plain text `<div>` for `content_type = "text"` posts
  - Shows "Event" category badge for posts with `category = "event"`
  - Does NOT show category badge for `category = "discussion"`

  **Add to the mock list at top of test file:**

  ```ts
  vi.mock("./PostRichTextRenderer", () => ({
    PostRichTextRenderer: ({ content }: { content: string }) => (
      <div data-testid="rich-text-renderer">{content}</div>
    ),
  }));
  ```

### Task 11: Update `FeedList` — Add `PostComposer` (AC: #1)

- [x] 11.1 Update `src/features/feed/components/FeedList.tsx`:

  Add `PostComposer` as the first element in the feed (above `FeedControls`):

  ```tsx
  // Add to FeedListProps:
  interface FeedListProps {
    initialSort?: FeedSortMode;
    initialFilter?: FeedFilter;
    canCreatePost?: boolean; // NEW
    userName?: string; // NEW — from session.user.name
    userPhotoUrl?: string | null; // NEW — from community profile
  }

  // Add import:
  import { PostComposer } from "./PostComposer";

  // In the return of FeedList (before <FeedControls>):
  <PostComposer
    userName={userName ?? ""}
    canCreatePost={canCreatePost ?? false}
    photoUrl={userPhotoUrl}
    sort={sort}
    filter={filter}
  />;
  ```

  The `PostComposer` appears above the sort controls at the top of the feed. Even if `canCreatePost = false`, the `PostComposer` renders the tier-blocked message (so Basic members see the explanation).

- [x] 11.2 Update `src/features/feed/components/FeedList.test.tsx` — add mocks + tests:

  ```ts
  // Add to existing mocks:
  vi.mock("./PostComposer", () => ({
    PostComposer: ({ canCreatePost }: { canCreatePost: boolean }) => (
      <div data-testid="post-composer" data-can-create={String(canCreatePost)} />
    ),
  }));
  ```

  New tests:
  - Renders `PostComposer` with `canCreatePost=true` when prop is true
  - Renders `PostComposer` with `canCreatePost=false` when prop is false

### Task 12: Update `FeedPage` — Pass Permissions to `FeedList` (AC: #2)

- [x] 12.1 Update `src/app/[locale]/(app)/feed/page.tsx`:

  ```tsx
  import { auth } from "@/server/auth/config"; // NOT @/auth
  import { canCreateFeedPost, getPermissions } from "@/services/permissions";
  import { FeedList } from "@/features/feed";

  export default async function FeedPage() {
    const session = await auth();
    if (!session?.user) redirect("/");

    const userId = session.user.id!;
    const canPost = await canCreateFeedPost(userId);

    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <FeedList canCreatePost={canPost.allowed} userName={session.user.name ?? ""} />
      </main>
    );
  }
  ```

  **Note on `import { auth } from "@/server/auth/config"`**: This was a key debug finding from Story 4.1 — NOT `@/auth`. This is the Auth.js v5 pattern used in all app pages.

  **User photo for composer**: Loading `communityProfiles.photoUrl` for the composer avatar would require an additional DB call. For Story 4.2, use `session.user.image` (Auth.js session field) as the `userPhotoUrl`. If the user has a custom profile photo set via Story 1.9, it may differ, but this is acceptable for Story 4.2 scope.

- [x] 12.2 Update `src/app/[locale]/(app)/feed/page.test.tsx` — update mocks and add tests:

  ```ts
  vi.mock("@/services/permissions", () => ({
    canCreateFeedPost: vi.fn(),
    requireAuthenticatedSession: vi.fn(),
  }));
  ```

  New tests:
  - Passes `canCreatePost={true}` to `FeedList` when `canCreateFeedPost` returns `{ allowed: true }`
  - Passes `canCreatePost={false}` to `FeedList` when `canCreateFeedPost` returns `{ allowed: false }`
  - Passes `userName` from `session.user.name` to `FeedList`

### Task 13: Barrel Export Update

- [x] 13.1 Update `src/features/feed/index.ts` — add `PostComposer` and `PostRichTextRenderer` exports:

  ```ts
  export { PostComposer } from "./components/PostComposer";
  export { PostRichTextRenderer } from "./components/PostRichTextRenderer";
  ```

### Task 14: Update `PostPublishedEvent` — Add `category` Field

- [x] 14.1 Update the **existing** `PostPublishedEvent` interface in `src/types/events.ts` (line ~22). The event type and `EventMap` entry already exist — do NOT re-add them. Only add the `category` field:

  ```ts
  export interface PostPublishedEvent extends BaseEvent {
    postId: string;
    authorId: string;
    groupId?: string;
    category?: string; // NEW — "discussion" | "event" | "announcement"
  }
  ```

  This ensures TypeScript type safety for the `eventBus.emit("post.published", { ..., category })` call in `post-service.ts`.

### Task 15: Sprint Status Update

- [x] 15.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Change `4-2-post-creation-rich-media: ready-for-dev` → `4-2-post-creation-rich-media: done`

## Dev Notes

### No New DB Tables — Only a Column Addition

Story 4.2 does NOT create new tables. The `community_posts` and `community_post_media` tables were created in migration `0018` (Story 4.1). Story 4.2 only adds the `category` column to `community_posts` via migration `0019_post_category.sql`. The `platform_file_uploads` table (Story 1.14) is used for media URL resolution but needs no changes.

### Migration 0019 — Sequence Number

The last migration is `0018_community_posts.sql` (Story 4.1). Next is `0019_post_category.sql`. **Hand-write the SQL** — `drizzle-kit generate` fails with `server-only` import errors. This is the established pattern since Epic 1.

### Tiptap Packages — Must Install Before Implementation

The five Tiptap packages are NOT in `package.json`. Run `npm install` in Task 1 BEFORE touching any component files. Tiptap's `useEditor` and `EditorContent` are undefined until installed.

**Tiptap JSON format** (stored in `community_posts.content` when `content_type = "rich_text"`):

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello ", "marks": [{ "type": "bold" }] },
        { "type": "text", "text": "world" }
      ]
    }
  ]
}
```

This is Tiptap's native `getJSON()` output. Stored as a stringified JSON string in the TEXT column.

### FR51 Weekly Limits (Exact Values)

From PRD FR51: "Basic: no general posts; Professional: 1/week; Top-tier: 2/week"

These are hard-coded in `post-service.ts` as business rules from the spec. Week boundary = Monday 00:00 UTC (ISO week convention). The `getNextMonday()` helper computes the reset date shown to users when limit is reached.

**General feed posts ONLY** — the weekly counter excludes group posts (`group_id IS NOT NULL`). Group posts have separate limits managed in Epic 5.

### Server Action Pattern vs REST API

Post creation uses a **Server Action** (`features/feed/actions/create-post.ts`) per the architecture data flow specification. This is consistent with `createGroupConversation` (Story 2.3) and `searchMembers` (Story 2.3). Server Actions are called from client components via `useTransition`.

**No CSRF token needed**: Server Actions have built-in CSRF protection via Next.js. Unlike REST API routes wrapped in `withApiHandler`, Server Actions don't need the `Origin` header check.

**Testing Server Actions**: Server Actions are tested with `@vitest-environment node` by calling the exported function directly. They do NOT need the CSRF `Origin` header in tests.

### Tiptap Mocking in Tests

Tiptap uses ProseMirror internally which requires a full browser DOM (contenteditable, Selection API) that jsdom can't fully replicate. **Always mock Tiptap in component tests**:

```ts
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    getJSON: vi.fn(() => ({ type: "doc", content: [] })),
    getText: vi.fn(() => ""),
    isActive: vi.fn(() => false),
    chain: vi.fn(() => ({ focus: vi.fn(() => ({ toggleBold: vi.fn(() => ({ run: vi.fn() })), toggleItalic: vi.fn(() => ({ run: vi.fn() })) })) })),
    commands: { clearContent: vi.fn() },
  })),
  EditorContent: () => <div data-testid="tiptap-editor" />,
}));
vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-link", () => ({ default: { configure: vi.fn(() => ({})) } }));
```

Do NOT attempt to test the editor's actual formatting behavior (bold/italic) — test the component's state management (category selection, media removal, submit handling, error display).

### `PostRichTextRenderer` — Read-Only Tiptap Instance

The `PostRichTextRenderer` creates a non-editable Tiptap editor for rendering stored Tiptap JSON. The `editable: false` config disables all user interaction. This is the same approach used in read-only editors across the ecosystem. In tests, mock this component entirely:

```ts
vi.mock("./PostRichTextRenderer", () => ({
  PostRichTextRenderer: ({ content }: { content: string }) => (
    <div data-testid="rich-text-renderer">{content}</div>
  ),
}));
```

### FeedItem `category` Field — Update `FeedPost` Type

The `FeedPost` interface in `src/db/queries/feed.ts` must be updated to include `category`. Both `_getChronologicalFeedPage` and `_getAlgorithmicFeedPage` must include `category: communityPosts.category` in their `.select()` calls and map it in the return object. Forgetting this would cause a TypeScript error in `FeedItem.tsx` when accessing `post.category`.

### `canCreateFeedPost()` in `FeedPage` — Server-Side Permission Check

The `FeedPage` (server component) calls `canCreateFeedPost(userId)` to determine whether to render the full composer or the blocked message. This follows the architecture principle: "Every API endpoint must enforce tier-based permissions." For SSR pages, permission checks happen server-side before rendering the client component.

This call is SEPARATE from the permission check inside `post-service.ts`. The client-side check (in `FeedPage`) prevents Basic tier members from even seeing the editor UI. The server-side check (in the Server Action → service layer) is the authoritative guard against direct API calls.

### `FileUpload` Component — Filename-Only Preview

The existing `FileUpload` at `src/components/shared/FileUpload.tsx` has `onUploadComplete: (fileUploadId: string, objectKey: string) => void` — no raw `File` object. The composer uses filename-only preview (derived from `objectKey`). Full image previews would require `FileUpload.tsx` changes — out of scope for Story 4.2.

### Mock Pattern Reminders

- **Explicit factory mocks for DB query files**: `vi.mock("@/db/queries/posts", () => ({ fn: vi.fn() }))` — NEVER bare `vi.mock("@/db/queries/posts")` (triggers `@/db` cascade)
- **`mockReset()` not `clearAllMocks()`**: For any test file using `mockResolvedValueOnce` sequences
- **`vi.mock("server-only", () => ({}))`**: Required in every `@vitest-environment node` test that imports a service with `import "server-only"`
- **`useTransition` mock in component tests**: Mock `react`'s `useTransition` if you need to control the `isPending` state:
  ```ts
  vi.mock("react", async () => ({
    ...(await vi.importActual("react")),
    useTransition: () => [false, (fn: () => void) => fn()],
  }));
  ```

### Project Structure Notes

**New files (Story 4.2):**

- `src/db/migrations/0019_post_category.sql`
- `src/db/queries/posts.ts`
- `src/db/queries/posts.test.ts`
- `src/services/post-service.ts`
- `src/services/post-service.test.ts`
- `src/features/feed/actions/create-post.ts`
- `src/features/feed/actions/create-post.test.ts`
- `src/features/feed/components/PostComposer.tsx`
- `src/features/feed/components/PostComposer.test.tsx`
- `src/features/feed/components/PostRichTextRenderer.tsx`
- `src/features/feed/components/PostRichTextRenderer.test.tsx` (optional — or covered via FeedItem tests)

**Modified files:**

- `src/db/schema/community-posts.ts` — add `postCategoryEnum` + `category` column
- `src/db/queries/feed.ts` — add `category` to `FeedPost` type + select/map in both page fns
- `src/services/permissions.ts` — add `canCreateFeedPost` + `maxFeedPostsPerWeek` to matrix; add `canCreateFeedPost()` fn
- `src/services/permissions.test.ts` — add tests for new permission fn
- `src/services/rate-limiter.ts` — add `POST_CREATE` preset
- `src/features/feed/components/FeedItem.tsx` — rich_text rendering + category badge
- `src/features/feed/components/FeedItem.test.tsx` — add tests for new rendering
- `src/features/feed/components/FeedList.tsx` — add `PostComposer` + new props
- `src/features/feed/components/FeedList.test.tsx` — add `PostComposer` mock + tests
- `src/features/feed/index.ts` — export `PostComposer`, `PostRichTextRenderer`
- `src/app/[locale]/(app)/feed/page.tsx` — add `canCreateFeedPost` call + pass props
- `src/app/[locale]/(app)/feed/page.test.tsx` — add permission prop tests
- `src/types/events.ts` — add `post.published` event type
- `messages/en.json` — add `Feed.composer.*` keys
- `messages/ig.json` — add Igbo `Feed.composer.*` keys
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update status

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 4, Story 4.2, lines ~1791–1840]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR51: "Basic: no general posts; Professional: 1/week; Top-tier: 2/week"]
- [Source: `docs/decisions/rich-text-editor.md` — Tiptap (MIT) decision, packages to install, content format (Tiptap JSON), `searchMembers` reuse note]
- [Source: `_bmad-output/implementation-artifacts/4-1-news-feed-post-display.md` — `import { auth } from "@/server/auth/config"` (NOT `@/auth`), FeedPost type, feed.ts query patterns, FeedList/FeedItem component structure]
- [Source: `src/services/permissions.ts` — PERMISSION_MATRIX structure, `canCreateGroup` function pattern, `emitPermissionDenied` pattern, `UPGRADE_MESSAGE_KEYS` map]
- [Source: `src/db/queries/feed.ts` — FeedPost interface, feed query patterns with Drizzle, `inArray` usage, community-posts schema imports]
- [Source: `src/config/upload.ts` — UploadCategory types (image/video), size limits (image: 10MB, video: 100MB)]
- [Source: `src/components/shared/FileUpload.tsx` — `onUploadComplete(fileUploadId, objectKey)` signature, presign flow]
- [Source: `src/features/chat/components/RichTextRenderer.tsx` — NOT reused for Tiptap JSON (different format); PostRichTextRenderer is a new read-only Tiptap instance]
- [Source: `src/services/event-bus.ts` — `eventBus.emit()` pattern used in NotificationService]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — line 272: Server Actions for mutations; line 631: optimistic updates for post creation; line 790-794: feed/posts route structure; line 1174-1178: data flow for post creation]
- [Source: `src/features/feed/actions/` — create-post.ts follows createGroupConversation.ts pattern (Story 2.3)]
- [Source: `src/test/vi-patterns.ts` — `mockReset()` pattern, explicit factory mock pattern]
- [Source: `_bmad-output/implementation-artifacts/3-3-member-suggestions-dashboard-widget.md` — `errorResponse` takes single ProblemDetails object; use `ApiError` for route errors]
- [Source: `src/services/rate-limiter.ts` — RATE_LIMIT_PRESETS pattern, FEED_READ as reference]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Dialog mock rendered both desktop inline + dialog in jsdom (CSS `md:hidden` doesn't apply). Fixed by mocking Dialog to return null in tests — desktop inline form covers all state testing.

### Completion Notes List

- ✅ Task 1: Installed Tiptap v3.20.0 packages (5 packages: react, starter-kit, extension-link, extension-mention, extension-image). Only StarterKit + Link used in Story 4.2 components.
- ✅ Task 2: Created `0019_post_category.sql` migration (hand-written per established pattern); updated `community-posts.ts` schema with `postCategoryEnum` and `category` column; added `PostCategory` type export.
- ✅ Task 3: Added `canCreateFeedPost`, `getMaxFeedPostsPerWeek` to `permissions.ts`; updated `PERMISSION_MATRIX` with FR51 values (BASIC: 0, PRO: 1, TOP: 2); added 10 new permission tests.
- ✅ Task 4: Added `POST_CREATE: { maxRequests: 5, windowMs: 60_000 }` to rate-limiter presets.
- ✅ Task 5: Created `src/db/queries/posts.ts` with `getWeeklyFeedPostCount`, `insertPost`, `insertPostMedia`, `resolveFileUploadUrls`; 14 tests passing.
- ✅ Task 6: Created `src/services/post-service.ts` with `createFeedPost` (tier gate → weekly limit gate → media resolution → insert → EventBus emit); 12 tests passing.
- ✅ Task 7: Created `"use server"` Server Action `create-post.ts` with Zod v4 validation; 8 tests passing.
- ✅ Task 8: Added 25 `Feed.composer.*` i18n keys to both `en.json` and `ig.json`.
- ✅ Task 9: Created `PostComposer.tsx` (collapsed trigger, desktop inline, mobile Dialog, Tiptap editor, category selector, media upload/preview, error handling); 12 tests passing.
- ✅ Task 10: Created `PostRichTextRenderer.tsx` (read-only Tiptap instance); updated `FeedItem.tsx` to render rich_text posts via `PostRichTextRenderer` and show category badges; updated `feed.ts` `FeedPost` type with `category`; 16 tests passing (+5 new).
- ✅ Task 11: Updated `FeedList.tsx` with `PostComposer` + new props (`canCreatePost`, `userName`, `userPhotoUrl`); 13 tests passing (+2 new).
- ✅ Task 12: Updated `FeedPage` to call `canCreateFeedPost` server-side and pass result to `FeedList`; 6 tests passing (+3 new).
- ✅ Task 13: Updated `src/features/feed/index.ts` barrel exports with `PostComposer` and `PostRichTextRenderer`.
- ✅ Task 14: Added `category?: string` to `PostPublishedEvent` in `src/types/events.ts`.
- ✅ Task 15: Sprint status updated to `review`.

**Total: 2004/2004 tests passing (66 new + 4 review fix tests, 0 regressions)**

### File List

**New files:**

- `src/db/migrations/0019_post_category.sql`
- `src/db/queries/posts.ts`
- `src/db/queries/posts.test.ts`
- `src/services/post-service.ts`
- `src/services/post-service.test.ts`
- `src/features/feed/actions/create-post.ts`
- `src/features/feed/actions/create-post.test.ts`
- `src/features/feed/components/PostComposer.tsx`
- `src/features/feed/components/PostComposer.test.tsx`
- `src/features/feed/components/PostRichTextRenderer.tsx`

**Modified files:**

- `package.json`
- `package-lock.json`
- `src/db/schema/community-posts.ts`
- `src/db/queries/feed.ts`
- `src/services/permissions.ts`
- `src/services/permissions.test.ts`
- `src/services/rate-limiter.ts`
- `src/features/feed/components/FeedItem.tsx`
- `src/features/feed/components/FeedItem.test.tsx`
- `src/features/feed/components/FeedList.tsx`
- `src/features/feed/components/FeedList.test.tsx`
- `src/features/feed/index.ts`
- `src/app/[locale]/(app)/feed/page.tsx`
- `src/app/[locale]/(app)/feed/page.test.tsx`
- `src/types/events.ts`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-2-post-creation-rich-media.md`

## Senior Developer Review (AI)

**Reviewed by:** Dev on 2026-03-01
**Reviewer model:** claude-opus-4-6
**Outcome:** Approved (after fixes)

### Findings Summary

| #   | Severity | Description                                                                                     | Resolution                                                                  |
| --- | -------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| H1  | HIGH     | `POST_CREATE` rate limit preset defined but never wired into Server Action                      | **Fixed** — Added `applyRateLimit()` call to `create-post.ts` + 2 new tests |
| H2  | HIGH     | `permissions.test.ts` uses `clearAllMocks()` instead of `mockReset()` (Epic 3 retro convention) | **Fixed** — Switched to individual `mockReset()` calls                      |
| H3  | HIGH     | No validation that `fileUploadIds` and `mediaTypes` arrays have matching lengths                | **Fixed** — Added `.refine()` to Zod schema + 1 new test                    |
| M1  | MEDIUM   | `package.json` and `package-lock.json` missing from story File List                             | **Fixed** — Added to File List                                              |
| M2  | MEDIUM   | Cancel handler doesn't reset `category` state (unlike success handler)                          | **Fixed** — Added `setCategory("discussion")` to cancel + 1 new test        |
| M3  | MEDIUM   | `PostRichTextRenderer` creates full Tiptap editor per feed item (perf concern)                  | **Noted** — Added TODO comment; lightweight renderer deferred               |
| M4  | MEDIUM   | Error display only shows generic message for non-LIMIT_REACHED errors                           | **Fixed** — Added `TIER_BLOCKED` → `tierBlocked` message mapping            |
| L1  | LOW      | No `PostRichTextRenderer.test.tsx` (noted as optional in story)                                 | Not fixed — mocked in FeedItem tests                                        |
| L2  | LOW      | `useTransition` mock always returns `isPending=false` — pending state UI untested               | Not fixed — acceptable for component-level tests                            |

### Review Fix Tests Added: 4

- `create-post.test.ts`: rate limit exceeded returns VALIDATION_ERROR
- `create-post.test.ts`: applyRateLimit called with correct key
- `create-post.test.ts`: mismatched fileUploadIds/mediaTypes returns VALIDATION_ERROR
- `PostComposer.test.tsx`: cancel resets category to Discussion

### Post-Fix Test Count: 2004/2004 passing (0 regressions)

### Change Log

| Date       | Action        | Details                                                               |
| ---------- | ------------- | --------------------------------------------------------------------- |
| 2026-03-01 | Code review   | 3 HIGH, 4 MEDIUM, 2 LOW findings. 5 fixed, 2 noted, 2 deferred (LOW). |
| 2026-03-01 | Status → done | All HIGH/MEDIUM fixed. All ACs verified. 2004 tests passing.          |
