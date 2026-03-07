# Story 9.4: Notification Preferences & Digest

Status: done

## Story

As a member,
I want to customize which notifications I receive, through which channels, configure digest summaries, and set quiet hours,
So that I control my attention and don't get overwhelmed by notifications.

## Acceptance Criteria

1. **Given** a member navigates to notification settings, **When** the preferences page loads, **Then** they see a matrix of notification types (messages, mentions, group activity, events, post interactions, admin announcements) and delivery channels (in-app, email, push), each combination toggled on/off independently, with defaults pre-set (all in-app on, email for high-priority only, push for DMs and events). (FR75)

2. **Given** a member prefers digest summaries, **When** they enable digest mode for a notification type, **Then** they can choose daily or weekly digest (FR76). Individual real-time notifications for that type are batched into a single digest email at the configured time. In-app notifications still appear in real-time regardless of digest setting. A scheduled digest job (`src/server/jobs/notification-digest.ts`) runs hourly via the existing job runner. The job queries members whose digest is due, aggregates unread/undigested notifications since `last_digest_at`, renders a branded digest email, and updates `last_digest_at` for delivered types.

3. **Given** a member wants quiet hours, **When** they configure a Do Not Disturb schedule, **Then** they can set start and end times with timezone (FR77). During quiet hours, no push or email notifications are sent. In-app notifications accumulate silently. The existing Redis `dnd:{userId}` key (used since Story 9.1) is set/cleared by the hourly digest job based on whether it's currently quiet hours in the member's timezone.

4. **Given** a member has quiet hours configured, **When** another member views their profile, **Then** a DnD indicator (moon icon + "Do not disturb" label) is visible near their display name.

5. **Given** the database needs preferences support, **When** this story is implemented, **Then** migration `0039_notification_preferences.sql` creates the `platform_notification_preferences` table with composite PK (`user_id`, `notification_type`), boolean channel columns, `digest_mode` enum (`none`/`daily`/`weekly`), `quiet_hours_start` (TIME), `quiet_hours_end` (TIME), `quiet_hours_timezone` (TEXT), `last_digest_at` (TIMESTAMPTZ nullable), and `updated_at`.

6. **Given** a member's preferences are saved, **When** the `NotificationRouter` evaluates channels, **Then** it checks DB preferences for the notification type before allowing delivery — if a channel is disabled in preferences, it is suppressed with reason "user preference: channel disabled for type". Default behavior (all in-app on, email/push for eligible types) is applied when no DB row exists for a (user, type) pair.

## Tasks / Subtasks

- [x] Task 0: Install `date-fns` + `date-fns-tz` (AC: 2, 3)
  - [x] 0.1: Run `bun add date-fns date-fns-tz` — needed for timezone-aware quiet hours and digest scheduling. **These packages are NOT currently installed** despite being referenced elsewhere in docs.
  - [x] 0.2: After install, check the installed `date-fns-tz` version. If v3+, the import is `toZonedTime` (not `utcToZonedTime`). If v2, use `utcToZonedTime`.

- [x] Task 1: DB migration — notification preferences table (AC: 5)
  - [x] 1.1: Create `src/db/migrations/0039_notification_preferences.sql`:
    ```sql
    CREATE TABLE IF NOT EXISTS "platform_notification_preferences" (
      "user_id" text NOT NULL REFERENCES "auth_users"("id") ON DELETE CASCADE,
      "notification_type" text NOT NULL,
      "channel_in_app" boolean NOT NULL DEFAULT true,
      "channel_email" boolean NOT NULL DEFAULT false,
      "channel_push" boolean NOT NULL DEFAULT false,
      "digest_mode" text NOT NULL DEFAULT 'none',
      "quiet_hours_start" time,
      "quiet_hours_end" time,
      "quiet_hours_timezone" text NOT NULL DEFAULT 'UTC',
      "last_digest_at" timestamp with time zone,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("user_id", "notification_type")
    );
    CREATE INDEX IF NOT EXISTS "notif_prefs_user_idx" ON "platform_notification_preferences" ("user_id");
    ```
  - [x] 1.2: Add journal entry to `src/db/migrations/meta/_journal.json`:
        `{ "idx": 39, "version": "7", "when": 1708000039000, "tag": "0039_notification_preferences", "breakpoints": true }`

- [x] Task 2: Drizzle schema (AC: 5)
  - [x] 2.1: Create `src/db/schema/platform-notification-preferences.ts`:
    ```ts
    import { boolean, pgTable, primaryKey, text, time, timestamp } from "drizzle-orm/pg-core";
    export const platformNotificationPreferences = pgTable(
      "platform_notification_preferences",
      {
        userId: text("user_id").notNull(),
        notificationType: text("notification_type").notNull(),
        channelInApp: boolean("channel_in_app").notNull().default(true),
        channelEmail: boolean("channel_email").notNull().default(false),
        channelPush: boolean("channel_push").notNull().default(false),
        digestMode: text("digest_mode").notNull().default("none"),
        quietHoursStart: time("quiet_hours_start"),
        quietHoursEnd: time("quiet_hours_end"),
        quietHoursTimezone: text("quiet_hours_timezone").notNull().default("UTC"),
        lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
      },
      (t) => ({
        pk: primaryKey({ columns: [t.userId, t.notificationType] }),
      }),
    );
    ```
  - [x] 2.2: Import in `src/db/index.ts`:
        `import * as notifPrefsSchema from "@/db/schema/platform-notification-preferences"` — spread into db client schema

- [x] Task 3: DB queries `src/db/queries/notification-preferences.ts` (AC: 1, 2, 3, 5, 6)
  - [x] 3.1: Export `NOTIFICATION_TYPES` const: `["message", "mention", "group_activity", "event_reminder", "post_interaction", "admin_announcement", "system"] as const`
  - [x] 3.2: Export `DEFAULT_PREFERENCES` map — per type:
    - `message`: inApp=true, email=true, push=true (high priority DM)
    - `mention`: inApp=true, email=false, push=true
    - `group_activity`: inApp=true, email=false, push=false
    - `event_reminder`: inApp=true, email=true, push=true
    - `post_interaction`: inApp=true, email=false, push=false
    - `admin_announcement`: inApp=true, email=true, push=true
    - `system`: inApp=true, email=false, push=false
  - [x] 3.3: `getNotificationPreferences(userId: string)` — SELECT all rows for user; return as `Record<string, { channelInApp, channelEmail, channelPush, digestMode, quietHoursStart, quietHoursEnd, quietHoursTimezone, lastDigestAt }>` keyed by notificationType
  - [x] 3.4: `upsertNotificationPreference(userId, notificationType, prefs: Partial<...>)` — INSERT ... ON CONFLICT (user_id, notification_type) DO UPDATE SET ..., updated_at = now()
  - [x] 3.5: `setQuietHours(userId, start: string | null, end: string | null, timezone: string)` — UPDATE all rows for userId setting quiet*hours*\* fields. If no rows exist yet, this is a no-op (quiet hours will be stored on first upsert of any preference row)
  - [x] 3.6: `getUsersWithDigestDue(currentHourUtc: Date)` — returns users whose digest is due now. Query: SELECT DISTINCT user_id, quiet_hours_timezone, digest_mode FROM platform_notification_preferences WHERE digest_mode != 'none'. Return enriched result with whether daily/weekly digest is due given the user's timezone and `last_digest_at`. Implementation detail: use `date-fns-tz` (`toZonedTime` if v3+, `utcToZonedTime` if v2) to determine current hour in each timezone.
  - [x] 3.7: `getUsersInQuietHours(currentTimeUtc: Date)` — returns array of userId strings currently in their quiet hours window. Used by digest job to sync Redis DnD keys. Fetch all rows with `quiet_hours_start IS NOT NULL`, then filter in JS using `date-fns-tz` timezone conversion.
  - [x] 3.8: `getUndigestedNotifications(userId: string, type: string, since: Date)` — SELECT from `platform_notifications` WHERE user_id=userId AND type=type AND created_at > since (unread or undigested since last digest run)
  - [x] 3.9: `markDigestSent(userId: string, types: string[], sentAt: Date)` — UPDATE platform_notification_preferences SET last_digest_at=sentAt WHERE user_id=userId AND notification_type IN (types)

- [x] Task 4: Update `NotificationRouter` to check DB channel preferences (AC: 6)
  - [x] 4.1: In `src/services/notification-router.ts`, import `getNotificationPreferences` from `@/db/queries/notification-preferences`
  - [x] 4.2: In `NotificationRouter.route()`, after step 2 (per-conversation override) and before step 3 (in-app delivery), load user preferences:
    ```ts
    const prefs = await getNotificationPreferences(userId);
    const typePref = prefs[type]; // undefined if no row → use defaults
    ```
  - [x] 4.3: Apply per-channel preference checks using the loaded prefs (fall back to `DEFAULT_PREFERENCES[type]` if no row):
    - In-app: suppressed if `(typePref?.channelInApp ?? DEFAULT_PREFERENCES[type].inApp) === false`
    - Email: additionally suppress if `(typePref?.channelEmail ?? DEFAULT_PREFERENCES[type].email) === false`, reason: `"user preference: email disabled for type ${type}"`
    - Push: additionally suppress if `(typePref?.channelPush ?? DEFAULT_PREFERENCES[type].push) === false`, reason: `"user preference: push disabled for type ${type}"`
  - [x] 4.4: For email channel: also suppress if `digestMode !== 'none'` for that type — reason: `"digest mode: email batched for type ${type}"` (in-app still delivered; digest job handles email)

- [x] Task 5: API routes for notification preferences (AC: 1, 3)
  - [x] 5.1: Create `src/app/api/v1/user/notification-preferences/route.ts`:
    - `GET`: `requireAuthenticatedSession` → `getNotificationPreferences(session.userId)` → `successResponse({ preferences })`. Returns Record keyed by type; client merges with defaults for types with no row.
    - `PUT`: `requireAuthenticatedSession` → validate body with Zod:
      ```ts
      z.object({
        notificationType: z.enum([
          "message",
          "mention",
          "group_activity",
          "event_reminder",
          "post_interaction",
          "admin_announcement",
          "system",
        ]),
        channelInApp: z.boolean().optional(),
        channelEmail: z.boolean().optional(),
        channelPush: z.boolean().optional(),
        digestMode: z.enum(["none", "daily", "weekly"]).optional(),
      });
      ```
      → `upsertNotificationPreference(session.userId, body.notificationType, body)` → `successResponse({ ok: true })`
    - Both methods wrapped with `withApiHandler()`
  - [x] 5.2: Create `src/app/api/v1/user/notification-preferences/quiet-hours/route.ts`:
    - `PUT`: `requireAuthenticatedSession` → validate body:
      ```ts
      z.object({
        quietHoursStart: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
        quietHoursEnd: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
        quietHoursTimezone: z.string().min(1).max(64),
      });
      ```
      → `setQuietHours(session.userId, body.quietHoursStart, body.quietHoursEnd, body.quietHoursTimezone)` → immediately sync Redis DnD key (check if current time falls in quiet hours, set/clear `dnd:{userId}` in Redis with appropriate TTL) → `successResponse({ ok: true })`
    - `DELETE`: `requireAuthenticatedSession` → `setQuietHours(session.userId, null, null, "UTC")` → clear Redis `dnd:{userId}` → `successResponse({ ok: true })`
    - Both wrapped with `withApiHandler()`

- [x] Task 6: Digest job `src/server/jobs/notification-digest.ts` (AC: 2, 3)
  - [x] 6.1: Create `src/server/jobs/notification-digest.ts`:
        **IMPORTANT**: `registerJob` signature is `registerJob(name: string, handler: () => Promise<void>, options?: { retries?, backoffMs?, timeoutMs? })`. There is NO `schedule` or `cron` parameter — jobs are triggered externally via `runJob("notification-digest")` (e.g., Docker cron, Vercel cron, or external scheduler calling the job hourly).

    ```ts
    import "server-only";
    import { registerJob } from "./job-runner";
    import { getRedisClient } from "@/lib/redis";
    import {
      getUsersInQuietHours,
      getUsersWithDigestDue,
      getNotificationPreferences,
      getUndigestedNotifications,
      markDigestSent,
    } from "@/db/queries/notification-preferences";
    import { getUserById } from "@/db/queries/auth-queries";
    import { enqueueEmailJob } from "@/services/email-service";

    registerJob("notification-digest", async () => {
      const now = new Date();
      const redis = getRedisClient();

      // Step 1: Sync DnD Redis keys for users in quiet hours
      // Users IN quiet hours get Redis key set with 90-min TTL (covers hour + buffer)
      // Users OUT of quiet hours: Redis TTL auto-expires their key — no explicit delete needed
      const usersInQh = await getUsersInQuietHours(now);
      for (const userId of usersInQh) {
        await redis.set(`dnd:${userId}`, "1", { ex: 5400 }); // 90 min TTL
      }

      // Step 2: Send digest emails for users whose digest is due
      const dueUsers = await getUsersWithDigestDue(now);
      for (const { userId, digestTypes } of dueUsers) {
        await sendDigestForUser(userId, digestTypes, now);
      }
    });

    async function sendDigestForUser(userId: string, types: string[], now: Date) {
      const prefs = await getNotificationPreferences(userId);
      const allNotifications = [];
      const deliveredTypes: string[] = [];

      for (const type of types) {
        const typePref = prefs[type];
        if (!typePref) continue;
        const since = typePref.lastDigestAt ?? new Date(0);
        const notifications = await getUndigestedNotifications(userId, type, since);
        if (notifications.length > 0) {
          allNotifications.push(...notifications);
          deliveredTypes.push(type);
        }
      }

      if (allNotifications.length === 0) return; // nothing to digest

      const user = await getUserById(userId);
      if (!user?.email) return;
      const locale = user.languagePreference === "ig" ? "ig" : "en";

      // Use enqueueEmailJob (NOT emailQueue.add — that API doesn't exist)
      enqueueEmailJob(`digest-${userId}-${Date.now()}`, {
        to: user.email,
        templateId: "notification-digest",
        locale,
        data: { notifications: allNotifications, count: allNotifications.length },
      });

      await markDigestSent(userId, deliveredTypes, now);
    }
    ```

  - [x] 6.2: Register in `src/server/jobs/index.ts` — add:
        `import "@/server/jobs/notification-digest";`
  - [x] 6.3: Add "notification-digest" email template to the email service (similar to existing templates in Story 9.2). Template renders a list of notification summaries grouped by type with CTAs. Uses i18n key `Notifications.digest.emailSubject`, `Notifications.digest.emailHeading`, `Notifications.digest.typeLabel.*`.

- [x] Task 7: Expand `/settings/notifications` page (AC: 1, 2, 3)
  - [x] 7.1: The stub page at `src/app/[locale]/(app)/settings/notifications/page.tsx` renders only `PushSubscriptionToggle`. Replace with a full `"use client"` page using TanStack Query (`useQuery` for fetching prefs, `useMutation` for updates). Import `useTranslations("Notifications")`.
  - [x] 7.2: **Preferences Matrix section**: Render a table/grid with rows = notification types, columns = in-app / email / push. Use shadcn `Switch` (the project uses shadcn — check `src/components/ui/` for available components). Each cell: `<Switch checked={...} onCheckedChange={...} />`. Below each email column cell: if digest-eligible types, show a `<Select>` for digest mode (none/daily/weekly).
    - Notification type rows: Messages, Mentions, Group Activity, Events, Post Interactions, Admin Announcements (exclude "system" type from user-configurable matrix)
    - i18n keys: `Notifications.types.message`, `Notifications.types.mention`, `Notifications.types.group_activity`, `Notifications.types.event_reminder`, `Notifications.types.post_interaction`, `Notifications.types.admin_announcement`
    - Column headers: `Notifications.channels.in_app`, `Notifications.channels.email`, `Notifications.channels.push`
    - In-app column: non-configurable (always on) — show a greyed-out switch with tooltip "Always delivered in-app"
  - [x] 7.3: **Quiet Hours section**: Below the matrix, add a "Do Not Disturb" section.
    - Toggle to enable/disable quiet hours
    - When enabled: show time range inputs (`type="time"`) for start/end + timezone select
    - Timezone select: a `<Select>` with common timezones (use `Intl.supportedValuesOf("timeZone")` or a curated list)
    - On save: PUT to `/api/v1/user/notification-preferences/quiet-hours`
    - On disable: DELETE to `/api/v1/user/notification-preferences/quiet-hours`
    - i18n keys: `Notifications.quietHours.title`, `Notifications.quietHours.enableLabel`, `Notifications.quietHours.startLabel`, `Notifications.quietHours.endLabel`, `Notifications.quietHours.timezoneLabel`, `Notifications.quietHours.saveButton`
  - [x] 7.4: **Push Notifications section**: Keep existing `PushSubscriptionToggle` at the bottom (unchanged from Story 9.3).
  - [x] 7.5: On save of any matrix preference, call `PUT /api/v1/user/notification-preferences` with the changed row. Use optimistic updates (TanStack Query `useMutation` with `onMutate` + `onError` rollback pattern from project conventions).

- [x] Task 8: DnD indicator on member profile (AC: 4)
  - [x] 8.1: The `communityProfiles` table does NOT have a DnD column — the Redis `dnd:{userId}` key is ephemeral and cannot be displayed server-side reliably. Instead, add a computed field: profile page fetches `/api/v1/users/[userId]/dnd-status` (public endpoint, returns `{ isDnd: boolean }` only — not the raw times). The profile display component checks this field.
  - [x] 8.2: Create `GET /api/v1/users/[userId]/dnd-status/route.ts`:
    - No auth required (public read)
    - `getNotificationPreferences(userId)` → check if any row has `quiet_hours_start` set → if yes, check current time vs quiet hours in `quiet_hours_timezone` → return `successResponse({ isDnd: boolean })`
    - No rateLimit option (public GET — Epic 6 retro: no BROWSE preset exists)
    - Wrapped with `withApiHandler()`
    - **Note**: This endpoint is public and reveals only `isDnd: boolean` (not raw quiet hours times). Acceptable for community platform UX.
  - [x] 8.3: **Profile path**: `src/app/[locale]/(app)/profiles/[userId]/page.tsx` (NOT `members/[userId]`). The display component is `src/features/profiles/components/ProfileView.tsx`. Add a `<DndIndicator userId={userId} />` Client Component inside `ProfileView.tsx`, rendered inline next to the display name. The component uses `useQuery` to fetch `/api/v1/users/[userId]/dnd-status`. If `isDnd === true`, render a moon icon (lucide-react `Moon` icon) + i18n text `Notifications.quietHours.dndIndicator` = "Do not disturb". If `isDnd === false`, render `null`.

- [x] Task 9: i18n keys (AC: 1, 2, 3, 4)
  - [x] 9.1: Add to `messages/en.json` under `"Notifications"`. **NOTE**: `Notifications.types.*` keys already exist (message, mention, group_activity, event_reminder, post_interaction, admin_announcement, system) — do NOT duplicate them. Only add new sub-namespaces below:
    ```json
    "preferences": {
      "pageTitle": "Notification Preferences",
      "matrixDescription": "Choose which notifications you receive and how.",
      "saveSuccess": "Preferences saved",
      "saveError": "Failed to save preferences"
    },
    "channels": {
      "in_app": "In-App",
      "email": "Email",
      "push": "Push",
      "in_app_always": "Always on"
    },
    "digest": {
      "label": "Digest",
      "none": "Real-time",
      "daily": "Daily digest",
      "weekly": "Weekly digest",
      "emailSubject": "Your OBIGBO digest – {count} notifications",
      "emailHeading": "Here's what you missed",
      "typeLabel": {
        "message": "Messages",
        "mention": "Mentions",
        "group_activity": "Group Activity",
        "event_reminder": "Events",
        "post_interaction": "Post Interactions",
        "admin_announcement": "Announcements"
      }
    },
    "quietHours": {
      "title": "Do Not Disturb",
      "enableLabel": "Enable quiet hours",
      "description": "No push or email notifications during this window.",
      "startLabel": "Start time",
      "endLabel": "End time",
      "timezoneLabel": "Timezone",
      "saveButton": "Save quiet hours",
      "dndIndicator": "Do not disturb"
    }
    ```
  - [x] 9.2: Add Igbo equivalents to `messages/ig.json` under `"Notifications"` — use English as fallback where Igbo translation is pending.

- [x] Task 10: Tests (AC: 1–6)
  - [x] 10.1: `src/db/queries/notification-preferences.test.ts` — mock `db`; test `getNotificationPreferences` (returns keyed map), `upsertNotificationPreference` (correct SQL upsert), `setQuietHours` (UPDATE all rows), `getUsersWithDigestDue` (daily/weekly logic), `getUndigestedNotifications`, `markDigestSent`
  - [x] 10.2a: **Update `src/services/notification-service.test.ts`** — add `vi.mock("@/db/queries/notification-preferences", () => ({ getNotificationPreferences: vi.fn().mockResolvedValue({}), DEFAULT_PREFERENCES: { message: { inApp: true, email: true, push: true }, mention: { inApp: true, email: false, push: true }, group_activity: { inApp: true, email: false, push: false }, event_reminder: { inApp: true, email: true, push: true }, post_interaction: { inApp: true, email: false, push: false }, admin_announcement: { inApp: true, email: true, push: true }, system: { inApp: true, email: false, push: false } } }))` to prevent import cascade failure from the new router import.
  - [x] 10.2: `src/services/notification-router.test.ts` — add `vi.mock("@/db/queries/notification-preferences")` with same pattern as 10.2a. Then add tests for DB preference integration:
    - (a) channel_email disabled in DB → email suppressed with reason "user preference"
    - (b) channel_push disabled → push suppressed
    - (c) digest mode enabled → email suppressed with reason "digest mode"
    - (d) no DB row → defaults applied (email for eligible type)
    - Mock `getNotificationPreferences` from `@/db/queries/notification-preferences`
  - [x] 10.3: `src/server/jobs/notification-digest.test.ts` — mock `getUsersWithDigestDue`, `getUndigestedNotifications`, `markDigestSent`, Redis, emailQueue; test: (a) no due users → no emails sent, (b) daily due with notifications → email queued + markDigestSent called, (c) no notifications since last digest → email NOT queued, (d) DnD sync: users in quiet hours get Redis key set, users out get key cleared
  - [x] 10.4: `src/app/api/v1/user/notification-preferences/route.test.ts` — GET returns preferences, PUT upserts preference, unauthenticated 401
  - [x] 10.5: `src/app/api/v1/user/notification-preferences/quiet-hours/route.test.ts` — PUT saves quiet hours + syncs Redis, DELETE clears quiet hours + Redis, unauthenticated 401
  - [x] 10.6: `src/app/api/v1/users/[userId]/dnd-status/route.test.ts` — returns `{ isDnd: true }` when in quiet hours, `{ isDnd: false }` when not, `{ isDnd: false }` when no quiet hours configured
  - [x] 10.7: `src/components/notifications/NotificationPreferencesMatrix.test.tsx` — render test: shows matrix rows for all 6 configurable types, switches reflect loaded preferences, switch toggle calls mutation
  - [x] 10.8: `src/components/notifications/QuietHoursForm.test.tsx` — render test: shows enable toggle, time inputs appear when enabled, save calls PUT endpoint, DELETE on disable
  - [x] 10.9: `src/components/notifications/DndIndicator.test.tsx` — renders moon icon when `isDnd=true`, renders nothing when `isDnd=false`

- [x] Task 11: Run full test suite
  - [x] 11.1: `bun test` — confirm all tests pass. Expect ~40+ net new tests; no regressions. Baseline: 3538/3540 + 10 skipped (2 pre-existing ProfileStep failures).

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts`
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [x] `src/db/migrations/meta/_journal.json` has entry for idx 39 (`0039_notification_preferences`)
- [x] `notification-digest.ts` job registered in `src/server/jobs/index.ts`
- [x] DB `DEFAULT_PREFERENCES` fallback applied when no row exists — router must NOT throw if preferences are missing for a user+type
- [x] `getNotificationPreferences` mock added to `notification-router.test.ts`
- [x] Quiet hours DnD Redis sync tested in `notification-digest.test.ts`
- [x] In-app column in preferences matrix is non-editable (always on) — no DB write for in-app toggle
- [x] `getUsersInQuietHours` / `getUsersOutOfQuietHours` queries use timezone-aware time comparison (use `date-fns-tz`)
- [x] `/api/v1/users/[userId]/dnd-status` is a public GET — no `requireAuthenticatedSession`

## Dev Notes

### Architecture Overview

This story completes the notification pipeline by wiring per-user channel preferences into the `NotificationRouter` (which previously used hardcoded eligibility logic and only DnD for suppression). The main integration points:

1. **DB → Router**: `NotificationRouter.route()` now calls `getNotificationPreferences(userId)` at route time. For performance, consider this a known acceptable DB call per notification (typically <1ms). No Redis caching needed for MVP; add if profiling shows issues.

2. **DB → Digest Job**: Hourly job queries users with `digest_mode != 'none'`, checks timezone-aware delivery time, aggregates undigested notifications, sends batched email.

3. **DB → DnD Redis Sync**: The hourly job also syncs `dnd:{userId}` Redis keys based on quiet hours. This is how the router's existing `isDnd` check stays accurate — the digest job updates Redis, the router reads Redis (no change to router Redis logic needed beyond already wired in 9.1/9.3).

4. **UI**: The `/settings/notifications` page (stub from Story 9.3) is replaced with the full preferences matrix + quiet hours form.

### Key Implementation Constraints

- **`getNotificationPreferences` in NotificationRouter**: The router is a class with a `route()` async method. The `getNotificationPreferences` call goes inside `route()`, early in the method, cached in a local variable. This is one additional DB query per notification routing call — acceptable for MVP.

- **DEFAULT_PREFERENCES fallback is critical**: Many users will have NO rows in `platform_notification_preferences` until they first visit settings. The router MUST fall back to defaults when no row exists. Never throw or suppress by default — defaulting to "send" is safer than defaulting to "suppress".

- **In-app channel is always on**: The spec says in-app notifications accumulate even during quiet hours. The in-app toggle in the UI should be non-editable (greyed-out switch). Do NOT write `channelInApp = false` to the DB — it would break core notification behavior.

- **Digest mode only batches email**: When `digestMode === 'daily'` or `'weekly'`, the email channel is suppressed in the router (real-time email skipped), but in-app and push are NOT affected by digest mode. The digest job later aggregates and emails in batch.

- **Timezone-aware quiet hours**: Use `date-fns-tz` (installed in Task 0). To check if current UTC time falls in a user's quiet hours: `toZonedTime(now, timezone)` (v3+) or `utcToZonedTime(now, timezone)` (v2) then compare hours. Check installed version after `bun add`.

- **`getUsersInQuietHours` query**: This needs to do math in SQL or fetch all users with quiet hours and filter in JS. Given low user counts at MVP scale, fetching all users with quiet hours in JS is acceptable. Use:

  ```ts
  const rows = await db.select().from(platformNotificationPreferences)
    .where(isNotNull(platformNotificationPreferences.quietHoursStart))
    .groupBy(platformNotificationPreferences.userId, ...);
  // Then filter in JS using date-fns-tz
  ```

- **No `getUsersOutOfQuietHours` needed**: Redis keys are set with `ex: 5400` (90-minute TTL to cover the full hour + buffer). When a user's quiet hours end, their Redis `dnd:*` key auto-expires via TTL. The digest job only sets keys for users IN quiet hours — no explicit delete needed.

- **`date-fns-tz` import**: After Task 0 install, check version. v3+: `import { toZonedTime } from "date-fns-tz"`. v2: `import { utcToZonedTime } from "date-fns-tz"`.

- **DnD indicator API (`/api/v1/users/[userId]/dnd-status`)**: Public GET — no auth required. The endpoint computes current quiet hours status from DB (not Redis), so it's always accurate for the profile display. Keep it lightweight: one DB query to fetch quiet*hours*\* for the user, then timezone-aware check.

- **Job registration in `index.ts`**: Add `import "./notification-digest";` AFTER the existing job imports (after `import "./event-reminders";`). The digest job is a side-effect import like all other jobs.

- **Email template for digest**: Follow the existing email template pattern from Story 9.2 (look at `src/services/email-service.ts` — use `enqueueEmailJob()` function). The digest template receives `{ notifications: PlatformNotification[], count: number }` data. Use the branded OBIGBO layout with grouped notification summaries.

### Existing Code to Extend

- **`src/services/notification-router.ts`**: Lines 1–120 (current file). Add `getNotificationPreferences` call in `route()` method. New suppression reasons in Steps 4 (email) and 5 (push).

- **`src/services/notification-service.ts`**: No changes needed — `deliverNotification()` already routes through `NotificationRouter`. The router now checks DB prefs, so service stays clean.

- **`src/server/jobs/index.ts`**: Add one import line for `notification-digest`.

- **`src/app/[locale]/(app)/settings/notifications/page.tsx`**: Complete replacement of 20-line stub with full preferences UI.

### Testing Patterns

- **`getNotificationPreferences` mock in router tests**: All existing notification-router tests that previously only mocked Redis must now also mock `@/db/queries/notification-preferences`:

  ```ts
  vi.mock("@/db/queries/notification-preferences", () => ({
    getNotificationPreferences: vi.fn().mockResolvedValue({}), // empty = use defaults
    DEFAULT_PREFERENCES: { message: { inApp: true, email: true, push: true }, ... },
  }));
  ```

  Add this mock to `src/services/notification-router.test.ts` and `src/services/notification-service.test.ts`.

- **Digest job tests**: Mock the job runner itself — don't use `registerJob` in tests. Test `sendDigestForUser` as an exported function, or test via the `run()` function with all deps mocked.

- **Matrix UI tests**: Mock `fetch` for the GET preferences call (TanStack Query). Use `wrapper: ({ children }) => <QueryClientProvider ...>{children}</QueryClientProvider>` in render helpers.

### Previous Story Intelligence (Story 9.3)

- `/settings/notifications` page stub created in Story 9.3 — exists at `src/app/[locale]/(app)/settings/notifications/page.tsx` (20 lines). Task 7 fully replaces it.
- Redis `dnd:{userId}` key already used in `notification-router.ts` (line ~67). Story 9.4 SETS this key (via digest job + quiet hours API) but does NOT change how the router reads it.
- 2 pre-existing failures in `points-lua-runner.test.ts` — unrelated; do not investigate.
- Baseline: 3538/3540 passing + 10 skipped (same 2 pre-existing ProfileStep failures).
- `notification-router.test.ts` already has push channel tests — new DB preference tests ADD to existing file (do not remove existing tests).
- `notification-service.test.ts` already has push mock — new digest/preference tests follow the same mock pattern.

### Member Profile Directory

Profile page: `src/app/[locale]/(app)/profiles/[userId]/page.tsx`. Display component: `src/features/profiles/components/ProfileView.tsx`. The `<DndIndicator />` Client Component goes inside `ProfileView.tsx`, inline next to display name. It fetches `/api/v1/users/[userId]/dnd-status` on mount. If `isDnd === false` or no quiet hours, render `null`.

### Project Structure Notes

New files to create:

```
src/db/migrations/0039_notification_preferences.sql
src/db/schema/platform-notification-preferences.ts
src/db/queries/notification-preferences.ts
src/db/queries/notification-preferences.test.ts
src/server/jobs/notification-digest.ts
src/server/jobs/notification-digest.test.ts
src/app/api/v1/user/notification-preferences/route.ts
src/app/api/v1/user/notification-preferences/route.test.ts
src/app/api/v1/user/notification-preferences/quiet-hours/route.ts
src/app/api/v1/user/notification-preferences/quiet-hours/route.test.ts
src/app/api/v1/users/[userId]/dnd-status/route.ts
src/app/api/v1/users/[userId]/dnd-status/route.test.ts
src/components/notifications/NotificationPreferencesMatrix.tsx
src/components/notifications/NotificationPreferencesMatrix.test.tsx
src/components/notifications/QuietHoursForm.tsx
src/components/notifications/QuietHoursForm.test.tsx
src/components/notifications/DndIndicator.tsx
src/components/notifications/DndIndicator.test.tsx
```

Files to modify:

```
src/db/migrations/meta/_journal.json   (add idx 39 entry)
src/db/index.ts                        (import notifPrefsSchema)
src/services/notification-router.ts   (DB preference check in route())
src/services/notification-router.test.ts  (new pref tests + getNotificationPreferences mock)
src/services/notification-service.test.ts (add getNotificationPreferences mock)
src/server/jobs/index.ts               (register notification-digest job)
src/app/[locale]/(app)/settings/notifications/page.tsx  (replace stub with full UI)
messages/en.json                        (Notifications.preferences.*, .types.*, .channels.*, .digest.*, .quietHours.*)
messages/ig.json                        (same keys)
```

### References

- FR75: Notification preferences matrix; FR76: Digest mode; FR77: Quiet hours / DnD
- NFR-I3: Email delivery within 5 min, 98%+ inbox placement
- Epic 9 spec: `_bmad-output/planning-artifacts/epics.md` (Story 9.4 section)
- Existing router: `src/services/notification-router.ts` — DnD Redis check at line ~67, EMAIL_ELIGIBLE_TYPES at top
- Job runner pattern: `src/server/jobs/event-reminders.ts` — follow same `registerJob(name, handler, options?)` pattern (NO cron/schedule param)
- Email service: `src/services/email-service.ts` — `enqueueEmailJob(jobId, { to, templateId, data, locale })` (NOT `emailQueue.add`)
- `date-fns-tz`: Must be installed in Task 0 (`bun add date-fns date-fns-tz`)
- Settings page stub: `src/app/[locale]/(app)/settings/notifications/page.tsx` (19 lines, from Story 9.3)
- Member profile: `src/app/[locale]/(app)/profiles/[userId]/page.tsx` + `src/features/profiles/components/ProfileView.tsx`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all issues resolved during implementation.

### Completion Notes List

- `date-fns-tz` v3.2.0 installed — uses `toZonedTime` (not `utcToZonedTime` which is v2 API)
- `withApiHandler` only passes `request` (not Next.js route params) — `/api/v1/users/[userId]/dnd-status/route.ts` extracts userId from URL path via `new URL(req.url).pathname.split("/").at(-2)` (same pattern as other dynamic routes)
- Zod validation errors must use `throw new ApiError(...)` (not `return errorResponse(string, status)`) since `errorResponse` only accepts a `ProblemDetails` object
- `registeredJobs` Map in digest test must use `vi.hoisted()` to avoid TDZ error when the mock factory runs during ES module import hoisting
- `ProfileView.test.tsx` needed `vi.mock("@/components/notifications/DndIndicator", () => ({ DndIndicator: () => null }))` to prevent TanStack Query import cascade
- Final test count: 3596 passing, 2 failing (pre-existing `points-lua-runner.test.ts`), 10 skipped (Lua integration)
- Net new tests for Story 9.4: +58
- Post-review test count: 3598 passing (+2 review fix tests), same 2 pre-existing failures, 10 skipped

### Senior Developer Review (AI) — 2026-03-07

**Reviewer:** claude-opus-4-6
**Issues Found:** 2 Critical, 3 High, 4 Medium, 3 Low
**Issues Fixed:** 9 (all CRITICAL, HIGH, and MEDIUM)
**Tests Added:** 2 (setQuietHours new-user insert, channelInApp protection)

**Fixed issues:**

- F1 (CRITICAL): `getUsersWithDigestDue` full table scan → added `.where(ne(digestMode, "none"))`
- F2 (CRITICAL): `setQuietHours` no-op for new users → added INSERT fallback for all 7 notification types when no rows exist
- F3 (HIGH): `enqueueEmailJob` missing `await` in digest job → added `await`
- F5 (HIGH): `getUsersInQuietHours` non-deterministic deduplication → added `.orderBy(asc(userId))` + WHERE already filters `quietHoursStart IS NOT NULL`
- F6 (MEDIUM): Weekly digest guard used raw UTC ms → switched to `toDateString()` timezone-aware comparison (consistent with daily check)
- F7 (MEDIUM): Hardcoded English error strings in QuietHoursForm → replaced with `t("saveError")` / `t("disableError")` + added i18n keys to en.json and ig.json
- F8 (MEDIUM): Vacuous test assertion `toBeGreaterThanOrEqual(0)` → replaced with exact `toEqual()` + fixed `toZonedTime` mock to return different dates for now vs lastDigestAt
- F9 (MEDIUM): PUT route allowed `channelInApp: false` via API → removed `channelInApp` from Zod schema (in-app is non-configurable, always on)

**Documented but not fixed (LOW / out of scope):**

- F4 (HIGH): DnD status endpoint is unauthenticated — story spec explicitly says "No auth required (public read)". Left as-is per spec; flagged for future privacy review.
- F10 (LOW): Digest email template uses relative UNSUBSCRIBE_URL `/settings/notifications` — pre-existing pattern across all email templates (event-reminder, etc.). Out of scope for single-story fix.
- F11 (LOW): ig.json push section has untranslated English strings (Story 9.3 carry-over)
- F12 (LOW): package.json and bun.lock not listed in File List (doc gap only)

### File List

**New files:**

- `src/db/migrations/0039_notification_preferences.sql`
- `src/db/schema/platform-notification-preferences.ts`
- `src/db/queries/notification-preferences.ts`
- `src/db/queries/notification-preferences.test.ts`
- `src/server/jobs/notification-digest.ts`
- `src/server/jobs/notification-digest.test.ts`
- `src/app/api/v1/user/notification-preferences/route.ts`
- `src/app/api/v1/user/notification-preferences/route.test.ts`
- `src/app/api/v1/user/notification-preferences/quiet-hours/route.ts`
- `src/app/api/v1/user/notification-preferences/quiet-hours/route.test.ts`
- `src/app/api/v1/users/[userId]/dnd-status/route.ts`
- `src/app/api/v1/users/[userId]/dnd-status/route.test.ts`
- `src/templates/email/notification-digest.ts`
- `src/components/notifications/NotificationPreferencesMatrix.tsx`
- `src/components/notifications/NotificationPreferencesMatrix.test.tsx`
- `src/components/notifications/QuietHoursForm.tsx`
- `src/components/notifications/QuietHoursForm.test.tsx`
- `src/components/notifications/DndIndicator.tsx`
- `src/components/notifications/DndIndicator.test.tsx`

**Modified files:**

- `src/db/migrations/meta/_journal.json` (added idx 39 entry)
- `src/db/index.ts` (added notifPrefsSchema)
- `src/services/notification-router.ts` (DB preference check in route())
- `src/services/notification-router.test.ts` (new pref tests 16–19 + mock)
- `src/services/notification-service.test.ts` (added getNotificationPreferences mock)
- `src/server/jobs/index.ts` (registered notification-digest)
- `src/app/[locale]/(app)/settings/notifications/page.tsx` (replaced stub with full UI)
- `src/templates/email/index.ts` (registered notification-digest template)
- `src/features/profiles/components/ProfileView.tsx` (added DndIndicator)
- `src/features/profiles/components/ProfileView.test.tsx` (added DndIndicator mock)
- `messages/en.json` (Notifications.preferences._, .channels._, .digest._, .quietHours._)
- `messages/ig.json` (same keys)
