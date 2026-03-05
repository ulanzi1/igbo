---
title: "Epic 6 Retro Action Items (AI-1 through AI-6)"
slug: "epic-6-retro-action-items"
created: "2026-03-05"
status: "ready-for-dev"
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - "Next.js 16.1.x App Router"
  - "TypeScript strict"
  - "Drizzle ORM / PostgreSQL"
  - "Zod v4"
  - "Vitest + React Testing Library"
files_to_modify:
  - "src/services/article-service.ts"
  - "src/features/articles/components/ArticleMetaForm.tsx"
  - "src/services/rate-limiter.ts"
  - "src/test/vi-patterns.ts"
  - "messages/en.json"
  - "messages/ig.json"
  - "src/app/api/v1/articles/[articleId]/submit/route.test.ts"
  - "src/services/article-service.test.ts"
  - "_bmad-output/implementation-artifacts/sprint-status.yaml"
files_to_create:
  - "docs/decisions/dangerous-inner-html.md"
  - "docs/decisions/daily-co-integration.md"
code_patterns:
  - "ApiError({ title, status, detail }) — detail carries i18n key"
  - "submitArticle flow: permission → weekly limit → getArticleForEditing → cover check → submitArticleForReview → emit"
  - "getArticleForEditing(articleId, authorId) returns full article row including coverImageUrl"
  - "vi-patterns.ts is JSDoc-only — no exported functions for documentation patterns"
test_patterns:
  - "Route tests: mock service via mockRejectedValue(new ApiError({...})); never mock withApiHandler"
  - "Service tests: mockReset() + default mockResolvedValue() in beforeEach for each mock used by the function"
  - "Cast mock return: } as Awaited<ReturnType<typeof getArticleForEditing>>)"
---

# Tech-Spec: Epic 6 Retro Action Items (AI-1 through AI-6)

**Created:** 2026-03-05

## Overview

### Problem Statement

The Epic 6 retrospective (2026-03-05) identified 6 action items that must be completed before Epic 7 begins. Code investigation confirms:

- **AI-1** (Tiptap prose CSS) is already done — `prose` class present in both `TiptapEditor.tsx` and `ArticleLanguageToggle.tsx`, and `globals.css` has custom `.prose` rules for h2/h3/blockquote/bullets/links.
- **AI-2** (cover image mandatory) is NOT done — `coverImageUrl` is still optional at submit time; no 422 validation exists.
- **AI-3** (i18n keys in Task 1) is a process change owned by SM/PO — no dev code.
- **AI-4** (`dangerouslySetInnerHTML` safe-use pattern) is NOT documented — JSDoc and ADR doc missing.
- **AI-5** (rate limit preset JSDoc) is NOT done — `RATE_LIMIT_PRESETS` has no JSDoc listing preset names; `BROWSE` is referenced in story templates but does not exist.
- **AI-6** (Daily.co spike doc) is NOT done — `docs/decisions/daily-co-integration.md` does not exist.

### Solution

1. **AI-1**: No code change — confirm done, update sprint status.
2. **AI-2**: Add cover-image-required check in `submitArticle` service + i18n keys + required asterisk on `ArticleMetaForm` label + 2 new tests.
3. **AI-4**: Append JSDoc block to `vi-patterns.ts` + create `docs/decisions/dangerous-inner-html.md` ADR.
4. **AI-5**: Add JSDoc above `RATE_LIMIT_PRESETS` in `rate-limiter.ts` listing all preset names and noting `BROWSE` does not exist.
5. **AI-6**: Create `docs/decisions/daily-co-integration.md` spike document.
6. Update sprint status to mark retro action items done.

### Scope

**In Scope:**

- AI-1: Verify confirmed done (prose classes + globals.css custom styles — no code change)
- AI-2: `coverImageUrl` required at SUBMIT time — `submitArticle` throws 422 with i18n key `Articles.meta.coverImageRequired` when article has null cover image
- AI-4: `dangerouslySetInnerHTML` + `sanitize-html` safe-use pattern in `vi-patterns.ts` + new ADR doc
- AI-5: JSDoc on `RATE_LIMIT_PRESETS` in `rate-limiter.ts` listing all preset names + `BROWSE` absence note
- AI-6: `docs/decisions/daily-co-integration.md` covering `createMeeting`, `getMeetingToken`, sandbox env, CI mock strategy, recording webhook payload
- Sprint status updated with `epic-6-retro-action-items: done`

**Out of Scope:**

- AI-3 (process change — Bob/SM + Alice/PO; applied starting from Story 6.4 spec authoring)
- Story 6.4 implementation (separate story, owns migration 0030)
- Adding a `BROWSE` preset (not added — public GETs use no `rateLimit` option on `withApiHandler`)
- Actually calling the Daily.co API (spike is a design/reference document)

---

## Context for Development

### Codebase Patterns

- **AI-1 confirmed done**: `TiptapEditor.tsx:45` has `class: "min-h-[200px] outline-none prose prose-sm max-w-none p-3"` in `editorProps.attributes.class`. `ArticleLanguageToggle.tsx` lines 23 and 62 both have `className="prose prose-neutral dark:prose-invert max-w-none"` on the content `div`s. `globals.css:168–303` has custom `.prose` rules for h2 (`font-size: 1.5em`), h3 (`font-size: 1.25em`), blockquote (border-left, italic), ul/ol (list-style + padding), links (blue, underline). The `.ProseMirror` selector is co-targeted for the editor. AI-1 is done.

- **AI-2 validation placement**: Validation must be in `submitArticle` (service), NOT in `saveDraft`. Authors save drafts progressively without a cover image. The 422 fires only when the author clicks "Submit for Review". `getArticleForEditing(articleId, authorId)` returns the full `communityArticles.$inferSelect` row including `coverImageUrl: string | null`. It is already imported in `article-service.ts`.

- **submitArticle new flow**:
  1. `getUserMembershipTier` → permission check (403)
  2. `countWeeklyArticleSubmissions` → rate check (409)
  3. **NEW**: `getArticleForEditing(articleId, authorId)` → null check (404), then `coverImageUrl` null check (422)
  4. `submitArticleForReview(articleId, authorId)` → UPDATE (this always succeeds now; old null check removed)
  5. `eventBus.emit("article.submitted", ...)` — unchanged

- **ApiError convention**: `throw new ApiError({ title: "Unprocessable Entity", status: 422, detail: "Articles.meta.coverImageRequired" })` — `detail` carries the i18n key for client display.

- **i18n placement**: Add `"coverImageRequired"` key inside the existing `"meta"` object in `Articles` namespace in both `messages/en.json` and `messages/ig.json`. The `meta` object already contains `coverImage`, `tags`, `category`, etc.

- **vi-patterns.ts is JSDoc-only**: Every pattern is a JSDoc comment block (no exported functions for documentation-only entries). Append the new block at the end of the file.

- **docs/decisions/ format**: Markdown ADR. Header: `# ADR: Title`, then `**Date:**`, `**Status:**`, `**Context:**`, horizontal rule, `## Decision`, `## Pattern` (with code), `## Rationale`, `## Pre-Review Checklist`. See `isr-pattern.md` and `bilingual-editor-prototype.md` for reference.

- **rate-limiter.ts JSDoc placement**: Add a JSDoc block immediately above `export const RATE_LIMIT_PRESETS = {`. The block should list all preset keys grouped by category (Auth, User self-service, Chat, Members, Feed/Posts, Groups, Tier quotas) and include a `⚠️ NOTE: BROWSE does NOT exist` warning.

### Files to Reference

| File                                                               | Purpose                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `src/features/articles/components/TiptapEditor.tsx:43–46`          | AI-1: confirm `prose` class in `editorProps.attributes.class`                         |
| `src/features/articles/components/ArticleLanguageToggle.tsx:20–65` | AI-1: confirm `prose prose-neutral dark:prose-invert max-w-none` on both content divs |
| `src/app/globals.css:168–303`                                      | AI-1: custom `.prose` + `.ProseMirror` styles                                         |
| `src/services/article-service.ts:158–197`                          | AI-2: `submitArticle` function — add `getArticleForEditing` + cover check             |
| `src/db/queries/articles.ts:110–127`                               | AI-2: `getArticleForEditing` — returns full row; already imported in service          |
| `src/features/articles/components/ArticleMetaForm.tsx:129–130`     | AI-2: cover image `<label>` — add required asterisk                                   |
| `messages/en.json` (Articles.meta object)                          | AI-2: add `coverImageRequired` key                                                    |
| `messages/ig.json` (Articles.meta object)                          | AI-2: add `coverImageRequired` key                                                    |
| `src/app/api/v1/articles/[articleId]/submit/route.test.ts`         | AI-2: existing 4-test file — add 422 test                                             |
| `src/services/article-service.test.ts:192–276`                     | AI-2: `submitArticle` describe — update beforeEach + 404 test + add 422 test          |
| `src/test/vi-patterns.ts`                                          | AI-4: append `dangerouslySetInnerHTML` JSDoc block at end                             |
| `docs/decisions/isr-pattern.md`                                    | Reference ADR format                                                                  |
| `src/services/rate-limiter.ts:5–82`                                | AI-5: add JSDoc above `RATE_LIMIT_PRESETS`                                            |
| `_bmad-output/implementation-artifacts/sprint-status.yaml:109`     | Final: add `epic-6-retro-action-items: done` after `epic-6-retrospective: done`       |

### Technical Decisions

- **Cover image validated at submit, not save**: Draft creation remains unrestricted. Blocking `saveDraft` on cover image would hurt progressive-save UX. The retro AC explicitly states "Submitting an article without a cover image returns 422".
- **No BROWSE preset**: Public GET routes should use `withApiHandler` with no `rateLimit` option. Keying by `userId` is not possible for unauthenticated requests; adding BROWSE would require a different key strategy. Document the absence; don't add the preset.
- **Daily.co spike is design-only**: API shapes documented from Daily.co REST API v1 docs. The Story 7.3 implementer must verify endpoint responses against the live API before coding. The spike removes unknowns from spec authoring, not from implementation.
- **getArticleForEditing null → 404 replaces submitArticleForReview null → 404**: The pre-check fetches the article before the UPDATE, making the "not found" case deterministic. The old check on `submitted` (the UPDATE result) is removed — if the article existed at step 3, the UPDATE will succeed (status was already validated to be "draft" by `submitArticleForReview`'s WHERE clause).

---

## Implementation Plan

### Tasks

- [ ] **Task 1 — Confirm AI-1 done (read-only verification)**
  - File: `src/features/articles/components/TiptapEditor.tsx`
  - Action: Read line 43–46 and confirm `prose prose-sm max-w-none` is present in `editorProps.attributes.class`. No code change needed.
  - File: `src/features/articles/components/ArticleLanguageToggle.tsx`
  - Action: Read lines 20–65 and confirm both content `div`s have `prose prose-neutral dark:prose-invert max-w-none`. No code change needed.
  - Notes: If for any reason `prose` is missing, add it. The custom `.prose` CSS in `globals.css:168–303` is what actually applies the styles — the `prose` class is the hook.

- [ ] **Task 2 — AI-2: Add i18n keys**
  - File: `messages/en.json`
  - Action: Inside the `Articles.meta` object (after `"coverAlt": "Cover"`), add:
    ```json
    "coverImageRequired": "Cover image is required to submit an article."
    ```
  - File: `messages/ig.json`
  - Action: Inside the `Articles.meta` object (after `"coverAlt": "Mkpuchi"`), add:
    ```json
    "coverImageRequired": "Akara foto dị mkpa iji zipu isiokwu."
    ```

- [ ] **Task 3 — AI-2: Cover image check in `submitArticle` service**
  - File: `src/services/article-service.ts`
  - Action: In the `submitArticle` function (line ~158), after the `weeklyCount >= maxPerWeek` block and **before** the `const submitted = await submitArticleForReview(...)` call, insert:
    ```ts
    const article = await getArticleForEditing(articleId, authorId);
    if (!article) {
      throw new ApiError({
        title: "Not Found",
        status: 404,
        detail: "Article not found or not editable",
      });
    }
    if (!article.coverImageUrl) {
      throw new ApiError({
        title: "Unprocessable Entity",
        status: 422,
        detail: "Articles.meta.coverImageRequired",
      });
    }
    ```
  - Action: **Keep** `const submitted = await submitArticleForReview(articleId, authorId)` and the existing `if (!submitted) { throw new ApiError({ ... 404 ... }) }` block **exactly as they are**. Do NOT remove them. They provide TOCTOU defense: if the article's status changes between the `getArticleForEditing` pre-check and the UPDATE (race condition where another request submits the same article concurrently), `submitArticleForReview` returns null and the existing null-check surfaces a 404.
  - Notes: `getArticleForEditing` is already imported at line 10. Do not add a new import. Keep the `eventBus.emit("article.submitted", ...)` call unchanged.

- [ ] **Task 4 — AI-2: Required asterisk on ArticleMetaForm cover image label**
  - File: `src/features/articles/components/ArticleMetaForm.tsx`
  - Action: Read the file first to confirm the exact text of the cover image label (it is in the `{/* Cover Image */}` section, line ~130). Then replace:
    ```tsx
    // Before (exact text — verify matches file before editing):
    <label className="text-sm font-medium">{t("meta.coverImage")}</label>
    // After:
    <label className="text-sm font-medium">
      {t("meta.coverImage")} <span className="text-destructive" aria-hidden="true">*</span>
    </label>
    ```
  - Notes: Include sufficient surrounding lines as context when using the Edit tool to ensure a unique match. The `{/* Cover Image */}` comment immediately above is a reliable anchor.

- [ ] **Task 5 — AI-2: Tests**
  - File: `src/app/api/v1/articles/[articleId]/submit/route.test.ts`
  - Action: Add one test inside the existing `describe("POST /api/v1/articles/[articleId]/submit", ...)` block:

    ```ts
    it("returns 422 when cover image is missing", async () => {
      mockSubmitArticle.mockRejectedValue(
        new ApiError({
          title: "Unprocessable Entity",
          status: 422,
          detail: "Articles.meta.coverImageRequired",
        }),
      );

      const request = new Request(`https://localhost:3000/api/v1/articles/${ARTICLE_ID}/submit`, {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(422);
    });
    ```

  - File: `src/services/article-service.test.ts`
  - Action (a): In the `submitArticle` `describe` block `beforeEach` (lines ~193–198), add after the existing resets:
    ```ts
    mockGetArticleForEditing.mockReset();
    mockGetArticleForEditing.mockResolvedValue({
      id: ARTICLE_ID,
      coverImageUrl: "/uploads/cover.jpg",
      status: "draft",
    } as Awaited<ReturnType<typeof getArticleForEditing>>);
    ```
  - Action (b): The existing "throws 404 when article not found" test **does not need to change**. It mocks `mockSubmitArticleForReview.mockResolvedValue(null)` which still correctly hits the TOCTOU null-check at the bottom of `submitArticle` (because the `beforeEach` default for `mockGetArticleForEditing` returns an article with a cover image, so the new pre-checks pass). Leave this test as-is.
  - Action (c): Add a new test after the 404 test:

    ```ts
    it("throws 422 when coverImageUrl is null", async () => {
      mockGetTier.mockResolvedValue("PROFESSIONAL");
      mockCountWeekly.mockResolvedValue(0);
      mockGetArticleForEditing.mockResolvedValue({
        id: ARTICLE_ID,
        coverImageUrl: null,
        status: "draft",
      } as Awaited<ReturnType<typeof getArticleForEditing>>);

      const err = await submitArticle(AUTHOR_ID, ARTICLE_ID).catch((e: ApiError) => e);
      expect((err as ApiError).status).toBe(422);
      expect((err as ApiError).detail).toBe("Articles.meta.coverImageRequired");
      expect(mockSubmitArticleForReview).not.toHaveBeenCalled();
    });
    ```

  - Notes: `mockGetArticleForEditing` is already declared at line 70 (`const mockGetArticleForEditing = vi.mocked(getArticleForEditing)`). No new import or mock declaration needed.

- [ ] **Task 6 — AI-4: `dangerouslySetInnerHTML` JSDoc in `vi-patterns.ts`**
  - File: `src/test/vi-patterns.ts`
  - Action: Append the following JSDoc block at the end of the file (after the last comment block):
    ````ts
    /**
     * ✅ dangerouslySetInnerHTML safe-use — ALWAYS sanitize server-side first.
     *
     * Root cause: React's `dangerouslySetInnerHTML` renders HTML strings exactly as-is.
     * If that HTML contains user-generated content (article body, rich text, bios),
     * it creates an XSS vector — any `<script>` or event handler in the HTML executes.
     *
     * Rule: Any HTML string passed to `dangerouslySetInnerHTML` MUST be sanitized
     * with `sanitize-html` on the server BEFORE being sent to the client component.
     * The client component receives clean HTML and can safely render it.
     *
     * ✅ CORRECT — server component sanitizes first:
     * ```ts
     * import sanitizeHtml from "sanitize-html";
     *
     * // In Server Component (server-side):
     * const safeHtml = sanitizeHtml(rawHtmlFromTiptap, {
     *   allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h2", "h3", "img"]),
     *   allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt"] },
     * });
     *
     * // Pass safe HTML to client component:
     * return <ArticleLanguageToggle enContent={safeHtml} />;
     *
     * // In client component — safe because input was sanitized server-side:
     * <div dangerouslySetInnerHTML={{ __html: enContent }} />
     * ```
     *
     * ❌ WRONG — rendering raw user HTML without sanitization:
     * ```tsx
     * <div dangerouslySetInnerHTML={{ __html: article.contentHtml }} />
     * // article.contentHtml came directly from DB — NOT sanitized
     * ```
     *
     * Pre-review check: Search for `dangerouslySetInnerHTML` in all components and verify
     * the HTML source was sanitized with `sanitize-html` before reaching the client.
     *
     * First hit: Story 6.2 ArticlePreviewModal — unsanitized admin preview of user article HTML.
     * Canonical correct example: Story 6.3 article reading page — Server Component passes
     * sanitized HTML strings to `<ArticleLanguageToggle>`.
     */
    ````

- [ ] **Task 7 — AI-4: Create `docs/decisions/dangerous-inner-html.md`**
  - File: `docs/decisions/dangerous-inner-html.md` (new file)
  - Action: Create the file with the content below. Write the markdown content directly to the file — the outer code fence in this spec is for display only; do NOT include it in the file itself.

    ````markdown
    # ADR: dangerouslySetInnerHTML Safe-Use Pattern

    **Date:** 2026-03-05
    **Status:** Accepted
    **Context:** Story 6.2 review found an XSS vulnerability — user-generated HTML was rendered via `dangerouslySetInnerHTML` in the admin article preview modal without sanitization. `sanitize-html` was already installed and used in other parts of the codebase but was not applied before this client render.

    ---

    ## Decision

    Any HTML string rendered via React's `dangerouslySetInnerHTML` MUST be sanitized with `sanitize-html` on the **server** before being passed to a client component.

    ## Pattern

    **Server Component (or API route) — sanitize before sending to client:**

    ```ts
    import sanitizeHtml from "sanitize-html";

    const safeEnHtml = sanitizeHtml(rawEnHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h2", "h3", "img"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ["src", "alt"],
      },
    });
    // Pass safeEnHtml as a prop to the client component
    ```
    ````

    **Client Component — render pre-sanitized HTML:**

    ```tsx
    // Safe: the HTML was sanitized server-side before reaching this component
    <div dangerouslySetInnerHTML={{ __html: enContent }} />
    ```

    ## Rationale
    - `sanitize-html` is already installed in this project (`package.json`).
    - Server-side sanitization runs once before the HTML is sent over the wire, keeping the client bundle free of sanitization logic.
    - The article reading flow (Story 6.3) is the canonical correct example: `ArticlePage` (Server Component) calls `sanitizeHtml` before passing `enContent`/`igContent` to `<ArticleLanguageToggle>` (Client Component).
    - Static HTML strings authored by developers do not need sanitization — only user-generated content (article body, profile bio, rich text from Tiptap, etc.).

    ## Pre-Review Checklist
    - [ ] Every `dangerouslySetInnerHTML` usage can be traced to a `sanitize-html` call upstream in a Server Component or API route.
    - [ ] The HTML source is user-generated content (not developer-authored static strings).
    - [ ] `sanitize-html` options include the tags/attributes used by Tiptap output (h2, h3, img, a, ul, ol, li, blockquote, strong, em, code, pre).

    ```

    ```

- [ ] **Task 8 — AI-5: JSDoc on `RATE_LIMIT_PRESETS`**
  - File: `src/services/rate-limiter.ts`
  - Action: Insert the following JSDoc block immediately above `export const RATE_LIMIT_PRESETS = {` (line 5):
    ```ts
    /**
     * All rate-limit presets. Use with `withApiHandler({ rateLimit: { ...RATE_LIMIT_PRESETS.KEY } })`.
     *
     * Available preset names:
     *   Auth:              LOGIN, REGISTER, FORGOT_PASSWORD, RESEND_VERIFY, EMAIL_OTP, MFA_VERIFY
     *   User self-service: PROFILE_UPDATE, LANGUAGE_UPDATE, GDPR_EXPORT
     *   General:           API_GENERAL
     *   Files:             FILE_UPLOAD_PRESIGN
     *   Notifications:     NOTIFICATION_FETCH
     *   Chat:              CONVERSATION_LIST, CONVERSATION_CREATE, MESSAGE_FETCH, CONVERSATION_READ,
     *                      CONVERSATION_MARK_READ, CONVERSATION_MEMBER_MANAGE, MESSAGE_REACTION,
     *                      MESSAGE_EDIT, MESSAGE_DELETE, MESSAGE_SEARCH, BLOCK_MUTE,
     *                      CONVERSATION_PREFERENCE, DND_TOGGLE
     *   Members:           MEMBER_SEARCH, MEMBER_SUGGESTIONS, SUGGESTION_DISMISS,
     *                      MEMBER_FOLLOW, FOLLOW_LIST, FOLLOW_STATUS_BATCH
     *   Feed/Posts:        FEED_READ, POST_CREATE, POST_COMMENTS_READ, POST_COMMENT_DELETE,
     *                      POST_REACTIONS_READ, POST_REACT, POST_COMMENT, POST_SHARE,
     *                      POST_BOOKMARK, BOOKMARK_LIST, PIN_POST
     *   Groups:            GROUP_CREATE, GROUP_UPDATE, GROUP_LIST, GROUP_DETAIL, GROUP_JOIN,
     *                      GROUP_REQUEST, GROUP_APPROVE_REJECT, GROUP_LEAVE, GROUP_CHANNEL, GROUP_MANAGE
     *   Tier quotas:       TIER_BASIC, TIER_PROFESSIONAL, TIER_TOP_TIER
     *
     * ⚠️  `BROWSE` does NOT exist. Story specs must not reference it.
     * For public GET routes (unauthenticated), omit the `rateLimit` option entirely from `withApiHandler`.
     */
    ```

- [ ] **Task 9 — AI-6: Create `docs/decisions/daily-co-integration.md`**
  - File: `docs/decisions/daily-co-integration.md` (new file)
  - Action: Create the file with the content below. Write the markdown content directly to the file — the outer code fence in this spec is for display only; do NOT include it in the file itself.

    ````markdown
    # ADR: Daily.co Video Meeting Integration Spike

    **Date:** 2026-03-05
    **Status:** Proposed — verify API shapes against live Daily.co docs before Story 7.3 implementation
    **Owner:** Winston (Architect)
    **Context:** Story 7.3 (Epic 7) requires video meeting integration. Daily.co REST API is the chosen provider. This spike documents the API shape, sandbox setup, CI mock strategy, and recording webhook payload so Story 7.3 can be written and implemented without API unknowns.

    ---

    ## Daily.co REST API — Core Operations

    Base URL: `https://api.daily.co/v1`
    Auth header: `Authorization: Bearer $DAILY_API_KEY`

    ### createMeeting — Create a Room

    ```ts
    // POST https://api.daily.co/v1/rooms
    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `igbo-event-${eventId}`, // optional; auto-generated if omitted
        privacy: "private", // "public" | "private"
        properties: {
          exp: Math.floor(Date.now() / 1000) + 7200, // expires in 2 hours
          max_participants: 100,
          enable_recording: "cloud", // "cloud" | "local" | "none"
          enable_chat: true,
        },
      }),
    });

    // Success response shape:
    interface DailyRoom {
      id: string;
      name: string;
      url: string; // e.g. "https://igbo.daily.co/igbo-event-abc123"
      privacy: "public" | "private";
      created_at: string; // ISO 8601
      config: {
        exp?: number;
        max_participants?: number;
        enable_recording?: "cloud" | "local" | "none";
        enable_chat?: boolean;
      };
    }
    ```
    ````

    ### getMeetingToken — Participant Join Token

    ```ts
    // POST https://api.daily.co/v1/meeting-tokens
    const response = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: room.name,
          user_id: userId,
          user_name: displayName,
          is_owner: isHost, // true for event organizer
          exp: Math.floor(Date.now() / 1000) + 7200,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    // Success response shape:
    interface DailyMeetingToken {
      token: string; // JWT — pass as `token` query param or Daily SDK prop
    }
    ```

    ### deleteRoom — End a Meeting

    ```ts
    // DELETE https://api.daily.co/v1/rooms/{name}
    await fetch(`https://api.daily.co/v1/rooms/${room.name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
    });
    // 200 { deleted: true, name: "igbo-event-abc123" }
    ```

    ***

    ## Embed Strategy (Story 7.3)

    **Recommended: Daily Prebuilt (iframe)**

    ```tsx
    // No npm package needed — just an iframe
    <iframe
      src={`${room.url}?t=${token}`}
      allow="camera; microphone; fullscreen; speaker; display-capture"
      style={{ width: "100%", height: "600px", border: "none" }}
    />
    ```

    Prebuilt provides a full-featured meeting UI (camera, mic, chat, screenshare, recording controls) with zero client JS bundle overhead.

    **Future: Call Object (`@daily-co/daily-js`)** — full custom UI, larger bundle. Deferred post-v1.

    ***

    ## Sandbox Environment
    1. Register at `https://www.daily.co/` — free tier supports up to 10 participants / 200 minutes per month.
    2. Create a test domain (e.g., `igbo-dev.daily.co`) in the Daily.co dashboard.
    3. Generate an API key under Settings → Developers.
    4. Add to `.env.local`: `DAILY_API_KEY=your_test_key`
    5. Test domain is fully isolated from production — safe for local development.

    ***

    ## CI Mock Strategy

    All Daily.co API calls must go through a thin service wrapper so tests can mock them without needing `DAILY_API_KEY` in CI.

    **Service wrapper (to be created in Story 7.3):**

    ```ts
    // src/services/daily-service.ts
    export async function createMeeting(eventId: string): Promise<DailyRoom> { ... }
    export async function getMeetingToken(roomName: string, userId: string, isHost: boolean): Promise<string> { ... }
    export async function deleteRoom(roomName: string): Promise<void> { ... }
    ```

    **Test mock pattern:**

    ```ts
    vi.mock("@/services/daily-service", () => ({
      createMeeting: vi.fn().mockResolvedValue({
        id: "room-abc",
        name: "igbo-event-test",
        url: "https://igbo-dev.daily.co/igbo-event-test",
        privacy: "private",
        created_at: "2026-01-01T00:00:00Z",
        config: { exp: 9999999999, enable_recording: "cloud" },
      }),
      getMeetingToken: vi.fn().mockResolvedValue("mock-daily-jwt"),
      deleteRoom: vi.fn().mockResolvedValue(undefined),
    }));
    ```

    Rule: Routes and services NEVER call `fetch("https://api.daily.co/...")` directly — always through the service wrapper.

    ***

    ## Recording Webhook Payload

    Daily.co sends a POST to your configured webhook URL when a cloud recording is ready:

    ```ts
    interface DailyRecordingWebhook {
      version: "v2";
      type: "recording.ready-to-download";
      id: string; // webhook event ID
      room_name: string;
      session_id: string;
      recording_id: string;
      duration: number; // seconds
      max_participants: number;
      start_ts: number; // unix timestamp (meeting start)
      status: "finished";
      s3key?: string; // if custom S3 bucket configured
      download_link?: string; // pre-signed URL, expires ~6 hours
      share_token?: string; // Daily.co hosted playback token
    }
    ```

    **Webhook signature verification** (`x-daily-signature` header):

    ```ts
    import { createHmac } from "crypto";

    function verifyDailySignature(body: string, signature: string): boolean {
      const expected = createHmac("sha256", process.env.DAILY_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");
      return `sha256=${expected}` === signature;
    }
    ```

    Story 7.4 owns the recording webhook endpoint. Story 7.3 only sets `enable_recording: "cloud"` in `createMeeting`.

    ***

    ## Required Environment Variables

    | Variable               | Used by   | Notes                            |
    | ---------------------- | --------- | -------------------------------- |
    | `DAILY_API_KEY`        | Story 7.3 | Daily.co REST API key            |
    | `DAILY_WEBHOOK_SECRET` | Story 7.4 | Webhook HMAC verification secret |

    ***

    ## Story 7.3 Acceptance Criteria (no unknowns)
    - `POST /api/v1/events/[eventId]/meeting` → calls `createMeeting`, stores `room.url` + `room.name` on the event row, returns room URL
    - `GET /api/v1/events/[eventId]/meeting-token` → calls `getMeetingToken(roomName, userId, isHost)`, returns token; 403 if user has no RSVP
    - Event detail page embeds `<iframe src={roomUrl}?t={token}>` when `now` is within event start/end time window
    - Non-RSVP'd members see a "RSVP required to join" message instead of the iframe
    - Event organizer sees an "End Meeting" button that calls `DELETE /api/v1/events/[eventId]/meeting` → `deleteRoom`

    ```

    ```

- [ ] **Task 10 — Update sprint status**
  - File: `_bmad-output/implementation-artifacts/sprint-status.yaml`
  - Action: After the line `epic-6-retrospective: done`, add:
    ```yaml
    epic-6-retro-action-items: done # AI-1 through AI-6 completed 2026-03-05
    ```

---

### Acceptance Criteria

- [ ] **AC 1 — AI-1 confirmed done**: Given the current codebase, when reading `TiptapEditor.tsx:43–46`, then `prose prose-sm max-w-none` is present in `editorProps.attributes.class`; when reading `ArticleLanguageToggle.tsx`, then both `dangerouslySetInnerHTML` content divs have `prose prose-neutral dark:prose-invert max-w-none`; when reading `globals.css:175–191`, then `.prose h2` has `font-size: 1.5em` and `.prose h3` has `font-size: 1.25em`.

- [ ] **AC 2 — Cover image required on submit (happy path blocked)**: Given an article draft with `coverImageUrl: null`, when `POST /api/v1/articles/[articleId]/submit`, then the response status is `422` and `body.detail` equals `"Articles.meta.coverImageRequired"`.

- [ ] **AC 3 — Cover image happy path unchanged**: Given an article draft with a non-null `coverImageUrl`, when `POST /api/v1/articles/[articleId]/submit`, then the response status is `200` and `body.data` is `{ articleId, status: "pending_review" }`.

- [ ] **AC 4 — Article not found → 404**: Given a non-existent `articleId` or an article belonging to a different author, when `POST /api/v1/articles/[articleId]/submit`, then the response status is `404`.

- [ ] **AC 5 — Cover image required indicator visible**: Given `<ArticleMetaForm>` is rendered, when the cover image section is visible, then the label displays an asterisk (`*`) in `text-destructive` color to indicate the field is required.

- [ ] **AC 6 — i18n keys present**: Given `messages/en.json` and `messages/ig.json`, then `Articles.meta.coverImageRequired` exists in both files with non-empty translated values.

- [ ] **AC 7 — `dangerouslySetInnerHTML` pattern documented in vi-patterns.ts**: Given `src/test/vi-patterns.ts`, then the file ends with a JSDoc block documenting the `dangerouslySetInnerHTML` safe-use rule with a `sanitize-html` correct example and an XSS wrong example.

- [ ] **AC 8 — `dangerouslySetInnerHTML` ADR exists**: Given `docs/decisions/dangerous-inner-html.md`, then the file exists and contains: Decision statement, server-side sanitize-html pattern, rationale, and pre-review checklist.

- [ ] **AC 9 — Rate limit preset JSDoc present**: Given `src/services/rate-limiter.ts`, then a JSDoc block immediately above `export const RATE_LIMIT_PRESETS` lists all preset keys grouped by category and contains the warning `BROWSE does NOT exist`.

- [ ] **AC 10 — Daily.co spike document exists**: Given `docs/decisions/daily-co-integration.md`, then the file exists and contains: `createMeeting` TypeScript response shape, `getMeetingToken` TypeScript response shape, sandbox setup steps, CI mock pattern with `vi.mock("@/services/daily-service", ...)`, recording webhook `DailyRecordingWebhook` interface, and Story 7.3 acceptance criteria.

- [ ] **AC 11 — Sprint status updated**: Given `_bmad-output/implementation-artifacts/sprint-status.yaml`, then `epic-6-retro-action-items: done` appears after `epic-6-retrospective: done`.

- [ ] **AC 12 — Tests pass**: Given the full test suite run after all changes, then all 2931 tests pass (2929 baseline + 2 new: route 422 + service 422).

---

## Additional Context

### Dependencies

- `sanitize-html` — already installed (used in Stories 6.2 and 6.3). No new packages.
- `getArticleForEditing` — already imported in `article-service.ts` at line 10. No new imports.
- No new DB migrations required (no schema changes).
- No new npm packages required for any of AI-1 through AI-6.

### Testing Strategy

- **AI-2**: Modify 2 existing test files:
  - `submit/route.test.ts`: add 1 test (`returns 422 when cover image is missing`)
  - `article-service.test.ts`: update `submitArticle` `beforeEach` (add `mockGetArticleForEditing` reset + default return), update the "throws 404" test (now mocks `getArticleForEditing → null`), add 1 new test (`throws 422 when coverImageUrl is null`)
  - Total: +2 tests added, 1 test body updated
- **AI-1, AI-4, AI-5, AI-6**: Documentation only — no tests.
- Run `pnpm test` after Task 5 to confirm 2931/2931 passing.

### Notes

- **AI-3** is intentionally excluded — owned by Bob (SM) + Alice (PO). Applied starting from the Story 6.4 spec (i18n keys listed in Task 1 alongside DB schema).
- **`submitArticle` refactor (Task 3)**: The new `getArticleForEditing` checks are additive — inserted before the existing `submitArticleForReview` call. The existing `const submitted =` assignment and `if (!submitted)` null-check are intentionally kept. `getArticleForEditing` does not filter by `status = 'draft'`, so a race condition exists where two concurrent requests for the same article could both pass the pre-check; the `submitArticleForReview` null-check handles this. Removing it would create a silent false-200.
- **Daily.co API shapes (Task 9)**: Based on Daily.co REST API v1 documentation. The Story 7.3 implementer should verify response field names against the live API before coding (Daily.co REST API is generally stable but verify `config` vs `properties` field naming).
- **Test count target**: 2929 (baseline) + 2 new tests = **2931 passing**.
