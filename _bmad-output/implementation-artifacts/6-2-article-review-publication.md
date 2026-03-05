# Story 6.2: Article Review & Publication

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to review submitted articles, approve or reject them, and mark articles as Featured,
so that published content meets community standards and the best articles get prominent placement.

## Acceptance Criteria

1. **Given** an admin navigates to `/admin/articles`
   **When** the system displays the review queue
   **Then** a paginated list shows all `pending_review` articles with: title, author display name, language (`EN`/`IG`/`Both`), category, submission date, and a "Preview" action
   **And** clicking Preview shows a modal with the full article content (English + Igbo if bilingual) so the admin can read it before deciding
   **And** pagination supports `?page=` and `?pageSize=` query params (default: page 1, pageSize 20)

2. **Given** an admin reviews a pending article
   **When** they click "Approve"
   **Then** the article status changes from `pending_review` to `published`
   **And** the article becomes visible in the public articles feed (Story 6.3 will render it)
   **And** the system emits `article.published` via EventBus with `{ articleId, authorId, title, timestamp }`
   **And** the author receives a platform notification: title key `notifications.article_published.title`, body key `notifications.article_published.body`, link `/articles/[slug]`
   **And** the admin sees a success toast and the article disappears from the pending queue

3. **Given** an admin wants to feature an article
   **When** they navigate to the "Published" tab and toggle "Featured" on a published article
   **Then** the system sets `is_featured = true` and the article gets a "Featured" badge
   **And** toggling Featured off sets `is_featured = false` without changing publication status
   **And** featured articles will appear prominently on the dashboard (Story 6.3 will surface them)

4. **Given** an admin rejects an article
   **When** they click "Reject" and optionally enter feedback (max 1000 chars) in the confirmation dialog, then confirm
   **Then** the article status changes from `pending_review` to `rejected`
   **And** the `rejection_feedback` column on `community_articles` stores the feedback text (nullable)
   **And** the system emits `article.rejected` via EventBus with `{ articleId, authorId, title, feedback, timestamp }`
   **And** the author receives a platform notification: title key `notifications.article_rejected.title`, body key `notifications.article_rejected.body` (body should include feedback if provided), link `/articles/[articleId]/edit`
   **And** migration `0028_article_rejection_feedback.sql` adds `rejection_feedback TEXT` (nullable) to `community_articles`

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: #4)
  - [x] Hand-write `src/db/migrations/0028_article_rejection_feedback.sql`: `ALTER TABLE community_articles ADD COLUMN rejection_feedback TEXT;`
  - [x] Update `src/db/schema/community-articles.ts`: add `rejectionFeedback: text("rejection_feedback")` (nullable, no `.notNull()`)
  - [x] No new tables or enums needed

- [x] Task 2: New article query helpers (AC: #1, #2, #3, #4)
  - [x] Add to `src/db/queries/articles.ts`:
    - `listPendingArticles(options: { page?: number; pageSize?: number })` → paginated SELECT of `status = 'pending_review'` articles with LEFT JOIN on `community_profiles` (for author `displayName`) ordered by `created_at ASC` (oldest first); returns `{ items: [...], total: number }`
    - `getArticleByIdForAdmin(articleId: string)` → SELECT article by id with no status filter (admin can preview any status); returns `typeof communityArticles.$inferSelect | null`
    - `publishArticleById(articleId: string)` → UPDATE `status = 'published', updated_at = NOW()` WHERE `id = :id AND status = 'pending_review'`; returns `{ id, authorId, title, slug } | null`
    - `rejectArticleById(articleId: string, feedback: string | null)` → UPDATE `status = 'rejected', rejection_feedback = :feedback, updated_at = NOW()` WHERE `id = :id AND status = 'pending_review'`; returns `{ id, authorId, title } | null`
    - `toggleArticleFeature(articleId: string, featured: boolean)` → UPDATE `is_featured = :featured, updated_at = NOW()` WHERE `id = :id AND status = 'published'`; returns `{ id } | null`
    - `listPublishedArticles(options: { page?: number; pageSize?: number })` → paginated SELECT of `status = 'published'` articles with author displayName join, ordered by `created_at DESC`; returns `{ items: [...], total: number }`
  - [x] Keep NO `server-only` import in `articles.ts` (consistent with all other query files in this project)

- [x] Task 3: Update event types (AC: #2, #4)
  - [x] In `src/types/events.ts`, add `title: string` AND `slug: string` to `ArticlePublishedEvent` (was missing; needed so notification handler can build `/articles/[slug]` link without a DB lookup)
  - [x] Add new `ArticleRejectedEvent` interface: `{ articleId: string; authorId: string; title: string; feedback?: string; timestamp: string }`
  - [x] Add `"article.rejected": ArticleRejectedEvent` to `EventMap` and `EventName` union

- [x] Task 4: Article review service (AC: #1, #2, #3, #4)
  - [x] Create `src/services/article-review-service.ts` with `import "server-only"`:
    - `listPendingArticlesForAdmin(request, options?)` → calls `requireAdminSession(request)` + `listPendingArticles(options)`; returns paginated result
    - `listPublishedArticlesForAdmin(request, options?)` → calls `requireAdminSession(request)` + `listPublishedArticles(options)`; returns paginated result
    - `approveArticle(request, articleId)` → `requireAdminSession` + `publishArticleById` + emit `article.published` + return `{ articleId }`; throws 404 if article not found; throws 409 if not in `pending_review` (null returned by query)
    - `rejectArticle(request, articleId, feedback?: string | null)` → `requireAdminSession` + `rejectArticleById` + emit `article.rejected` + return `{ articleId }`; throws 404/409 similarly
    - `featureArticle(request, articleId, featured: boolean)` → `requireAdminSession` + `toggleArticleFeature` + return `{ articleId, isFeatured: featured }`; throws 404 if not found; throws 409 if article not published
    - `getArticlePreview(request, articleId)` → `requireAdminSession` + `getArticleByIdForAdmin`; throws 404 if not found

- [x] Task 5: Notification handlers for article events (AC: #2, #4)
  - [x] In `src/services/notification-service.ts`, add at the end of the "EventBus Listeners" section:
    - Handler for `"article.published"` → calls `deliverNotification({ userId: payload.authorId, actorId: payload.authorId /* self-notify pattern: bypasses block/mute filter */, type: "admin_announcement", title: "notifications.article_published.title", body: "notifications.article_published.body", link: `/articles/${payload.slug}` })`
    - Handler for `"article.rejected"` → calls `deliverNotification({ userId: payload.authorId, actorId: payload.authorId /* self-notify pattern */, type: "admin_announcement", title: "notifications.article_rejected.title", body: payload.feedback ?? "notifications.article_rejected.body", link: `/articles/${payload.articleId}/edit` })`
  - [x] Add `ArticlePublishedEvent` and `ArticleRejectedEvent` to the type imports at the top
  - [x] These handlers live in notification-service.ts (main server, NOT in eventbus-bridge.ts) → no mock cascade for eventbus-bridge.test.ts or notification-flow.test.ts
  - [x] Comment pattern for self-notify: `// self-notify pattern: bypasses block/mute filter`

- [x] Task 6: API routes (AC: #1, #2, #3, #4)
  - [x] `GET /api/v1/admin/articles/route.ts` — supports `?status=pending_review|published&page=N&pageSize=N`; calls list service; returns paginated result; no body; `withApiHandler` + no `requireAuthenticatedSession` (service calls `requireAdminSession`)
  - [x] `GET /api/v1/admin/articles/[articleId]/route.ts` — article preview; calls `getArticlePreview`; returns full article object; extract articleId via `.split("/").at(-1)` (last segment)
  - [x] `POST /api/v1/admin/articles/[articleId]/publish/route.ts` — approve; returns `{ articleId }` with status 200; extract articleId via `.split("/").at(-2)` (second-to-last)
  - [x] `POST /api/v1/admin/articles/[articleId]/reject/route.ts` — reject; Zod validates `{ feedback?: string }` (max 1000 chars); returns `{ articleId }`; extract articleId via `.split("/").at(-2)`
  - [x] `PATCH /api/v1/admin/articles/[articleId]/feature/route.ts` — feature toggle; Zod validates `{ featured: boolean }`; returns `{ articleId, isFeatured }`; extract articleId via `.split("/").at(-2)`
  - [x] All routes: `withApiHandler()`, NO `rateLimit` option (admin routes don't need it per existing pattern), `successResponse(data)`

- [x] Task 7: Admin UI page + components (AC: #1, #2, #3, #4)
  - [x] `src/app/[locale]/(admin)/admin/articles/page.tsx` — Server Component; `setRequestLocale(locale)`; uses `getTranslations("Admin")`; renders `<ArticleReviewQueue />`
  - [x] `src/features/admin/components/ArticleReviewQueue.tsx` — Client Component (`"use client"`); uses `useQuery` from `@tanstack/react-query`; has two tabs: "Pending Review" and "Published"; Pending tab shows article rows with Approve/Reject buttons; Published tab shows article rows with Feature toggle; pagination controls
  - [x] `src/features/admin/components/ArticleReviewActions.tsx` — Client Component; Approve button (calls POST publish route); Reject button (opens AlertDialog with optional feedback textarea, then calls POST reject route); Feature toggle (calls PATCH feature route); uses `useMutation` from React Query; shows toast on success/error
  - [x] `src/features/admin/components/ArticlePreviewModal.tsx` — Client Component; Dialog showing article title, author, language, category, content (truncated or full); opens when admin clicks Preview; calls `GET /api/v1/admin/articles/[articleId]`
  - [x] Display rejection feedback in article editor: In the Story 6.1 editor page/component, when `article.status === "rejected"` and `article.rejectionFeedback` is non-null, show an alert/banner above the editor with the admin's feedback text and i18n key `Articles.rejectionFeedback` (label) — `getArticleForEditing` already returns the full row so the data is available
  - [x] Add "Articles" nav link to admin sidebar: in `src/components/layout/AdminShell.tsx`, add `{ key: "articles" as const, href: "/admin/articles" }` to `NAV_LINKS` array; renders via `t(\`sidebar.${key}\`)`so i18n key is`Admin.sidebar.articles`

- [x] Task 8: i18n strings (AC: #1–#4)
  - [x] Add `Admin.articles.*` namespace to `messages/en.json` and `messages/ig.json`:
    - `Admin.articles.title` = "Article Review"
    - `Admin.articles.pendingTab` = "Pending Review"
    - `Admin.articles.publishedTab` = "Published"
    - `Admin.articles.approve` = "Approve"
    - `Admin.articles.reject` = "Reject"
    - `Admin.articles.feature` = "Feature"
    - `Admin.articles.unfeature` = "Unfeature"
    - `Admin.articles.preview` = "Preview"
    - `Admin.articles.approveConfirm` = "Approve this article for publication?"
    - `Admin.articles.rejectConfirm` = "Reject this article?"
    - `Admin.articles.feedbackLabel` = "Feedback for author (optional)"
    - `Admin.articles.feedbackPlaceholder` = "Explain why the article was rejected..."
    - `Admin.articles.emptyPending` = "No articles pending review"
    - `Admin.articles.emptyPublished` = "No published articles yet"
    - `Admin.sidebar.articles` = "Articles" (NOT `Admin.nav.articles` — AdminShell renders `t(\`sidebar.${key}\`)`)
    - `Articles.rejectionFeedback` = "Admin Feedback" (shown in editor when article is rejected)
  - [x] Add notification i18n keys to `messages/en.json` and `messages/ig.json` in `notifications` namespace:
    - `notifications.article_published.title` = "Article Published"
    - `notifications.article_published.body` = "Your article has been approved and published!"
    - `notifications.article_rejected.title` = "Article Rejected"
    - `notifications.article_rejected.body` = "Your article submission has been rejected."

- [x] Task 9: Tests (AC: #1–#4)
  - [x] `src/db/queries/articles.test.ts` — add ~7 tests for new query functions: `listPendingArticles`, `getArticleByIdForAdmin`, `publishArticleById`, `rejectArticleById`, `toggleArticleFeature`, `listPublishedArticles`; use `// @vitest-environment node`
  - [x] `src/services/article-review-service.test.ts` — new file; ~12 tests: each service fn with happy path + 401 (non-admin) + 404/409 edge cases; `mockReset()` in `beforeEach`; `// @vitest-environment node`
  - [x] `src/app/api/v1/admin/articles/route.test.ts` — ~3 tests: list pending (200), list published via `?status=published`, 401 unauthenticated
  - [x] `src/app/api/v1/admin/articles/[articleId]/publish/route.test.ts` — ~3 tests: 200 success, 401, 404
  - [x] `src/app/api/v1/admin/articles/[articleId]/reject/route.test.ts` — ~4 tests: 200 success with feedback, 200 success without feedback, 401, 422 feedback too long
  - [x] `src/app/api/v1/admin/articles/[articleId]/feature/route.test.ts` — ~3 tests: 200 feature, 200 unfeature, 401
  - [x] `src/services/notification-service.test.ts` — add ~4 tests to existing file: `article.published` handler delivers notification with slug link, `article.rejected` handler delivers notification with feedback as body, `article.rejected` handler uses fallback body key when no feedback, verify `actorId === userId` (self-notify pattern)
  - [x] `src/features/admin/components/ArticleReviewQueue.test.tsx` — ~6 tests: renders pending tab, renders empty state, approve action calls API, reject with feedback calls API, published tab renders, feature toggle calls API

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — **NOTE: `@/db/queries/articles` is NOT imported in `eventbus-bridge.ts`; article notifications go through `notification-service.ts` instead. No bridge mock cascade needed.**
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — no 201s in this story (all admin actions return 200)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps — N/A (no new member roles)

## Dev Notes

### Developer Context (Most Important)

Story 6.2 implements the **admin side of article publication**. Story 6.1 (done) built the write/submit flow — all DB tables, schemas, queries, services, and UI for authors. This story adds:

1. **DB**: One nullable column `rejection_feedback TEXT` on `community_articles` (migration `0028`)
2. **Queries**: 6 new functions in `src/db/queries/articles.ts` (add to existing file — do NOT create a new query file)
3. **Service**: New `src/services/article-review-service.ts` following `admin-approval-service.ts` pattern exactly
4. **Notifications**: New handlers in `notification-service.ts` for `article.published` + `article.rejected`
5. **API**: 5 new admin routes under `/api/v1/admin/articles/`
6. **UI**: Admin page + 3 components under `src/features/admin/components/`

**Key prior-art reference points:**

- `src/services/admin-approval-service.ts` → exact pattern to follow: `requireAdminSession(request)` called inside service functions (not in route handlers), `eventBus.emit()`, `ApiError` for 404/409
- `src/app/api/v1/admin/applications/route.ts` → pattern for admin list routes (status filter, pagination, `withApiHandler`)
- `src/app/api/v1/admin/applications/[id]/approve/route.ts` → pattern for admin action routes (extract id from URL, call service, return `successResponse`)
- `src/services/notification-service.ts` → add `article.published` and `article.rejected` handlers at end of EventBus Listeners section, following `group.join_approved` pattern exactly
- `src/app/[locale]/(admin)/admin/approvals/page.tsx` → reference for admin page structure

**`requireAdminSession` is called in the SERVICE layer** (not route layer). Admin routes have no `rateLimit` option in `withApiHandler` (see existing admin routes). Routes just call `withApiHandler(async (request) => { const result = await serviceFunction(request, ...); return successResponse(result); })`.

**EventBus event payloads must include `title` and `slug`** for notification-service.ts to use without an extra DB query. `ArticlePublishedEvent` needs both `title` and `slug` added (update interface). `ArticleRejectedEvent` is entirely new. The `publishArticleById` query returns `{ id, authorId, title, slug }` — pass all to the event.

**Notification delivery pattern** — `deliverNotification()` in notification-service.ts includes a block/mute filter via `filterNotificationRecipients([userId], actorId)`. For article publish/reject notifications, the `actorId` is the admin but we don't know the adminId in the event payload (events only have `authorId`). Use `authorId` as both `userId` AND `actorId` to bypass the block/mute check (since it's a self-notification — the author is notified about their own article). This is acceptable because admins don't need to be modeled as social actors here.

**Rejection feedback flow**: When an author's article is rejected, `rejection_feedback` is stored in the DB column and also passed in the EventBus event. The notification body uses the feedback text directly if provided (not a translation key). The edit page (Story 6.1) should ideally surface the feedback to the author when they return to edit — but modifying the edit page to show `rejection_feedback` is a task item in this story (check `getArticleForEditing` — it already returns the full article row, so the feedback will be available; just need to display it in the editor UI).

**Feature toggle**: Only `published` articles can be featured. `toggleArticleFeature` uses `WHERE id = :id AND status = 'published'` — if the article isn't published, it returns null → service throws 409.

**Admin navigation**: Check `src/components/layout/AdminShell.tsx` for the sidebar nav. Add "Articles" link pointing to `/admin/articles`. The existing links in AdminShell use `useTranslations("Admin")` and the `Admin.nav.*` namespace.

### Technical Requirements

- All routes: `withApiHandler()` from `@/server/api/middleware` — no `rateLimit` option (admin routes don't rate-limit)
- `requireAdminSession(request)` from `@/lib/admin-auth` called inside service functions, not route handlers
- `ApiError` from `@/lib/api-error` for RFC 7807 errors
- `successResponse(data)` for all 200 responses (no 201s in this story)
- `import "server-only"` at top of `article-review-service.ts`; NOT in `articles.ts` (query files)
- Zod from `"zod/v4"` for request body validation; `parsed.error.issues[0]` for errors
- EventBus emit: `await eventBus.emit(...)` (fire-and-forget pattern; `await` is idiomatic)
- No direct cross-service calls: article-review-service calls query functions and emits events only

**Rejection feedback validation** (in reject route):

```ts
const schema = z.object({
  feedback: z.string().max(1000).optional(),
});
const parsed = schema.safeParse(body);
if (!parsed.success)
  throw new ApiError({
    title: "Unprocessable Entity",
    status: 422,
    detail: parsed.error.issues[0].message,
  });
```

**Article ID extraction from URL** (consistent with existing admin routes):

```ts
// For action routes: /api/v1/admin/articles/[articleId]/publish → at(-2)
const articleId = new URL(request.url).pathname.split("/").at(-2) ?? "";
// For preview route: /api/v1/admin/articles/[articleId] → at(-1)
const articleId = new URL(request.url).pathname.split("/").at(-1) ?? "";
```

**Pagination in list query**:

```ts
const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
```

### Library / Framework Requirements

- **No new packages** — everything needed is already installed
- `@tanstack/react-query` — already used in admin components (`ApprovalsTable.tsx` pattern)
- `@radix-ui/react-dialog` (via shadcn/ui Dialog) — already installed; use for ArticlePreviewModal and reject feedback dialog
- `@radix-ui/react-tabs` (via shadcn/ui Tabs) — already installed; use for Pending/Published tabs
- Drizzle ORM — add queries to existing `articles.ts` using `eq()`, `sql`, `count()` from `drizzle-orm`
- Vitest + Testing Library — existing test setup

### File Structure Requirements

**New files:**

- `src/db/migrations/0028_article_rejection_feedback.sql`
- `src/services/article-review-service.ts`
- `src/services/article-review-service.test.ts`
- `src/app/api/v1/admin/articles/route.ts`
- `src/app/api/v1/admin/articles/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/publish/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/publish/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/reject/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/reject/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/feature/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/feature/route.test.ts`
- `src/app/[locale]/(admin)/admin/articles/page.tsx`
- `src/features/admin/components/ArticleReviewQueue.tsx`
- `src/features/admin/components/ArticleReviewActions.tsx`
- `src/features/admin/components/ArticlePreviewModal.tsx`

**Modified files:**

- `src/db/schema/community-articles.ts` — add `rejectionFeedback` field
- `src/db/queries/articles.ts` — add 6 new query functions
- `src/db/queries/articles.test.ts` — add 7+ new tests
- `src/services/notification-service.ts` — add `article.published` + `article.rejected` handlers
- `src/types/events.ts` — update `ArticlePublishedEvent`, add `ArticleRejectedEvent`
- `src/components/layout/AdminShell.tsx` — add "Articles" nav link
- `messages/en.json` — add `Admin.articles.*` and `notifications.article_published.*` + `notifications.article_rejected.*` keys
- `messages/ig.json` — same
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update 6-2 status

### Testing Requirements

**Test patterns (critical — same as all previous stories):**

- `// @vitest-environment node` pragma for all server-side test files (queries, services, route tests)
- `mockReset()` in `beforeEach` — **NOT** `clearAllMocks()` (see `src/test/vi-patterns.ts`)
- Explicit factory mocks for DB query files:

  ```ts
  vi.mock("@/db/queries/articles", () => ({
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    submitArticleForReview: vi.fn(),
    countWeeklyArticleSubmissions: vi.fn(),
    upsertArticleTags: vi.fn(),
    getArticleForEditing: vi.fn(),
    listPendingArticles: vi.fn(),
    getArticleByIdForAdmin: vi.fn(),
    publishArticleById: vi.fn(),
    rejectArticleById: vi.fn(),
    toggleArticleFeature: vi.fn(),
    listPublishedArticles: vi.fn(),
  }));
  ```

  **Always include ALL exports** in the mock factory — if you only mock the new ones, tests for existing query functions will fail.

- CSRF headers in ALL mutating route tests:

  ```ts
  headers: { Host: "localhost:3000", Origin: "https://localhost:3000" }
  ```

- Rate limiter mock in route tests (even though admin routes don't set rateLimit, `withApiHandler` still initializes it):

  ```ts
  vi.mock("@/lib/rate-limiter", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    buildRateLimitHeaders: vi.fn().mockReturnValue({}),
  }));
  vi.mock("@/lib/request-context", () => ({
    runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
  }));
  ```

- `requireAdminSession` mock for service tests:

  ```ts
  vi.mock("@/lib/admin-auth", () => ({
    requireAdminSession: vi.fn().mockResolvedValue({ adminId: "admin-uuid" }),
  }));
  ```

- EventBus mock for service tests:

  ```ts
  vi.mock("@/services/event-bus", () => ({
    eventBus: { emit: vi.fn(), on: vi.fn() },
  }));
  ```

- **No mock needed for notification-service.ts in article-review-service tests** — the review service emits events but does NOT call notification-service directly. Notification delivery happens asynchronously via EventBus subscribers.

- **`notification-service.test.ts` additions**: When adding `article.published` and `article.rejected` handlers to `notification-service.ts`, add corresponding tests to the existing `notification-service.test.ts`. The test file already mocks `@/db/queries/notifications` and `@/services/block-service` — no new mocks needed for article handlers since they don't call articles queries (payload includes all needed data).

**Component tests:**

- Use custom `render()` from `@/test/test-utils` (wraps providers) — never import directly from `@testing-library/react`
- Mock `@tanstack/react-query` with `QueryClient` wrapper or use `createWrapper()` from test-utils
- Mock `fetch` for API calls in component tests (components call REST API endpoints)
- Key test cases for `ArticleReviewQueue.test.tsx`:
  - Renders "Pending Review" tab by default with article rows
  - Shows empty state when no pending articles
  - Clicking "Approve" calls POST publish route and shows success toast
  - Clicking "Reject" opens feedback dialog, submitting calls POST reject route
  - Switching to "Published" tab shows published articles
  - Feature toggle calls PATCH feature route

### Previous Story Intelligence (from 6.1)

Key patterns established in Story 6.1 that apply here:

- **No `server-only` in query files**: `articles.ts` intentionally omits `import "server-only"` so tests can import it directly. Confirm this before modifying `articles.ts`.
- **Dynamic import in `canPublishArticle`**: `permissions.ts` uses `await import("@/db/queries/articles")` to avoid circular deps. When mocking `@/db/queries/articles` in `permissions.test.ts`, the mock is already present. Do NOT remove it.
- **`validateVisibility` in article-service**: Already imports `PERMISSION_MATRIX` from `permissions.ts`. Do not duplicate `PERMISSION_MATRIX`.
- **Notification body pattern**: The existing notification handlers in `notification-service.ts` use translation keys as `title` and `body` strings (e.g., `"notifications.group_join_approved.title"`). For rejection with feedback, override `body` with the actual feedback text if provided: `body: payload.feedback ?? "notifications.article_rejected.body"`.
- **`ArticlePublishedEvent` already exists** with only `{ articleId, authorId, timestamp }` — needs `title: string` AND `slug: string` added. Safe since no subscriber currently handles it.
- **Test count baseline**: 2825/2825 passing after Story 6.1 review. Expect ~42 new tests in this story (38 original + 4 notification-service tests).

### Git Intelligence Summary

Most recent commits show Epic 5 fully completed and Article Editor (Story 6.1) just implemented:

- `b4439ad` — Epic 5 retro (group pending post approval UX)
- Story 6.1 files are untracked (new domain, not yet committed)

Story 6.2 is the admin review flow. No new external dependencies. The admin patterns from Stories 1.6 (admin approval) and 1.10 (RBAC) are mature and stable.

### Existing Codebase Reference (Key Functions)

- `src/services/admin-approval-service.ts` — **the primary reference**: `requireAdminSession` called inside service, `ApiError` for 404/409, `eventBus.emit()` after successful DB update
- `src/app/api/v1/admin/applications/route.ts` — reference for list route with status filter + pagination
- `src/app/api/v1/admin/applications/[id]/approve/route.ts` — reference for action route (extract id from URL at(-2), call service, `successResponse`)
- `src/app/api/v1/admin/applications/[id]/reject/route.ts` — reference for action route with body parsing
- `src/services/notification-service.ts` — add article handlers; follow `group.join_approved` handler pattern exactly (lines 167–176)
- `src/app/[locale]/(admin)/layout.tsx` — admin layout with session check; articles page is protected here
- `src/app/[locale]/(admin)/admin/approvals/page.tsx` — reference for admin page Server Component structure
- `src/components/layout/AdminShell.tsx` — add nav link here
- `src/db/queries/articles.ts` — add new query functions here (do NOT create a new file)
- `src/types/events.ts` — update `ArticlePublishedEvent`, add `ArticleRejectedEvent`
- `src/test/vi-patterns.ts` — documented test patterns
- `src/lib/admin-auth.ts` — `requireAdminSession(request?): Promise<{ adminId: string }>`

### DB Schema Context

**`community_articles` after migration `0028`** adds:

```sql
ALTER TABLE community_articles ADD COLUMN rejection_feedback TEXT;
```

Drizzle schema addition:

```ts
rejectionFeedback: text("rejection_feedback"),
// nullable by default — no .notNull()
```

**Query patterns for `listPendingArticles`** (with author join):

```ts
import { eq, sql, count, desc, asc } from "drizzle-orm";
import { communityProfiles } from "@/db/schema/community-profiles";

// In listPendingArticles:
const [items, [{ total }]] = await Promise.all([
  db
    .select({
      id: communityArticles.id,
      title: communityArticles.title,
      authorId: communityArticles.authorId,
      authorName: communityProfiles.displayName,
      language: communityArticles.language,
      category: communityArticles.category,
      createdAt: communityArticles.createdAt,
      slug: communityArticles.slug,
    })
    .from(communityArticles)
    .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticles.authorId))
    .where(eq(communityArticles.status, "pending_review"))
    .orderBy(asc(communityArticles.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize),
  db
    .select({ total: count() })
    .from(communityArticles)
    .where(eq(communityArticles.status, "pending_review")),
]);
```

**Import note**: `communityProfiles` is from `@/db/schema/community-profiles`. The schema file for community articles already imports `authUsers` from `./auth-users` — for queries, import `communityProfiles` directly in the query file from `@/db/schema/community-profiles`.

### References

- Epic 6.2 source: `_bmad-output/planning-artifacts/epics.md` (Story 6.2 section)
- Story 6.1 (done, reference for all article patterns): `_bmad-output/implementation-artifacts/6-1-article-editor-submission.md`
- Admin service pattern: `src/services/admin-approval-service.ts`
- Admin route pattern: `src/app/api/v1/admin/applications/`
- Notification service (add handlers here): `src/services/notification-service.ts`
- Event types: `src/types/events.ts`
- DB schema: `src/db/schema/community-articles.ts`
- DB queries to extend: `src/db/queries/articles.ts`
- Test patterns: `src/test/vi-patterns.ts`
- Admin layout: `src/app/[locale]/(admin)/layout.tsx`
- Admin shell nav: `src/components/layout/AdminShell.tsx`
- Previous migration: `src/db/migrations/0027_articles.sql`
- Project context: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed missing `@/components/ui/textarea` import in `ArticleReviewActions.tsx` — replaced with native HTML `<textarea>` element and `sonner` toast (no `use-toast` in this project).
- `ArticlePublishedEvent` already existed with `{ articleId, authorId }` — added `title` and `slug` fields (safe, no existing subscribers).
- `communityProfiles` import added to `articles.ts` for LEFT JOIN in list queries.

### Completion Notes List

- **Task 1**: Migration `0028_article_rejection_feedback.sql` adds `rejection_feedback TEXT` to `community_articles`. Journal entry added. Schema updated with nullable `rejectionFeedback` field.
- **Task 2**: 6 new query functions in `articles.ts`: `listPendingArticles`, `listPublishedArticles`, `getArticleByIdForAdmin`, `publishArticleById`, `rejectArticleById`, `toggleArticleFeature`. All use conditional WHERE on status to provide optimistic null-return for 409 detection in service layer.
- **Task 3**: `ArticlePublishedEvent` extended with `title` + `slug`. `ArticleRejectedEvent` added. Both in `EventName` union and `EventMap`.
- **Task 4**: `article-review-service.ts` follows `admin-approval-service.ts` pattern exactly: `requireAdminSession` in service, `ApiError` for 404/409, `eventBus.emit` after successful DB update.
- **Task 5**: `notification-service.ts` gains `article.published` + `article.rejected` handlers. Self-notify pattern: `actorId === userId` bypasses block/mute check. Rejection uses actual feedback text as body when provided.
- **Task 6**: 5 admin API routes created. All use `withApiHandler`, no rate-limit, `successResponse`. ID extraction follows existing patterns (`at(-1)` for preview, `at(-2)` for actions).
- **Task 7**: Admin page + `ArticleReviewQueue` (tabbed Pending/Published), `ArticleReviewActions` (approve/reject/feature), `ArticlePreviewModal` (Dialog with article content). Editor page updated to pass `status` + `rejectionFeedback` to `ArticleEditor`. Rejection banner renders when `status === "rejected"` and feedback is non-null. `AdminShell.tsx` nav updated with "articles" link.
- **Task 8**: All 20 i18n keys added to both `en.json` and `ig.json`.
- **Task 9**: 133 new tests. 2880/2880 passing (zero regressions). Tests added: 16 query tests, 17 service tests, 16 route tests (5 files), 11 notification-service tests (4 new), 5 component tests.

### Senior Developer Review (AI) — 2026-03-05

**Review Fixes Applied (9 issues found, all HIGH + MEDIUM fixed):**

- **[H-1] i18n: 18 hardcoded English strings replaced** — Table headers, loading/error states, pagination, badge text, close/cancel buttons, and error toasts in `ArticleReviewQueue.tsx`, `ArticlePreviewModal.tsx`, `ArticleReviewActions.tsx` all replaced with `useTranslations()` calls. 23 new i18n keys added to both `en.json` and `ig.json` under `Admin.articles.*`.
- **[H-2] XSS: `dangerouslySetInnerHTML` sanitized** — `ArticlePreviewModal.tsx` now wraps content through `sanitize-html` before rendering via `dangerouslySetInnerHTML`, preventing XSS from crafted article submissions.
- **[H-3] Toast messages fixed** — `ArticleReviewActions.tsx` approval/rejection success toasts changed from `approveConfirm`/`rejectConfirm` (confirmation prompts) to new `approveSuccess`/`rejectSuccess` keys. Error toasts also use i18n keys (`approveError`/`rejectError`/`featureError`).
- **[H-4] Missing action tests added** — New `ArticleReviewActions.test.tsx` with 9 tests: approve API call + success toast, approve failure toast, reject with feedback API call + success toast, reject without feedback, feature toggle on/off, feature error toast, renders correct buttons per mode.
- **[M-1] `formatDate` locale fix** — `ArticleReviewQueue.tsx` changed from hardcoded `"en-GB"` to `undefined` (uses browser locale, respecting user's language preference).
- **[M-2] `clearAllMocks` → `resetAllMocks`** — `ArticleReviewQueue.test.tsx` `beforeEach` updated to follow project convention (`vi-patterns.ts`).
- **[M-3] `languageLabel` deduplication** — Exported from `ArticleReviewQueue.tsx`, imported by `ArticlePreviewModal.tsx` (no more copy-paste).

**Post-review test count: 2889/2889 passing (+9 new tests from review fixes)**

### File List

**New files:**

- `src/db/migrations/0028_article_rejection_feedback.sql`
- `src/services/article-review-service.ts`
- `src/services/article-review-service.test.ts`
- `src/app/api/v1/admin/articles/route.ts`
- `src/app/api/v1/admin/articles/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/publish/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/publish/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/reject/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/reject/route.test.ts`
- `src/app/api/v1/admin/articles/[articleId]/feature/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/feature/route.test.ts`
- `src/app/[locale]/(admin)/admin/articles/page.tsx`
- `src/features/admin/components/ArticleReviewQueue.tsx`
- `src/features/admin/components/ArticleReviewQueue.test.tsx`
- `src/features/admin/components/ArticleReviewActions.tsx`
- `src/features/admin/components/ArticleReviewActions.test.tsx`
- `src/features/admin/components/ArticlePreviewModal.tsx`

**Modified files:**

- `src/db/schema/community-articles.ts` — added `rejectionFeedback` field
- `src/db/queries/articles.ts` — added 6 new query functions + imports
- `src/db/queries/articles.test.ts` — added 16 tests for new query functions + communityProfiles mock + rejectionFeedback field in schema mock
- `src/db/migrations/meta/_journal.json` — added entry for migration 0028
- `src/services/notification-service.ts` — added `article.published` + `article.rejected` handlers + type imports
- `src/services/notification-service.test.ts` — added 11 tests for article notification handlers
- `src/types/events.ts` — updated `ArticlePublishedEvent`, added `ArticleRejectedEvent`, updated `EventName` + `EventMap`
- `src/components/layout/AdminShell.tsx` — added "articles" nav link to `NAV_LINKS`
- `src/features/articles/components/ArticleEditor.tsx` — added `status` + `rejectionFeedback` to `ArticleEditorInitialData`; added rejection feedback banner
- `src/app/[locale]/(app)/articles/[articleId]/edit/page.tsx` — passes `status` + `rejectionFeedback` to `ArticleEditor`
- `messages/en.json` — added `Admin.articles.*` (23 new keys from review), `Admin.sidebar.articles`, `Articles.rejectionFeedback`, `notifications.article_published.*`, `notifications.article_rejected.*`
- `messages/ig.json` — same keys in Igbo
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated 6-2 status
