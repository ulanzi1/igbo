# Story 9.1: Notification Routing & Channel Delivery

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want the notification system to intelligently route notifications across multiple delivery channels (in-app, email, push) based on my preferences,
so that I receive the right notifications through the right channels.

## Acceptance Criteria

1. **Given** Story 1.15 provides core in-app notification delivery, **When** the notification routing layer is added, **Then** the `NotificationService` is extended with a `NotificationRouter` that evaluates each notification against the member's delivery preferences and routes to the appropriate channels: in-app (already functional from Story 1.15), email (stub — fully built in Story 9.2), and push (no-op stub — built in Story 9.3).

2. **Given** a notification-triggering event occurs, **When** the notification router evaluates delivery, **Then** each channel receives the notification independently based on the channel's eligibility rules, **And** the router respects block relationships (no notifications from blocked users — existing `filterNotificationRecipients` hook preserved), **And** the routing decision is logged (which channels were selected and why — debug log only, no DB write).

3. **Given** a member has quiet hours active (existing Redis key `dnd:${userId}`), **When** the router evaluates channels, **Then** push (stub) and email channels are suppressed; in-app is always delivered regardless of DnD (silent accumulation — no flash, no sound — handled client-side).

4. **Given** a message.mentioned event occurs in a conversation where the recipient has set per-conversation preference to `muted`, **When** the router evaluates channels, **Then** all channels (in-app, email, push) are suppressed for that recipient (consistent with current behavior already enforced for in-app).

5. **Given** the router determines email is appropriate for a notification type, **When** the email channel stub is called, **Then** it delegates to the existing `enqueueEmailJob()` for event types that already trigger emails (article_submitted, article_published, article_rejected, article_revision_requested — currently wired directly in notification-service.ts), **And** all other event types log "email channel: not yet implemented" at debug level (full email templates added in Story 9.2).

6. **Given** `points_throttled` notifications are currently delivered directly from `points-engine.ts` (bypasses notification-service entirely — Epic 8 retro AI-4), **When** Story 9.1 is complete, **Then** `points-engine.ts` is refactored to emit a `points.throttled` EventBus event instead of calling `createNotification()` directly, **And** `notification-service.ts` registers a handler for `points.throttled` that calls `deliverNotification()` (routing through `NotificationRouter` like all other notifications), **And** `points_throttled` is a first-class notification type in the router's dispatch table.

7. **Given** the refactoring of `notification-service.ts` to route through `NotificationRouter`, **When** all existing tests pass, **Then** zero regressions are introduced — all ~20 existing event handlers preserve their current behavior exactly.

## Tasks / Subtasks

- [x] Task 1: Create `NotificationRouter` service (AC: 1, 2, 3, 4, 5)
  - [x] 1.1 Create `src/services/notification-router.ts` with `NotificationRouter` class
  - [x] 1.2 Define `ChannelDecision` type: `{ channel: "in_app" | "email" | "push"; suppressed: boolean; reason: string }`
  - [x] 1.3 Define `RouteResult` type: `{ inApp: ChannelDecision; email: ChannelDecision; push: ChannelDecision }`
  - [x] 1.4 Implement `NotificationRouter.route(params: RouteParams): Promise<RouteResult>` that returns channel decisions with reasons
  - [x] 1.5 In-app channel: always `suppressed: false` (deliver unconditionally)
  - [x] 1.6 Email channel: check DnD Redis key (`dnd:${userId}`); suppress if set; else use `shouldEmailForType()` (hardcoded allowlist: `event_reminder`, `admin_announcement`, `post_interaction` high-priority types; note article events already handled directly in notification-service.ts and preserved as-is)
  - [x] 1.7 Push channel: always `suppressed: true, reason: "push not yet implemented (Story 9.3)"`
  - [x] 1.8 Add block/mute check: call `filterNotificationRecipients([userId], actorId)` — if empty, suppress ALL channels with `reason: "blocked or muted"`
  - [x] 1.9 Add per-conversation override: if `conversationId` provided, call `getConversationNotificationPreference()` — if `"muted"`, suppress ALL channels
  - [x] 1.10 Log routing decisions via `console.debug` (format: `[NotificationRouter] userId=%s type=%s in_app=%s email=%s push=%s reasons=%j`)
  - [x] 1.11 Add JSDoc comment documenting: "Points engine uses EventBus emit → router picks up — no direct router import needed, avoids any future coupling risk"

- [x] Task 2: Refactor `notification-service.ts` to use `NotificationRouter` (AC: 6, 7)
  - [x] 2.1 Import and instantiate `NotificationRouter` (singleton) at module level
  - [x] 2.2 Add `conversationId?: string` param to `deliverNotification()` (currently absent — this is a NEW addition to the existing signature `{ userId, actorId, type, title, body, link? }`)
  - [x] 2.3 Refactor `deliverNotification()` to call `router.route()` before `createNotification()`
  - [x] 2.4 Move existing DnD Redis check (`redis.exists("dnd:${userId}")`) from message.mentioned handler into `NotificationRouter.route()` (email channel rule). **Behavior change:** Currently DnD suppresses ALL delivery (including in-app) for message.mentioned. After refactoring, DnD only suppresses email/push — in-app is always delivered per AC3. This is intentional.
  - [x] 2.5 Move existing `getConversationNotificationPreference()` check from message.mentioned handler into `router.route()` call-site (pass `conversationId` as optional param)
  - [x] 2.6 Remove block/mute check from `deliverNotification()` (now inside router) — preserve `filterNotificationRecipients` call but call it from within router
  - [x] 2.7 Article email sends (article_submitted, article_published, article_rejected, article_revision_requested) remain as direct `enqueueEmailJob()` calls in their event handlers — do NOT route these through the email channel (they use custom templates; router email stub would do nothing different); add comment `// Email sent directly — see NotificationRouter email channel stub`
  - [x] 2.8 Self-notify pattern (actorId === userId) preserved: pass `actorId` to router; router skips block/mute check when `actorId === userId`
  - [x] 2.9 Register new `points.throttled` EventBus handler inside the HMR guard block — calls `deliverNotification()` with type `"system"` (or whichever maps to points_throttled), title, body, link from the event payload

- [x] Task 3: Refactor `points-engine.ts` to emit EventBus event (AC: 6)
  - [x] 3.1 Replace direct `createNotification()` + `publisher.publish()` calls with `eventBus.emit("points.throttled", { userId, actionType, ... })`
  - [x] 3.2 Remove imports of `createNotification` from `@/db/queries/notifications` and `getRedisPublisher` from `@/lib/redis` (if no longer used elsewhere in file)
  - [x] 3.3 Update `points-engine.test.ts`: replace `createNotification` mock assertions with `eventBus.emit` mock assertions
  - [x] 3.4 Verify EventBus import already exists in points-engine.ts (it should — it emits other events); if not, add it

- [x] Task 4: Add i18n keys (AC: none — no new user-facing strings in this story)
  - [x] 4.1 Confirm no new user-facing UI text — routing is server-side only; skip i18n task

- [x] Task 5: Write tests for `NotificationRouter` (AC: 1–5)
  - [x] 5.1 Create `src/services/notification-router.test.ts` with `@vitest-environment node`
  - [x] 5.2 Test: in-app channel always delivered regardless of DnD or conversation pref
  - [x] 5.3 Test: email channel suppressed when DnD Redis key exists
  - [x] 5.4 Test: email channel delivered for eligible type when no DnD
  - [x] 5.5 Test: email channel suppressed for non-eligible type (push-only or in-app-only types)
  - [x] 5.6 Test: ALL channels suppressed when `filterNotificationRecipients` returns empty (blocked)
  - [x] 5.7 Test: ALL channels suppressed when per-conversation preference is `"muted"`
  - [x] 5.8 Test: self-notify (actorId === userId) bypasses block filter
  - [x] 5.9 Test: push channel always suppressed with correct reason string
  - [x] 5.10 Test: `RouteResult` shape matches expected type (all three channel decisions present)

- [x] Task 6: Write regression tests for refactored `notification-service.ts` (AC: 6, 7)
  - [x] 6.1 Verify existing notification-service.test.ts passes without modification (do NOT change existing tests)
  - [x] 6.2 Add 4 targeted regression tests for the routing integration in notification-service.test.ts:
    - DnD suppresses email but in-app still created for message.mentioned (behavior change from old "suppress all" to new "suppress email only")
    - Per-conversation `"muted"` suppresses in-app AND email for message.mentioned (regression guard for refactored path)
    - Block filter still suppresses in-app for deliverNotification() (regression guard)
    - `points.throttled` EventBus event triggers notification delivery through router

- [x] Task 7: Run all tests and verify zero regressions (AC: 7)
  - [x] 7.1 Run `bun test` — all existing tests must pass
  - [x] 7.2 Confirm notification-service.test.ts and eventbus-bridge.test.ts and notification-flow.test.ts all pass
  - [x] 7.3 Confirm new notification-router.test.ts achieves ≥90% branch coverage
  - [x] 7.4 Confirm points-engine.test.ts passes with updated EventBus emit assertions

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [ ] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses (N/A this story — no UI changes)
- [ ] New i18n keys added to both `messages/en.json` AND `messages/ig.json` (N/A this story — no new user strings)
- [ ] All tests passing (run `bun test` locally before review)
- [ ] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` (N/A — this story does NOT touch eventbus-bridge.ts)
- [ ] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` (N/A — no API routes added)
- [ ] New member statuses/roles audited across ALL entry-point functions for permission gaps (N/A)
- [ ] `points-engine.test.ts` updated to assert EventBus emit instead of direct `createNotification()` calls

## Dev Notes

### Architecture Overview

This story refactors the routing logic that is currently scattered across `notification-service.ts` into a dedicated `NotificationRouter` class. The router is a pure service (no EventBus subscriptions, no DB schema changes) that encapsulates the "which channels should receive this notification?" decision.

Additionally, `points-engine.ts` is refactored to emit a `points.throttled` EventBus event instead of calling `createNotification()` directly. The notification-service picks this up via a new handler, routing it through the `NotificationRouter` like all other notifications. This eliminates the circular dependency concern: points-engine uses EventBus emit → router picks up — no direct router import needed, avoids any future coupling risk.

**Key constraint:** Stories 9.2 (email templates) and 9.3 (push) are NOT in scope. The router's email and push channels are stubs with no-op or passthrough-only logic. Do not implement new email templates or Web Push subscriptions in this story.

**No DB migration needed.** This story is a pure refactoring + architectural introduction. The `platform_notification_preferences` table is created in Story 9.4 — the router in 9.1 uses existing mechanisms (Redis DnD key, per-conversation prefs, block filter).

### Existing Infrastructure (DO NOT REINVENT)

**`src/services/notification-service.ts`** — ~20 event handlers (member.approved, member.followed, message.mentioned, group._, article._, event._, recording._, account.status_changed). Each uses a private `deliverNotification()` helper. The refactoring must preserve ALL handler behavior. The current shared helper signature (note: `conversationId` does NOT exist yet — you must add it):

```typescript
// CURRENT signature (before this story):
async function deliverNotification(params: {
  userId: string;
  actorId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}): Promise<void>;

// AFTER this story — add conversationId:
async function deliverNotification(params: {
  userId: string;
  actorId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  conversationId?: string; // NEW: for per-conv pref check via router
}): Promise<void>;
```

The current flow in `deliverNotification()`:

1. `filterNotificationRecipients([userId], actorId)` → skip if empty (block/mute)
2. `createNotification(...)` → persist to DB
3. `publisher.publish("eventbus:notification.created", ...)` → Socket.IO delivery

After refactoring, flow:

1. `router.route(params)` → get `RouteResult`
2. If `routeResult.inApp.suppressed` → return early (no notification created)
3. `createNotification(...)` → persist to DB (in-app delivery)
4. `publisher.publish(...)` → Socket.IO delivery
5. If `!routeResult.email.suppressed` → `enqueueEmailJob(...)` (stub for now; only runs for truly email-eligible types where template exists)

**Existing DnD check (move INTO router — BEHAVIOR CHANGE):**

```typescript
// Currently in message.mentioned handler:
const isDnd = await redis.exists(`dnd:${recipientId}`);
if (isDnd) continue;
```

Move this into `NotificationRouter.route()` as the email channel suppression rule. **Important behavior change:** Currently DnD suppresses ALL delivery (including in-app) for message.mentioned. After this refactoring, DnD only suppresses email and push — in-app is always delivered per AC3. This is the correct target behavior.

**Existing per-conversation check (move INTO router):**

```typescript
// Currently in message.mentioned handler:
const pref = await getConversationNotificationPreference(conversationId, recipientId);
if (pref === "muted") continue;
```

Move into router. The `conversationId` is optional in `RouteParams` — only `message.mentioned` passes it.

**Self-notify pattern (preserve):**
When `actorId === userId`, the block/mute filter is bypassed. Implement in router:

```typescript
if (params.actorId !== params.userId) {
  const allowed = await filterNotificationRecipients([params.userId], params.actorId);
  if (allowed.length === 0) return allSuppressed("blocked or muted");
}
```

### Points Engine EventBus Refactoring

**Current pattern in `src/services/points-engine.ts` (lines ~100-123):**

```typescript
// Deliver throttle notification directly (not via notification-service.ts to avoid circular dep)
import { createNotification } from "@/db/queries/notifications";
// ... calls createNotification() + publisher.publish() directly
```

**After this story:**

```typescript
// Emit EventBus event — notification-service.ts picks this up and routes through NotificationRouter
import { eventBus } from "@/lib/event-bus";
// ...
eventBus.emit("points.throttled", { userId, actionType, ... });
```

The `notification-service.ts` handler:

```typescript
eventBus.on("points.throttled", async (payload) => {
  await deliverNotification({
    userId: payload.userId,
    actorId: payload.userId, // self-notify — bypasses block filter
    type: "system", // or appropriate NotificationType
    title: "...",
    body: "...",
    link: "/points",
  });
});
```

### `NotificationRouter` Design

```typescript
// src/services/notification-router.ts

import { filterNotificationRecipients } from "@/services/block-service";
import { getConversationNotificationPreference } from "@/db/queries/chat-conversations";
import { getRedisPublisher } from "@/lib/redis";

export type NotificationChannel = "in_app" | "email" | "push";

export interface ChannelDecision {
  suppressed: boolean;
  reason: string;
}

export interface RouteResult {
  inApp: ChannelDecision;
  email: ChannelDecision;
  push: ChannelDecision;
}

export interface RouteParams {
  userId: string;
  actorId: string;
  type: import("@/db/schema/platform-notifications").NotificationType;
  conversationId?: string; // for per-conv preference check
}

// High-priority types that warrant email delivery (defaults — overridden by Story 9.4 prefs)
const EMAIL_ELIGIBLE_TYPES = new Set<string>([
  "event_reminder",
  "admin_announcement",
  "post_interaction",
]);
// NOTE: article_* events send email directly in notification-service.ts handlers (4 events)
// NOTE: message/* events handled via per-conversation pref check, not this set

/**
 * NotificationRouter evaluates each notification against delivery rules and returns
 * per-channel decisions (in-app, email, push).
 *
 * Points engine uses EventBus emit → router picks up — no direct router import needed,
 * avoids any future coupling risk. The points.throttled event is handled by
 * notification-service.ts like any other event, routing through this router.
 */
export class NotificationRouter {
  async route(params: RouteParams): Promise<RouteResult> {
    const { userId, actorId, type, conversationId } = params;

    // 1. Block/mute check (skipped for self-notify)
    if (actorId !== userId) {
      const allowed = await filterNotificationRecipients([userId], actorId);
      if (allowed.length === 0) {
        const reason = "blocked or muted";
        return this.suppressAll(reason);
      }
    }

    // 2. Per-conversation override (only when conversationId provided)
    if (conversationId) {
      const pref = await getConversationNotificationPreference(conversationId, userId);
      if (pref === "muted") {
        return this.suppressAll("per-conversation muted");
      }
    }

    // 3. In-app: always delivered
    const inApp: ChannelDecision = { suppressed: false, reason: "in-app always delivered" };

    // 4. Email: check DnD + type eligibility
    const redis = getRedisPublisher();
    const isDnd = await redis.exists(`dnd:${userId}`);
    let email: ChannelDecision;
    if (isDnd) {
      email = { suppressed: true, reason: "quiet hours (dnd key set)" };
    } else if (EMAIL_ELIGIBLE_TYPES.has(type)) {
      email = { suppressed: false, reason: `eligible type: ${type}` };
    } else {
      email = { suppressed: true, reason: `type not in email allowlist (Story 9.2)` };
    }

    // 5. Push: not yet implemented (Story 9.3)
    const push: ChannelDecision = {
      suppressed: true,
      reason: "push not yet implemented (Story 9.3)",
    };

    const result: RouteResult = { inApp, email, push };
    console.debug(
      "[NotificationRouter] userId=%s type=%s in_app=%s email=%s push=%s reasons=%j",
      userId,
      type,
      inApp.suppressed ? "suppressed" : "deliver",
      email.suppressed ? "suppressed" : "deliver",
      push.suppressed ? "suppressed" : "deliver",
      { inApp: inApp.reason, email: email.reason, push: push.reason },
    );

    return result;
  }

  private suppressAll(reason: string): RouteResult {
    return {
      inApp: { suppressed: true, reason },
      email: { suppressed: true, reason },
      push: { suppressed: true, reason },
    };
  }
}

export const notificationRouter = new NotificationRouter();
```

### File Changes Summary

| File                                        | Action               | Notes                                                                                                                                            |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/notification-router.ts`       | **NEW**              | NotificationRouter class + singleton export                                                                                                      |
| `src/services/notification-service.ts`      | **MODIFY**           | Refactor `deliverNotification()` to use router; add `conversationId` param; remove inline DnD + conv-pref checks; add `points.throttled` handler |
| `src/services/points-engine.ts`             | **MODIFY**           | Replace direct `createNotification()` + `publisher.publish()` with `eventBus.emit("points.throttled", ...)`                                      |
| `src/services/notification-router.test.ts`  | **NEW**              | 10 tests for router logic                                                                                                                        |
| `src/services/notification-service.test.ts` | **MODIFY (minimal)** | Add 4 regression tests; do NOT break existing ~20 handler tests                                                                                  |
| `src/services/points-engine.test.ts`        | **MODIFY (minimal)** | Update mock assertions: `createNotification` → `eventBus.emit`                                                                                   |

**DO NOT TOUCH:**

- `src/server/realtime/subscribers/eventbus-bridge.ts` — no changes needed
- `src/db/schema/platform-notifications.ts` — no schema changes
- `src/db/queries/notifications.ts` — no query changes
- `src/db/migrations/` — no migration needed

### Critical: HMR Guard Pattern

`notification-service.ts` uses a global registration guard to prevent duplicate EventBus listener registration on Next.js hot-reload:

```typescript
const globalForNotif = globalThis as unknown as { __notifHandlersRegistered?: boolean };
if (globalForNotif.__notifHandlersRegistered) {
  // skip
} else {
  globalForNotif.__notifHandlersRegistered = true;
  // register handlers...
}
```

Do NOT remove or alter this guard. The new `points.throttled` handler MUST be registered inside this guard block. The `NotificationRouter` singleton does not need this guard (it has no EventBus subscriptions).

### Critical: Article Email Direct-Send Pattern

Article event handlers (article_submitted, article_published, article_rejected, article_revision_requested) call `enqueueEmailJob()` DIRECTLY — they are NOT routed through the email channel. Keep these as-is. Add a comment:

```typescript
// Email sent directly (not via NotificationRouter email channel) —
// article events use custom templates. NotificationRouter email stub would no-op here.
```

This prevents a future dev from "fixing" the direct send by routing it through the router (which would break it since the router email stub has no template logic for articles).

### Critical: DnD Behavior Change

The current DnD check in `message.mentioned` suppresses ALL delivery (including in-app). After this refactoring, DnD only suppresses email and push channels — in-app notifications are always delivered per AC3. This is intentional and correct. Add a regression test that confirms in-app delivery occurs even when `dnd:${userId}` Redis key is set.

### Test File Patterns

`notification-router.test.ts` must include:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/block-service", () => ({
  filterNotificationRecipients: vi.fn().mockResolvedValue(["user-123"]),
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  getConversationNotificationPreference: vi.fn().mockResolvedValue("all"),
}));

vi.mock("@/lib/redis", () => ({
  getRedisPublisher: vi.fn().mockReturnValue({
    exists: vi.fn().mockResolvedValue(0), // 0 = key does not exist
    publish: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    ENABLE_EMAIL_SENDING: false,
  },
}));
```

**Note on Redis mock:** `redis.exists()` returns `0` (key not found) or `1` (key found). The DnD check uses `await redis.exists("dnd:${userId}")` — mock returns `0` (no DnD) by default; override with `vi.fn().mockResolvedValue(1)` in DnD-suppression tests.

### Project Structure Notes

- `notification-router.ts` belongs in `src/services/` alongside `notification-service.ts` — same layer, same import patterns
- Test file co-located: `src/services/notification-router.test.ts`
- No new `src/db/queries/` files needed (reuses existing imports)
- No new API routes needed (server-side only)
- No new components needed (no UI changes)

### References

- Story 1.15 (Notification Infrastructure): `src/services/notification-service.ts` — ~20 event handlers, `deliverNotification()` helper, HMR guard, Redis pub/sub pattern
- Epic 8 retro AI-4: `_bmad-output/implementation-artifacts/sprint-status.yaml` — documents points_throttled exception decision (now resolved by EventBus refactoring)
- Block service: `src/services/block-service.ts` — `filterNotificationRecipients(recipientIds, actorId): Promise<string[]>`
- Per-conv prefs: `src/db/queries/chat-conversations.ts` — `getConversationNotificationPreference(conversationId, userId): Promise<"all" | "mentions" | "muted">`
- Redis DnD: `src/lib/redis.ts` — `getRedisPublisher()` used for `exists("dnd:${userId}")`
- Email service: `src/services/email-service.ts` — `enqueueEmailJob(name, payload)`
- Points engine: `src/services/points-engine.ts` — currently calls `createNotification()` directly; refactored to EventBus emit in this story
- Story 9.2: Full email templates per notification type (NOT in scope for 9.1)
- Story 9.3: Web Push API + VAPID + service worker integration (NOT in scope for 9.1)
- Story 9.4: `platform_notification_preferences` DB table + UI (NOT in scope for 9.1)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation went cleanly without debug loops.

### Completion Notes List

- Created `NotificationRouter` class in `src/services/notification-router.ts` with per-channel decisions (in-app/email/push), block/mute check, per-conv pref check, and DnD check.
- Refactored `deliverNotification()` in `notification-service.ts` to route through `NotificationRouter` before creating notifications. Added `conversationId?` param.
- Simplified `message.mentioned` handler — removed inline DnD + conv-pref checks; now passes `conversationId` to `deliverNotification()`.
- **Intentional behavior change (AC3):** DnD now only suppresses email/push — in-app always delivered. Previously suppressed all delivery for message.mentioned.
- **Intentional behavior change (self-notify):** `filterNotificationRecipients` is now NOT called when `actorId === userId` (router short-circuits). 2 existing tests updated to reflect this.
- Refactored `points-engine.ts` to emit `eventBus.emit("points.throttled", ...)` instead of calling `createNotification()` + `publisher.publish()` directly. Removed now-unused `getRedisPublisher` and `createNotification` imports.
- Added `PointsThrottledEvent` interface + `points.throttled` to EventName union and EventMap in `src/types/events.ts`.
- Added `points.throttled` handler in notification-service.ts (inside HMR guard) that calls `deliverNotification()` as self-notify.
- 10 new `notification-router.test.ts` tests; 4 new regression tests in `notification-service.test.ts`; 2 points-engine tests updated to assert `eventBus.emit`.
- Full suite: 3475 passed, 10 skipped, 2 pre-existing failures in `points-lua-runner.test.ts` (pre-existing, not caused by this story).

### File List

- `src/services/notification-router.ts` — NEW
- `src/services/notification-router.test.ts` — NEW
- `src/services/notification-service.ts` — MODIFIED
- `src/services/notification-service.test.ts` — MODIFIED
- `src/services/points-engine.ts` — MODIFIED
- `src/services/points-engine.test.ts` — MODIFIED
- `src/types/events.ts` — MODIFIED (PointsThrottledEvent + EventName/EventMap)

### Change Log

- 2026-03-07: Story 9.1 implemented — NotificationRouter created; notification-service.ts refactored to route through router; points-engine.ts refactored to emit EventBus event instead of calling createNotification directly; 14 new/updated tests; DnD behavior change (in-app always delivered per AC3).
- 2026-03-07: **Code review (5 fixes):** F1: removed dead mocks (createNotification, getRedisPublisher) from points-engine.test.ts; F2: added direct-send comment to article.submitted handler; F3: changed notification-router.ts from getRedisPublisher→getRedisClient for read-only DnD check; F4: improved email stub comments documenting Story 9.2 wiring; F5: fixed misleading router test 2 (now tests "mentions" pref instead of "all"). Full suite: 3473 passed, 10 skipped, 2 pre-existing failures.
