# Story P-6.5: "Viewed by Employer" Signal (Outbox Pattern)

Status: in-progress

<!-- Portal Epic 6, Story 5. Directly follows P-6.4 (review — notification preferences UI, DB-wired resolveChannels, quiet hours, ~40 i18n keys). Depends on: P-6.1A (done — event catalog, priority tiers), P-6.1B (done — 5-step routing pipeline), P-6.2 (done — email templates incl. application-viewed.ts already created but unwired), P-6.3 (done — push + in-app delivery, toasts), P-6.4 (review — preferences + quiet hours). Creates: transactional outbox pattern (portal_outbox + portal_application_views tables), 2s dwell-time view detection on employer side, outbox poller service (1s interval, SKIP LOCKED), application.viewed notification handler, warm animation on seeker toast, "Viewed" badge on seeker application card, "Viewed by [Company]" timeline entry, API route for recording views. Does NOT create digest job (6.6), notification store migration (6.7), or standalone poller container (production infra — documented for future). -->

## Story

As a job seeker,
I want to know when an employer has intentionally viewed my application,
So that I feel seen and encouraged that my application is being considered — this is the platform's defining emotional moment.

## Acceptance Criteria

1. **Outbox insert on view.** When an employer opens a candidate's application detail (CandidateSidePanel in ATS or full detail page) and the content has been visible for at least 2 seconds (dwell threshold — intentional attention, not incidental exposure), the client emits a "viewed" signal to `POST /api/v1/applications/{applicationId}/viewed`. The API inserts a record into `portal_outbox` within the **same database transaction** as updating `portal_applications.viewed_at`. The outbox row contains `{ id, event_type: 'portal.application.viewed', payload: { applicationId, jobId, seekerUserId, employerUserId, timestamp }, status: 'pending', created_at }`.

2. **Idempotency enforcement.** Only the FIRST view by a given employer for a given application generates an outbox event and notification. Subsequent views update `viewed_at` but do NOT create new outbox entries. Idempotency is enforced via a unique constraint on `(application_id, employer_user_id)` in the `portal_application_views` deduplication table. The API returns 200 for first view and 204 for duplicate view. The Redis notification dedup key (`viewed:${applicationId}:${employerUserId}`) has **no TTL** — one notification per application lifetime by design. A seeker will not receive a second "Viewed" notification if the same employer views their application again in future sessions.

3. **Outbox poller.** A poller service processes pending outbox events in batches. It queries `SELECT ... FROM portal_outbox WHERE status = 'pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100`. For each event, it: (a) dispatches to the notification routing pipeline via `dispatchNotification()`, (b) updates the outbox record status to `processed` with `processed_at` timestamp. **Dev mechanism:** The primary dev trigger is `POST /api/v1/internal/outbox/process` (single batch execution, callable manually or by an external scheduler). The `startOutboxPoller()` setInterval is **disabled in dev** (or set to a minimum 30s interval) to prevent HMR duplicate dispatches — do not use setInterval as the primary polling mechanism during development. **NFR34:** Delivery latency is measured from `portal_outbox.created_at` (row inserted) to `dispatchNotification()` called by the poller. Target: ≤1 second under normal load. The `SKIP LOCKED` clause makes the poller safe for concurrent invocations (e.g., overlapping cron calls).

4. **Seeker notification & UI updates.** The seeker receives an in-app notification with a warm confirmation animation using the CSS class `animate-warm-glow` (2.5s ease-in-out glow/pulse, defined in `apps/portal/src/app/globals.css` — the platform's defining emotional moment). Applied conditionally in `NotificationToastProvider` when `eventType === "portal.application.viewed"`. The seeker's application timeline (ApplicationTimeline component from P-2.6) shows a "Viewed by [Company Name]" entry with timestamp. The application card in "My Applications" shows a "Viewed" indicator badge.

5. **Outbox reliability & retry.** If the poller processes an event but delivery fails, the outbox record remains `pending` and is retried on the next poll cycle. A `retry_count` column tracks attempts (max 10 retries before marking as `failed`). Failed events are logged with structured JSON. A cleanup cron route purges processed events older than 7 days.

6. **Email notification.** The already-created `application-viewed.ts` email template is wired into the notification handler. The seeker receives a bilingual email via the routing pipeline (subject: "[Company] viewed your application for [Job Title]").

7. **Reserved flag removed.** The `reserved: true` flag on `portal.application.viewed` in the notification catalog is removed (or the `reserved` property deleted), since the handler is now active.

8. **Tests pass.** All portal, config, and db tests pass with no regressions. All new functionality is covered by unit tests.

---

## Validation Scenarios (SN-2 — REQUIRED)

1. **First employer view creates outbox event** — Employer opens CandidateSidePanel, waits 2+ seconds.
   - Expected outcome: `portal_application_views` row created, `portal_outbox` row with status `pending` created, `portal_applications.viewed_at` set — all in one transaction.
   - Evidence required: Service/route test verifying transaction + 200 response.

2. **Duplicate view returns 204, no new outbox event** — Same employer views same application again.
   - Expected outcome: 204 response, no new outbox row, `viewed_at` updated.
   - Evidence required: Route test verifying 204 + asserting no outbox insert.

3. **Poller picks up pending event and dispatches notification** — Outbox row with `pending` status exists.
   - Expected outcome: Poller processes row, calls `dispatchNotification()` with correct payload, updates status to `processed`.
   - Evidence required: Poller service unit test with mocked DB + dispatchNotification.

4. **Seeker receives warm notification toast** — Poller dispatches `portal.application.viewed` notification.
   - Expected outcome: In-app notification with warm animation (CSS glow/pulse) appears in seeker's browser via Socket.IO.
   - Evidence required: Component test for warm animation class on viewed event type.

5. **Application timeline shows "Viewed by [Company]" entry** — Seeker views application detail after employer viewed.
   - Expected outcome: Timeline includes a "Viewed by [Company Name]" entry with timestamp, distinct from status transitions.
   - Evidence required: Component test for ApplicationTimeline with viewedBy entry.

6. **Application card shows "Viewed" badge** — Seeker views "My Applications" list after employer viewed.
   - Expected outcome: Application card displays a "Viewed" badge indicator.
   - Evidence required: Component/page test verifying badge presence when `viewedAt` is set.

7. **Dwell threshold prevents accidental views** — Employer opens side panel for <2 seconds.
   - Expected outcome: No POST request sent to viewed API.
   - Evidence required: Component test verifying timer cleanup on panel close before 2s.

8. **Retry logic on poller failure** — Poller processes an event but `dispatchNotification()` throws.
   - Expected outcome: `retry_count` incremented, status remains `pending`. After 10 failures, status set to `failed`.
   - Evidence required: Poller service unit test.

9. **Cleanup route purges old processed events** — Processed events older than 7 days exist.
   - Expected outcome: Cleanup route deletes them, returns count.
   - Evidence required: Route test.

10. **403 for non-employer viewing** — A seeker attempts to POST to the viewed API.
    - Expected outcome: 403 Forbidden.
    - Evidence required: Route test.

---

## Tasks / Subtasks

- [x] Task 1: Database migration 0076 (AC: #1, #2, #5)
  - [x] 1.1 Create SQL migration `packages/db/src/migrations/0076_application_viewed_outbox.sql`
  - [x] 1.2 Add journal entry to `_journal.json` (idx: 76, tag: "0076_application_viewed_outbox")
  - [x] 1.3 Create Drizzle schema file `packages/db/src/schema/portal-outbox.ts` — `portalOutbox` table + `portalApplicationViews` table + types
  - [x] 1.4 Add `viewed_at` column to `portalApplications` in `packages/db/src/schema/portal-applications.ts`
  - [x] 1.5 Import new schema in `packages/db/src/index.ts` with `import * as portalOutboxSchema`
  - [x] 1.6 Run `pnpm --filter @igbo/db build` after schema changes

- [x] Task 2: DB queries (AC: #1, #2, #3, #5)
  - [x] 2.1 Create `packages/db/src/queries/portal-outbox.ts` with all 5 query functions
  - [x] 2.2 Create `packages/db/src/queries/portal-application-views.ts` with 3 query functions
  - [x] 2.3 Export new query functions from `packages/db/src/index.ts`
  - [x] 2.4 Write query tests: 6 outbox tests + 5 view tests (1272 db tests pass)
  - [x] 2.5 Run `pnpm --filter @igbo/db build`

- [x] Task 3: Application view recording service + API route (AC: #1, #2)
  - [x] 3.1 Create `apps/portal/src/services/application-view-service.ts`
  - [x] 3.2 Create `POST /api/v1/applications/[applicationId]/viewed/route.ts` with CSRF headers, 200/204/401/403/404 responses
  - [x] 3.3 Write service tests (~6 tests)
  - [x] 3.4 Write route tests (8 tests)

- [x] Task 4: Outbox poller service (AC: #3, #5)
  - [x] 4.1 Create `apps/portal/src/services/outbox-poller.ts` with processOutboxBatch, processApplicationViewedEvent, startOutboxPoller, re-export cleanupProcessedOutboxEvents
  - [x] 4.2 Create `POST /api/v1/internal/outbox/process` route (skipCsrf: true, requireInternalAuth)
  - [x] 4.3 Create `POST /api/v1/internal/outbox/cleanup` route
  - [x] 4.4 Write poller service tests (~15 tests)
  - [x] 4.5 Write route tests (4 + 3 tests); unauthorized tests use rejects.toThrow() pattern (withApiHandler mocked)

- [x] Task 5: Notification handler for application.viewed (AC: #4, #6, #7)
  - [x] 5.1 Poller calls dispatchNotification() directly with full DispatchOptions (dedupKey no TTL)
  - [x] 5.2 application-viewed.ts template already wired in email/index.ts — no additional wiring needed
  - [x] 5.3 Removed `reserved: true` from `portal.application.viewed` in `packages/config/src/notifications.ts`
  - [x] 5.4 Added `ApplicationViewedEvent` interface to `packages/config/src/events.ts`
  - [x] 5.5 Write dispatch contract tests in `outbox-poller-dispatch.test.ts` (exact DispatchOptions shape, en+ig email templates, reserved-flag drift guard)

- [x] Task 6: Client-side dwell detection (AC: #1, #4, #7)
  - [x] 6.1 Created `apps/portal/src/hooks/use-view-tracking.ts` (2s timer, 5s debounce, employer-only, silent failure)
  - [x] 6.2 Integrated `useViewTracking` into `CandidateSidePanel` component
  - [x] 6.3 Write hook tests (7 tests using vi.useFakeTimers())

- [x] Task 7: Seeker-side UI updates (AC: #4)
  - [x] 7.1 Added `@keyframes warm-glow` + `.animate-warm-glow` to `globals.css`; extended `use-notification-toast.ts` to apply class on `portal.application.viewed` eventType
  - [x] 7.2 Extended `ApplicationTimeline` with `viewedBy?` prop, chronological sort, Eye icon amber styling
  - [x] 7.3 Updated seeker application detail page to pass `viewedBy` data to ApplicationTimeline
  - [x] 7.4 Updated seeker application list page with amber "Viewed" badge when `viewedAt` set
  - [x] 7.5 Extended `getApplicationsWithJobDataBySeekerId` and `getApplicationDetailForSeeker` to include `viewedAt`
  - [x] 7.6 Write component tests: 2 warm-glow toast tests, 8 ApplicationTimeline tests, 3 badge tests in list page, 2 viewedBy passthrough tests in detail page

- [x] Task 8: i18n keys (AC: #4)
  - [x] 8.1 Added 9 `Portal.viewed.*` keys to `en.json` (badge, timelineEntry, toastTitle, toastBody, notificationTitle, notificationBody, emailSubject, timelineAriaLabel, viewedAtLabel)
  - [x] 8.2 Added matching Igbo translations to `ig.json`

### Review Findings

- [x] [Review][Decision] D1: `FOR UPDATE SKIP LOCKED` outside transaction — FIXED: atomic claim via `UPDATE SET status='processing' RETURNING` [portal-outbox.ts]
- [ ] [Review][Decision] D2: SN-6 runtime verification evidence empty for scenarios 1–7 (HIGH) — action item: complete browser verification before marking done
- [x] [Review][Patch] P1: SQL interval type error in `cleanupProcessedOutboxEvents` — FIXED: `interval '1 day' * ${olderThanDays}` [portal-outbox.ts]
- [x] [Review][Patch] P2: Hardcoded English notification content for in-app/push — FIXED: server-side VIEWED_STRINGS map with en/ig locale [outbox-poller.ts]
- [x] [Review][Patch] P3: `incrementOutboxRetryCount` uses stale client-side count — FIXED: atomic SQL `retry_count = retry_count + 1` with CASE [portal-outbox.ts]
- [x] [Review][Patch] P4: Drizzle schema missing composite PK for `portalApplicationViews` — FIXED: added `primaryKey()` [portal-outbox.ts]
- [x] [Review][Patch] P5: ApplicationTimeline test rewrite dropped existing coverage — FIXED: restored actor role, aria-current, initial submission tests (+5 tests) [application-timeline.test.tsx]
- [x] [Review][Patch] P6: `setInterval` can overlap in `startOutboxPoller` — FIXED: recursive `setTimeout` [outbox-poller.ts]
- [x] [Review][Patch] P7: Unused import `enqueueEmailJob` — FIXED: removed [outbox-poller.ts]
- [x] [Review][Patch] P8: Missing `updatedAt` when setting `viewedAt` — FIXED: added to `.set()` call [application-view-service.ts]
- [x] [Review][Defer] W1: Failed outbox events never cleaned up — deferred, future admin tooling
- [x] [Review][Defer] W2: No retry backoff for poison events — deferred, bounded by MAX_RETRIES
- [x] [Review][Defer] W3: `portal_outbox.status` VARCHAR not CHECK/enum — deferred, follow-up migration
- [x] [Review][Defer] W4: No index on `employer_user_id` in `portal_application_views` — deferred, pre-existing pattern

- [x] Task 9: Definition of Done
  - [x] 9.1 `pnpm turbo typecheck` — all packages pass, 0 errors
  - [x] 9.2 `pnpm --filter @igbo/db build` — run after Task 1 and Task 2
  - [x] 9.3 reserved flag removed from `portal.application.viewed` in notifications.ts
  - [x] 9.4 `cd apps/portal && pnpm test` — 3845/3845 pass
  - [x] 9.5 Community not affected (outbox bypasses EventBus)
  - [x] 9.6 Migration `0076` applied, journal entry idx 76 added
  - [x] 9.7 `reserved: true` removed from `portal.application.viewed`
  - [ ] 9.8 **SN-6 smoke test** — requires running browser (developer must verify)

---

## Runtime Smoke Test (SN-6 — REQUIRED)

### Smoke Test Checklist

- [ ] App started locally and accessible in browser
- [ ] Verified as a real authenticated user (where the story requires auth) — not mocked session, not direct URL bypass
- [ ] **Every SN-2 validation scenario** verified in running app (one row per scenario in table below)
- [ ] Evidence documented below (screenshots preferred, descriptions accepted)
- [ ] Any runtime bugs discovered are fixed, retested, and re-verified before moving to review
- [ ] **OR** \[N/A\] — this story has no observable runtime effect (pure refactor, tooling-only, docs-only). Justification: _______

### Runtime Verification Evidence

> **SN-2 ↔ SN-6 Linkage:** Every validation scenario listed above MUST have a corresponding row in this table. No scenario may be left unverified without an explicit N/A justification. **"What Was Observed" must be a descriptive sentence** — single-word entries (PASS, OK, ✅) are not accepted as evidence.

<!-- Delete the example row below and add one row per SN-2 scenario. The example row does not count as evidence. -->

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| 1. First employer view creates outbox event | | | | |
| 2. Duplicate view returns 204 | | | | |
| 3. Poller picks up pending event | | | | |
| 4. Seeker receives warm notification toast | | | | |
| 5. Application timeline shows "Viewed" | | | | |
| 6. Application card shows "Viewed" badge | | | | |
| 7. Dwell threshold prevents accidental views | | | | |
| 8. Retry logic on poller failure | N/A | — | Server-side retry logic; verified by poller service unit tests | |
| 9. Cleanup route purges old events | N/A | — | Internal route; verified by route test | |
| 10. 403 for non-employer viewing | N/A | — | Auth guard; verified by route test | |

### Implementer Sign-Off

- [ ] I have personally verified every SN-2 scenario in a running browser (or documented N/A justification above)

---

## Dev Notes

### Architecture Overview — Outbox Pattern

This story implements the **transactional outbox pattern** for at-least-once delivery of the "Viewed by Employer" signal. This is architecturally distinct from all other portal notifications which use the EventBus (at-most-once, fire-and-forget). The outbox guarantees:

1. **Same-transaction atomicity** — `viewed_at` update + outbox INSERT in one DB transaction. If the web server crashes between the two, both roll back.
2. **Poller-based delivery** — a 1-second polling loop reads pending events with `FOR UPDATE SKIP LOCKED` (concurrent-poller safe).
3. **Retry with backoff** — failed events stay `pending` and are retried. After 10 failures → `failed` + logged.

**The outbox does NOT use the EventBus.** The poller calls `dispatchNotification()` directly, which routes through the existing 5-step pipeline (resolve preferences → priority rules → quiet hours → throttle → channel dispatch).

[Source: _bmad-output/planning-artifacts/architecture.md — "Viewed by Employer" Delivery: PostgreSQL Outbox + 1-Second Poller]

### What Already Exists (DO NOT recreate)

- **`portal.application.viewed` event type** — Defined in `packages/config/src/notifications.ts` (line 267). Priority: high. Default channels: all ON. Has `reserved: true` flag (remove in this story).
- **`application-viewed.ts` email template** — At `apps/portal/src/templates/email/application-viewed.ts`. Bilingual (en + ig). NOT wired to any handler yet (comment says "will be wired via outbox pattern in Story 6.5"). Tests already exist in `email-templates.test.ts`.
- **5-step routing pipeline** — `dispatchNotification()` in `apps/portal/src/services/notification-router.ts`. Handles preferences, priority rules, quiet hours, throttle, channel dispatch.
- **`CandidateSidePanel`** — At `apps/portal/src/components/domain/candidate-side-panel.tsx`. Employer-facing Sheet (side panel) with profile/trust/CV/timeline/notes sections. This is where the 2s dwell timer will be integrated.
- **`ApplicationTimeline`** — At `apps/portal/src/components/domain/application-timeline.tsx`. Custom `<ol>` vertical timeline with dot markers. Currently only shows status transitions — needs extension for "Viewed by" entries.
- **Seeker application detail page** — At `apps/portal/src/app/[locale]/(gated)/applications/[applicationId]/page.tsx`. Server component, queries `getApplicationDetailForSeeker`.
- **Seeker application list page** — At `apps/portal/src/app/[locale]/(gated)/applications/page.tsx`. Shows application cards with `ApplicationStatusBadge`.
- **`NotificationToastProvider`** — From P-6.3. Renders in-app toasts. Needs conditional warm animation class for viewed events.
- **`withHandlerGuard`** — From AI-29 at `@igbo/config/handler-guard`. Use for poller error handling.
- **Email job pattern** — `enqueueEmailJob(name, payload)` in `apps/portal/src/services/email-service.ts`. Follow existing `application-submitted` email job pattern.

### Database Schema — 3 Changes in Migration 0076

**1. ALTER `portal_applications`:**
```sql
ALTER TABLE portal_applications ADD COLUMN viewed_at TIMESTAMPTZ;
```
No default — null means "not yet viewed."

**Authoritative source note:** `portal_application_views` is the source of truth for whether a view occurred (composite PK enforces dedup). `portal_applications.viewed_at` is a denormalized read convenience — it exists so the seeker list and detail pages can include view status in a single JOIN without querying `portal_application_views` separately. These two must stay in sync: `viewed_at` is ONLY set inside the same transaction as the `portal_application_views` insert. No code should set `viewed_at` without also inserting into `portal_application_views`.

**2. CREATE `portal_application_views` (dedup table):**
```sql
CREATE TABLE portal_application_views (
  application_id UUID NOT NULL REFERENCES portal_applications(id) ON DELETE CASCADE,
  employer_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, employer_user_id)
);
```
Composite PK acts as unique constraint for idempotency.

**3. CREATE `portal_outbox`:**
```sql
CREATE TABLE portal_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_portal_outbox_pending ON portal_outbox (status, created_at) WHERE status = 'pending';
```

**Note on architecture naming:** The architecture doc references `job_event_outbox` but the implementation should use `portal_outbox` to follow the `portal_` prefix convention for all portal-specific tables. The outbox is generic enough to handle future portal events beyond just application views.

### Drizzle Schema Files

**`packages/db/src/schema/portal-outbox.ts`:**
```typescript
import "server-only";
import { pgTable, uuid, varchar, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

export const portalOutbox = pgTable("portal_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export type PortalOutboxEvent = typeof portalOutbox.$inferSelect;
export type NewPortalOutboxEvent = typeof portalOutbox.$inferInsert;
```

**`portal_application_views` can go in the same file or in `portal-applications.ts`.**

### `fetchPendingOutboxEvents` — Raw SQL Required

Drizzle ORM does NOT support `FOR UPDATE SKIP LOCKED`. Use `db.execute()`:
```typescript
export async function fetchPendingOutboxEvents(limit = 100): Promise<PortalOutboxEvent[]> {
  const rows = await db.execute(sql`
    SELECT id, event_type, payload, status, retry_count, created_at, processed_at
    FROM portal_outbox
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  `);
  return Array.from(rows) as PortalOutboxEvent[];
}
```

**Important:** `db.execute()` returns raw rows (not `{ rows: [...] }`). Use `Array.from(rows)` directly. Column names from raw SQL are snake_case — **decision: map to camelCase inside `fetchPendingOutboxEvents` before returning**, so all consumers (the poller) work with camelCase `PortalOutboxEvent` type. Map explicitly: `{ id: row.id, eventType: row.event_type, payload: row.payload, status: row.status, retryCount: row.retry_count, createdAt: row.created_at, processedAt: row.processed_at }`. Do NOT let snake_case leak into the poller — it makes mock payloads in tests ambiguous.

### Transaction Pattern for View Recording

```typescript
// application-view-service.ts
export async function recordApplicationView(
  applicationId: string,
  employerUserId: string,
): Promise<{ isFirstView: boolean }> {
  // 1. Look up application to get jobId, seekerUserId, verify employer authorization
  const application = await getApplicationWithJob(applicationId);
  if (!application) throw new ApiError(404, "Application not found");
  // ... verify employer owns the company that owns the job

  return db.transaction(async (tx) => {
    // 2. Insert into dedup table (ON CONFLICT DO NOTHING)
    const { isFirstView } = await recordApplicationViewRow(tx, applicationId, employerUserId);

    if (isFirstView) {
      // 3. Update viewed_at on the application
      await tx.update(portalApplications)
        .set({ viewedAt: new Date() })
        .where(eq(portalApplications.id, applicationId));

      // 4. Insert outbox event — SAME TRANSACTION
      await insertOutboxEvent(tx, "portal.application.viewed", {
        applicationId,
        jobId: application.jobId,
        seekerUserId: application.seekerUserId,
        employerUserId,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Duplicate view — just update viewed_at (no outbox)
      await tx.update(portalApplications)
        .set({ viewedAt: new Date() })
        .where(eq(portalApplications.id, applicationId));
    }

    return { isFirstView };
  });
}
```

**200 vs 204 contract:** The service returns `{ isFirstView: boolean }`. The route reads this and sets the response status:
- `isFirstView === true` → `return NextResponse.json({ ok: true }, { status: 200 })`
- `isFirstView === false` → `return new NextResponse(null, { status: 204 })`

This is the only correct pattern — the route must NOT guess; it must read from the service return value.

### Employer Authorization Check

The employer must own the company that owns the job posting for this application. Pattern:
1. `requireAuthenticatedSession()` — ensures authenticated
2. Check `session.user.activePortalRole === "EMPLOYER"` — must be employer
3. Look up `portal_applications.jobId → portal_job_postings.companyId → portal_company_profiles.userId` — must match `session.user.id`

Follow the existing pattern in `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts` which performs similar authorization.

### Outbox Poller — Development vs. Production

**Development (this story):**
- The primary dev mechanism is the internal API route `POST /api/v1/internal/outbox/process` (single batch execution, call manually or via external script/cron).
- **Do NOT use `setInterval` as the primary dev polling mechanism.** Next.js HMR can create multiple intervals if the `globalThis.__outboxPollerStarted` guard isn't reliably cleaned up, leading to duplicate dispatches. If `startOutboxPoller()` is wired into `instrumentation.ts`, set the interval to a minimum of 30 seconds in dev (`process.env.NODE_ENV === "development" ? 30000 : 1000`), or guard it behind a flag that defaults off in dev.
- The `startOutboxPoller()` function exists for use in the standalone production process. The HMR guard (`globalThis.__outboxPollerStarted`) is still required even in dev to handle fast-refresh loops.

**Production (future — NOT in this story):**
- Standalone Node process (`apps/portal/scripts/outbox-poller.ts`) running `startOutboxPoller(1000)`.
- Deployed as separate container (`Dockerfile.poller`).
- Document this deployment requirement in the story completion notes.

**Concurrency note:** `FOR UPDATE SKIP LOCKED` makes the poller safe for concurrent invocations. If two processes (or two rapid cron calls in dev) run simultaneously, they will each claim different rows and not double-process the same event. This is the correct behavior and should be documented, not worked around.

### Notification Content for "Viewed" Events

```typescript
// In outbox-poller.ts, when processing 'portal.application.viewed' events:
const payload = event.payload as {
  applicationId: string;
  jobId: string;
  seekerUserId: string;
  employerUserId: string;
  timestamp: string;
};

// Look up names for notification content
// NOTE: "getCompanyForJob" is not a named export in the codebase. Use the pattern:
//   1. getJobPostingById(payload.jobId) → get companyId from the posting
//   2. getCompanyProfileById(companyId) → get company name
// OR: add a new helper query getCompanyByJobId(jobId) in portal-job-postings.ts that does the JOIN.
// Task 2 does NOT list this query — add it if the inline lookup chain is too verbose.
const [seekerUser, job] = await Promise.all([
  findUserById(payload.seekerUserId),
  getJobPostingById(payload.jobId),
]);
const company = job?.companyId ? await getCompanyProfileById(job.companyId) : null;

const content: NotificationContent = {
  title: t("Portal.viewed.toastTitle", { companyName: company?.name ?? "An employer" }),
  body: t("Portal.viewed.toastBody", { jobTitle: job?.title ?? "your job" }),
  link: `/applications/${payload.applicationId}`,
};
```

**Note:** The poller runs server-side, so i18n must use the seeker's `languagePreference` (from user profile), not `useTranslations`. Use the server-side i18n pattern (import `getTranslations` from `next-intl/server` or build content strings directly).

### Client-Side Dwell Detection Hook

```typescript
// apps/portal/src/hooks/use-view-tracking.ts
"use client";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const DWELL_THRESHOLD_MS = 2000;
const DEBOUNCE_INTERVAL_MS = 5000;

export function useViewTracking(applicationId: string | null) {
  const { data: session, status } = useSession();
  const lastSentRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!applicationId) return;
    // Guard on both status AND role — do not fire while session is still loading
    if (status !== "authenticated") return;
    if (session?.user?.activePortalRole !== "EMPLOYER") return;

    const timer = setTimeout(async () => {
      const now = Date.now();
      const lastSent = lastSentRef.current[applicationId] ?? 0;
      if (now - lastSent < DEBOUNCE_INTERVAL_MS) return;

      lastSentRef.current[applicationId] = now;
      try {
        await fetch(`/api/v1/applications/${applicationId}/viewed`, {
          method: "POST",
        });
      } catch {
        // Silent failure — non-critical client action
      }
    }, DWELL_THRESHOLD_MS);

    return () => clearTimeout(timer);
  }, [applicationId, session?.user?.activePortalRole]);
}
```

### Warm Animation CSS

```css
/* In globals.css or a dedicated file */
@keyframes warm-glow {
  0% { background-color: transparent; box-shadow: none; }
  30% { background-color: rgba(212, 99, 31, 0.08); box-shadow: 0 0 12px rgba(212, 99, 31, 0.15); }
  70% { background-color: rgba(212, 99, 31, 0.08); box-shadow: 0 0 12px rgba(212, 99, 31, 0.15); }
  100% { background-color: transparent; box-shadow: none; }
}

.animate-warm-glow {
  animation: warm-glow 2.5s ease-in-out;
}
```

The orange (#D4631F) is the platform's brand color (used in email CTAs). In `NotificationToastProvider`, conditionally apply `animate-warm-glow` class when the incoming notification's `eventType === "portal.application.viewed"`.

### ApplicationTimeline Extension

The current `ApplicationTimeline` only renders `PortalApplicationTransition[]` entries. To add the "Viewed by" entry:

**Option A (recommended):** Add an optional `viewedBy` prop. Render it as a special entry after the last transition:
```typescript
interface ApplicationTimelineProps {
  transitions: PortalApplicationTransition[];
  viewedBy?: { companyName: string; viewedAt: string | Date } | null;
}
```

Render the viewed entry with an `Eye` icon (from lucide-react) and distinct styling. Position it chronologically in the timeline (sort by `createdAt` / `viewedAt`).

### Existing Query Extensions

The seeker queries need `viewed_at`:
- `getApplicationsWithJobDataBySeekerId` in `packages/db/src/queries/portal-applications.ts` — add `portalApplications.viewedAt` to the SELECT columns
- `getApplicationDetailForSeeker` — add `portalApplications.viewedAt` to the SELECT columns

Also need company name for the timeline entry:
- `getApplicationDetailForSeeker` already JOINs `portal_job_postings` — extend to also JOIN `portal_company_profiles` to get company name, or add a separate lookup

### API Route — URL Parameter Extraction

Per project convention, `withApiHandler` does NOT pass Next.js route params. Extract from URL:
```typescript
const applicationId = new URL(req.url).pathname.split("/").at(-2); // .../applications/{id}/viewed
```

### What is NOT in Scope (Prevent Scope Creep)

- **Standalone poller container / Dockerfile.poller** — Production deployment infra. This story creates the poller service code + internal API route. Standalone process is documented for future.
- **Digest integration** — Story 6.6. The "viewed" event is high-priority (instant), not digest.
- **Notification store migration** — Story 6.7. In-app notifications use the existing `platform_notifications` table via `createNotification()`.
- **Application.hired outbox event** — Architecture doc mentions this needs outbox too, but it's not in scope for P-6.5. Could be a follow-up.
- **LISTEN/NOTIFY** — Architecture explicitly chose polling over LISTEN/NOTIFY (poller survives connection drops). Do NOT implement LISTEN/NOTIFY.
- **Employer-side notification** — Only the seeker receives the "Viewed" notification. The employer sees no notification.

### Radix Switch / jsdom Polyfills

If any new component tests use shadcn/ui Switch, add the polyfills:
```typescript
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {} unobserve() {} disconnect() {}
  };
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});
```

### DB Mock Pattern for Transactions

When mocking `db.transaction` in tests:
```typescript
vi.mocked(db.transaction).mockImplementation(async (cb: any) => {
  return cb(db); // pass db as the "tx" argument
});
```
Use `any` for the callback type to avoid PgTransaction generic width issues (see MEMORY.md).

### Redis Key Convention

Use `createRedisKey` from `@igbo/config/redis` for all Redis keys:
- Outbox dedup: `createRedisKey("portal", "viewed-dedup", `${applicationId}:${employerUserId}`)` — NOT needed if using DB unique constraint (which we are). Redis NX dedup is optional but recommended as a fast-path check before hitting the DB.
- Notification dedup: `createRedisKey("portal", "notif-dedup", dedupKey)` — handled by `dispatchNotification()`'s existing pipeline.

### Test Run Commands

```bash
# DB package (after schema + exports)
cd packages/db && pnpm build

# Portal app
cd apps/portal && pnpm test

# Community app (check for regressions — outbox doesn't touch EventBus)
cd apps/community && pnpm test

# Config package (reserved flag removal)
cd packages/config && pnpm test

# Full typecheck
pnpm turbo typecheck
```

### Pre-Coding Checklist

Before writing any code, verify these in the actual source files:

1. **`portal_applications` has NO `viewed_at` column** — Read `packages/db/src/schema/portal-applications.ts` and confirm.
2. **No `portal_outbox` or `portal_application_views` tables exist** — Search schema dir.
3. **`portal.application.viewed` has `reserved: true`** — Read `packages/config/src/notifications.ts:267`.
4. **`application-viewed.ts` template exists and is unwired** — Read `apps/portal/src/templates/email/application-viewed.ts`.
5. **No `ApplicationViewedEvent` in events.ts** — Check `packages/config/src/events.ts` for the interface.
6. **`CandidateSidePanel` fetch pattern** — Read the component to understand how it fetches data (useEffect + fetch).
7. **Existing internal route pattern** — Find an existing `internal` API route (e.g., cron routes for suspensions, digest) to follow the auth pattern.
8. **Latest migration is 0075** — Check `_journal.json` last entry.
9. **`getApplicationDetailForSeeker` return shape** — Read the query to understand what columns are already included.
10. **`emailJob` pattern in notification-service.ts** — Read how existing handlers build emailJob payloads for `enqueueEmailJob`.

### Testing Gotchas Specific to This Story

**`vi.importActual` dependency chain (from P-6.4 lessons):**
If any test uses `vi.importActual` on a module that imports from `@igbo/db/queries/portal-application-views`, `@igbo/db/queries/portal-outbox`, or `@igbo/db/queries/portal-applications`, those query paths still go through the Vitest mock system. You MUST explicitly `vi.mock("@igbo/db/queries/portal-application-views", ...)` etc. in any such test file, otherwise the real DB function is called and hangs (no DB in test).

**HMR guard test false confidence:**
"Poller HMR guard prevents double-start" — do NOT call `vi.resetModules()` before the second `startOutboxPoller()` call in the HMR guard test. Resetting modules clears global state and you are no longer testing HMR behavior. The test must call `startOutboxPoller()` twice in the same module instance.

**Timer + fetch interaction in hook tests:**
Use `vi.useFakeTimers()`. Mock `fetch` to return the appropriate response. After advancing timers, always check `fetch` was called with the correct URL and method. Mock `console.error` in error path tests to suppress noise.

**`db.transaction` mock includes `db.execute` calls:**
The poller uses `db.execute()` for `fetchPendingOutboxEvents`. If your poller service test also mocks `db.transaction`, ensure the mock `tx` object (which is passed `db` by default) also has `execute` mocked — otherwise the raw SQL call will fail.

**Email template path:**
`apps/portal/src/templates/email/application-viewed.ts` — confirm this path in pre-coding checklist item 4 before writing wiring code.

### Project Structure Notes

- Migration: `packages/db/src/db/migrations/0076_application_viewed_outbox.sql`
- Schema: `packages/db/src/schema/portal-outbox.ts` (new), `portal-applications.ts` (modified)
- Queries: `packages/db/src/queries/portal-outbox.ts` (new), `portal-application-views.ts` (new), `portal-applications.ts` (modified)
- Service: `apps/portal/src/services/application-view-service.ts` (new), `outbox-poller.ts` (new)
- Routes: `apps/portal/src/app/api/v1/applications/[applicationId]/viewed/route.ts` (new), `apps/portal/src/app/api/v1/internal/outbox/process/route.ts` (new), `apps/portal/src/app/api/v1/internal/outbox/cleanup/route.ts` (new)
- Hook: `apps/portal/src/hooks/use-view-tracking.ts` (new)
- Components: `apps/portal/src/components/domain/application-timeline.tsx` (modified), `apps/portal/src/components/domain/candidate-side-panel.tsx` (modified)
- Config: `packages/config/src/notifications.ts` (modified — remove reserved), `packages/config/src/events.ts` (modified — add ApplicationViewedEvent)
- Styles: `apps/portal/src/app/globals.css` (modified — warm-glow animation)
- i18n: `apps/portal/messages/en.json` (modified), `apps/portal/messages/ig.json` (modified)
- Tests: co-located with source files

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — "Viewed by Employer" Delivery: PostgreSQL Outbox + 1-Second Poller (F-2, F-9)]
- [Source: _bmad-output/planning-artifacts/epics.md — Story P-6.5 acceptance criteria]
- [Source: apps/portal/src/services/notification-router.ts — 5-step dispatch pipeline, dispatchNotification()]
- [Source: apps/portal/src/services/notification-service.ts — existing EventBus handler patterns, withHandlerGuard usage]
- [Source: apps/portal/src/templates/email/application-viewed.ts — unwired bilingual email template]
- [Source: apps/portal/src/components/domain/candidate-side-panel.tsx — employer ATS detail panel]
- [Source: apps/portal/src/components/domain/application-timeline.tsx — seeker timeline component]
- [Source: apps/portal/src/app/[locale]/(gated)/applications/[applicationId]/page.tsx — seeker application detail page]
- [Source: packages/config/src/notifications.ts:267 — portal.application.viewed catalog entry (reserved: true)]
- [Source: packages/config/src/events.ts:227 — PortalEventMap (no application.viewed yet)]
- [Source: packages/db/src/schema/portal-applications.ts — no viewed_at column yet]
- [Source: docs/decisions/notification-pattern-assessment.md — outbox pattern decision]
- [Source: _bmad-output/implementation-artifacts/p-6-4-notification-preferences-priority-hierarchy.md — previous story context]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly. Key fixes during Task 9 validation:
- CSRF headers missing from viewed-route test requests (all returning 403); fixed by adding `Origin: "https://jobs.igbo.com"` + `Host: "jobs.igbo.com"` to `makeReq()`.
- Internal outbox route tests for 401 used `res.status` but `withApiHandler` is mocked to bypass error handling; fixed by using `rejects.toThrow()` pattern (matches existing internal route test convention).
- `successResponse({ ok: true }, 200)` — second arg is `PaginationMeta`, not status; fixed to `successResponse({ ok: true })` (200 is default).
- `factories.ts` `applicationFactory` missing `viewedAt: null` after schema change; added field.
- `use-view-tracking.test.ts` session mocks missing `update` property (next-auth/react SessionContextValue); fixed with `as any` casts.

### Completion Notes List

1. **Transactional outbox pattern implemented end-to-end.** `portal_application_views` (composite PK dedup) + `portal_outbox` (event queue) + `portal_applications.viewed_at` (denormalized read convenience) all maintained atomically in a single `db.transaction()`.
2. **`FOR UPDATE SKIP LOCKED` via raw SQL.** Drizzle ORM doesn't support this clause natively; used `db.execute(sql...)` with explicit snake_case to camelCase mapping inside `fetchPendingOutboxEvents`.
3. **Email template already wired.** `application-viewed.ts` was already imported in `apps/portal/src/templates/email/index.ts` from P-6.2 work; no additional email-service wiring needed.
4. **`reserved: true` removed.** `portal.application.viewed` in `packages/config/src/notifications.ts` now has no `reserved` property; drift guard test in `outbox-poller-dispatch.test.ts` will catch any future regression.
5. **Notification dedup: no TTL.** The Redis dedup key in `dispatchNotification()` is set with no TTL by design — one notification per application lifetime.
6. **HMR guard.** `globalThis.__outboxPollerStarted` prevents duplicate setInterval creation on Next.js hot-reloads.
7. **Production poller NOT wired to instrumentation.ts.** `startOutboxPoller()` exists but is not called from `instrumentation.ts` to avoid dev HMR issues. Primary dev mechanism is `POST /api/v1/internal/outbox/process`.
8. **Test counts: 3845 portal tests pass** (+62 vs 3783 before this story). DB: 1272 pass. All typechecks green.

### File List

**New files:**
- `packages/db/src/migrations/0076_application_viewed_outbox.sql`
- `packages/db/src/schema/portal-outbox.ts`
- `packages/db/src/queries/portal-outbox.ts`
- `packages/db/src/queries/portal-outbox.test.ts`
- `packages/db/src/queries/portal-application-views.ts`
- `packages/db/src/queries/portal-application-views.test.ts`
- `apps/portal/src/services/application-view-service.ts`
- `apps/portal/src/services/application-view-service.test.ts`
- `apps/portal/src/services/outbox-poller.ts`
- `apps/portal/src/services/outbox-poller.test.ts`
- `apps/portal/src/services/outbox-poller-dispatch.test.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/viewed/route.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/viewed/route.test.ts`
- `apps/portal/src/app/api/v1/internal/outbox/process/route.ts`
- `apps/portal/src/app/api/v1/internal/outbox/process/route.test.ts`
- `apps/portal/src/app/api/v1/internal/outbox/cleanup/route.ts`
- `apps/portal/src/app/api/v1/internal/outbox/cleanup/route.test.ts`
- `apps/portal/src/hooks/use-view-tracking.ts`
- `apps/portal/src/hooks/use-view-tracking.test.ts`

**Modified files:**
- `packages/db/src/migrations/meta/_journal.json` (added idx 76)
- `packages/db/src/schema/portal-applications.ts` (added `viewedAt`)
- `packages/db/src/index.ts` (imported portalOutboxSchema, exported new query functions)
- `packages/db/src/queries/portal-applications.ts` (added `viewedAt` to both seeker queries)
- `packages/config/src/notifications.ts` (removed `reserved: true` from portal.application.viewed)
- `packages/config/src/events.ts` (added ApplicationViewedEvent interface)
- `apps/portal/src/app/globals.css` (added @keyframes warm-glow + .animate-warm-glow)
- `apps/portal/src/hooks/use-notification-toast.ts` (animate-warm-glow on portal.application.viewed)
- `apps/portal/src/components/domain/application-timeline.tsx` (viewedBy prop, chronological sort, Eye icon)
- `apps/portal/src/components/domain/candidate-side-panel.tsx` (useViewTracking integration)
- `apps/portal/src/app/[locale]/(gated)/applications/[applicationId]/page.tsx` (pass viewedBy to ApplicationTimeline)
- `apps/portal/src/app/[locale]/(gated)/applications/[applicationId]/page.test.tsx` (viewedBy passthrough tests)
- `apps/portal/src/app/[locale]/(gated)/applications/page.tsx` (Viewed badge when viewedAt set)
- `apps/portal/src/app/[locale]/(gated)/applications/page.test.tsx` (badge tests)
- `apps/portal/src/hooks/use-notification-toast.test.ts` (warm-glow class tests)
- `apps/portal/src/test/factories.ts` (added viewedAt: null to applicationFactory)
- `apps/portal/messages/en.json` (9 Portal.viewed.* keys)
- `apps/portal/messages/ig.json` (9 Portal.viewed.* keys Igbo translations)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (p-6-5 status → review)
