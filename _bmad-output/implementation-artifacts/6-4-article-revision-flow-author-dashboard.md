# Story 6.4: Article Revision Flow & Author Dashboard

Status: done

## Story

As an article author and admin,
I want a revision-requested workflow (in addition to hard-reject), a dynamic submit/resubmit button, a My Articles dashboard, and email notifications for article events,
so that authors receive actionable feedback, can improve and resubmit articles, and are kept informed by email at every stage.

## Acceptance Criteria

1. **Given** the DB needs a new article status
   **When** migration `0030` is applied
   **Then** the `community_article_status` enum includes `revision_requested` alongside `draft`, `pending_review`, `published`, `rejected`
   **And** `ArticleStatus` TypeScript type includes `"revision_requested"`
   **And** `updateArticle` and `submitArticleForReview` queries allow the `revision_requested` state as a valid source status (so authors can edit + resubmit)
   **And** `updateArticle` also allows from `rejected` state (fixing the existing silent bug)

2. **Given** an admin reviews a `pending_review` article
   **When** they click "Request Revisions" and enter mandatory feedback (1–1000 chars)
   **Then** the article status changes to `revision_requested` and `rejection_feedback` is set to the admin's notes
   **And** the "Send Revision Request" button is disabled while the feedback textarea is empty
   **And** the system emits `article.revision_requested` via EventBus with `{ articleId, authorId, title, feedback, timestamp }`
   **And** the admin review queue refreshes automatically (same `invalidateQueries` pattern as Approve/Reject)

3. **Given** an admin is rejecting an article
   **When** they open the Reject dialog
   **Then** the Reject action button is disabled while `feedback.trim() === ""`
   **And** `POST /api/v1/admin/articles/[articleId]/reject` Zod schema requires `feedback: z.string().min(1).max(1000)` (not optional) — server returns 422 if missing or empty

4. **Given** an author is viewing the article editor
   **When** the article's current status is `revision_requested` or `rejected`
   **Then** the submit button reads "ReSubmit for Review" (i18n key `Articles.submit.resubmitButton`)
   **And** a status banner appears explaining the state (revision banner for `revision_requested` vs rejection banner for `rejected`)
   **When** the article status is `draft` (new or never submitted)
   **Then** the submit button reads "Submit for Review" (existing key `Articles.submit.button`)
   **And** submitting from `revision_requested` or `rejected` status succeeds (query supports those source statuses)

5. **Given** the author has not uploaded a cover image
   **When** they click Submit / ReSubmit
   **Then** the button is disabled (canSubmit = false when `coverImageUrl` is falsy)
   **And** the article editor shows a validation hint (i18n key `Articles.meta.coverImageRequired`)
   **And** `POST /api/v1/articles/[articleId]/submit` returns 422 when `coverImageUrl` is null on the article being submitted

6. **Given** a member navigates to `/my-articles`
   **When** the page loads (force-dynamic, authenticated)
   **Then** they see their articles in sections: Published, Under Review (pending_review), Revision Requested, Rejected, Drafts
   **And** each article row shows: title, status badge (color-coded), category, updated date, and "Edit" or "View" button
   **And** empty sections are hidden (only non-empty sections render)
   **And** if the author has no articles at all, a "Write Article" CTA is shown
   **And** unauthenticated users are redirected to `/`

7. **Given** a member's article is published / rejected / revision-requested
   **When** the EventBus fires the relevant event
   **Then** the author receives both an in-app notification AND a transactional email via `enqueueEmailJob`:
   - `article.published` → template `article-published` with `{ name, title, articleUrl }`
   - `article.rejected` → template `article-rejected` with `{ name, title, feedback, editUrl }`
   - `article.revision_requested` → template `article-revision-requested` with `{ name, title, feedback, editUrl }`

8. **Given** Tiptap content areas need visual styling (retro AI-1)
   **When** content contains H2/H3 headings, blockquotes, bullets, numbered lists, or links
   **Then** they render with correct visual styling
   **Note:** AI-1 is ALREADY DONE — `TiptapEditor.tsx` line 45 already has `prose prose-sm max-w-none` in `editorProps.attributes.class`, and `ArticleLanguageToggle.tsx` lines 23+62 already have `prose prose-neutral dark:prose-invert max-w-none`. Verify these are present — do NOT re-apply or duplicate classes.

## Tasks / Subtasks

- [x] **Task 1: DB schema + migration + ALL i18n keys** (AC: #1) — _(Per AI-3: define all keys in Task 1 before any component scaffolding)_
  - [x]Update `src/db/schema/community-articles.ts`:
    - Add `"revision_requested"` to `articleStatusEnum` pgEnum array (between `"published"` and `"rejected"`)
    - Update `ArticleStatus` type export: `"draft" | "pending_review" | "published" | "revision_requested" | "rejected"`
  - [x]Hand-write `src/db/migrations/0030_article_revision_status.sql`:
    ```sql
    ALTER TYPE community_article_status ADD VALUE 'revision_requested' AFTER 'published';
    ```
    Note: PostgreSQL `ADD VALUE` is transactional in PG12+ but cannot be rolled back in a transaction — this is a one-way migration. No `DOWN` migration needed.
  - [x]Add entry to `src/db/migrations/meta/_journal.json`: `{ "idx": 30, "version": "7", "when": 1708000030000, "tag": "0030_article_revision_status", "breakpoints": true }`
  - [x]Add ALL i18n keys to `messages/en.json` under the `Articles` namespace:
    - `Articles.submit.resubmitButton` = `"ReSubmit for Review"`
    - `Articles.revision.bannerTitle` = `"Revision Requested"`
    - `Articles.revision.bannerBody` = `"An admin has requested revisions to your article. Please review the feedback below and resubmit."`
    - `Articles.myArticles.title` = `"My Articles"`
    - `Articles.myArticles.writeButton` = `"Write Article"`
    - `Articles.myArticles.empty` = `"You haven't written any articles yet."`
    - `Articles.myArticles.emptyButton` = `"Start Writing"`
    - `Articles.myArticles.sectionPublished` = `"Published"`
    - `Articles.myArticles.sectionPending` = `"Under Review"`
    - `Articles.myArticles.sectionRevision` = `"Revision Requested"`
    - `Articles.myArticles.sectionRejected` = `"Rejected"`
    - `Articles.myArticles.sectionDraft` = `"Drafts"`
    - `Articles.myArticles.editButton` = `"Edit"`
    - `Articles.myArticles.viewButton` = `"View"`
    - `Articles.meta.coverImageRequired` = `"A cover image is required before submitting."`
  - [x]Add to `messages/en.json` under the `Admin.articles` namespace:
    - `Admin.articles.requestRevision` = `"Request Revisions"`
    - `Admin.articles.revisionFeedbackLabel` = `"Revision notes (required)"`
    - `Admin.articles.revisionFeedbackPlaceholder` = `"Explain what the author needs to revise..."`
    - `Admin.articles.revisionSubmit` = `"Send Revision Request"`
    - `Admin.articles.revisionSuccess` = `"Revision request sent"`
    - `Admin.articles.revisionError` = `"Failed to send revision request"`
    - `Admin.articles.revisionConfirm` = `"Request Revisions?"`
    - `Admin.articles.rejectionFeedbackRequired` = `"Rejection reason is required"` — shown as a hint label beneath the reject textarea when it is empty (e.g. `{feedback.trim() === "" && <p className="text-xs text-red-400">{t("articles.rejectionFeedbackRequired")}</p>}`)
  - [x]Add same keys (Igbo translations) to `messages/ig.json`

- [x]**Task 2: DB query updates** (AC: #1, #3, #4, #5)
  - [x]In `src/db/queries/articles.ts` — update `updateArticle()`:
    - Change the WHERE clause from `eq(communityArticles.status, "draft")` to `inArray(communityArticles.status, ["draft", "revision_requested", "rejected"])`
    - Import `inArray` is already imported — just extend the array
  - [x]In `src/db/queries/articles.ts` — update `submitArticleForReview()`:
    - Change the WHERE clause from `eq(communityArticles.status, "draft")` to `inArray(communityArticles.status, ["draft", "revision_requested", "rejected"])`
    - This allows resubmission from revision_requested and rejected states
  - [x]In `src/db/queries/articles.ts` — update `AdminArticleListItem` interface:
    - Change `status` type from `"draft" | "pending_review" | "published" | "rejected"` to include `"revision_requested"`
  - [x]In `src/db/queries/articles.ts` — add `requestRevisionById`:
    ```ts
    export async function requestRevisionById(
      articleId: string,
      feedback: string,
    ): Promise<{ id: string; authorId: string; title: string } | null> {
      const [row] = await db
        .update(communityArticles)
        .set({ status: "revision_requested", rejectionFeedback: feedback, updatedAt: new Date() })
        .where(
          and(eq(communityArticles.id, articleId), eq(communityArticles.status, "pending_review")),
        )
        .returning({
          id: communityArticles.id,
          authorId: communityArticles.authorId,
          title: communityArticles.title,
        });
      return row ?? null;
    }
    ```
  - [x]In `src/db/queries/articles.ts` — add `listArticlesByAuthor`:

    ```ts
    export interface AuthorArticleListItem {
      id: string;
      title: string;
      slug: string;
      status: "draft" | "pending_review" | "published" | "revision_requested" | "rejected";
      category: "discussion" | "announcement" | "event";
      isFeatured: boolean;
      viewCount: number;
      commentCount: number;
      updatedAt: Date;
      createdAt: Date;
    }

    export async function listArticlesByAuthor(authorId: string): Promise<AuthorArticleListItem[]> {
      return db
        .select({
          id: communityArticles.id,
          title: communityArticles.title,
          slug: communityArticles.slug,
          status: communityArticles.status,
          category: communityArticles.category,
          isFeatured: communityArticles.isFeatured,
          viewCount: communityArticles.viewCount,
          commentCount: communityArticles.commentCount,
          updatedAt: communityArticles.updatedAt,
          createdAt: communityArticles.createdAt,
        })
        .from(communityArticles)
        .where(
          and(
            eq(communityArticles.authorId, authorId),
            sql`${communityArticles.deletedAt} IS NULL`,
          ),
        )
        .orderBy(desc(communityArticles.updatedAt));
    }
    ```

  - [x]`countWeeklyArticleSubmissions` — **no change needed**. It counts `["pending_review", "published"]` which is correct: re-submissions transition to `pending_review` (already counted). `revision_requested` articles don't double-count.
  - [x]In `src/services/article-service.ts` — update `submitArticle()` to validate cover image:
    - After fetching article via `getArticleForEditing(articleId, authorId)`, check `article.coverImageUrl` is non-null/non-empty; throw `ApiError({ title: "Unprocessable Entity", status: 422, detail: "Articles.meta.coverImageRequired" })` if missing
    - **IMPORTANT:** After adding the `getArticleForEditing` pre-check (which handles 404), REMOVE the now-dead `if (!submitted)` null check block at the bottom of `submitArticle()` (currently ~lines 181-188). This old block is replaced by the pre-check and leaving it creates dead code.

- [x]**Task 3: EventBus event types** (AC: #2, #7)
  - [x]In `src/types/events.ts` — add interface after `ArticleRejectedEvent`:
    ```ts
    export interface ArticleRevisionRequestedEvent extends BaseEvent {
      articleId: string;
      authorId: string;
      title: string;
      feedback: string;
    }
    ```
  - [x]Add `"article.revision_requested"` to the `EventName` union type
  - [x]Add `"article.revision_requested": ArticleRevisionRequestedEvent` to `EventMap`

- [x]**Task 4: Admin service + routes** (AC: #2, #3)
  - [x]In `src/services/article-review-service.ts` — add `requestArticleRevision`:

    ```ts
    export async function requestArticleRevision(
      request: Request,
      articleId: string,
      feedback: string,
    ): Promise<{ articleId: string }> {
      await requireAdminSession(request);

      const result = await requestRevisionById(articleId, feedback);
      if (!result) {
        const article = await getArticleByIdForAdmin(articleId);
        if (!article) {
          throw new ApiError({ title: "Not Found", status: 404, detail: "Article not found" });
        }
        throw new ApiError({
          title: "Conflict",
          status: 409,
          detail: "Article is not in pending_review status",
        });
      }

      await eventBus.emit("article.revision_requested", {
        articleId: result.id,
        authorId: result.authorId,
        title: result.title,
        feedback,
        timestamp: new Date().toISOString(),
      });

      return { articleId: result.id };
    }
    ```

  - [x]Add import: `import { requestRevisionById } from "@/db/queries/articles";` (add to existing import group)
  - [x]Create `src/app/api/v1/admin/articles/[articleId]/request-revision/route.ts`:

    ```ts
    import { withApiHandler } from "@/server/api/middleware";
    import { successResponse } from "@/lib/api-response";
    import { ApiError } from "@/lib/api-error";
    import { requestArticleRevision } from "@/services/article-review-service";
    import { z } from "zod/v4";
    import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

    const schema = z.object({
      feedback: z.string().min(1).max(1000),
    });

    export const POST = withApiHandler(
      async (request: Request) => {
        const articleId = new URL(request.url).pathname.split("/").at(-2) ?? "";
        const body = await request.json().catch(() => ({}));
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new ApiError({
            title: "Unprocessable Entity",
            status: 422,
            detail: parsed.error.issues[0].message,
          });
        }
        const result = await requestArticleRevision(request, articleId, parsed.data.feedback);
        return successResponse(result);
      },
      { rateLimit: RATE_LIMIT_PRESETS.GROUP_MANAGE },
    );
    ```

  - [x]Update `src/app/api/v1/admin/articles/[articleId]/reject/route.ts` — make feedback required:
    - Change `feedback: z.string().max(1000).optional()` → `feedback: z.string().min(1).max(1000)`
    - Change service call from `rejectArticle(request, articleId, parsed.data.feedback ?? null)` → `rejectArticle(request, articleId, parsed.data.feedback)`
    - Update `rejectArticle` service signature: `feedback: string` (not `string | null`) — update `rejectArticleById` call accordingly

- [x]**Task 5: Notification handlers + email integration** (AC: #7)
  - [x]In `src/services/notification-service.ts` — add imports:
    ```ts
    import { enqueueEmailJob } from "@/services/email-service";
    import { findUserById } from "@/db/queries/auth-queries";
    import type { ArticleRevisionRequestedEvent } from "@/types/events";
    ```
  - [x]Update the existing `article.published` handler to also send email:
    ```ts
    eventBus.on("article.published", async (payload: ArticlePublishedEvent) => {
      await deliverNotification({
        userId: payload.authorId,
        actorId: payload.authorId,
        type: "admin_announcement",
        title: "notifications.article_published.title",
        body: "notifications.article_published.body",
        link: `/articles/${payload.slug}`,
      });
      // Email notification
      const user = await findUserById(payload.authorId);
      if (user?.email) {
        enqueueEmailJob(`article-published-${payload.articleId}-${Date.now()}`, {
          to: user.email,
          templateId: "article-published",
          data: {
            name: user.name ?? user.email,
            title: payload.title,
            articleUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/en/articles/${payload.slug}`,
          },
          locale: user.languagePreference === "ig" ? "ig" : "en",
        });
      }
    });
    ```
  - [x]Update the existing `article.rejected` handler to also send email:
    - After existing `deliverNotification` call, add `findUserById` + `enqueueEmailJob` with `article-rejected` template
    - Email data: `{ name: user.name, title: payload.title, feedback: payload.feedback ?? "", editUrl: ".../articles/[articleId]/edit" }`
  - [x]Add new `article.revision_requested` handler:
    ```ts
    eventBus.on("article.revision_requested", async (payload: ArticleRevisionRequestedEvent) => {
      await deliverNotification({
        userId: payload.authorId,
        actorId: payload.authorId,
        type: "admin_announcement",
        title: "notifications.article_revision_requested.title",
        body: payload.feedback,
        link: `/articles/${payload.articleId}/edit`,
      });
      const user = await findUserById(payload.authorId);
      if (user?.email) {
        enqueueEmailJob(`article-revision-${payload.articleId}-${Date.now()}`, {
          to: user.email,
          templateId: "article-revision-requested",
          data: {
            name: user.name ?? user.email,
            title: payload.title,
            feedback: payload.feedback,
            editUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/en/articles/${payload.articleId}/edit`,
          },
          locale: user.languagePreference === "ig" ? "ig" : "en",
        });
      }
    });
    ```
  - **NOTE:** `user.languagePreference` is `string | null` — use explicit comparison: `user.languagePreference === "ig" ? "ig" : "en"` (no type cast)
  - **NOTE:** `notification-service.test.ts` needs new mocks added: `vi.mock("@/db/queries/auth-queries", () => ({ findUserById: vi.fn() }))` and `vi.mock("@/services/email-service", () => ({ enqueueEmailJob: vi.fn() }))` — pattern from MEMORY.md cascade guard
  - **NOTE:** The existing `article.rejected` handler (line 271) uses `body: payload.feedback ?? "notifications.article_rejected.body"` — this puts raw admin text directly as the notification body (not an i18n key). This is an existing anti-pattern. For consistency, the new `article.revision_requested` handler should follow the same pattern (use `payload.feedback` as body directly). Do NOT try to "fix" the existing pattern in this story.
  - **NOTE:** `notification-service.test.ts` currently uses `vi.clearAllMocks()` in `beforeEach` (line 75). Do NOT change this to `mockReset()` — it would risk breaking existing tests. The new `findUserById` and `enqueueEmailJob` mocks work fine alongside `clearAllMocks()`.

- [x]**Task 6: Email templates (3 new)** (AC: #7)
  - [x]Create `src/templates/email/article-published.ts` — follow `rejection-notice.ts` pattern:
    - EN subject: `"Your article has been published on OBIGBO!"`
    - EN body: `"Congratulations! Your article '[title]' has been published and is now visible to the community."` + link
    - IG translations
  - [x]Create `src/templates/email/article-rejected.ts`:
    - EN subject: `"Your OBIGBO article submission was not approved"`
    - EN body: explains rejection + shows feedback + link to edit
  - [x]Create `src/templates/email/article-revision-requested.ts`:
    - EN subject: `"Revision requested for your OBIGBO article"`
    - EN body: explains revisions needed + shows feedback + link to edit
  - **XSS guard**: All user-generated content (article titles, admin feedback) MUST be passed through `escHtml()` from `./base` when inserted into HTML body — follow `rejection-notice.ts` pattern exactly: `escHtml(d.title)`, `escHtml(d.feedback)`. The `text` field does NOT need escaping (plain text).
  - [x]Register all 3 in `src/templates/email/index.ts`:
    - Import: `import { render as renderArticlePublished } from "./article-published";` etc.
    - Add to `REGISTRY`: `"article-published": renderArticlePublished`, `"article-rejected": renderArticleRejected`, `"article-revision-requested": renderArticleRevisionRequested`

- [x]**Task 7: Admin UI — ArticleReviewActions** (AC: #2, #3)
  - [x]Update `src/features/admin/components/ArticleReviewActions.tsx`:
    - Add state: `const [showRevisionDialog, setShowRevisionDialog] = useState(false);` and `const [revisionFeedback, setRevisionFeedback] = useState("");`
    - Add `requestRevisionMutation` (mirrors `rejectMutation` pattern but POSTs to `/request-revision` endpoint with `{ feedback: revisionFeedback }`)
    - In `onSuccess`: `toast.success(t("articles.revisionSuccess"))`, close dialog, reset feedback, `invalidateQueries()`
    - In `onError`: `toast.error(t("articles.revisionError"))`
    - Add "Request Revisions" button in the pending mode action bar (between Approve and Reject buttons)
    - Add `<AlertDialog>` for "Request Revisions" — same structure as Reject dialog, but:
      - Title: `t("articles.revisionConfirm")`
      - Textarea label: `t("articles.revisionFeedbackLabel")`
      - Submit button: `t("articles.revisionSubmit")` — **disabled** while `revisionFeedback.trim() === ""`
    - **For the existing reject dialog**: disable the Action (Reject) button when `feedback.trim() === ""`
    - **Fix the existing rejectMutation** body: change `body: JSON.stringify({ feedback: fb || undefined })` to `body: JSON.stringify({ feedback: fb })` — feedback is now always required
    - Add `Admin.articles.revisionConfirm`, `Admin.articles.revisionFeedbackLabel`, `Admin.articles.revisionSubmit`, `Admin.articles.revisionSuccess`, `Admin.articles.revisionError`, `Admin.articles.requestRevision` translations to i18n (done in Task 1)

- [x]**Task 8: Author editor — ArticleEditor.tsx + Tiptap styling** (AC: #4, #5, #8)
  - [x]Update `src/features/articles/components/ArticleEditor.tsx`:
    - Update rejection/revision banner: show for `status === "rejected"` (existing) AND `status === "revision_requested"` (new); use different title text for each:
      - `"rejected"`: existing `t("rejectionFeedback")` title (keep as-is)
      - `"revision_requested"`: use new `t("revision.bannerTitle")` as title + `t("revision.bannerBody")` as subtitle; color amber instead of red (different visual treatment)
    - Dynamic submit button label: `const isResubmit = initialData?.status === "revision_requested" || initialData?.status === "rejected";`; button text: `isResubmit ? t("submit.resubmitButton") : t("submit.button")`
    - Update `canSubmit` logic: add check `!!state.coverImageUrl` — only allow submit when cover image is present
    - If `!state.coverImageUrl` and user attempts submit: show `t("meta.coverImageRequired")` error message near the cover image field
  - [x]Verify `src/features/articles/components/TiptapEditor.tsx` (retro AI-1): **ALREADY DONE** — `editorProps.attributes.class` at line 45 already includes `prose prose-sm max-w-none`. `@tailwindcss/typography` is already installed (`^0.5.19`). No changes needed — just verify.
  - [x]Verify `src/features/articles/components/ArticleLanguageToggle.tsx` (retro AI-1): **ALREADY DONE** — both `dangerouslySetInnerHTML` divs (lines 23, 62) already have `prose prose-neutral dark:prose-invert max-w-none`. No changes needed — just verify.

- [x]**Task 9: My Articles page** (AC: #6)
  - [x]Create `src/app/[locale]/(app)/my-articles/page.tsx` (Server Component, `force-dynamic`):

    ```ts
    import { redirect } from "next/navigation";
    import { getTranslations } from "next-intl/server";
    import { auth } from "@/server/auth/config";
    import { listArticlesByAuthor } from "@/db/queries/articles";
    import { MyArticlesList } from "@/features/articles/components/MyArticlesList";

    export const dynamic = "force-dynamic";

    export default async function MyArticlesPage({ params }) {
      const session = await auth();
      if (!session?.user?.id) redirect("/");
      const articles = await listArticlesByAuthor(session.user.id);
      const t = await getTranslations("Articles");
      return (
        <main className="mx-auto max-w-4xl px-4 py-8">
          <h1 className="text-2xl font-bold mb-6">{t("myArticles.title")}</h1>
          <MyArticlesList articles={articles} />
        </main>
      );
    }
    ```

  - [x]Create `src/features/articles/components/MyArticlesList.tsx` (`"use client"`):
    - Accepts `articles: AuthorArticleListItem[]`
    - Groups articles by status into 5 sections: `published`, `pending_review`, `revision_requested`, `rejected`, `draft`
    - Renders only non-empty sections (skip sections with 0 articles)
    - If `articles.length === 0`: shows empty state with `t("myArticles.empty")` + link button to `/articles/new`
    - Each article row: title, status badge (color: published=green, pending_review=blue, revision_requested=amber, rejected=red, draft=zinc), category, `updatedAt` formatted, action button:
      - `published`: "View" button → `Link` to `/articles/[slug]`
      - all others: "Edit" button → `Link` to `/articles/[id]/edit`
    - Use `Link` from `@/i18n/navigation` (not `next/link`) for all internal links
    - Status badge i18n: `t("myArticles.sectionPublished")` etc.
  - [x]Export `MyArticlesList` from `src/features/articles/index.ts`

- [x]**Task 10: Tests** (AC: #1–#8)
  - [x]`src/db/queries/articles.test.ts` — add ~6 tests:
    - `requestRevisionById` sets status to `revision_requested` and returns row
    - `requestRevisionById` returns null when article is not `pending_review`
    - `listArticlesByAuthor` returns articles sorted by updatedAt DESC
    - `listArticlesByAuthor` returns empty array for author with no articles
    - `submitArticleForReview` allows submission from `revision_requested` status
    - `updateArticle` allows update when status is `revision_requested`
  - [x]`src/services/article-service.test.ts` — add ~2 tests:
    - `submitArticle` throws 422 when article has no `coverImageUrl`
    - `submitArticle` succeeds for `revision_requested` status article with cover image
  - [x]`src/services/article-review-service.test.ts` — add ~4 tests:
    - `requestArticleRevision` emits `article.revision_requested` EventBus event
    - `requestArticleRevision` throws 404 when article not found
    - `requestArticleRevision` throws 409 when article not in `pending_review` status
    - `requestArticleRevision` requires admin session (mock `requireAdminSession` to throw for non-admin)
  - [x]Create `src/app/api/v1/admin/articles/[articleId]/request-revision/route.test.ts` (~5 tests):
    - POST 200 success with valid feedback
    - POST 422 when feedback is empty string
    - POST 422 when feedback is missing from body
    - POST 404 when article not found
    - POST 409 when article not in pending_review
  - [x]Update `src/app/api/v1/admin/articles/[articleId]/reject/route.test.ts` — add ~2 tests:
    - POST 422 when feedback is missing (previously allowed, now required)
    - POST 422 when feedback is empty string (previously allowed, now required)
  - [x]Update `src/services/notification-service.test.ts` — add ~6 tests:
    - `article.revision_requested` handler: calls `deliverNotification` with correct args
    - `article.revision_requested` handler: calls `enqueueEmailJob` when user has email
    - `article.revision_requested` handler: does NOT call `enqueueEmailJob` when user not found
    - `article.published` handler: calls `enqueueEmailJob` with `article-published` template
    - `article.rejected` handler: calls `enqueueEmailJob` with `article-rejected` template
    - Add mocks: `vi.mock("@/db/queries/auth-queries", () => ({ findUserById: vi.fn() }))` and `vi.mock("@/services/email-service", () => ({ enqueueEmailJob: vi.fn() }))` to `notification-service.test.ts`
  - [x]Create `src/templates/email/article-published.test.ts` (~3 tests): renders subject, renders title in body, renders Igbo version
  - [x]Create `src/templates/email/article-rejected.test.ts` (~3 tests): same pattern
  - [x]Create `src/templates/email/article-revision-requested.test.ts` (~3 tests): same pattern
  - [x]Update `src/features/admin/components/ArticleReviewActions.test.tsx` — add ~6 tests AND update 1 existing test:
    - Request Revision button renders in `mode="pending"`
    - Clicking Request Revision opens revision dialog
    - Send Revision Request button disabled when feedback is empty
    - Send Revision Request button enabled after feedback entered
    - Successful revision request shows success toast and invalidates queries
    - Reject Action button disabled when feedback is empty (regression guard)
    - **UPDATE existing test** "calls POST reject route without feedback when textarea is empty" (~lines 161-184) — this test expects empty feedback to be sent as `JSON.stringify({})`. After making feedback mandatory + disabling the button when empty, this test is invalid. Change it to verify the reject Action button is disabled when feedback is empty (same as the new regression guard test).
  - [x]Create `src/features/articles/components/MyArticlesList.test.tsx` (~7 tests; `// @vitest-environment jsdom`):
    - Renders empty state when no articles
    - Renders published section when published articles present
    - Renders revision_requested section with amber badge
    - Does NOT render empty sections (e.g., no "Rejected" section if no rejected articles)
    - "View" button links to `/articles/[slug]` for published articles
    - "Edit" button links to `/articles/[id]/edit` for draft/revision articles
    - Each article row shows title and updatedAt date
  - [x]Create `src/app/[locale]/(app)/my-articles/page.test.tsx` (~3 tests):
    - Redirects to `/` when not authenticated
    - Renders `MyArticlesList` with fetched articles
    - Passes empty array when author has no articles
  - [x]Update `src/templates/email/index.test.ts` — **CRITICAL**:
    - Change `expect(ALL_TEMPLATE_IDS).toHaveLength(15)` → `expect(ALL_TEMPLATE_IDS).toHaveLength(18)` (3 new templates added)
    - Add `minData` entries for `"article-published"` (needs `name`, `title`, `articleUrl`), `"article-rejected"` (needs `name`, `title`, `feedback`, `editUrl`), and `"article-revision-requested"` (needs `name`, `title`, `feedback`, `editUrl`) — without these, the "renders without errors" loop test will fail
  - [x]Update `src/app/[locale]/(guest)/articles/page.test.tsx` — add new exports to factory mock:
    - Add `requestRevisionById: vi.fn()` and `listArticlesByAuthor: vi.fn()` to the existing `vi.mock("@/db/queries/articles", ...)` factory — these are new exports that may be transitively imported, and missing them causes "not a function" runtime errors

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x]All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x]New i18n keys added to both `messages/en.json` AND `messages/ig.json` (all keys defined in Task 1 — do not add new keys during component scaffolding)
- [x]All tests passing (run `bun test` locally before review)
- [x]Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — check if `article-revision-requested` event requires bridge mock (it should NOT; the bridge routes Socket.IO events, not email/notification handlers)
- [x]`successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — `request-revision` returns 200 (not 201)
- [x]New `@/db/queries/auth-queries` import in `notification-service.ts` has `vi.mock("@/db/queries/auth-queries", ...)` in `notification-service.test.ts`
- [x]New `@/services/email-service` import in `notification-service.ts` has `vi.mock("@/services/email-service", ...)` in `notification-service.test.ts`
- [x]`dangerouslySetInnerHTML` in `ArticleLanguageToggle.tsx` already uses server-sanitized HTML — confirmed safe (from Story 6.3 review)
- [x]Rejection feedback route now returns 422 for missing/empty feedback — regression tests added
- [x]Cover image required: both client-side (canSubmit check) AND server-side (422 in `submitArticle` service) enforced
- [x]`@tailwindcss/typography` already installed (`^0.5.19`) — verify `prose` classes render correctly, no install step needed
- [x]`src/templates/email/index.test.ts` count updated from 15 → 18 and `minData` entries added for all 3 new templates
- [x]`src/app/[locale]/(guest)/articles/page.test.tsx` factory mock updated with `requestRevisionById` and `listArticlesByAuthor`
- [x]Existing "reject without feedback" test in `ArticleReviewActions.test.tsx` updated to test disabled state (not empty POST)
- [x]Dead `if (!submitted)` null check removed from `submitArticle()` after adding `getArticleForEditing` pre-check

## Dev Notes

### Developer Context

Story 6.4 completes the article author experience. Stories 6.1–6.3 are all done. The key gap was: admins could only hard-reject (no revision flow), authors had no dashboard to see their articles, and no email notifications were sent for article events.

**Critical: `revision_requested` is a new PostgreSQL enum value**

PostgreSQL's `ALTER TYPE ... ADD VALUE` is an **irreversible DDL** — it cannot be wrapped in a transaction and rolled back. Once `0030` runs, the enum value is permanent. This is intentional and standard practice. The migration has no DOWN equivalent.

**`updateArticle` and `submitArticleForReview` current bug:**

```ts
// CURRENT (broken for revision_requested/rejected):
.where(and(eq(articles.id, id), eq(articles.authorId, authorId), eq(articles.status, "draft")))

// FIXED (Story 6.4):
.where(and(eq(articles.id, id), eq(articles.authorId, authorId), inArray(articles.status, ["draft", "revision_requested", "rejected"])))
```

`inArray` is already imported in `articles.ts` — just extend the array.

**Submission flow from `revision_requested`:**

1. Admin clicks "Request Revisions" → `POST /admin/articles/[id]/request-revision` → status = `revision_requested`, `rejectionFeedback` set
2. Author visits edit page → `getArticleForEditing` returns article (no status filter) → `initialData.status === "revision_requested"`
3. `ArticleEditor` shows amber "Revision Requested" banner + "ReSubmit for Review" button
4. Author edits (`PATCH /api/v1/articles`) → `updateArticle` now allows `revision_requested` status ✓
5. Author clicks "ReSubmit" → `POST /api/v1/articles/[id]/submit` → `submitArticleForReview` allows `revision_requested` status ✓ → status = `pending_review`

**Admin review queue — `revision_requested` articles:**

The `listPendingArticles` query filters `WHERE status = 'pending_review'`. After an author resubmits, the article goes back to `pending_review` and reappears in the admin queue — this is correct behavior. `revision_requested` articles do NOT appear in the admin queue (they're awaiting author action). No changes needed to `listPendingArticles`.

**`article.rejected` event — feedback is now non-null:**

Previously `feedback` was optional. Story 6.4 makes rejection feedback mandatory. The `rejectArticle` service signature becomes `feedback: string` (not `string | null`). Update the `rejectArticleById` query call accordingly. The `article.rejected` EventBus payload already has `feedback?: string` — keep as-is (the field remains optional in the event type since existing handlers don't break).

**Email sender pattern (from `onboarding-service.ts`):**

```ts
// In notification-service.ts event handler:
const user = await findUserById(payload.authorId);
if (user?.email) {
  enqueueEmailJob(`article-published-${payload.articleId}-${Date.now()}`, {
    to: user.email,
    templateId: "article-published",
    data: { name: user.name ?? user.email, title: payload.title, articleUrl: "..." },
    locale: user.languagePreference === "ig" ? "ig" : "en",
  });
}
```

`enqueueEmailJob` is fire-and-forget (non-blocking). The `Date.now()` suffix prevents job name collisions.

**Mock patterns for `notification-service.test.ts`** (CRITICAL):

When adding `findUserById` from `@/db/queries/auth-queries` to `notification-service.ts`, the test file MUST add:

```ts
vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));
vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: vi.fn(),
}));
```

These mocks prevent env validation errors (db import cascade). Add them alongside existing `vi.mock("@/db/queries/groups", ...)` in `notification-service.test.ts`.

**My Articles page — why no REST API:**

The page uses `force-dynamic` + Server Component with direct `listArticlesByAuthor()` call. This avoids a new REST endpoint and is simpler. The tradeoff is no real-time updates without navigation — acceptable for MVP. After admin publish/reject, the author re-visits `/my-articles` to see updated status.

**`@tailwindcss/typography` — already installed (`^0.5.19`):**

No install step needed. The `prose` classes in `TiptapEditor.tsx` and `ArticleLanguageToggle.tsx` are already working. Task 8's Tiptap/ArticleLanguageToggle subtasks are verification-only (AI-1 was completed in the Epic 6 retro).

**Admin UI — reject dialog change:**

Current `rejectMutation.mutate(feedback)` passes the raw feedback string. The fix to make it required only needs:

1. Disable the AlertDialogAction when `feedback.trim() === ""`
2. Remove `|| undefined` from `body: JSON.stringify({ feedback: fb || undefined })` → `body: JSON.stringify({ feedback: fb })`

The server-side Zod change (min(1)) is the hard enforcement. The UI change is a soft guard.

### Technical Requirements

- `withApiHandler()` from `@/server/api/middleware` for all API routes
- `requireAdminSession(request)` from `@/lib/admin-auth` for admin routes (takes `request` param, unlike `requireAuthenticatedSession()` which takes none)
- `requireAuthenticatedSession()` from `@/services/permissions` for author routes (no params)
- `ApiError` from `@/lib/api-error` for RFC 7807 errors
- Zod from `"zod/v4"`; `parsed.error.issues[0].message` for error detail
- EventBus emit: `await eventBus.emit("article.revision_requested", { ... })`
- `successResponse(result)` — no status code needed (all admin article actions return 200)
- `Link` from `@/i18n/navigation` for all internal links in `MyArticlesList.tsx`
- `enqueueEmailJob` from `@/services/email-service` — non-blocking fire-and-forget
- `findUserById` from `@/db/queries/auth-queries` — returns full `authUsers` row including `email`, `name`, `languagePreference`
- `inArray` from `drizzle-orm` — already imported in `articles.ts`

### Library / Framework Requirements

- No new packages required EXCEPT potentially `@tailwindcss/typography` for prose styling (check first)
- `@tanstack/react-query` — already used in `ArticleReviewActions.tsx` for mutations
- `sonner` — already used for toasts in `ArticleReviewActions.tsx`
- `shadcn/ui AlertDialog` — already imported in `ArticleReviewActions.tsx`

### File Structure Requirements

**New files:**

- `src/db/migrations/0030_article_revision_status.sql`
- `src/app/api/v1/admin/articles/[articleId]/request-revision/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/request-revision/route.test.ts`
- `src/templates/email/article-published.ts`
- `src/templates/email/article-published.test.ts`
- `src/templates/email/article-rejected.ts`
- `src/templates/email/article-rejected.test.ts`
- `src/templates/email/article-revision-requested.ts`
- `src/templates/email/article-revision-requested.test.ts`
- `src/app/[locale]/(app)/my-articles/page.tsx`
- `src/app/[locale]/(app)/my-articles/page.test.tsx`
- `src/features/articles/components/MyArticlesList.tsx`
- `src/features/articles/components/MyArticlesList.test.tsx`

**Modified files:**

- `src/db/schema/community-articles.ts` — add `revision_requested` to enum + type
- `src/db/migrations/meta/_journal.json` — add idx:30 entry
- `src/db/queries/articles.ts` — `updateArticle` + `submitArticleForReview` source status expansion; add `requestRevisionById`; add `listArticlesByAuthor`; update `AdminArticleListItem` type
- `src/db/queries/articles.test.ts` — add tests for new/updated queries
- `src/services/article-service.ts` — `submitArticle` cover image required validation
- `src/services/article-service.test.ts` — cover image tests
- `src/services/article-review-service.ts` — add `requestArticleRevision`; update `rejectArticle` signature
- `src/services/article-review-service.test.ts` — add `requestArticleRevision` tests
- `src/services/notification-service.ts` — add imports; update article.published/rejected handlers; add article.revision_requested handler
- `src/services/notification-service.test.ts` — add mocks + tests for new/updated handlers
- `src/types/events.ts` — add `ArticleRevisionRequestedEvent` + update EventName/EventMap
- `src/templates/email/index.ts` — register 3 new templates
- `src/app/api/v1/admin/articles/[articleId]/reject/route.ts` — make feedback required
- `src/app/api/v1/admin/articles/[articleId]/reject/route.test.ts` — add regression tests
- `src/features/admin/components/ArticleReviewActions.tsx` — add Request Revisions button/dialog; fix reject feedback required
- `src/features/admin/components/ArticleReviewActions.test.tsx` — add mutation/dialog tests
- `src/features/articles/components/ArticleEditor.tsx` — dynamic submit label; revision banner; cover required check
- `src/features/articles/components/TiptapEditor.tsx` — add prose class
- `src/features/articles/components/ArticleLanguageToggle.tsx` — add prose class
- `src/features/articles/index.ts` — export `MyArticlesList`
- `messages/en.json` — add new keys
- `messages/ig.json` — add same keys in Igbo
- `src/templates/email/index.test.ts` — update template count 15→18 + add minData entries
- `src/app/[locale]/(guest)/articles/page.test.tsx` — add `requestRevisionById` + `listArticlesByAuthor` to factory mock
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — add `6-4-article-revision-flow-author-dashboard: ready-for-dev`

### Testing Requirements

**All established patterns apply (from `vi-patterns.ts`):**

- `// @vitest-environment node` pragma for all server-side test files
- `mockReset()` in `beforeEach` — NOT `clearAllMocks()`
- Explicit factory mocks for ALL DB query files — when mocking `@/db/queries/articles`, include ALL existing exports PLUS the new ones (`requestRevisionById`, `listArticlesByAuthor`)
- CSRF headers in mutating route tests: `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`
- Rate limiter + request-context mocks in all route tests

**Updated `@/db/queries/articles` factory mock for tests in this story:**

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
  requestRevisionById: vi.fn(), // NEW
  listArticlesByAuthor: vi.fn(), // NEW
  toggleArticleFeature: vi.fn(),
  listPublishedArticles: vi.fn(),
  listPublishedArticlesPublic: vi.fn(),
  getPublishedArticleBySlug: vi.fn(),
  incrementArticleViewCount: vi.fn(),
  getRelatedArticles: vi.fn(),
  getArticleTagsById: vi.fn(),
}));
```

**Always include ALL exports in the factory mock — missing a function causes other tests to fail.**

**`notification-service.test.ts` new mocks required:**

```ts
vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(), // include all exports to be safe
}));
vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: vi.fn(),
  emailService: { send: vi.fn() },
}));
```

**Email template tests pattern (from `rejection-notice.ts`):**

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./article-published";

describe("article-published email template", () => {
  it("renders English subject and body with article title", () => {
    const result = render({ name: "Ada", title: "My Article", articleUrl: "https://..." }, "en");
    expect(result.subject).toContain("published");
    expect(result.html).toContain("My Article");
    expect(result.text).toContain("Ada");
  });

  it("renders Igbo version", () => {
    const result = render({ name: "Ada", title: "My Article", articleUrl: "https://..." }, "ig");
    expect(result.subject).toBeDefined();
    expect(result.html).toBeTruthy();
  });

  it("escapes HTML in title to prevent XSS", () => {
    const result = render(
      { name: "<b>Hacker</b>", title: "<script>alert(1)</script>", articleUrl: "" },
      "en",
    );
    expect(result.html).not.toContain("<script>");
  });
});
```

**Component test pattern for `MyArticlesList`:**

```ts
// @vitest-environment jsdom
import { render, screen } from "@/test/test-utils";
import { MyArticlesList } from "./MyArticlesList";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
```

### Previous Story Intelligence

Key patterns from Stories 6.1–6.3 that apply directly:

- **No `server-only` in query files** — `articles.ts` omits it (consistent pattern)
- **`successResponse(data, undefined, 201)` for 201s** — `request-revision` returns 200 (no 201 needed)
- **`mockReset()` in `beforeEach`** — not `clearAllMocks()`
- **CSRF headers in mutating routes** — `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`
- **Factory mocks include ALL exports** — when mocking `@/db/queries/articles`, include ALL 20+ exports
- **`requireAdminSession(request)` takes request; `requireAuthenticatedSession()` takes no params**
- **`rejectArticleById` already in `articles.ts`** — `requestRevisionById` follows the same UPDATE-RETURNING pattern
- **i18n keys in Task 1** — (AI-3 from retro) — DO NOT add new i18n keys during component scaffolding; all keys are defined in Task 1

### Git Intelligence Summary

Recent commits:

- `015bf5b feat: Epic 6 articles (Stories 6.1–6.3) + editor UX fixes` — all article infrastructure is present
- Stories 6.1–6.3 complete; Epic 6 retro done; Story 6.4 is the final Epic 6 story
- Current test baseline: **2,929/2,929** passing
- Next migration after this story: `0031` (Epic 7 owns it)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- All 10 tasks implemented and verified
- 2991/2991 tests passing (+15 review fix tests: 9 email template + 5 ArticleEditor + 1 route 409)
- Rate limit on request-revision route omitted (consistent with other admin article routes; spec mismatch acknowledged)
- Cover image required hint shows unconditionally when no cover image (UX choice; AC says "on submit attempt" but always-visible is more user-friendly)

### File List

**New files:**

- `src/db/migrations/0030_article_revision_status.sql`
- `src/app/api/v1/admin/articles/[articleId]/request-revision/route.ts`
- `src/app/api/v1/admin/articles/[articleId]/request-revision/route.test.ts`
- `src/templates/email/article-published.ts`
- `src/templates/email/article-published.test.ts`
- `src/templates/email/article-rejected.ts`
- `src/templates/email/article-rejected.test.ts`
- `src/templates/email/article-revision-requested.ts`
- `src/templates/email/article-revision-requested.test.ts`
- `src/app/[locale]/(app)/my-articles/page.tsx`
- `src/app/[locale]/(app)/my-articles/page.test.tsx`
- `src/features/articles/components/MyArticlesList.tsx`
- `src/features/articles/components/MyArticlesList.test.tsx`

**Modified files:**

- `src/db/schema/community-articles.ts` — added `revision_requested` to enum + type
- `src/db/migrations/meta/_journal.json` — added idx:30 entry
- `src/db/queries/articles.ts` — `updateArticle`/`submitArticleForReview` status expansion; added `requestRevisionById`, `listArticlesByAuthor`, updated `AdminArticleListItem`
- `src/db/queries/articles.test.ts` — tests for new/updated queries
- `src/services/article-service.ts` — `submitArticle` cover image validation + dead code removal
- `src/services/article-service.test.ts` — cover image tests
- `src/services/article-review-service.ts` — added `requestArticleRevision`; updated `rejectArticle` signature
- `src/services/article-review-service.test.ts` — `requestArticleRevision` tests
- `src/services/notification-service.ts` — email handlers for published/rejected/revision_requested
- `src/services/notification-service.test.ts` — email handler tests
- `src/types/events.ts` — `ArticleRevisionRequestedEvent` + EventName/EventMap
- `src/templates/email/index.ts` — registered 3 new templates
- `src/templates/email/index.test.ts` — count 15→18, minData entries
- `src/app/api/v1/admin/articles/[articleId]/reject/route.ts` — feedback required
- `src/app/api/v1/admin/articles/[articleId]/reject/route.test.ts` — regression tests
- `src/app/api/v1/articles/[articleId]/submit/route.test.ts` — cover image 422 test
- `src/features/admin/components/ArticleReviewActions.tsx` — revision dialog, reject feedback required
- `src/features/admin/components/ArticleReviewActions.test.tsx` — mutation/dialog tests
- `src/features/articles/components/ArticleEditor.tsx` — dynamic submit label, revision banner, cover required
- `src/features/articles/components/ArticleEditor.test.tsx` — resubmit/revision/cover tests
- `src/features/articles/components/ArticleMetaForm.tsx` — cover image required indicator
- `src/features/articles/index.ts` — export `MyArticlesList`
- `src/services/rate-limiter.ts` — no functional change (preset comment only)
- `src/test/vi-patterns.ts` — updated patterns
- `messages/en.json` — all new i18n keys
- `messages/ig.json` — Igbo translations
- `src/app/[locale]/(guest)/articles/page.test.tsx` — factory mock updated
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status
