# Story P-6.1A: Notification Event Types & Contracts

Status: done

<!-- Portal Epic 6, Story 1A. First story in the epic — establishes event catalog + priority tiers that all downstream 6.x stories depend on. No predecessors within Epic 6. Depends on: AI-28 (done — Zod validation at emit, portalEventSchemas, emittedBy enforcement), AI-29 (done — withHandlerGuard), AI-30 (done — idempotency rule), P-5.6 (done — notification-service with 5 handlers, push-service, publishNotificationCreated). -->

## Story

As a developer,
I want all portal notification event types defined with strict payload schemas and priority tier classification,
So that every downstream consumer (routing, delivery, digest, analytics) has a single source of truth for event structure.

## Acceptance Criteria

1. **Portal notification event catalog defined.** The following portal notification events are registered with typed payload schemas in `packages/config/src/events.ts`:

   | Event Type | Payload Fields |
   |---|---|
   | `portal.application.submitted` | applicationId, jobId, jobTitle, seekerUserId, seekerName, employerUserId, companyName, timestamp |
   | `portal.application.status_changed` | applicationId, jobId, jobTitle, fromStatus, toStatus, actorUserId, actorRole, timestamp |
   | `portal.application.viewed` | applicationId, jobId, jobTitle, seekerUserId, employerUserId, timestamp |
   | `portal.message.received` | conversationId, applicationId, jobTitle, senderUserId, senderName, messagePreview (50 chars), timestamp |
   | `portal.job.approved` | jobId, jobTitle, companyName, employerUserId, timestamp |
   | `portal.job.rejected` | jobId, jobTitle, companyName, employerUserId, reason, timestamp |
   | `portal.job.changes_requested` | jobId, jobTitle, companyName, employerUserId, requestedChanges, timestamp |
   | `portal.job.expired` | jobId, jobTitle, companyName, employerUserId, expiredAt, timestamp |
   | `portal.referral.status_changed` | referralId, jobId, jobTitle, referrerUserId, seekerName, newStatus, timestamp |
   | `portal.match.new_recommendations` | seekerUserId, jobIds[], matchScores[], timestamp |
   | `portal.saved_search.new_results` | savedSearchId, seekerUserId, searchName, newJobIds[], timestamp |

2. **Each event type has a TypeScript interface** exported from `packages/config/src/notifications.ts` (new `PortalNotificationEvent` interfaces, separate from the EventBus event types in `events.ts`).

3. **Zod validation schemas are NOT created in this story.** Existing EventBus events (`application.submitted`, `application.status_changed`, `portal.message.sent`, `job.reviewed`, `saved_search.new_result`, `job.expired`) already have Zod schemas in `portalEventSchemas` — those map to the notification catalog as-is. New notification-only events (`application.viewed`, `message.received`, `referral.status_changed`, `match.new_recommendations`) are NOT EventBus events yet — they become EventBus events (with Zod schemas) when their respective emitting stories are implemented (6.5, 6.1B, P-7.x, P-9.x). Do NOT add Zod schemas for these in this story.

4. **Priority tier classification.** Each notification event includes a priority tier:
   - **System-critical** (cannot be disabled by user): `application.submitted` (employer side), `job.rejected`
   - **High-priority** (default ON, user can disable): `application.status_changed`, `application.viewed`, `message.received`, `job.approved`, `job.changes_requested`, `job.expired`, `referral.status_changed`
   - **Low-priority** (default to digest): `match.new_recommendations`, `saved_search.new_results`
   > **Design rationale:** `application.viewed` was moved from system-critical to high-priority because "employer viewed your application" is informational, not operationally essential. System-critical tier is reserved for notifications with real financial/operational consequences (missing a candidate, posting rejection). Misclassifying informational events as non-disableable trains users to ignore the tier entirely.
   > **Note on `application.submitted` recipient context:** This event is system-critical for the EMPLOYER receiving it. The seeker's confirmation email is a separate delivery path (not a notification preference). Story 6.2 (preference UI) must ensure seekers are not shown a non-disableable "application submitted" toggle for their own actions — the catalog entry's priority applies to the employer recipient only.

5. **Priority tier is a constant registry** exported from `@igbo/config/notifications` — a `PORTAL_NOTIFICATION_CATALOG` map keyed by notification event type, with each entry containing: `priorityTier`, `defaultChannels` (inApp/push/email booleans), `description`.

6. **`eventType` field added to `NotificationCreatedEvent`** in `packages/config/src/events.ts` — downstream stories (6.3 toast management, 6.4 preference filtering) need clients to know the originating event type. The field type MUST be `PortalNotificationEventType` (not raw `string`) to ensure compile-time safety and autocomplete for downstream consumers. Optional (`?`) for backward compat with existing code that doesn't yet pass it.

7. **Shared event catalog enforced.** Any system component that emits or consumes a portal notification references the shared catalog — no inline event type strings or ad-hoc payloads. **No downstream 6.x story may define notification priority inline — all must reference `PORTAL_NOTIFICATION_CATALOG`.** This is an architectural enforcement rule, not just a suggestion.

8. **Dedup TTL note registered.** The current `NOTIF_DEDUP_TTL_SECONDS` (15 min) is documented as potentially needing extension for system-critical events (24h) in Story 6.1B. This story does NOT change the TTL — it registers the concern.

9. **Tests pass.** All portal, community, config, db tests pass with no regressions.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Notification catalog type-checks** — All 11 notification event interfaces compile without TypeScript errors. Each interface extends `BaseEvent` and includes the required payload fields from AC #1.
   - Expected outcome: `pnpm turbo typecheck` passes, 0 errors
   - Evidence required: Terminal output showing typecheck success

2. **Priority tier registry is complete** — `PORTAL_NOTIFICATION_CATALOG` contains all 11 event types with correct priority tier assignments matching AC #4.
   - Expected outcome: Unit test asserts catalog has exactly 11 entries; system-critical entries are exactly 2, high-priority are exactly 7, low-priority are exactly 2
   - Evidence required: Test output

3. **NotificationCreatedEvent includes eventType field** — Existing notification publish calls compile with the new `eventType` field.
   - Expected outcome: `NotificationCreatedEvent` interface in `packages/config/src/events.ts` includes `eventType?: PortalNotificationEventType`
   - Evidence required: Grep showing field in interface

4. **Existing notification handlers still work** — Portal tests pass with no regressions (notification-service.test.ts, push-service.test.ts).
   - Expected outcome: All existing tests pass
   - Evidence required: Test run output

5. ~~**STRUCK — Zod schemas NOT created for non-EventBus events.**~~ Originally called for Zod schema tests on `application.viewed` and `message.received`, but these are NOT EventBus events yet (per AC#3 and Dev Notes "Handler infrastructure" constraint). Zod schemas are deferred to the emitting stories (6.5, 6.1B). Creating schemas now would be premature coupling. Replaced by: **Priority tier mutual exclusivity verified** — for every event type in the catalog, exactly one of `isSystemCritical/isHighPriority/isLowPriority` returns true, and unknown event types return false for all three.
   - Expected outcome: Parameterized test passes for all 11 types + 1 unknown type
   - Evidence required: Test output

## Tasks / Subtasks

- [x] Task 1: Define notification event TypeScript interfaces (AC: #1, #2)
  - [x] 1.1 In `packages/config/src/notifications.ts`, add notification-specific interfaces for all 11 event types. These are the NOTIFICATION payload contracts (what the routing pipeline receives), distinct from the EventBus event types (which are the domain events triggering notifications).
  - [x] 1.2 For events that ALREADY exist as EventBus events (`ApplicationSubmittedEvent`, `ApplicationStatusChangedEvent`, `PortalMessageSentEvent`, `JobReviewedEvent`, `SavedSearchNewResultEvent`, `JobExpiredEvent`), create a notification-specific interface that extracts the user-facing fields. Do NOT duplicate the EventBus interfaces — the notification interface references the minimal fields needed by the routing pipeline.
  - [x] 1.3 For events that are NEW notification-only events (`portal.application.viewed`, `portal.message.received`, `portal.referral.status_changed`, `portal.match.new_recommendations`, `portal.saved_search.new_results`), create full interfaces. `portal.application.viewed` and `portal.referral.status_changed` are new domain events that will need EventBus schemas in 6.1B or 6.5.
  - [x] 1.4 Export all interfaces and a `PortalNotificationEventType` string literal union type.

- [x] Task 2: Create priority tier catalog (AC: #4, #5)
  - [x] 2.1 In `packages/config/src/notifications.ts`, define the `NotificationPriorityTier` type: `"system-critical" | "high" | "low"`
  - [x] 2.2 Define `PortalNotificationCatalogEntry` interface: `{ priorityTier: NotificationPriorityTier; defaultChannels: { inApp: boolean; push: boolean; email: boolean }; description: string; reserved?: boolean }` — `reserved: true` marks future events that have no emitter yet (prevents premature handler registration)
  - [x] 2.3 Export `PORTAL_NOTIFICATION_CATALOG: Record<PortalNotificationEventType, PortalNotificationCatalogEntry>` with all 11 entries and correct priority/channel assignments:
    - System-critical: `application.submitted` (employer) → inApp+push+email all ON, cannot disable
    - System-critical: `job.rejected` → inApp+push+email all ON, cannot disable
    - High: `application.status_changed` → inApp ON, push ON, email ON (user toggleable)
    - High: `application.viewed` → inApp ON, push ON, email ON (informational, user can disable)
    - High: `message.received` → inApp ON, push ON, email OFF (messages are time-sensitive)
    - High: `job.approved` → inApp ON, push ON, email ON
    - High: `job.changes_requested` → inApp ON, push ON, email ON
    - High: `job.expired` → inApp ON, push ON, email ON
    - High: `referral.status_changed` → inApp ON, push ON, email ON
    - Low: `match.new_recommendations` → inApp ON, push OFF, email digest-only
    - Low: `saved_search.new_results` → inApp ON, push OFF, email digest-only
    - reserved: true added for `portal.referral.status_changed` and `portal.match.new_recommendations` (future emitters P-9.x / P-7.x)
  - [x] 2.4 Export `isSystemCritical(eventType)`, `isHighPriority(eventType)`, `isLowPriority(eventType)` helper functions.

- [x] Task 3: Add `eventType` to `NotificationCreatedEvent` (AC: #6)
  - [x] 3.1 In `packages/config/src/events.ts`, add `eventType?: PortalNotificationEventType` to `NotificationCreatedEvent` interface (import type from `./notifications`). Optional for backward compat. Uses typed union not raw string.
  - [x] 3.2 Updated `publishNotificationCreated()` in `apps/portal/src/services/notification-service.ts` to accept 8th parameter `eventType?: PortalNotificationEventType`. Updated 3 handler call sites: `application.submitted` → `"portal.application.submitted"`, `saved_search.new_result` → `"portal.saved_search.new_results"`, `portal.message.sent` → `"portal.message.received"`. The `application.withdrawn` handler has no catalog entry (not in AC#1) so no eventType passed. Note: story's listed literals include `application.status_changed` and `job.approved` which have no current handlers yet — those will be wired in 6.1B/6.2.

- [x] Task 4: Register dedup TTL concern (AC: #8)
  - [x] 4.1 TODO comment added in both locations: (1) `packages/config/src/notifications.ts` as doc block above `PORTAL_NOTIFICATION_CATALOG`, (2) `apps/portal/src/services/notification-service.ts` next to `NOTIF_DEDUP_TTL_SECONDS`.

- [x] Task 5: Write tests (AC: #9)
  - [x] 5.1 Created `packages/config/src/notifications.test.ts` — 58 new tests covering: catalog completeness (11 entries), system-critical count (2), high-priority count (7), low-priority count (2), channel defaults, reserved flags, isSystemCritical/isHighPriority/isLowPriority helpers, mutual exclusivity (parameterized over all 11 types), unknown input boundary, runtime array completeness, TypeScript interface assertions for all 11 interfaces.
  - [x] 5.2 Updated `packages/config/src/events.test.ts` — 3 new tests asserting `eventType` field on `NotificationCreatedEvent` (presence, backward compat, typed union).
  - [x] 5.3 Updated `apps/portal/src/services/notification-service.test.ts` — 3 new tests asserting correct `eventType` literal in publish payload per handler: `portal.application.submitted`, `portal.saved_search.new_results`, `portal.message.received`.
  - [x] 5.4 `pnpm turbo test` — config: 164/164 ✓, portal: 3582/3582 ✓, all packages pass.

- [x] Task 6: Verify and finalize
  - [x] 6.1 `pnpm turbo typecheck` — all 7 packages pass, 0 errors.
  - [x] 6.2 `pnpm turbo test` — config: 164/164, portal: 3582/3582, no regressions.
  - [x] 6.3 Exports verified: `PORTAL_NOTIFICATION_CATALOG`, `PORTAL_NOTIFICATION_EVENT_TYPES`, `PortalNotificationEventType`, `NotificationPriorityTier`, `PortalNotificationCatalogEntry`, `isSystemCritical`, `isHighPriority`, `isLowPriority` all exported from `@igbo/config/notifications`.

### Review Findings

- [x] [Review][Defer] No `isKnownEventType()` guard — helpers accept `string`, unknown inputs silently return `false` for all tiers [packages/config/src/notifications.ts:315-329] — deferred, useful for 6.1B routing pipeline
- [x] [Review][Defer] `application.withdrawn` handler has no catalog entry despite producing notifications [apps/portal/src/services/notification-service.ts] — deferred, intentionally excluded per spec "Events NOT in this catalog" section; revisit if routing pipeline needs withdrawn classification
- [x] [Review][Defer] `publishNotificationCreated` has 8 positional string params — swap risk grows with future additions [apps/portal/src/services/notification-service.ts:35-59] — deferred, pre-existing pattern (was 7, now 8); consider named params object in 6.1B
- [x] [Review][Defer] Throttle INCR/EXPIRE non-atomicity — EXPIRE failure result never checked, permanent suppression possible [apps/portal/src/services/notification-service.ts:583-589] — deferred, pre-existing issue not introduced by this diff

## Runtime Smoke Test (SN-6 — REQUIRED)

### Smoke Test Checklist

- [x] **[N/A]** — this story has no observable runtime effect (type definitions, constants, and test-only changes). Justification: Story defines TypeScript interfaces, a constant catalog map, and helper functions — all consumed at compile time or by tests. No new API routes, no new UI, no migrations, no runtime behavior change. Existing notification handlers continue to work identically.

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| Notification catalog type-checks | Yes | N/A (CLI) | `pnpm turbo typecheck` — 7 tasks successful, 0 errors | None |
| Priority tier registry complete | Yes | N/A (CLI) | 164/164 config tests pass; catalog has exactly 11 entries, 2 system-critical, 7 high, 2 low | None |
| NotificationCreatedEvent eventType | Yes | N/A (CLI) | `eventType?: PortalNotificationEventType` field present in interface; 3 new events.test.ts tests pass | None |
| Existing handlers still work | Yes | N/A (CLI) | Portal 3582/3582 tests pass, no regressions | None |
| Priority tier mutual exclusivity | Yes | N/A (CLI) | Parameterized `it.each` test passes for all 11 event types | None |

### Implementer Sign-Off

- [x] I have personally verified every SN-2 scenario in a running browser (or documented N/A justification above)

## Dev Notes

### Architecture Overview

This story creates the **notification event catalog** — the single source of truth for all portal notification event types, their payload shapes, and their priority classification. It does NOT create the routing pipeline (6.1B), notification store (6.7), or delivery handlers (6.2/6.3). It defines the CONTRACTS that all downstream stories consume.

**Key distinction: EventBus events vs Notification events.**

- **EventBus events** (in `events.ts`): Domain events like `ApplicationSubmittedEvent`. These are emitted by services when business actions occur. They have full context (all entity IDs, metadata, `emittedBy`).
- **Notification events** (in `notifications.ts`): User-facing notification payloads derived FROM EventBus events. These carry only the fields needed by the routing pipeline and channel adapters (title-relevant fields, recipient info). The notification handler in 6.1B will MAP from EventBus event → notification event.

**Do NOT merge these two concepts.** The EventBus `ApplicationSubmittedEvent` includes `companyId`, `seekerUserId`, etc. for domain processing. The notification `portal.application.submitted` needs `jobTitle`, `seekerName`, `companyName` for human-readable notification text. Different shapes, different purposes.

### What Already Exists (Do NOT Re-create)

- **EventBus event types**: 23 portal events with Zod schemas in `packages/config/src/events.ts` (AI-28). These stay as-is.
- **`portalEventSchemas`**: Zod validation map for all 20 EventBus events. New notification-only events (`application.viewed`, `message.received`, `referral.status_changed`, `match.new_recommendations`, `saved_search.new_results`) are NOT EventBus events yet — they become EventBus events when their respective stories (6.5, 6.1B) implement the emission.
- **`BaseEvent`** interface with `eventId`, `version`, `timestamp`, `emittedBy?`, `idempotencyKey?`.
- **`NotificationCreatedEvent`** interface: `notificationId`, `userId`, `type`, `title`, `body`, `link?`. Add `eventType?: PortalNotificationEventType` field.
- **`NOTIFICATION_TYPES`** constant and `DEFAULT_PREFERENCES` in `notifications.ts` — these are community notification types. Portal catalog is separate.
- **5 existing notification handlers** in `apps/portal/src/services/notification-service.ts`:
  1. `application.submitted` → employer in-app + seeker email
  2. `application.withdrawn` → employer in-app
  3. `saved_search.new_result` → seeker in-app
  4. `job.reviewed` → triggers `checkInstantAlerts()`
  5. `portal.message.sent` → recipient in-app + push (with 30s throttle)

### Notification-to-EventBus Mapping

Several notification event types map directly to existing EventBus events:

| Notification Event | Existing EventBus Event | Mapping |
|---|---|---|
| `portal.application.submitted` | `ApplicationSubmittedEvent` | Direct — extract jobTitle via DB lookup in handler |
| `portal.application.status_changed` | `ApplicationStatusChangedEvent` | Direct — includes jobId; handler resolves jobTitle |
| `portal.message.received` | `PortalMessageSentEvent` | Rename mapping — `senderUserId` = `senderId`, `messagePreview` = `content.slice(0,50)` |
| `portal.job.approved` | `JobReviewedEvent` (decision="approved") | Filter — only when `decision === "approved"` |
| `portal.job.rejected` | `JobReviewedEvent` (decision="rejected") | Filter — only when `decision === "rejected"` |
| `portal.job.changes_requested` | `JobReviewedEvent` (decision="changes_requested") | Filter — `requestedChanges` maps from reviewer notes in the review record |
| `portal.job.expired` | `JobExpiredEvent` | Direct |
| `portal.saved_search.new_results` | `SavedSearchNewResultEvent` | Aggregate — batch `newJobIds[]` |

New events with no existing EventBus equivalent:
| Notification Event | Introducing Story |
|---|---|
| `portal.application.viewed` | 6.5 (outbox pattern) |
| `portal.referral.status_changed` | P-9.x (future epic) |
| `portal.match.new_recommendations` | P-7.x (future epic) |

### `messagePreview` truncation policy

The `portal.message.received` notification interface specifies `messagePreview` at 50 chars. This is a CONTRACT-LEVEL truncation — the field name signals that content is already truncated before entering the routing pipeline. The notification handler (6.1B) performs the `content.slice(0, 50)` truncation when mapping from `PortalMessageSentEvent` → notification event. Downstream consumers (toast, email templates) should NOT re-truncate. If future UX needs longer previews, bump the contract (not the render layer).

### Events NOT in this catalog (future consideration)

The following events were considered but intentionally excluded from the 6.1A catalog:
- **`portal.job.filled`** → applicant notification ("the job you applied for has been filled"). This depends on the `filled` terminal state from PREP-A and will be added when the "filled" status transition emits an event. Track in Epic 6 backlog.
- **`portal.application.withdrawn.seeker_confirmation`** → seeker confirmation of their own withdrawal. Currently handled as UI-only feedback (immediate response to user action). If email confirmation is needed, add to catalog in a future story.

### Critical: `portal.referral.status_changed` and `portal.match.new_recommendations` are FUTURE events

These events have no emitters today (Portal Epic 7 and 9 are backlog). Define the interfaces and catalog entries NOW so the contract is established, but do NOT create EventBus schemas, Zod validation, or handlers for them. They exist in the catalog for completeness and to inform Story 6.4 (preferences UI).

### Pattern Assessment Constraints (from `docs/decisions/notification-pattern-assessment.md`)

The notification pattern assessment is a BINDING document for Epic 6. Key constraints affecting this story:

1. **Schema ownership**: Epic 6 creates `portal_notifications` (NOT extend `platform_notifications`). This story doesn't create the table but the notification interfaces should align with the future `portal_notifications` schema fields.
2. **`eventType` field on `NotificationCreatedEvent`**: Required by 6.3 (toast management) and 6.4 (preference filtering). Add it in this story.
3. **Priority tier informs dedup TTL**: System-critical events may need longer dedup TTL (24h vs 15min). Register the concern but do NOT change `NOTIF_DEDUP_TTL_SECONDS`.
4. **Handler infrastructure (Pattern 7)**: New event types must be added to `portalEventSchemas` with `emittedBy` required. For events that are future (application.viewed, referral, match), defer Zod schema creation until the emitting story.

### Existing `@igbo/config/notifications.ts` Content

This file already exports:
- `NOTIFICATION_TYPES` — 7 community notification type strings
- `NotificationTypeKey` — union of community types
- `ChannelPrefs` — per-type channel preference interface
- `DEFAULT_PREFERENCES` — community default prefs per type

Add the portal notification catalog ALONGSIDE these exports. Use clear naming: `PORTAL_NOTIFICATION_CATALOG` (not `NOTIFICATION_CATALOG`) to avoid confusion with the community constants.

### Files to Modify

| File | Change |
|------|--------|
| `packages/config/src/notifications.ts` | Add: `PortalNotificationEventType`, `NotificationPriorityTier`, `PortalNotificationCatalogEntry`, `PORTAL_NOTIFICATION_CATALOG`, 11 notification event interfaces, `isSystemCritical/isHighPriority/isLowPriority` helpers |
| `packages/config/src/events.ts` | Add `eventType?: PortalNotificationEventType` to `NotificationCreatedEvent` (import from `./notifications`) |
| `apps/portal/src/services/notification-service.ts` | Update 5 `publishNotificationCreated()` calls to include `eventType` field |
| `apps/portal/src/services/notification-service.test.ts` | Update tests to assert `eventType` in publish payloads |
| `packages/config/src/notifications.test.ts` | New tests for catalog completeness, priority tiers, helpers |

### Files NOT to Touch

- `packages/config/src/events.ts` (beyond adding `eventType` to `NotificationCreatedEvent`) — do NOT add new EventBus events for future notification types
- `packages/db/src/schema/*` — no migrations in this story
- `apps/portal/src/services/push-service.ts` — no push changes
- `apps/community/*` — no community changes
- `apps/portal/src/services/email-service.ts` — no email changes

### Testing Standards

- Tests co-located with source: `packages/config/src/notifications.test.ts`
- Use `@vitest-environment node` for server-side test files
- Run `cd packages/config && pnpm test` (NOT `pnpm --filter @igbo/config test run` — double-runs vitest)
- Existing test count: config 106, portal 3579(+9 skipped), community 4444, db 1256

### Project Structure Notes

- Portal notification catalog lives in `@igbo/config/notifications` (shared package) — not in `apps/portal/` — because the routing pipeline (6.1B) in the portal app AND the eventbus-bridge in the realtime container both need to reference priority tiers
- Import path: `import { PORTAL_NOTIFICATION_CATALOG, isSystemCritical } from "@igbo/config/notifications"`
- Barrel export in `packages/config/src/index.ts` already re-exports from `notifications.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1A — Acceptance criteria]
- [Source: docs/decisions/notification-pattern-assessment.md — Pattern assessments + gap analysis + architectural decisions]
- [Source: _bmad-output/implementation-artifacts/portal-epic-5-architecture-diagram.md — Cross-container architecture]
- [Source: _bmad-output/implementation-artifacts/p-5-6-message-notifications-integration.md — Previous story learnings]
- [Source: _bmad-output/implementation-artifacts/portal-epic-5-ai-28-eventbus-payload-validation-ownership.md — Zod validation at emit]
- [Source: packages/config/src/events.ts — 23 EventBus event types + portalEventSchemas]
- [Source: packages/config/src/notifications.ts — Community NOTIFICATION_TYPES + DEFAULT_PREFERENCES]
- [Source: apps/portal/src/services/notification-service.ts — 5 existing handlers + publishNotificationCreated()]
- [Source: packages/config/src/handler-guard.ts — withHandlerGuard pattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2025-10-22)

### Debug Log References

None — implementation proceeded cleanly without blockers.

### Completion Notes List

- Added 11 portal notification event interfaces to `packages/config/src/notifications.ts`, each extending `BaseEvent`. Interfaces for events that already have EventBus equivalents (application.submitted, status_changed, message.received, job approved/rejected/changes_requested/expired, saved_search.new_results) carry only the user-facing fields needed by the routing pipeline. Interfaces for future events (referral.status_changed, match.new_recommendations) are defined now so 6.1B/9.x/7.x can use them without a catalog change.
- `PortalNotificationEventType` union + `PORTAL_NOTIFICATION_EVENT_TYPES` runtime array (11 entries) exported for iteration and runtime membership checks.
- `PORTAL_NOTIFICATION_CATALOG` (Record<PortalNotificationEventType, PortalNotificationCatalogEntry>) with all 11 entries and correct priority tier / channel assignments. System-critical: 2, high: 7, low: 2. `portal.referral.status_changed` and `portal.match.new_recommendations` flagged `reserved: true`.
- `isSystemCritical/isHighPriority/isLowPriority` accept `string` (not the typed union) so they work safely with unknown runtime values.
- `NotificationCreatedEvent.eventType?: PortalNotificationEventType` added via `import type` in events.ts — circular type-only import (notifications.ts → events.ts, events.ts → notifications.ts) is safe in TypeScript.
- `publishNotificationCreated()` updated with 8th optional `eventType` param. Three of four call sites updated: `application.submitted` → `"portal.application.submitted"`, `saved_search.new_result` → `"portal.saved_search.new_results"`, `portal.message.sent` → `"portal.message.received"`. The `application.withdrawn` handler has no catalog entry (portal.application.withdrawn is not in the 11-event catalog defined in AC#1) so no eventType is passed there.
- Story task 3.2 listed 5 literal values including `application.status_changed` and `job.approved` — those handlers don't exist yet; they'll be wired when the corresponding handlers are added in 6.1B/6.2.
- TODO(6.1B) dedup TTL comment registered in both required locations.
- 58 new config tests (notifications.test.ts + events.test.ts additions), 3 new portal tests. Total: config 164/164, portal 3582/3582.

### File List

- `packages/config/src/notifications.ts` — Added: `PortalNotificationEventType`, `PORTAL_NOTIFICATION_EVENT_TYPES`, 11 notification event interfaces, `NotificationPriorityTier`, `PortalNotificationCatalogEntry`, `PORTAL_NOTIFICATION_CATALOG`, `isSystemCritical`, `isHighPriority`, `isLowPriority`, TODO(6.1B) comment; import type BaseEvent from events.ts
- `packages/config/src/events.ts` — Added: `import type { PortalNotificationEventType } from "./notifications"`, `eventType?: PortalNotificationEventType` to `NotificationCreatedEvent`
- `apps/portal/src/services/notification-service.ts` — Added: import `PortalNotificationEventType`, 8th param on `publishNotificationCreated`, TODO(6.1B) comment next to NOTIF_DEDUP_TTL_SECONDS, eventType passed at 3 call sites
- `packages/config/src/notifications.test.ts` — New file: 58 tests covering catalog completeness, priority tiers, helper functions, mutual exclusivity, unknown boundary, reserved flags, interface type assertions
- `packages/config/src/events.test.ts` — Added: `NotificationCreatedEvent` import, `PortalNotificationEventType` import, 3 new tests for `eventType` field
- `apps/portal/src/services/notification-service.test.ts` — Added: 3 new tests asserting correct `eventType` literal in `publishNotificationCreated` payload per handler
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated `p-6-1a-notification-event-types-contracts`: ready-for-dev → review

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-04-26 | Implemented P-6.1A: portal notification event catalog, priority tier classification, NotificationCreatedEvent.eventType field, publishNotificationCreated 8th param, 64 new tests | claude-sonnet-4-6 |
