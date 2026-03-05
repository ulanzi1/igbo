# Story 6.3: Article Reading Experience

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member or guest,
I want to read articles with comments, reading time estimates, and related suggestions,
so that I can engage with cultural content and discover more articles that interest me.

## Acceptance Criteria

1. **Given** a member or guest navigates to a published article
   **When** the article page loads
   **Then** the article displays with: title, cover image, author (name, avatar placeholder), publication date, language tag (EN/IG/Both), reading time estimate, view count, and comment count (FR64)
   **And** the page is server-side rendered with ISR (`export const revalidate = 60`) for SEO — **no `auth()` call in the Server Component** (per `docs/decisions/isr-pattern.md`)
   **And** `generateMetadata` includes hreflang tags (`languages: { en: /en/articles/[slug], ig: /ig/articles/[slug] }`) for bilingual articles
   **And** a `<script type="application/ld+json">` block with Article-type JSON-LD is rendered in the page body (not in `generateMetadata`)

2. **Given** a bilingual article is being read
   **When** the article has both English and Igbo versions (`language === "both"`)
   **Then** an `<ArticleLanguageToggle>` Client Component within the article allows switching between EN and IG content
   **And** the toggle is visually distinct from the global platform language toggle (e.g., an inline tab strip: "English" / "Igbo")
   **And** the current tab remembers the reader's choice for the session (via `useState`)

3. **Given** a member wants to comment on an article
   **When** they type a comment (plain text + emoji, max 2000 chars) and submit
   **Then** the new comment appears in the comment list in chronological order (newest at bottom)
   **And** the system emits `article.commented` via EventBus with `{ articleId, commentId, userId, timestamp }`
   **And** the article's `comment_count` is incremented in the DB

4. **Given** a guest visits a published article
   **When** the article page loads
   **Then** the full article content renders (visibility enforcement deferred to Epic 11)
   **And** the comments section displays existing comments (read-only)
   **And** a CTA appears below the comments: i18n key `Articles.comments.guestCta` with a "Join" button linking to `/apply`

5. **Given** the reader finishes an article
   **When** the article detail page finishes loading
   **Then** a `<ArticleViewTracker>` Client Component fires a `POST /api/v1/articles/[articleId]/view` on mount (fire-and-forget, no UI impact)
   **And** `view_count` is incremented on the `community_articles` row
   **And** the displayed view count on the page comes from the ISR snapshot (may be slightly lagged — this is acceptable)
   **And** up to 3 related article suggestions appear at the bottom of the page, loaded via the Server Component from `getRelatedArticles()`
   **And** each suggestion shows: title, cover image, author name, and reading time

6. **Given** the database needs article comment support
   **When** this story is implemented
   **Then** migration `0029_article_comments.sql` creates the `community_article_comments` table:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `article_id UUID NOT NULL REFERENCES community_articles(id) ON DELETE CASCADE`
   - `author_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE`
   - `content TEXT NOT NULL`
   - `parent_comment_id UUID` — nullable, plain `uuid()` (no Drizzle `.references()` — avoid circular ref, same pattern as `community_post_comments`)
   - `deleted_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - Index on `(article_id, created_at)` for chronological listing

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: #6)
  - [x] Create `src/db/schema/community-article-comments.ts` — Drizzle schema for `communityArticleComments`; follow `src/db/schema/post-interactions.ts` `communityPostComments` pattern exactly: use plain `uuid("parent_comment_id")` (no `.references()`) for self-referential FK; export types `CommunityArticleComment`, `NewCommunityArticleComment`
  - [x] Register in `src/db/index.ts`: `import * as communityArticleCommentsSchema from "./schema/community-article-comments"` — add after `communityArticlesSchema` line; add `...communityArticleCommentsSchema` to the schema spread
  - [x] Hand-write `src/db/migrations/0029_article_comments.sql` — CREATE TABLE + `REFERENCES community_article_comments(id) ON DELETE CASCADE` for parent FK (enforced by SQL even though Drizzle omits it); create index `idx_community_article_comments_article_id_created ON community_article_comments(article_id, created_at)`
  - [x] Add entry to `src/db/migrations/meta/_journal.json`: `{ "idx": 29, "version": "7", "when": 1708000029000, "tag": "0029_article_comments", "breakpoints": true }`

- [x] Task 2: Article comments query helpers (AC: #3, #6)
  - [x] Create `src/db/queries/article-comments.ts` (separate file from `articles.ts`) with:
    - `addArticleComment(data: { articleId: string; authorId: string; content: string; parentCommentId?: string | null })` → INSERT returning `{ id, articleId, authorId, content, createdAt }`; then UPDATE `community_articles SET comment_count = comment_count + 1 WHERE id = :articleId` — do both in a **transaction** (`db.transaction(async (tx) => { ... })`)
    - `listArticleComments(articleId: string, opts?: { page?: number; pageSize?: number })` → SELECT WHERE `article_id = :id AND deleted_at IS NULL` ORDER BY `created_at ASC`; LEFT JOIN `community_profiles` for author `displayName` and `photoUrl`; returns `{ items: ArticleCommentItem[]; total: number }`
    - `ArticleCommentItem` interface: `{ id, articleId, authorId, authorName: string | null, authorPhotoUrl: string | null, content, parentCommentId: string | null, createdAt }`
  - [x] No `"server-only"` — query files intentionally omit it (consistent with `articles.ts`, `posts.ts`)

- [x] Task 3: Add related-articles + view-count queries to `articles.ts` (AC: #1, #4, #5)
  - [x] **PREREQUISITE — Add `commentCount` to `getPublishedArticleBySlug`**: The existing `PublicArticleFull` interface (line ~362) and query SELECT are missing `commentCount`. Add `commentCount: number` to the interface and `commentCount: communityArticles.commentCount` to the select clause — without this, AC #1's comment count display will render `undefined`
  - [x] Add `incrementArticleViewCount(articleId: string): Promise<void>` → `UPDATE community_articles SET view_count = view_count + 1 WHERE id = :articleId` (no return value needed)
  - [x] Add `getRelatedArticles(articleId: string, authorId: string, tags: string[], limit = 3): Promise<RelatedArticle[]>` interface: `{ id, title, slug, coverImageUrl: string | null, readingTimeMinutes, authorName: string | null }`
    - If `tags.length > 0`: use raw SQL via `db.execute(sql\`...\`)` — see "DB Schema Context" section for the correct SQL (involves DISTINCT to avoid duplicates from tag JOIN)
    - If `tags.length === 0`: simpler query — same author or empty result
    - Always: `status = 'published'`, `deleted_at IS NULL`, `id != :articleId`, `LIMIT :limit`
  - [x] Add `getArticleTagsById(articleId: string): Promise<string[]>` → SELECT tags WHERE article_id = :id (needed by the article page to pass to `getRelatedArticles`)

- [x] Task 4: Article comment service (AC: #3, #4)
  - [x] Create `src/services/article-comment-service.ts` with `import "server-only"`:
    - `addComment(userId: string, articleId: string, content: string, parentCommentId?: string | null): Promise<{ commentId: string }>` →
      1. Calls `requireAuthenticatedSession()` is NOT called here (service doesn't have `request`); instead validate `userId` is non-empty
      2. Validates `content.trim().length > 0 && content.length <= 2000`; throws `ApiError({ status: 422 })` if invalid
      3. Verifies article exists and is published: calls `getPublishedArticleBySlug`... wait, need to look up by ID here. Add `getPublishedArticleById(id)` to queries? Or reuse `getArticleByIdForAdmin`? → Use `getArticleByIdForAdmin` from `articles.ts` but check `status === "published"` in service; throw `ApiError({ status: 404 })` if not found/not published
      4. Calls `addArticleComment({ articleId, authorId: userId, content, parentCommentId })`
      5. Emits `article.commented` via EventBus
      6. Returns `{ commentId: result.id }`
    - `listComments(articleId: string, opts?: { page?: number; pageSize?: number }): Promise<{ items: ArticleCommentItem[]; total: number }>` → thin wrapper over `listArticleComments`; no auth required (public)

- [x] Task 5: API routes (AC: #3, #4, #5)
  - [x] `GET /api/v1/articles/[articleId]/comments/route.ts` — list comments (public, no auth required); extract `articleId` via `new URL(request.url).pathname.split("/").at(-2)` (second-to-last segment, before `comments`); parse `?page=&pageSize=` from URL; calls `listComments(articleId)`; returns paginated result with `successResponse(result)`. Use `BROWSE` rate limit (or no rateLimit option — admin routes pattern omit it, but this is a public route so use `"BROWSE"`)
  - [x] `POST /api/v1/articles/[articleId]/comments/route.ts` — add comment (authenticated); `requireAuthenticatedSession()` called directly in route (not in service — this route handles auth at route layer since service takes userId); extract `articleId` via `.at(-2)`; Zod validates `{ content: z.string().min(1).max(2000) }` and optional `parentCommentId: z.string().uuid().optional()`; calls `addComment(session.userId, articleId, body.content, body.parentCommentId)`; returns `successResponse({ commentId }, undefined, 201)`; use `POST_CREATE` rate limit
  - [x] `POST /api/v1/articles/[articleId]/view/route.ts` — increment view count (public, no auth); extract `articleId` via `.at(-2)`; calls `incrementArticleViewCount(articleId)`; returns `successResponse({ ok: true })`. **No rate limit** for MVP (can add IP-based limit later). This route must NOT fail loudly — wrap in try/catch and return 200 even if the DB update fails

- [x] Task 6: Article detail page updates — Server Component (AC: #1, #2, #4, #5)
  - [x] Update `src/app/[locale]/(guest)/articles/[articleId]/page.tsx`:
    - **JSON-LD**: render inside the page JSX: `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle) }} />`; `jsonLdArticle` should be `{ "@context": "https://schema.org", "@type": "Article", headline: article.title, datePublished: article.createdAt.toISOString(), author: { "@type": "Person", name: article.authorName ?? "OBIGBO Member" }, image: article.coverImageUrl ?? undefined }`
    - **hreflang in metadata**: update `generateMetadata` to add `alternates.languages: article.language === "both" ? { en: \`/en/articles/${slug}\`, ig: \`/ig/articles/${slug}\` } : { en: \`/en/articles/${slug}\` }`
    - **Engagement indicators**: add `view_count` and `comment_count` to the byline row (fetched from the article object — `viewCount` already returned by `getPublishedArticleBySlug`; `commentCount` added in Task 3)
    - **Replace hardcoded "Featured" string**: the existing page has a hardcoded `"Featured"` string (~line 116) — replace with `t("Articles.reading.featuredBadge")` using `useTranslations` (or `getTranslations` since this is a Server Component)
    - **Language toggle**: replace the static "EN + IG" rendering with `<ArticleLanguageToggle enContent={renderContent(article.content)} igContent={article.contentIgbo ? renderContent(article.contentIgbo) : null} isBilingual={isBilingual} />` — move `renderContent()` call to the Server Component, pass HTML strings to the Client Component
    - **View tracker**: add `<ArticleViewTracker articleId={article.id} />` (Client Component, fires POST on mount)
    - **Related articles**: fetch `const relatedTags = await getArticleTagsById(article.id)` and `const related = await getRelatedArticles(article.id, article.authorId, relatedTags, 3)` then render `<ArticleRelatedSuggestions articles={related} />` at the bottom
    - **Comments section**: add `<ArticleComments articleId={article.id} />` after related articles; pass `articleVisibility={article.visibility}` as a prop
    - **Members-only notice**: if `article.visibility === "members_only"`, pass `membersOnly={true}` to `ArticleComments`; the component shows a soft notice to guests (not a hard block — content is already SSR'd)
  - [x] Move `renderContent()` helper to be called in the Server Component and pass rendered HTML strings as props to `ArticleLanguageToggle` (avoids running Tiptap's `generateHTML` in the Client Component)
  - [x] **Do NOT add `auth()` to the Server Component** — this defeats ISR; all auth checks happen in Client Components via `useSession()`

- [x] Task 7: Client components (AC: #2, #3, #4)
  - [x] `src/features/articles/components/ArticleLanguageToggle.tsx` — `"use client"`; accepts `enContent: string`, `igContent: string | null`, `isBilingual: boolean`; if not bilingual, just renders `<div dangerouslySetInnerHTML={{ __html: enContent }} />`; if bilingual, shows tab strip with i18n keys `Articles.reading.languageToggle.en` + `.ig`, renders the active pane; uses `useState("en")` for active tab
  - [x] `src/features/articles/components/ArticleViewTracker.tsx` — `"use client"`; accepts `articleId: string`; fires `fetch(\`/api/v1/articles/${articleId}/view\`, { method: "POST", credentials: "include" })`in`useEffect(() => { ... }, [])`(empty deps = fires once on mount); renders`null`; ignores errors (fire-and-forget); do NOT use `useSession` (public)
  - [x] `src/features/articles/components/ArticleComments.tsx` — `"use client"`; accepts `articleId: string`, `membersOnly?: boolean`; uses `useSession()` from `next-auth/react`; uses `useQuery` for comment list (GET `/api/v1/articles/${articleId}/comments`); if guest AND `membersOnly`: renders `<p>{t("Articles.comments.membersOnlyCta")}</p>` with a join link; if guest (not members-only): renders comment list + CTA (`Articles.comments.guestCta`); if member: renders comment list + comment form (textarea + submit button); on comment submit: `useMutation` POSTing to `/api/v1/articles/${articleId}/comments`; shows success toast + `queryClient.invalidateQueries` on success; shows error toast on failure; comment list renders `ArticleCommentItem` rows showing author name, timestamp, content
  - [x] `src/features/articles/components/ArticleRelatedSuggestions.tsx` — **Server Component** (no `"use client"`); accepts `articles: RelatedArticle[]`; renders a grid of up to 3 article cards (title, cover image thumbnail, author, reading time); links to `/articles/[slug]`; if `articles.length === 0`, renders nothing
  - [x] Update `src/features/articles/index.ts` barrel to export new components

- [x] Task 8: i18n strings (AC: #2, #3, #4)
  - [x] Add to `Articles` namespace in `messages/en.json`:
    - `Articles.reading.viewCount` = `"{count} views"`
    - `Articles.reading.commentCount` = `"{count} comments"`
    - `Articles.reading.languageToggle.en` = `"English"`
    - `Articles.reading.languageToggle.ig` = `"Igbo"`
    - `Articles.reading.featuredBadge` = `"Featured"`
    - `Articles.comments.title` = `"Comments"`
    - `Articles.comments.placeholder` = `"Write a comment..."`
    - `Articles.comments.submit` = `"Post Comment"`
    - `Articles.comments.submitting` = `"Posting..."`
    - `Articles.comments.empty` = `"No comments yet. Be the first to share your thoughts."`
    - `Articles.comments.guestCta` = `"Join the community to join the conversation"`
    - `Articles.comments.guestButton` = `"Join OBIGBO"`
    - `Articles.comments.membersOnlyCta` = `"This article is for members only. Join OBIGBO to read and comment."`
    - `Articles.comments.error` = `"Failed to post comment. Please try again."`
    - `Articles.related.title` = `"Related Articles"`
    - `Articles.related.readMin` = `"{n} min read"`
  - [x] Add same keys (translated to Igbo) to `messages/ig.json`
  - [x] **Do NOT add hardcoded English strings** in JSX or API responses

- [x] Task 9: Tests (AC: #1–#5)
  - [x] `src/db/queries/article-comments.test.ts` — ~8 tests; `// @vitest-environment node`; `mockReset()` in `beforeEach`; test: `addArticleComment` inserts row + increments comment_count (mock transaction), `listArticleComments` returns paginated result with author JOIN, empty result when no comments, `listArticleComments` total count correct
  - [x] `src/db/queries/articles.test.ts` — add ~4 tests: `incrementArticleViewCount` calls UPDATE, `getRelatedArticles` with tags returns results, `getRelatedArticles` with no tags returns author-match only, `getArticleTagsById` returns tags array
  - [x] `src/services/article-comment-service.test.ts` — ~10 tests; `// @vitest-environment node`; `mockReset()` in `beforeEach`; test: `addComment` success emits event, `addComment` rejects when article not published, `addComment` rejects when content empty, `addComment` rejects when content > 2000 chars, `listComments` calls query with options
  - [x] `src/app/api/v1/articles/[articleId]/comments/route.test.ts` — ~6 tests; test: GET list 200 OK, GET 200 with pagination params, POST 201 creates comment, POST 401 unauthenticated, POST 422 empty content, POST 422 content too long; CSRF headers on POST
  - [x] `src/app/api/v1/articles/[articleId]/view/route.test.ts` — ~3 tests; test: POST 200 increments view, POST 200 even when DB fails (swallowed error), no auth required (unauthenticated 200 OK)
  - [x] `src/features/articles/components/ArticleComments.test.tsx` — ~6 tests; `// @vitest-environment jsdom`; mock `useSession`, mock `@tanstack/react-query`; test: renders comment list when logged in, renders guest CTA when not logged in, renders empty state, renders members-only CTA when membersOnly=true and not logged in, comment form submits correctly, error toast on submit failure
  - [x] All server test files: `// @vitest-environment node` pragma
  - [x] `mockReset()` in `beforeEach` for all service/route tests

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — check whether `article-comments.ts` is imported by the bridge before adding mocks
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — used in POST comments route
- [x] No `auth()` called in the article detail Server Component — auth is handled client-side in `ArticleComments` via `useSession()`

## Dev Notes

### Developer Context (Most Important)

Story 6.3 is the **reading experience** for articles. Stories 6.1 (editor + submission) and 6.2 (admin review + publication) are both done. The key existing infrastructure:

**Already built and working:**

- `community_articles` table + `community_article_tags` table (migrations `0027`, `0028`)
- `src/db/schema/community-articles.ts` — all enums and `communityArticles` table
- `src/db/queries/articles.ts` — `getPublishedArticleBySlug()` (returns `viewCount` but **NOT `commentCount`** — must add it), `listPublishedArticlesPublic()`, `getArticleByIdForAdmin()`, `incrementArticleViewCount()` **does NOT exist yet** — add it
- `src/app/[locale]/(guest)/articles/page.tsx` — article listing page (ISR, `revalidate = 60`)
- `src/app/[locale]/(guest)/articles/[articleId]/page.tsx` — **PARTIAL** article detail page; already has ISR + basic rendering but is missing: JSON-LD, hreflang, language toggle, view tracker, comments, related articles

**The `[articleId]` URL segment is actually a SLUG** in the existing implementation — `page.tsx` does `const { articleId: slug } = await params` and calls `getPublishedArticleBySlug(slug)`. The URL is effectively `/articles/[slug]`. This naming confusion is intentional (slug used as the dynamic segment). The comment API routes use the article UUID (from `article.id`) for consistent UUID-based APIs.

**Existing article detail page at `(guest)/articles/[articleId]/page.tsx`:**

- Lines 1–33: `renderContent()` helper using Tiptap's `generateHTML` + `sanitize-html` — **keep this, but refactor**: call `renderContent()` in the Server Component and pass the rendered HTML strings (not raw JSON) to client components — this avoids importing Tiptap in the Client Component (which would bloat the client bundle)
- Lines 34–65: metadata + `generateMetadata` — **update**: add hreflang and JSON-LD
- Lines 67–166: `ArticlePage` component — **update**: add view tracker, language toggle, comments, related articles
- Currently renders both EN and IG content stacked (not toggled) — replace with `ArticleLanguageToggle` client component

**ISR + Auth rule (CRITICAL — from `docs/decisions/isr-pattern.md`):**

```ts
// ✅ CORRECT
export const revalidate = 60;
export default async function ArticlePage() {
  const article = await getPublishedArticleBySlug(slug); // static, ISR-cached
  return (
    <>
      <ArticleContent article={article} />
      <ArticleComments articleId={article.id} /> // "use client", uses useSession()
    </>
  );
}

// ❌ WRONG — defeats ISR
import { auth } from "@/server/auth/config";
export default async function ArticlePage() {
  const session = await auth(); // ← This opts into dynamic rendering!
```

**View count tracking design:**

- The article page has `revalidate = 60` (ISR). Direct `incrementArticleViewCount()` in Server Component only fires on cache miss (every ~60s), not on every page view — inaccurate.
- Use `<ArticleViewTracker articleId={article.id} />` Client Component that fires `POST /api/v1/articles/[articleId]/view` on mount (every real page load).
- The `view_count` displayed on the page comes from the ISR snapshot (may lag up to 60s — acceptable for MVP).
- The view route must be **fire-and-forget**: return 200 even if DB update fails (don't affect page load).

**`ArticleLanguageToggle` design:**

- Server Component renders both EN and IG content via `renderContent()` (Tiptap `generateHTML` + sanitize-html)
- Passes rendered HTML strings (NOT raw Tiptap JSON) as props to the Client Component
- Client Component uses `useState("en")` and renders the active pane via `dangerouslySetInnerHTML={{ __html: activeContent }}`
- The HTML content was already sanitized server-side — safe to use in `dangerouslySetInnerHTML` client-side
- For non-bilingual articles (`language !== "both"`), skip the toggle entirely and render content directly

**Comment architecture:**

- `ArticleComments` is a `"use client"` component using `useSession()` + `useQuery` from `@tanstack/react-query`
- Comment list endpoint: `GET /api/v1/articles/[articleId]/comments` — public (no auth required)
- Comment add endpoint: `POST /api/v1/articles/[articleId]/comments` — requires auth (401 if not logged in)
- Route auth pattern: `requireAuthenticatedSession()` called **in the route** (not in service). The function takes **NO parameters** — it calls `auth()` internally and returns `{ userId: string; role: string }`. Service `addComment(userId, ...)` receives userId directly — no `request` object in service.
- The `addComment` service function does NOT call `requireAuthenticatedSession` — the route calls it and passes `session.userId` to the service

**Related articles query:**
The SQL for related articles with DISTINCT (to avoid duplicate rows from tag JOIN):

```sql
SELECT DISTINCT ca.id, ca.title, ca.slug, ca.cover_image_url,
       ca.reading_time_minutes, cp.display_name AS author_name
FROM community_articles ca
LEFT JOIN community_profiles cp ON cp.user_id = ca.author_id
LEFT JOIN community_article_tags cat ON cat.article_id = ca.id
WHERE ca.status = 'published'
  AND ca.deleted_at IS NULL
  AND ca.id != $1
  AND (cat.tag = ANY($2) OR ca.author_id = $3)
ORDER BY ca.created_at DESC
LIMIT $4
```

In Drizzle, use `db.execute(sql\`...\`)`with tagged template literals for this query. The raw result is an array of rows — iterate directly (not`.rows`). See `db.execute()` mock format in MEMORY.md.

**`addArticleComment` transaction pattern:**

```ts
await db.transaction(async (tx) => {
  const [comment] = await tx.insert(communityArticleComments).values({
    articleId: data.articleId,
    authorId: data.authorId,
    content: data.content,
    parentCommentId: data.parentCommentId ?? null,
  }).returning({ id: communityArticleComments.id, ... });

  await tx.update(communityArticles)
    .set({ commentCount: sql`${communityArticles.commentCount} + 1` })
    .where(eq(communityArticles.id, data.articleId));

  return comment;
});
```

**`article.commented` event** — already defined in `src/types/events.ts`:

```ts
export interface ArticleCommentedEvent extends BaseEvent {
  articleId: string;
  commentId: string;
  userId: string;
}
// EventName already includes "article.commented"
// EventMap already has "article.commented": ArticleCommentedEvent
```

No changes needed to `src/types/events.ts`.

**Nested comments (parent_comment_id):** DB supports it. Story 6.3 UI only shows top-level comments (`parent_comment_id IS NULL` filter in `listArticleComments`). Reply support is deferred. Include `parent_comment_id` column in the query for future use.

Actually — the AC says comments appear "in chronological order" without mentioning nesting. Keep `listArticleComments` to top-level only: add `isNull(communityArticleComments.parentCommentId)` to the WHERE clause. This simplifies the initial implementation.

**Members-only article notice:**
The article detail page is in the `(guest)` layout, accessible to all. For `members_only` articles, the Server Component renders the full content (ISR-cached, same HTML for all users). The `ArticleComments` component receives `membersOnly={article.visibility === "members_only"}` and when the session is null + membersOnly=true, renders a "members only" CTA rather than the guest comment CTA.

**`ArticleRelatedSuggestions` is a Server Component** — it receives pre-fetched `articles: RelatedArticle[]` from the parent `ArticlePage` and renders static HTML. No client-side fetching needed. This keeps it SSR-cached as part of ISR.

### Technical Requirements

- `withApiHandler()` from `@/server/api/middleware` for all API routes
- `requireAuthenticatedSession()` from `@/services/permissions.ts` for POST comments route — takes **NO parameters** (calls `auth()` internally); returns `{ userId: string; role: string }`
- `ApiError` from `@/lib/api-error` for RFC 7807 errors
- `successResponse(data, undefined, 201)` for the POST comments 201 response
- `import "server-only"` at top of `article-comment-service.ts` only; NOT in query file `article-comments.ts`
- Zod from `"zod/v4"`; use `parsed.error.issues[0]` for validation errors
- EventBus emit: `await eventBus.emit("article.commented", { articleId, commentId, userId, timestamp: new Date().toISOString() })`
- **No `auth()` in article page Server Component** — client components use `useSession()`
- `next/navigation`'s `notFound()` for 404 on article detail page (already used)
- `@/i18n/navigation`'s `Link` component for internal links (not `next/link`)

**View route error handling:**

```ts
// POST /api/v1/articles/[articleId]/view/route.ts
export const POST = withApiHandler(async (request: NextRequest) => {
  const articleId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  try {
    await incrementArticleViewCount(articleId);
  } catch {
    // Swallow error — view tracking is non-critical; do not fail the request
  }
  return successResponse({ ok: true });
});
```

**Comment form Zod schema:**

```ts
import { z } from "zod/v4";
const schema = z.object({
  content: z.string().min(1).max(2000),
  parentCommentId: z.string().uuid().optional(),
});
const parsed = schema.safeParse(body);
if (!parsed.success)
  throw new ApiError({
    title: "Unprocessable Entity",
    status: 422,
    detail: parsed.error.issues[0].message,
  });
```

### Library / Framework Requirements

- **No new packages needed** — everything is already installed:
  - `@tiptap/core` — already installed (used by `generateHTML` in article detail page)
  - `sanitize-html` — already installed (used in article detail page)
  - `@tanstack/react-query` — already used in admin + member components
  - `next-auth/react` — `useSession()` hook, already used in `TopNav`, etc.
  - `lucide-react` — icon library, already used throughout
- `@tiptap/core`'s `generateHTML` is used in the **Server Component** only for pre-rendering article content — do NOT import it in the Client Component (`ArticleLanguageToggle`)

### File Structure Requirements

**New files:**

- `src/db/schema/community-article-comments.ts`
- `src/db/migrations/0029_article_comments.sql`
- `src/db/queries/article-comments.ts`
- `src/db/queries/article-comments.test.ts`
- `src/services/article-comment-service.ts`
- `src/services/article-comment-service.test.ts`
- `src/app/api/v1/articles/[articleId]/comments/route.ts`
- `src/app/api/v1/articles/[articleId]/comments/route.test.ts`
- `src/app/api/v1/articles/[articleId]/view/route.ts`
- `src/app/api/v1/articles/[articleId]/view/route.test.ts`
- `src/features/articles/components/ArticleLanguageToggle.tsx`
- `src/features/articles/components/ArticleViewTracker.tsx`
- `src/features/articles/components/ArticleComments.tsx`
- `src/features/articles/components/ArticleComments.test.tsx`
- `src/features/articles/components/ArticleRelatedSuggestions.tsx`

**Modified files:**

- `src/db/index.ts` — add `import * as communityArticleCommentsSchema` + spread in schema object
- `src/db/queries/articles.ts` — add `commentCount` to `PublicArticleFull` interface + `getPublishedArticleBySlug` select; add `incrementArticleViewCount`, `getRelatedArticles`, `getArticleTagsById`
- `src/db/queries/articles.test.ts` — add tests for 3 new query functions
- `src/db/migrations/meta/_journal.json` — add entry idx:29 for `0029_article_comments`
- `src/app/[locale]/(guest)/articles/[articleId]/page.tsx` — update with JSON-LD, hreflang, language toggle, view tracker, related articles, comments
- `src/features/articles/index.ts` — export new components
- `messages/en.json` — add new keys in `Articles.reading.*`, `Articles.comments.*`, `Articles.related.*`
- `messages/ig.json` — same keys in Igbo
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update `6-3-article-reading-experience: backlog → ready-for-dev`

### Testing Requirements

**Test patterns (critical — same as all previous stories):**

- `// @vitest-environment node` pragma for all server-side test files
- `mockReset()` in `beforeEach` — **NOT** `clearAllMocks()` (see `src/test/vi-patterns.ts`)
- Explicit factory mocks for ALL DB query files:

  ```ts
  vi.mock("@/db/queries/article-comments", () => ({
    addArticleComment: vi.fn(),
    listArticleComments: vi.fn(),
  }));
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
    listPublishedArticlesPublic: vi.fn(),
    getPublishedArticleBySlug: vi.fn(),
    incrementArticleViewCount: vi.fn(),
    getRelatedArticles: vi.fn(),
    getArticleTagsById: vi.fn(),
  }));
  ```

  **Always include ALL exports in the factory mock** — missing a function causes other tests to fail.

- CSRF headers in ALL mutating route tests (POST comments, POST view):
  ```ts
  headers: { Host: "localhost:3000", Origin: "https://localhost:3000" }
  ```
- Rate limiter mock (even if route doesn't use rateLimit option, `withApiHandler` initializes it):

  ```ts
  vi.mock("@/lib/rate-limiter", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    buildRateLimitHeaders: vi.fn().mockReturnValue({}),
  }));
  vi.mock("@/lib/request-context", () => ({
    runWithContext: (_ctx: unknown, fn: () => unknown) => fn(),
  }));
  ```

- EventBus mock for service tests:

  ```ts
  vi.mock("@/services/event-bus", () => ({
    eventBus: { emit: vi.fn(), on: vi.fn() },
  }));
  ```

- `requireAuthenticatedSession` mock for route tests:
  ```ts
  vi.mock("@/services/permissions", () => ({
    requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-uuid" }),
  }));
  ```

**`db.execute()` mock format — CRITICAL:**
`getRelatedArticles` uses `db.execute(sql\`...\`)`. The mock returns a raw array (not `{ rows: [...] }`):

```ts
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([
      { id: "rel-1", title: "Related Article", slug: "related", ... }
    ]),
    // ... other mocked methods
  },
}));
```

Or mock the query function directly in service/route tests (preferred — mock at query layer, not db layer).

**Component tests:**

- `// @vitest-environment jsdom`
- Use custom `render()` from `@/test/test-utils`
- Mock `next-auth/react`:
  ```ts
  vi.mock("next-auth/react", () => ({
    useSession: vi.fn().mockReturnValue({ data: null, status: "unauthenticated" }),
  }));
  ```
  For logged-in tests: `useSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" })`
- Mock `@tanstack/react-query` as needed, or use real `QueryClient` with test wrapper from `test-utils`
- Mock `fetch` for API calls in component tests

**EventBus bridge guard:** Check if `src/server/realtime/subscribers/eventbus-bridge.ts` imports `@/db/queries/article-comments`. If it does, add `vi.mock("@/db/queries/article-comments", () => ({ ... }))` to both `eventbus-bridge.test.ts` AND `notification-flow.test.ts`. The `article.commented` event has no bridge handler currently, so this should NOT require bridge mocks.

### Previous Story Intelligence (from 6.1 + 6.2)

Key patterns established in Stories 6.1 and 6.2 that apply directly here:

- **No `server-only` in query files** (`article-comments.ts` — omit `import "server-only"`)
- **`successResponse(data, undefined, 201)` for 201s** — status is 3rd arg
- **`mockReset()` in `beforeEach`** — not `clearAllMocks()`
- **CSRF headers in mutating routes** — `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`
- **Factory mocks include ALL exports** — when mocking `@/db/queries/articles`, include ALL 18+ exports (not just the new ones) to avoid breaking existing tests
- **`requireAuthenticatedSession` called in route, not service** — service receives `userId` directly (from 6.1 article-service pattern)
- **Tiptap `generateHTML` on server** — runs server-side only; do NOT import Tiptap in client components (bundle size)
- **`article-comments.ts` uses `db.transaction`** for atomic insert + count increment (same pattern as `upsertArticleTags` in `articles.ts`)
- **`getArticleByIdForAdmin` reuse** — already in `articles.ts`; the comment service can use it to verify the article exists and is published (check `result.status === "published"` in service)

### Git Intelligence Summary

Most recent commits confirm:

- Story 6.1 (article editor + submission) is complete and reviewed
- Story 6.2 (admin review + publication) is complete and reviewed
- Both are untracked (new domain, not yet committed to git)
- Current test baseline: **2889/2889** passing

Story 6.3 is the final story in Epic 6, closing out the article reading experience. No new external dependencies. The existing article infrastructure (schema, queries, services) is solid and ready to extend.

### Existing Codebase Reference (Key Functions)

- `src/db/schema/post-interactions.ts` → exact pattern for `communityArticleComments` schema (parentCommentId as plain `uuid()`, not `.references()`)
- `src/db/schema/community-articles.ts` → existing article schema; `commentCount` and `viewCount` already on the table
- `src/db/queries/articles.ts` → `PublicArticleFull` has `viewCount` but **NOT** `commentCount` — must add `commentCount: number` to interface + select; also extend with `incrementArticleViewCount`, `getRelatedArticles`, `getArticleTagsById`; `getArticleByIdForAdmin` (reuse in service for existence check)
- `src/app/[locale]/(guest)/articles/[articleId]/page.tsx` → **existing partial implementation to update** (lines 1–166); keep `renderContent()`, `TIPTAP_EXTENSIONS`, `SANITIZE_OPTIONS`; update metadata, add JSON-LD, replace EN/IG rendering with `ArticleLanguageToggle`
- `src/app/[locale]/(guest)/articles/page.tsx` → reference for articles listing page pattern
- `src/app/[locale]/(guest)/articles/page.test.tsx` → reference for Server Component test pattern
- `src/services/permissions.ts` → `requireAuthenticatedSession()` (used in POST comments route)
- `src/services/admin-approval-service.ts` → article-review-service pattern (auth in service); different here since comment service doesn't have `request`
- `src/lib/api-response.ts` → `successResponse()` + `errorResponse()`
- `src/lib/api-error.ts` → `ApiError`
- `src/server/api/middleware.ts` → `withApiHandler()`
- `src/test/vi-patterns.ts` → documented test patterns
- `docs/decisions/isr-pattern.md` → ISR + auth rules (**read carefully before modifying article page**)
- `src/types/events.ts` → `ArticleCommentedEvent` already defined (lines ~231–235); no changes needed

### DB Schema Context

**`community_article_comments` table (new):**

```sql
CREATE TABLE community_article_comments (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id       UUID        NOT NULL REFERENCES community_articles(id) ON DELETE CASCADE,
    author_id        UUID        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    content          TEXT        NOT NULL,
    parent_comment_id UUID       REFERENCES community_article_comments(id) ON DELETE CASCADE,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_article_comments_article_id_created
    ON community_article_comments(article_id, created_at);
```

**`community_articles` existing columns used in this story:**

- `comment_count INTEGER NOT NULL DEFAULT 0` — incremented by `addArticleComment` transaction
- `view_count INTEGER NOT NULL DEFAULT 0` — incremented by `incrementArticleViewCount`
- Both are `NOT NULL` with defaults — safe to `SET comment_count = comment_count + 1`

**Drizzle schema for `communityArticleComments`:**

```ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";
import { communityArticles } from "./community-articles";

export const communityArticleComments = pgTable(
  "community_article_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => communityArticles.id, { onDelete: "cascade" }),
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
  (t) => [index("idx_community_article_comments_article_id_created").on(t.articleId, t.createdAt)],
);

export type CommunityArticleComment = typeof communityArticleComments.$inferSelect;
export type NewCommunityArticleComment = typeof communityArticleComments.$inferInsert;
```

**JSON-LD Article structured data template:**

```ts
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: article.title,
  datePublished: article.createdAt.toISOString(),
  dateModified: article.updatedAt.toISOString(),
  author: {
    "@type": "Person",
    name: article.authorName ?? "OBIGBO Member",
  },
  publisher: {
    "@type": "Organization",
    name: "OBIGBO",
  },
  ...(article.coverImageUrl ? { image: article.coverImageUrl } : {}),
  url: `https://obigbo.com/${locale}/articles/${slug}`,
};
```

### References

- Epic 6.3 source: `_bmad-output/planning-artifacts/epics.md` — Story 6.3 acceptance criteria
- Story 6.1 (done): `_bmad-output/implementation-artifacts/6-1-article-editor-submission.md` — article DB schema, query patterns, service structure
- Story 6.2 (done): `_bmad-output/implementation-artifacts/6-2-article-review-publication.md` — `getArticleByIdForAdmin` reuse, notification patterns
- ISR pattern: `docs/decisions/isr-pattern.md` — **critical for article page architecture**
- Bilingual editor: `docs/decisions/bilingual-editor-prototype.md` — informs language toggle design
- Post comments reference: `src/db/schema/post-interactions.ts` — exact schema pattern to follow
- Test patterns: `src/test/vi-patterns.ts`
- Article listing page: `src/app/[locale]/(guest)/articles/page.tsx`
- Article listing test: `src/app/[locale]/(guest)/articles/page.test.tsx`
- Article detail page (to update): `src/app/[locale]/(guest)/articles/[articleId]/page.tsx`
- DB queries to extend: `src/db/queries/articles.ts`
- Event types: `src/types/events.ts` — `ArticleCommentedEvent` already there, no changes needed
- Previous migration: `src/db/migrations/0028_article_rejection_feedback.sql`
- Journal: `src/db/migrations/meta/_journal.json` — add entry idx:29
- DB index: `src/db/index.ts` — add `communityArticleCommentsSchema`

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Pre-existing test failure fixed: `src/app/[locale]/(guest)/articles/page.test.tsx` was missing `vi.mock("@/db/queries/articles", ...)` — added complete factory mock with all exports to resolve "Invalid environment variables" error from `@/db/index.ts` import chain.
- No `BROWSE` rate limit preset exists in `src/services/rate-limiter.ts` — GET comments route uses no `rateLimit` option (parenthetical in story allowed this).

### Completion Notes List

- All 9 tasks completed. 2927/2927 tests passing (up from 2889 baseline — +38 new tests).
- `getRelatedArticles` uses `db.execute(sql\`...\`)`for DISTINCT query when tags present; falls back to Drizzle`select()` for author-only when no tags.
- `addArticleComment` uses `db.transaction()` for atomic INSERT + `comment_count + 1` UPDATE.
- ISR pattern preserved: no `auth()` in article detail Server Component; auth-gated features handled via `useSession()` in `ArticleComments` Client Component.
- `ArticleRelatedSuggestions` is a Server Component — receives pre-fetched data from page.tsx, no client-side fetch.
- `article-comments.ts` is NOT imported by `eventbus-bridge.ts` — no bridge mock changes required.
- `0029_article_comments.sql` migration includes self-referential `parent_comment_id` FK enforced by SQL even though Drizzle schema uses plain `uuid()` (no `.references()`).

### Code Review Fixes (2026-03-05)

**Issues fixed (6 of 7 — M6 git discrepancy is a commit hygiene note only):**

- **[H1-fix]** Added `Articles.reading.bilingualBadge` + `Articles.reading.category.*` keys to `messages/en.json` and `messages/ig.json`; updated `page.tsx` to use `t("reading.bilingualBadge")` and `t("reading.category.${article.category}")` — removed hardcoded "EN + IG" and raw `article.category` strings. Also removed `capitalize` CSS class (no longer needed since translations are properly capitalised).
- **[M1-fix]** Fixed `isGuest` in `ArticleComments.tsx`: changed from `status === "unauthenticated" || !session?.user` to `status === "unauthenticated"` — prevents false-positive guest CTA flash during `useSession()` loading state.
- **[M3-fix]** Fixed orphaned `·` separator in `ArticleRelatedSuggestions.tsx`: separator now only renders alongside `authorName` inside a conditional `<>` fragment; added `aria-hidden="true"`.
- **[M4-fix]** Added 2 tests to `ArticleComments.test.tsx`: "shows error message when comment submission fails" + "does NOT show guest CTA while session is still loading" — brings component test count from 6 → 8.
- **[M5-fix]** Removed redundant `await import("@/services/permissions")` in POST comments rate-limit key function; now uses the already-available static import of `requireAuthenticatedSession` directly.

**Test count after review fixes: 2929/2929 (+2 tests)**

### File List

**New files:**

- `src/db/schema/community-article-comments.ts`
- `src/db/migrations/0029_article_comments.sql`
- `src/db/queries/article-comments.ts`
- `src/db/queries/article-comments.test.ts`
- `src/services/article-comment-service.ts`
- `src/services/article-comment-service.test.ts`
- `src/app/api/v1/articles/[articleId]/comments/route.ts`
- `src/app/api/v1/articles/[articleId]/comments/route.test.ts`
- `src/app/api/v1/articles/[articleId]/view/route.ts`
- `src/app/api/v1/articles/[articleId]/view/route.test.ts`
- `src/features/articles/components/ArticleLanguageToggle.tsx`
- `src/features/articles/components/ArticleViewTracker.tsx`
- `src/features/articles/components/ArticleComments.tsx`
- `src/features/articles/components/ArticleComments.test.tsx`
- `src/features/articles/components/ArticleRelatedSuggestions.tsx`

**Modified files:**

- `src/db/index.ts`
- `src/db/migrations/meta/_journal.json`
- `src/db/queries/articles.ts`
- `src/db/queries/articles.test.ts`
- `src/app/[locale]/(guest)/articles/[articleId]/page.tsx`
- `src/app/[locale]/(guest)/articles/page.test.tsx` (pre-existing failure fix)
- `src/features/articles/index.ts`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
