// No "server-only" — consistent with articles.ts pattern.
// This file is used by event-service.ts (server-only) and tests.
import { db } from "@/db";
import { communityEvents, communityEventAttendees } from "@/db/schema/community-events";
import { communityProfiles } from "@/db/schema/community-profiles";
import { eq, and, ne, isNull, asc, lte, sql, inArray } from "drizzle-orm";
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
  dateChangeType: "postponed" | "preponed" | null;
  dateChangeComment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MyRsvpEventListItem extends EventListItem {
  rsvpStatus: "registered" | "waitlisted" | "cancelled";
  waitlistPosition: number | null; // only set for 'waitlisted' status
  cancellationReason: string | null;
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
      | "dailyRoomName"
      | "dateChangeType"
      | "dateChangeComment"
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
 * Set status='cancelled' WHERE id AND creator_id AND status != 'cancelled'.
 * Intentionally allows cancelling 'live' events (ne instead of eq upcoming).
 * Returns true if a row was affected, false otherwise.
 */
export async function cancelEvent(
  eventId: string,
  creatorId: string,
  reason: string,
): Promise<boolean> {
  const [updated] = await db
    .update(communityEvents)
    .set({ status: "cancelled", cancellationReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(communityEvents.id, eventId),
        eq(communityEvents.creatorId, creatorId), // defence-in-depth: only creator
        ne(communityEvents.status, "cancelled"), // allow cancelling live or upcoming
      ),
    )
    .returning({ id: communityEvents.id });
  return !!updated;
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
      e.date_change_type AS "dateChangeType",
      e.date_change_comment AS "dateChangeComment",
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
      dateChangeType: communityEvents.dateChangeType,
      dateChangeComment: communityEvents.dateChangeComment,
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
      e.recurrence_parent_id AS "recurrenceParentId", e.status,
      e.date_change_type AS "dateChangeType", e.date_change_comment AS "dateChangeComment",
      e.created_at AS "createdAt", e.updated_at AS "updatedAt"
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

export interface AttendeeWithProfile {
  userId: string;
  displayName: string;
  status: "registered" | "waitlisted" | "attended" | "cancelled";
  joinedAt: Date | null;
}

/**
 * Mark an attendee as `attended` with a joined_at timestamp.
 * Transaction: SELECT FOR UPDATE → check status → UPDATE.
 * Idempotent: if already `attended`, returns { alreadyAttended: true }.
 * Does NOT change attendeeCount — that tracks RSVPs, not attendance.
 */
export async function markAttended(
  eventId: string,
  userId: string,
  joinedAt: Date,
): Promise<{ alreadyAttended: boolean }> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(
      sql`SELECT status FROM community_event_attendees
          WHERE event_id = ${eventId} AND user_id = ${userId}
          FOR UPDATE`,
    );
    const row = Array.from(rows)[0] as { status: string } | undefined;

    if (!row) {
      throw new Error("Attendee not found");
    }

    if (row.status === "attended") {
      return { alreadyAttended: true };
    }

    if (row.status === "cancelled") {
      throw new Error("Cannot mark cancelled attendee as attended");
    }

    await tx
      .update(communityEventAttendees)
      .set({ status: "attended", joinedAt })
      .where(
        and(
          eq(communityEventAttendees.eventId, eventId),
          eq(communityEventAttendees.userId, userId),
        ),
      );

    return { alreadyAttended: false };
  });
}

/**
 * List all attendees for an event with their display names.
 * Used by manual check-in UI (creator only).
 */
export async function listEventAttendees(eventId: string): Promise<AttendeeWithProfile[]> {
  const rows = await db
    .select({
      userId: communityEventAttendees.userId,
      displayName: communityProfiles.displayName,
      status: communityEventAttendees.status,
      joinedAt: communityEventAttendees.joinedAt,
    })
    .from(communityEventAttendees)
    .innerJoin(communityProfiles, eq(communityProfiles.userId, communityEventAttendees.userId))
    .where(eq(communityEventAttendees.eventId, eventId))
    .orderBy(asc(communityEventAttendees.registeredAt));

  return rows as AttendeeWithProfile[];
}

/**
 * Lists events the user has RSVP'd to.
 * Includes:
 * - Active RSVPs (registered/waitlisted) for upcoming non-cancelled events
 * - Organiser-cancelled events where the member had a valid RSVP at time of cancellation
 *   (proxy: both e.status='cancelled' AND ea.status='cancelled')
 * Note: if a member self-cancels their RSVP before an organiser cancels the event, the
 * proxy still matches — this is accepted behaviour (reason is relevant to them).
 */
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
      e.recurrence_parent_id AS "recurrenceParentId", e.status,
      e.date_change_type AS "dateChangeType", e.date_change_comment AS "dateChangeComment",
      e.cancellation_reason AS "cancellationReason",
      e.created_at AS "createdAt", e.updated_at AS "updatedAt",
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
      AND e.deleted_at IS NULL
      AND (
        (ea.status IN ('registered', 'waitlisted') AND e.status != 'cancelled' AND e.start_time > NOW())
        OR
        (e.status = 'cancelled' AND ea.status = 'cancelled')
      )
    ORDER BY CASE WHEN e.status = 'cancelled' THEN 1 ELSE 0 END ASC, e.start_time ASC
    LIMIT ${limit} OFFSET ${offset}`,
  );
  return Array.from(rows) as MyRsvpEventListItem[];
}

// ─── Recording Query Functions (Story 7.4) ───────────────────────────────────

/** Set recording_url and transition recording_status to 'mirroring'. */
export async function setRecordingSourceUrl(eventId: string, recordingUrl: string): Promise<void> {
  await db
    .update(communityEvents)
    .set({ recordingUrl, recordingStatus: "mirroring", updatedAt: new Date() })
    .where(eq(communityEvents.id, eventId));
}

/** Set mirror URL + size + expiry and mark recording_status as 'ready'. */
export async function setRecordingMirror(
  eventId: string,
  mirrorUrl: string,
  sizeBytes: number,
  expiresAt: Date,
): Promise<void> {
  await db
    .update(communityEvents)
    .set({
      recordingMirrorUrl: mirrorUrl,
      recordingSizeBytes: sizeBytes,
      recordingExpiresAt: expiresAt,
      recordingStatus: "ready",
      recordingMirrorRetryCount: 0,
      recordingMirrorNextRetryAt: null,
      updatedAt: new Date(),
    })
    .where(eq(communityEvents.id, eventId));
}

/** Mark recording as lost: clear URLs, set status to 'lost'. */
export async function markRecordingLost(eventId: string): Promise<void> {
  await db
    .update(communityEvents)
    .set({
      recordingStatus: "lost",
      recordingUrl: null,
      recordingMirrorUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(communityEvents.id, eventId));
}

/** List recordings expiring within windowDays that have not yet received a warning. */
export async function listExpiringRecordings(windowDays: number): Promise<CommunityEvent[]> {
  const cutoff = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(communityEvents)
    .where(
      and(
        lte(communityEvents.recordingExpiresAt, cutoff),
        isNull(communityEvents.recordingWarningSentAt),
        sql`${communityEvents.recordingMirrorUrl} IS NOT NULL`,
        sql`${communityEvents.recordingExpiresAt} > NOW()`,
      ),
    );
}

/** List recordings where recording_expires_at < NOW() and mirror URL is still set. */
export async function listExpiredRecordings(): Promise<CommunityEvent[]> {
  return db
    .select()
    .from(communityEvents)
    .where(
      and(
        sql`${communityEvents.recordingExpiresAt} < NOW()`,
        sql`${communityEvents.recordingMirrorUrl} IS NOT NULL`,
      ),
    );
}

/** Mark that a 14-day expiry warning was sent for this event's recording. */
export async function markRecordingWarningSent(eventId: string, timestamp: Date): Promise<void> {
  await db
    .update(communityEvents)
    .set({ recordingWarningSentAt: timestamp, updatedAt: new Date() })
    .where(eq(communityEvents.id, eventId));
}

/** List events in 'mirroring' state where retry time has arrived (or has never been set). */
export async function listPendingMirrorRetries(): Promise<CommunityEvent[]> {
  return db
    .select()
    .from(communityEvents)
    .where(
      and(
        eq(communityEvents.recordingStatus, "mirroring"),
        sql`(${communityEvents.recordingMirrorNextRetryAt} IS NULL OR ${communityEvents.recordingMirrorNextRetryAt} <= NOW())`,
      ),
    );
}

/** Update the mirror retry schedule (next retry time + count). */
export async function updateMirrorRetrySchedule(
  eventId: string,
  nextRetryAt: Date,
  retryCount: number,
): Promise<void> {
  await db
    .update(communityEvents)
    .set({
      recordingMirrorNextRetryAt: nextRetryAt,
      recordingMirrorRetryCount: retryCount,
      updatedAt: new Date(),
    })
    .where(eq(communityEvents.id, eventId));
}

/** List user IDs of attendees in registered/attended status for a given event. */
export async function listRegisteredAttendeeUserIds(eventId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: communityEventAttendees.userId })
    .from(communityEventAttendees)
    .where(
      and(
        eq(communityEventAttendees.eventId, eventId),
        inArray(communityEventAttendees.status, ["registered", "attended"]),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Reverse-lookup from Daily room_name to the event record. */
export async function getEventByRoomName(roomName: string): Promise<CommunityEvent | null> {
  const [row] = await db
    .select()
    .from(communityEvents)
    .where(eq(communityEvents.dailyRoomName, roomName))
    .limit(1);
  return row ?? null;
}

/**
 * List upcoming events that are within a reminder window and have not yet
 * had a reminder of that type sent.
 * @param reminderType - "24h" | "1h" | "15m"
 * @param windowStartMs - earliest ms before start_time
 * @param windowEndMs - latest ms before start_time
 */
export async function listEventsNeedingReminder(
  reminderType: "24h" | "1h" | "15m",
  windowStartMs: number,
  windowEndMs: number,
): Promise<CommunityEvent[]> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + windowEndMs);
  const windowEnd = new Date(now.getTime() + windowStartMs);

  const rows = await db.execute(
    sql`SELECT * FROM community_events
        WHERE status = 'upcoming'
          AND deleted_at IS NULL
          AND start_time >= ${windowStart}
          AND start_time <= ${windowEnd}
          AND NOT (reminder_sent_flags ? ${reminderType})`,
  );
  return Array.from(rows) as CommunityEvent[];
}

/** Mark a reminder type as sent for an event by updating the JSONB flags. */
export async function markReminderSent(
  eventId: string,
  reminderType: "24h" | "1h" | "15m",
): Promise<void> {
  await db.execute(
    sql`UPDATE community_events
        SET reminder_sent_flags = reminder_sent_flags || ${JSON.stringify({ [reminderType]: true })}::jsonb,
            updated_at = NOW()
        WHERE id = ${eventId}`,
  );
}
