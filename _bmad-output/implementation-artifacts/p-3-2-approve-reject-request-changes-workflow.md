# Story P-3.2: Approve / Reject / Request Changes Workflow

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a JOB_ADMIN,
I want to approve, reject, or request changes on pending postings with feedback, and have verified employers auto-approved via a guarded fast-lane,
so that quality postings go live quickly, problematic ones are blocked, and employers get actionable feedback to improve their listings.

## Acceptance Criteria

1. **AC-1 — Approve:** Given a JOB_ADMIN is reviewing a pending posting, when they click "Approve", then the posting status transitions to `active`, becomes visible in search/browsing, the approval is logged via `portal_admin_reviews` + `job.reviewed` event, and the admin is redirected to the review queue. _(Employer notification via `job.reviewed` event consumer — deferred to P-E6; event is emitted and verified in this story.)_

2. **AC-2 — Reject:** Given a JOB_ADMIN is reviewing a pending posting, when they click "Reject", then a modal requires a rejection reason (required, min 20 chars) and category (policy_violation, inappropriate_content, insufficient_detail, other), the posting status transitions to `rejected`, the rejection is logged, and the admin is redirected to the review queue. _(Employer notification via event consumer — deferred to P-E6.)_

3. **AC-3 — Request Changes:** Given a JOB_ADMIN is reviewing a pending posting, when they click "Request Changes", then a modal requires specific change requests (required, min 20 chars), the posting status transitions to `draft` with `changes_requested` recorded in `portal_admin_reviews`, `revisionCount` is incremented, the request is logged, and the admin is redirected to the review queue. _(Employer notification via event consumer — deferred to P-E6.)_

4. **AC-4 — Resubmission Visibility:** Given an employer has received a "Request Changes" decision and resubmits, then the posting re-enters the review queue with revision history visible to the admin (previous change requests and the employer's modifications via `revisionCount`).

5. **AC-5 — Max Revision Cycles:** Given a posting has reached the maximum revision cycles (3), when the admin reviews it again, then "Request Changes" is disabled with a tooltip: "Maximum revision cycles reached — approve or reject", and the admin must make a final approve or reject decision.

6. **AC-6 — Approval Integrity Rule:** Given any code path attempts to set a posting status to `active`, then the system validates: (a) explicit admin approval exists in `portal_admin_reviews` OR fast-lane criteria are ALL met, and if the condition fails, the transition is rejected with `PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION`.

7. **AC-7 — Fast-Lane Auto-Approval:** Given a verified employer submits a posting, then fast-lane auto-approval occurs ONLY if ALL conditions are met: (1) employer is verified (`trustBadge=true`), (2) no violations in the last 60 days, (3) posting passes rule-based screening with status `pass` (stub: always `null` until P-3.3), (4) posting is within normal range. If any condition fails, the posting enters the normal review queue. Fast-lane approvals are logged with reason `fast_lane_auto_approved`. **Note:** Since screening (P-3.3) is not yet implemented, fast-lane will effectively never trigger — but the guard logic and eligibility check must be fully implemented and tested.

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` -> S7 Frontend Safety & Readiness

### i18n Key Inventory

**Purpose:** Ensure every user-visible string ships with a translation key so bilingual launch (en + ig) is never blocked on copy archaeology.
**Owner:** SM (inventory + English copy) + Dev (implementation, Igbo copy at Dev Completion)
**Audit rule:** Every user-facing string present in the UI mocks, wireframes, OR AC copy MUST appear as an enumerated key below with English copy and key name.

- [x] Every user-facing string in the UI mocks / ACs maps to a key below
- [x] English copy filled in for every row
- [ ] Keys reserved in `apps/portal/messages/en.json` (Igbo copy at Dev Completion)
- Keys:
  - `Portal.admin.approve` — "Approve" (action button label)
  - `Portal.admin.reject` — "Reject" (action button label)
  - `Portal.admin.requestChanges` — "Request Changes" (action button label)
  - `Portal.admin.rejectTitle` — "Reject Posting" (modal title)
  - `Portal.admin.rejectDescription` — "Provide a reason for rejecting this posting. The employer will see this feedback." (modal description)
  - `Portal.admin.rejectReason` — "Rejection reason" (textarea label)
  - `Portal.admin.rejectReasonPlaceholder` — "Explain why this posting is being rejected (min. 20 characters)..." (placeholder)
  - `Portal.admin.rejectCategory` — "Rejection category" (select label)
  - `Portal.admin.rejectCategoryPolicyViolation` — "Policy violation" (category option)
  - `Portal.admin.rejectCategoryInappropriateContent` — "Inappropriate content" (category option)
  - `Portal.admin.rejectCategoryInsufficientDetail` — "Insufficient detail" (category option)
  - `Portal.admin.rejectCategoryOther` — "Other" (category option)
  - `Portal.admin.rejectConfirm` — "Reject Posting" (destructive button in confirm dialog)
  - `Portal.admin.rejectConfirmDescription` — "Are you sure you want to reject this posting? This action will notify the employer." (confirm dialog description — asymmetric friction)
  - `Portal.admin.requestChangesTitle` — "Request Changes" (modal title)
  - `Portal.admin.requestChangesDescription` — "Describe the changes needed. The employer will receive this feedback and can resubmit." (modal description)
  - `Portal.admin.requestChangesFeedback` — "Required changes" (textarea label)
  - `Portal.admin.requestChangesFeedbackPlaceholder` — "Describe the specific changes needed (min. 20 characters)..." (placeholder)
  - `Portal.admin.requestChangesConfirm` — "Send Change Request" (button label)
  - `Portal.admin.maxRevisionsReached` — "Maximum revision cycles reached — approve or reject" (tooltip text)
  - `Portal.admin.approveSuccess` — "Posting approved and is now live" (toast)
  - `Portal.admin.rejectSuccess` — "Posting rejected — employer notified" (toast)
  - `Portal.admin.requestChangesSuccess` — "Change request sent to employer" (toast)
  - `Portal.admin.decisionError` — "Failed to process decision. Please try again." (error toast)
  - `Portal.admin.submitting` — "Submitting..." (loading state)
  - `Portal.admin.fastLaneApproved` — "Fast-lane approved" (badge/indicator)
  - `Portal.admin.previousFeedback` — "Previous admin feedback" (label for showing prior change requests)
  - `Portal.admin.revisionHistory` — "Revision history" (section heading)
  - `Portal.admin.cancel` — "Cancel" (modal cancel button)

### Sanitization Points

**Purpose:** Make every HTML-rendering surface explicit and sanitized.
**Owner:** SM (surface inventory) + Dev (sanitizeHtml call)

- [x] Every HTML rendering surface in this story is listed below
- [x] Each listed surface uses `sanitizeHtml()` OR has explicit justification
- Surfaces:
  - `ReviewActionPanel` feedback display: admin feedback text is plain text (textarea input), rendered as `<p>` — no HTML rendering, no sanitization needed
  - Review detail page already sanitizes `descriptionHtml` and `descriptionIgboHtml` via `sanitizeHtml()` (P-3.1)

### Accessibility Patterns

**Purpose:** Prevent keyboard, screen-reader, and focus regressions.
**Owner:** SM (pattern list) + Dev (axe assertions)

- [x] Keyboard interaction pattern documented for every new interactive element
- [x] ARIA roles/labels listed for every semantically meaningful element
- [x] Focus management plan documented for every modal / dropdown / route transition
- [x] axe-core assertions planned in component tests
- Elements:
  - **Approve button:** `<Button>` with `aria-label={t("approve")}`. Single click action (no modal for approve — approve is fast per UX spec). On success: show toast then `router.push` to locale-prefixed queue (`/${locale}/admin/jobs`).
  - **Reject button:** `<Button variant="destructive">` with `aria-label={t("reject")}`. Opens `RejectPostingModal`.
  - **Request Changes button:** `<Button variant="outline">` with `aria-label={t("requestChanges")}`. Opens `RequestChangesModal`. Disabled when `revisionCount >= 3` — uses `Tooltip` to explain.
  - **RejectPostingModal:** Dialog component. Focus trap managed by Radix Dialog. Initial focus on rejection reason textarea. On close: focus returns to Reject button. Contains: textarea (reason, minLength 20), select (category), confirmation step with separate confirm dialog (asymmetric friction).
  - **RequestChangesModal:** Dialog component. Focus trap managed by Radix Dialog. Initial focus on feedback textarea. On close: focus returns to Request Changes button. Contains: textarea (feedback, minLength 20).
  - **Reject confirmation dialog:** Nested confirmation after filling reject form. "Are you sure?" with destructive confirm button. Focus on cancel button by default (asymmetric friction).
  - All modals: `Escape` closes, `Tab` cycles within, submit on `Enter` in form (via form submit).
  - axe-core assertions in: `ReviewActionPanel.test.tsx`, `RejectPostingModal.test.tsx`, `RequestChangesModal.test.tsx`

### Component Dependencies

**Purpose:** Catch missing shadcn/ui components at story drafting time.
**Owner:** SM (inventory) + Dev (import verification)

- [x] Every shadcn/ui component this story needs is listed below
- [x] Verified present in `apps/portal/src/components/ui/`
- Components:
  - `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` — present (`dialog.tsx`)
  - `Button` — present (`button.tsx`)
  - `Textarea` — present (`textarea.tsx`)
  - `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` / `SelectValue` — present (`select.tsx`)
  - `Tooltip` / `TooltipContent` / `TooltipProvider` / `TooltipTrigger` — present (`tooltip.tsx`)
  - `Label` — present (`label.tsx`)
  - `Badge` — present (`badge.tsx`)

## Validation Scenarios (SN-2 — REQUIRED)

1. **Approve posting** — Admin navigates to review detail page for a pending posting, clicks "Approve", posting transitions to `active`, toast confirms, `portal_admin_reviews` record inserted with decision `approved`, `job.reviewed` event emitted, admin redirected to review queue.
   - Expected outcome: Posting status is `active` in DB, review record exists, event emitted, router navigates to queue
   - Evidence required: DB query showing status + review record, test passing

2. **Reject posting with reason and category** — Admin clicks "Reject", fills rejection reason (20+ chars), selects category "insufficient_detail", confirms via confirmation dialog, posting transitions to `rejected`, employer notification sent.
   - Expected outcome: Posting status `rejected`, review record with `decision=rejected` and feedback, confirmation dialog shown before action
   - Evidence required: Test + DB state verification

3. **Request Changes with feedback** — Admin clicks "Request Changes", enters feedback (20+ chars), submits, posting transitions to `draft`, `revisionCount` incremented by 1, review record inserted with `decision=changes_requested`.
   - Expected outcome: Posting status `draft`, `revisionCount` incremented, review record with changes_requested
   - Evidence required: Test + DB state verification

4. **Max revision cycles enforcement** — Posting has `revisionCount=3`, admin views review detail, "Request Changes" button is disabled with tooltip, admin can only approve or reject.
   - Expected outcome: Request Changes button disabled, tooltip visible, approve/reject still functional
   - Evidence required: Component test screenshot/assertion

5. **Resubmission shows revision context** — Employer edits and resubmits after changes requested, posting re-enters queue with `revisionCount` visible, admin can see previous feedback.
   - Expected outcome: Queue shows revisionCount, detail page shows previous admin feedback
   - Evidence required: Test showing revision context display

6. **Fast-lane eligibility check** — Verified employer with no violations submits posting, fast-lane check runs but does not auto-approve (screening not yet implemented = null), posting enters normal queue.
   - Expected outcome: `checkFastLaneEligibility` returns false (screening is null), posting stays in queue
   - Evidence required: Service test

7. **Validation: reject reason too short** — Admin tries to reject with reason < 20 chars, form validation prevents submission.
   - Expected outcome: Submit button disabled or error shown, no API call made
   - Evidence required: Component test

8. **Server-side validation** — API receives decision with invalid/missing fields (e.g., reject without reason), returns 400.
   - Expected outcome: 400 response with validation error
   - Evidence required: Route test

## Flow Owner (SN-4)

**Owner:** Dev (full stack — DB through UI)

## Tasks / Subtasks

- [x] Task 1: Extend state machine and add error codes (AC: #3, #5, #6) — _independent of Task 2; can be done in parallel_
  - [x] 1.1 Add `"draft"` to `VALID_TRANSITIONS["pending_review"]` in `apps/portal/src/services/job-posting-service.ts`
  - [x] 1.2 Add `"pending_review:draft"` to `ADMIN_ONLY_TRANSITIONS` set
  - [x] 1.3 Add `APPROVAL_INTEGRITY_VIOLATION` and `MAX_REVISIONS_REACHED` to `PORTAL_ERRORS` in `apps/portal/src/lib/portal-errors.ts`
  - [x] 1.4 Add `REJECTION_CATEGORIES` constant array to `apps/portal/src/lib/portal-errors.ts` (co-located with the new error codes — both the Zod schema in Task 4.2 and the service in Task 3.2 import it from there): `export const REJECTION_CATEGORIES = ["policy_violation", "inappropriate_content", "insufficient_detail", "other"] as const`
  - [x] 1.5 Update existing `job-posting-service.test.ts` to cover `pending_review -> draft` transition (admin only)

- [x] Task 2: DB query — insert admin review (AC: #1, #2, #3) — _independent of Task 1; can be done in parallel_
  - [x] 2.1 Add `insertAdminReview(data: NewPortalAdminReview)` to `packages/db/src/queries/portal-admin-reviews.ts` — returns inserted row
  - [x] 2.2 Add `getReviewHistoryForPosting(postingId: string)` query — returns all reviews for a posting ordered by `reviewedAt DESC` (for revision history display in AC-4)
  - [x] 2.3 Add `incrementRevisionCount(postingId: string)` query using `sql\`revision_count + 1\`` for atomic increment (not read-then-write)
  - [x] 2.4 Write tests in `packages/db/src/queries/portal-admin-reviews.test.ts` (extend existing file)

- [x] Task 3: Admin review service — decision functions (AC: #1, #2, #3, #5, #6, #7)
  - [x] 3.1 Add `approvePosting(postingId, reviewerUserId)` to `apps/portal/src/services/admin-review-service.ts`
  - [x] 3.2 Add `rejectPosting(postingId, reviewerUserId, reason, category)`
  - [x] 3.3 Add `requestChanges(postingId, reviewerUserId, feedbackComment)`
  - [x] 3.4 Add `checkFastLaneEligibility(postingId)` — returns `{ eligible: boolean; reasons: string[] }`
  - [x] 3.5 Add `getReviewHistory(postingId)` — delegates to DB query, returns formatted history
  - [x] 3.6 Write tests in `apps/portal/src/services/admin-review-service.test.ts` (extend existing file)

- [x] Task 4: API route — POST handler for review decisions (AC: #1, #2, #3)
  - [x] 4.1 Add `POST` handler to `apps/portal/src/app/api/v1/admin/jobs/[jobId]/review/route.ts`
  - [x] 4.2 Add Zod validation schema in `apps/portal/src/lib/validations/admin-review.ts`
  - [x] 4.3 Write route tests in `apps/portal/src/app/api/v1/admin/jobs/[jobId]/review/route.test.ts` (extend existing file)

- [x] Task 5: UI — ReviewActionPanel component (AC: #1, #2, #3, #5)
  - [x] 5.1 Create `apps/portal/src/components/domain/review-action-panel.tsx` (client component)
  - [x] 5.2 Create `apps/portal/src/components/domain/reject-posting-modal.tsx`
  - [x] 5.3 Create `apps/portal/src/components/domain/request-changes-modal.tsx`
  - [x] 5.4 Integrate `ReviewActionPanel` into review detail page
  - [x] 5.5 Write component tests (all three components with axe assertions)

- [x] Task 6: i18n keys (AC: all)
  - [x] 6.1 Add all keys from i18n inventory to `apps/portal/messages/en.json` under `Portal.admin` (36 keys including reviewActionsLabel + reviewDecisionHeading)
  - [x] 6.2 Add Igbo translations to `apps/portal/messages/ig.json` under `Portal.admin`

- [x] Task 7: Integration — review detail page shows revision history (AC: #4)
  - [x] 7.1 Update `getReviewDetail()` in `admin-review-service.ts` to include review history (previous decisions + feedback)
  - [x] 7.2 Update review detail page to display revision history section when `revisionCount > 0`
  - [x] 7.3 Show previous admin feedback prominently when posting is a resubmission

## Dev Notes

### Architecture Patterns & Constraints

- **State machine extension:** Add `pending_review -> draft` to `VALID_TRANSITIONS` and `ADMIN_ONLY_TRANSITIONS` in `job-posting-service.ts`. This is a clean extension — the state machine already handles `pending_review -> active` and `pending_review -> rejected` as admin-only.
- **Bypass ownership check for admin actions:** `transitionStatus()` checks `posting.companyId !== companyId` which doesn't apply to admin actions. The admin review service should call `updateJobPostingStatus()` / `updateJobPosting()` directly (like `closePosting()` does for its specific case) rather than going through `transitionStatus()`. This is the established pattern — `closePosting()`, `editActivePosting()`, and `renewPosting()` all bypass `transitionStatus()` when they have their own validation logic.
- **Import path for DB functions:** `admin-review-service.ts` must import `updateJobPostingStatus`, `updateJobPosting`, and `getJobPostingById` from `@igbo/db/queries/portal-job-postings` (same as `job-posting-service.ts`). Do NOT call these via `job-posting-service` — import directly from the DB package.
- **Active posting limit bypass is intentional:** Admin approval calls `updateJobPostingStatus` directly, skipping the `ACTIVE_POSTING_LIMIT` check in `transitionStatus`. This is by design — admin override can push an employer past their 5-posting limit. Do NOT add a limit check to `approvePosting`.
- **DB transaction wrapping:** Each decision function (`approvePosting`, `rejectPosting`, `requestChanges`) performs two DB writes (insert review record + update posting). Wrap both in `db.transaction(async (tx) => { ... })` to prevent partial-write inconsistency if the second write fails.
- **Atomic revisionCount increment:** Use `sql\`revision_count + 1\`` in the DB query, not a read-then-write pattern. This prevents race conditions if two admins act simultaneously.
- **Fast-lane will not trigger yet:** Screening (P-3.3) returns `null` — the fast-lane check must be fully implemented but will return `eligible: false` because the screening condition is unmet. Test both the eligible and ineligible paths.
- **Event emission:** Use `portalEventBus.emit("job.reviewed", ...)` — the `JobReviewedEvent` type is already defined in `@igbo/config/events`. The consumer side (notifications) will be built in P-E6 — for now the event is emitted but no handler exists yet.
- **Resubmission mechanism (AC-4):** Employer resubmission (`draft → pending_review`) uses the existing `submitForReview()` in `job-posting-service.ts` — it already accepts `draft` status (line 258). No new resubmission code is needed in this story. Task 7 only adds the revision history display on the admin side.

### Source Tree — Files to Create/Modify

**Create:**
- `apps/portal/src/components/domain/review-action-panel.tsx` — action buttons component
- `apps/portal/src/components/domain/review-action-panel.test.tsx`
- `apps/portal/src/components/domain/reject-posting-modal.tsx` — rejection dialog with confirmation
- `apps/portal/src/components/domain/reject-posting-modal.test.tsx`
- `apps/portal/src/components/domain/request-changes-modal.tsx` — change request dialog
- `apps/portal/src/components/domain/request-changes-modal.test.tsx`
- `apps/portal/src/lib/validations/admin-review.ts` — Zod schemas for review decisions

**Modify:**
- `apps/portal/src/services/job-posting-service.ts` — add `pending_review -> draft` transition
- `apps/portal/src/services/job-posting-service.test.ts` — test new transition
- `apps/portal/src/services/admin-review-service.ts` — add decision functions + fast-lane check
- `apps/portal/src/services/admin-review-service.test.ts` — extend with decision tests
- `apps/portal/src/app/api/v1/admin/jobs/[jobId]/review/route.ts` — add POST handler
- `apps/portal/src/app/api/v1/admin/jobs/[jobId]/review/route.test.ts` — extend with POST tests
- `apps/portal/src/app/[locale]/admin/jobs/[jobId]/review/page.tsx` — integrate ReviewActionPanel
- `apps/portal/src/app/[locale]/admin/jobs/[jobId]/review/page.test.tsx` — update page tests
- `apps/portal/src/lib/portal-errors.ts` — add APPROVAL_INTEGRITY_VIOLATION, MAX_REVISIONS_REACHED
- `packages/db/src/queries/portal-admin-reviews.ts` — add insert + history queries
- `packages/db/src/queries/portal-admin-reviews.test.ts` — extend with new query tests
- `apps/portal/messages/en.json` — add Portal.admin keys
- `apps/portal/messages/ig.json` — add Portal.admin Igbo keys

**Reference (do not modify, use as patterns):**
- `apps/portal/src/components/flow/close-posting-modal.tsx` — modal pattern (Dialog + RadioGroup + loading + toast)
- `apps/portal/src/services/event-bus.ts` — `portalEventBus` singleton
- `packages/config/src/events.ts` — `JobReviewedEvent` type

### Testing Standards

- Co-located tests (no `__tests__` directories)
- `// @vitest-environment node` for service/route tests
- `vi.mock("server-only", () => ({}))` at top of node-env test files
- `renderWithPortalProviders` for component tests
- Every component test includes axe-core assertion: `expect.extend(toHaveNoViolations)` + `expect(results).toHaveNoViolations()` (NO `@ts-ignore` needed in portal)
- Mock `requireJobAdminRole` for route tests — exact pattern from existing route test:
  ```ts
  vi.mock("@/lib/portal-permissions", () => ({ requireJobAdminRole: vi.fn() }));
  // In beforeEach success case:
  vi.mocked(requireJobAdminRole).mockResolvedValue({ user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } } as never);
  ```
- POST route tests need `Origin` and `Host` headers for CSRF (GET only needs `Host`)
- Export `*Skeleton` for every new component
- Use `userEvent.setup()` for interaction tests (not `fireEvent.click` — Radix uses `pointerdown`)
- Mock `useSession` via `vi.mock("next-auth/react")` for client component tests
- Zod import: `import { z } from "zod/v4"`; validation errors: `parsed.error.issues[0]`
- `db.execute()` mock format: returns raw array, not `{ rows: [...] }`

### Integration Tests (SN-3 — Missing Middle)

- **Service -> DB integration:** `approvePosting` calls real `insertAdminReview` + `updateJobPostingStatus` (mocked at DB level but verifying both are called with correct params in correct order)
- **Route -> Service integration:** POST route handler calls `requireJobAdminRole` then delegates to service, returns correct status codes for each decision type
- **State machine enforcement:** `transitionStatus` with `pending_review -> draft` requires `JOB_ADMIN` role, rejects `EMPLOYER` role
- **Fast-lane -> screening dependency:** `checkFastLaneEligibility` returns ineligible when screening is `null` (current state) — tests both the eligible path (all conditions met with mocked screening) and the ineligible path

### Project Structure Notes

- Follows established portal patterns: services in `apps/portal/src/services/`, domain components in `apps/portal/src/components/domain/`, validations in `apps/portal/src/lib/validations/`
- DB queries in `packages/db/src/queries/` (shared package)
- Event types in `packages/config/src/events.ts` (shared package — already defined)
- No new migration needed — `portal_admin_reviews` and `revisionCount` already exist from P-3.1 (migrations 0056 + 0057)
- No new schema changes needed — `adminFeedbackComment` already exists on `portal_job_postings`

### Key Gotchas from P-3.1 Review

- **F2:** No hardcoded strings — all UI text via `useTranslations("Portal.admin")`
- **F3:** Reuse existing i18n keys where applicable (e.g., `Portal.admin.approved`, `Portal.admin.rejected`, `Portal.admin.changesRequested` already exist for status labels)
- **F8:** Use `getFormatter().dateTime()` from `next-intl/server` not `toLocaleDateString()` for any date display
- **`withApiHandler` dynamic params:** Extract `jobId` from URL path — `new URL(req.url).pathname.split("/").at(-2)` since path is `.../jobs/[jobId]/review`
- **Reject confirmation dialog (asymmetric friction):** UX spec explicitly requires reject to have a separate confirmation step — approve should NOT have one (approve is fast/one-click). This is a deliberate UX asymmetry.

### Previous Story Intelligence (P-3.1)

P-3.1 established:
- Admin layout with role guard (`activePortalRole !== "JOB_ADMIN"` → redirect)
- Review queue with confidence indicator, filters, pagination
- Review detail page with posting content, employer profile, posting history
- `portal_admin_reviews` schema with decision CHECK constraint
- `getReviewDetail()` returns `{ posting, company, employerName, totalPostings, approvedCount, rejectedCount, confidenceIndicator }`
- All admin i18n keys under `Portal.admin` namespace (44 keys)
- Test pattern: mock `auth()`, mock `getReviewQueue()` / `getReviewDetail()` / `getDashboardSummary()`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] — Full acceptance criteria
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 3: Kene] — Admin review UX flow, asymmetric friction, fast-lane criteria
- [Source: _bmad-output/planning-artifacts/architecture.md#Portal Service Structure] — Service patterns
- [Source: apps/portal/src/services/job-posting-service.ts] — State machine, VALID_TRANSITIONS, ADMIN_ONLY_TRANSITIONS
- [Source: apps/portal/src/services/admin-review-service.ts] — Existing read functions to extend
- [Source: packages/db/src/schema/portal-admin-reviews.ts] — Review table schema, AdminReviewDecision type
- [Source: packages/db/src/queries/portal-admin-reviews.ts] — Existing queries to extend
- [Source: apps/portal/src/components/flow/close-posting-modal.tsx] — Modal pattern reference
- [Source: apps/portal/src/lib/portal-errors.ts] — Existing error codes
- [Source: _bmad-output/implementation-artifacts/p-3-1-admin-review-queue-dashboard.md] — Previous story learnings
- [Source: docs/monorepo-playbook.md] — Readiness checklist rules

## Definition of Done (SN-1)

- [ ] All acceptance criteria met _(notification delivery to employer is deferred to P-E6 — `job.reviewed` event emission is verified in service tests as the DoD proxy)_
- [x] All validation scenarios demonstrated with evidence
- [x] Unit tests written and passing
- [x] Integration tests written and passing (SN-3)
- [x] Flow owner has verified the complete end-to-end chain
- [x] No pre-existing test regressions introduced
- [x] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [x] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory**
- [x] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [x] Dev Completion: all a11y patterns listed in Readiness (including focus management) have passing axe-core assertions
- [x] Dev Completion: all component dependencies in Readiness are imported and rendering

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Validation Evidence

Test counts (2026-04-07):
- @igbo/portal: **855/855 passing** (84 test files)
- @igbo/db: **761/761 passing** (57 test files)
- @igbo/auth: **122/122 passing**
- @igbo/config: **64/64 passing**
- @igbo/community: **4352/4352 passing** (438 test files, incl. CI scanner — no hardcoded strings)

Validation scenario coverage:
1. **Approve** — `admin-review-service.test.ts` + `route.test.ts`: approvePosting calls insertAdminReview + updates status to active, emits job.reviewed event. POST /review with decision=approved returns 201.
2. **Reject** — `reject-posting-modal.test.tsx` + `route.test.ts`: submits with decision=rejected + reason + category. Missing/short reason/category → 400.
3. **Request Changes** — `request-changes-modal.test.tsx` + `route.test.ts`: submits with decision=changes_requested + feedbackComment. Short feedback → 400.
4. **Max revisions** — `review-action-panel.test.tsx`: revisionCount=3 disables button; revisionCount=2 enables.
5. **Resubmission context** — `review-action-panel.test.tsx`: previousFeedback displayed when provided.
6. **Fast-lane** — `admin-review-service.test.ts`: checkFastLaneEligibility returns ineligible due to screening=null.
7. **Client validation** — `reject-posting-modal.test.tsx` + `request-changes-modal.test.tsx`: submit disabled below 20 chars.
8. **Server validation** — `route.test.ts`: 400 for missing/invalid fields.

i18n: 36 keys in en.json + ig.json (incl. reviewActionsLabel + reviewDecisionHeading added to fix CI scanner).
a11y: `axe` assertions in all 3 component tests — no violations.
CI scanner: `pnpm ci-checks` reports 0 hardcoded JSX strings (review-action-panel.tsx strings extracted to i18n).

### Debug Log References

- Fixed `portalAdminReviews` name collision in admin-review-service.ts → aliased schema as `adminReviewsTable`
- Fixed `successResponse` param order: `(data, undefined, 201)` not `(data, 201)`
- Added `reviewHistory: []` to page test mockDetail + mocked `review-action-panel` client component
- Fixed component tests: added `SessionProvider` passthrough to `vi.mock("next-auth/react")`
- Fixed Radix Select in jsdom: polyfilled `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, `scrollIntoView` on `Element.prototype`
- Fixed `drizzle-orm` mock in portal-admin-reviews.test.ts: added `desc` export
- Fixed portal-errors.test.ts: updated count 8→10 + added APPROVAL_INTEGRITY_VIOLATION + MAX_REVISIONS_REACHED tests
- Fixed CI scanner: hardcoded `"Review actions"` (aria-label) + `"Review Decision"` (h2) → extracted to `reviewActionsLabel` + `reviewDecisionHeading` i18n keys

### Completion Notes List

1. All 7 tasks completed end-to-end: state machine, DB queries, service functions, API route, UI components, i18n, revision history integration.
2. `checkFastLaneEligibility` always returns `eligible: false` (screening stub = null) — correct per story spec; full fast-lane triggers in P-3.3.
3. Admin bypass of ownership check is intentional: `approvePosting/rejectPosting/requestChanges` call `updateJobPostingStatus`/`updateJobPosting` directly, not `transitionStatus()`.
4. `db.transaction()` wraps both DB writes in each decision function for atomicity.
5. Radix Select jsdom polyfill added to `reject-posting-modal.test.tsx` — this pattern should be moved to a shared vitest setup file if more tests need Radix Select interaction.
6. `jobReviewedEvent` emitted for all three decisions — no consumer yet (P-E6).

### File List

**Created:**
- `apps/portal/src/components/domain/review-action-panel.tsx`
- `apps/portal/src/components/domain/review-action-panel.test.tsx`
- `apps/portal/src/components/domain/reject-posting-modal.tsx`
- `apps/portal/src/components/domain/reject-posting-modal.test.tsx`
- `apps/portal/src/components/domain/request-changes-modal.tsx`
- `apps/portal/src/components/domain/request-changes-modal.test.tsx`
- `apps/portal/src/lib/validations/admin-review.ts`

**Modified:**
- `apps/portal/src/services/job-posting-service.ts` — pending_review→draft transition + ADMIN_ONLY_TRANSITIONS
- `apps/portal/src/services/job-posting-service.test.ts` — 2 new transition tests
- `apps/portal/src/services/admin-review-service.ts` — approvePosting, rejectPosting, requestChanges, checkFastLaneEligibility, getReviewHistory, getReviewDetail extended with history
- `apps/portal/src/services/admin-review-service.test.ts` — extended with decision function tests
- `apps/portal/src/app/api/v1/admin/jobs/[jobId]/review/route.ts` — POST handler added
- `apps/portal/src/app/api/v1/admin/jobs/[jobId]/review/route.test.ts` — POST test suite added
- `apps/portal/src/app/[locale]/admin/jobs/[jobId]/review/page.tsx` — ReviewActionPanel + revision history section integrated
- `apps/portal/src/app/[locale]/admin/jobs/[jobId]/review/page.test.tsx` — reviewHistory mock + ReviewActionPanel mock
- `apps/portal/src/lib/portal-errors.ts` — APPROVAL_INTEGRITY_VIOLATION, MAX_REVISIONS_REACHED, REJECTION_CATEGORIES
- `apps/portal/src/lib/portal-errors.test.ts` — count updated 8→10 + 2 new key tests
- `packages/db/src/queries/portal-admin-reviews.ts` — insertAdminReview, getReviewHistoryForPosting, incrementRevisionCount
- `packages/db/src/queries/portal-admin-reviews.test.ts` — 3 new query test suites + `desc` added to drizzle-orm mock
- `apps/portal/messages/en.json` — 36 Portal.admin keys (incl. reviewActionsLabel, reviewDecisionHeading)
- `apps/portal/messages/ig.json` — 36 Portal.admin Igbo keys

## Code Review (2026-04-07)

Adversarial review found 4 HIGH + 5 MEDIUM + 3 LOW issues. All HIGH and MEDIUM
issues fixed automatically; LOW issues left as documented future work.

### Issues fixed (HIGH)

- **H1 — AC-6 Approval Integrity Rule never enforced.** `APPROVAL_INTEGRITY_VIOLATION`
  was defined but never thrown. Fixed by introducing
  `apps/portal/src/lib/approval-integrity.ts` (`assertApprovalIntegrity`) and
  wiring it into `transitionStatus()` for any `pending_review → active` flip
  on non-canonical paths. Canonical `approvePosting()` is unaffected (it
  inserts the review row inside its own transaction).
- **H2 — AC-7 fast-lane never wired into `submitForReview`.** Added a call to
  `checkFastLaneEligibility()` from `submitForReview()`. Eligible postings now
  short-circuit with HTTP 503 ("not yet enabled — pending P-3.3"); the path
  is currently unreachable in production (screening always returns null) but
  satisfies AC-7 wiring and gives P-3.3 a single seam to swap in
  `approvePosting(SYSTEM_USER_ID)`.
- **H3 — TOCTOU race in approve/reject/requestChanges.** Status check ran
  outside the transaction. Each decision function now performs the status
  flip via a guarded `UPDATE … WHERE status='pending_review' RETURNING id`
  inside the transaction; an empty `RETURNING` set throws 409 and rolls back
  the (still-uninserted) review row. Insert order swapped to update-first so
  the loser of the race never persists a duplicate review.
- **H4 — Service tests didn't capture insert payloads.** Replaced the
  throwaway `db.transaction` mock with a closure-based `installTxMock()` that
  records `insert.values()` and `update.set()` calls and lets each test
  override what `RETURNING` yields. Added explicit assertions that decision
  rows persist `decision`, `feedbackComment`, and `reviewerUserId`, plus
  three new race-loser tests confirming no insert + no event on contention.

### Issues fixed (MEDIUM)

- **M1 — Dead `incrementRevisionCount` query.** Removed from
  `packages/db/src/queries/portal-admin-reviews.ts` and its test. The atomic
  SQL increment now lives only inside the `requestChanges()` transaction.
- **M2 — Dead `getReviewHistory` service wrapper.** Deleted; consumers call
  `getReviewHistoryForPosting()` directly.
- **M3 — `MAX_REVISION_COUNT = 3` magic number duplicated.** Hoisted to
  `apps/portal/src/lib/portal-errors.ts` and imported by both
  `admin-review-service.ts` and `review-action-panel.tsx`.
- **M4 — Validation schema relied on `superRefine` + `!`.** Refactored
  `apps/portal/src/lib/validations/admin-review.ts` to a
  `z.discriminatedUnion("decision", [...])`. The route handler now narrows
  cleanly with no non-null assertions.
- **M5 — Tooltip on disabled button untested.** Added a tooltip-text
  rendering test in `review-action-panel.test.tsx` (with a ResizeObserver
  polyfill for jsdom) plus an `aria-disabled` assertion.

### Issues left (LOW — non-blocking)

- **L1** Empty skeleton exports in modal files — cosmetic.
- **L2** `previousFeedback` source ambiguity — documented in code comment
  during a future story.
- **L3** `getReviewDetail` always fetches review history — acceptable for
  current page volumes.

### Files added during review

- `apps/portal/src/lib/approval-integrity.ts` — AC-6 guard helper
- `apps/portal/src/lib/approval-integrity.test.ts` — guard unit tests

### Test counts after review

- `@igbo/portal`: **866 / 866 passing** (was 855 — +11 from race tests,
  approval-integrity tests, and tooltip a11y test)
- `@igbo/db`:    **760 / 760 passing** (was 761 — −1 from removed
  `incrementRevisionCount` test)
- TypeScript: clean (`tsc --noEmit` for both packages).
