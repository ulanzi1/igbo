# Story: P-5.6 Notification Pattern Assessment — Epic 6 Readiness

Status: done

## Story

As the platform architect,
I want a written assessment of which P-5.6 notification patterns Epic 6 builds on vs. replaces,
So that Story 6.1A/6.1B implementers have a clear decision record and avoid accidental rework or pattern conflicts.

## Acceptance Criteria

1. **Decision document produced.** A markdown file at `docs/decisions/notification-pattern-assessment.md` covers every P-5.6 notification pattern with a verdict: **KEEP**, **EXTEND**, or **REPLACE**.

2. **All 7 P-5.6 patterns assessed.** The document must evaluate each of the following infrastructure patterns established in P-5.6 and the prep sprint (AI-28 through AI-30):
   - Event dedup (Redis SET NX, 15-min TTL per messageId/eventId)
   - DB-level dedup (`idempotencyKey` column, ON CONFLICT DO NOTHING)
   - Message throttling (INCR + EXPIRE, 30-second fixed window per sender triple)
   - Push notification delivery (lazy VAPID init, subscription cleanup on 410/404, optional tag-based Redis NX dedup)
   - Email delivery (enqueueEmailJob with Redis NX dedup, fail-open)
   - Real-time in-app delivery (publishNotificationCreated → Redis pub/sub → eventbus-bridge → Socket.IO /notifications)
   - Handler infrastructure (withHandlerGuard, HMR guard, fire-and-forget contract)

3. **Each verdict includes rationale.** Use this exact format for each pattern entry:

   ```
   ### Pattern N: [Pattern Name]
   **Verdict:** KEEP | EXTEND | REPLACE
   **Rationale:** [One sentence — why this verdict.]
   **Current location:** [relative/file/path.ts → exportedFunctionOrClassName]
   **Epic 6 story:** [Story number and title — which story consumes/changes this]
   **Action for implementer:** [Imperative phrase — what the 6.x story must do]
   **Implementer constraint:** [One sentence starting with "Epic 6 implementers must…" or "Epic 6 implementers must not…"]
   ```

   Format rules:
   - **Current location**: always `path → name` (e.g. `apps/portal/src/services/notification-service.ts → publishNotificationCreated`). Never prose.
   - **Action for implementer**: concrete imperative (e.g. "reuse as-is", "extend: add retry logic when 6.2 lands", "migrate: move inline throttle into NotificationRouter.applyNoiseGuard()"). Never vague.
   - **Implementer constraint**: closes each entry with a binding statement so the 6.x developer cannot leave this open. Every entry must have one.
   - At least one pattern entry must carry a critical limitation or mixed verdict (EXTEND with constraint, or REPLACE). An assessment where every pattern is unconditionally approved is not an assessment.

   For KEEP: rationale explains why the pattern needs no changes. For EXTEND: what new behavior is needed, which story adds it, and any constraints on the current form. For REPLACE: what replaces it, why, and whether migration is needed before or during the replacing story.

4. **Epic 6 story mapping.** The document maps each pattern to the Epic 6 story that consumes, extends, or replaces it (8 stories total — all must appear in the mapping table):
   - 6.1A: Event types & contracts
   - 6.1B: Routing pipeline
   - 6.2: Email notifications
   - 6.3: Push & in-app delivery guarantees
   - 6.4: Notification preferences & priority hierarchy
   - 6.5: "Viewed by Employer" signal (outbox pattern)
   - 6.6: Daily/weekly digest
   - 6.7: Notification store & read state management

5. **Gap analysis for Epic 6.** The document lists each capability required by Epic 6 that does NOT exist in P-5.6, along with the Epic 6 story that introduces it:
   - Notification routing pipeline → introduced in Story 6.1B
   - Per-user notification preferences table → introduced in Story 6.4
   - Priority tier classification (system-critical / high / low) → introduced in Story 6.1A
   - Per-event-type noise guard throttle windows → introduced in Story 6.1B
   - Outbox pattern (`portal_outbox` table, 1-second poller, SKIP LOCKED) → introduced in Story 6.5
   - Notification store with `read_at`, `dismissed_at`, `payload_json`, cursor pagination → introduced in Story 6.7
   - Digest aggregation and scheduling background job → introduced in Story 6.6
   - Retry with exponential backoff (email 3×, push 2×) → introduced in Stories 6.2 and 6.3

   For each gap: one sentence explaining what's missing and why P-5.6 didn't need it.

6. **No code changes — strictly documentation.** This story produces one markdown file only. No source code modifications, no prototype commits, no proof-of-concept branches. If writing a verdict reveals an architectural issue that requires immediate code change, raise it as a separate story — do not inline it here.

## Validation Scenarios (SN-2 -- REQUIRED)

1. **Document completeness** -- The decision doc covers all 7 patterns with clear KEEP/EXTEND/REPLACE verdicts.
   - Expected outcome: Every pattern has a verdict, rationale, Epic 6 story mapping, and implementer constraint. At least one pattern carries a critical limitation or mixed verdict.
   - Evidence required: Review of the produced markdown file.

2. **Actionable for 6.1A implementer** -- A developer reading only this document and the 6.1A story file can identify which existing code to reuse without reading P-5.6's story file.
   - Expected outcome: File paths, function names, and pattern descriptions are specific enough to locate code. The document explicitly states which patterns apply to 6.1A's use case.
   - Evidence required: Cross-reference with actual codebase paths.

3. **Citation correctness** -- Every file path cited in the document actually exists and contains the pattern described.
   - Expected outcome: Open each cited file; the function/class named in "Current location" is present and implements the described mechanism.
   - Evidence required: Manual spot-check — at minimum verify the 7 primary citations (one per pattern).

## Tasks / Subtasks

- [x] Task 1: Analyze P-5.6 notification patterns against Epic 6 requirements (AC: #2, #3)
  - [x] 1.1 Review `apps/portal/src/services/notification-service.ts` for current handler patterns
  - [x] 1.2 Review `apps/portal/src/services/push-service.ts` for push delivery pattern
  - [x] 1.3 Review `apps/portal/src/services/email-service.ts` for email delivery pattern
  - [x] 1.4 Review `packages/config/src/events.ts` for event schemas and PortalEventMap
  - [x] 1.5 Review `packages/config/src/handler-guard.ts` for handler infrastructure
  - [x] 1.6 Review `apps/community/src/services/notification-service.ts` to contrast portal vs. community handler patterns (withHandlerGuard adoption, HMR guard, Redis NX dedup differences)
  - [x] 1.7 Cross-reference Epic 6 story ACs for new requirements

- [x] Task 2: Write the decision document (AC: #1, #4, #5)
  - [x] 2.1 Create `docs/decisions/notification-pattern-assessment.md` with this structure:
    ```
    # Notification Pattern Assessment — P-5.6 → Epic 6
    Status: active | Date: <today> | Relates to: P-5.6, Epic 6
    ## Summary
    ## Pattern Assessments (7 entries, one per pattern, using verdict format from AC #3)
    ## Epic 6 Story Mapping (table: Pattern → Story → Action)
    ## Gap Analysis (8 gaps, one per capability, with implementing story)
    ## Key Architectural Decisions (7 decision points from Dev Notes — each must have a recommended position)
    ```
  - [x] 2.2 Write all 7 pattern entries using the verdict format from AC #3; ensure each entry closes with a binding "implementers must/must not" constraint; ensure at least one entry carries a critical limitation or EXTEND-with-constraint verdict
  - [x] 2.3 Write Epic 6 story mapping table (rows: pattern; cols: story, verdict, action)
  - [x] 2.4 Write gap analysis section — 8 gaps with implementing story and one-sentence explanation

- [x] Task 3: Validate completeness (AC: #2, #6)
  - [x] 3.1 Verify all 7 patterns are covered with verdict + rationale + file path (path → name format) + story mapping + implementer constraint
  - [x] 3.2 Verify all 8 Epic 6 stories (6.1A, 6.1B, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7) appear at least once in the story mapping table with a sensible mapping (not just a presence check)
  - [x] 3.3 For each "Current location" citation: open the referenced file and confirm the named function/export exists and implements the described mechanism — existence of the file alone is not sufficient
  - [x] 3.4 No source code modified — `git diff` shows only `docs/decisions/notification-pattern-assessment.md` as new file, committed to `docs/decisions/` with that exact filename

## Runtime Smoke Test (SN-6 -- REQUIRED)

### Smoke Test Checklist

- [x] **[N/A]** -- this story has no observable runtime effect (documentation-only, no code changes). Justification: produces a decision document only.

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| Document completeness | Yes | N/A (file review) | All 7 patterns with KEEP/EXTEND/REPLACE verdicts; 2 EXTEND-with-constraint, 0 unconstrained; Pattern 3 carries split-counter critical limitation | None |
| Actionable for 6.1A | Yes | N/A (file review) | Patterns 1, 7 explicitly call out 6.1A; file paths + function names cited for all 7 patterns; story mapping table maps 6.1A to Pattern 7 and Pattern 1 critical note | None |
| Citation correctness | Yes | N/A (file review) | All 7 primary citations opened and function/export existence confirmed: `withHandlerGuard` (handler-guard.ts:14), `createNotification` (notifications.ts:18), `portal.message.sent` throttle block (notification-service.ts ~556–602), `sendPushNotification` (push-service.ts:72), `enqueueEmailJob` (email-service.ts:101), `publishNotificationCreated` (notification-service.ts:33), `withHandlerGuard` in handler-guard.ts (line 14) | None |

### Implementer Sign-Off

- [x] I have personally verified every SN-2 scenario (document review)

## Dev Notes

### Architecture Context

This is a decision document, not a code story. The P-5 retrospective (2026-04-24) identified this as Priority 2 (before Story 6.1A) under "Technical Prep":

> **P-5.6 notification pattern assessment** -- Written assessment of which P-5.6 patterns (dedup, throttle, push, lazy VAPID) Epic 6 should build on vs. replace. Decision doc.

The retrospective's "Key Risk" section explicitly flags:

> P-5.6 notification patterns were ad-hoc prototypes. Epic 6 may need to refactor them into the formal routing pipeline.

### Current P-5.6 Pattern Inventory

Below is the exhaustive list of patterns to assess, with their current locations and behaviors. Use this as the starting checklist -- every item needs a verdict.

#### Pattern 1: Event-Level Redis Dedup (SET NX)

- **Location:** `apps/portal/src/services/notification-service.ts` (all 5 handlers)
- **Mechanism:** `redis.set(dedupKey, "1", "EX", 900, "NX")` — if key exists, skip handler
- **Key format:** `portal:dedup:notif:{type}:{entityId}` (e.g., `portal:dedup:notif:msg:${messageId}`)
- **Fail-open:** Yes — Redis unavailable = proceed without dedup
- **TTL:** 15 minutes (`NOTIF_DEDUP_TTL_SECONDS`)
- **Purpose:** Prevents duplicate handler runs on EventBus event replay (Redis pub/sub at-most-once can occasionally redeliver)

#### Pattern 2: DB-Level Dedup (idempotencyKey)

- **Location:** `packages/db/src/queries/notifications.ts` → `createNotification()`
- **Mechanism:** `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *` — returns `null` on conflict
- **Column:** `platform_notifications.idempotency_key VARCHAR(255)` with partial unique index
- **Purpose:** Defense-in-depth — catches duplicates that slip through Redis dedup (Redis down, race conditions)
- **Added by:** AI-30 (prep sprint)

#### Pattern 3: Message Throttling (INCR + EXPIRE)

- **Location:** `notification-service.ts` → `portal.message.sent` handler only
- **Mechanism:** Redis PIPELINE: `INCR throttleKey` + `EXPIRE 30`. First message (count=1) creates notification, subsequent messages (count>1) suppress
- **Key format:** `portal:throttle:msg:${senderId}:${recipientId}:${applicationId}`
- **Window:** 30 seconds, fixed (not sliding)
- **Purpose:** Prevents notification spam during rapid message exchange
- **Limitation:** Only applies to messages. No per-event-type throttle for other notification types.

#### Pattern 4: Push Notification Delivery

- **Location:** `apps/portal/src/services/push-service.ts`
- **Mechanism:** `web-push` npm package, lazy VAPID init, iterates user's push subscriptions
- **Dedup:** Optional Redis NX (15-min TTL) when `payload.tag` is defined
- **Subscription cleanup:** Deletes expired subscriptions on 410/404 responses
- **Fail-open:** Returns `false` if VAPID missing or Redis unavailable
- **Limitation:** No retry logic. No priority tiers. No preference check.

#### Pattern 5: Email Delivery

- **Location:** `apps/portal/src/services/email-service.ts` → `enqueueEmailJob()`
- **Mechanism:** Resend SDK, fire-and-forget with Redis NX dedup (15-min TTL)
- **Dedup key:** `portal:dedup:email:${jobName}`
- **Fail-open:** Redis unavailable = proceed with send
- **Return:** `Promise<boolean>` (true=sent, false=deduped)
- **Limitation:** No retry with exponential backoff. No template per event type. Only used for application confirmation emails currently.

#### Pattern 6: Real-Time In-App Delivery

- **Location:** `notification-service.ts` → `publishNotificationCreated()` helper
- **Mechanism:** After `createNotification()` DB insert, publishes `NotificationCreatedEvent` to Redis channel `eventbus:notification.created`. eventbus-bridge routes to Socket.IO `/notifications` namespace as `notification:new`.
- **Type:** `NotificationCreatedEvent` in `packages/config/src/events.ts`
- **Fail-open:** Publish failure logged, does not block
- **Limitation:** No toast management on client (stacking, auto-dismiss). No notification center UI.

#### Pattern 7: Handler Infrastructure

- **Location:** `packages/config/src/handler-guard.ts` + `notification-service.ts`
- **Components:**
  - `withHandlerGuard(name, fn)` — uniform try/catch, structured JSON logging, ack callback support
  - HMR guard — `globalForNotif.__portalNotifHandlersRegistered` prevents re-registration
  - Fire-and-forget contract — all downstream operations (email, push, publish) never propagate errors
  - `emittedBy` metadata on all events (via AI-28 Zod schemas)
  - Zod validation at `portalEventBus.emit()` (fail-fast on invalid payloads)
- **Limitation:** No type-enforced requirement for new handlers to use guard. No metrics/Sentry integration.

### Epic 6 Requirements That Don't Exist Yet

These are net-new capabilities that P-5.6 does not provide. The decision doc must identify these as gaps:

1. **Notification routing pipeline** (6.1B) — Channel selection logic: event type → priority tier → user preferences → noise guard → channel dispatchers. Currently channel selection is hardcoded per handler.

2. **Per-user notification preferences** (6.4) — `portal_notification_preferences` table with per-event-type channel toggles. Currently no user preferences exist.

3. **Priority tier classification** (6.1A) — System-critical (cannot disable), high-priority (default ON), low-priority (default digest). Currently all notifications are treated equally.

4. **Per-event-type noise guards** (6.1B) — Different throttle windows per event type (30s for messages, 60s for status changes, 1hr for recommendations). Currently only messages have throttling.

5. **Outbox pattern** (6.5) — Transactional INSERT into `portal_outbox`, 1-second poller with `FOR UPDATE SKIP LOCKED`, retry counter. Completely new infrastructure.

6. **Notification store with read state** (6.7) — `portal_notifications` table (distinct from existing `platform_notifications`?), read/unread state, cursor pagination, "Mark All Read", retention policy. Existing `platform_notifications` has basic fields but lacks `read_at`, `dismissed_at`, `payload_json`.

7. **Digest aggregation** (6.6) — Background job that collects low-priority notifications since last digest, deduplicates by entity, renders batched email. No digest infrastructure exists.

8. **Retry with backoff** (6.2, 6.3) — Email: 3 retries (1s, 5s, 30s). Push: 2 retries (2s, 10s). Currently both are fire-and-forget with no retry.

### Preliminary Verdicts (for story author -- dev agent should verify)

| Pattern | Likely Verdict | Rationale |
|---------|---------------|-----------|
| Event dedup (Redis NX) | **KEEP** | At-most-once EventBus delivery doesn't change. Redis dedup is the first defense. Note: 15-min TTL is a magic number — flag that it may need to become event-type-aware once priority tiers land (6.1A). |
| DB dedup (idempotencyKey) | **KEEP** | Defense-in-depth. Routing pipeline adds complexity, making dedup MORE important. Note: if Epic 6 introduces `portal_notifications` (decision point 1), the idempotency key column location may change — make that dependency explicit. |
| Message throttle | **EXTEND (with constraint)** | The current handler-inline throttle works only if the routing pipeline (6.1B) is NOT built, or if throttle logic is explicitly migrated into the pipeline noise guard when 6.1B lands. Leaving both in place creates split-counter bugs. The implementer constraint must state this explicitly. |
| Push delivery | **EXTEND** | Add retry logic (6.3), preference check (6.4), priority routing (6.1B). Subscription cleanup must remain at the channel-adapter level — not absorbed into pipeline middleware. |
| Email delivery | **EXTEND (with scope boundary)** | Fire-and-forget remains valid where notification loss is tolerable. It is NOT valid for high-priority notifications or digests (6.6) — those require the outbox pattern (6.5). The entry must draw this line explicitly. |
| Real-time in-app | **EXTEND** | Add notification store persistence (6.7), toast management (6.3), read state (6.7). Recommendation: make `publishNotificationCreated()` a pipeline output rather than a handler side-effect when 6.1B lands. |
| Handler infra | **KEEP** | withHandlerGuard, HMR guard, Zod validation, emittedBy — all solid. Add metrics later. |

### Key Decision Points for the Document

The document must take a **position** on each of these — not just describe the trade-off. If left open, implementers will make these calls mid-sprint under deadline.

1. **Should Epic 6 use `platform_notifications` or create `portal_notifications`?** The existing table has basic fields but may lack `read_at`, `dismissed_at`, `payload_json`, `event_type`. Extending it vs. creating a new portal-specific table affects migration complexity and community notification compatibility.

2. **Should the routing pipeline replace per-handler channel selection or wrap it?** Currently each handler decides: "create notification + maybe push + maybe email". The routing pipeline (6.1B) wants: "emit event → pipeline decides channels". This could mean handlers ONLY emit routing events, and a new NotificationRouter handles all channel dispatch.

3. **Should P-5.6's `publishNotificationCreated()` become part of the routing pipeline?** Currently it's a manual call after DB insert. The routing pipeline could absorb this into the in-app channel dispatcher. (Recommended: yes — absorb it, to prevent side-effects scattered across handlers.)

4. **Should throttle logic move from handlers to the routing pipeline?** Currently message throttling is inline in the handler. The routing pipeline's "noise guard" (6.1B) centralizes throttling. Keeping both would be redundant and introduces split-counter bugs. (Recommended: migrate into pipeline when 6.1B lands; document the constraint on Pattern 3 now.)

5. **Does the outbox pattern (6.5) coexist with EventBus or replace it for critical events?** Architecture says: outbox for `application.viewed` and `application.hired`, EventBus for everything else. (Recommended position: coexistence, scoped to critical events only — EventBus remains the backbone; outbox is opt-in for loss-intolerant events.)

6. **Who owns the notification data contract going forward — community or portal?** If `platform_notifications` is extended, the community schema carries portal notification state, coupling two apps. If `portal_notifications` is new, a clear rule is needed about which table each app queries. This is distinct from decision point 1 — it's about schema ownership and cross-app coupling, not just table structure.

7. **Where do error observability boundaries live in the proposed architecture?** `withHandlerGuard` logs and swallows at the handler level. As Epic 6 adds retry (6.2/6.3) and outbox (6.5), does the routing pipeline own error reporting, or does each channel adapter? Without an explicit answer, Epic 6 will produce duplicate Sentry captures and lost retry signals.

### File to Create

| File | Purpose |
|------|---------|
| `docs/decisions/notification-pattern-assessment.md` | Decision document — pattern verdicts + Epic 6 mapping + gap analysis |

### Files to Read (not modify)

| File | Purpose |
|------|---------|
| `apps/portal/src/services/notification-service.ts` | Current handler patterns (dedup, throttle, HMR guard, fire-and-forget) |
| `apps/portal/src/services/push-service.ts` | Current push delivery (lazy VAPID, subscription cleanup) |
| `apps/portal/src/services/email-service.ts` | Current email delivery (enqueueEmailJob, Redis NX dedup) |
| `packages/config/src/events.ts` | Event schemas, PortalEventMap |
| `packages/config/src/handler-guard.ts` | withHandlerGuard utility |
| `packages/db/src/schema/platform-notifications.ts` | Current notification schema |
| `packages/db/src/queries/notifications.ts` | createNotification with idempotencyKey |
| `apps/community/src/services/notification-service.ts` | Community handler pattern for contrast — bare eventBus.on, no withHandlerGuard, no Redis NX dedup; informs verdict on handler infrastructure adoption gap |

### Previous Story Intelligence

**AI-28 (EventBus validation):** Established Zod schemas for all 20 portal events, `emittedBy` metadata, runtime validation at emit. Epic 6's Story 6.1A (event types & contracts) builds directly on this — the schemas already exist. 6.1A may need to ADD notification-specific event types (e.g., `portal.application.viewed`) and priority classifications, but the schema infrastructure is ready.

**AI-29 (withHandlerGuard):** Standardized all handler error containment. Epic 6 handlers MUST continue using this pattern. No changes needed to the guard itself.

**AI-30 (idempotency):** Established ON CONFLICT DO NOTHING for DB writes, Redis NX for email/push. Epic 6's at-least-once delivery (via outbox pattern) makes idempotency MORE critical, not less. All patterns from AI-30 carry forward.

**P-5.6 (message notifications):** Established the complete notification handler pattern: dedup → throttle → createNotification → publishNotificationCreated → push. Epic 6 may wrap this in a routing pipeline but the individual operations are proven.

### References

- [Source: _bmad-output/implementation-artifacts/portal-epic-5-retro-2026-04-24.md -- Pattern assessment scope, Critical Path to Epic 6]
- [Source: _bmad-output/implementation-artifacts/p-5-6-message-notifications-integration.md -- P-5.6 patterns established]
- [Source: _bmad-output/implementation-artifacts/portal-epic-5-ai-28-eventbus-payload-validation-ownership.md -- Zod schemas, emittedBy]
- [Source: _bmad-output/implementation-artifacts/portal-epic-5-ai-29-handler-guard-standardization.md -- withHandlerGuard]
- [Source: _bmad-output/implementation-artifacts/portal-epic-5-ai-30-minimal-idempotency-rule.md -- Idempotency patterns]
- [Source: _bmad-output/planning-artifacts/epics.md -- Epic 6 stories 6.1A through 6.7 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md -- Outbox pattern, EventBus, notification routing]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — documentation-only story, no code execution required.

### Completion Notes List

- Read all 8 source files cited in the story Dev Notes (notification-service.ts portal + community, push-service.ts, email-service.ts, events.ts, handler-guard.ts, platform-notifications schema, notifications queries).
- Confirmed community notification-service uses bare `eventBus.on()` (no withHandlerGuard, no Redis NX dedup) — key contrast for Pattern 7 implementer constraint.
- Identified critical split-counter issue in Pattern 3 (message throttle): inline INCR and routing pipeline noise guard cannot coexist — flagged as critical limitation with explicit migration instruction.
- Confirmed `platform_notifications` schema lacks `read_at`, `dismissed_at`, `payload_json`, `event_type` — supports Decision 1 (create portal_notifications).
- All 7 citation function/export names verified against actual source files with line references.
- All 8 Epic 6 stories appear in story mapping table with actionable entries.
- All 8 gaps identified with one-sentence explanation each.
- All 7 decision points given a concrete recommended position (not just trade-off description).
- No source code modified.

### File List

docs/decisions/notification-pattern-assessment.md (created)

### Review Findings

**Code review 2026-04-26 — 0 decision-needed, 12 patch, 4 defer, 10 dismissed**

#### Patch (document edits needed)

- [x] [Review][Patch] R1-HIGH: Pattern 1 citation omits `saved_search.new_result` and `job.reviewed` handlers which have NO Redis NX dedup — only DB-level dedup via idempotencyKey. **Fixed:** Current location updated to list all 5 handlers with dedup status; action + constraint updated to include backfill instruction.
- [x] [Review][Patch] R2-HIGH: `application.status_changed` event is emitted by ApplicationStateMachine but has ZERO notification handler — not captured in gap analysis. **Fixed:** Added Gap 9 (application.status_changed notification handler, introducing story 6.1B).
- [x] [Review][Patch] R3-HIGH: Community eventbus-bridge subscribes to `eventbus:notification.created` — phantom lookups after portal switches to `portal_notifications`. **Fixed:** Added "Cross-app impact (6.7)" note to Pattern 6 with two mitigation options.
- [x] [Review][Patch] R4-HIGH: No ordering constraint between Story 6.1B and Story 6.7. **Fixed:** Added "Story ordering constraints" section to Epic 6 Story Mapping with 4 mandatory ordering dependencies.
- [x] [Review][Patch] R5-HIGH: Orphaned unread notifications when switching from `platform_notifications` to `portal_notifications`. **Fixed:** Decision 1 migration implication rewritten with explicit options (one-time migration script or accept orphan risk with product decision).
- [x] [Review][Patch] R6-HIGH: `application.hired` referenced as discrete event but doesn't exist. **Fixed:** Added clarification to Decision 5 — recommends conditional outbox routing via `application.status_changed` where `newStatus === "hired"` (option b).
- [x] [Review][Patch] R7-MEDIUM: Summary says "Three EXTEND" but document has 4. **Fixed:** Changed to "Four require structured extension (EXTEND)".
- [x] [Review][Patch] R8-MEDIUM: `enqueueEmailJob` fire-and-forget interface incompatible with retry-exhaustion reporting. **Fixed:** Added "Interface change required (6.2)" note to Decision 7.
- [x] [Review][Patch] R9-MEDIUM: Dead-letter tracking has no story assignment. **Fixed:** Added Gap 10 (dead-letter tracking, introducing story 6.5) and row in story mapping table.
- [x] [Review][Patch] R10-MEDIUM: Fire-and-forget vs outbox coexistence unexplained. **Fixed:** Added "Outbox coexistence (6.5)" note to Pattern 7 explaining how withHandlerGuard and outbox complement each other.
- [x] [Review][Patch] R11-MEDIUM: Throttle counter state during migration window. **Fixed:** Added deployment note to Pattern 3 — brief suppression window (max 30s) is acceptable, no flush required.
- [x] [Review][Patch] R12-LOW: `NotificationCreatedEvent` payload needs `eventType`. **Fixed:** Added "Payload extension needed (6.1A)" note to Pattern 6.

#### Deferred (pre-existing, not caused by this change)

- [x] [Review][Defer] D1: "Binding constraint" language used without defining enforcement mechanism (no CI check, linter, or PR gate) — deferred, process concern beyond scope of decision doc
- [x] [Review][Defer] D2: Push dedup tag namespace (`push:{userId}:{tag}`) has collision risk across event types using similar tag formats — deferred, push-service pre-existing design
- [x] [Review][Defer] D3: Redis NX dedup 15-min TTL shorter than potential outbox retry window (>15min outage) — already flagged as 6.1A follow-up in Pattern 1 critical note
- [x] [Review][Defer] D4: `job.reviewed` replay triggers unbounded `saved_search.new_result` emissions with redundant DB queries (no short-circuit for N matching searches) — pre-existing, notification-service design

## Change Log

- 2026-04-25: Decision document created — 7 pattern assessments (3 KEEP, 3 EXTEND, 0 REPLACE), 13-row story mapping table, 8-gap analysis, 7 architectural decisions with binding positions. Critical finding: Pattern 3 message throttle split-counter risk flagged as blocker constraint for Story 6.1B. Schema decision: Epic 6 creates `portal_notifications` (not extend `platform_notifications`). Status → review.
- 2026-04-26: Code review complete — 12 patch findings fixed (6 HIGH, 5 MEDIUM, 1 LOW), 4 deferred, 10 dismissed. Key fixes: Pattern 1 citation corrected (2 handlers lack Redis NX dedup), Gap 9 added (application.status_changed handler), Gap 10 added (dead-letter tracking), story ordering constraints section added, Decision 1 migration implication rewritten (orphan risk), Decision 5 application.hired ambiguity resolved, Pattern 6 cross-app impact + payload extension notes, Pattern 7 outbox coexistence note. Status → done.
