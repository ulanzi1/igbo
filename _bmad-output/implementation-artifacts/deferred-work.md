# Deferred Work

## Deferred from: code review of p-5-1a-messaging-data-model-extension (2026-04-22)

- Hardcoded OBIGBO title replaces i18n `{t("title")}` in `apps/community/src/app/[locale]/(guest)/page.tsx:41-43`. Separate commit `c67bccda` — Igbo locale users see English-only title. Fix: restore `{t("title")}` or create styled bilingual variant.

## Deferred from: code review of p-5-3-read-receipts-typing-indicators (2026-04-23)

- `onTyping` callback in MessageInput fires on every keystroke including when textarea is empty (backspace on empty field). Emits typing:start with empty compose box, showing misleading typing indicator to recipient. Fix: guard `onTyping?.()` with `newValue.trim().length > 0` check, and call `onTypingStop?.()` when field is cleared.

## Deferred from: code review of p-5-5-messaging-entry-points-access-control (2026-04-24)

- W1: No AbortController on candidate-side-panel conversation status fetch (`candidate-side-panel.tsx:110-128`). Rapid `applicationId` changes can cause stale status responses to set `convUnreadCount` for the wrong application. Follows existing pattern in the same component's detail fetch — address both together.
- W2: No AbortController on MessagingDrawer status fetch (`MessagingDrawer.tsx:33-52`). Same pattern as W1 — toggling open/close rapidly can cause race conditions on status state.
- W3: `getUnreadCountForConversation` SQL counts all non-self messages after `last_read_at`, including system messages (`chat-conversations.ts:572-589`). Portal conversations may not have system messages yet. Revisit if/when system messages are added to portal conversations.
- W4: POST `/api/v1/conversations/[applicationId]/read` fires on every mount of `usePortalMessages` with no dedup (`use-portal-messages.ts:99`). Idempotent (`SET last_read_at = NOW()`), but wasteful under rapid navigation. Consider throttle or conditional check.
- W5: `ApplicationMessagingSection` does not subscribe to `message:new` socket events for real-time unread count updates. Minor AC #2 gap — nav badge updates via `useUnreadMessageCount`, but per-page badge is stale until refresh.
- W6: Conversation detail page `.catch()` returns `{ exists: false }`, redirecting seekers on transient DB errors. Fail-closed is intentional, but seeker redirect is aggressive for temporary outages.
- W7: `useUnreadMessageCount` fires two fetches on first mount — initial fetch + false-positive reconnect detection from socket `isConnected` transition. Functionally harmless (same data returned).
- W8: `Dockerfile.realtime` modified (port 3001→3002, npm prune removal) in P-5.5 commit — infrastructure change bundled outside story scope.

## Deferred from: code review of p-5-6-message-notifications-integration (2026-04-24)

- F10: `content.slice(0,50)` can split surrogate pairs/emoji. `String.slice()` operates on UTF-16 code units, not grapheme clusters. Multi-byte emoji at position 49-50 would produce a malformed character. Low risk for current user base (Igbo text is mostly BMP). Fix: use `Array.from(content).slice(0,50).join("")` for Unicode-safe truncation.

## Deferred from: code review of portal-epic-5-ai-29-handler-guard-standardization (2026-04-25)

- F4: `String(err)` loses stack traces in guard log (`handler-guard.ts:26`). Pre-existing pattern across all handlers. Fix: use `err instanceof Error ? err.stack ?? String(err) : String(err)` for better debuggability in centralized error handler.
- F5: notification-service EventBus handler payload destructuring without `?? {}` guard (`notification-service.ts:79, 500`). Pre-existing pattern. AI-28 Zod validation at emit prevents null payloads in practice. Fix: add `?? {}` to destructuring for defense-in-depth.

## Deferred from: code review of p-6-1b-notification-routing-pipeline, Chunk 1: @igbo/config (2026-04-30)

- C1-W1: AC#1 and task descriptions in story still reference "11 event types" — spec predates post-review addition of `portal.application.withdrawn`; code is correct, spec doc should be updated to say 12 when story closes.
- C1-W2: `getDedupTtlSeconds`, `isSystemCritical`, `isHighPriority`, `isLowPriority` all accept `string` not `PortalNotificationEventType` — no compile-time enforcement for callers. Pre-existing pattern across all priority helpers in `packages/config/src/notifications.ts`.
- C1-W3: `portal.application.withdrawn` absent from THROTTLE_WINDOWS without explanatory comment — intentional (withdrawal is structurally non-repeatable per application). Worth a short inline comment to distinguish deliberate omission from oversight.
- C1-W4: No `PortalApplicationWithdrawnNotification` typed interface in notifications.ts — catalog entry and handler work without it; interface would formalize the typed contract. Low priority.
- C1-W5: `THROTTLE_WINDOWS["portal.match.new_recommendations"] = 3600` is set on a reserved event type. P-7.x implementers who don't check THROTTLE_WINDOWS will be surprised by the 1-hour noise guard. Consider a comment in the THROTTLE_WINDOWS map noting the reserved entries.

## Deferred from: code review of p-6-1b-notification-routing-pipeline, Chunk 3: notification-service (2026-04-30)

- C3-W1: `application.withdrawn` derives `employerUserId` from `company.ownerUserId` DB lookup while `application.submitted` uses denormalized `employerUserId` from event payload — event contract difference; standardize when `ApplicationWithdrawnEvent` is enriched with `employerUserId`. [notification-service.ts:254]
- C3-W2: `newStatus` interpolated raw into user-facing notification body (e.g., `"pending_review"`) — pre-existing copy issue; i18n label mapping out of scope for P-6.1B. [notification-service.ts:685]
- C3-W3: `throttleKey` uses `applicationId` which could be empty string → degenerate `portal:throttle:msg:{id}:{id}:` key; type contract (non-nullable string) + AI-28 Zod protect at emit. [notification-service.ts:579]
- C3-W4: `job.expired` passes `employerUserId` from event payload with no empty-string guard — type contract says `string` (non-nullable); acceptable but diverges from `application.withdrawn` runtime validation pattern. [notification-service.ts:744]
- C3-W5: `notifBody` in `portal.message.sent` not HTML-stripped (only push `plainPreview` is) — in-app notification body may contain raw HTML; pre-existing from P-5.6 design; notification sanitization out of scope. [notification-service.ts:569]
- C3-W6: Test count is 81 vs AC#10 stated 80 — benign one-test overcount; spec doc artifact from story template.

## Deferred from: code review of p-6-1b-notification-routing-pipeline, Chunk 2: notification-router (2026-04-30)

- C2-W1: `resolveChannels` returns live catalog object reference — no current mutation, but callers hold a shared reference. Add `{ ...entry.defaultChannels }` defensive spread if mutation is ever needed. [notification-router.ts:64]
- C2-W2: Throttle check (Step 3) not bypassed for system-critical events — latent footgun if a future editor adds a THROTTLE_WINDOWS entry for a system-critical event. Currently safe (no system-critical entry in THROTTLE_WINDOWS). A comment noting the invariant would help. [notification-router.ts:194]
- C2-W3: `Promise.allSettled` rejection loop is dead code — all `dispatches` entries have `.catch()` attached, so `allSettled` never yields `rejected`. Remove the loop or add a clarifying comment. [notification-router.ts:285]
- C2-W4: Multiple `getRedisClient()` calls per dispatch (throttle check + dispatchInApp publish) — harmless if client is a singleton/pool, but no explicit pool guarantee surfaced in tests. [notification-router.ts:103, 167]
- C2-W5: `dispatchInApp` `redis.publish` bare await — publish failure after successful DB insert loses real-time delivery silently; notification appears in DB but never reaches the socket. Architectural limitation; Story 6.5 (outbox pattern) addresses. [notification-router.ts:168]
- C2-W6: `eventId` and `notificationId` both set to `notif.id` in `NotificationCreatedEvent` payload — violates `BaseEvent.eventId` semantic (should be a distinct event UUID). No behavioral impact on current bridge. [notification-router.ts:155]

## Deferred from: code review of portal-epic-5-notification-pattern-assessment (2026-04-26)

- D1: "Binding constraint" language in decision doc used without defining enforcement mechanism (no CI check, linter, or PR gate). Process concern — decision documents cannot self-enforce. Consider adding a code-review checklist item for Epic 6 that verifies decision doc constraints.
- D2: Push dedup tag namespace (`push:{userId}:{tag}`) has collision risk across event types using similar tag formats. Pre-existing push-service design — revisit when 6.3 adds retry logic.
- D3: Redis NX dedup 15-min TTL shorter than potential outbox retry window (>15min outage). Already flagged as 6.1A follow-up in Pattern 1 critical note — no action until priority tiers defined.
- D4: `job.reviewed` replay triggers unbounded `saved_search.new_result` emissions with redundant DB queries (no short-circuit for N matching searches). Pre-existing notification-service design.

## Deferred from: code review of notification-pattern-assessment (2026-04-26)
### (Earlier review pass — AI-29/AI-30 broader context)

- W1: Pre-validation placeholder fragility — `validate()` calls use `""` and `"pre-validate"` as placeholder IDs before DB insert. If schemas add `.uuid()` or `.min(1)`, pre-validation breaks message sending and application submission. Fix: add a comment per call site documenting placeholder constraint; consider a `validateShape()` variant that strips refinements. (`conversation-service.ts`, `application-submission-service.ts`)
- W2: `sendPushNotification` boolean return cannot distinguish skip reasons (VAPID not configured vs dedup-skipped vs no subscriptions). No operational impact today (return ignored). Revisit when Story 6.3 adds retry logic — retry should only trigger on failure, not on dedup skip. (`push-service.ts`)
- W3: Community `delivered:{messageId}:{userId}` lacks app prefix — inconsistent with portal `delivered:portal:{messageId}:{userId}`. Both allowlisted. Fix belongs to a dedicated Redis key migration story that migrates all legacy community keys to `community:delivered:{id}:{userId}`. (`apps/community/src/server/realtime/namespaces/chat.ts`)
- W4: `withHandlerGuard` last-arg ack heuristic — assumes last argument is Socket.IO ack callback. Fragile if future handler signatures include a trailing function that is not an ack. No current risk. (`packages/config/src/handler-guard.ts`)
- W5: Smoke test relies on eventbus-bridge auto-join to move socket from `ROOM_USER` to `ROOM_CONVERSATION`. The test correctly exercises this behavior; if bridge changes, the test will catch it. Documenting as known design dependency. (`packages/integration-tests/portal-cross-container-smoke.test.ts`)
- W6: Redis key scanner regex misses dynamically constructed keys (e.g., `[prefix, id].join(":")`, variable-prefix templates). Known heuristic limitation — AST-based scanner would eliminate false negatives. (`scripts/ci-checks/check-redis-keys.ts`)
- W7: `emitLocal()` bypasses Zod validation — cross-container Redis events not schema-checked. Intentional: portal cannot validate community-originated events against portal schemas. Consider adding schema validation in eventbus-bridge for known cross-app events. (`apps/portal/src/services/event-bus.ts`)
- W8: Redis INCR+EXPIRE pipeline in message throttle is not atomic — EXPIRE can fail after INCR, leaving key without TTL and permanently suppressing notifications for the affected triple. Risk is acknowledged in code comments. Fix: use Lua script (infrastructure already exists in `src/lib/lua/`). Track with points-engine Lua migration. (`apps/portal/src/services/notification-service.ts`)
- W9: `sendPushNotification` dedup skipped when `payload.tag` is undefined — tagless notifications have no replay protection. All current callers pass a tag. Guard rail for future callers. (`apps/portal/src/services/push-service.ts`)
- W10: `EVENT_DEDUP_KEY` in `events.ts` uses raw `event:dedup:{eventId}` — no app-scoping; exempt from scanner. No collision risk today (portal only). Migrate to `portal:dedup:event:{id}` in a future cleanup story. (`packages/config/src/events.ts`)
- W11: Partial unique index on `idempotency_key` exists only in SQL migration, not in Drizzle schema definition. `drizzle-kit push` would drop the index. Project hand-writes all migrations (drizzle-kit generate disabled per MEMORY.md), so risk is theoretical. Add a comment in the schema file warning against `drizzle-kit push`. (`packages/db/src/schema/platform-notifications.ts`)
- W12: `saved_search.new_result` handler has no Redis NX dedup — relies on DB-level idempotencyKey only. DB dedup prevents duplicate notifications; Redis dedup would prevent unnecessary `getSavedSearchById` + `evaluateInstantAlert` DB reads on event replay. Optimization-only fix. (`apps/portal/src/services/notification-service.ts`)

## Deferred from: code review of p-6-1a-notification-event-types-contracts (2026-04-26)

- No `isKnownEventType()` guard — `isSystemCritical/isHighPriority/isLowPriority` accept `string` and silently return `false` for unknown inputs with no way to distinguish "valid event, wrong tier" from "invalid event type". Useful for 6.1B routing pipeline to add as upstream guard. (`packages/config/src/notifications.ts:315-329`)
- `application.withdrawn` handler produces user-facing employer notifications but has no `PortalNotificationEventType` catalog entry. Intentionally excluded per spec ("Events NOT in this catalog" section). Revisit if 6.1B routing pipeline needs withdrawal classification or if 6.4 preferences UI needs a toggle for withdrawals. (`apps/portal/src/services/notification-service.ts`)
- `publishNotificationCreated` has 8 positional string params — swap risk grows with future additions. Consider refactoring to named params object when 6.1B adds more fields. (`apps/portal/src/services/notification-service.ts:35-59`)
- Throttle INCR/EXPIRE non-atomicity — EXPIRE failure result never checked; permanent notification suppression possible for affected sender-recipient-application triple. Pre-existing issue (also tracked as W8 from earlier review). (`apps/portal/src/services/notification-service.ts:583-589`)

## Deferred from: code review of p-6-1b-notification-routing-pipeline (2026-04-26)

- F4: Dedup-then-crash gap — if handler Redis NX dedup succeeds but `createNotification()` subsequently throws (DB down), the dedup key is consumed and retries are deduped, permanently losing the notification. Requires outbox/transactional approach (Story 6.5 scope). Pre-existing architectural limitation. (`notification-router.ts:131`, all handler dedup blocks)
- F5: Double-dedup race between handler NX and router throttle in multi-instance deployment — for events with both handler dedup AND THROTTLE_WINDOWS entry (portal.message.received, portal.application.status_changed), two concurrent instances can race such that Instance A wins handler dedup but gets throttled, Instance B loses handler dedup. Net: zero notifications. Narrow window, pre-existing pattern (same issue existed with inline INCR/EXPIRE). (`notification-service.ts` + `notification-router.ts`)

## Deferred from: code review of p-6-1b-notification-routing-pipeline, Chunk 4: conversation-service (2026-04-30)

- C4-W1: No access-control check in the `conv == null` early-return path of `getPortalConversationMessages` — when no conversation exists, any authenticated user who knows the `applicationId` receives `{ messages: [], hasMore: false }` without membership check. Mitigated by route-level `requireAuthenticatedSession()`. Revisit if function is called from contexts with weaker auth, or if `applicationId` confidentiality requirements increase. (`conversation-service.ts:459-462`)

## Deferred from: code review of p-6-2-email-notifications (2026-05-01)

- F5: `enqueueEmailJob` Redis dedup key persists after send failure — 15min window where email is permanently lost on event replay. Pre-existing design from P-2.5B. Outbox pattern (Story 6.5) will address by moving to transactional send-then-dedup. (`email-service.ts:167-177`)
- F6: All email templates greet with company name instead of employer's personal name — produces grammatically awkward emails ("Hello Acme Corp"). Product decision, consistent across all 7 templates. Requires template interface change + handler data enrichment. (`application-submitted-employer.ts:14`, `job-approved.ts:13`, etc.)
- F7: `job-rejected` template cannot include rejection reason — `JobReviewedEvent` lacks `reason` field. Template handles optional reason gracefully. Enriching the event payload is out of P-6.2 scope. (`job-rejected.ts:7`, `config/events.ts`)
- F8: No retry jitter in `sendWithRetry` — thundering herd risk at scale with fixed 1s/5s/30s delays. Low impact at current volume. Revisit with outbox pattern (Story 6.5). (`email-service.ts:35`)
- F9: No retry filtering by error type — retries permanent failures (401 invalid API key, 422 malformed payload). Acceptable for MVP. Revisit with outbox pattern. (`email-service.ts:80-100`)

## Deferred from: code review of p-6-3-push-in-app-notifications-delivery-guarantees (2026-05-01)

- F16: `notification:read` dual-emitted to `/portal` namespace but no portal client listener registered — badge decrement on read intentionally deferred to P-6.7 per spec AC #6. (`use-notification-toast.ts`)
- F17: `unread:update` event emitted to `/portal` but portal badge uses `notification:new` increment, not `unread:update` — unused signal on portal side; intentional design. (`eventbus-bridge.ts`)
- F18: `application.withdrawn` handler sends no employer email — asymmetric with all other handlers. Pre-existing gap predating P-6.3. (`notification-service.ts`, withdrawn handler)
- F19: `application.status_changed` pushPayload wired for all statuses including non-email-eligible ones (e.g., `under_review`). Email has `EMAIL_ELIGIBLE_STATUSES` filter; push does not. Design inconsistency; push filtering out of P-6.3 scope. (`notification-service.ts:900-907`)
- F20: `job.reviewed` handler accesses `company.ownerUserId` before null guard on line 546 — valid left-join miss could throw TypeError. Pre-existing bug predating P-6.3. (`notification-service.ts:546`)
- F21: `status_changed` push body exposes raw DB enum value to OS-level push notification (lock screen visible). Pre-existing pattern from P-6.1B in-app content. Requires locale-aware status label mapping (tracked as F10/C3-W2). (`notification-service.ts:902`)
- F23: `syncFromServer` fires on every socket `connect` event with no debounce — thundering herd on mass reconnect. Acceptable at current scale. (`use-notification-toast.ts:53`)

## Deferred from: code review of p-6-4-notification-preferences-priority-hierarchy (2026-05-01)

- W1: Race condition — resolveChannels cache write after concurrent PUT del re-caches stale data for up to 60s. Bounded by TTL. (`notification-router.ts resolveChannels`)
- W2: setQuietHours UPDATE-then-SELECT is non-atomic — concurrent requests could race between UPDATE and SELECT. Pre-existing DB code. (`notification-preferences.ts`)
- W3: upsertNotificationPreference INSERT defaults (inApp:true, email:false, push:false) don't match catalog defaults for the event type. Pre-existing DB code. (`notification-preferences.ts`)
- W4: Optimistic revert on failed toggle uses `!value` — rapid toggles can drift UI state from server state. Minor UI glitch, no data corruption. (`NotificationPreferencesPageContent.tsx handleToggle`)
- W5: DST transition causes ~1 hour of incorrect quiet hours behavior — `isInQuietHours` uses minute-based comparison that doesn't account for spring-forward/fall-back. Pre-existing in `notification-preferences.ts`.
- W6: GET /quiet-hours reads `Object.values(prefs)[0]` — non-deterministic if rows diverge; safe in practice since `setQuietHours` updates all rows atomically. Inline code comment documents the limitation. (`quiet-hours/route.ts:44`)
- W7: `urgencyOverride` in `NotificationPayload` is unused — `applyPriorityRules` result is overwritten by `resolveChannels` in `dispatchNotification` pipeline; pre-existing design, any caller setting `urgencyOverride` has no effect. (`notification-router.ts`)
- W8: `digestMode` defaults to `"none"` for all event types including low-priority — AC #1 specifies "default digest" for low-priority; `digestMode` is not yet consumed by any job; will be addressed in P-6.6. (`preferences/route.ts`)
- W9: `applyQuietHours` calls `isSystemCritical` outside try/catch — `applyPriorityRules` wraps the same call in try/catch for consistency; `isSystemCritical` is synchronous and reads a constant catalog so throwing in production is essentially impossible. (`notification-router.ts`)

## Deferred from: code review of p-6-5-viewed-by-employer-signal-outbox-pattern (2026-05-02)

- W1: Failed outbox events (`status='failed'`) accumulate indefinitely — `cleanupProcessedOutboxEvents` only deletes `status='processed'`. No admin UI, dead-letter queue, or alerting for permanently failed events. Future: add admin inspection/cleanup or extend cleanup to purge failed events after longer retention. (`portal-outbox.ts:85-93`)
- W2: No retry backoff for poison events — events that always fail processing are retried on every batch cycle until hitting MAX_RETRIES (10). During those 10 cycles, the poison event is fetched first (oldest `created_at`) and blocks newer events in serial processing. Future: add `retry_count` backoff filter or priority ordering. (`portal-outbox.ts:34-42`)
- W3: `portal_outbox.status` is plain `VARCHAR(20)` with no CHECK constraint or PostgreSQL enum — typos in status string assignments could silently create unprocessable rows. Partial index `WHERE status = 'pending'` would miss misspelled statuses. Future: add `CHECK (status IN ('pending', 'processed', 'failed'))` in a follow-up migration. (`portal-outbox.ts:10`)
- W4: No index on `employer_user_id` alone in `portal_application_views` — composite PK `(application_id, employer_user_id)` supports lookups by `application_id` but not by `employer_user_id` alone. CASCADE delete on employer user requires sequential scan. Low impact at current scale. (`0076_application_viewed_outbox.sql`)
