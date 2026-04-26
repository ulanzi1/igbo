# Notification Pattern Assessment — P-5.6 → Epic 6

**Status:** active
**Date:** 2026-04-25
**Relates to:** P-5.6 (message notifications integration), Epic 6 (portal notifications)
**Author:** Dev Agent (claude-sonnet-4-6)

---

## Summary

P-5.6 established seven notification infrastructure patterns in the portal. This document assesses each pattern's fitness for Epic 6, maps it to the consuming story, and closes every entry with a binding constraint so that 6.x implementers cannot defer these decisions to mid-sprint.

**Headline finding:** Three of seven patterns carry forward as-is (KEEP). Four require structured extension (EXTEND). One is a critical blocker — the message throttle is a **split-counter time bomb** if Story 6.1B builds a routing pipeline without first migrating the inline throttle. That constraint must be communicated to the 6.1B implementer before work begins.

**Schema decision (affects 6.7 and 6.1A):** Epic 6 MUST create `portal_notifications` — a portal-owned table — rather than extending `platform_notifications`. See Decision Point 1 and Pattern 2 for the binding rationale.

---

## Pattern Assessments

### Pattern 1: Event-Level Redis Dedup (SET NX)

**Verdict:** KEEP
**Rationale:** At-most-once EventBus delivery does not change in Epic 6; Redis NX dedup remains the correct first-line defense against handler re-runs on event replay.
**Current location:** `apps/portal/src/services/notification-service.ts` → `withHandlerGuard` wrappers for `application.submitted`, `application.withdrawn`, `portal.message.sent` (these 3 have Redis NX dedup); `saved_search.new_result` and `job.reviewed` handlers rely on DB-level idempotencyKey only — no Redis NX dedup
**Epic 6 story:** 6.1B — Notification routing pipeline (routing pipeline handlers inherit this dedup pattern)
**Action for implementer:** reuse as-is in each 6.x event handler; use `createRedisKey("portal", "dedup", "notif:{type}:{entityId}")` with `NOTIF_DEDUP_TTL_SECONDS` (900s); do not change the key format or TTL without a migration plan; when migrating `saved_search.new_result` and `job.reviewed` into the routing pipeline, ADD Redis NX dedup as the first operation (these handlers currently lack it)
**Implementer constraint:** Epic 6 implementers must apply the Redis NX dedup block as the FIRST operation inside every new notification handler, before any DB query or channel dispatch — placing it after DB work creates a dedup window where the DB write completes but the Redis key is never set, meaning replays will re-create duplicate notifications. This includes backfilling Redis NX dedup on migrated `saved_search.new_result` and `job.reviewed` handlers.

> **Critical note:** The 15-minute TTL is a magic number chosen for P-5.6 message delivery. Once priority tier classification lands in Story 6.1A, system-critical events may warrant longer TTLs (e.g. 24h) to cover retry windows. Story 6.1A should register this as a follow-up in its AC, but must NOT change `NOTIF_DEDUP_TTL_SECONDS` itself — that change belongs in Story 6.1B after priority tiers are defined.

---

### Pattern 2: DB-Level Dedup (idempotencyKey / ON CONFLICT DO NOTHING)

**Verdict:** KEEP — but with a binding schema ownership decision
**Rationale:** Defense-in-depth dedup is MORE important in Epic 6 as the routing pipeline adds more code paths through which a duplicate can slip; the idempotency key mechanism is sound and must be carried forward.
**Current location:** `packages/db/src/queries/notifications.ts` → `createNotification()`
**Epic 6 story:** 6.7 — Notification store & read state management (creates `portal_notifications` which must inherit this dedup mechanism)
**Action for implementer:** when Story 6.7 creates `portal_notifications`, replicate the `idempotency_key VARCHAR(255)` column with its partial UNIQUE index AND update `createNotification()` (or its 6.7 counterpart) to use `ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`; do not repurpose `platform_notifications` for portal-specific notification state
**Implementer constraint:** Epic 6 implementers must NOT extend `platform_notifications` to carry portal-specific fields (`event_type`, `payload_json`, `read_at`, `dismissed_at`) — that table is community-owned; adding portal columns creates cross-app coupling that blocks independent schema evolution; Story 6.7 creates `portal_notifications` with these fields, and `createNotification()` queries are updated to target the new table.

> **Schema gap (relevant to 6.7):** The current `platform_notifications` table is missing: `read_at TIMESTAMPTZ` (Epic 6 replaces the boolean `isRead` with a timestamp for cursor-based read-state queries), `dismissed_at TIMESTAMPTZ`, `payload_json JSONB` (structured event context for notification center UI), and `event_type VARCHAR` (classification field for preference filtering). All four belong in `portal_notifications`, not as ALTER TABLE extensions to the shared community table.

---

### Pattern 3: Message Throttling (INCR + EXPIRE)

**Verdict:** EXTEND — with a critical split-counter constraint
**Rationale:** The current inline throttle is a single-event prototype that works correctly only if Story 6.1B does NOT build a generalized noise guard — having both in place means two independent INCR counters compete, producing unpredictable suppression behavior.
**Current location:** `apps/portal/src/services/notification-service.ts` → `portal.message.sent` handler (lines ~556–602)
**Epic 6 story:** 6.1B — Notification routing pipeline (implements `NotificationRouter.applyNoiseGuard()` with per-event-type throttle windows)
**Action for implementer:** DO NOT add a second throttle in the routing pipeline while the inline handler throttle exists; when Story 6.1B builds the noise guard, migrate the inline throttle: (1) delete the INCR/EXPIRE block from the `portal.message.sent` handler, (2) register `portal.message.sent` in the routing pipeline noise guard config with `windowSeconds: 30`, (3) verify no message throttle counter duplication in integration test
**Implementer constraint:** Epic 6 implementers must not introduce a routing-layer noise guard for `portal.message.sent` without simultaneously removing the inline throttle in the `portal.message.sent` handler — the split-counter pattern causes the first message in a 30-second window to increment BOTH counters, meaning the second message sees count=2 in both and is doubly suppressed, AND the routing pipeline counter resets independently, creating a window where notifications appear to be sent but the inline counter still suppresses them.

> **Throttle key format to preserve on migration:** `portal:throttle:msg:{senderId}:{recipientId}:{applicationId}` (via `createRedisKey`). The migrated noise guard must use the same key format or existing in-flight throttle windows will be abandoned mid-window.

> **Deployment note:** Existing Redis throttle counters with remaining TTL will persist after deploy. The new noise guard will read these keys and see a non-zero count, potentially suppressing the first message after deployment for active sender triples. This is a brief suppression window (max 30 seconds) and is acceptable — no explicit counter flush is required.

---

### Pattern 4: Push Notification Delivery

**Verdict:** EXTEND
**Rationale:** The lazy VAPID init and subscription cleanup (410/404) are correct and must stay; the missing capabilities — retry logic, preference check, priority routing — are additive and assigned to specific Epic 6 stories.
**Current location:** `apps/portal/src/services/push-service.ts` → `sendPushNotification()`
**Epic 6 story:** 6.3 — Push & in-app delivery guarantees (adds retry: 2 attempts, 2s/10s backoff); 6.4 — Notification preferences (adds preference check before sending); 6.1B — Routing pipeline (adds priority-aware channel selection)
**Action for implementer:** extend `sendPushNotification()` in Story 6.3 to add retry with exponential backoff (2 attempts: 2s, 10s); in Story 6.4, add a preference lookup before calling `sendPushNotification()` (do NOT add the lookup inside `push-service.ts` — the routing pipeline in 6.1B owns channel gating; push-service remains a dumb channel adapter); subscription cleanup MUST remain at the channel-adapter level and must NOT be absorbed into pipeline middleware
**Implementer constraint:** Epic 6 implementers must keep `sendPushNotification()` as a channel adapter — it must never call the routing pipeline or preference store directly; preference and priority decisions belong in the NotificationRouter (6.1B/6.4), which decides WHETHER to call the push adapter; the adapter's only job is delivery, cleanup, and logging.

---

### Pattern 5: Email Delivery

**Verdict:** EXTEND — with a scope boundary that separates fire-and-forget from outbox
**Rationale:** `enqueueEmailJob` is correct for low-priority, loss-tolerant notifications, but it is architecturally incorrect for high-priority notifications (application.hired, verified employer status change) and digests — those require the outbox pattern for delivery guarantees.
**Current location:** `apps/portal/src/services/email-service.ts` → `enqueueEmailJob()`
**Epic 6 story:** 6.2 — Email notifications (adds retry: 3 attempts, 1s/5s/30s backoff, per-template subject lines); 6.5 — "Viewed by Employer" signal and outbox pattern (establishes outbox for loss-intolerant events); 6.6 — Daily/weekly digest (adds digest aggregation job, NOT via `enqueueEmailJob`)
**Action for implementer:** in Story 6.2, extend `enqueueEmailJob()` to support retry with exponential backoff (3 attempts); in Story 6.5, implement outbox infrastructure (`portal_outbox` table, 1-second poller, `FOR UPDATE SKIP LOCKED`) as a SEPARATE code path — do NOT route outbox events through `enqueueEmailJob()`; digest emails (6.6) use a new `sendDigestEmail()` function backed by the outbox, not `enqueueEmailJob()`
**Implementer constraint:** Epic 6 implementers must not route `application.hired`, `employer.verification_approved`, or any other system-critical email through `enqueueEmailJob()` — those events require the outbox pattern (Story 6.5); using `enqueueEmailJob()` for critical events means a Redis outage at the time of the event silently drops the notification with no retry path.

---

### Pattern 6: Real-Time In-App Delivery

**Verdict:** EXTEND
**Rationale:** The `publishNotificationCreated()` helper is correctly scoped as a side-effect after DB insert, but it must be absorbed into the routing pipeline's in-app channel dispatcher when 6.1B lands to prevent publish calls scattered across all handlers.
**Current location:** `apps/portal/src/services/notification-service.ts` → `publishNotificationCreated()` (lines 33–55)
**Epic 6 story:** 6.1B — Routing pipeline (absorbs `publishNotificationCreated()` into in-app channel dispatcher); 6.7 — Notification store (adds `portal_notifications` persistence before publish); 6.3 — Push & in-app delivery guarantees (adds toast management: stacking, auto-dismiss, client-side dedup by `notificationId`)
**Action for implementer:** in Story 6.1B, move `publishNotificationCreated()` from `notification-service.ts` into the routing pipeline's in-app channel dispatcher; handlers should call `notificationRouter.dispatch(event)` which internally calls `createNotification()` → `publishNotificationCreated()` as a pipeline step; in Story 6.7, update the pipeline to write to `portal_notifications` instead of `platform_notifications` before publishing; the publish channel name `"eventbus:notification.created"` and the Socket.IO event name `"notification:new"` MUST NOT change (eventbus-bridge and client listeners depend on these)
**Implementer constraint:** Epic 6 implementers must not change the Redis pub/sub channel name `"eventbus:notification.created"` or the Socket.IO event name `"notification:new"` — the community eventbus-bridge and portal Socket.IO `/notifications` namespace both subscribe to these; changing either causes silent notification loss across both apps until all subscribers are updated atomically.

> **Payload extension needed (6.1A):** The current `NotificationCreatedEvent` interface in `packages/config/src/events.ts` lacks an `eventType` field. Stories 6.4 (preference filtering) and 6.3 (toast management) need clients to know the originating event type (e.g. `"application.submitted"` vs `"portal.message.sent"`) to apply per-type preferences and toast behavior. Story 6.1A must add `eventType: string` to `NotificationCreatedEvent` when defining priority tier classification.

> **Cross-app impact (6.7):** The community eventbus-bridge subscribes to `"eventbus:notification.created"` and routes events to the community `/notifications` namespace. When Story 6.7 switches portal handlers to write `portal_notifications`, published events will reference notification IDs that exist only in `portal_notifications` — the community eventbus-bridge will attempt to look up these IDs in `platform_notifications` and fail silently. Story 6.7 must either: (a) use a separate portal-specific pub/sub channel (e.g. `"eventbus:portal.notification.created"`) and update the portal eventbus-bridge subscription, or (b) include sufficient data in the pub/sub payload so the community bridge can ignore non-community notifications without a DB lookup.

---

### Pattern 7: Handler Infrastructure

**Verdict:** KEEP
**Rationale:** `withHandlerGuard`, the HMR guard, Zod validation at emit, `emittedBy` metadata, and the fire-and-forget contract are all correct and stable — Epic 6 handlers must continue using them without modification.
**Current location:** `packages/config/src/handler-guard.ts` → `withHandlerGuard()`; `apps/portal/src/services/notification-service.ts` → `globalForNotif.__portalNotifHandlersRegistered` guard
**Epic 6 story:** 6.1A — Event types & contracts (new event types must be added to `portalEventSchemas` in `packages/config/src/events.ts` with `emittedBy` required); all 6.x handler stories consume `withHandlerGuard` directly
**Action for implementer:** reuse `withHandlerGuard(name, fn)` on every new 6.x notification handler; name format: `"notif:{eventName}"` (e.g. `"notif:application.status_changed"`); register new event types in `portalEventSchemas` in Story 6.1A before implementing handlers in downstream stories; add each new handler inside the HMR guard block (`globalForNotif.__portalNotifHandlersRegistered`)
**Implementer constraint:** Epic 6 implementers must not write bare `portalEventBus.on()` calls without `withHandlerGuard` — the community notification-service (`apps/community/src/services/notification-service.ts`) demonstrates the unguarded pattern (bare `eventBus.on()` calls without guard wrappers) and was explicitly NOT adopted in the portal prep sprint (AI-29) for good reason: unguarded handlers silently swallow errors with no structured log, making production incidents invisible.

> **Outbox coexistence (6.5):** `withHandlerGuard` implements fire-and-forget error containment — it catches, logs, and swallows errors. For outbox-backed events (`application.viewed`, `application.hired`), the handler still uses `withHandlerGuard` for uniform error logging. However, the at-least-once delivery guarantee comes from the outbox poller (Story 6.5), not from the handler itself. The handler's job is to write to `portal_outbox` within a DB transaction; the poller retries delivery. If the handler fails after writing to the outbox, `withHandlerGuard` logs the error and the poller picks up the outbox row on the next poll. These two patterns complement each other: guard owns error containment, outbox owns delivery guarantee.

---

## Epic 6 Story Mapping

| Pattern                   | Consuming Story                | Verdict | Required Action                                                                                       |
| ------------------------- | ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| Event dedup (Redis NX)    | 6.1B — Routing pipeline        | KEEP    | Copy dedup block as-is into each new routing handler                                                  |
| DB dedup (idempotencyKey) | 6.7 — Notification store       | KEEP    | Replicate in `portal_notifications` table + `createPortalNotification()` query                        |
| Message throttling        | 6.1B — Routing pipeline        | EXTEND  | Migrate inline throttle INTO pipeline noise guard when 6.1B lands; delete inline block simultaneously |
| Push delivery             | 6.3 — Push & in-app guarantees | EXTEND  | Add retry logic (2× backoff); keep as channel adapter                                                 |
| Push delivery             | 6.4 — Notification preferences | EXTEND  | Add preference gate BEFORE calling `sendPushNotification()`, in router layer                          |
| Email delivery            | 6.2 — Email notifications      | EXTEND  | Add retry (3× backoff) to `enqueueEmailJob()`                                                         |
| Email delivery            | 6.5 — Outbox pattern           | EXTEND  | Implement outbox as separate code path; do NOT route critical events through `enqueueEmailJob()`      |
| Email delivery            | 6.6 — Digest                   | EXTEND  | Implement `sendDigestEmail()` backed by outbox; digest does NOT use `enqueueEmailJob()`               |
| Real-time in-app          | 6.1B — Routing pipeline        | EXTEND  | Absorb `publishNotificationCreated()` into in-app channel dispatcher                                  |
| Real-time in-app          | 6.7 — Notification store       | EXTEND  | Persist to `portal_notifications` before publish                                                      |
| Real-time in-app          | 6.3 — Push & in-app guarantees | EXTEND  | Add client-side toast management (stacking, auto-dismiss)                                             |
| Handler infrastructure    | 6.1A — Event types & contracts | KEEP    | Add new event types to `portalEventSchemas`; `emittedBy` required                                     |
| Handler infrastructure    | All 6.x handler stories        | KEEP    | Use `withHandlerGuard` on every handler; no bare `eventBus.on()`                                      |
| Dead-letter tracking      | 6.5 — Outbox pattern           | NEW     | Add dead-letter tracking for retry-exhausted outbox rows (Decision 7)                                 |

### Story ordering constraints

The following ordering dependencies are mandatory:

1. **6.1A before 6.1B** — 6.1B's noise guard needs priority tier definitions from 6.1A to set per-event-type throttle windows.
2. **6.7 before or simultaneously with 6.1B** — if 6.1B ships before 6.7, the routing pipeline writes to `platform_notifications` (community-owned table). If 6.7 ships before 6.1B, `portal_notifications` exists but no handler writes to it. The safe ordering is: 6.7 creates the table, then 6.1B (or the same deploy) updates routing pipeline channel dispatchers to target `portal_notifications`.
3. **6.1A before 6.4** — preference filtering requires event types with priority tiers to exist.
4. **6.5 before 6.6** — digest aggregation reads from `portal_notifications` (6.7) and uses the outbox (6.5) for delivery guarantee.

---

## Gap Analysis

The following capabilities are required by Epic 6 but do not exist in P-5.6. Each entry names the introducing story and explains the gap in one sentence.

### Gap 1: Notification routing pipeline

**Introducing story:** 6.1B
**Explanation:** P-5.6 notification-service hardcodes channel selection inside each handler (e.g. `portal.message.sent` directly calls `createNotification()` + `publishNotificationCreated()` + `sendPushNotification()`); Epic 6 needs a centralized `NotificationRouter` that evaluates event type → priority tier → user preferences → noise guard → channel dispatchers, so that adding a new event type does not require manually wiring every channel in a new handler.

### Gap 2: Per-user notification preferences table

**Introducing story:** 6.4
**Explanation:** P-5.6 has no `portal_notification_preferences` table (contrast: community has `notificationRouter.route()` which reads per-conversation preferences); portal notification handlers send to all channels unconditionally (no opt-in/opt-out per event type), so Epic 6 cannot implement per-user channel preferences until the table and query layer are created in Story 6.4.

### Gap 3: Priority tier classification

**Introducing story:** 6.1A
**Explanation:** P-5.6 treats all portal notifications identically (type=`"system"` or `"message"`, no priority level); Epic 6 requires three tiers — system-critical (cannot be disabled), high-priority (default ON), and low-priority (default digest) — and these tiers must be attached to each event type at the schema level before any routing or preference story can function.

### Gap 4: Per-event-type noise guard throttle windows

**Introducing story:** 6.1B
**Explanation:** P-5.6 only throttles `portal.message.sent` (30s fixed window); all other event types (application status changes, job reviews, search alerts) have no throttle, and the single inline throttle cannot be generalized without a routing pipeline that holds per-event-type window configuration (e.g. 30s for messages, 60s for status changes, 1hr for recommendations).

### Gap 5: Outbox pattern

**Introducing story:** 6.5
**Explanation:** P-5.6 uses fire-and-forget for all notification side effects, which is acceptable for low-priority notifications but unacceptable for `application.viewed` (employer signal) and `application.hired` (seeker outcome) — these events are loss-intolerant and require a transactional `INSERT INTO portal_outbox` + 1-second poller with `FOR UPDATE SKIP LOCKED` that P-5.6 does not provide.

### Gap 6: Notification store with read state

**Introducing story:** 6.7
**Explanation:** P-5.6 uses `platform_notifications` (community-owned) which has only a boolean `isRead` field and no `read_at TIMESTAMPTZ`, `dismissed_at TIMESTAMPTZ`, `payload_json JSONB`, or `event_type VARCHAR`; Epic 6 needs a portal-owned `portal_notifications` table with these fields to support cursor-based pagination, "Mark All Read" with timestamp precision, and structured notification center payloads.

### Gap 7: Digest aggregation and scheduling

**Introducing story:** 6.6
**Explanation:** P-5.6 has no background job infrastructure for notification aggregation; the digest feature requires a scheduled job that collects all low-priority `portal_notifications` since the last digest run, deduplicates by entity (e.g. one entry per job, not one per application event), renders a batched email template, and records the digest send timestamp — none of this infrastructure exists in any current portal or community service.

### Gap 8: Retry with exponential backoff

**Introducing stories:** 6.2 (email: 3×), 6.3 (push: 2×)
**Explanation:** P-5.6 email (`enqueueEmailJob`) and push (`sendPushNotification`) are both fire-and-forget with no retry — a transient Resend API failure or push gateway timeout silently drops the notification; Epic 6 requires email to retry 3 times (1s, 5s, 30s backoff) and push to retry 2 times (2s, 10s backoff), which requires wrapping the send calls with retry loop logic neither service currently has.

### Gap 9: `application.status_changed` notification handler

**Introducing story:** 6.1B
**Explanation:** The `application.status_changed` event is defined in `PortalEventMap` and emitted by `ApplicationStateMachine`, but no notification handler exists for it in `notification-service.ts`. P-5.6 only handles `application.submitted` and `application.withdrawn`; status transitions like `shortlisted`, `interviewed`, `hired`, and `rejected` produce no seeker notification. This is a new handler — not a migration of an existing one — and Story 6.1B must create it from scratch within the routing pipeline.

### Gap 10: Dead-letter tracking

**Introducing story:** 6.5 (outbox pattern)
**Explanation:** Decision 7 specifies that the routing pipeline "owns dead-letter tracking" for retry-exhausted events, but no dead-letter table, query layer, or admin visibility exists in any current service. Story 6.5 (outbox pattern) should include a `portal_dead_letters` table or a `status = 'dead_letter'` column on `portal_outbox` rows that exhaust their retry count, so that failed critical notifications are recoverable by admins.

---

## Key Architectural Decisions

### Decision 1: `platform_notifications` vs `portal_notifications`

**Position:** Create `portal_notifications` in Story 6.7. Do not extend `platform_notifications`.

**Rationale:** `platform_notifications` is community-owned (used by community notification-service, community realtime delivery, community mark-as-read routes). Adding portal-specific columns (`event_type`, `payload_json`, `read_at`, `dismissed_at`) to this table couples the portal schema migration path to community's migration plan. A schema change to `platform_notifications` requires a coordinated deploy of both apps. `portal_notifications` can evolve independently and carry portal-specific fields without risk to community notification delivery. The idempotency key mechanism (`ON CONFLICT DO NOTHING`) must be replicated in the new table.

**Migration implication:** Existing portal notifications stored in `platform_notifications` (via P-5.6 `createNotification()` calls) will become orphaned when the portal notification center (Story 6.7) reads only from `portal_notifications`. Unread P-5.6 notifications will silently vanish from the employer's view. Story 6.7 must either: (a) include a one-time migration script that copies portal-created rows from `platform_notifications` to `portal_notifications` (identifiable by `type = 'system'` or `type = 'message'` with a portal-originated `link` pattern), or (b) accept the orphan risk with an explicit product decision that P-5.6 notifications are expendable (low volume, already delivered via push/email). The chosen approach must be documented in Story 6.7's AC.

---

### Decision 2: Routing pipeline replaces per-handler channel selection

**Position:** When 6.1B lands, portal notification handlers emit to the routing pipeline only. The routing pipeline owns all channel dispatch.

**Rationale:** The community notification-service demonstrates the mature pattern: `deliverNotification()` → `notificationRouter.route()` → channel adapters. P-5.6 skipped this in the interest of speed, embedding channel dispatch inline. With Epic 6 adding 5+ new event types and 3 priority tiers, maintaining inline dispatch per handler produces unmaintainable code (8+ handlers × 3 channels × preference checks = 24+ code paths). The routing pipeline consolidates this to: emit event → one routing entry per event type → pipeline executes channels.

**Transition plan:** Story 6.1B creates the routing pipeline. Existing P-5.6 handlers are refactored to call `notificationRouter.dispatch(event)` in place of their inline channel calls. This is a non-breaking refactor — the observable behavior (notification created, Redis publish, push sent) is unchanged.

---

### Decision 3: `publishNotificationCreated()` is absorbed into the routing pipeline's in-app channel dispatcher

**Position:** Yes — absorb it in Story 6.1B.

**Rationale:** Currently, every handler that creates a notification must manually call `publishNotificationCreated()`. This is a constraint the routing pipeline exists to remove. Once 6.1B introduces `notificationRouter.dispatch()`, the in-app channel dispatcher calls `createNotification()` followed by `publishNotificationCreated()` as an atomic pipeline step. No handler need call either function directly. Leaving `publishNotificationCreated()` as a manual per-handler call while also introducing a routing pipeline creates two code paths for real-time delivery.

---

### Decision 4: Inline message throttle migrates into routing pipeline noise guard when 6.1B lands

**Position:** The inline throttle in `portal.message.sent` handler MUST be deleted when Story 6.1B implements the noise guard. Both cannot coexist.

**Rationale:** See Pattern 3 (split-counter analysis). The INCR counter for `portal:throttle:msg:{senderId}:{recipientId}:{applicationId}` will be incremented by BOTH the inline handler and the routing pipeline noise guard if both are present. This means: first message sets count=1 in inline (creates notification) AND count=1 in pipeline (also creates notification = duplicate). Second message sees count=2 in inline (suppressed) but count=2 in pipeline — suppression is inconsistent depending on which guard runs first. The only safe state is: one throttle, one counter, one code path.

---

### Decision 5: Outbox pattern coexists with EventBus — scoped to loss-intolerant events only

**Position:** EventBus remains the backbone for all portal events. Outbox is opt-in for `application.viewed` and hired-status transitions, and any future event classified as system-critical (Story 6.1A priority tier = "system-critical").

**Rationale:** Replacing EventBus with outbox for all events would require rewriting all 20 event types and their handlers — far out of scope and unnecessary. Redis pub/sub at-most-once delivery is sufficient for high-priority and low-priority notifications because dedup (Patterns 1 and 2) catches replays. Only events where loss is NOT acceptable (outbox pattern provides at-least-once via the 1-second poller) are `application.viewed` and hired-status transitions, which have direct seeker-trust implications.

**Clarification on `application.hired`:** No discrete `application.hired` event type exists. The current mechanism is `application.status_changed` with `newStatus: "hired"`. Story 6.1A must decide: either (a) create a dedicated `application.hired` event type emitted alongside `application.status_changed`, or (b) route `application.status_changed` where `newStatus === "hired"` through the outbox conditionally. Option (b) is recommended — it avoids dual-emit complexity and lets the routing pipeline (6.1B) handle the conditional outbox path based on status value. The same pattern applies to `application.viewed`.

---

### Decision 6: Notification data contract ownership — portal owns `portal_notifications`

**Position:** After Story 6.7, `portal_notifications` is portal-owned. The community app continues to use `platform_notifications`. Neither app queries the other's notification table.

**Rationale:** Cross-app queries to notification tables (e.g. portal querying `platform_notifications` for community notifications, or vice versa) create implicit database coupling that is hard to untangle. The clean boundary is: each app owns its notification state. If a seeker needs to see BOTH community and portal notifications in one view (future feature), the aggregation happens at the API gateway level or via a cross-app event, not via a shared table.

---

### Decision 7: Error observability boundary assignment

**Position:** `withHandlerGuard` is the outermost boundary and catches all uncaught errors. Channel adapters (push-service, email-service) log transient errors internally. When Story 6.2/6.3 adds retry logic, the retry loop lives in the channel adapter and reports retry-exhaustion to the routing pipeline. The routing pipeline logs retry-exhausted events as structured errors (severity=critical) and owns dead-letter tracking. Sentry integration is added at the routing pipeline level (one Sentry capture per exhausted retry chain, not per retry attempt).

**Rationale:** Without this boundary, three independent systems (withHandlerGuard, channel adapters, routing pipeline) would each capture the same event to Sentry on a retry sequence, producing 6–9 duplicate Sentry events per failure. The routing pipeline is the right owner because it has the full context (event type, priority tier, user, delivery channel) needed to produce an actionable Sentry scope. Channel adapters log for local diagnostics only (not Sentry).

**Interface change required (6.2):** The current `enqueueEmailJob()` uses `void emailService.send().catch(...)` and returns `Promise<boolean>` — it discards the send promise, making retry-exhaustion invisible to callers. Story 6.2 must change the contract: either (a) make `enqueueEmailJob()` awaitable and return a result object with `{ sent: boolean, retriesExhausted: boolean }`, or (b) replace fire-and-forget with an internal retry loop that reports exhaustion via structured log only (routing pipeline reads logs, not return values). The same applies to `sendPushNotification()` in Story 6.3.
