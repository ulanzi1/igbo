// No "server-only" — consistent with articles.ts pattern.
// This file is used by event-service.ts (server-only) and tests.
import { db } from "@/db";
import { communityEvents } from "@/db/schema/community-events";
import { eq, and, isNull, asc, sql } from "drizzle-orm";
import type { CommunityEvent, NewCommunityEvent, EventStatus } from "@/db/schema/community-events";

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
