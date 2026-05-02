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
