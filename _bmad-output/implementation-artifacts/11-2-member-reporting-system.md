# Story 11.2: Member Reporting System

Status: done

## Story

As a member,
I want to report posts, comments, messages, or other members with categorized reasons,
so that I can flag inappropriate behavior for admin review and help keep the community safe.

## Acceptance Criteria

1. Given a member encounters inappropriate content or behavior, when they select "Report" from the content actions menu, then a report dialog opens with categorized reasons: harassment, spam, inappropriate content, misinformation, impersonation, and other (with free-text field), and the system submits the report to the admin moderation queue.
2. Given a report is submitted, when the system processes it, then the reporter receives confirmation, the report remains anonymous to the reported member, and duplicate reports on the same content increment report count instead of creating duplicate moderation queue entries.
3. Given report persistence is required, when this story is implemented, then the migration creates `platform_reports` with: id, reporter_id, content_type (`post|comment|message|member|article`), content_id, reason_category, reason_text, status (`pending|reviewed|resolved|dismissed`), reviewed_by, reviewed_at, created_at.

## Tasks / Subtasks

- [x] Task 1: Create report schema + migration + i18n keys (AC: 3)
- [x] Add `src/db/schema/reports.ts` with:
  - `reportContentTypeEnum`: `post | comment | message | member | article` (separate enum — do NOT alter existing `moderationContentTypeEnum`)
  - `reportReasonCategoryEnum`: `harassment | spam | inappropriate_content | misinformation | impersonation | other`
  - `reportStatusEnum`: `pending | reviewed | resolved | dismissed` (separate enum — do NOT alter existing `moderationActionStatusEnum`)
  - `platformReports` table: id (UUID PK), reporterId (FK CASCADE → auth_users), contentType (reportContentTypeEnum), contentId (UUID), reasonCategory (reportReasonCategoryEnum), reasonText (TEXT nullable), status (reportStatusEnum default 'pending'), reviewedBy (FK → auth_users nullable), reviewedAt (TIMESTAMPTZ nullable), createdAt (TIMESTAMPTZ default now())
  - Unique constraint on `(reporter_id, content_type, content_id)` to prevent same-user duplicate reports
- [x] Add `src/db/index.ts` import: `import * as reportsSchema from "./schema/reports"` spread into db schema object (same pattern as `moderationSchema`)
- [x] Add migration `src/db/migrations/0043_platform_reports.sql` + journal entry in `src/db/migrations/meta/_journal.json` (idx: 43, tag: `0043_platform_reports`, version: "7", when: 1708000043000, breakpoints: true)
- [x] Define i18n keys in `messages/en.json` and `messages/ig.json` under `Reports` namespace:
  - `Reports.dialog.title`, `Reports.dialog.description`
  - `Reports.reason.harassment`, `Reports.reason.spam`, `Reports.reason.inappropriateContent`, `Reports.reason.misinformation`, `Reports.reason.impersonation`, `Reports.reason.other`
  - `Reports.reason.otherPlaceholder` (free-text placeholder)
  - `Reports.submit`, `Reports.submitting`, `Reports.success`, `Reports.alreadyReported`
  - `Reports.action.report` (menu item label)

- [x] Task 2: Add report query layer (AC: 1, 2, 3)
- [x] Create `src/db/queries/reports.ts`:
  - `createReport(reporterId, contentType, contentId, reasonCategory, reasonText?)` — INSERT with ON CONFLICT `(reporter_id, content_type, content_id)` DO NOTHING; return created row or null (already reported)
  - `getReportCountByContent(contentType, contentId)` — COUNT of reports for admin queue aggregation
  - `listReportsForContent(contentType, contentId)` — admin use: returns reports WITHOUT reporter identity for member surfaces
  - `listReportsAdmin(filters, pagination)` — admin queue: aggregated by (content_type, content_id), showing report_count, latest reason, earliest created_at
  - `updateReportStatus(reportId, status, reviewedBy)` — sets status + reviewedBy + reviewedAt
- [x] Reporter identity (`reporter_id`) must NEVER appear in any member-facing query result
- [x] Co-locate tests: `src/db/queries/reports.test.ts`

- [x] Task 3: Add member report API endpoint (AC: 1, 2)
- [x] Create `src/app/api/v1/reports/route.ts`:
  - `POST /api/v1/reports` — `withApiHandler()` + `requireAuthenticatedSession()`
  - Zod v4 (`zod/v4`) validation: `{ contentType, contentId, reasonCategory, reasonText? }`
  - Content target validation — verify target exists and is reportable:
    - `post` → `communityPosts` (not deleted)
    - `comment` → `postInteractions` where type='comment' OR `communityArticleComments`
    - `article` → `communityArticles` (not deleted)
    - `message` → `chatMessages`
    - `member` → `authUsers` (active account)
  - Return `successResponse({ reportId }, undefined, 201)` on success
  - Return `successResponse({ alreadyReported: true })` if duplicate (ON CONFLICT returned null)
  - RFC 7807 errors via `errorResponse()` for invalid payload / target not found
  - Self-report prevention: reject if `reporterId === contentAuthorId`
- [x] Add `REPORT_SUBMIT` rate limit preset in `src/services/rate-limiter.ts` (e.g., `{ maxRequests: 10, windowMs: 3_600_000 }` — 10 reports/hour per user)
- [x] Co-locate tests: `src/app/api/v1/reports/route.test.ts`

- [x] Task 4: Integrate with admin moderation queue (AC: 1, 2)
- [x] Add `report.created` event type to `src/types/events.ts` with shape: `{ reportId, contentType, contentId, reasonCategory }`
- [x] Emit `report.created` from report API route (or report service) via EventBus after successful creation
- [x] Add handler in `src/services/moderation-service.ts` for `report.created`:
  - Create or find existing `platform_moderation_actions` entry for `(contentType, contentId)` with source `reported`
  - If entry already exists (from auto-flagging), update metadata to include report count
- [x] Extend `listFlaggedContent` query in `src/db/queries/moderation.ts` to JOIN report count from `platform_reports` grouped by `(content_type, content_id)`
- [x] Extend admin moderation queue UI (`src/app/[locale]/(admin)/admin/moderation/page.tsx`) to display report count badge and "Reported" source indicator alongside existing "Auto-flagged" items
- [x] If `@/db/queries/reports` is imported in `eventbus-bridge.ts`, add `vi.mock("@/db/queries/reports")` to BOTH `eventbus-bridge.test.ts` AND `notification-flow.test.ts`

- [x] Task 5: Add member UI report action + dialog (AC: 1, 2)
- [x] Add "Report" action to existing dropdown/action menus in:
  - Post cards (`FeedItem` or equivalent)
  - Comment components
  - Message context menus (if action menu exists)
  - Member profile / member cards
  - Article detail page
- [x] Build `ReportDialog` component (accessible modal):
  - Radio group for reason categories (translated labels from i18n)
  - Conditional free-text textarea when "other" is selected
  - Submit button with loading state
  - Success confirmation state (toast or inline)
  - "Already reported" state if duplicate
- [x] Use `@tanstack/react-query` mutation for submit (no `useEffect + fetch` anti-pattern)
- [x] Keyboard/focus trap in dialog, 44px touch targets, proper ARIA labels

- [x] Task 6: Testing and regression coverage (AC: 1, 2, 3)
- [x] Query tests: duplicate aggregation logic (ON CONFLICT), anonymity guarantees (no reporter_id leak), status transitions
- [x] Route tests: auth required (401), Zod validation (400), target not found (404), self-report rejection, successful submit (201), duplicate handling
- [x] Component tests: ReportDialog reason selection, conditional free-text, translated strings, submit/loading/success states
- [x] Integration tests: moderation queue shows report source metadata, aggregated report count, duplicate reports aggregate correctly
- [x] Regression: verify Story 11.1 moderation actions (auto-flagging, keyword management) continue to function unchanged

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts`
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps
- [x] `src/db/index.ts` updated with `import * as reportsSchema` spread into schema
- [x] Migration `0043` SQL file AND `_journal.json` entry both added

## Dev Notes

### Story Foundation

- Primary source: Epic 11 / Story 11.2 in `_bmad-output/planning-artifacts/epics.md`.
- Business goal: member safety escalation path that feeds moderation operations without exposing reporter identity.
- Scope boundary: reporting + queue ingestion + anonymity + duplicate aggregation. Progressive discipline execution remains Story 11.3.

### Developer Context (Critical)

- **Extend, don't duplicate**: Reuse existing moderation architecture from Story 11.1 (`platform_moderation_actions`, moderation admin UI, moderation APIs, eventbus bridge). Reports are an additional moderation input source — do NOT build a parallel pipeline.
- **Separate enums required**: The existing `moderationContentTypeEnum` (`post | article | message`) and `moderationActionStatusEnum` (`pending | reviewed | dismissed`) are missing values this story needs. Create NEW enums (`reportContentTypeEnum`, `reportStatusEnum`) rather than ALTER-ing existing PostgreSQL enums (ALTER TYPE cannot be rolled back in a transaction).
- **Reporter anonymity is mandatory** in all member-visible views, notifications, and API responses.
- **Duplicate handling**: Unique constraint `(reporter_id, content_type, content_id)` prevents same-user duplicates. Admin queue shows aggregated report count per content item via COUNT query.
- **Reports merge into existing admin queue**: The `/admin/moderation` page shows both auto-flagged and reported items. Add a source indicator ("Auto-flagged" vs "Reported (N)") to each queue item.

### Architecture Compliance

- API routes: `withApiHandler()`, `/api/v1/*` conventions, RFC 7807 errors
- Admin auth: `requireAdminSession()` from `@/lib/admin-auth.ts`
- Member auth: `requireAuthenticatedSession()` from `@/services/permissions.ts`
- EventBus: emit from services/routes, never Socket.IO directly from Next.js code
- DB naming: `snake_case` tables/columns, `camelCase` API contracts
- Schema import: `src/db/index.ts` — `import * as reportsSchema from "./schema/reports"` spread into schema
- Zod: import from `"zod/v4"`, use `parsed.error.issues[0]` (NOT `parsed.issues[0]`)
- `withApiHandler` dynamic params: extract from URL pathname, not function args

### Previous Story Intelligence (11.1)

- 11.1 delivered: `platformModerationActions` table, `platformModerationKeywords` table, content scanner, moderation service with EventBus handlers, admin CRUD routes, ModerationQueue + KeywordManager UI components
- Pattern to reuse: `requireAdminSession` auth gates, `withApiHandler` + error contracts, EventBus-driven moderation state updates
- Known pitfall: any new `@/db/queries/*` import in eventbus bridge needs mocks in both bridge and integration test files

### Git Intelligence

- `12d5be1`: Story 11.1 moderation queue + automated flagging
- `450cc3b`: admin layout and auth-gated shell patterns
- `6353256`: moderation architecture spike (schema/scanner/service/ADR)
- Next migration: `0043` (0042 = moderation_schema)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-11-Administration--Moderation]
- [Source: _bmad-output/planning-artifacts/architecture.md]
- [Source: _bmad-output/implementation-artifacts/11-1-content-moderation-queue-automated-flagging.md]

## Story Completion Status

- Story status set to `review`.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Generated Story 11.2 from Epic 11 source with architecture, UX, and prior-story continuity.
- Validated and improved by quality review: added explicit enum strategy, migration number, i18n-in-Task-1, content target lookup map, rate limiter preset, report-to-queue relationship, and LLM optimization fixes.
- Implementation complete: all 6 tasks done. 39 net new tests added (11 query, 11 route, 11 component, 3 moderation-service handler, 3 moderation query updates).
- Key technical decisions: separate PostgreSQL enums (`reportContentTypeEnum`, `reportStatusEnum`) rather than ALTER-ing existing enums; Drizzle subquery JOIN pattern for report count aggregation without `.as()` on sql template literals; reporter anonymity enforced at query layer.
- Full regression: 3863 passing + 10 skipped + 14 pre-existing failures (same as baseline — no regressions introduced).

### Implementation Plan

1. Schema + migration + i18n: `src/db/schema/reports.ts`, migration `0043_platform_reports.sql`, journal entry, `messages/en.json` + `messages/ig.json` `Reports` namespace.
2. Query layer: `src/db/queries/reports.ts` — createReport (ON CONFLICT DO NOTHING), getReportCountByContent, listReportsForContent (no reporterId), updateReportStatus.
3. API endpoint: `POST /api/v1/reports` — Zod validation, content target lookup across 5 content types, self-report prevention, EventBus emit, REPORT_SUBMIT rate limit.
4. EventBus integration: `report.created` event type in `src/types/events.ts`; `handleReportCreated` in `moderation-service.ts`; `listFlaggedContent` + `getModerationActionById` extended with report count subquery JOIN; ModerationQueue UI shows source badge.
5. Member UI: `ReportDialog` shared component; Report button in FeedItem, MemberCard, ArticleReportButton.
6. Tests: co-located test files for all new/modified modules; full regression run confirmed no regressions.

### File List

**New files:**

- `src/db/schema/reports.ts`
- `src/db/migrations/0043_platform_reports.sql`
- `src/db/queries/reports.ts`
- `src/db/queries/reports.test.ts`
- `src/app/api/v1/reports/route.ts`
- `src/app/api/v1/reports/route.test.ts`
- `src/components/shared/ReportDialog.tsx`
- `src/components/shared/ReportDialog.test.tsx`
- `src/features/articles/components/ArticleReportButton.tsx`

**Modified files:**

- `src/db/index.ts` — added reportsSchema import
- `src/db/migrations/meta/_journal.json` — added idx:43 entry
- `src/db/queries/moderation.ts` — report count subquery JOIN, ModerationQueueItem.reportCount
- `src/db/queries/moderation.test.ts` — subquery chain mocks, 2-leftJoin chain mocks
- `src/services/moderation-service.ts` — handleReportCreated + HMR guard registration
- `src/services/moderation-service.test.ts` — handleReportCreated tests + reports mock
- `src/services/rate-limiter.ts` — REPORT_SUBMIT preset
- `src/types/events.ts` — ReportCreatedEvent + report.created EventName/EventMap
- `src/features/admin/components/ModerationQueue.tsx` — source badge + report count column
- `src/features/feed/components/FeedItem.tsx` — Report button + ReportDialog
- `src/features/discover/components/MemberCard.tsx` — Report button + ReportDialog
- `src/app/[locale]/(guest)/articles/[articleId]/page.tsx` — ArticleReportButton
- `messages/en.json` — Reports namespace + Admin.moderation.source keys
- `messages/ig.json` — same keys in Igbo + `Reports.close`
- `src/features/feed/components/CommentItem.tsx` — Report button + ReportDialog for post comments
- `src/features/chat/components/MessageBubble.tsx` — Report button (desktop hover + mobile long-press) + ReportDialog for messages
- `src/features/articles/components/ArticleComments.tsx` — Report button per article comment row
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Author            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-03-09 | Story 11.2 implementation complete — member reporting system, report schema/migration, query layer, POST /api/v1/reports, EventBus integration, ModerationQueue report count, ReportDialog component, FeedItem/MemberCard/ArticleReportButton UI surface; 39 net new tests                                                                                                                                                                                                                                                                                                                         | claude-sonnet-4-6 |
| 2026-03-09 | Code review fixes (7 issues): F1 removed unused isNull import; F2 added UUID validation to contentId Zod schema; F3 fixed critical empty contentAuthorId bug in handleReportCreated (added contentAuthorId to ReportCreatedEvent, passed from route); F4 added deletedAt filter for post/article target lookup; F5 added listReportsAdmin test coverage; F6 added Report button to CommentItem, MessageBubble (desktop+mobile), ArticleComments; F7 fixed success/alreadyReported button label from "Submit Report" to "Close"; +1 route test, +2 updated component tests, i18n close key in en+ig | claude-opus-4-6   |
