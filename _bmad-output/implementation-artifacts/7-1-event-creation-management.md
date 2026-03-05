# Story 7.1: Event Creation & Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an authorized member (Professional or Top-tier),
I want to create events with all necessary details, event types, recurrence settings, and registration limits,
so that I can organize community gatherings both virtual and in-person.

## Acceptance Criteria

1. **Given** a Professional or Top-tier member navigates to create an event (general or group)
   **When** the system checks permissions via `canCreateEvent(userId)`
   **Then** they can set: title, description, date/time (with timezone), duration, event type (`general` or `group`), format (`virtual`, `in_person`, `hybrid`), location or meeting link, registration limit (optional positive integer), and recurrence (`none`, `daily`, `weekly`, `monthly`) (FR65)
   **And** the form validates that start date is in the future and registration limit is a positive integer (if provided)
   **And** the form validates that end time is after start time

2. **Given** a Basic member tries to create an event
   **When** they navigate to the event creation page or submit the form
   **Then** they see: "Event creation is available to Professional and Top-tier members." (i18n key `Events.permissions.createRequired`)
   **And** the create button is not shown / the page redirects them away

3. **Given** a group event is created
   **When** the creator selects a group they belong to (as member or leader/creator)
   **Then** the event is associated with that group (`group_id` set) and visible via `GET /api/v1/events?groupId=...`
   **And** for private or hidden groups, only group members can see the event in listings
   **And** for public groups, the event is visible to all authenticated users in listings

4. **Given** a recurring event is created
   **When** the recurrence pattern is set (daily / weekly / monthly)
   **Then** the system generates individual event instances (daily: 7, weekly: 8, monthly: 6) stored as separate rows with `recurrence_parent_id` pointing to the parent (FR65)
   **And** each instance can be individually modified or cancelled (via `PATCH`/`DELETE` on the instance's eventId)
   **And** `GET /api/v1/events?parentId=...` returns all instances of a series

5. **Given** the database needs event support
   **When** migration `0031` is applied
   **Then** tables `community_events` and `community_event_attendees` are created with the fields specified in the Task 1 SQL below

6. **Given** a member navigates to `/events`
   **When** the events listing page loads
   **Then** they see upcoming events (status=`upcoming`, startTime > now()) with: title, date/time, format badge, attendee count, and creator name
   **And** unauthenticated visitors can browse general and public-group events but cannot create events

7. **Given** a member views the event detail page `/events/[eventId]`
   **When** the page loads (ISR revalidate=60)
   **Then** it displays full event details: title, description, format, date/time in creator's timezone, location/meeting link (if set), registration limit, attendee count, and creator
   **And** events belonging to private/hidden groups redirect non-members to `/events`

8. **Given** the event creator views their own event
   **When** they are on the event detail page or listings
   **Then** they see an "Edit" button → `/events/[eventId]/edit` and a "Cancel Event" action
   **And** only the creator (or an admin) can edit or cancel the event
   **And** cancelling sets `status = 'cancelled'` and emits `event.cancelled` via EventBus

## Tasks / Subtasks

- [x] **Task 1: DB schema + migration + ALL i18n keys** (AC: #5)

  > **AI-3 Retro rule:** All i18n keys MUST be defined in Task 1 before any component work. Do NOT add keys during component scaffolding.
  - [x]Create `src/db/schema/community-events.ts`:

    ```ts
    import {
      pgTable,
      pgEnum,
      uuid,
      varchar,
      text,
      integer,
      boolean,
      timestamp,
    } from "drizzle-orm/pg-core";
    import { authUsers } from "./auth-users";
    import { communityGroups } from "./community-groups";

    export const eventTypeEnum = pgEnum("community_event_type", ["general", "group"]);
    export const eventFormatEnum = pgEnum("community_event_format", [
      "virtual",
      "in_person",
      "hybrid",
    ]);
    export const eventStatusEnum = pgEnum("community_event_status", [
      "upcoming",
      "live",
      "completed",
      "cancelled",
    ]);
    export const attendeeStatusEnum = pgEnum("community_event_attendee_status", [
      "registered",
      "waitlisted",
      "attended",
      "cancelled",
    ]);
    export const recurrencePatternEnum = pgEnum("community_event_recurrence", [
      "none",
      "daily",
      "weekly",
      "monthly",
    ]);

    export const communityEvents = pgTable("community_events", {
      id: uuid("id").primaryKey().defaultRandom(),
      title: varchar("title", { length: 200 }).notNull(),
      description: text("description"),
      creatorId: uuid("creator_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      groupId: uuid("group_id").references(() => communityGroups.id, { onDelete: "cascade" }),
      eventType: eventTypeEnum("event_type").notNull().default("general"),
      format: eventFormatEnum("format").notNull().default("virtual"),
      location: text("location"),
      meetingLink: text("meeting_link"),
      timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
      startTime: timestamp("start_time", { withTimezone: true }).notNull(),
      endTime: timestamp("end_time", { withTimezone: true }).notNull(),
      durationMinutes: integer("duration_minutes").notNull(),
      registrationLimit: integer("registration_limit"),
      attendeeCount: integer("attendee_count").notNull().default(0),
      recurrencePattern: recurrencePatternEnum("recurrence_pattern").notNull().default("none"),
      recurrenceParentId: uuid("recurrence_parent_id"), // self-reference — no .references() to avoid circular Drizzle issue; enforced via migration FK
      status: eventStatusEnum("status").notNull().default("upcoming"),
      deletedAt: timestamp("deleted_at", { withTimezone: true }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    });

    export const communityEventAttendees = pgTable("community_event_attendees", {
      eventId: uuid("event_id")
        .notNull()
        .references(() => communityEvents.id, { onDelete: "cascade" }),
      userId: uuid("user_id")
        .notNull()
        .references(() => authUsers.id, { onDelete: "cascade" }),
      status: attendeeStatusEnum("status").notNull().default("registered"),
      registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    });

    // TypeScript types
    export type EventType = (typeof eventTypeEnum.enumValues)[number];
    export type EventFormat = (typeof eventFormatEnum.enumValues)[number];
    export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
    export type AttendeeStatus = (typeof attendeeStatusEnum.enumValues)[number];
    export type RecurrencePattern = (typeof recurrencePatternEnum.enumValues)[number];
    export type CommunityEvent = typeof communityEvents.$inferSelect;
    export type NewCommunityEvent = typeof communityEvents.$inferInsert;
    export type EventAttendee = typeof communityEventAttendees.$inferSelect;
    ```

    **Note:** `recurrenceParentId` omits `.references()` to avoid circular Drizzle schema issues (same pattern as `parentCommentId` in `community-article-comments.ts`). The FK is enforced in the migration SQL.

  - [x]Hand-write `src/db/migrations/0031_events.sql`:

    ```sql
    CREATE TYPE community_event_type AS ENUM ('general', 'group');
    CREATE TYPE community_event_format AS ENUM ('virtual', 'in_person', 'hybrid');
    CREATE TYPE community_event_status AS ENUM ('upcoming', 'live', 'completed', 'cancelled');
    CREATE TYPE community_event_attendee_status AS ENUM ('registered', 'waitlisted', 'attended', 'cancelled');
    CREATE TYPE community_event_recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly');

    CREATE TABLE community_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      description TEXT,
      creator_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      group_id UUID REFERENCES community_groups(id) ON DELETE CASCADE,
      event_type community_event_type NOT NULL DEFAULT 'general',
      format community_event_format NOT NULL DEFAULT 'virtual',
      location TEXT,
      meeting_link TEXT,
      timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      duration_minutes INT NOT NULL,
      registration_limit INT,
      attendee_count INT NOT NULL DEFAULT 0,
      recurrence_pattern community_event_recurrence NOT NULL DEFAULT 'none',
      recurrence_parent_id UUID REFERENCES community_events(id) ON DELETE CASCADE,
      status community_event_status NOT NULL DEFAULT 'upcoming',
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX community_events_creator_id_idx ON community_events(creator_id);
    CREATE INDEX community_events_group_id_idx ON community_events(group_id) WHERE group_id IS NOT NULL;
    CREATE INDEX community_events_status_start_idx ON community_events(status, start_time) WHERE deleted_at IS NULL;
    CREATE INDEX community_events_recurrence_parent_idx ON community_events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

    CREATE TABLE community_event_attendees (
      event_id UUID NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      status community_event_attendee_status NOT NULL DEFAULT 'registered',
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    );

    -- Note: attendee_count is a denormalized counter. Story 7.2 (RSVP) must use
    -- `attendee_count = attendee_count + 1` inside a transaction to avoid race conditions
    -- (same pattern as member_count in community_groups).
    CREATE INDEX community_event_attendees_user_id_idx ON community_event_attendees(user_id);
    ```

  - [x]Add entry to `src/db/migrations/meta/_journal.json`:

    ```json
    { "idx": 31, "version": "7", "when": 1708000031000, "tag": "0031_events", "breakpoints": true }
    ```

  - [x]Add import to `src/db/index.ts`:

    ```ts
    import * as communityEventsSchema from "./schema/community-events";
    ```

    And spread `communityEventsSchema` in the drizzle schema object (follow the existing pattern for `communityArticlesSchema`).

  - [x]Add ALL i18n keys to `messages/en.json` under new `Events` namespace:

    ```json
    "Events": {
      "list": {
        "title": "Events",
        "empty": "No upcoming events",
        "upcoming": "Upcoming",
        "myRsvps": "My RSVPs",
        "past": "Past",
        "createButton": "Create Event"
      },
      "create": {
        "title": "Create Event",
        "submitButton": "Create Event",
        "cancelButton": "Cancel"
      },
      "edit": {
        "title": "Edit Event",
        "submitButton": "Save Changes",
        "success": "Event updated",
        "error": "Failed to update event"
      },
      "cancel": {
        "confirm": "Cancel this event?",
        "button": "Cancel Event",
        "success": "Event cancelled",
        "error": "Failed to cancel event",
        "description": "This action cannot be undone. All RSVPs will be cancelled."
      },
      "detail": {
        "attendees": "Attendees",
        "registered": "{count} registered",
        "noLimit": "No registration limit",
        "noMeetingLink": "Meeting link will be provided closer to the event",
        "editButton": "Edit Event",
        "seriesLabel": "Recurring Event",
        "seriesInstance": "Part of a recurring series",
        "viewSeries": "View all dates"
      },
      "fields": {
        "title": "Title",
        "titlePlaceholder": "Give your event a name",
        "description": "Description",
        "descriptionPlaceholder": "What should attendees know about this event?",
        "startTime": "Start Date & Time",
        "endTime": "End Date & Time",
        "timezone": "Timezone",
        "format": "Format",
        "location": "Location",
        "locationPlaceholder": "Enter the venue address",
        "meetingLink": "Meeting Link",
        "meetingLinkPlaceholder": "https://...",
        "registrationLimit": "Registration Limit",
        "registrationLimitPlaceholder": "Leave blank for unlimited",
        "eventType": "Event Type",
        "recurrence": "Recurrence",
        "group": "Group",
        "groupPlaceholder": "Select a group (optional)"
      },
      "format": {
        "virtual": "Virtual",
        "inPerson": "In Person",
        "hybrid": "Hybrid"
      },
      "type": {
        "general": "General",
        "group": "Group Event"
      },
      "recurrence": {
        "none": "No Recurrence",
        "daily": "Daily (7 dates)",
        "weekly": "Weekly (8 dates)",
        "monthly": "Monthly (6 dates)"
      },
      "status": {
        "upcoming": "Upcoming",
        "live": "Live",
        "completed": "Completed",
        "cancelled": "Cancelled"
      },
      "permissions": {
        "createRequired": "Event creation is available to Professional and Top-tier members."
      },
      "validation": {
        "titleRequired": "Title is required",
        "futureDate": "Event date must be in the future",
        "positiveLimit": "Registration limit must be a positive integer",
        "endAfterStart": "End time must be after start time",
        "groupRequired": "Please select a group for group events"
      }
    }
    ```

  - [x]Add `Permissions.eventCreationRequired` to `messages/en.json` under `Permissions` namespace:

    ```json
    "eventCreationRequired": "Event creation is available to Professional and Top-tier members."
    ```

  - [x]Add all same keys (Igbo translations) to `messages/ig.json` under `Events` and `Permissions` namespaces.

- [x]**Task 2: Add `canCreateEvent` to PermissionService + PERMISSION_MATRIX** (AC: #1, #2)
  - [x]In `src/services/permissions.ts`, add `canCreateEvent` to `PERMISSION_MATRIX`:

    ```ts
    BASIC: {
      // ...existing...
      canCreateEvent: false,
    },
    PROFESSIONAL: {
      // ...existing...
      canCreateEvent: true,
    },
    TOP_TIER: {
      // ...existing...
      canCreateEvent: true,
    },
    ```

  - [x]Add `canCreateEvent` function following `canCreateGroup` pattern:

    ```ts
    export async function canCreateEvent(userId: string): Promise<PermissionResult> {
      const tier = await getUserMembershipTier(userId);
      if (PERMISSION_MATRIX[tier].canCreateEvent) {
        return { allowed: true };
      }
      const result: PermissionResult = {
        allowed: false,
        reason: getTierUpgradeMessage("createEvent", "PROFESSIONAL"),
        tierRequired: "PROFESSIONAL",
      };
      await emitPermissionDenied(userId, "createEvent", result.reason!);
      return result;
    }
    ```

  - [x]Add `createEvent` to `UPGRADE_MESSAGE_KEYS`:
    ```ts
    createEvent: "Permissions.eventCreationRequired",
    ```

- [x]**Task 3: Rate limit presets** (for API routes)
  - [x]Add to `src/services/rate-limiter.ts` comment header (JSDoc list):

    ```
    // Events: EVENT_CREATE, EVENT_UPDATE, EVENT_LIST, EVENT_DETAIL
    ```

  - [x]Add presets to `RATE_LIMIT_PRESETS` object (after GROUP_MANAGE):

    ```ts
    // Story 7.1 additions
    EVENT_CREATE: { maxRequests: 5, windowMs: 3_600_000 }, // 5/hour per userId (event creation is costly)
    EVENT_UPDATE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
    EVENT_LIST: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
    EVENT_DETAIL: { maxRequests: 120, windowMs: 60_000 }, // 120/min per userId
    ```

    **Note:** `GET /api/v1/events` (public listing) omits rateLimit entirely per the "no BROWSE preset" rule — public GET routes do not use withApiHandler rateLimit. `EVENT_LIST` is for authenticated-only list endpoints if needed.

- [x]**Task 4: DB queries (`src/db/queries/events.ts`)** (AC: #1, #3, #4, #6, #7)

  > **Pattern:** No `server-only` import — consistent with `articles.ts`. Query file is imported by services and routes only.
  - [x]Create `src/db/queries/events.ts` with the following exported functions:

    ```ts
    // Note: tables imported from "@/db" (not from schema files directly) — they are exported via
    // the schema spread in src/db/index.ts after Task 1 adds communityEventsSchema to the spread.
    // communityGroups and communityGroupMembers are already in @/db from earlier epics.
    import { db } from "@/db";
    import {
      communityEvents,
      communityEventAttendees,
      communityGroups,
      communityGroupMembers,
    } from "@/db";
    import { eq, and, gt, isNull, inArray, desc, asc, sql } from "drizzle-orm";
    import type {
      CommunityEvent,
      NewCommunityEvent,
      EventStatus,
    } from "@/db/schema/community-events";

    export type { CommunityEvent, NewCommunityEvent };

    export interface EventListItem {
      id: string;
      title: string;
      description: string | null;
      creatorId: string;
      groupId: string | null;
      eventType: "general" | "group";
      format: "virtual" | "in_person" | "hybrid";
      location: string | null;
      meetingLink: string | null;
      timezone: string;
      startTime: Date;
      endTime: Date;
      durationMinutes: number;
      registrationLimit: number | null;
      attendeeCount: number;
      recurrencePattern: "none" | "daily" | "weekly" | "monthly";
      recurrenceParentId: string | null;
      status: EventStatus;
      createdAt: Date;
      updatedAt: Date;
    }
    ```

    **Functions to implement:**
    - `createEvent(data: NewCommunityEvent): Promise<CommunityEvent>` — INSERT, return created row
    - `getEventById(eventId: string): Promise<CommunityEvent | null>` — SELECT by id, no deletedAt filter (caller handles)
    - `updateEvent(eventId: string, creatorId: string, updates: Partial<Pick<CommunityEvent, 'title' | 'description' | 'format' | 'location' | 'meetingLink' | 'timezone' | 'startTime' | 'endTime' | 'durationMinutes' | 'registrationLimit'>>): Promise<CommunityEvent | null>` — UPDATE WHERE id AND creator_id AND status != 'cancelled', set updatedAt
    - `cancelEvent(eventId: string, creatorId: string): Promise<boolean>` — UPDATE status='cancelled' WHERE id AND creator_id AND status='upcoming', returns true if row affected
    - `listUpcomingEvents(opts: { userId?: string; groupId?: string; limit?: number; offset?: number }): Promise<EventListItem[]>` — SELECT where status='upcoming', startTime > NOW(), deletedAt IS NULL, apply group visibility filter (see visibility rules in Dev Notes), order by startTime ASC
    - `listGroupEvents(groupId: string, userId?: string): Promise<EventListItem[]>` — SELECT all non-cancelled events for a group, ordered by startTime ASC
    - `getEventsByParentId(parentId: string): Promise<CommunityEvent[]>` — SELECT all events with recurrence_parent_id = parentId, ordered by startTime ASC

    **Visibility rules for `listUpcomingEvents`:**
    - `general` events: always included
    - `group` events with `community_groups.visibility = 'public'`: always included
    - `group` events with `community_groups.visibility IN ('private', 'hidden')`: only included if `userId` is provided AND `community_group_members` row exists for (groupId, userId) with status='active'
    - Implementation: `LEFT JOIN community_groups` on groupId + `LEFT JOIN community_group_members` on (groupId, userId); WHERE clause: `event_type = 'general' OR (group visibility = 'public') OR (group visibility IN ('private','hidden') AND member_status = 'active')`
    - Use `db.execute(sql`...`)` with raw SQL if the Drizzle query builder becomes unmanageable for this conditional join — raw result is a plain array (same as `getRelatedArticles` pattern from Story 6.3)

  - [x]Add `getGroupsForUserMembership` to `src/db/queries/groups.ts` (needed by Task 8 create event page for group selector):

    ```ts
    /** Returns groups where the user is an active member (for event group selector). */
    export async function getGroupsForUserMembership(
      userId: string,
    ): Promise<{ id: string; name: string }[]> {
      return db
        .select({
          id: communityGroups.id,
          name: communityGroups.name,
        })
        .from(communityGroupMembers)
        .innerJoin(communityGroups, eq(communityGroupMembers.groupId, communityGroups.id))
        .where(
          and(
            eq(communityGroupMembers.userId, userId),
            eq(communityGroupMembers.status, "active"),
            isNull(communityGroups.deletedAt),
          ),
        )
        .orderBy(asc(communityGroups.name));
    }
    ```

    **Note:** `listGroupsByMember()` does not exist in the codebase. This function fills that gap. Import `asc` from `drizzle-orm` if not already imported.

- [x]**Task 5: EventBus event types** (AC: #8)
  - [x]In `src/types/events.ts`, add after `EventAttendedEvent`:

    ```ts
    // --- Event (Calendar) Management Events ---

    export interface EventCreatedEvent extends BaseEvent {
      eventId: string;
      creatorId: string;
      title: string;
      eventType: "general" | "group";
      format: "virtual" | "in_person" | "hybrid";
      startTime: string; // ISO 8601
      groupId?: string;
    }

    export interface EventUpdatedEvent extends BaseEvent {
      eventId: string;
      updatedBy: string;
      title: string;
    }

    export interface EventCancelledEvent extends BaseEvent {
      eventId: string;
      cancelledBy: string;
      title: string;
    }
    ```

  - [x]Add to `EventName` union:

    ```ts
    | "event.created"
    | "event.updated"
    | "event.cancelled"
    ```

  - [x]Add to `EventMap`:
    ```ts
    "event.created": EventCreatedEvent;
    "event.updated": EventUpdatedEvent;
    "event.cancelled": EventCancelledEvent;
    ```

- [x]**Task 6: Event service (`src/services/event-service.ts`)** (AC: #1, #2, #3, #4, #8)
  - [x]Create `src/services/event-service.ts`:

    ```ts
    import "server-only";
    import { z } from "zod/v4";
    import { canCreateEvent } from "@/services/permissions";
    import { ApiError } from "@/lib/api-error";
    import { eventBus } from "@/services/event-bus";
    import {
      createEvent as dbCreateEvent,
      updateEvent as dbUpdateEvent,
      cancelEvent as dbCancelEvent,
      getEventById,
    } from "@/db/queries/events";
    ```

    **`CreateEventInput` Zod schema:**

    ```ts
    export const CreateEventSchema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      eventType: z.enum(["general", "group"]).default("general"),
      groupId: z.string().uuid().optional(),
      format: z.enum(["virtual", "in_person", "hybrid"]).default("virtual"),
      location: z.string().max(500).optional(),
      meetingLink: z.string().url().optional().or(z.literal("")),
      timezone: z.string().min(1).max(50).default("UTC"),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      registrationLimit: z.number().int().positive().optional(),
      recurrencePattern: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
    });
    export type CreateEventInput = z.infer<typeof CreateEventSchema>;
    ```

    **`createEvent(userId, data)` function:**
    - Call `canCreateEvent(userId)` — throw `ApiError 403` if not allowed, using `result.reason` as detail
    - Validate `startTime > now()` — throw `ApiError 422` with detail `"Events.validation.futureDate"` if not
    - Validate `endTime > startTime` — throw `ApiError 422` with detail `"Events.validation.endAfterStart"` if not
    - Compute `durationMinutes = Math.ceil((new Date(endTime) - new Date(startTime)) / 60000)`
    - If `eventType === 'group'` and no `groupId` → throw `ApiError 422` with detail `"Events.validation.groupRequired"`
    - Call `dbCreateEvent(data)` with `creatorId = userId`, `status = 'upcoming'`
    - **`meeting_link` in Story 7.1 is manually entered by the creator.** Add a comment: `// TODO(Story 7.3): meeting_link for virtual events will be auto-generated by Daily.co SDK and will overwrite this field`
    - If `recurrencePattern !== 'none'`: generate recurrence instances (see constants below)
    - Emit `event.created` EventBus event
    - Return `{ eventId: event.id }`

    **Recurrence instance generation:**

    ```ts
    const RECURRENCE_INSTANCE_COUNTS = {
      daily: 7,
      weekly: 8,
      monthly: 6,
    } as const;

    const RECURRENCE_OFFSETS_MS = {
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      monthly: null, // use date-based month addition
    };
    ```

    - For daily/weekly: loop `n` times, add `N * offsetMs` to startTime and endTime, INSERT each instance with `recurrenceParentId = parent.id`
    - For monthly: loop `n` times, create new Date, add `n` months using `date.setMonth(date.getMonth() + n)`. **Edge case:** `setMonth()` can overflow (e.g., Jan 31 + 1 month = March 3, not Feb 28). Clamp to last day of target month: after `setMonth`, if the day changed, set date to day 0 of the next month (last day of intended month). Alternatively, accept this as a known MVP limitation and document it.
    - Each instance inherits ALL fields from parent except `id`, `startTime`, `endTime`, `recurrenceParentId`, `createdAt`, `updatedAt`
    - Use `Promise.all()` to create instances in parallel

    **`updateEvent(userId, eventId, data)` function:**
    - `getEventById(eventId)` — throw 404 if not found
    - Throw 403 if `event.creatorId !== userId` (admin bypass is handled by a separate admin route in future stories)
    - Call `dbUpdateEvent(eventId, userId, data)`
    - Emit `event.updated`
    - Return `{ eventId }`

    **`cancelEvent(userId, eventId)` function:**
    - `getEventById(eventId)` — throw 404 if not found
    - Throw 403 if `event.creatorId !== userId`
    - Throw 422 if event is already cancelled
    - Call `dbCancelEvent(eventId, userId)` — returns boolean
    - If false → throw 409 (status conflict, already cancelled by another request)
    - Emit `event.cancelled`

- [x]**Task 7: API routes** (AC: #1–#8)
  - [x]Create `src/app/api/v1/events/route.ts`:

    ```ts
    // GET - public event listing (no auth required)
    // POST - create event (auth required)
    ```

    **GET handler:**
    - No `requireAuthenticatedSession()` — public route, no rateLimit in withApiHandler
    - Extract query params: `groupId`, `status` (default `upcoming`), `page` (default 1), `limit` (default 20)
    - Optional auth: `import { auth } from "@/auth";` then `const session = await auth(); const userId = session?.user?.id;` — `auth()` returns null when unauthenticated, never throws
    - Call `listUpcomingEvents({ userId, groupId, limit, offset })`
    - Return `successResponse({ events, total: events.length, page, limit })`

    **POST handler:**
    - `requireAuthenticatedSession()` → `{ userId }`
    - Parse + validate body with `CreateEventSchema` — throw `ApiError 422` with `parsed.error.issues[0].message` if invalid
    - Call `createEvent(userId, parsed.data)` from event service
    - Return `successResponse({ eventId }, undefined, 201)`
    - Rate limit key function (avoids circular imports — same pattern as articles route):
      ```ts
      export const POST = withApiHandler(postHandler, {
        rateLimit: {
          key: async () => {
            const { requireAuthenticatedSession: getSession } =
              await import("@/services/permissions");
            const { userId } = await getSession();
            return `event-create:${userId}`;
          },
          ...RATE_LIMIT_PRESETS.EVENT_CREATE,
        },
      });
      ```

  - [x]Create `src/app/api/v1/events/[eventId]/route.ts`:

    ```ts
    // GET - event detail (public/semi-public)
    // PATCH - update event (auth + creator)
    // DELETE - cancel event (auth + creator)
    ```

    **GET handler:**
    - No auth required, **no rateLimit** in withApiHandler (public GET route — BROWSE preset does not exist)
    - Extract eventId from URL: `new URL(request.url).pathname.split("/").at(-1) ?? ""` (this is the standard API route param extraction pattern — page.tsx uses `await params` instead, see Task 8)
    - Optional auth for group visibility check: `import { auth } from "@/auth";` then `const session = await auth();`
    - Call `getEventById(eventId)` — throw 404 if null or `deletedAt != null`
    - If event is a group event and group is private/hidden: check auth session; if not member → return 404 (do not leak event existence)
    - Return `successResponse({ event })`

    **PATCH handler:**
    - `requireAuthenticatedSession()` → `{ userId }`
    - Parse body with `UpdateEventSchema` (subset of CreateEventSchema, all fields optional — defined in `event-service.ts` Task 6, imported here)
    - Call `updateEvent(userId, eventId, parsed.data)` from event service
    - Return `successResponse({ eventId })`
    - Rate limit with `EVENT_UPDATE` preset (same key pattern as POST above but with `event-update:${userId}`)

    **DELETE handler:**
    - `requireAuthenticatedSession()` → `{ userId }`
    - Call `cancelEvent(userId, eventId)` from event service
    - Return `successResponse({ eventId })`
    - Rate limit with `EVENT_UPDATE` preset (key: `event-cancel:${userId}`)
    - **Note:** `DELETE` is wrapped separately via `withApiHandler(deleteHandler, { rateLimit: ... })` — cannot share a single `withApiHandler` wrapper with PATCH
    - **IMPORTANT:** `DELETE` performs SOFT CANCEL (sets `status='cancelled'`) — it does NOT hard-delete the row. This is by design; past events and their attendee records are preserved.

  - [x]**`UpdateEventSchema`** — defined in `src/services/event-service.ts` (Task 6), `export const` so routes can import it:
    ```ts
    // Defined in src/services/event-service.ts (Task 6) — NOT in the route file
    export const UpdateEventSchema = CreateEventSchema.omit({
      eventType: true, // event type cannot be changed after creation
      groupId: true, // group association cannot be changed after creation
      recurrencePattern: true, // recurrence cannot be changed after creation
    }).partial();
    export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
    ```
    Import in `[eventId]/route.ts`: `import { updateEvent, cancelEvent, UpdateEventSchema } from "@/services/event-service";`

- [x]**Task 8: UI — Events feature module + pages** (AC: #1, #2, #6, #7, #8)
  - [x]Create `src/features/events/` feature folder with barrel `src/features/events/index.ts`

  - [x]Create `src/features/events/components/EventFormatBadge.tsx` (`"use client"`):
    - Color-coded badge: Virtual=blue, In-Person=green, Hybrid=orange (per UX spec from Epic 7 Story 7.2 AC)
    - Uses `useTranslations("Events")` for format label

  - [x]Create `src/features/events/components/EventStatusBadge.tsx` (`"use client"`):
    - Color-coded badge: upcoming=slate, live=green pulse, completed=gray, cancelled=red strikethrough

  - [x]Create `src/features/events/components/EventCard.tsx` (`"use client"`):
    - Props: `event: EventListItem`, optional `showEditActions?: boolean` (for creator view)
    - Displays: title, format badge, start date/time (formatted in event.timezone), attendee count badge, status badge
    - If `showEditActions`: "Edit" button → `Link` to `/events/[id]/edit`, "Cancel" action (opens AlertDialog)
    - Recurring series indicator chip if `recurrenceParentId !== null`
    - Use `Link` from `@/i18n/navigation` for internal links

  - [x]Create `src/features/events/components/EventList.tsx` (`"use client"`):
    - Props: `events: EventListItem[]`, `emptyMessage?: string`
    - Renders a grid/list of `EventCard` components
    - Shows empty state with `t("list.empty")` if no events

  - [x]Create `src/features/events/components/EventForm.tsx` (`"use client"`):
    - Props: `initialData?: Partial<CreateEventInput>`, `mode: 'create' | 'edit'`, `onSuccess: (eventId: string) => void`, `userGroups?: { id: string; name: string }[]` (for group selector)
    - All form fields from Task 1 i18n (title, description, eventType, group selector, format, timezone picker, startTime, endTime, location, meetingLink, registrationLimit, recurrence)
    - Client-side Zod validation before submit: future date, endTime > startTime, positive registrationLimit
    - When `eventType = 'group'`: show group selector populated from `userGroups` prop
    - On submit: POST `/api/v1/events` (create) or PATCH `/api/v1/events/[id]` (edit) with `credentials: 'include'`
    - Shows `t("permissions.createRequired")` banner if server returns 403
    - **Timezone picker:** Use a curated static list of common IANA zones (NOT `Intl.supportedValuesOf("timeZone")` — that API requires Chrome 99+/Firefox 101+ and is unavailable in older browsers). Include at minimum: UTC, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Toronto, Europe/London, Europe/Paris, Africa/Lagos, Asia/Dubai, Asia/Tokyo, Australia/Sydney. A simple `<select>` of 15–20 zones is sufficient for MVP.

  - [x]Create hooks: `src/features/events/hooks/use-events.ts`:
    - `useEvents({ groupId?: string, status?: string })` → TanStack Query wrapping GET `/api/v1/events`
    - `useEventDetail(eventId: string)` → GET `/api/v1/events/[eventId]`

  > **Route group split:** Events follow the same pattern as Articles — public browse/detail pages go under `(guest)` (GuestShell, ISR-friendly, no auth required), while create/edit pages go under `(app)` (AppShell, force-dynamic, auth required). This ensures ISR works for the detail page and unauthenticated users can browse events (AC #6).
  - [x]Create `src/app/[locale]/(guest)/events/page.tsx` (Server Component, ISR):
    - `export const revalidate = 60;`
    - **DO NOT call `auth()` here** — defeats ISR. Unauthenticated visitors can browse per AC #6.
    - Fetch events server-side via `listUpcomingEvents({})` (no userId — only public/general events in ISR cache)
    - Render `EventList` with `events`
    - "Create Event" button visibility is handled by a `<CreateEventButton>` Client Component that uses `useSession()` to check auth + tier (or simply links to `/events/new` which does the permission check server-side)
    - Tabs for Upcoming / Past (Past tab deferred to Story 7.2 — show only Upcoming for this story)

  - [x]Create `src/app/[locale]/(app)/events/new/page.tsx` (Server Component, `force-dynamic`):
    - `export const dynamic = "force-dynamic";`
    - `import { auth } from "@/auth";` then `const session = await auth(); if (!session?.user?.id) redirect("/");`
    - Check `canCreateEvent(session.user.id)` — if not allowed, show permission denied message with upgrade CTA; do NOT show form
    - **Group selector data:** Call `getGroupsForUserMembership(session.user.id)` from `@/db/queries/groups` (added in Task 4) and pass as `userGroups` prop to `<EventForm>`. Do NOT fetch groups client-side from EventForm.
    - Render `<EventForm mode='create' userGroups={groups} />` — pass groups as props (avoid additional client-side fetch)

  - [x]Create `src/app/[locale]/(guest)/events/[eventId]/page.tsx` (Server Component, ISR):
    - `export const revalidate = 60;`
    - **DO NOT call `auth()` in this Server Component** — defeats ISR (same rule as Article detail page under `(guest)`)
    - **Page params:** Extract eventId via `const { eventId } = await params;` (page.tsx receives `params: Promise<{ locale: string; eventId: string }>` — NOT pathname split, that's for API routes only)
    - Fetch event server-side via `getEventById(eventId)`
    - If event not found → `notFound()`
    - **Private group event rendering:** If `event.groupId !== null`, fetch the group's visibility from `communityGroups`. For `private` or `hidden` groups:
      - Render basic event info (title, description, dates, format badge, status) in the ISR response — this is safe (it's just metadata)
      - **DO NOT include `meeting_link` in the server render** for private/hidden group events — it's sensitive and could be cached publicly
      - Render a `<EventMembershipGate groupId={event.groupId}>` Client Component (see spec below)
    - Edit/cancel actions are in a `<EventDetailActions>` Client Component (see spec below)

  - [x]Create `src/features/events/components/EventMembershipGate.tsx` (`"use client"`):
    - Props: `groupId: string`, `meetingLink?: string | null`, `children?: React.ReactNode`
    - Uses `useSession()` from `next-auth/react` — if no session, shows "Sign in to see full details" with link to login
    - If session exists, calls `GET /api/v1/groups/[groupId]/members?userId=${session.user.id}` (or a lightweight membership-check endpoint) to verify active membership
    - If member: reveals `meetingLink` (if provided) and renders `children` (RSVP button slot for Story 7.2)
    - If not member: shows "This event is for group members only" message and a link back to `/events`
    - Loading state: skeleton placeholder while checking membership

  - [x]Create `src/features/events/components/EventDetailActions.tsx` (`"use client"`):
    - Props: `eventId: string`, `creatorId: string`
    - Uses `useSession()` — only renders actions if `session.user.id === creatorId`
    - Renders: "Edit" button → `Link` to `/events/[eventId]/edit`, "Cancel Event" button → opens AlertDialog confirmation
    - Cancel action: calls `DELETE /api/v1/events/[eventId]` with `credentials: 'include'`, shows toast on success/error
    - Uses `useTranslations("Events")` for all labels (`t("detail.editButton")`, `t("cancel.button")`, `t("cancel.confirm")`, `t("cancel.description")`)

  - [x]Create `src/app/[locale]/(app)/events/[eventId]/edit/page.tsx` (Server Component, force-dynamic):
    - Auth-gated: `redirect("/")` if no session
    - Fetch event, verify `creatorId === session.user.id` — if not, `redirect("/events/[eventId]")`
    - Render `EventForm` with `mode='edit'` and `initialData` from event

  - [x]Export all components from `src/features/events/index.ts`

- [x]**Task 9: Tests** (AC: #1–#8)
  - [x]Create `src/db/queries/events.test.ts` (`// @vitest-environment node`) — ~9 tests:
    - `createEvent` inserts and returns a new event row
    - `getEventById` returns null for non-existent eventId
    - `updateEvent` updates title and returns updated row
    - `updateEvent` returns null when creatorId does not match
    - `cancelEvent` sets status to 'cancelled' and returns true
    - `cancelEvent` returns false when event not found or already cancelled
    - `listUpcomingEvents` returns only upcoming events ordered by startTime ASC
    - `listUpcomingEvents` excludes private group events when `userId` is not provided (visibility filter regression guard)
    - `getEventsByParentId` returns instances linked to parent

  - [x]Create `src/services/event-service.test.ts` (`// @vitest-environment node`) — ~12 tests:
    - `createEvent` throws 403 for BASIC tier user (mock `canCreateEvent` to return `{ allowed: false }`)
    - `createEvent` creates single event when recurrencePattern='none'
    - `createEvent` emits `event.created` EventBus event on success (spy on `eventBus.emit`)
    - `createEvent` generates 8 instances for weekly recurrence (`dbCreateEvent` call count = 9: 1 parent + 8 instances)
    - `createEvent` generates 7 instances for daily recurrence
    - `createEvent` generates 6 instances for monthly recurrence
    - `createEvent` throws 422 ApiError when startTime is in the past
    - `createEvent` throws 422 ApiError when endTime <= startTime
    - `updateEvent` emits `event.updated` EventBus event on success
    - `updateEvent` throws 404 when event not found
    - `cancelEvent` emits `event.cancelled` EventBus event on success
    - `cancelEvent` throws 403 when userId !== event.creatorId

  - [x]Create `src/services/permissions.test.ts` additions (append to existing file) — ~2 new tests:
    - `canCreateEvent` returns `{ allowed: false }` for BASIC tier
    - `canCreateEvent` returns `{ allowed: true }` for PROFESSIONAL tier

  - [x]Create `src/app/api/v1/events/route.test.ts` (`// @vitest-environment node`) — ~6 tests:
    - `POST` 201 creates event when Professional member submits valid body
    - `POST` 401 when unauthenticated
    - `POST` 403 when Basic member (mock `createEvent` service to throw ApiError 403)
    - `POST` 422 when body missing required fields
    - `GET` 200 returns event list (no auth needed)
    - `GET` 200 returns empty array when no events

  - [x]Create `src/app/api/v1/events/[eventId]/route.test.ts` (`// @vitest-environment node`) — ~6 tests:
    - `GET` 200 returns event detail for existing event
    - `GET` 404 when event not found
    - `PATCH` 200 updates event when creator makes request
    - `PATCH` 403 when non-creator attempts update
    - `DELETE` 200 cancels event
    - `DELETE` 404 when event not found

  - [x]Create `src/features/events/components/EventCard.test.tsx` (`// @vitest-environment jsdom`) — ~4 tests:
    - Renders event title and format badge
    - Renders correct format badge color for 'in_person' format
    - Shows "Recurring Event" chip when recurrenceParentId is set
    - Does not show edit actions when `showEditActions=false`

  - [x]Create `src/features/events/components/EventForm.test.tsx` (`// @vitest-environment jsdom`) — ~6 tests:
    - Renders all required fields (title, start/end time, format, recurrence)
    - Submit button disabled when title is empty
    - Shows group selector when eventType = 'group' is selected
    - Shows validation error when start date is in the past
    - Renders in 'edit' mode with `initialData` pre-populated
    - Shows permission denied banner when server returns 403

  - [x]Create `src/features/events/components/EventList.test.tsx` (`// @vitest-environment jsdom`) — ~2 tests:
    - Renders list of EventCards when events provided
    - Shows empty state when events array is empty

  - [x]Create `src/app/[locale]/(app)/events/new/page.test.tsx` (`// @vitest-environment node`) — ~2 tests:
    - Redirects to `/` when unauthenticated
    - Renders EventForm when user has PROFESSIONAL tier

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x]All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x]New i18n keys added to both `messages/en.json` AND `messages/ig.json` (ALL keys defined in Task 1)
- [x]All tests passing (run `bun test` locally before review)
- [x]`src/db/index.ts` imports `* as communityEventsSchema from "./schema/community-events"` and spreads into drizzle schema
- [x]Migration `0031_events.sql` hand-written (drizzle-kit generate fails with `server-only` error)
- [x]`_journal.json` has entry `{ idx: 31, version: "7", when: 1708000031000, tag: "0031_events", breakpoints: true }`
- [x]`canCreateEvent` added to `PERMISSION_MATRIX` for all three tiers; function exported from `src/services/permissions.ts`
- [x]`EVENT_CREATE`, `EVENT_UPDATE`, `EVENT_LIST`, `EVENT_DETAIL` presets added to `src/services/rate-limiter.ts`
- [x]Public `GET /api/v1/events` and `GET /api/v1/events/[eventId]` routes have NO rateLimit option in `withApiHandler` (public GET routes — BROWSE preset does not exist)
- [x]`successResponse()` calls with 201 use 3rd arg: `successResponse({ eventId }, undefined, 201)` for event creation
- [x]`recurrenceParentId` in Drizzle schema omits `.references()` (same circular-reference pattern as `parentCommentId` in article-comments)
- [x]FK for `recurrence_parent_id` is enforced in SQL migration not in Drizzle schema
- [x]`auth()` is NOT called in the event detail ISR page (`(guest)/events/[eventId]/page.tsx`) or the events listing page (`(guest)/events/page.tsx`) — auth-gated features use `useSession()` in Client Components
- [x]Events listing and detail pages are under `(guest)` route group (GuestShell, ISR-friendly); create/edit pages are under `(app)` route group (AppShell, force-dynamic)
- [x]`EventMembershipGate` and `EventDetailActions` Client Components are implemented and use `useSession()` (not `auth()`)
- [x]`getGroupsForUserMembership()` added to `src/db/queries/groups.ts` and used in create event page
- [x]`Link` from `@/i18n/navigation` used for all internal links in Client Components (not `next/link`)
- [x]`Zod` imported from `"zod/v4"` — `parsed.error.issues[0].message` for error detail (NOT `parsed.issues[0]`)
- [x]Group visibility check implemented in `listUpcomingEvents` (private/hidden group events not exposed to non-members)
- [x]`src/db/queries/events.ts` has NO `server-only` import (consistent with `articles.ts` pattern)
- [x]`eventBus.emit()` called AFTER successful DB write, never before
- [x]`event-service.ts` tests include EventBus emission assertions for `createEvent`, `updateEvent`, `cancelEvent` success paths
- [x]`listUpcomingEvents` tests include a visibility-filter regression test (private group event excluded without userId)
- [x]`UpdateEventSchema` and `UpdateEventInput` are `export const` / `export type` in `event-service.ts`
- [x]`DELETE /api/v1/events/[eventId]` performs SOFT CANCEL (status='cancelled'), not hard delete — confirmed in route handler
- [x]`meeting_link` field retained in schema (Story 7.3 Daily.co integration will reuse/overwrite it)
- [x]Timezone picker uses static curated IANA list — NOT `Intl.supportedValuesOf("timeZone")`
- [x]Group selector in create event page uses server-side data (props from page.tsx), not client-side fetch from EventForm

## Dev Notes

### Developer Context

Story 7.1 is the first story in Epic 7. It creates the entire event foundation: DB schema, PermissionService extension, DB queries, event service, 5 API routes, UI pages, and the Events feature module. Stories 7.2–7.4 build on top of this infrastructure.

**Epic 6 is done. This is a fresh epic start.** Next migration: 0031.

**What Story 7.1 explicitly does NOT include:**

- RSVP / waitlist logic → Story 7.2
- Video meeting generation (Daily.co SDK) → Story 7.3
- Event reminders / recordings → Story 7.4
- Points awarded for attending events (`event.attended` EventBus event handling) → Epic 8

### Key Technical Decisions

**Self-referencing FK on `recurrence_parent_id`:**
The `communityEvents` table references itself via `recurrence_parent_id`. In Drizzle schema, omit `.references()` to avoid circular schema definition errors (same pattern as `parentCommentId` in `community-article-comments.ts`). Enforce the FK constraint in the raw SQL migration. `ON DELETE CASCADE` ensures that cancelling a parent event cascades to all instances.

**Recurrence instance generation:**
At creation time (not lazily). Parent event is inserted first; instances are inserted in parallel with `Promise.all()`. Each instance row has `recurrenceParentId = parent.id` and `recurrencePattern = 'none'` (the recurrence is already "expanded" — instances are standalone events). Max instances per pattern: daily=7, weekly=8, monthly=6. These are defined as constants in the service to allow future configurability.

**Group event visibility in listings:**
The `listUpcomingEvents` query must join to `community_groups` and `community_group_members` to filter private/hidden group events. Use `db.execute(sql`...`)` with raw SQL if Drizzle's query builder makes the conditional join awkward — raw result is a plain array (not `{ rows: [...] }`), consistent with `getRelatedArticles` in Story 6.3.

**ISR on event detail page and events listing:**
Do NOT call `auth()` in `src/app/[locale]/(guest)/events/[eventId]/page.tsx` or `src/app/[locale]/(guest)/events/page.tsx`. This would opt the page into dynamic rendering and defeat ISR (revalidate=60). Both pages are under the `(guest)` route group (GuestShell), following the same pattern as articles. Auth-gated features (edit/cancel buttons, group membership check, "Create Event" button) use `useSession()` in Client Components (`EventDetailActions`, `EventMembershipGate`). See `docs/decisions/isr-pattern.md`.

**Public GET route and rate limiting:**
`GET /api/v1/events` (list) and `GET /api/v1/events/[eventId]` (detail) are accessible without authentication. Per the established pattern: **omit the `rateLimit` option from `withApiHandler` for both public GET routes.** The `BROWSE` preset does NOT exist. `EVENT_LIST` and `EVENT_DETAIL` presets exist for future authenticated-only list variants if needed.

**Route group architecture (`(guest)` vs `(app)`):**
Following the articles pattern: public browse/detail pages → `(guest)` route group (GuestShell, ISR-friendly, no SocketProvider); create/edit pages → `(app)` route group (AppShell, force-dynamic, auth required). This means:

- `(guest)/events/page.tsx` — events listing (ISR, revalidate=60, no auth())
- `(guest)/events/[eventId]/page.tsx` — event detail (ISR, revalidate=60, no auth())
- `(app)/events/new/page.tsx` — create event (force-dynamic, auth required)
- `(app)/events/[eventId]/edit/page.tsx` — edit event (force-dynamic, auth required)

**Page params vs API route params:**
In `page.tsx` Server Components, extract route params via `const { eventId } = await params;` (Next.js passes `params: Promise<{ locale: string; eventId: string }>`). In API `route.ts` handlers, extract from URL: `new URL(request.url).pathname.split("/").at(-1)`. Do NOT mix the two patterns.

**`canCreateEvent` PermissionService pattern:**
Follows `canCreateGroup` exactly — returns `PermissionResult`, emits `member.permission_denied` via EventBus on failure, uses `UPGRADE_MESSAGE_KEYS["createEvent"]` for the i18n key. The route throws `ApiError 403` when service returns `{ allowed: false }`.

**Timezone handling:**
Store as IANA timezone string (e.g., `"America/New_York"`) in `timezone VARCHAR(50)`. Store startTime/endTime as TIMESTAMPTZ (UTC-normalized by PostgreSQL). Use the timezone string for display formatting in the UI with `Intl.DateTimeFormat`. The EventForm timezone picker uses a static curated list of IANA zones — do NOT use `Intl.supportedValuesOf("timeZone")` as it's Chrome 99+/Firefox 101+ only and unavailable in some test environments.

**`meeting_link` is overwritten in Story 7.3:**
In Story 7.1, `meeting_link` is an optional manual input by the event creator. When Story 7.3 (Daily.co integration) ships, the `meeting_link` field will be auto-generated and stored by the video service for `virtual`/`hybrid` events, overwriting the manual value. Do NOT remove the `meeting_link` column — it is reused by Story 7.3.

**Group selector in create event page:**
The create event page is a `force-dynamic` Server Component that can call `auth()`. Fetch the user's groups server-side via `getGroupsForUserMembership(userId)` from `@/db/queries/groups` (added in Task 4 of this story). Pass `userGroups` as a prop to `<EventForm>`. Do NOT fetch groups client-side.

**Server Action vs REST API:**
Uses REST API routes (not Server Actions) — consistent with the articles pattern. Events are CRUD resources that mobile apps will also consume (per architecture doc FR65 note).

### Technical Requirements

- `withApiHandler()` from `@/server/api/middleware` for all API routes
- `requireAuthenticatedSession()` from `@/services/permissions` for auth-required routes (no params)
- `ApiError` from `@/lib/api-error` for RFC 7807 errors
- `successResponse()` / `errorResponse()` from `@/lib/api-response`
- Zod from `"zod/v4"`; `parsed.error.issues[0].message` for validation error detail
- `eventBus.emit()` from `@/services/event-bus`
- `Link` from `@/i18n/navigation` (NOT `next/link`) for all internal links in Client Components
- `useTranslations("Events")` for all i18n in Client Components
- `getTranslations("Events")` for Server Components
- No `server-only` in `src/db/queries/events.ts`

### File Structure Requirements

**New files:**

- `src/db/schema/community-events.ts`
- `src/db/migrations/0031_events.sql`
- `src/db/queries/events.ts`
- `src/db/queries/events.test.ts`
- `src/services/event-service.ts`
- `src/services/event-service.test.ts`
- `src/app/api/v1/events/route.ts`
- `src/app/api/v1/events/route.test.ts`
- `src/app/api/v1/events/[eventId]/route.ts`
- `src/app/api/v1/events/[eventId]/route.test.ts`
- `src/features/events/index.ts`
- `src/features/events/components/EventCard.tsx`
- `src/features/events/components/EventCard.test.tsx`
- `src/features/events/components/EventForm.tsx`
- `src/features/events/components/EventForm.test.tsx`
- `src/features/events/components/EventList.tsx`
- `src/features/events/components/EventList.test.tsx`
- `src/features/events/components/EventFormatBadge.tsx`
- `src/features/events/components/EventStatusBadge.tsx`
- `src/features/events/components/EventMembershipGate.tsx`
- `src/features/events/components/EventDetailActions.tsx`
- `src/features/events/hooks/use-events.ts`
- `src/app/[locale]/(guest)/events/page.tsx`
- `src/app/[locale]/(app)/events/new/page.tsx`
- `src/app/[locale]/(app)/events/new/page.test.tsx`
- `src/app/[locale]/(guest)/events/[eventId]/page.tsx`
- `src/app/[locale]/(app)/events/[eventId]/edit/page.tsx`

**Modified files:**

- `src/db/index.ts` — add `communityEventsSchema` import
- `src/db/migrations/meta/_journal.json` — add idx:31 entry
- `src/services/permissions.ts` — add `canCreateEvent` to PERMISSION_MATRIX + function export
- `src/services/permissions.test.ts` — add 2 `canCreateEvent` tests
- `src/services/rate-limiter.ts` — add EVENT_CREATE/UPDATE/LIST/DETAIL presets
- `src/types/events.ts` — add EventCreatedEvent, EventUpdatedEvent, EventCancelledEvent + EventName union + EventMap
- `src/db/queries/groups.ts` — add `getGroupsForUserMembership()` function (for event creation group selector)
- `messages/en.json` — add `Events` namespace + `Permissions.eventCreationRequired`
- `messages/ig.json` — add same keys in Igbo
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update `epic-7: in-progress` and `7-1-event-creation-management: ready-for-dev`

### Testing Requirements

**All established patterns apply:**

- `// @vitest-environment node` pragma for server-side test files
- `// @vitest-environment jsdom` for React component tests
- `mockReset()` in `beforeEach` — NOT `clearAllMocks()`
- Explicit factory mocks for ALL DB query files (avoid cascade import errors)
- CSRF headers in mutating route tests: `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`
- Rate limiter mock in route tests (standard pattern from all previous route tests)
- `requireAuthenticatedSession` mock returning `{ userId: "test-user-id", role: "MEMBER" }`

**Factory mock for `@/db/queries/events`:**

```ts
vi.mock("@/db/queries/events", () => ({
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listUpcomingEvents: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
}));
```

**Factory mock for `@/services/event-service`:**

```ts
vi.mock("@/services/event-service", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  CreateEventSchema: { safeParse: vi.fn() },
  UpdateEventSchema: { safeParse: vi.fn() },
}));
```

**Mock for `canCreateEvent` in permission tests:**

```ts
vi.mock("@/services/permissions", () => ({
  canCreateEvent: vi.fn(),
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));
```

**Component test Link mock:**

```ts
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));
```

### Previous Story Intelligence

Key learnings from Story 6.4 (most recent) and Epic 6 retro that apply directly:

- **i18n keys in Task 1** — Define ALL keys before any component scaffolding (AI-3 retro enforcement)
- **`mockReset()` not `clearAllMocks()`** — Established from Story 5.2
- **`successResponse(data, undefined, 201)`** — 201 status is 3rd arg (confirmed in Story 6.4)
- **`auth()` defeats ISR** — Do NOT call `auth()` in Server Components with `revalidate`. Use `useSession()` in Client Components for auth-gated features. (Epic 6 retro + `docs/decisions/isr-pattern.md`)
- **No circular `.references()` in Drizzle** — `recurrenceParentId` self-reference omits `.references()`, FK is in SQL migration (same as `parentCommentId` in Story 6.3)
- **No `server-only` in query files** — `events.ts` follows `articles.ts` pattern
- **Rate limiter BROWSE preset does not exist** — Public GET routes omit `rateLimit` entirely
- **CSRF headers required** in all mutating route tests
- **`db.execute(sql`...`)` for complex joins** — Returns plain array (not `{ rows: [...] }`), call `rows.map()` directly

### Git Intelligence Summary

Recent commits:

- `cf9c633 feat: Story 6.4 article revision flow, author dashboard & review fixes` — Epic 6 is complete
- `015bf5b feat: Epic 6 articles (Stories 6.1–6.3) + editor UX fixes`
- Current test baseline: **2,991/2,991** passing
- Next migration: `0031` (first Epic 7 migration)
- Epic 7 starts fresh — no prior events infrastructure exists

### Architecture References

- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries] — `src/features/events/` module, `src/db/schema/community-events.ts`, `src/app/[locale]/(guest)/events/` (browse/detail) + `src/app/[locale]/(app)/events/` (create/edit)
- [Source: _bmad-output/planning-artifacts/architecture.md#Core Architectural Decisions] — SSR for public event listings, CSR for member views; ISR for event detail page
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Events & Video Meetings] — Full AC for Stories 7.1–7.4, Daily.co decision
- [Source: docs/decisions/isr-pattern.md] — Never call `auth()` in ISR Server Components
- [Source: src/services/permissions.ts] — PERMISSION_MATRIX structure, canCreateGroup pattern for canCreateEvent

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly except for two test fixes needed after the full suite run.

### Completion Notes List

1. **`event-bus.ts` uses `globalThis` singleton** — `vi.resetModules()` alone does not reset the EventBus instance between tests. Added `delete (globalThis as Record<string, unknown>).__eventBus` to `event-bus.test.ts` `beforeEach` to ensure each test gets a fresh bus.

2. **`new/page.test.tsx` environment** — The story spec listed `@vitest-environment node`, but one test used `@testing-library/react` which requires DOM. Changed to `// @vitest-environment jsdom` following the `my-articles/page.test.tsx` pattern. The redirect test uses a `RedirectError` class instead of `rejects.toThrow`.

3. **Pre-existing `(guest)/events/page.tsx` placeholder** — A placeholder page existed with different i18n keys (`Events.emptyTitle`, etc.). Updated the page to the new implementation and fixed its test accordingly.

4. **`getGroupsForUserMembership` was not in groups.ts** — Added this function (the spec noted `listGroupsByMember()` doesn't exist — this fills the gap).

5. **`listUpcomingEvents` uses raw SQL** — Drizzle's query builder was unwieldy for the conditional LEFT JOIN visibility filter. Used `db.execute(sql\`...\`)`following the`getRelatedArticles` pattern from Story 6.3.

6. **`await eventBus.emit(...)` in event-service.ts** — `emit()` returns `boolean`, not a Promise. Awaiting it is a no-op but harmless. Left as-is since it doesn't affect behavior.

### File List

**New files:**

- `src/db/schema/community-events.ts`
- `src/db/migrations/0031_events.sql`
- `src/db/queries/events.ts`
- `src/db/queries/events.test.ts`
- `src/services/event-service.ts`
- `src/services/event-service.test.ts`
- `src/app/api/v1/events/route.ts`
- `src/app/api/v1/events/route.test.ts`
- `src/app/api/v1/events/[eventId]/route.ts`
- `src/app/api/v1/events/[eventId]/route.test.ts`
- `src/features/events/index.ts`
- `src/features/events/components/EventCard.tsx`
- `src/features/events/components/EventCard.test.tsx`
- `src/features/events/components/EventForm.tsx`
- `src/features/events/components/EventForm.test.tsx`
- `src/features/events/components/EventList.tsx`
- `src/features/events/components/EventList.test.tsx`
- `src/features/events/components/EventFormatBadge.tsx`
- `src/features/events/components/EventStatusBadge.tsx`
- `src/features/events/components/EventMembershipGate.tsx`
- `src/features/events/components/EventDetailActions.tsx`
- `src/features/events/hooks/use-events.ts`
- `src/app/[locale]/(guest)/events/[eventId]/page.tsx`
- `src/app/[locale]/(app)/events/new/page.tsx`
- `src/app/[locale]/(app)/events/[eventId]/edit/page.tsx`
- `src/templates/email/article-submitted.ts` (from Story 6.4 review — already in git status)

**Modified files:**

- `src/db/index.ts` — add `communityEventsSchema` import + spread
- `src/db/migrations/meta/_journal.json` — add idx:31 entry
- `src/db/queries/groups.ts` — add `getGroupsForUserMembership()`
- `src/services/permissions.ts` — add `canCreateEvent` to PERMISSION_MATRIX + function export + UPGRADE_MESSAGE_KEYS
- `src/services/permissions.test.ts` — add 2 `canCreateEvent` tests (appended)
- `src/services/rate-limiter.ts` — add EVENT_CREATE/UPDATE/LIST/DETAIL presets
- `src/services/event-bus.test.ts` — add `delete globalThis.__eventBus` to beforeEach (test isolation fix)
- `src/types/events.ts` — add EventCreatedEvent, EventUpdatedEvent, EventCancelledEvent + EventName + EventMap
- `src/app/[locale]/(guest)/events/page.tsx` — replaced placeholder with real implementation
- `src/app/[locale]/(guest)/events/page.test.tsx` — updated to match new implementation
- `src/app/[locale]/(app)/events/new/page.test.tsx` — changed to jsdom env, fixed redirect test pattern
- `messages/en.json` — add `Events` namespace + `Permissions.eventCreationRequired`
- `messages/ig.json` — add same keys in Igbo
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated to `review`

## Senior Developer Review (AI)

**Reviewer:** Dev on 2026-03-05
**Model:** claude-opus-4-6
**Result:** APPROVED with fixes applied

### Findings & Fixes Applied (8 issues found: 3 High, 4 Medium, 1 Low)

**H-1 (FIXED): Duplicate `"Events"` namespace in en.json and ig.json**
Both locale files had two top-level `"Events"` keys — the original guest landing page placeholder (line ~203) and the new Story 7.1 namespace (line ~449). In JSON, the second silently overwrites the first. Removed the obsolete first block (keys were unused by any component).

**H-2 (FIXED): Hardcoded English strings in EventMembershipGate, EventDetailActions, EventForm**
6 hardcoded English strings found: "Sign in", "This event is for group members only.", "Back to events", "Keep Event", "Cancelling...", "Start and end time are required." Added new i18n keys (`Events.gate.*`, `Events.cancel.keepEvent`, `Events.cancel.cancelling`, `Events.validation.startEndRequired`) to both en.json and ig.json. Updated all 3 components to use `t(...)`.

**H-3 (FIXED): `vi.clearAllMocks()` in EventForm.test.tsx**
Replaced with a no-op `beforeEach` (no mocks need resetting in this file). Follows established Story 5.2 pattern: per-mock `mockReset()` instead of global `clearAllMocks()`.

**M-1 (FIXED): "Create Event" button shown to unauthenticated visitors**
Created `CreateEventButton` client component using `useSession()` — only renders when authenticated. Replaced raw `Link` in `(guest)/events/page.tsx`. Added to barrel export. Updated page test.

**M-2 (FIXED): `updateEvent` missing future date validation**
Added `startTime > now()` and `endTime > startTime` validation in `event-service.ts` `updateEvent()` when those fields are being updated. Also handles partial updates (only endTime changed → validates against existing startTime). Added 2 tests.

**M-3 (FIXED): No `listGroupEvents` test coverage**
Added test to `events.test.ts` verifying `listGroupEvents` returns events for a group.

**M-4 (FIXED): No event detail page test**
Created `(guest)/events/[eventId]/page.test.tsx` with 5 tests: renders title/details, notFound for missing event, notFound for soft-deleted, renders EventMembershipGate for private group events, renders EventDetailActions.

**L-1 (COVERED by H-2): EventForm hardcoded validation string**
Fixed as part of H-2 — added `Events.validation.startEndRequired` i18n key.

### Review Fix Files

- `messages/en.json` — removed duplicate Events block, added `gate.*`, `cancel.keepEvent`, `cancel.cancelling`, `validation.startEndRequired`
- `messages/ig.json` — same changes with Igbo translations
- `src/features/events/components/EventMembershipGate.tsx` — replaced 3 hardcoded strings with `t(...)` calls
- `src/features/events/components/EventDetailActions.tsx` — replaced 2 hardcoded strings with `t(...)` calls
- `src/features/events/components/EventForm.tsx` — replaced 1 hardcoded string with `t(...)` call
- `src/features/events/components/EventForm.test.tsx` — removed `vi.clearAllMocks()`
- `src/features/events/components/CreateEventButton.tsx` — **NEW** client component for auth-gated create button
- `src/features/events/index.ts` — added `CreateEventButton` export
- `src/app/[locale]/(guest)/events/page.tsx` — use `CreateEventButton` instead of raw `Link`
- `src/app/[locale]/(guest)/events/page.test.tsx` — updated mock for `CreateEventButton`
- `src/services/event-service.ts` — added date validation to `updateEvent()`
- `src/services/event-service.test.ts` — +2 tests for updateEvent date validation
- `src/db/queries/events.test.ts` — +1 test for `listGroupEvents`
- `src/app/[locale]/(guest)/events/[eventId]/page.test.tsx` — **NEW** +5 tests for event detail page

### Test Count

- Before review: 3042/3042 passing
- After review: 3050/3050 passing (+8 tests from review fixes)
