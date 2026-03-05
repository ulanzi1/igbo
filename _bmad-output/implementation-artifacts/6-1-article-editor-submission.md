# Story 6.1: Article Editor & Submission

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authorized member (Professional or Top-tier tier),
I want to write and submit articles using a bilingual rich text editor with multimedia support,
so that I can share cultural knowledge, stories, and insights with the community.

## Acceptance Criteria

1. **Given** a Professional or Top-tier member navigates to `/articles/new`
   **When** the article editor loads
   **Then** the system displays a full-width focused writing view with a bilingual dual-pane editor (desktop: side-by-side; mobile: tab toggle)
   **And** the English pane is always visible and required
   **And** the Igbo pane is always mounted (no remount on tab switch) but optional
   **And** each pane has: title input, Tiptap rich text body (StarterKit + Image + Link + Mention extensions), and a formatting toolbar (headings, bold, italic, lists, blockquotes, links, image insertion)

2. **Given** the author is composing an article
   **When** they fill in article metadata
   **Then** they can specify: category (Discussion | Announcement | Event), free-form tags via `community_article_tags`, and a cover image (via FileUpload component)
   **And** Top-tier members can also select article visibility (Guest or Members-only); Professional members are forced to `members_only`
   **And** the author can save a draft at any time by clicking "Save Draft" (auto-creates or updates the article with `status: draft`)

3. **Given** a member's tier determines article publishing eligibility
   **When** the system checks `canPublishArticle(userId)` before allowing submission
   **Then** Basic-tier members cannot access the editor — they see a permission error
   **And** Professional members can submit up to 1 article per week (counts pending_review + published articles created in the rolling 7-day window)
   **And** Top-tier members can submit up to 2 articles per week
   **And** if the weekly limit is reached, submission is blocked with an i18n error: `Articles.permissions.weeklyLimitReached`

4. **Given** the author submits their article
   **When** they click "Submit for Review" (English title + body must be non-empty; Igbo title required only if Igbo body is non-empty)
   **Then** the article status changes from `draft` to `pending_review`
   **And** the author sees a confirmation toast: i18n key `Articles.submit.successMessage`
   **And** the system emits `article.submitted` via EventBus with `{ articleId, authorId }`
   **And** the author is redirected to their articles dashboard or profile

5. **Given** the database needs article support
   **When** this story is implemented
   **Then** migration `0027_articles.sql` creates the `community_articles` table:
   - `id UUID PK DEFAULT gen_random_uuid()`
   - `author_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE`
   - `title VARCHAR(255) NOT NULL`
   - `title_igbo VARCHAR(255)` (nullable; required only when `content_igbo` is non-null)
   - `slug VARCHAR(300) NOT NULL UNIQUE`
   - `content TEXT NOT NULL` (Tiptap JSON stringified)
   - `content_igbo TEXT` (nullable; Tiptap JSON stringified for Igbo version)
   - `cover_image_url TEXT`
   - `language community_article_language NOT NULL DEFAULT 'en'` (enum: `en`, `ig`, `both`)
   - `visibility community_article_visibility NOT NULL DEFAULT 'members_only'` (enum: `guest`, `members_only`)
   - `status community_article_status NOT NULL DEFAULT 'draft'` (enum: `draft`, `pending_review`, `published`, `rejected`)
   - `category community_article_category NOT NULL DEFAULT 'discussion'` (enum: `discussion`, `announcement`, `event`)
   - `is_featured BOOLEAN NOT NULL DEFAULT false`
   - `reading_time_minutes INTEGER NOT NULL DEFAULT 1`
   - `view_count INTEGER NOT NULL DEFAULT 0`
   - `like_count INTEGER NOT NULL DEFAULT 0`
   - `comment_count INTEGER NOT NULL DEFAULT 0`
   - `deleted_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Indexes: `(author_id)`, `(status, created_at DESC)`, `(slug)`
     **And** the migration creates the `community_article_tags` table:
   - `article_id UUID NOT NULL REFERENCES community_articles(id) ON DELETE CASCADE`
   - `tag VARCHAR(50) NOT NULL`
   - `PRIMARY KEY (article_id, tag)`
   - Index: `(tag)` for future tag-based search

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: #5)
  - [x] Create `src/db/schema/community-articles.ts` with Drizzle schema for `communityArticles` and `communityArticleTags`; export enums `articleLanguageEnum`, `articleVisibilityEnum`, `articleStatusEnum`, `articleCategoryEnum`
  - [x] Register in `src/db/index.ts`: `import * as communityArticlesSchema from "./schema/community-articles"`
  - [x] Hand-write `src/db/migrations/0027_articles.sql` (do NOT use drizzle-kit generate — it fails with `server-only`)
  - [x] Include all 4 CREATE TYPE statements (enums) before CREATE TABLE
  - [x] Add `community_article_tags` table with composite PK (article_id, tag) and cascade FK

- [x] Task 2: Article query helpers (AC: #3, #4, #5)
  - [x] Create `src/db/queries/articles.ts` with:
    - `createArticle(data)` → INSERT returning id + slug
    - `updateArticle(articleId, authorId, data)` → UPDATE with ownership check (author_id = :authorId)
    - `submitArticleForReview(articleId, authorId)` → UPDATE status to `pending_review`
    - `getArticleForEditing(articleId, authorId)` → SELECT with author ownership check; returns null if not found/not owned
    - `countWeeklyArticleSubmissions(authorId)` → COUNT articles where author_id = :authorId AND created_at >= NOW() - INTERVAL '7 days' AND status IN ('pending_review', 'published')
    - `upsertArticleTags(articleId, tags: string[])` → DELETE existing + INSERT new tags in a transaction
  - [x] Do NOT add `import "server-only"` — query files (`posts.ts`, `follows.ts`, `feed.ts`) intentionally omit it so tests can import them directly; `server-only` belongs only in the service file
  - [x] Export all query functions as named exports (no default export)

- [x] Task 3: Article service (AC: #2, #3, #4)
  - [x] Create `src/services/article-service.ts` with:
    - `saveDraft(authorId, data)` → validates tier access, calls `createArticle` or `updateArticle`, returns `{ articleId, slug }`
    - `submitArticle(authorId, articleId)` → validates weekly limit via `countWeeklyArticleSubmissions`, calls `submitArticleForReview`, emits `article.submitted` EventBus event, returns `{ articleId }`
    - `getArticleForEditingService(authorId, articleId)` → thin wrapper over query, throws `ApiError({ status: 404 })` if not found
  - [x] Updated `canPublishArticle(userId)` in `src/services/permissions.ts` — added weekly count check; kept `PermissionResult` return type; used dynamic import for articles query to avoid circular deps
  - [x] Read weekly limit from `PERMISSION_MATRIX[tier].maxArticlesPerWeek` (already defined: BASIC=0, PROFESSIONAL=1, TOP_TIER=2) — no new constants
  - [x] `ArticleSubmittedEvent` and `"article.submitted"` already exist in `src/types/events.ts` — no changes needed
  - [x] Services communicate via EventBus only — no direct cross-service calls

- [x] Task 4: API routes (AC: #2, #3, #4)
  - [x] `POST /api/v1/articles/route.ts` — create draft; returns `{ articleId, slug }` with status 201
  - [x] `PATCH /api/v1/articles/[articleId]/route.ts` — update draft; all fields optional; returns `{ articleId }`
  - [x] `POST /api/v1/articles/[articleId]/submit/route.ts` — submit for review; returns `{ articleId, status: "pending_review" }` with status 200
  - [x] All routes: `withApiHandler()`, `requireAuthenticatedSession()`, Zod (`"zod/v4"`), `ApiError` for RFC 7807 errors
  - [x] `successResponse(data, undefined, 201)` for 201 responses
  - [x] Rate limit: `POST_CREATE` for POST create; `PROFILE_UPDATE` for PATCH + POST submit
  - [x] `generateSlug(title)` in `src/lib/slug.ts`

- [x] Task 5: UI — Tiptap editor components (AC: #1, #2)
  - [x] `src/features/articles/components/TiptapEditor.tsx` — `useEditor({ immediatelyRender: false })`, StarterKit + Image + Link + Mention; formatting toolbar
  - [x] `src/features/articles/components/BilingualEditorPane.tsx` — `TitleInput` + `TiptapEditor`; lang + required props
  - [x] `src/features/articles/components/ArticleMetaForm.tsx` — category, tags (max 10), cover image FileUpload, visibility selector (Top-tier only)
  - [x] `src/features/articles/components/ArticleEditor.tsx` — side-by-side desktop; mobile tab toggle with both Tiptap instances always mounted; Save Draft + Submit for Review buttons
  - [x] No new packages — reused `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/extension-image`, `@tiptap/extension-link`
  - [x] `buildMentionSuggestion()` in `src/features/articles/utils/mention-suggestion.ts` — fetches from `GET /api/v1/members?q=`
  - [x] `src/features/articles/index.ts` barrel export

- [x] Task 6: Page routes + navigation (AC: #1)
  - [x] `src/app/[locale]/(app)/articles/new/page.tsx` — Server Component; `canPublishArticle` gate; redirects non-eligible
  - [x] `src/app/[locale]/(app)/articles/[articleId]/edit/page.tsx` — loads existing draft; 404 if not owned
  - [x] `src/features/articles/actions/article-actions.ts` — `saveDraftAction`, `submitArticleAction`
  - [x] "Write an Article" link added to profile dropdown in `TopNav.tsx` with i18n key `Articles.nav.writeArticle`

- [x] Task 7: EventBus wiring (AC: #4)
  - [x] `article.submitted` emitted from `article-service.ts` (via EventBus, not from route)
  - [x] Checked bridge — `@/db/queries/articles` NOT imported in `eventbus-bridge.ts` — no bridge mock needed
  - [x] Added `vi.mock("@/db/queries/articles", ...)` to `permissions.test.ts` (triggered by dynamic import in `canPublishArticle`)

- [x] Task 8: i18n strings (AC: #1–#4)
  - [x] `Articles` namespace added to `messages/en.json` and `messages/ig.json` with all required keys
  - [x] Zero hardcoded English strings in JSX or error responses

- [x] Task 9: Tests (AC: #1–#5)
  - [x] `src/db/queries/articles.test.ts` — 9 tests: createArticle, updateArticle, submitArticleForReview, countWeeklyArticleSubmissions, upsertArticleTags; `@vitest-environment node`
  - [x] `src/services/article-service.test.ts` — 13 tests: saveDraft (creates/updates), submitArticle (weekly limit enforced, event emitted, status transition)
  - [x] `src/app/api/v1/articles/route.test.ts` — 4 tests: 201 create, 403 Basic-tier, 422 validation, 401 unauthenticated; CSRF headers
  - [x] `src/app/api/v1/articles/[articleId]/route.test.ts` — 3 tests: 200 update, 403, 404
  - [x] `src/app/api/v1/articles/[articleId]/submit/route.test.ts` — 4 tests: 200 submit, 409 limit, 403 tier, 404 not found
  - [x] `src/features/articles/components/ArticleEditor.test.tsx` — 8 tests: render panes, submit disabled/enabled, tab toggle both mounted, igbo title validation, cover image upload
  - [x] All new server test files: `// @vitest-environment node` pragma
  - [x] `mockReset()` in `beforeEach` for all service tests
  - [x] CSRF headers in all mutating route tests
  - [x] 2825/2825 passing (baseline was 2777; +48 new tests + 7 review fix tests; 0 regressions)

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (2818/2818 — run `npx vitest run`)
- [x] `@/db/queries/articles` NOT imported in `eventbus-bridge.ts` — no bridge mock needed. Added mock to `permissions.test.ts` due to dynamic import in `canPublishArticle`
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — used in POST /articles create route
- [x] No new member statuses/roles — N/A for this story

## Dev Notes

### Developer Context (Most Important)

Story 6.1 introduces the **Articles feature** — a brand-new domain with zero existing code. No article schema, service, queries, or components exist yet. Build from scratch, following patterns established in Epics 1–5.

**Key prior-art reference points:**

- `community-posts.ts` schema → follow enum naming convention (`communityPostContentTypeEnum` → `articleLanguageEnum`)
- `src/db/queries/posts.ts` → follow query module structure (named exports, NO `"server-only"` — query files omit it so tests can import directly)
- `src/services/post-service.ts` → follow service-to-query delegation pattern
- `src/features/feed/components/PostComposer.tsx` → reference for Tiptap `useEditor()` config pattern (StarterKit + Link only — PostComposer does NOT use Image or Mention extensions; those must be configured from scratch using Tiptap docs)
- `src/components/shared/FileUpload.tsx` → **reuse as-is** for cover image; do NOT create new upload infrastructure

**Bilingual editor design (authoritative reference):** `docs/decisions/bilingual-editor-prototype.md`
Key decisions from that doc:

1. Two **independent** Tiptap instances (not a shared editor) — content is independent between panes
2. JSON storage format: `editor.getJSON()` → stored as TEXT (Tiptap JSON stringified)
3. Both panes always mounted — no remount on mobile tab switch (prevents content loss)
4. English pane required; Igbo pane optional (empty Igbo = `content_igbo: null`, `language: "en"`)
5. Derived language field: if `igContent` non-empty → `language: "both"`; else → `language: "en"`

**ISR note (for reading page, Story 6.3 only):** `docs/decisions/isr-pattern.md` — Story 6.1 is the write path only; ISR applies in Story 6.3 reading experience.

**Tiptap packages — already installed from Story 4.2:**

```
@tiptap/react, @tiptap/starter-kit, @tiptap/extension-mention, @tiptap/extension-image, @tiptap/extension-link
```

**Do NOT** run `npm install` / `bun add` for these — they are already in `package.json`.

### Technical Requirements

- Maintain existing route and error contract:
  - Wrap routes with `withApiHandler()`
  - Use `requireAuthenticatedSession()`
  - Throw `ApiError` from `@/lib/api-error` for RFC 7807 payloads
  - **`successResponse(data, meta?, status=200)`** — status is 3rd arg! Use `successResponse({ articleId }, undefined, 201)` for creation responses
- Keep all business logic in `article-service.ts`, all SQL in `src/db/queries/articles.ts`
- Service side effects via EventBus events (typed). No direct cross-service coupling.
- Import Zod from `"zod/v4"` (NOT `"zod"`); use `parsed.error.issues[0]` for validation errors
- Use `import "server-only"` at the top of service files (`article-service.ts`) — do NOT add it to query files (`articles.ts`) as query files in this project omit it (see `posts.ts` line 1 comment)
- Use `import type` for type-only imports

**Slug generation:** Implement `generateSlug(title: string): string` in `src/lib/slug.ts`:

```ts
import { randomBytes } from "node:crypto";
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const suffix = randomBytes(3).toString("hex"); // 6-char hex suffix
  return `${base}-${suffix}`;
}
```

**Reading time calculation:** `Math.max(1, Math.ceil(wordCount / 200))` minutes; compute from plain-text extraction of Tiptap JSON before storing.

**`canPublishArticle(userId)` in `src/services/permissions.ts`:** This function **already exists** (line ~85) with a TODO for weekly count. It calls `getUserMembershipTier(userId)` from `@/db/queries/auth-permissions` and returns `PermissionResult { allowed, reason?, tierRequired? }`. Update it to also check `countWeeklyArticleSubmissions` and compare against `PERMISSION_MATRIX[tier].maxArticlesPerWeek`. Keep the existing `PermissionResult` return type.

**Weekly limit check:** Rolling 7-day window (NOT calendar week). `countWeeklyArticleSubmissions` counts articles with `status IN ('pending_review', 'published')` and `created_at >= NOW() - INTERVAL '7 days'`. Limits already defined in `PERMISSION_MATRIX[tier].maxArticlesPerWeek`: BASIC=0, PROFESSIONAL=1, TOP_TIER=2.

**Visibility constraint:**

- Professional members: always `members_only` — do not show visibility selector in UI
- Top-tier members: `guest` or `members_only` — show selector
- **Enum mapping note:** The DB enum uses `('guest', 'members_only')` but `PERMISSION_MATRIX` uses `articleVisibility: ["MEMBERS_ONLY", "PUBLIC"]`. The DB enum values are authoritative — map at the service layer: `PUBLIC` → `guest`, `MEMBERS_ONLY` → `members_only`. Validate that the submitted visibility value is allowed for the user's tier by checking `PERMISSION_MATRIX[tier].articleVisibility`.

### Library / Framework Requirements

- **Tiptap** (already installed): `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/extension-image`, `@tiptap/extension-link` — reference `PostComposer.tsx` for `useEditor()` init pattern only (it uses StarterKit + Link); Image + Mention extensions have no existing usage in the codebase and must be configured from scratch
- **No new packages needed** for this story
- Drizzle hand-written SQL migrations (drizzle-kit generate fails with `server-only`)
- Next.js App Router route handlers, `"use client"` for editor components
- Vitest + Testing Library for tests
- `sanitize-html` for any server-side HTML sanitization (already installed)
- `zod/v4` for request validation

### File Structure Requirements

New files to create:

- `src/db/schema/community-articles.ts` — Drizzle schema + type exports
- `src/db/migrations/0027_articles.sql` — Hand-written SQL migration
- `src/db/queries/articles.ts` — Query helpers
- `src/services/article-service.ts` — Business logic
- `src/lib/slug.ts` — Slug generation utility
- `src/features/articles/components/TiptapEditor.tsx`
- `src/features/articles/components/BilingualEditorPane.tsx`
- `src/features/articles/components/ArticleMetaForm.tsx`
- `src/features/articles/components/ArticleEditor.tsx`
- `src/features/articles/utils/mention-suggestion.ts` — `buildMentionSuggestion()` helper for Tiptap Mention extension (new — no existing equivalent in codebase)
- `src/features/articles/actions/article-actions.ts` — Server actions (saveDraftAction, submitArticleAction)
- `src/features/articles/index.ts` — Barrel export
- `src/app/[locale]/(app)/articles/new/page.tsx`
- `src/app/[locale]/(app)/articles/[articleId]/edit/page.tsx`

Modified files:

- `src/db/index.ts` — Add `import * as communityArticlesSchema from "./schema/community-articles"`
- `src/types/events.ts` — already contains `ArticleSubmittedEvent`, `ArticlePublishedEvent`, `ArticleCommentedEvent` + event names — NO changes needed
- `src/services/permissions.ts` — Update existing `canPublishArticle(userId)` to add weekly count check (function already exists with TODO)
- `messages/en.json` — Add `Articles` namespace
- `messages/ig.json` — Add `Articles` namespace translations
- `src/app/[locale]/(app)/layout.tsx` OR nav component — Add "Write an Article" link (if nav component exists, prefer that)

Test files to create (co-located with source):

- `src/db/queries/articles.test.ts`
- `src/services/article-service.test.ts`
- `src/app/api/v1/articles/route.test.ts`
- `src/app/api/v1/articles/[articleId]/route.test.ts`
- `src/app/api/v1/articles/[articleId]/submit/route.test.ts`
- `src/features/articles/components/ArticleEditor.test.tsx`

### Testing Requirements

**Test patterns (critical — same as previous stories):**

- `// @vitest-environment node` pragma for all server-side test files (queries, services, route tests)
- `mockReset()` in `beforeEach` for all service/route tests — **NOT** `clearAllMocks()` (it doesn't clear queued `mockResolvedValueOnce` values — see `src/test/vi-patterns.ts` for documented pattern)
- Explicit factory mocks for DB query files:
  ```ts
  vi.mock("@/db/queries/articles", () => ({
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    submitArticleForReview: vi.fn(),
    countWeeklyArticleSubmissions: vi.fn(),
    upsertArticleTags: vi.fn(),
    getArticleForEditing: vi.fn(),
  }));
  ```
- CSRF headers in ALL mutating route tests:
  ```ts
  headers: { Host: "localhost:3000", Origin: "https://localhost:3000" }
  ```
- Rate limiter mock in route tests:
  ```ts
  vi.mock("@/lib/rate-limiter", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    buildRateLimitHeaders: vi.fn().mockReturnValue({}),
  }));
  vi.mock("@/lib/request-context", () => ({
    runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
  }));
  ```
- Do NOT mock `withApiHandler` as passthrough — let it run normally (it provides CSRF + error handling)

**EventBus bridge guard:** If `src/db/queries/articles.ts` is imported in `src/server/realtime/subscribers/eventbus-bridge.ts`, add:

```ts
vi.mock("@/db/queries/articles", () => ({ ... }))
```

to both `eventbus-bridge.test.ts` AND `notification-flow.test.ts`. Check whether the bridge imports it before adding the mock.

**Component tests:**

- Use custom `render()` from `@/test/test-utils` (wraps providers) — never import directly from `@testing-library/react`
- Mock `@tanstack/react-query` for components using hooks
- Key component test cases for `ArticleEditor.test.tsx`:
  - "Submit for Review" button is disabled when English title is empty
  - "Submit for Review" button is disabled when English body is empty
  - "Submit for Review" button is enabled when English title + body are filled
  - Mobile tab toggle: switching tabs does NOT unmount/remount the Tiptap instances (verify by checking editor content persists across tab switch)
  - Igbo title validation: shown only when Igbo body has content

### Previous Story Intelligence (from 5.4)

Key patterns established in Epic 5 that apply here:

- **Route test CSRF pattern** — all mutating requests need `{ Host: "localhost:3000", Origin: "https://localhost:3000" }` in headers
- **`successResponse(data, undefined, 201)`** — status code is the 3rd argument, not the second
- **EventBus event typing** — add new events to `src/types/events.ts` `EventMap` interface before using; the `EventName` union auto-derives from the map keys
- **Service-layer structure** — `article-service.ts` follows the same pattern as `group-service.ts`: validates permissions → calls query → emits EventBus event → returns result
- **No inline SQL** — all SQL goes through `src/db/queries/articles.ts`; service never calls `db.` directly
- **`getGroupMemberFull` pattern** — for permission checks that need multiple fields, compose a single query rather than chaining multiple calls

### Git Intelligence Summary

Recent commits show Epic 5 (Groups) has been fully completed with extensive moderation features:

- `b4439ad` — Epic 5 retro action items: group post moderation UX + hamburger nav + bilingual editor prototype doc
- `f00e80c` — Stories 5.3 & 5.4 implementation (group channels/feed/moderation)

Epic 6 is a fresh domain. The bilingual editor prototype decision doc (`docs/decisions/bilingual-editor-prototype.md`) was written as part of the Epic 5 retrospective (AI-6) specifically to guide Story 6.1 implementation — read it carefully before writing the editor components.

### Existing Codebase Reference (Key Functions)

- `src/features/feed/components/PostComposer.tsx` — reference for `useEditor({ immediatelyRender: false })` init pattern only (uses StarterKit + Link; no Image/Mention)
- `src/components/shared/FileUpload.tsx` — reuse as-is for cover image upload
- `src/services/permissions.ts` — `canPublishArticle(userId)` already exists (line ~85) with TODO for weekly count; update it. Reference `canCreateGroup()` for the pattern. Uses `getUserMembershipTier()` from `@/db/queries/auth-permissions`
- `src/lib/api-response.ts` — `successResponse()` and `errorResponse()`
- `src/lib/api-error.ts` — `ApiError` class
- `src/server/api/middleware.ts` — `withApiHandler()`
- `src/db/queries/groups.ts` — reference for query module structure (named exports, typed returns; note: query files omit `server-only`)
- `src/types/events.ts` — `ArticleSubmittedEvent` + `"article.submitted"` already exist (lines ~212, ~456, ~528); no changes needed
- `src/test/vi-patterns.ts` — documented test patterns including `mockReset()` and `successResponse` 3rd-arg pattern
- `src/db/migrations/0026_post_status.sql` — most recent migration; next is `0027_articles.sql`

### DB Schema Context

The `community_articles` table is a new domain table. Key relationships:

- `author_id → auth_users(id) ON DELETE CASCADE` (article removed if user account deleted)
- `community_article_tags.article_id → community_articles(id) ON DELETE CASCADE`
- No FK to `community_groups` or `community_posts` — articles are standalone content

**Migration 0027 SQL structure template:**

```sql
-- Create enums first, then tables
CREATE TYPE community_article_language AS ENUM ('en', 'ig', 'both');
CREATE TYPE community_article_visibility AS ENUM ('guest', 'members_only');
CREATE TYPE community_article_status AS ENUM ('draft', 'pending_review', 'published', 'rejected');
CREATE TYPE community_article_category AS ENUM ('discussion', 'announcement', 'event');

CREATE TABLE community_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  title_igbo VARCHAR(255),
  slug VARCHAR(300) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  content_igbo TEXT,
  cover_image_url TEXT,
  language community_article_language NOT NULL DEFAULT 'en',
  visibility community_article_visibility NOT NULL DEFAULT 'members_only',
  status community_article_status NOT NULL DEFAULT 'draft',
  category community_article_category NOT NULL DEFAULT 'discussion',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  reading_time_minutes INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_articles_author_id ON community_articles(author_id);
CREATE INDEX idx_community_articles_status_created ON community_articles(status, created_at DESC);
CREATE INDEX idx_community_articles_slug ON community_articles(slug);

CREATE TABLE community_article_tags (
  article_id UUID NOT NULL REFERENCES community_articles(id) ON DELETE CASCADE,
  tag VARCHAR(50) NOT NULL,
  PRIMARY KEY (article_id, tag)
);

CREATE INDEX idx_community_article_tags_tag ON community_article_tags(tag);
```

### References

- Epic 6.1 source: `_bmad-output/planning-artifacts/epics.md` (line 2045–2087)
- Bilingual editor design: `docs/decisions/bilingual-editor-prototype.md` ← **read this carefully before writing editor components**
- Rich text editor decision (Tiptap): `docs/decisions/rich-text-editor.md`
- ISR pattern (Story 6.3, not 6.1): `docs/decisions/isr-pattern.md`
- Reference schema: `src/db/schema/community-posts.ts`
- Reference service: `src/services/post-service.ts`
- Reference query module: `src/db/queries/posts.ts`
- Reference editor component: `src/features/feed/components/PostComposer.tsx`
- Permissions service: `src/services/permissions.ts`
- Test patterns: `src/test/vi-patterns.ts`
- Project context: `_bmad-output/project-context.md`
- Previous migration: `src/db/migrations/0026_post_status.sql`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Sprint status loaded from `_bmad-output/implementation-artifacts/sprint-status.yaml`
- First backlog story: `6-1-article-editor-submission` (epic-6 updated backlog → in-progress)
- Artifacts analyzed: epics.md (Epic 6), community-posts.ts schema, project-context.md, 5-4 story, bilingual-editor-prototype.md, rich-text-editor.md, isr-pattern.md
- Git commits analyzed: last 5 showing Epic 5 completion + bilingual editor design work

### Completion Notes List

- Implemented full Articles feature domain from scratch (Tasks 1–9)
- DB: `community_articles` + `community_article_tags` tables with 4 PostgreSQL enums; migration `0027_articles.sql`
- Query layer: `src/db/queries/articles.ts` — 6 named exports; no `server-only`; rolling 7-day window for weekly count
- Service: `src/services/article-service.ts` — `saveDraft` (create/update), `submitArticle` (weekly limit gate + EventBus emit), `getArticleForEditingService`
- Permissions: `canPublishArticle` updated with weekly count check via dynamic import (avoids circular deps); `vi.mock("@/db/queries/articles")` added to `permissions.test.ts`
- Slug utility: `src/lib/slug.ts` — `generateSlug(title)` with 6-char hex suffix
- API routes: POST /articles (201), PATCH /articles/[id] (200), POST /articles/[id]/submit (200); all RFC 7807; CSRF headers; rate limits
- UI: `TiptapEditor`, `BilingualEditorPane`, `ArticleMetaForm`, `ArticleEditor` — bilingual dual-pane (desktop side-by-side, mobile tab toggle, both instances always mounted); no new packages
- Mention suggestion: `buildMentionSuggestion()` — fetches `/api/v1/members?q=`
- Pages: `/articles/new` + `/articles/[id]/edit`; server actions: `saveDraftAction`, `submitArticleAction`
- Nav: "Write an Article" link in TopNav profile dropdown
- i18n: `Articles` namespace added to `messages/en.json` and `messages/ig.json` (24 keys each)
- Tests: 71 new tests (2747→2818); 0 regressions
- **Key decision**: `canPublishArticle` uses `await import("@/db/queries/articles")` (dynamic import) to avoid circular dependency chain; `permissions.test.ts` updated with `vi.mock("@/db/queries/articles")`

### File List

**New files:**

- `src/db/schema/community-articles.ts`
- `src/db/migrations/0027_articles.sql`
- `src/db/queries/articles.ts`
- `src/db/queries/articles.test.ts`
- `src/services/article-service.ts`
- `src/services/article-service.test.ts`
- `src/lib/slug.ts`
- `src/features/articles/components/TiptapEditor.tsx`
- `src/features/articles/components/BilingualEditorPane.tsx`
- `src/features/articles/components/ArticleMetaForm.tsx`
- `src/features/articles/components/ArticleEditor.tsx`
- `src/features/articles/components/ArticleEditor.test.tsx`
- `src/features/articles/utils/mention-suggestion.ts`
- `src/features/articles/actions/article-actions.ts`
- `src/features/articles/index.ts`
- `src/app/[locale]/(app)/articles/new/page.tsx`
- `src/app/[locale]/(app)/articles/[articleId]/edit/page.tsx`
- `src/app/api/v1/articles/route.ts`
- `src/app/api/v1/articles/route.test.ts`
- `src/app/api/v1/articles/[articleId]/route.ts`
- `src/app/api/v1/articles/[articleId]/route.test.ts`
- `src/app/api/v1/articles/[articleId]/submit/route.ts`
- `src/app/api/v1/articles/[articleId]/submit/route.test.ts`

**Modified files:**

- `src/db/index.ts` — added `communityArticlesSchema`
- `src/services/permissions.ts` — updated `canPublishArticle` with weekly count check
- `src/services/permissions.test.ts` — added `vi.mock("@/db/queries/articles")` for dynamic import fix
- `src/components/layout/TopNav.tsx` — added "Write an Article" link in profile dropdown
- `messages/en.json` — added `Articles` namespace (24 keys)
- `messages/ig.json` — added `Articles` namespace (24 keys)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated 6-1 status: ready-for-dev → in-progress → review → done

## Senior Developer Review (AI)

**Reviewer:** Dev (claude-opus-4-6) on 2026-03-05

**Issues Found:** 3 High, 4 Medium, 3 Low — **All HIGH and MEDIUM fixed automatically**

### Fixes Applied

1. **[H1] Duplicate `"Articles"` key in en.json/ig.json** — Merged into single namespace; guest page keys preserved alongside new editor keys
2. **[H2] Visibility validation missing** — Added `validateVisibility(tier, visibility)` in `article-service.ts`; Professional users attempting `guest` visibility are silently corrected to `members_only`. Imports `PERMISSION_MATRIX` from `permissions.ts` (also fixes M1)
3. **[H3] Hardcoded English strings** — `mention-suggestion.ts` now accepts `noResultsLabel` option (passed from `TiptapEditor.tsx` via i18n). `ArticleMetaForm.tsx` placeholders/aria-labels now use `useTranslations()`. New i18n keys: `meta.addTagPlaceholder`, `meta.removeCoverImage`, `meta.coverAlt`, `mentions.noResults`, `editor.newArticle`, `editor.editDraft`
4. **[M1] Duplicate PERMISSION_MATRIX** — Removed from `article-service.ts`; now imports `PERMISSION_MATRIX` from `permissions.ts` (exported). Single source of truth.
5. **[M2] Missing `getArticleForEditing` test** — Added 2 query tests + 2 service tests for `getArticleForEditingService`
6. **[M3] Edit page missing permission gate** — Added `canPublishArticle` check to `/articles/[articleId]/edit/page.tsx`
7. **[M4] Dead ternary** — Fixed heading in `ArticleEditor.tsx` to show `editor.newArticle` vs `editor.editDraft` based on `currentArticleId`

### Remaining (LOW — not fixed)

- L1: `deriveLanguage()` never returns `"ig"` — dead enum value (acceptable since English content is always required)
- L2: PATCH route extracts articleId from URL path instead of Next.js params (works, just fragile)
- L3: `NEXT_REDIRECT` error detection pattern (consistent with existing codebase)

### Test Impact

- Before review: 2818 passing
- After review: 2825 passing (+7 new tests: 2 getArticleForEditing query, 2 getArticleForEditingService, 3 visibility validation)
- 0 regressions
