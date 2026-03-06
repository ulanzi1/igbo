---
title: "Event UX Enhancements — Timezones, Group Feed, RSVP & Change Notifications"
slug: "event-ux-enhancements"
created: "2026-03-06"
status: "ready-for-dev"
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  [
    "Next.js 16.1 App Router",
    "TypeScript strict",
    "Drizzle ORM",
    "PostgreSQL",
    "Zod v4",
    "React Query (tanstack)",
    "next-intl",
    "Vitest",
    "shadcn/ui",
  ]
files_to_modify:
  - src/db/schema/community-events.ts
  - src/db/queries/events.ts
  - src/db/migrations/meta/_journal.json
  - src/services/event-service.ts
  - src/app/api/v1/events/[eventId]/route.ts
  - src/features/events/components/EventForm.tsx
  - src/features/events/components/EventCard.tsx
  - src/features/events/components/EventDetailActions.tsx
  - src/features/events/components/EventsPageTabs.tsx
  - src/features/groups/components/GroupFeedTab.tsx
  - src/types/events.ts
  - messages/en.json
  - messages/ig.json
files_to_create:
  - src/db/migrations/0034_event_change_metadata.sql
  - src/features/events/components/GroupEventCard.tsx
  - src/features/events/components/GroupEventCard.test.tsx
code_patterns:
  - 'DB migration: hand-write SQL + add journal entry (idx 34, version "7", when 1708000034000)'
  - 'Zod import from "zod/v4"; errors: parsed.error.issues[0] (NOT parsed.issues[0])'
  - "API routes wrapped with withApiHandler(); user self-service = requireAuthenticatedSession()"
  - "successResponse(data, meta?, status) — status is 3rd arg"
  - "EventBus.emit from services never from routes"
  - "All strings via useTranslations(); no hardcoded user-facing strings"
  - "Tests co-located with source; @vitest-environment node for server files"
  - "db.execute() returns raw array — Array.from(rows) directly, NOT { rows: [...] }"
test_patterns:
  - 'event-service.test.ts: requires vi.mock("@/env"), vi.mock("@/lib/s3-client"), S3 SDK mocks'
  - "GroupFeedTab.test.tsx: QueryClientProvider wrapper + global.fetch mock per-test"
  - 'EventForm.test.tsx: @vitest-environment jsdom, vi.mock("next-intl") + vi.mock("@/i18n/navigation")'
  - "Route tests: use real withApiHandler; mock requireAuthenticatedSession from @/services/permissions"
  - "Per-mock mockReset() in beforeEach — NOT vi.resetAllMocks()"
---

# Tech-Spec: Event UX Enhancements — Timezones, Group Feed, RSVP & Change Notifications

**Created:** 2026-03-06

## Overview

### Problem Statement

Five UX gaps in the event management system reduce usefulness for the global Igbo diaspora community:

1. The timezone selector shows only 16 hardcoded zones — too limited for members in underrepresented regions.
2. Group events don't surface in the group feed; members must navigate to a separate events page to discover them.
3. Cancelled events disappear entirely from a member's My RSVP view, removing context about events they cared about.
4. When an organiser cancels an event, there is no structured way to explain why — members receive no reason.
5. When an event's date/time is changed, there is no visual indicator distinguishing a postponement from an earlier move.

### Solution

Five targeted enhancements:

1. **Full timezone list**: Replace the static 16-zone constant with `Intl.supportedValuesOf('timeZone')` grouped by continent/region using HTML `<optgroup>`.
2. **Group events in feed**: Add a read-only upcoming-events section (distinct card type) at the top of `GroupFeedTab` that fetches `GET /api/v1/events?groupId=X&limit=3` (endpoint already exists).
3. **Cancelled events in My RSVP**: Include organiser-cancelled events in `listMyRsvps` for members who held a valid RSVP at time of cancellation; show with a red "Cancelled" badge and the cancellation reason.
4. **Cancellation reason**: Add required `cancellationReason` field to the cancel flow — stored in a new DB column, returned in My RSVP API, displayed to affected members.
5. **Date-change tag + comment**: Add `dateChangeType` (`postponed | preponed`, auto-set server-side) and `dateChangeComment` (required client input when `startTime` changes) to the events schema; surface as a visible badge on all event cards.

### Scope

**In Scope:**

- `EventForm.tsx` timezone selector: grouped full IANA list via `Intl.supportedValuesOf('timeZone')`
- `GroupFeedTab.tsx`: upcoming group events section at top of feed (read-only, max 3 cards)
- `listMyRsvps` query + type: include organiser-cancelled events with `cancellationReason`
- `EventCard.tsx`: `dateChangeType` badge (postponed / preponed)
- Cancel event: `cancellationReason` required in DELETE body, stored in DB
- Update event: `dateChangeComment` required when `startTime` changes; `dateChangeType` auto-set in service
- DB migration `0034`: new `date_change_type_enum` + 3 columns (`cancellation_reason`, `date_change_type`, `date_change_comment`)
- `EventDetailActions.tsx`: required reason textarea in cancel confirmation dialog
- `EventsPageTabs.tsx`: My RSVPs tab shows cancelled events with badge + reason
- New `GroupEventCard.tsx` component for the group feed events section
- i18n keys EN + IG for all new strings
- Tests for all changed/new logic

**Out of Scope:**

- Push/email notifications for cancellation or date change
- Inline RSVP from within the group feed event card
- Creating or editing events from within the group feed
- Recurrence handling changes
- Showing `cancellationReason` outside My RSVP context (e.g. public listing)
- Showing full `dateChangeComment` note outside My RSVP / event detail

---

## Context for Development

### Codebase Patterns

**Migration (CRITICAL — two steps)**

1. Hand-write SQL in `src/db/migrations/NNNN_name.sql`
2. Add journal entry to `src/db/migrations/meta/_journal.json`: `{ "idx": N, "version": "7", "when": 1708000000000+N, "tag": "NNNN_name", "breakpoints": true }`. Without journal entry, drizzle-kit never applies the SQL.

**API routes**

- Wrap with `withApiHandler()` from `@/server/api/middleware`
- Auth: `requireAuthenticatedSession()` from `@/services/permissions`
- Input validation: `Schema.safeParse(body)` → check `!parsed.success` → `throw new ApiError({ title, status: 422, detail: parsed.error.issues[0]?.message })`
- Response: `successResponse(data)` or `successResponse(data, undefined, 201)` (status is **3rd arg**)

**EventBus**: emit from services only, never from route handlers.

**i18n**: all user-facing strings via `useTranslations("Namespace")` / `getTranslations("Namespace")`. No hardcoded strings.

**Zod**: `import { z } from "zod/v4"`. Errors: `parsed.error.issues[0]?.message` (not `parsed.issues[0]`).

**DB execute**: `db.execute(sql\`...\`)`returns a raw array. Access directly:`Array.from(rows)`or`rows.map(...)`. NOT `{ rows: [...] }`.

**Tests — critical mocks**

- Server test files: `// @vitest-environment node` + `vi.mock("server-only", () => ({}))`
- Any file importing `event-service.ts` needs: `vi.mock("@/env", ...)`, `vi.mock("@/lib/s3-client", ...)`, `vi.mock("@aws-sdk/client-s3", ...)`, `vi.mock("@aws-sdk/s3-request-presigner", ...)` (S3 import chain from Story 7.4)
- `vi.mock("@/db/queries/groups", () => ({ getUserPlatformRole: vi.fn().mockResolvedValue("MEMBER") }))` needed when importing event-service
- Per-mock `mockReset()` in `beforeEach` — NOT `vi.resetAllMocks()` (breaks `vi.mock()` factory)
- Route tests: use real `withApiHandler`; mock `requireAuthenticatedSession` and service functions

### Files to Reference

| File                                                    | Purpose                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/db/schema/community-events.ts`                     | Event schema + enums — add `dateChangeTypeEnum` + 3 columns                                      |
| `src/db/migrations/meta/_journal.json`                  | Add idx:34 entry after existing idx:33 (`0033_event_recordings_reminders`)                       |
| `src/db/queries/events.ts`                              | `listMyRsvps()` lines 634–669 (rewrite WHERE + SELECT), `cancelEvent()` DB fn (add reason param) |
| `src/services/event-service.ts`                         | `cancelEvent()` lines 546–574 (add reason), `updateEvent()` lines 199–262 (add dateChange logic) |
| `src/app/api/v1/events/[eventId]/route.ts`              | DELETE handler lines 80–99 (add body parse), PATCH handler lines 49–76                           |
| `src/app/api/v1/events/route.ts`                        | GET already supports `?groupId=` + `?limit=` — no changes needed                                 |
| `src/features/events/components/EventForm.tsx`          | `COMMON_TIMEZONES` const lines 8–26 (remove), timezone `<select>` lines 307–324 (replace)        |
| `src/features/events/components/EventCard.tsx`          | Add `dateChangeType` badge after `EventStatusBadge` in header row                                |
| `src/features/events/components/EventDetailActions.tsx` | Add `reason`/`reasonError` state + textarea inside confirm dialog                                |
| `src/features/events/components/EventsPageTabs.tsx`     | My RSVPs tab lines 84–98 — differentiate cancelled vs active                                     |
| `src/features/groups/components/GroupFeedTab.tsx`       | Add upcoming events query + `GroupEventCard` section at top                                      |
| `src/types/events.ts`                                   | Update `EventCancelledEvent` (add `reason`), add `EventDateChangedEvent`                         |
| `messages/en.json`                                      | `Events.*` namespace — add new keys                                                              |
| `messages/ig.json`                                      | Mirror new keys (English as placeholder per project pattern)                                     |

### Technical Decisions

1. **Timezone grouping**: `Intl.supportedValuesOf('timeZone')` — no package needed; available in Node 18+ and all modern browsers. Group by first `/`-delimited segment. Use `<optgroup label={continent}>`. Sort continents alphabetically; zones within each continent alphabetically. Display label: replace `_` with space. Run as `useMemo` in the Client Component.

2. **Group events in feed**: `GET /api/v1/events?groupId={groupId}&limit=3` already works. `GroupFeedTab` adds a `useQuery` (staleTime 60s) and renders a new `GroupEventCard` component in a labelled section above the posts. Max 3 events + "View all" link. Section hidden entirely when 0 events.

3. **Cancelled events in My RSVP**: Proxy detection — `e.status = 'cancelled' AND ea.status = 'cancelled'`. The `cancelAllEventRsvps()` cascade (only triggered during organiser cancel) sets `ea.status = 'cancelled'` for registered/waitlisted rows; self-RSVP cancels set `ea.status = 'cancelled'` without touching `e.status`. So both columns `= 'cancelled'` = organiser-cancelled with valid prior RSVP. **Known edge case**: if a member self-cancels their RSVP and the organiser later cancels the event, the proxy will still match that member (both flags are `'cancelled'`). Accepted behaviour — they still saw the event cancelled and the reason is relevant. Active RSVPs still require `e.start_time > NOW()`; cancelled events have no time filter.

4. **Cancellation reason transport**: DELETE handler parses JSON body `{ cancellationReason: string }`. HTTP DELETE with body is RFC-7230 valid and works with `fetch()`. Avoids a new route path. **The existing passing DELETE route tests call DELETE with no body and expect 200. These must be updated in Task 14 to provide a reason body.**

5. **Date-change type**: `dateChangeType` is NOT client input — computed in `updateEvent()` service. `new Date(data.startTime) > event.startTime` → `"postponed"`, else `"preponed"`. `dateChangeComment` is in `UpdateEventSchema` as optional string; service validates it as required when `data.startTime` is set (throws 422 if absent). **Reset behaviour**: `dateChangeType` is overwritten on every `startTime` PATCH — the badge always reflects the most recent date move relative to whatever was stored before that PATCH. There is no mechanism to clear a stale badge without changing `startTime` again; this is accepted scope. Multiple sequential date changes are handled correctly (each overwrite is independent).

6. **`dateChangeType` visibility**: Badge shown on `EventCard` for all viewers. `dateChangeComment` (the full note) included in `MyRsvpEventListItem` and displayed only in My RSVPs tab.

7. **`EventListItem` type extension**: Add `dateChangeType: "postponed" | "preponed" | null` and `dateChangeComment: string | null`. All raw `db.execute(sql...)` queries returning `EventListItem` need these columns in their SELECT. **Drizzle `db.select({ col1, col2, ... })` with explicit projections does NOT auto-include new columns** — this applies to `listGroupEvents` which uses an explicit select object. Only `db.select().from(table)` (no projection arg) auto-includes new columns.

8. **Zod validation messages**: Use plain human-readable English strings in Zod `min()` messages (e.g. `"Cancellation reason is required"`). Do NOT use i18n keys as Zod messages — they surface raw in `data.detail` API responses which the client displays directly via `setError(data.detail)`.

---

## Implementation Plan

### Tasks

- [ ] **Task 1: DB Migration SQL**
  - File: `src/db/migrations/0034_event_change_metadata.sql` (CREATE)
  - Action: Write SQL to create `date_change_type_enum` PostgreSQL enum and add three nullable columns to `community_events`:
    ```sql
    CREATE TYPE "date_change_type_enum" AS ENUM ('postponed', 'preponed');
    ALTER TABLE "community_events"
      ADD COLUMN "cancellation_reason" TEXT,
      ADD COLUMN "date_change_type" "date_change_type_enum",
      ADD COLUMN "date_change_comment" TEXT;
    ```
  - File: `src/db/migrations/meta/_journal.json` (MODIFY)
  - Action: Append entry to the `entries` array after the existing idx:33 entry:
    ```json
    {
      "idx": 34,
      "version": "7",
      "when": 1708000034000,
      "tag": "0034_event_change_metadata",
      "breakpoints": true
    }
    ```

- [ ] **Task 2: Drizzle Schema — New Enum + Columns**
  - File: `src/db/schema/community-events.ts` (MODIFY)
  - Action: Add `dateChangeTypeEnum` after the existing `eventStatusEnum`:
    ```typescript
    export const dateChangeTypeEnum = pgEnum("date_change_type_enum", ["postponed", "preponed"]);
    export type DateChangeType = "postponed" | "preponed";
    ```
  - Action: Add three columns to the `communityEvents` table definition (after `recordingMirrorRetryCount`, before `deletedAt`):
    ```typescript
    cancellationReason: text("cancellation_reason"),
    dateChangeType: dateChangeTypeEnum("date_change_type"),
    dateChangeComment: text("date_change_comment"),
    ```

- [ ] **Task 3: i18n Keys — EN + IG**
  - File: `messages/en.json` (MODIFY)
  - Action 1: Under `Events.cancel`, add three keys alongside the existing ones:
    ```json
    "reasonLabel": "Reason for Cancellation",
    "reasonPlaceholder": "Let attendees know why this event is being cancelled",
    "reasonRequired": "A cancellation reason is required"
    ```
  - Action 2: Under `Events.myRsvps`, extend the existing `empty` key with two new keys:
    ```json
    "cancelledBadge": "Cancelled by organiser",
    "cancelledReason": "Reason: {reason}"
    ```
  - Action 3: Add new `Events.dateChange` namespace:
    ```json
    "dateChange": {
      "postponed": "Postponed",
      "preponed": "Brought Forward",
      "commentLabel": "Reason for Date Change",
      "commentPlaceholder": "Explain why the date is changing...",
      "commentRequired": "A note is required when changing the event date"
    }
    ```
  - Action 4: Under `Groups.feed`, add two new keys alongside the existing `postPendingApproval` key:
    ```json
    "upcomingEvents": "Upcoming Events",
    "viewAllEvents": "View all group events"
    ```
  - File: `messages/ig.json` (MODIFY)
  - Action: Mirror all new keys with English text as placeholder (existing project pattern for untranslated keys)

- [ ] **Task 4: DB Query Updates**
  - File: `src/db/queries/events.ts` (MODIFY)
  - Action 1 — Update `cancelEvent` DB function signature to accept and store reason. **Add `ne` to the drizzle-orm import** (it is not currently imported). **Retain the `creatorId` guard in the WHERE clause** to preserve defence-in-depth (the service also checks, but the DB function should not allow cancelling another user's event even if called directly). **Note**: changing the guard from `eq(status, "upcoming")` to `ne(status, "cancelled")` intentionally allows cancelling `live` events — this is the desired behaviour (a live event that must be stopped should be cancellable). Document this explicitly so the reviewer is aware:

    ```typescript
    // Add ne to existing import:
    import { eq, and, ne, isNull, asc, lte, sql, inArray } from "drizzle-orm";

    export async function cancelEvent(
      eventId: string,
      cancelledBy: string,
      reason: string,
    ): Promise<boolean> {
      const [updated] = await db
        .update(communityEvents)
        .set({ status: "cancelled", cancellationReason: reason, updatedAt: new Date() })
        .where(
          and(
            eq(communityEvents.id, eventId),
            eq(communityEvents.creatorId, cancelledBy), // defence-in-depth: only creator
            ne(communityEvents.status, "cancelled"), // allow cancelling live or upcoming
          ),
        )
        .returning({ id: communityEvents.id });
      return !!updated;
    }
    ```

  - Action 2 — Update `EventListItem` interface: add `dateChangeType: "postponed" | "preponed" | null` and `dateChangeComment: string | null` fields.
  - Action 3 — Update `MyRsvpEventListItem` interface. **Critical**: widen the `rsvpStatus` union from `"registered" | "waitlisted"` to include `"cancelled"` — TypeScript will reject `event.rsvpStatus === "cancelled"` in Task 11 if this union is not widened:
    ```typescript
    export interface MyRsvpEventListItem extends EventListItem {
      rsvpStatus: "registered" | "waitlisted" | "cancelled"; // widened from prior 2-value union
      waitlistPosition: number | null;
      cancellationReason: string | null;
    }
    ```
  - Action 4 — Replace `listMyRsvps` SQL query with updated version that:
    - Adds `e.date_change_type AS "dateChangeType"`, `e.date_change_comment AS "dateChangeComment"`, `e.cancellation_reason AS "cancellationReason"` to SELECT
    - Replaces the WHERE clause from the old single-condition filter to:
      ```sql
      AND (
        (ea.status IN ('registered', 'waitlisted') AND e.status != 'cancelled' AND e.start_time > NOW())
        OR
        (e.status = 'cancelled' AND ea.status = 'cancelled')
      )
      ```
    - Updates ORDER BY to: `CASE WHEN e.status = 'cancelled' THEN 1 ELSE 0 END ASC, e.start_time ASC`
  - Action 5 — Add `dateChangeType` and `dateChangeComment` columns to all functions returning `EventListItem`:
    - `listUpcomingEvents`: check if it uses `db.execute(sql...)` with explicit columns — if yes, add `e.date_change_type AS "dateChangeType"` and `e.date_change_comment AS "dateChangeComment"` to SELECT.
    - `listPastEvents`: same check and addition.
    - `listGroupEvents`: **this function uses `db.select({ id: ..., title: ..., ... })` with an explicit projection object — it does NOT auto-include new columns**. Add `dateChangeType: communityEvents.dateChangeType` and `dateChangeComment: communityEvents.dateChangeComment` to the select object explicitly.
    - If any of the above use `db.select().from(communityEvents)` with no projection argument, new columns are included automatically — no change needed for those.
  - Action 6 — Widen the `dbUpdateEvent` DB function parameter type to accept `dateChangeType` and `dateChangeComment`. The current `updates` parameter is typed as a `Pick<>` of specific columns. Add `dateChangeType` and `dateChangeComment` to that Pick union (or switch to `Partial<typeof communityEvents.$inferInsert>` if feasible). Without this, TypeScript will reject `updates.dateChangeType = ...` in Task 6 Action 3:
    ```typescript
    // In events.ts, find the updateEvent DB function parameter type and add:
    // dateChangeType?: "postponed" | "preponed" | null
    // dateChangeComment?: string | null
    // to whatever Pick<CommunityEvent, ...> union is used for the updates param
    ```
  - Notes: `db.execute()` returns raw array; access via `Array.from(rows)`.

- [ ] **Task 5: Cancel Route — Zod Schema + DELETE Handler**
  - File: `src/app/api/v1/events/[eventId]/route.ts` (MODIFY)
  - Action 1 — Add import for `z` from `"zod/v4"` at the top (if not already imported).
  - Action 2 — Add `CancelEventSchema` alongside the existing `UpdateEventSchema` import. **Use a plain English string in `min()` — not an i18n key.** The Zod message becomes `data.detail` in the 422 response, which `EventDetailActions` displays directly via `setError(data.detail)`. A raw i18n key would show as literal text to the user:
    ```typescript
    import { z } from "zod/v4";
    const CancelEventSchema = z.object({
      cancellationReason: z.string().min(1, "Cancellation reason is required"),
    });
    ```
  - Action 3 — Update DELETE handler to parse and validate body:

    ```typescript
    const deleteHandler = async (request: Request) => {
      const { userId } = await requireAuthenticatedSession();
      const eventId = new URL(request.url).pathname.split("/").at(-1) ?? "";

      const body: unknown = await request.json().catch(() => ({}));
      const parsed = CancelEventSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError({
          title: "Unprocessable Entity",
          status: 422,
          detail: parsed.error.issues[0]?.message ?? "Cancellation reason is required",
        });
      }

      await cancelEvent(userId, eventId, parsed.data.cancellationReason);
      return successResponse({ eventId });
    };
    ```

  - Notes: `cancelEvent` import comes from `@/services/event-service` — update that import signature in Task 6.

- [ ] **Task 6: Event Service — cancelEvent + updateEvent**
  - File: `src/services/event-service.ts` (MODIFY)
  - Action 1 — Update `cancelEvent` service function signature to `cancelEvent(userId, eventId, reason: string)` and pass reason to the DB function:
    ```typescript
    const cancelled = await dbCancelEvent(eventId, userId, reason);
    ```
    Also add `reason` to the `eventBus.emit("event.cancelled", { ..., reason })` payload.
  - Action 2 — Extend `UpdateEventSchema` by adding `dateChangeComment` as optional string:
    ```typescript
    export const UpdateEventSchema = CreateEventSchema.omit({
      eventType: true,
      groupId: true,
      recurrencePattern: true,
    })
      .partial()
      .extend({
        dateChangeComment: z.string().min(1).optional(),
      });
    ```
  - Action 3 — In `updateEvent()` function, add the following block **after** date validation but **before** building the `updates` object:
    ```typescript
    // Require dateChangeComment and auto-compute dateChangeType when startTime changes
    // Use plain English in ApiError title — NOT an i18n key (would show as raw string to user)
    if (data.startTime !== undefined) {
      if (!data.dateChangeComment?.trim()) {
        throw new ApiError({
          title: "A note is required when changing the event date",
          status: 422,
        });
      }
      const newStart = new Date(data.startTime);
      updates.dateChangeType = newStart > event.startTime ? "postponed" : "preponed";
      updates.dateChangeComment = data.dateChangeComment;
    }
    ```
  - Action 4 — Update `eventBus.emit("event.updated", ...)` payload to include `dateChangeType: updates.dateChangeType ?? null`.

- [ ] **Task 7: EventForm — Grouped Timezone Selector**
  - File: `src/features/events/components/EventForm.tsx` (MODIFY)
  - Action 1 — Remove the `COMMON_TIMEZONES` constant (lines 8–26).
  - Action 2 — Add `useMemo` to the existing React import.
  - Action 3 — Add inside the component (before the JSX return):
    ```typescript
    const groupedTimezones = useMemo<[string, string[]][]>(() => {
      const all = Intl.supportedValuesOf("timeZone");
      const groups: Record<string, string[]> = {};
      for (const tz of all) {
        const continent = tz.split("/")[0];
        if (!groups[continent]) groups[continent] = [];
        groups[continent].push(tz);
      }
      return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, []);
    ```
  - Action 4 — Replace the timezone `<select>` options (the `.map` over `COMMON_TIMEZONES`) with:
    ```tsx
    {
      groupedTimezones.map(([continent, zones]) => (
        <optgroup key={continent} label={continent}>
          {zones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </optgroup>
      ));
    }
    ```
  - Action 5 — **Add `dateChangeComment` field to edit mode** (`mode === "edit"` only). When `startTime` or `endTime` is changed in the edit form, `dateChangeComment` becomes required by the API. Add state and a conditional textarea:
    ```typescript
    const [dateChangeComment, setDateChangeComment] = useState("");
    ```
    Render a `dateChangeComment` textarea **only when `mode === "edit"`**, placed immediately after the end-time field:
    ```tsx
    {
      mode === "edit" && (
        <div className="space-y-1.5">
          <label htmlFor="date-change-comment" className="text-sm font-medium">
            {t("dateChange.commentLabel")}
            <span className="text-destructive ml-1">*</span>
          </label>
          <textarea
            id="date-change-comment"
            value={dateChangeComment}
            onChange={(e) => setDateChangeComment(e.target.value)}
            placeholder={t("dateChange.commentPlaceholder")}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground">{t("dateChange.commentRequired")}</p>
        </div>
      );
    }
    ```
    Include `dateChangeComment` in the PATCH payload when submitting in edit mode:
    ```typescript
    // In the form submit handler (edit mode):
    body: JSON.stringify({
      ...otherFields,
      ...(dateChangeComment.trim() ? { dateChangeComment } : {}),
    });
    ```
    Note: The API rejects a `startTime` change with no `dateChangeComment`. The field is always rendered in edit mode (not conditionally on whether start time was changed) to keep the UX simple — the server enforces the requirement.
  - Notes: Default `timezone` state value `"UTC"` is unchanged. `Intl.supportedValuesOf` is available in all Next.js 16 browser/Node targets.

- [ ] **Task 8: GroupEventCard Component (NEW)**
  - File: `src/features/events/components/GroupEventCard.tsx` (CREATE)
  - Action: Create new Client Component:

    ```typescript
    "use client";

    import { useTranslations } from "next-intl";
    import { Link } from "@/i18n/navigation";
    import { EventFormatBadge } from "./EventFormatBadge";
    import type { EventListItem } from "@/db/queries/events";

    interface GroupEventCardProps {
      event: EventListItem;
    }

    export function GroupEventCard({ event }: GroupEventCardProps) {
      const t = useTranslations("Events");

      const formattedDate = new Intl.DateTimeFormat("en", {
        timeZone: event.timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(event.startTime));

      return (
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <Link
              href={`/events/${event.id}`}
              className="font-medium text-sm leading-snug hover:text-primary transition-colors truncate"
            >
              {event.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <EventFormatBadge format={event.format} />
              <span>{formattedDate}</span>
            </div>
          </div>
          {event.dateChangeType && (
            <span
              className={`shrink-0 inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
                event.dateChangeType === "postponed"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}
            >
              {t(`dateChange.${event.dateChangeType}`)}
            </span>
          )}
        </div>
      );
    }
    ```

- [ ] **Task 9: GroupFeedTab — Upcoming Events Section**
  - File: `src/features/groups/components/GroupFeedTab.tsx` (MODIFY)
  - Action 1 — Update the existing `@tanstack/react-query` import to include `useQuery` (currently only `useInfiniteQuery` and `useQueryClient` are imported), and add the component/type imports:

    ```typescript
    // BEFORE (existing line):
    import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
    // AFTER:
    import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

    // Add these new imports:
    import { GroupEventCard } from "@/features/events/components/GroupEventCard";
    import type { EventListItem } from "@/db/queries/events";
    ```

  - Action 2 — Add `useQuery` for group events (after the existing `pendingData` query, before the JSX return). Assign to `upcomingGroupEvents`:
    ```typescript
    const { data: groupEventsData } = useQuery<{ events: EventListItem[] }>({
      queryKey: ["group-upcoming-events", groupId],
      queryFn: async () => {
        const res = await fetch(`/api/v1/events?groupId=${groupId}&limit=3`);
        if (!res.ok) throw new Error("Failed to fetch group events");
        const json = (await res.json()) as { data: { events: EventListItem[] } };
        return json.data;
      },
      staleTime: 60_000,
    });
    const upcomingGroupEvents = groupEventsData?.events ?? [];
    ```
  - Action 3 — Add the upcoming events section as the **first** child inside the main feed container (before any pending posts section, before the posts list). The component already uses `useTranslations("Groups")` — use that same `t` variable:
    ```tsx
    {
      upcomingGroupEvents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t("feed.upcomingEvents")}
          </h3>
          <div className="flex flex-col gap-2">
            {upcomingGroupEvents.map((event) => (
              <GroupEventCard key={event.id} event={event} />
            ))}
          </div>
          <Link
            href={`/events?groupId=${groupId}`}
            className="text-xs text-primary hover:underline mt-2 inline-block"
          >
            {t("feed.viewAllEvents")}
          </Link>
        </div>
      );
    }
    ```
  - Notes: `Link` is already imported from `@/i18n/navigation` in `GroupFeedTab.tsx`. Verify the `useTranslations` variable name (likely `t`) before using `t("feed.upcomingEvents")`.

- [ ] **Task 10: EventDetailActions — Required Cancellation Reason**
  - File: `src/features/events/components/EventDetailActions.tsx` (MODIFY)
  - Action 1 — Add two new state variables after the existing `const [error, setError] = useState`:
    ```typescript
    const [reason, setReason] = useState("");
    const [reasonError, setReasonError] = useState<string | null>(null);
    ```
  - Action 2 — Update `handleCancel` to validate reason and include it in the DELETE body:
    ```typescript
    const handleCancel = async () => {
      if (!reason.trim()) {
        setReasonError(t("cancel.reasonRequired"));
        return;
      }
      setReasonError(null);
      setIsCancelling(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/events/${eventId}`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancellationReason: reason }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { detail?: string };
          setError(data.detail ?? t("cancel.error"));
        } else {
          setCancelled(true);
          setShowConfirm(false);
        }
      } catch {
        setError(t("cancel.error"));
      } finally {
        setIsCancelling(false);
      }
    };
    ```
  - Action 3 — Inside the confirm dialog, add the reason textarea **after** the `<p className="text-sm text-muted-foreground">` description paragraph and **before** the `{error && ...}` error display:
    ```tsx
    <div className="space-y-1.5">
      <label htmlFor="cancel-reason" className="text-sm font-medium">
        {t("cancel.reasonLabel")}
      </label>
      <textarea
        id="cancel-reason"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          if (e.target.value.trim()) setReasonError(null);
        }}
        placeholder={t("cancel.reasonPlaceholder")}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
    </div>
    ```
  - Action 4 — In the "Keep Event" button `onClick`, also reset reason/reasonError:
    ```typescript
    onClick={() => { setShowConfirm(false); setReason(""); setReasonError(null); }}
    ```

- [ ] **Task 11: EventsPageTabs — My RSVPs with Cancelled Events**
  - File: `src/features/events/components/EventsPageTabs.tsx` (MODIFY)
  - Action — Replace the My RSVPs tab content (lines 84–98) with a version that renders cancelled events with a badge + reason and skips `RSVPButton` for cancelled events:
    ```tsx
    <TabsContent value="my-rsvps">
      {myRsvpsError ? (
        <p className="text-destructive text-center py-12">{tCommon("error")}</p>
      ) : myRsvps.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("myRsvps.empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {myRsvps.map((event) => (
            <div key={event.id} className="flex flex-col gap-2">
              <EventCard event={event} />
              {event.rsvpStatus === "cancelled" ? (
                <div className="px-1 space-y-1">
                  <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    {t("myRsvps.cancelledBadge")}
                  </span>
                  {event.cancellationReason && (
                    <p className="text-xs text-muted-foreground">
                      {t("myRsvps.cancelledReason", { reason: event.cancellationReason })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="px-1">
                  <RSVPButton
                    eventId={event.id}
                    registrationLimit={event.registrationLimit}
                    attendeeCount={event.attendeeCount}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TabsContent>
    ```

- [ ] **Task 12: EventCard — Date Change Badge**
  - File: `src/features/events/components/EventCard.tsx` (MODIFY)
  - Action — In the header row `<div className="flex items-start justify-between gap-2">`, add the date change badge **after** `<EventStatusBadge status={event.status} />`:
    ```tsx
    {
      event.dateChangeType && (
        <span
          className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${
            event.dateChangeType === "postponed"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
          }`}
        >
          {t(`dateChange.${event.dateChangeType}`)}
        </span>
      );
    }
    ```
  - Notes: `event: EventListItem` already includes `dateChangeType` after Task 4 type update. No prop changes needed.

- [ ] **Task 13: Types Update**
  - File: `src/types/events.ts` (MODIFY)
  - Action 1 — Update `EventCancelledEvent` to include `reason`:
    ```typescript
    export interface EventCancelledEvent extends BaseEvent {
      eventId: string;
      cancelledBy: string;
      title: string;
      reason: string;
    }
    ```
  - Action 2 — Update `EventUpdatedEvent` to include optional `dateChangeType` (the existing `event.updated` emission in `updateEvent()` now includes this field):
    ```typescript
    export interface EventUpdatedEvent extends BaseEvent {
      eventId: string;
      updatedBy: string;
      title: string;
      dateChangeType: "postponed" | "preponed" | null; // ADD — null when no date change
    }
    ```
  - Action 3 — Add `EventDateChangedEvent` interface (for future subscribers; not emitted separately but kept for type documentation):
    ```typescript
    export interface EventDateChangedEvent extends BaseEvent {
      eventId: string;
      updatedBy: string;
      title: string;
      dateChangeType: "postponed" | "preponed";
    }
    ```
  - Action 4 — Find the `EventName` union type (lists all valid event bus event names as a string union) and add `"event.date_changed"` if `EventDateChangedEvent` is intended as a distinct event bus event, OR skip this action if `dateChangeType` is simply carried on `"event.updated"` (preferred — simpler). **Use the existing `"event.updated"` event name with the extended `EventUpdatedEvent` interface.** Do NOT add a separate `"event.date_changed"` event name unless the EventMap already has a pattern for it.
  - Action 5 — Find the `EventMap` interface (maps event names to payload types) and update the entry for `"event.updated"` to use the updated `EventUpdatedEvent` type. No new map entry needed.

- [ ] **Task 14: Tests**
  - **New file** `src/db/queries/events.myRsvps.test.ts`:
    - `// @vitest-environment node`
    - `vi.mock("server-only", () => ({}))`
    - `vi.mock("@/db", () => ({ db: { execute: vi.fn() } }))`
    - `vi.mock("@/env", () => ({ env: {} }))`
    - Tests:
      - `listMyRsvps` — returns row with `rsvpStatus: "cancelled"` for organiser-cancelled event
      - `listMyRsvps` — returns `cancellationReason` for cancelled event
      - `listMyRsvps` — returns `dateChangeType` and `dateChangeComment` fields
      - `listMyRsvps` — returns active RSVPs with `rsvpStatus: "registered" | "waitlisted"`
      - `listMyRsvps` — **edge case**: member with self-cancelled RSVP (`ea.status='cancelled'`) AND organiser-cancelled event (`e.status='cancelled'`) still appears in results (proxy match is intentional)
      - `cancelEvent` DB fn — calls `db.update()` with `cancellationReason`
      - `cancelEvent` DB fn — returns `true` when row updated, `false` when already cancelled

  - **`src/services/event-service.test.ts`** — add:
    - `cancelEvent` — passes `reason` to `dbCancelEvent` mock
    - `cancelEvent` — emits `event.cancelled` with `reason` in payload
    - `updateEvent` — throws 422 when `startTime` changed but `dateChangeComment` absent
    - `updateEvent` — sets `dateChangeType: "postponed"` when `newStart > oldStart`
    - `updateEvent` — sets `dateChangeType: "preponed"` when `newStart < oldStart`
    - `updateEvent` — does not set `dateChangeType` when `startTime` not in payload
    - `updateEvent` — emits `event.updated` with `dateChangeType` in payload when date changes

  - **`src/app/api/v1/events/[eventId]/route.test.ts`** — **IMPORTANT: update existing tests first, then add new ones**:
    - **UPDATE** all existing DELETE route tests that currently call `DELETE` with no body and expect 200 — they must now send `{ cancellationReason: "Test reason" }` in the request body. Search for `method: "DELETE"` in the test file and update each occurrence.
    - **ADD** new DELETE tests:
      - DELETE without body → 422
      - DELETE with `{ cancellationReason: "" }` → 422
      - DELETE with valid `cancellationReason` → calls `cancelEvent(userId, eventId, reason)` → 200
    - **ADD** new PATCH test:
      - PATCH with `startTime` but no `dateChangeComment` → 422

  - **`src/features/events/components/EventForm.test.tsx`** — add:
    - Timezone dropdown renders `<optgroup>` elements (not flat `<option>` list)
    - `Africa/Lagos` appears inside an optgroup labelled `Africa`
    - Total option count > 100 (verifies full IANA list)
    - Display label contains space not underscore (e.g. `New York` not `New_York`)
    - In `mode="edit"`, a `dateChangeComment` textarea is rendered
    - In `mode="create"`, no `dateChangeComment` textarea is rendered

  - **New file** `src/features/events/components/GroupEventCard.test.tsx`:
    - `// @vitest-environment jsdom`
    - Renders event title as `<a>` linking to `/events/[id]`
    - Renders formatted date string
    - Renders `EventFormatBadge`
    - Shows amber "Postponed" badge when `dateChangeType="postponed"`
    - Shows blue "Brought Forward" badge when `dateChangeType="preponed"`
    - Shows no badge when `dateChangeType` is `null`

  - **`src/features/groups/components/GroupFeedTab.test.tsx`** — add:
    - "Upcoming Events" section renders when fetch returns events
    - `GroupEventCard` is rendered once per event
    - "View all group events" link is rendered
    - Section is absent when fetch returns empty events array

  - **`src/features/events/components/EventsPageTabs.test.tsx`** — add:
    - My RSVPs tab shows "Cancelled by organiser" badge for `rsvpStatus="cancelled"` events
    - Cancellation reason text rendered when `cancellationReason` is present
    - `RSVPButton` NOT rendered for cancelled events

  - **`src/features/events/components/EventDetailActions.test.tsx`** (create if not exists):
    - `// @vitest-environment jsdom`
    - Cancel dialog contains a `<textarea>` for reason
    - Clicking confirm without reason shows inline error, does not call `fetch`
    - Clicking confirm with reason calls `fetch` with `{ cancellationReason: reason }` in body
    - Closing dialog resets reason input

  - **`src/features/events/components/EventCard.test.tsx`** — add:
    - Renders amber "Postponed" badge when `dateChangeType="postponed"`
    - Renders blue "Brought Forward" badge when `dateChangeType="preponed"`
    - Renders no date-change badge when `dateChangeType` is `null`

---

### Acceptance Criteria

- [ ] **AC1 — Full timezone list**
  - Given: user opens the event creation form
  - When: the timezone dropdown is rendered
  - Then: it contains `<optgroup>` elements grouped by continent (e.g. `Africa`, `America`, `Europe`)
  - And: all IANA timezones from `Intl.supportedValuesOf('timeZone')` are present (100+ total)
  - And: continents are sorted A–Z; zones within each continent are sorted A–Z
  - And: underscore characters in zone names are replaced with spaces in the display label

- [ ] **AC2 — Group events section in group feed**
  - Given: a group has upcoming events
  - When: a member views the group feed tab
  - Then: an "Upcoming Events" section appears above the post feed
  - And: up to 3 upcoming events are displayed as `GroupEventCard` components
  - And: each card shows the event title (linked to `/events/[id]`), formatted date, and format badge
  - And: a "View all group events" link is rendered below the cards
  - And: if an event has `dateChangeType` set, a badge ("Postponed" or "Brought Forward") is visible on its card
  - Given: the group has no upcoming events
  - When: a member views the group feed tab
  - Then: the "Upcoming Events" section is not rendered at all

- [ ] **AC3 — Cancelled events appear in My RSVP**
  - Given: a member had a `registered` or `waitlisted` RSVP for an event
  - When: the organiser cancels the event (with a reason)
  - Then: the event appears in the member's My RSVPs tab
  - And: a red "Cancelled by organiser" badge is displayed below the event card
  - And: the cancellation reason is displayed as "Reason: [reason text]"
  - And: no RSVPButton is rendered for the cancelled event
  - Given: a member cancelled their own RSVP before the event was cancelled
  - When: the member views My RSVPs
  - Then: cancelled events from organiser are still shown (the `e.status='cancelled' AND ea.status='cancelled'` proxy includes self-cancel + organiser-cancel edge case — acceptable)

- [ ] **AC4 — Cancellation reason required**
  - Given: event creator opens the cancel confirmation dialog
  - When: they click "Cancel Event" without entering a reason
  - Then: inline error "A cancellation reason is required" appears below the textarea
  - And: no network request is made
  - When: they enter a reason and click confirm
  - Then: `DELETE /api/v1/events/[eventId]` is called with `Content-Type: application/json` and body `{ "cancellationReason": "..." }`
  - And: the event status in DB becomes `cancelled` with `cancellation_reason` populated
  - And: the UI shows the success state
  - Given: the DELETE route receives a request with no body or `cancellationReason` is empty
  - When: the handler processes the request
  - Then: it returns HTTP 422

- [ ] **AC5 — Date change: tag auto-set, comment required**
  - Given: an event creator sends `PATCH /api/v1/events/[eventId]` with a new `startTime` but no `dateChangeComment`
  - When: the route processes the request
  - Then: it returns HTTP 422
  - Given: the same PATCH includes both `startTime` (later than current) and `dateChangeComment`
  - When: the service processes the update
  - Then: `dateChangeType` is set to `"postponed"` in the DB
  - And: `dateChangeComment` is stored
  - Given: the `startTime` moves to an earlier datetime
  - When: the service processes the update
  - Then: `dateChangeType` is set to `"preponed"` in the DB
  - Given: an event has `dateChangeType = "postponed"`
  - When: `EventCard` renders that event
  - Then: an amber "Postponed" badge is visible in the card header
  - Given: an event has `dateChangeType = "preponed"`
  - When: `EventCard` renders that event
  - Then: a blue "Brought Forward" badge is visible in the card header
  - Given: a PATCH does not include a `startTime` change
  - When: the service processes the update
  - Then: `dateChangeType` and `dateChangeComment` are not modified in the DB

---

## Additional Context

### Dependencies

- `Intl.supportedValuesOf('timeZone')` — no new npm package; built-in to V8 (Node 16+) and all target browsers
- `GET /api/v1/events?groupId=X&limit=3` — endpoint already exists in `src/app/api/v1/events/route.ts`; no new route required
- DB migration `0034` must be applied before deploying service/query code changes (columns required at runtime)
- Tasks 1–2 (migration + schema) must be completed before Tasks 4–6 (query + service updates that reference new columns)
- Task 8 (`GroupEventCard`) must be completed before Task 9 (`GroupFeedTab` imports it)
- Task 4 (`EventListItem` type update) must be completed before Tasks 8, 11, 12 (components using new fields)

### Testing Strategy

**Unit tests (all co-located with source):**

- `events.myRsvps.test.ts` — mock `@/db` directly, test SQL WHERE/SELECT logic via mock return values
- `event-service.test.ts` additions — mock all DB query fns + eventBus, test service logic in isolation
- Component tests (`GroupEventCard`, `EventCard`, `EventDetailActions`, `EventsPageTabs`, `GroupFeedTab`, `EventForm`) — `@vitest-environment jsdom`, mock `next-intl`, `@/i18n/navigation`
- Route test additions — use real `withApiHandler`; mock `requireAuthenticatedSession` + service functions

**Critical mock requirements for service tests:**

```typescript
vi.mock("@/env", () => ({
  env: {
    HETZNER_S3_BUCKET: "test-bucket",
    HETZNER_S3_ENDPOINT: "...",
    HETZNER_S3_REGION: "eu-central-1",
    HETZNER_S3_ACCESS_KEY_ID: "key",
    HETZNER_S3_SECRET_ACCESS_KEY: "secret",
    DAILY_WEBHOOK_SECRET: "",
  },
}));
vi.mock("@/lib/s3-client", () => ({ getS3Client: vi.fn().mockReturnValue({}) }));
vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn(function (args) {
    Object.assign(this, args);
  }),
  S3Client: vi.fn(),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://presigned.example.com/download"),
}));
vi.mock("@/db/queries/groups", () => ({
  getUserPlatformRole: vi.fn().mockResolvedValue("MEMBER"),
}));
vi.mock("@/db/queries/platform-settings", () => ({
  getPlatformSetting: vi.fn().mockResolvedValue(53_687_091_200),
}));
```

**Expected test count after this spec:** ~3239 (baseline) + ~55 new = ~3294 passing

### Notes

- Migration 0034 columns are nullable — no backfill SQL needed; existing event rows get `NULL` for all three columns
- Cancelled events in My RSVP will appear empty initially for all existing users since no historical `cancellation_reason` exists — acceptable
- `GroupFeedTab` uses `useTranslations("Groups")` assigned to variable `t` — confirmed from source. Use `t("feed.upcomingEvents")` directly.
- `EventDetailActions.test.tsx` may not exist — check before adding; create if missing
- The `dateChangeComment` field is intentionally not shown on `EventCard` (only the tag badge). Full note display on event detail page is a future enhancement.
- **`listGroupEvents` uses explicit Drizzle column projection** — new columns are NOT auto-included. Task 4 Action 5 requires manual addition.
- **`dateChangeType` stale badge**: no mechanism to clear the badge without changing `startTime` again. If an organiser changes date twice, the badge always reflects the most recent move. This is accepted scope.
- **Zod error messages**: always use plain English strings in Zod validators — never i18n keys. The Zod message flows to `data.detail` in 422 responses which is displayed raw to the user.
- **Existing DELETE tests break**: any test calling `DELETE /events/[id]` with no body will return 422 after Task 5. All such tests in `route.test.ts` must be updated to include `body: JSON.stringify({ cancellationReason: "..." })`.
- **`live` event cancellation**: the updated `cancelEvent` DB function uses `ne(status, "cancelled")` instead of `eq(status, "upcoming")`, intentionally allowing cancellation of `live` events. This is a deliberate behaviour expansion, not a regression.
