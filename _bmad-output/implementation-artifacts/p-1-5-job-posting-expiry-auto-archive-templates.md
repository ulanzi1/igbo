# Story P-1.5: Job Posting Expiry, Auto-Archive & Templates

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an employer,
I want postings to auto-expire with notifications, and I want templates for common role types to speed up posting creation,
So that stale listings are automatically cleaned up and I can create postings faster.

## Acceptance Criteria

1. **AC1 — Auto-Expire on Deadline:** Given a job posting has an `expires_at` date set, when the current date passes `expires_at`, then a background job (internal API route triggered by cron) changes the posting status to `expired`, the posting is removed from active listings, and a `portal.job.expired` event is emitted for downstream notification (Epic 6 wires actual email delivery).

2. **AC2 — 3-Day Expiry Warning:** Given a job posting has an `expires_at` date 3 days from now, when the daily expiry-check job runs, then a `portal.job.expiry_warning` event is emitted with posting details and days remaining. (Actual email delivery deferred to Epic 6 notification pipeline — event emission is the contract.)

3. **AC3 — Auto-Archive After Grace Period:** Given an expired posting has been in `expired` status for more than 30 days (configurable), when the daily archive job runs, then the posting is soft-archived (`archived_at` timestamp set) and excluded from employer dashboard queries by default. Archived postings are still retrievable via an "Archived" filter tab.

4. **AC4 — Renew Expired Posting (FR10):** Given a job posting in `expired` status, when the employer clicks "Extend", then a modal prompts for a new expiry date. If content is unchanged, the posting returns directly to `active` (no re-review required, subject to active posting limit). If the employer also edits content, the posting goes to `pending_review`. The old `expires_at` is replaced with the new date.

5. **AC5 — Close Expired Posting:** Given a job posting in `expired` status, when the employer clicks "Close", then the existing close-posting modal (from P-1.4) is shown and the posting moves to `filled` with an outcome recorded.

6. **AC6 — Templates Pre-Fill:** Given an employer starts creating a new job posting, when they click "Use Template", then a dropdown/modal shows common role templates (Software Engineer, Marketing Manager, Sales Representative, Customer Support, Administrative Assistant). Selecting a template pre-fills title, description skeleton, and requirements. All pre-filled content is editable.

7. **AC7 — Expired Tab Enabled:** Given the employer views their job postings dashboard, when filtering by status, then the `expired` tab is now functional (previously disabled/greyed). Expired postings show the `expires_at` date and days since expiry. An `archived` tab shows soft-archived postings.

8. **AC8 — Expiry Date on Posting Cards:** Given a job posting has an `expires_at` date, when displayed on the My Jobs dashboard or preview page, then the expiry date is shown. Active postings approaching expiry (within 7 days) show an amber "Expiring soon" badge.

9. **AC9 — Set Expiry Date on Create/Edit:** Given an employer is creating or editing a job posting, when they fill in the form, then an optional "Expiry Date" field is available (date picker, must be in the future). If set, this populates `expires_at` on the posting.

## Not In Scope (Deferred)

| Item | Deferred To | Notes |
|------|-------------|-------|
| Seeker-facing deadline countdown ("3 days left to apply") | Epic 4 (Story 4.3) | Requires job detail page for seekers |
| Apply button disabled after deadline | Epic 2 (Story 2.5a) | Requires application system |
| Email delivery for expiry/warning notifications | Epic 6 | Events emitted here; handlers wired in Epic 6 |
| Admin-managed template CRUD | Future phase | Hardcoded templates for MVP (DEFERRED-9 in PRD) |
| User-created templates from existing postings | Future phase | "Duplicate posting" feature |
| FR13: 30-day post-closure visibility in search | Epic 4 | Requires search/browse pages. **NOTE:** FR13 says "expired/closed" — P-1.5 only archives `expired` postings after 30 days. `filled` (closed) posting archival is deferred to Epic 4 when search/browse pages exist |

## PRD Reconciliation Note

**DEFERRED-9 conflict:** The PRD explicitly defers "Job posting templates for common role types" (DEFERRED-9). However, the epics file (created after PRD reconciliation on 2026-04-01) includes templates in P-1.5 acceptance criteria. Resolution: Include templates as **hardcoded role templates** (TypeScript constants, no DB table, no admin CRUD). This satisfies the epic requirement with minimal scope. Full template management remains deferred per PRD.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Auto-expire job run** — Create a posting with `expires_at` in the past (via DB). Trigger the internal expire route (`POST /api/v1/internal/jobs/expire-postings`). Verify status changes to `expired` and event is emitted.
   - Expected outcome: Posting status is `expired`; event bus receives `portal.job.expired` event.
   - Evidence required: API response log + DB record showing `expired` status.

2. **3-day warning event emission** — Create a posting with `expires_at` = now + 2 days. Trigger the expire route. Verify `portal.job.expiry_warning` event emitted (not expired yet — only warning).
   - Expected outcome: Posting stays `active`; warning event emitted with correct daysRemaining.
   - Evidence required: Test assertion on event bus emit call.

3. **Auto-archive after 30 days** — Create a posting in `expired` status with `expires_at` = 31 days ago. Trigger archive route (`POST /api/v1/internal/jobs/archive-expired`). Verify `archived_at` is set and posting excluded from default dashboard.
   - Expected outcome: `archived_at` populated; default My Jobs query excludes it; "Archived" tab shows it.
   - Evidence required: DB record + dashboard screenshot.

4. **Renew expired posting (content unchanged)** — From an `expired` posting, click "Extend", set new expiry date, do NOT edit any content. Verify posting goes directly to `active` (no `pending_review`).
   - Expected outcome: Status transitions `expired → active`; `expires_at` updated; no admin review required.
   - Evidence required: API response + DB record.

5. **Renew expired posting (content changed — "Edit & Renew" path)** — From an `expired` posting, click "Edit & Renew" (navigates to edit page). Change the title AND set a new expiry date in the form. Submit. Verify posting goes to `pending_review`. **NOTE: This path uses `PATCH /api/v1/jobs/[jobId]` (edit route), NOT the status route. "Extend" is a separate UI path (`contentChanged: false`) that transitions directly to `active`.**
   - Expected outcome: Status transitions `expired → pending_review`; updated fields persisted; `expires_at` updated.
   - Evidence required: API response + DB record.

6. **Template pre-fill** — Navigate to create posting page, click "Use Template", select "Software Engineer". Verify form pre-fills with title, description, requirements.
   - Expected outcome: Form fields populated with template content; all fields editable.
   - Evidence required: Screenshot of pre-filled form.

7. **Expired tab on dashboard** — With postings in `expired` status, navigate to My Jobs and click "Expired" tab. Verify expired postings appear with expiry date and "Extend"/"Close" action buttons.
   - Expected outcome: Tab is functional; expired postings listed; action buttons present.
   - Evidence required: Screenshot of filtered expired view.

8. **Expiry date on create form** — Create a new posting with an expiry date set. Verify `expires_at` is saved correctly.
   - Expected outcome: `expires_at` column populated in DB; displayed on posting card.
   - Evidence required: DB record + card screenshot.

9. **Active posting limit on renew** — Set 5 postings to `active` (via DB). Attempt to renew a 6th expired posting. Verify 409 rejection.
   - Expected outcome: API returns 409 `POSTING_LIMIT_EXCEEDED`.
   - Evidence required: API response log.

## Flow Owner (SN-4)

**Owner:** Dev (solo developer — validates complete flow manually after implementation)

## Tasks / Subtasks

- [x] **Task 1: Database Migration — Add archive + expiry support** (AC: 3, 9)
  - [x] 1.1 Create migration `0053_job_posting_expiry_archive.sql`:
    - Add `archived_at TIMESTAMPTZ` (nullable) to `portal_job_postings` — set when posting is soft-archived after grace period
    - Add index on `(status, expires_at)` WHERE `status = 'active'` for efficient expiry queries
    - Add index on `(status, archived_at)` WHERE `status = 'expired'` for efficient archive queries
  - [x] 1.2 Add journal entry (idx: 53) to `packages/db/src/migrations/meta/_journal.json`
  - [x] 1.3 Update Drizzle schema in `packages/db/src/schema/portal-job-postings.ts` — add `archivedAt` column
  - [x] 1.4 Update schema tests for new column
  - [x] 1.5 Export updated types

- [x] **Task 2: Database Queries — Expiry & archive operations** (AC: 1, 2, 3, 7)
  - [x] 2.1 Add `getExpiredPostings()` — `SELECT * FROM portal_job_postings WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()`. Returns postings that need to transition to `expired`
  - [x] 2.2 Add `getExpiringPostings(withinDays: number)` — `SELECT * FROM portal_job_postings WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at > NOW() AND expires_at <= NOW() + INTERVAL '${withinDays} days'`. For 3-day warning
  - [x] 2.3 Add `getArchivablePostings(gracePeriodDays: number)` — `SELECT * FROM portal_job_postings WHERE status = 'expired' AND archived_at IS NULL AND expires_at IS NOT NULL AND expires_at <= NOW() - INTERVAL '${gracePeriodDays} days'`. For auto-archive
  - [x] 2.4 Add `archivePosting(id: string)` — `UPDATE portal_job_postings SET archived_at = NOW() WHERE id = $1 AND status = 'expired' AND archived_at IS NULL`. Returns updated row count
  - [x] 2.5 Add `batchExpirePostings(ids: string[])` — `UPDATE portal_job_postings SET status = 'expired' WHERE id = ANY($1) AND status = 'active'`. Returns updated count
  - [x] 2.6 Modify `getJobPostingsByCompanyIdWithFilter(companyId, statusFilter?)`:
    - **Type change required**: `statusFilter?: PortalJobStatus | "archived"` — `"archived"` is NOT in the DB enum; it maps to `WHERE archived_at IS NOT NULL` (Drizzle `isNotNull()`) rather than `WHERE status = 'archived'`
    - When `statusFilter === "archived"`: `WHERE archived_at IS NOT NULL`
    - When `statusFilter` is a real `PortalJobStatus`: `WHERE status = $1 AND archived_at IS NULL`
    - When `statusFilter` is `undefined`: `WHERE archived_at IS NULL` (default — archived hidden unless explicitly requested)
  - [x] 2.7 Write query tests (~12 tests: getExpiredPostings finds correct rows, excludes non-active, excludes null expires_at; getExpiringPostings within window, outside window; getArchivablePostings within grace, outside grace; archivePosting sets timestamp, idempotent; batchExpirePostings; filter excludes archived, archived filter returns archived only)

- [x] **Task 3: Update Status Transition Service — Expired is no longer fully terminal** (AC: 4, 5)
  - [x] 3.1 Update `VALID_TRANSITIONS` in `apps/portal/src/services/job-posting-service.ts`:
    ```typescript
    expired: ["active", "pending_review", "filled"],
    // active: renew without changes (FR10) — checks active posting limit
    // pending_review: renew with edits
    // filled: close expired posting with outcome
    ```
  - [x] 3.2 Implement `renewPosting(postingId: string, companyId: string, newExpiresAt: string, contentChanged: boolean, actorRole: string)`:
    - Validate ownership: `posting.companyId !== companyId` → throw 403 (same pattern as `closePosting()`)
    - Validate `newExpiresAt` is in the future
    - If `contentChanged === false` → check active posting limit, then transition to `active`
    - If `contentChanged === true` → transition to `pending_review`
    - Update `expires_at` with new date in both cases
    - Clear `archived_at` if set (un-archive on renew)
  - [x] 3.3 Update `canEditPosting(status)` — remove `expired` from the exclusion list (employer can edit expired postings for renewal via the "Edit & Renew" path)
  - [x] 3.4 Update `closePosting()` — change the status guard from `["active", "paused"]` to `["active", "paused", "expired"]`. **Required for AC5**: the status route calls `closePosting()` for ALL `targetStatus === "filled"` requests including from expired postings. Without this fix, closing an expired posting returns 409. `VALID_TRANSITIONS` alone is not sufficient — `closePosting()` has its own independent guard.
  - [x] 3.5 Write service tests (~10 tests: renew unchanged → active, renew changed → pending_review, renew checks active limit, renew with past date rejected, renew clears archived_at, close expired → filled with outcome, expired → active blocked when limit reached, expired → filled works)

- [x] **Task 4: Internal API Routes — Background job endpoints** (AC: 1, 2, 3)
  - [x] 4.1 Create `apps/portal/src/app/api/v1/internal/jobs/expire-postings/route.ts`:
    - POST handler (no auth — internal only, protected by `INTERNAL_JOB_SECRET` header validation)
    - Call `getExpiredPostings()` → `batchExpirePostings(ids)` → emit `portal.job.expired` event for each expired posting. Use `Promise.allSettled()` for event emissions — one failed emit must NOT prevent other postings from being processed
    - Call `getExpiringPostings(3)` → emit `portal.job.expiry_warning` event for each (also via `Promise.allSettled()`)
    - Return `{ expired: number, warnings: number }`
    - **Security:** Validate `Authorization: Bearer ${INTERNAL_JOB_SECRET}` header. Add `INTERNAL_JOB_SECRET` to portal env schema. Use `{ skipCsrf: true }` in `withApiHandler` (machine-to-machine endpoint)
  - [x] 4.2 Create `apps/portal/src/app/api/v1/internal/jobs/archive-expired/route.ts`:
    - POST handler (same internal auth pattern)
    - Call `getArchivablePostings(30)` → `archivePosting(id)` for each
    - Return `{ archived: number }`
  - [x] 4.3 Create internal auth helper `apps/portal/src/lib/internal-auth.ts`:
    - `requireInternalAuth(req: Request)` — validates `Authorization: Bearer ${process.env.INTERNAL_JOB_SECRET}`. Throws 401 ApiError if missing/wrong. Reusable for future internal routes
  - [x] 4.4 Add `INTERNAL_JOB_SECRET=dev-secret` to `.env.local` for local testing. Portal has no `@/env` module — uses `process.env.INTERNAL_JOB_SECRET` directly (same pattern as `api-middleware.ts`). **Required in all environments per fail-closed security rule (Epic 7 retro)** — the route throws 401 if not configured. Call local routes with `Authorization: Bearer dev-secret` header.
  - [x] 4.5 Write route tests (~12 tests: expire-postings finds and expires, emits events per posting, emits warning events, returns counts, rejects without auth, handles empty results; archive-expired finds and archives, returns count, rejects without auth, handles empty)

- [x] **Task 5: Portal Event Types — Add expiry events** (AC: 1, 2)
  - [x] 5.1 Add to `packages/config/src/events.ts`:
    ```typescript
    // In PortalEventMap:
    "job.expired": JobExpiredEvent;
    "job.expiry_warning": JobExpiryWarningEvent;
    ```
  - [x] 5.2 Define event interfaces extending `BaseEvent` (all portal events extend `BaseEvent` — provides `eventId`, `version`, `timestamp` required by `portalEventBus.emit()` type signature):
    ```typescript
    export interface JobExpiredEvent extends BaseEvent {
      jobId: string;
      companyId: string;
      title: string;
      employerUserId: string;
      // NOTE: no separate expiredAt — use BaseEvent.timestamp (consistent with JobClosedEvent pattern)
    }
    export interface JobExpiryWarningEvent extends BaseEvent {
      jobId: string;
      companyId: string;
      title: string;
      employerUserId: string;
      expiresAt: string; // the posting's scheduled expiry date (future timestamp)
      daysRemaining: number;
    }
    ```
  - [x] 5.3 Write type tests to verify event interfaces are correctly typed in the map
  - [x] 5.4 Verify `PORTAL_CROSS_APP_EVENTS` array in `packages/config/src/events.ts` does NOT include `"job.expired"` or `"job.expiry_warning"` — these are employer-facing portal-internal events, not community cross-app events. Epic 6 wires delivery via notification handlers. (No code change needed — confirm the array is unchanged)

- [x] **Task 6: API Routes — Renew/extend expired posting** (AC: 4, 5)
  - [x] 6.1 Update status route `apps/portal/src/app/api/v1/jobs/[jobId]/status/route.ts`:
    - Add branch for `targetStatus === "active"` from `expired` status → call `renewPosting()`. Require `newExpiresAt` in request body (new field in `statusTransitionSchema`)
    - `targetStatus === "filled"` from `expired` still uses `closePosting()` (works after Task 3.4 updates the `closePosting()` guard to accept `"expired"`)
  - [x] 6.2 Update `statusTransitionSchema` in `apps/portal/src/lib/validations/job-posting.ts`:
    ```typescript
    statusTransitionSchema = z.object({
      targetStatus: z.enum(portalJobStatusEnum.enumValues),
      closedOutcome: z.enum(portalClosedOutcomeEnum.enumValues).optional(),
      expectedUpdatedAt: z.string().datetime().optional(),
      newExpiresAt: z.string().datetime().optional(),  // NEW: for renew
      contentChanged: z.boolean().optional(),            // NEW: for renew
    });
    ```
  - [x] 6.3 Update edit route `apps/portal/src/app/api/v1/jobs/[jobId]/route.ts`:
    - Add `expiresAt` to `editJobPostingSchema` (optional datetime — but validated as required for expired postings at route level)
    - Add `expired` branch in PATCH handler alongside the existing `active` branch:
      ```typescript
      if (posting.status === "expired") {
        // "Edit & Renew" path — expiresAt is required
        if (!parsed.data.expiresAt) {
          throw new ApiError({ title: "expiresAt is required when renewing an expired posting", status: 400 });
        }
        await updateJobPosting(jobId, updateData); // persist content edits first
        await renewPosting(jobId, company.id, parsed.data.expiresAt, true, "EMPLOYER");
        // renewPosting transitions to pending_review and sets expires_at
      }
      ```
    - **CRITICAL**: Without this branch, `expired` falls through to the `else` branch (simple `updateJobPosting()`) which performs no status transition — posting stays `expired` after editing. The `active` branch uses `editActivePosting()` for atomic lock; `expired` uses `renewPosting()` (no optimistic lock needed — only one transition direction).
    - Convert `expiresAt` string to `Date` in `updateData` (same pattern as `applicationDeadline`): `expiresAt: expiresAt ? new Date(expiresAt) : null`
  - [x] 6.4 Write route tests (~10 tests: renew without changes → active, renew with changes → pending_review, renew missing newExpiresAt → 400, renew past date → 400, close expired → filled, active limit on renew → 409, PATCH edit expired with expiresAt → pending_review, PATCH edit expired missing expiresAt → 400, PATCH draft/paused with expiresAt saved correctly, close expired without closedOutcome → 400)

- [x] **Task 7: Hardcoded Job Templates** (AC: 6)
  - [x] 7.1 Create `apps/portal/src/lib/job-templates.ts` — export `JOB_TEMPLATES` array:
    ```typescript
    export interface JobTemplate {
      id: string;           // e.g., "software-engineer"
      titleKey: string;     // i18n key for template name in selector
      title: string;        // default English title for form pre-fill
      descriptionHtml: string;  // skeleton HTML
      requirements: string;     // skeleton HTML
      employmentType: string;   // default employment type
    }
    export const JOB_TEMPLATES: JobTemplate[] = [
      { id: "software-engineer", titleKey: "Portal.templates.softwareEngineer", title: "Software Engineer", descriptionHtml: "...", requirements: "...", employmentType: "full_time" },
      { id: "marketing-manager", ... },
      { id: "sales-representative", ... },
      { id: "customer-support", ... },
      { id: "administrative-assistant", ... },
    ];
    ```
  - [x] 7.2 Template descriptions should include Igbo-relevant placeholders (e.g., "About Our Company — [Describe your company and its connection to the Igbo community]"). Each template should also include a `descriptionIgboHtml` skeleton (even if minimal) since the form supports bilingual descriptions (P-1.3B)
  - [x] 7.3 Create `apps/portal/src/app/api/v1/job-templates/route.ts` — GET returns `JOB_TEMPLATES` array (public, no auth required). Wrapped with `withApiHandler({ skipCsrf: true })`
  - [x] 7.4 Write tests (~4 tests: GET returns all templates, each template has required fields, template IDs are unique, response format)

- [x] **Task 8: Template Selection UI** (AC: 6)
  - [x] 8.1 Create `apps/portal/src/components/domain/template-selector.tsx`:
    - Dropdown/dialog showing available templates with name and brief description
    - Props: `{ onSelect: (template: JobTemplate) => void; disabled?: boolean }`
    - Uses `useTranslations("Portal.templates")` for template names
    - Export `TemplateSelectorSkeleton`
  - [x] 8.2 Integrate into `JobPostingForm` — show "Use Template" button only in `mode="create"` (not edit). When selected, pre-fill form fields from template data. Set `isDirty = true` after pre-fill
  - [x] 8.3 Write tests (~6 tests: renders template options, selecting template calls onSelect, disabled state, pre-fill updates form fields, template button hidden in edit mode, accessibility)

- [x] **Task 9: Extend/Renew Modal** (AC: 4)
  - [x] 9.1 Create `apps/portal/src/components/flow/extend-posting-modal.tsx`:
    - Uses shadcn Dialog (already installed in P-1.4)
    - Date picker for new expiry date (must be future date)
    - Client-side validation: date must be in the future
    - Calls `PATCH /api/v1/jobs/[jobId]/status` with `{ targetStatus: "active", newExpiresAt, contentChanged: false }`
    - Shows success toast, calls `onStatusChange()` callback
    - Export `ExtendPostingModalSkeleton`
  - [x] 9.2 Write tests (~6 tests: renders date input, validates future date, API call with correct body, success closes modal + toast, error toast, accessibility)

- [x] **Task 10: Update PostingStatusActions for expired state** (AC: 4, 5, 7, 8)
  - [x] 10.1 Update `apps/portal/src/components/domain/posting-status-actions.tsx`:
    - **REPLACE existing expired block (lines 81-96)** — current code treats `expired` same as `filled` (disabled "View Applications" button): `if (status === "filled" || status === "expired") { ... }`. This entire conditional must be split: keep `filled` as-is, create NEW `expired` branch with the actions below
    - Add `expiresAt?: Date | null` to `PostingStatusActionsProps` interface (required to compute the "expiring soon" badge — 7-day window check)
    - Expired actions: "Extend" (opens ExtendPostingModal), "Edit & Renew" (Link to edit page), "Close" (opens ClosePostingModal)
    - Show "Expiring soon" amber badge on active postings where `expiresAt` is within 7 days
  - [x] 10.2 Update `JobPostingCard` to show expiry date when present:
    - Add `expiresAt?: Date | null` and `archivedAt?: Date | null` to the **local** `Posting` interface in `job-posting-card.tsx` (this is a lean local type — do NOT import from `@igbo/db` schema which would add a `server-only` dependency to a client component)
    - Active: "Expires {date}" or "Expiring soon" badge if within 7 days
    - Expired: "Expired on {date}"
    - Archived: "Archived on {date}"
  - [x] 10.3 Write tests (~8 tests: expired status shows Extend/Edit/Close buttons, expiring-soon badge for < 7 days, no badge for > 7 days, expiry date displayed on card, archived date displayed, click Extend opens modal, click Close opens modal, accessibility)

- [x] **Task 11: Enable Expired & Archived Tabs on My Jobs** (AC: 7)
  - [x] 11.1 Update `apps/portal/src/app/[locale]/my-jobs/page.tsx`:
    - Add `"expired"` to `FILTER_TABS` array at line 17
    - **DELETE the hardcoded disabled `<span>` at lines 104-111** (`data-testid="filter-tab-expired-disabled"`) — this is a separate element from the `FILTER_TABS` map. If only the array is updated without removing the span, TWO expired tabs render (one functional, one disabled)
    - Add `"archived"` as a new tab (uses special filter in query)
    - Pass `expiresAt={posting.expiresAt}` and `archivedAt={posting.archivedAt}` to `JobPostingCard`
    - Pass `expiresAt={posting.expiresAt}` to `PostingStatusActions` (needed for "expiring soon" badge — see Task 10.1)
    - Pass `PostingStatusActions` as actions slot (already done for other statuses — extend for expired)
  - [x] 11.2 Update server-side in `my-jobs/page.tsx`:
    - Add `type MyJobsFilter = PortalJobStatus | "archived"` local type
    - **CRITICAL**: `"archived"` is NOT in `portalJobStatusEnum.enumValues` — the current validation silently treats it as `undefined` (falls through to "all" tab). Check `rawStatus === "archived"` BEFORE the enum check:
      ```typescript
      const validFilter: MyJobsFilter | undefined =
        rawStatus === "archived" ? "archived"
        : portalJobStatusEnum.enumValues.includes(rawStatus as PortalJobStatus)
          ? (rawStatus as PortalJobStatus)
          : undefined;
      ```
    - Pass `validFilter` to `getJobPostingsByCompanyIdWithFilter(profile.id, validFilter)`
    - Fetch archived tab count via a separate `getJobPostingsByCompanyIdWithFilter(profile.id, "archived")` call (length) for the tab badge
  - [x] 11.3 **Update existing test first:** `my-jobs/page.test.tsx` line ~178 asserts `filter-tab-expired-disabled` exists — this test MUST be removed/updated since the disabled span is deleted. Add `expiresAt` and `archivedAt` to mock posting data
  - [x] 11.4 Write tests (~6 tests: expired tab shows expired postings, archived tab shows archived postings, expired tab count badge, archived tab count badge, empty state for no expired/archived, action buttons on expired cards)
  - [x] 11.5 **Design note**: `allPostings` (no filter) excludes `archived_at IS NOT NULL` rows per Task 2.6 default behavior. Expired tab count badge counts only non-archived expired postings — this is intentional. Archived tab count must come from a separate `"archived"` filter query.

- [x] **Task 12: Expiry Date in Create/Edit Form** (AC: 9)
  - [x] 12.1 Update `JobPostingForm` — add optional "Expiry Date" field (date input, similar to `applicationDeadline`):
    - Validate: must be in the future if provided
    - In edit mode, pre-fill from `initialData.expiresAt`
    - Add `expiresAt` to the form submission payload
  - [x] 12.2 Update `jobPostingSchema` in `apps/portal/src/lib/validations/job-posting.ts` — add `expiresAt: z.string().datetime().optional().nullable()`
  - [x] 12.3 Update POST `/api/v1/jobs` route to persist `expiresAt` if provided — destructure `expiresAt` from `parsed.data` and convert: `expiresAt: expiresAt ? new Date(expiresAt) : null`. It does NOT auto-pass via `...rest` — explicit `Date` conversion is required (same pattern as `applicationDeadline` on the existing route)
  - [x] 12.4 Update PATCH `/api/v1/jobs/[jobId]` route to handle `expiresAt` update — destructure `expiresAt` from `parsed.data` and add to `updateData`: `expiresAt: expiresAt ? new Date(expiresAt) : null`. This applies to draft/paused/rejected branches. The `expired` branch is handled separately in Task 6.3 (calls `renewPosting()` after updating content)
  - [x] 12.5 Write tests (~4 tests: create with expiresAt saves correctly, edit updates expiresAt, form validates future date, form clears expiresAt)

- [x] **Task 13: i18n Keys** (AC: all)
  - [x] 13.1 Add `Portal.expiry` namespace to `en.json` and `ig.json`:
    ```
    Portal.expiry.expiresAt                — "Expiry Date"
    Portal.expiry.expiresOn                — "Expires on {date}"
    Portal.expiry.expiredOn                — "Expired on {date}"
    Portal.expiry.archivedOn               — "Archived on {date}"
    Portal.expiry.expiringSoon             — "Expiring soon"
    Portal.expiry.expiringSoonDays         — "Expires in {days} days"
    Portal.expiry.setExpiryDate            — "Set Expiry Date"
    Portal.expiry.expiryDateHelp           — "The posting will be automatically removed from active listings on this date"
    Portal.expiry.extend                   — "Extend"
    Portal.expiry.extendPosting            — "Extend Job Posting"
    Portal.expiry.extendDescription        — "Set a new expiry date to re-activate this posting"
    Portal.expiry.newExpiryDate            — "New Expiry Date"
    Portal.expiry.extendSuccess            — "Posting extended and re-activated"
    Portal.expiry.mustBeFutureDate         — "Expiry date must be in the future"
    Portal.expiry.editAndRenew             — "Edit & Renew"
    Portal.expiry.renewRequiresReview      — "Editing content during renewal requires admin re-approval"
    ```
  - [x] 13.2 Add `Portal.templates` namespace:
    ```
    Portal.templates.useTemplate           — "Use Template"
    Portal.templates.selectTemplate        — "Select a Template"
    Portal.templates.selectDescription     — "Choose a role template to pre-fill the form"
    Portal.templates.softwareEngineer      — "Software Engineer"
    Portal.templates.marketingManager      — "Marketing Manager"
    Portal.templates.salesRepresentative   — "Sales Representative"
    Portal.templates.customerSupport       — "Customer Support"
    Portal.templates.administrativeAssistant — "Administrative Assistant"
    ```
  - [x] 13.3 Add `Portal.lifecycle.archived` and `Portal.lifecycle.filterArchived` keys
  - [x] 13.4 Provide Igbo translations for all new keys
  - [x] 13.5 Verify no hardcoded strings in any new components

- [x] **Task 14: Comprehensive Testing & Validation** (AC: all)
  - [x] 14.1 Run full portal test suite — 0 regressions
  - [x] 14.2 Run `@igbo/db` test suite — 0 regressions
  - [x] 14.3 Run `@igbo/config` test suite — 0 regressions
  - [x] 14.4 TypeScript typecheck — 0 errors across all packages
  - [x] 14.5 Run ESLint — 0 new errors
  - [x] 14.6 Walk through all 9 validation scenarios
  - [x] 14.7 Verify `portal-errors.test.ts` hardcoded count still passes (7 error codes — no new codes needed, existing `POSTING_LIMIT_EXCEEDED` and `INVALID_STATUS_TRANSITION` are reused)

## Dev Notes

### Background Job Architecture (CRITICAL)

The portal uses **internal API routes triggered by external cron** (GitHub Actions / Docker cron), NOT the community's `registerJob` pattern. This is per the architecture document:

```
| `apps/portal/src/app/api/v1/internal/` | Portal app | Cron scheduler (GitHub Actions) | REST, internal only |
```

**Internal route security:** Each internal route validates `Authorization: Bearer ${INTERNAL_JOB_SECRET}`. Fail-closed: if the env var is missing, the route throws 401 (misconfiguration, not "allow by default"). For local testing, set `INTERNAL_JOB_SECRET=dev-secret` in `.env.local` and call with `Authorization: Bearer dev-secret`.

**Cron schedule (documentation only — GitHub Actions workflow is outside story scope):**
- `expire-postings`: Every hour (checks `expires_at <= NOW()` + 3-day warnings)
- `archive-expired`: Daily at 3am UTC (checks 30-day grace period)

### Status Transition Updates

```
                    ┌──────────────┐
                    │    draft     │
                    └──────┬───────┘
                           │ submit for review
                    ┌──────▼───────┐
               ┌────│pending_review│◄────────────────────┐
               │    └──────┬───────┘                      │
               │           │ ADMIN ONLY: approve          │
               │    ┌──────▼───────┐                      │
               │    │    active    │──── edit ─────────────┘
               │    └──┬───┬───┬──┘
               │       │   │   │ pause
               │       │   │  ┌▼──────┐
               │       │   │  │paused │──── unpause → active
               │       │   │  └┬──────┘    (checks active limit)
               │       │   │   │ close
               │    close  │   │
               │       │   │   ▼
               │       ▼   │ ┌──────┐
               │  ┌──────┐ │ │filled│ (terminal)
    ADMIN ONLY │  │filled│ │ └──────┘
    reject     │  └──────┘ │
               ▼           │
         ┌──────────┐      │
         │ rejected  │──────┘ (edit & resubmit → pending_review)
         └──────────┘

    ** P-1.5 CHANGES: **
                    ┌──────────┐
                    │ expired  │  ← auto-expire job sets this
                    └──┬──┬──┬┘
                       │  │  │
         extend (no    │  │  │ close
         edit, FR10)   │  │  └──→ filled (with outcome)
                       │  │
         ┌─────────────┘  │
         ▼                │ edit & renew
      active              └──→ pending_review
      (checks limit)

    ** NEW: archived_at (soft flag, not a status) **
    expired ──(30 days)──→ archived_at = NOW()
```

**Updated VALID_TRANSITIONS:**
```typescript
const VALID_TRANSITIONS: Record<PortalJobStatus, PortalJobStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["active", "rejected"],       // ADMIN-ONLY
  active: ["paused", "pending_review", "filled"],
  paused: ["active", "filled"],
  filled: [],                                    // terminal
  expired: ["active", "pending_review", "filled"], // P-1.5: renew, edit+renew, close
  rejected: ["pending_review"],
};
```

### Template Design (Hardcoded, No DB)

Templates are stored as a TypeScript constant array in `apps/portal/src/lib/job-templates.ts`. No database table, no admin CRUD. Each template contains:
- `id`: slug identifier
- `titleKey`: i18n key for the template name in the selector dropdown
- `title`: English title for form pre-fill
- `descriptionHtml`: Skeleton HTML with Igbo-relevant placeholders
- `requirements`: Skeleton HTML
- `employmentType`: Default (e.g., `full_time`)

The templates GET route is public (no auth) with `{ skipCsrf: true }`. The form component fetches templates on mount and shows a "Use Template" dropdown/button in create mode only.

### Archive Model (Soft Archive, Not a Status)

`archived_at` is a **timestamp column**, not a new status in the enum. This is because:
1. Archived postings are conceptually still `expired` — they just passed the grace period
2. Adding `archived` to the status enum would require updating all status-dependent code
3. A timestamp allows flexible grace period queries
4. The "Archived" tab in My Jobs uses `WHERE archived_at IS NOT NULL`, not `WHERE status = 'archived'`

### Internal Auth Pattern

```typescript
// apps/portal/src/lib/internal-auth.ts
// Fail-closed per Epic 7 retro: missing secret = misconfiguration, not "allow in dev"
// Local testing: set INTERNAL_JOB_SECRET=dev-secret in .env.local, call with
//   Authorization: Bearer dev-secret
export function requireInternalAuth(req: Request): void {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) {
    throw new ApiError({ title: "INTERNAL_JOB_SECRET is not configured", status: 401 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
}
```

Routes using this pattern must use `withApiHandler({ skipCsrf: true })` since they receive no browser Origin header.

### Key Files from P-1.4 to Modify

| File | Modification |
|------|-------------|
| `packages/db/src/schema/portal-job-postings.ts` | Add `archivedAt` column |
| `packages/db/src/queries/portal-job-postings.ts` | Add expiry/archive queries, modify filter query |
| `packages/config/src/events.ts` | Add `JobExpiredEvent`, `JobExpiryWarningEvent` |
| `apps/portal/src/services/job-posting-service.ts` | Update transitions, add `renewPosting()` |
| `apps/portal/src/lib/validations/job-posting.ts` | Add `expiresAt`, `newExpiresAt`, `contentChanged` fields |
| `apps/portal/src/components/domain/posting-status-actions.tsx` | Add expired actions, expiring-soon badge |
| `apps/portal/src/components/domain/job-posting-card.tsx` | Show expiry/archived dates |
| `apps/portal/src/components/flow/job-posting-form.tsx` | Add expiry date field, template selector |
| `apps/portal/src/app/[locale]/my-jobs/page.tsx` | Enable expired tab, add archived tab |
| `apps/portal/src/app/api/v1/jobs/[jobId]/status/route.ts` | Add renew branch |
| `apps/portal/src/app/api/v1/jobs/[jobId]/route.ts` | Handle `expiresAt` in PATCH |
| `apps/portal/src/app/api/v1/jobs/route.ts` | Handle `expiresAt` in POST |
| `apps/portal/messages/en.json` | Add expiry + template keys |
| `apps/portal/messages/ig.json` | Add expiry + template keys |

### Architecture Compliance

- **Internal routes:** `api/v1/internal/jobs/*` — machine-to-machine, `skipCsrf: true`, `requireInternalAuth()`
- **Three-layer components:** ExtendPostingModal → `flow/`, TemplateSelector → `domain/`
- **Skeleton exports:** Every new component exports `ComponentNameSkeleton`
- **API route params:** Extract jobId from URL pathname — NOT from Next.js route params
- **Error codes:** Reuse existing `PORTAL_ERRORS.INVALID_STATUS_TRANSITION` and `PORTAL_ERRORS.POSTING_LIMIT_EXCEEDED`. No new error codes
- **HTML sanitization:** Template content is hardcoded (trusted) — no sanitization needed for template pre-fill. User edits are sanitized on submit (existing pattern)
- **Ownership validation:** All employer-facing endpoints validate `posting.companyId === company.id`
- **`withApiHandler` wrapping:** All routes use `withApiHandler()`. Internal routes add `{ skipCsrf: true }`
- **Zod import:** `import { z } from "zod/v4"` (NOT `"zod"`)

### Testing Standards

- **Co-located tests:** `extend-posting-modal.test.tsx` next to `extend-posting-modal.tsx`
- **Server test files:** `// @vitest-environment node` for route and service tests
- **Internal route tests:** Mock `process.env.INTERNAL_JOB_SECRET` and test with/without auth header
- **CSRF in mutation tests:** All PATCH/POST test requests MUST include `Origin` and `Host` headers matching. Internal routes test with `Authorization: Bearer ${secret}` header instead
- **Event emission tests:** Mock `portalEventBus.emit` and verify event type + payload
- **axe-core:** Every component test includes accessibility assertion
- **Client component rendering:** Use `renderWithPortalProviders` from `@/test-utils/render`

### Integration Tests (SN-3 — Missing Middle)

- Internal expire route test with real `withApiHandler` wrapping (verifies skipCsrf + error handling)
- Renew service test verifying DB query is called with correct `expires_at` and `status` values
- Archive query test verifying `archived_at` exclusion from default filter
- Status transition test: `expired → active` with active posting limit check end-to-end
- Template API returns well-formed data consumable by the form

### Project Structure Notes

```
packages/db/src/
├── migrations/
│   ├── 0053_job_posting_expiry_archive.sql    # NEW migration
│   └── meta/_journal.json                      # Add idx 53
├── schema/
│   └── portal-job-postings.ts                  # MODIFY: add archivedAt column
└── queries/
    └── portal-job-postings.ts                  # MODIFY: add expiry/archive queries, update filter

packages/config/src/
└── events.ts                                   # MODIFY: add JobExpiredEvent, JobExpiryWarningEvent

apps/portal/src/
├── lib/
│   ├── internal-auth.ts                        # NEW: internal route auth helper
│   ├── internal-auth.test.ts                   # NEW
│   ├── job-templates.ts                        # NEW: hardcoded role templates
│   ├── job-templates.test.ts                   # NEW
│   └── validations/
│       └── job-posting.ts                      # MODIFY: add expiresAt, newExpiresAt, contentChanged
├── services/
│   ├── job-posting-service.ts                  # MODIFY: update transitions, add renewPosting()
│   └── job-posting-service.test.ts             # MODIFY: add renew tests
├── components/
│   ├── domain/
│   │   ├── template-selector.tsx               # NEW + skeleton
│   │   ├── template-selector.test.tsx          # NEW
│   │   ├── posting-status-actions.tsx           # MODIFY: expired actions, expiring badge
│   │   ├── posting-status-actions.test.tsx      # MODIFY
│   │   ├── job-posting-card.tsx                 # MODIFY: expiry/archive dates
│   │   └── job-posting-card.test.tsx            # MODIFY
│   └── flow/
│       ├── extend-posting-modal.tsx             # NEW + skeleton
│       ├── extend-posting-modal.test.tsx        # NEW
│       ├── job-posting-form.tsx                 # MODIFY: expiry field, template selector
│       └── job-posting-form.test.tsx            # MODIFY
├── app/
│   ├── api/v1/
│   │   ├── jobs/
│   │   │   ├── [jobId]/
│   │   │   │   ├── route.ts                    # MODIFY: handle expiresAt in PATCH
│   │   │   │   ├── route.test.ts               # MODIFY
│   │   │   │   ├── status/
│   │   │   │   │   ├── route.ts                # MODIFY: add renew branch
│   │   │   │   │   └── route.test.ts           # MODIFY
│   │   │   └── route.ts                        # MODIFY: handle expiresAt in POST
│   │   ├── job-templates/
│   │   │   ├── route.ts                        # NEW: GET templates
│   │   │   └── route.test.ts                   # NEW
│   │   └── internal/
│   │       └── jobs/
│   │           ├── expire-postings/
│   │           │   ├── route.ts                # NEW: auto-expire + warning
│   │           │   └── route.test.ts           # NEW
│   │           └── archive-expired/
│   │               ├── route.ts                # NEW: auto-archive
│   │               └── route.test.ts           # NEW
│   └── [locale]/
│       └── my-jobs/
│           ├── page.tsx                        # MODIFY: enable expired, add archived tab
│           └── page.test.tsx                   # MODIFY
└── messages/
    ├── en.json                                 # MODIFY: add expiry + template keys
    └── ig.json                                 # MODIFY: add expiry + template keys
```

### Existing Components to Reuse

| Component | Location | Use in P-1.5 |
|-----------|----------|---------------|
| `PostingStatusActions` | `components/domain/` | Extend with expired actions (Extend, Edit & Renew, Close) |
| `ClosePostingModal` | `components/flow/` | Reuse for closing expired postings (unchanged) |
| `JobPostingCard` | `components/domain/` | Extend with `expiresAt`/`archivedAt` display |
| `JobPostingForm` | `components/flow/` | Add expiry date field + template selector button |
| `Dialog` | `components/ui/dialog` | Reuse for ExtendPostingModal (installed in P-1.4) |
| `withApiHandler` | `@/lib/api-middleware` | Wrap all routes (portal path — community uses `@/server/api/middleware`) |
| `ApiError` | `@/lib/api-error` | Error handling |
| `portalEventBus` | `@/services/event-bus` | Emit expiry/warning events |

### Known Pre-Existing Debt (Do Not Fix in P-1.5)

- **`apprenticeship` enum gap:** Same as P-1.4 — `portalEmploymentTypeEnum` includes `"apprenticeship"` but form validation doesn't. Low risk.
- **VD-5:** Duplicated `sanitize.ts` in portal and community — trigger: 3rd app needs sanitization
- **No portal notification handlers:** Events emitted but no consumers yet. Epic 6 wires email/push delivery

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story P-1.5 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd-v2.md — FR10 (renew), FR12 (auto-expire), FR13 (30-day visibility), FR14 (3-day warning), FR42-FR43 (retention), DEFERRED-9 (templates)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Internal API routes for cron jobs, background job patterns]
- [Source: _bmad-output/implementation-artifacts/p-1-4-job-posting-lifecycle-management.md — P-1.4 status machine, service patterns, test patterns, PostingStatusActions, ClosePostingModal]
- [Source: packages/db/src/schema/portal-job-postings.ts — expires_at already exists, expired in status enum]
- [Source: packages/db/src/queries/portal-job-postings.ts — existing query patterns]
- [Source: apps/portal/src/services/job-posting-service.ts — VALID_TRANSITIONS, transitionStatus, closePosting, canEditPosting]
- [Source: packages/config/src/events.ts — PortalEventMap, existing job event interfaces]
- [Source: apps/portal/src/lib/portal-errors.ts — 7 existing error codes, no new ones needed]
- [Source: apps/portal/src/components/flow/job-posting-form.tsx — current form structure, mode/initialData support]
- [Source: apps/portal/src/components/domain/posting-status-actions.tsx — current status-based action buttons]
- [Source: apps/portal/src/app/[locale]/my-jobs/page.tsx — disabled expired tab, filter pattern]

## Definition of Done (SN-1)

- [x] All acceptance criteria met (AC1–AC9)
- [x] All 9 validation scenarios demonstrated with evidence
- [x] Unit tests written and passing (~80+ new tests across routes, services, components, queries)
- [x] Integration tests written and passing (SN-3)
- [x] Flow owner has verified the complete end-to-end chain
- [x] No pre-existing test regressions introduced
- [x] TypeScript typecheck passes with 0 errors across all packages
- [x] ESLint passes with 0 new errors
- [x] All i18n keys defined in both en.json and ig.json
- [x] Internal routes secured with `INTERNAL_JOB_SECRET` validation
- [x] Active posting limit enforced on expired → active renew path

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Validation Evidence

<!-- Attach or link evidence for each validation scenario before moving to review -->

### Debug Log References

### Completion Notes List

### File List

**New Files:**
- `packages/db/src/migrations/0053_job_posting_expiry_archive.sql` — migration adding `archived_at` column + indexes
- `apps/portal/src/lib/internal-auth.ts` — internal route auth helper (`requireInternalAuth`)
- `apps/portal/src/lib/internal-auth.test.ts` — 5 tests
- `apps/portal/src/lib/job-templates.ts` — hardcoded role templates (5 templates)
- `apps/portal/src/app/api/v1/internal/jobs/expire-postings/route.ts` — auto-expire + warning cron endpoint
- `apps/portal/src/app/api/v1/internal/jobs/expire-postings/route.test.ts` — 9 tests
- `apps/portal/src/app/api/v1/internal/jobs/archive-expired/route.ts` — auto-archive cron endpoint
- `apps/portal/src/app/api/v1/internal/jobs/archive-expired/route.test.ts` — 7 tests
- `apps/portal/src/app/api/v1/job-templates/route.ts` — GET templates endpoint
- `apps/portal/src/app/api/v1/job-templates/route.test.ts` — 4 tests
- `apps/portal/src/components/domain/template-selector.tsx` — template selector dropdown
- `apps/portal/src/components/domain/template-selector.test.tsx` — 8 tests
- `apps/portal/src/components/flow/extend-posting-modal.tsx` — extend/renew date picker modal
- `apps/portal/src/components/flow/extend-posting-modal.test.tsx` — tests

**Modified Files:**
- `packages/db/src/migrations/meta/_journal.json` — added idx 53 entry
- `packages/db/src/schema/portal-job-postings.ts` — added `archivedAt` column
- `packages/db/src/schema/portal-job-postings.test.ts` — updated for new column
- `packages/db/src/queries/portal-job-postings.ts` — added getExpiredPostings, getExpiringPostings, getArchivablePostings, archivePosting, batchExpirePostings, updated filter query
- `packages/db/src/queries/portal-job-postings.test.ts` — +14 new query tests
- `packages/config/src/events.ts` — added JobExpiredEvent, JobExpiryWarningEvent interfaces + PortalEventMap entries
- `packages/config/src/events.test.ts` — +4 type tests + serialization round-trip tests for new events
- `apps/portal/src/services/job-posting-service.ts` — updated VALID_TRANSITIONS, added renewPosting(), updated closePosting() guard + canEditPosting()
- `apps/portal/src/services/job-posting-service.test.ts` — +10 renewPosting tests, +1 closePosting expired test
- `apps/portal/src/lib/validations/job-posting.ts` — added expiresAt to jobPostingSchema, newExpiresAt + contentChanged to statusTransitionSchema
- `apps/portal/src/app/api/v1/jobs/route.ts` — handle expiresAt in POST
- `apps/portal/src/app/api/v1/jobs/[jobId]/route.ts` — handle expiresAt in PATCH, added expired→pending_review branch
- `apps/portal/src/app/api/v1/jobs/[jobId]/route.test.ts` — updated
- `apps/portal/src/app/api/v1/jobs/[jobId]/status/route.ts` — added renew branch for expired→active
- `apps/portal/src/app/api/v1/jobs/[jobId]/status/route.test.ts` — +7 renew tests
- `apps/portal/src/components/domain/posting-status-actions.tsx` — split expired from filled, added Extend/Edit&Renew/Close actions + expiring-soon badge
- `apps/portal/src/components/domain/posting-status-actions.test.tsx` — +8 expired/expiring-soon tests
- `apps/portal/src/components/domain/job-posting-card.tsx` — added expiresAt/archivedAt display, expiring-soon badge
- `apps/portal/src/components/flow/job-posting-form.tsx` — added expiresAt field + TemplateSelector integration
- `apps/portal/src/components/flow/job-posting-form.test.tsx` — updated
- `apps/portal/src/app/[locale]/my-jobs/page.tsx` — enabled expired tab, added archived tab, fixed archived query dedup
- `apps/portal/src/app/[locale]/my-jobs/page.test.tsx` — updated
- `apps/portal/messages/en.json` — added Portal.expiry.* and Portal.templates.* namespaces + Portal.lifecycle.archived/filterArchived
- `apps/portal/messages/ig.json` — Igbo translations for all new keys

### Review Fixes Applied (2026-04-05)

- **F2**: Fixed `employerUserId` in expire-postings route — now resolves real owner user ID via `getJobPostingWithCompany()` join instead of passing `companyId` as `employerUserId`
- **F4**: Added `skipCsrf: true` verification tests for both internal routes (expire-postings, archive-expired) using `vi.resetModules()` pattern
- **F6+F7**: Fixed TemplateSelector — changed `role="dialog"` to `role="listbox"` on dropdown, added Escape key dismissal + outside click handler
- **F9**: Fixed duplicate archived query in my-jobs page — cached `archivedPostings` result, reused for both `filteredPostings` and `archivedCount`
- **F10**: Fixed missing `afterEach` import in archive-expired test
- **F11**: Added `"server-only"` import to job-templates route + `server-only` mock in test
- **F2 test**: Added fallback test for `employerUserId` when company join returns null
- **F6 test**: Added Escape key dismissal test + ARIA attribute verification test
