// No "server-only" — consistent with articles.ts pattern.
// This file is used by event-service.ts (server-only) and tests.
import { db } from "@/db";
import { communityEvents, communityEventAttendees } from "@/db/schema/community-events";
import { eq, and, isNull, asc, sql, inArray } from "drizzle-orm";
import type { CommunityEvent, NewCommunityEvent, EventStatus } from "@/db/schema/community-events";

export type { CommunityEvent, NewCommunityEvent };
export type { AttendeeStatus } from "@/db/schema/community-events";

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

export interface MyRsvpEventListItem extends EventListItem {
  rsvpStatus: "registered" | "waitlisted";
  waitlistPosition: number | null; // only set for 'waitlisted' status
}

export interface AttendeeStatusResult {
  status: "registered" | "waitlisted" | "attended" | "cancelled";
  waitlistPosition: number | null;
}

export type RsvpResult =
  | {
      success: true;
      status: "registered" | "waitlisted";
      waitlistPosition: number | null;
      attendeeCount: number;
    }
  | { success: false; code: 404 | 409 | 422; reason: string };

export type CancelRsvpResult =
  | {
      success: true;
      previousStatus: "registered" | "waitlisted";
      promotedUserId: string | null;
      attendeeCount: number;
    }
  | { success: false; code: 404 | 409; reason: string };

/** INSERT a new event and return the created row. */
export async function createEvent(data: NewCommunityEvent): Promise<CommunityEvent> {
  const [row] = await db.insert(communityEvents).values(data).returning();
  if (!row) throw new Error("Failed to insert community event");
  return row;
}

/** SELECT event by id. Returns null if not found. Caller handles deletedAt filter. */
export async function getEventById(eventId: string): Promise<CommunityEvent | null> {
  const [row] = await db
    .select()
    .from(communityEvents)
    .where(eq(communityEvents.id, eventId))
    .limit(1);
  return row ?? null;
}

/**
 * UPDATE event fields. Only updates if event belongs to creatorId and is not cancelled.
 * Returns updated row or null if not found / not authorized / already cancelled.
 */
export async function updateEvent(
  eventId: string,
  creatorId: string,
  updates: Partial<
    Pick<
      CommunityEvent,
      | "title"
      | "description"
      | "format"
      | "location"
      | "meetingLink"
      | "timezone"
      | "startTime"
      | "endTime"
      | "durationMinutes"
      | "registrationLimit"
    >
  >,
): Promise<CommunityEvent | null> {
  const [row] = await db
    .update(communityEvents)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(communityEvents.id, eventId),
        eq(communityEvents.creatorId, creatorId),
        sql`${communityEvents.status} != 'cancelled'`,
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Set status='cancelled' WHERE id AND creator_id AND status='upcoming'.
 * Returns true if a row was affected, false otherwise.
 */
export async function cancelEvent(eventId: string, creatorId: string): Promise<boolean> {
  const result = await db
    .update(communityEvents)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(communityEvents.id, eventId),
        eq(communityEvents.creatorId, creatorId),
        eq(communityEvents.status, "upcoming"),
      ),
    )
    .returning({ id: communityEvents.id });
  return result.length > 0;
}

/**
 * List upcoming events with group visibility filtering.
 * - general events: always included
 * - group events with public visibility: always included
 * - group events with private/hidden visibility: only included if userId is an active member
 */
export async function listUpcomingEvents(opts: {
  userId?: string;
  groupId?: string;
  limit?: number;
  offset?: number;
}): Promise<EventListItem[]> {
  const { userId, groupId, limit = 20, offset = 0 } = opts;

  // Use raw SQL for the complex conditional join on group visibility
  const groupIdFilter = groupId ? sql`AND e.group_id = ${groupId}` : sql``;
  const userIdParam = userId ?? null;

  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.title,
      e.description,
      e.creator_id AS "creatorId",
      e.group_id AS "groupId",
      e.event_type AS "eventType",
      e.format,
      e.location,
      e.meeting_link AS "meetingLink",
      e.timezone,
      e.start_time AS "startTime",
      e.end_time AS "endTime",
      e.duration_minutes AS "durationMinutes",
      e.registration_limit AS "registrationLimit",
      e.attendee_count AS "attendeeCount",
      e.recurrence_pattern AS "recurrencePattern",
      e.recurrence_parent_id AS "recurrenceParentId",
      e.status,
      e.created_at AS "createdAt",
      e.updated_at AS "updatedAt"
    FROM community_events e
    LEFT JOIN community_groups g ON g.id = e.group_id
    LEFT JOIN community_group_members cgm
      ON cgm.group_id = e.group_id
      AND cgm.user_id = ${userIdParam}
      AND cgm.status = 'active'
    WHERE
      e.status = 'upcoming'
      AND e.start_time > NOW()
      AND e.deleted_at IS NULL
      AND (
        e.event_type = 'general'
        OR g.visibility = 'public'
        OR (g.visibility IN ('private', 'hidden') AND cgm.user_id IS NOT NULL)
      )
      ${groupIdFilter}
    ORDER BY e.start_time ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return (rows as unknown[]).map((r) => r as EventListItem);
}

/** List all non-cancelled events for a group, ordered by startTime ASC. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listGroupEvents(groupId: string, userId?: string): Promise<EventListItem[]> {
  const rows = await db
    .select({
      id: communityEvents.id,
      title: communityEvents.title,
      description: communityEvents.description,
      creatorId: communityEvents.creatorId,
      groupId: communityEvents.groupId,
      eventType: communityEvents.eventType,
      format: communityEvents.format,
      location: communityEvents.location,
      meetingLink: communityEvents.meetingLink,
      timezone: communityEvents.timezone,
      startTime: communityEvents.startTime,
      endTime: communityEvents.endTime,
      durationMinutes: communityEvents.durationMinutes,
      registrationLimit: communityEvents.registrationLimit,
      attendeeCount: communityEvents.attendeeCount,
      recurrencePattern: communityEvents.recurrencePattern,
      recurrenceParentId: communityEvents.recurrenceParentId,
      status: communityEvents.status,
      createdAt: communityEvents.createdAt,
      updatedAt: communityEvents.updatedAt,
    })
    .from(communityEvents)
    .where(
      and(
        eq(communityEvents.groupId, groupId),
        sql`${communityEvents.status} != 'cancelled'`,
        isNull(communityEvents.deletedAt),
      ),
    )
    .orderBy(asc(communityEvents.startTime));

  return rows;
}

/** SELECT all events with recurrence_parent_id = parentId, ordered by startTime ASC. */
export async function getEventsByParentId(parentId: string): Promise<CommunityEvent[]> {
  return db
    .select()
    .from(communityEvents)
    .where(eq(communityEvents.recurrenceParentId, parentId))
    .orderBy(asc(communityEvents.startTime));
}

/** Returns the user's current attendee status for an event, or null if not registered. */
export async function getAttendeeStatus(
  eventId: string,
  userId: string,
): Promise<AttendeeStatusResult | null> {
  const rows = await db
    .select()
    .from(communityEventAttendees)
    .where(
      and(eq(communityEventAttendees.eventId, eventId), eq(communityEventAttendees.userId, userId)),
    )
    .limit(1);
  if (!rows[0]) return null;
  const attendee = rows[0];
  let waitlistPosition: number | null = null;
  if (attendee.status === "waitlisted") {
    const posRows = await db.execute(
      sql`SELECT COUNT(*) as count FROM community_event_attendees
          WHERE event_id = ${eventId} AND status = 'waitlisted'
          AND registered_at <= (
            SELECT registered_at FROM community_event_attendees
            WHERE event_id = ${eventId} AND user_id = ${userId}
          )`,
    );
    waitlistPosition = Number(Array.from(posRows)[0]?.count ?? 1);
  }
  return { status: attendee.status, waitlistPosition };
}

export async function rsvpToEvent(eventId: string, userId: string): Promise<RsvpResult> {
  return db.transaction(async (tx) => {
    // Lock the event row to prevent concurrent RSVP race conditions
    const eventRows = await tx.execute(
      sql`SELECT id, attendee_count, registration_limit, status, start_time
          FROM community_events
          WHERE id = ${eventId} AND deleted_at IS NULL
          FOR UPDATE`,
    );
    const eventRow = Array.from(eventRows)[0] as
      | {
          id: string;
          attendee_count: number;
          registration_limit: number | null;
          status: string;
          start_time: Date;
        }
      | undefined;

    if (!eventRow) {
      return { success: false, code: 404, reason: "Event not found" };
    }
    if (eventRow.status !== "upcoming") {
      return { success: false, code: 422, reason: "Event is not accepting RSVPs" };
    }
    if (new Date(eventRow.start_time) <= new Date()) {
      return { success: false, code: 422, reason: "Event has already started" };
    }

    // Check existing attendee record
    const existing = await tx
      .select()
      .from(communityEventAttendees)
      .where(
        and(
          eq(communityEventAttendees.eventId, eventId),
          eq(communityEventAttendees.userId, userId),
        ),
      )
      .limit(1);

    const existingRecord = existing[0];
    if (existingRecord && existingRecord.status !== "cancelled") {
      return {
        success: false,
        code: 409,
        reason: "Already registered or waitlisted for this event",
      };
    }

    const attendeeCount = Number(eventRow.attendee_count);
    const registrationLimit = eventRow.registration_limit
      ? Number(eventRow.registration_limit)
      : null;
    const isFullyBooked = registrationLimit !== null && attendeeCount >= registrationLimit;

    if (!isFullyBooked) {
      // Register (INSERT new or UPDATE cancelled → registered)
      if (existingRecord) {
        await tx
          .update(communityEventAttendees)
          .set({ status: "registered", registeredAt: new Date() })
          .where(
            and(
              eq(communityEventAttendees.eventId, eventId),
              eq(communityEventAttendees.userId, userId),
            ),
          );
      } else {
        await tx.insert(communityEventAttendees).values({
          eventId,
          userId,
          status: "registered",
        });
      }
      await tx
        .update(communityEvents)
        .set({ attendeeCount: sql`attendee_count + 1` })
        .where(eq(communityEvents.id, eventId));
      return {
        success: true,
        status: "registered",
        waitlistPosition: null,
        attendeeCount: attendeeCount + 1,
      };
    } else {
      // Waitlist (INSERT new or UPDATE cancelled → waitlisted)
      if (existingRecord) {
        await tx
          .update(communityEventAttendees)
          .set({ status: "waitlisted", registeredAt: new Date() })
          .where(
            and(
              eq(communityEventAttendees.eventId, eventId),
              eq(communityEventAttendees.userId, userId),
            ),
          );
      } else {
        await tx.insert(communityEventAttendees).values({
          eventId,
          userId,
          status: "waitlisted",
        });
      }
      const positionRows = await tx.execute(
        sql`SELECT COUNT(*) as count FROM community_event_attendees
            WHERE event_id = ${eventId} AND status = 'waitlisted'`,
      );
      const position = Number(Array.from(positionRows)[0]?.count ?? 1);
      return { success: true, status: "waitlisted", waitlistPosition: position, attendeeCount };
    }
  });
}

/**
 * Cancel a user's RSVP. If the user was `registered`, promotes the first
 * waitlisted attendee (by registeredAt ASC).
 */
export async function cancelRsvp(eventId: string, userId: string): Promise<CancelRsvpResult> {
  return db.transaction(async (tx) => {
    // Read inside transaction (TOCTOU guard — see Story 5.2 pattern)
    const existing = await tx
      .select()
      .from(communityEventAttendees)
      .where(
        and(
          eq(communityEventAttendees.eventId, eventId),
          eq(communityEventAttendees.userId, userId),
        ),
      )
      .limit(1);

    const record = existing[0];
    if (!record) {
      return { success: false, code: 404, reason: "No RSVP found for this event" };
    }
    if (record.status === "cancelled") {
      return { success: false, code: 409, reason: "RSVP already cancelled" };
    }
    if (record.status === "attended") {
      return { success: false, code: 409, reason: "Cannot cancel an attended RSVP" };
    }

    const previousStatus = record.status as "registered" | "waitlisted";

    // Cancel this attendee
    await tx
      .update(communityEventAttendees)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(communityEventAttendees.eventId, eventId),
          eq(communityEventAttendees.userId, userId),
        ),
      );

    if (previousStatus === "waitlisted") {
      // Get current attendeeCount (no count change for waitlisted cancellation)
      const eventRows = await tx
        .select({ attendeeCount: communityEvents.attendeeCount })
        .from(communityEvents)
        .where(eq(communityEvents.id, eventId))
        .limit(1);
      const currentCount = eventRows[0]?.attendeeCount ?? 0;
      return { success: true, previousStatus, promotedUserId: null, attendeeCount: currentCount };
    }

    // Was registered: decrement count
    await tx
      .update(communityEvents)
      .set({ attendeeCount: sql`GREATEST(attendee_count - 1, 0)` })
      .where(eq(communityEvents.id, eventId));

    // Promote first waitlisted member (if any)
    const waitlistedRows = await tx
      .select()
      .from(communityEventAttendees)
      .where(
        and(
          eq(communityEventAttendees.eventId, eventId),
          eq(communityEventAttendees.status, "waitlisted"),
        ),
      )
      .orderBy(asc(communityEventAttendees.registeredAt))
      .limit(1);

    const toPromote = waitlistedRows[0];
    if (toPromote) {
      await tx
        .update(communityEventAttendees)
        .set({ status: "registered" })
        .where(
          and(
            eq(communityEventAttendees.eventId, eventId),
            eq(communityEventAttendees.userId, toPromote.userId),
          ),
        );
      // Re-increment count (promoted → registered)
      await tx
        .update(communityEvents)
        .set({ attendeeCount: sql`attendee_count + 1` })
        .where(eq(communityEvents.id, eventId));
      // Count back to original (decrement then increment = unchanged)
      const eventRows = await tx
        .select({ attendeeCount: communityEvents.attendeeCount })
        .from(communityEvents)
        .where(eq(communityEvents.id, eventId))
        .limit(1);
      return {
        success: true,
        previousStatus,
        promotedUserId: toPromote.userId,
        attendeeCount: eventRows[0]?.attendeeCount ?? 0,
      };
    }

    // No waitlist — count was decremented
    const eventRows = await tx
      .select({ attendeeCount: communityEvents.attendeeCount })
      .from(communityEvents)
      .where(eq(communityEvents.id, eventId))
      .limit(1);
    return {
      success: true,
      previousStatus,
      promotedUserId: null,
      attendeeCount: eventRows[0]?.attendeeCount ?? 0,
    };
  });
}

/**
 * Bulk-cancel all registered/waitlisted attendees for an event.
 * Called when event creator cancels the event. Does NOT touch attendee_count
 * (preserves it as a historical record of how many people had registered).
 */
export async function cancelAllEventRsvps(eventId: string): Promise<void> {
  await db
    .update(communityEventAttendees)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(communityEventAttendees.eventId, eventId),
        inArray(communityEventAttendees.status, ["registered", "waitlisted"]),
      ),
    );
}

/** Lists events where startTime < NOW() and status != 'cancelled', ordered by startTime DESC. */
export async function listPastEvents(opts: {
  userId?: string;
  groupId?: string;
  limit?: number;
  offset?: number;
}): Promise<EventListItem[]> {
  const { userId, groupId, limit = 20, offset = 0 } = opts;
  const rows = await db.execute(
    sql`SELECT
      e.id, e.title, e.description, e.creator_id AS "creatorId",
      e.group_id AS "groupId", e.event_type AS "eventType", e.format,
      e.location, e.meeting_link AS "meetingLink", e.timezone,
      e.start_time AS "startTime", e.end_time AS "endTime",
      e.duration_minutes AS "durationMinutes", e.registration_limit AS "registrationLimit",
      e.attendee_count AS "attendeeCount", e.recurrence_pattern AS "recurrencePattern",
      e.recurrence_parent_id AS "recurrenceParentId", e.status, e.created_at AS "createdAt",
      e.updated_at AS "updatedAt"
    FROM community_events e
    LEFT JOIN community_groups g ON e.group_id = g.id
    LEFT JOIN community_group_members gm ON g.id = gm.group_id AND gm.user_id = ${userId ?? null} AND gm.status = 'active'
    WHERE e.deleted_at IS NULL
      AND e.start_time < NOW()
      AND e.status != 'cancelled'
      AND (${groupId ? sql`e.group_id = ${groupId}` : sql`1=1`})
      AND (
        e.event_type = 'general'
        OR (g.visibility = 'public')
        OR (g.visibility IN ('private', 'hidden') AND gm.user_id IS NOT NULL)
      )
    ORDER BY e.start_time DESC
    LIMIT ${limit} OFFSET ${offset}`,
  );
  return Array.from(rows) as EventListItem[];
}

/** Lists upcoming events the user has RSVP'd to (registered or waitlisted). */
export async function listMyRsvps(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<MyRsvpEventListItem[]> {
  const { limit = 20, offset = 0 } = opts ?? {};
  const rows = await db.execute(
    sql`SELECT
      e.id, e.title, e.description, e.creator_id AS "creatorId",
      e.group_id AS "groupId", e.event_type AS "eventType", e.format,
      e.location, e.meeting_link AS "meetingLink", e.timezone,
      e.start_time AS "startTime", e.end_time AS "endTime",
      e.duration_minutes AS "durationMinutes", e.registration_limit AS "registrationLimit",
      e.attendee_count AS "attendeeCount", e.recurrence_pattern AS "recurrencePattern",
      e.recurrence_parent_id AS "recurrenceParentId", e.status, e.created_at AS "createdAt",
      e.updated_at AS "updatedAt",
      ea.status AS "rsvpStatus",
      (CASE
        WHEN ea.status = 'waitlisted' THEN (
          SELECT COUNT(*) FROM community_event_attendees wl
          WHERE wl.event_id = e.id AND wl.status = 'waitlisted'
          AND wl.registered_at <= ea.registered_at
        )
        ELSE NULL
      END)::int AS "waitlistPosition"
    FROM community_event_attendees ea
    INNER JOIN community_events e ON ea.event_id = e.id
    WHERE ea.user_id = ${userId}
      AND ea.status IN ('registered', 'waitlisted')
      AND e.start_time > NOW()
      AND e.deleted_at IS NULL
      AND e.status != 'cancelled'
    ORDER BY e.start_time ASC
    LIMIT ${limit} OFFSET ${offset}`,
  );
  return Array.from(rows) as MyRsvpEventListItem[];
}
