# Story 9.3: Push Notifications (Web Push API)

Status: done

## Story

As a member,
I want to receive push notifications on my device even when my browser is closed,
So that I'm alerted to important activity in real-time without having the platform open.

## Acceptance Criteria

1. **Given** a member is using the Lite PWA, **When** they opt in to push notifications, **Then** the browser requests push notification permission, and upon approval the system creates and stores a push subscription on the server (FR74). VAPID keys are used for Web Push API authentication.

2. **Given** a notification-triggering event occurs, **When** the member is not actively on the platform, **Then** the system delivers a push notification to their device within 30 seconds (NFR-I4), displaying: title, body preview, and platform icon. Tapping the notification opens the platform at the relevant content.

3. **Given** the Serwist service worker is configured (Story 1.3), **When** push events are received, **Then** the service worker displays the notification and handles click-to-navigate. Notifications are queued by the browser/push service and delivered when the device comes back online.

4. **Given** the database needs push subscription support, **When** this story is implemented, **Then** migration `0038_push_subscriptions.sql` creates the `platform_push_subscriptions` table with fields: id, user_id, endpoint, keys_p256dh, keys_auth, created_at. The push service is at `src/services/push-service.ts`.

5. **Given** a member has an active push subscription, **When** the NotificationRouter evaluates the push channel, **Then** push is delivered if the notification type is in `PUSH_ELIGIBLE_TYPES` and DnD is not active. If the user has no active push subscription, the push service silently no-ops.

6. **Given** a push subscription expires or is revoked (HTTP 410 from push service), **When** a push send fails with 410, **Then** the subscription record is automatically deleted from the database.

## Tasks / Subtasks

- [x] Task 1: Install `web-push` package and add VAPID env vars (AC: 1)
  - [x] 1.1: Run `bun add web-push` and `bun add -d @types/web-push`
  - [x] 1.2: Add server env vars to `src/env.ts`: `VAPID_PUBLIC_KEY: z.string().optional().default("")`, `VAPID_PRIVATE_KEY: z.string().optional().default("")`, `VAPID_CONTACT_EMAIL: z.string().optional().default("")`. These MUST be optional — follows the `DAILY_API_KEY` pattern — otherwise dev environments without VAPID keys will fail env validation on startup.
  - [x] 1.3: Add client env var: `NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().default("")` to `src/env.ts` client section
  - [x] 1.4: Add placeholder values to `.env.local` with a comment instructing dev to run `npx web-push generate-vapid-keys` to get real values

- [x] Task 2: DB migration — push subscriptions table (AC: 4)
  - [x] 2.1: Create `src/db/migrations/0038_push_subscriptions.sql`:
    ```sql
    CREATE TABLE IF NOT EXISTS "platform_push_subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
      "endpoint" text NOT NULL UNIQUE,
      "keys_p256dh" text NOT NULL,
      "keys_auth" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "push_subs_user_idx" ON "platform_push_subscriptions" ("user_id");
    ```
  - [x] 2.2: Add journal entry to `src/db/migrations/meta/_journal.json` (idx: 38, version: "7", when: 1708000000038, tag: "0038_push_subscriptions", breakpoints: true)

- [x] Task 3: Drizzle schema for push subscriptions (AC: 4)
  - [x] 3.1: Create `src/db/schema/platform-push-subscriptions.ts` with `platformPushSubscriptions` table (pgTable) matching the SQL above
  - [x] 3.2: Import the schema in `src/db/index.ts` as `import * as pushSubsSchema from "@/db/schema/platform-push-subscriptions"` and spread into the `db` client schema

- [x] Task 4: DB queries for push subscriptions (AC: 4, 5, 6)
  - [x] 4.1: Create `src/db/queries/push-subscriptions.ts` with:
    - `upsertPushSubscription(userId, sub: { endpoint, keys: { p256dh, auth } })` — INSERT … ON CONFLICT (endpoint) DO UPDATE SET keys_p256dh = EXCLUDED.keys_p256dh, keys_auth = EXCLUDED.keys_auth, user_id = EXCLUDED.user_id (a re-subscribe on the same browser may issue new encryption keys with the same endpoint; DO NOTHING would silently keep stale keys, causing all future pushes to fail)
    - `getUserPushSubscriptions(userId)` — returns array of `{ endpoint, keys_p256dh, keys_auth }`
    - `deletePushSubscriptionByEndpoint(endpoint)` — DELETE by endpoint (called on 410)
    - `deleteAllUserPushSubscriptions(userId)` — DELETE all for user (unsubscribe)

- [x] Task 5: Push service at `src/services/push-service.ts` (AC: 2, 5, 6)
  - [x] 5.1: Create `src/services/push-service.ts` (server-only):
    - Import `webpush` from `"web-push"`
    - **VAPID init guard**: Only call `webpush.setVapidDetails(env.VAPID_CONTACT_EMAIL, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)` if ALL three VAPID env vars are non-empty strings. Store a module-level `let vapidConfigured = false` flag. If any var is empty, log a warning once and set `vapidConfigured = false`. This prevents crash in dev environments without VAPID keys.
    - Export `interface PushPayload { title: string; body: string; icon: string; link: string; tag?: string }`
    - Export `async function sendPushNotifications(userId: string, payload: PushPayload): Promise<void>`:
      - If `!vapidConfigured` → return early (silent no-op in dev)
      - Fetch subscriptions via `getUserPushSubscriptions(userId)`
      - If empty → return (silent no-op)
      - For each subscription, call `webpush.sendNotification(sub, JSON.stringify(payload))`
      - On error with `statusCode === 410` or `statusCode === 404` → call `deletePushSubscriptionByEndpoint(sub.endpoint)` (expired/revoked)
      - Other errors → log with `console.error` and continue (do not throw)

- [x] Task 6: Update `NotificationRouter` to wire push channel decision (AC: 5)
  - [x] 6.1: In `src/services/notification-router.ts`, add `PUSH_ELIGIBLE_TYPES` Set: `message`, `mention`, `event_reminder`, `admin_announcement`
  - [x] 6.2: Replace the hardcoded suppressed push block (lines 77–81) with real logic:
    - If DnD active (same `isDnd` Redis check already done for email) → suppress push, reason: "quiet hours (dnd key set)"
    - Else if type in `PUSH_ELIGIBLE_TYPES` → `push = { suppressed: false, reason: \`push eligible type: ${type}\` }`
    - Else → suppress push, reason: "type not in push allowlist"
  - [x] 6.3: Update `console.debug` log line to still include push channel (already there — verify it still compiles)

- [x] Task 7: Update `deliverNotification()` in `notification-service.ts` to call push (AC: 2)
  - [x] 7.1: In `src/services/notification-service.ts`, import `sendPushNotifications` from `@/services/push-service`
  - [x] 7.2: In `deliverNotification()`, after the email delivery block, add push delivery block:
    ```ts
    if (!routing.push.suppressed) {
      await sendPushNotifications(userId, {
        title,
        body,
        icon: "/icon-192.png",
        link: link ?? "/",
        tag: `${type}:${conversationId ?? "general"}`,
      });
    }
    ```
  - [x] 7.3: Verify `deliverNotification()` signature already accepts `title`, `body`, `link` — it does from Story 9.1

- [x] Task 8: Update service worker (`src/app/sw.ts`) for push events (AC: 3)
  - [x] 8.1: In `src/app/sw.ts`, add `push` event listener **BEFORE** the `serwist.addEventListeners()` call (Serwist's listeners must come last):
    ```ts
    self.addEventListener("push", (event: PushEvent) => {
      const data = event.data?.json() as {
        title: string;
        body: string;
        icon: string;
        link: string;
        tag?: string;
      };
      event.waitUntil(
        self.registration.showNotification(data.title, {
          body: data.body,
          icon: data.icon ?? "/icon-192.png",
          tag: data.tag,
          data: { url: data.link },
        }),
      );
    });
    ```
  - [x] 8.2: Add `notificationclick` event listener (also BEFORE `serwist.addEventListeners()`):
    ```ts
    self.addEventListener("notificationclick", (event: NotificationEvent) => {
      event.notification.close();
      event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
    });
    ```
  - [x] 8.3: After editing `sw.ts`, rebuild the service worker: `bun run build` generates `public/sw.js`. The CI handles this; no manual rebuild required during dev (Next.js does it on dev start).

- [x] Task 9: API routes for push subscription management (AC: 1)
  - [x] 9.1: Create `src/app/api/v1/push/subscribe/route.ts`:
    - `POST`: `requireAuthenticatedSession` → validate body `{ endpoint: string, keys: { p256dh: string, auth: string } }` with Zod → call `upsertPushSubscription(session.userId, body)` → `successResponse({ ok: true }, undefined, 201)`
    - `DELETE`: `requireAuthenticatedSession` → call `deleteAllUserPushSubscriptions(session.userId)` → `successResponse({ ok: true })`
  - [x] 9.2: Both methods wrapped with `withApiHandler()` (no `skipCsrf` — browser Origin header is present)

- [x] Task 10: Client-side hook `src/hooks/use-push-subscription.ts` (AC: 1)
  - [x] 10.1: Create `src/hooks/use-push-subscription.ts` (client-only):
    - State: `{ status: "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading" }`
    - On mount: detect `"PushManager" in window && "serviceWorker" in navigator` — if not supported, set "unsupported"
    - Check existing `Notification.permission` — if "denied" set "denied"
    - Check existing subscription via `registration.pushManager.getSubscription()` — if exists set "subscribed"
    - `subscribe()` fn: request permission → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) })` → POST to `/api/v1/push/subscribe` → set "subscribed"
    - `unsubscribe()` fn: call `subscription.unsubscribe()` + DELETE `/api/v1/push/subscribe` → set "unsubscribed"
    - Helper: `urlBase64ToUint8Array(base64String: string): Uint8Array` — standard VAPID key conversion utility

- [x] Task 11: UI component `PushSubscriptionToggle` (AC: 1)
  - [x] 11.1: Create `src/components/notifications/PushSubscriptionToggle.tsx`:
    - Uses `usePushSubscription()` hook
    - Shows Switch + label from i18n: `Notifications.push.enableLabel`
    - When "unsupported" → shows greyed-out switch with helper text `Notifications.push.unsupportedBrowser`
    - When "denied" → shows disabled switch with helper text `Notifications.push.permissionDenied`
    - Loading state during subscribe/unsubscribe
  - [x] 11.2: Mount `<PushSubscriptionToggle />` somewhere discoverable — add to `/settings/notifications` page placeholder section with heading `Notifications.push.sectionTitle`. This page is already linked from email unsubscribe; if it doesn't exist yet, create a minimal stub page at `src/app/[locale]/(app)/settings/notifications/page.tsx` with just the push toggle for now (Story 9.4 will expand it into the full preferences matrix).

- [x] Task 12: i18n keys (AC: 1)
  - [x] 12.1: Add to `messages/en.json` under `"Notifications"`:
    ```json
    "push": {
      "sectionTitle": "Push Notifications",
      "enableLabel": "Enable push notifications",
      "unsupportedBrowser": "Your browser does not support push notifications",
      "permissionDenied": "Push notifications are blocked. Update your browser settings to enable them."
    }
    ```
  - [x] 12.2: Add Igbo equivalents to `messages/ig.json` under `"Notifications"` (translate or use English as fallback — mark with `// TODO: Igbo translation` comment in file)

- [x] Task 13: Tests (AC: 1–6)
  - [x] 13.1: `src/db/queries/push-subscriptions.test.ts` — unit tests for all 4 query functions (mock `db`)
  - [x] 13.2: `src/services/push-service.test.ts` — mock `web-push`, test: (a) VAPID not configured → returns early without DB call, (b) empty subscriptions → no send, (c) single sub sends, (d) 410 error → deletes subscription, (e) non-410 error → logs and continues
  - [x] 13.3: `src/services/notification-router.test.ts` — add tests for push channel: (a) PUSH_ELIGIBLE_TYPES type + no DnD → push delivered, (b) DnD active → push suppressed, (c) non-eligible type → push suppressed
  - [x] 13.4: `src/services/notification-service.test.ts` — add `vi.mock("@/services/push-service", () => ({ sendPushNotifications: vi.fn().mockResolvedValue(undefined) }))` at top. Add tests: (a) push not suppressed → `sendPushNotifications` called with correct payload, (b) push suppressed → `sendPushNotifications` not called
  - [x] 13.5: `src/app/api/v1/push/subscribe/route.test.ts` — POST success (201), DELETE success (200), unauthenticated 401
  - [x] 13.6: `src/hooks/use-push-subscription.test.ts` — mock `navigator.serviceWorker` + `PushManager`; test subscribe/unsubscribe state transitions
  - [x] 13.7: `src/components/notifications/PushSubscriptionToggle.test.tsx` — render tests for each status variant (subscribed/unsubscribed/unsupported/denied)

- [x] Task 14: Run full test suite
  - [x] 14.1: `bun test` — confirm all tests pass (expect ~30+ net new; no regressions)
  - [x] 14.2: Confirm `public/sw.js` reflects sw.ts changes after `bun run build` (or check that the dev server picks up sw changes)

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [ ] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [ ] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [ ] All tests passing (run `bun test` locally before review)
- [ ] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts`
- [ ] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [ ] New member statuses/roles audited across ALL entry-point functions for permission gaps
- [ ] VAPID keys are never logged or included in any response body
- [ ] `src/db/migrations/meta/_journal.json` has entry for idx 38 (`0038_push_subscriptions`)
- [ ] SW `push` + `notificationclick` listeners added to `src/app/sw.ts`
- [ ] Push subscription deletion on 410/404 is tested
- [ ] `push-service.ts` guards against empty VAPID env vars (no crash in dev)
- [ ] `upsertPushSubscription` uses `ON CONFLICT DO UPDATE` (not DO NOTHING) to refresh keys
- [ ] `notification-service.test.ts` has `vi.mock("@/services/push-service")` added
- [ ] SW push + notificationclick listeners are placed BEFORE `serwist.addEventListeners()`

## Dev Notes

### Architecture Overview

This story wires the push channel that has been a hardcoded no-op stub since Story 9.1. Three integration points:

1. **Client → Server**: `POST /api/v1/push/subscribe` stores the browser's PushSubscription object. The subscription contains an `endpoint` URL (push service URL) and ECDH `keys` (p256dh + auth) needed to encrypt payloads.

2. **Server → Push Service → Browser**: When a notification event fires, `deliverNotification()` checks `routing.push.suppressed`. If not suppressed, `sendPushNotifications()` encrypts the payload using VAPID + the stored subscription keys and POSTs to the push service endpoint (handled transparently by `web-push` library).

3. **Service Worker → UI**: The browser's push service wakes the SW, which receives the `push` event, calls `showNotification()`, and handles `notificationclick` to navigate the user to the correct content.

### Key Implementation Constraints

- **`web-push` library** (npm: `web-push`) is the standard Node.js Web Push implementation. Install with `bun add web-push @types/web-push`. It handles RFC 8291 (message encryption) and RFC 8292 (VAPID).

- **VAPID key generation** (one-time setup): `npx web-push generate-vapid-keys` → copy `publicKey` and `privateKey` into `.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. `VAPID_CONTACT_EMAIL` should be `mailto:admin@obigbo.com` (or the configured admin email).

- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`** must be the same key added to both client env (for `pushManager.subscribe()` applicationServerKey) AND server env (for `webpush.setVapidDetails()`). This is the public key — safe to expose to client.

- **`urlBase64ToUint8Array`** conversion is required because the browser `applicationServerKey` expects a `Uint8Array`, but VAPID keys are base64url-encoded strings. Standard pattern:

  ```ts
  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }
  ```

- **`isDnd` reuse in router**: The `isDnd` check is already computed for email (line 67 in notification-router.ts). Push uses the same value — no extra Redis call needed.

- **`platform_push_subscriptions.endpoint` is UNIQUE**: A given browser generates one endpoint per subscription. The upsert uses `ON CONFLICT (endpoint) DO UPDATE` to refresh keys — a re-subscribe may issue new encryption keys for the same endpoint.

- **Multiple subscriptions per user**: A user may have multiple devices/browsers. `getUserPushSubscriptions()` returns ALL active subscriptions. The push service sends to all of them (fan-out).

- **Service worker rebuild**: `src/app/sw.ts` is compiled by Serwist's Next.js plugin into `public/sw.js`. During development (`bun dev`), changes to `sw.ts` are picked up automatically on page reload. For production, `bun run build` rebuilds it. The CI handles this; dev does not need to manually run a separate build step.

- **SW TypeScript types**: `PushEvent` and `NotificationEvent` are part of the ServiceWorker lib. The `sw.ts` file uses `/// <reference lib="webworker" />` or relies on Serwist's tsconfig. If type errors appear, cast: `self.addEventListener("push", (event) => { const e = event as PushEvent; ... })`.

- **`src/services/push-service.ts` is `"server-only"`**: Add `import "server-only"` at top. The service calls `getUserPushSubscriptions` (DB) and `webpush.sendNotification` (HTTP). Never import in client components.

### Settings Page Note

The settings page stub at `src/app/[locale]/(app)/settings/notifications/page.tsx` does NOT exist yet — must be created. It's a `"use client"` page since it renders `PushSubscriptionToggle` (which uses hooks). Use `useTranslations("Notifications")` from `next-intl`. Story 9.4 will replace this stub with the full preferences matrix. The unsubscribe link in email templates (`/settings/notifications`) already points here.

### Testing Patterns

- **`web-push` mock**: `vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({}) } }))`
- **`push-service` tests**: mock `@/db/queries/push-subscriptions` — return array of subscriptions. Test the 410 error path by making `sendNotification` reject with `{ statusCode: 410 }`.
- **Router push tests**: follow existing email channel test pattern — mock Redis `isDnd`, set eligible/ineligible types, verify `push.suppressed` values.
- **SW tests**: Service worker event handlers are difficult to unit test in jsdom. Skip SW unit tests — covered by the integration that they compile without TS errors. Do add a smoke test that `src/app/sw.ts` exports/imports don't crash.

### Previous Story Intelligence (Story 9.2)

- `deliverNotification()` signature already includes optional `emailData` param (Task 1 from 9.2). The push delivery doesn't need a separate `pushData` param — payload is derived from `title`, `body`, `link` already present.
- `notification-router.ts` pattern: `isDnd` computed once, used for both email + push. No extra Redis call.
- `notification-service.ts` hot-reload guard via `globalThis` — do NOT add a second guard. Push service `webpush.setVapidDetails()` at module load is fine (module-level singleton).
- 2 pre-existing failures in `points-lua-runner.test.ts` — unrelated, do not investigate.
- Baseline: 3502/3504 passing + 10 skipped (same 2 pre-existing failures).

### Project Structure Notes

New files to create:

```
src/db/migrations/0038_push_subscriptions.sql
src/db/schema/platform-push-subscriptions.ts
src/db/queries/push-subscriptions.ts
src/services/push-service.ts
src/app/api/v1/push/subscribe/route.ts
src/hooks/use-push-subscription.ts
src/components/notifications/PushSubscriptionToggle.tsx
src/app/[locale]/(app)/settings/notifications/page.tsx  ← stub (if not exists)
```

Files to modify:

```
src/db/index.ts                    (import push subs schema)
src/db/migrations/meta/_journal.json  (add idx 38 entry)
src/services/notification-router.ts   (wire push channel)
src/services/notification-service.ts  (add push delivery)
src/app/sw.ts                         (add push + notificationclick handlers)
src/env.ts                            (VAPID keys)
messages/en.json                      (Notifications.push.*)
messages/ig.json                      (Notifications.push.*)
package.json                          (web-push dep)
```

### References

- Web Push API spec: RFC 8030 (HTTP) + RFC 8291 (encryption) + RFC 8292 (VAPID)
- `web-push` npm: https://www.npmjs.com/package/web-push
- Serwist SW docs: `src/app/sw.ts` (existing) + `next.config.ts` Serwist plugin config
- Push channel stub: `src/services/notification-router.ts` lines 77–81
- `deliverNotification()` function: `src/services/notification-service.ts`
- Epic 9 spec: `_bmad-output/planning-artifacts/epics.md` lines 2512–2540
- FR74: push notifications; NFR-I4: delivery within 30 seconds
- Story 9.4 will add per-type push preferences matrix and quiet hours UI (DnD Redis key already wired in router from Story 9.1)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Installed `web-push` + `@types/web-push` via npm (bun not available in env)
- VAPID env vars added as optional with empty defaults — dev startup unaffected
- Migration `0038_push_subscriptions.sql` + journal entry idx:38 created
- `platformPushSubscriptions` schema + DB import wired
- 4 query functions: upsertPushSubscription (ON CONFLICT DO UPDATE), getUserPushSubscriptions, deletePushSubscriptionByEndpoint, deleteAllUserPushSubscriptions
- `push-service.ts` — VAPID guard at module load; fan-out to all user subscriptions; 410/404 → auto-delete; other errors logged and continued
- `NotificationRouter` — `PUSH_ELIGIBLE_TYPES` Set added; push decision uses same `isDnd` Redis value as email
- `notification-service.ts` — push delivery block added BEFORE email block (after inApp); `sendPushNotifications` imported
- `sw.ts` — `push` + `notificationclick` event listeners added BEFORE `serwist.addEventListeners()`
- `POST/DELETE /api/v1/push/subscribe` — both wrapped with `withApiHandler()`, Zod body validation on POST
- `usePushSubscription` hook — 5 status states, subscribe/unsubscribe fns, `urlBase64ToUint8Array` helper
- `PushSubscriptionToggle` component — checkbox-based (no Switch UI component available), 5 render variants
- `/settings/notifications` stub page created (Story 9.4 will expand to full preferences matrix)
- i18n keys added to both `en.json` and `ig.json` under `Notifications.push.*`
- 36 net new tests passing; only 2 pre-existing ProfileStep failures remain
- Push delivery test in notification-service.test.ts verifies push is called when eligible and not called on DnD

### File List

**New files:**

- `src/db/migrations/0038_push_subscriptions.sql`
- `src/db/schema/platform-push-subscriptions.ts`
- `src/db/queries/push-subscriptions.ts`
- `src/db/queries/push-subscriptions.test.ts`
- `src/services/push-service.ts`
- `src/services/push-service.test.ts`
- `src/services/push-service.vapid-disabled.test.ts`
- `src/app/api/v1/push/subscribe/route.ts`
- `src/app/api/v1/push/subscribe/route.test.ts`
- `src/hooks/use-push-subscription.ts`
- `src/hooks/use-push-subscription.test.ts`
- `src/components/notifications/PushSubscriptionToggle.tsx`
- `src/components/notifications/PushSubscriptionToggle.test.tsx`
- `src/app/[locale]/(app)/settings/notifications/page.tsx`

**Modified files:**

- `src/env.ts` (VAPID env vars)
- `src/db/index.ts` (import push subs schema)
- `src/db/migrations/meta/_journal.json` (idx 38 entry)
- `src/services/notification-router.ts` (PUSH_ELIGIBLE_TYPES + push channel logic)
- `src/services/notification-service.ts` (push delivery block + push-service import)
- `src/services/notification-router.test.ts` (updated test 9 + 3 new push tests)
- `src/services/notification-service.test.ts` (push mock + 2 push delivery tests)
- `src/app/sw.ts` (push + notificationclick event listeners)
- `messages/en.json` (Notifications.push.\* keys)
- `messages/ig.json` (Notifications.push.\* keys)
- `.env.local` (VAPID placeholder vars)
- `package.json` / `package-lock.json` (web-push + @types/web-push)

### Change Log

- 2026-03-07: Implemented Story 9.3 — Web Push API notification channel. Migration 0038, push-service, router wiring, SW handlers, subscribe API, usePushSubscription hook, PushSubscriptionToggle UI, /settings/notifications stub. 36 net new tests.
- 2026-03-07: Code review fixes (8 findings). F1: journal `when` 1708000000038→1708000038000. F2: VAPID-not-configured test added in separate file. F3: removed duplicate `VAPID_PUBLIC_KEY` server env var — server uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. F4: subscribe() now rolls back browser sub on server error. F5: SW push handler guards null data. F6: ig.json translation debt noted (no fix — JSON can't have comments). F7: removed unused Button import. F8: N/A — no Switch component in project. +4 new tests (2 vapid-disabled, 1 subscribe rollback, 1 Button mock removed).
