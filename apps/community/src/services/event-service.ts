import "server-only";
import { z } from "zod/v4";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { canCreateEvent } from "@/services/permissions";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import { getPlatformSetting } from "@/db/queries/platform-settings";
import { ApiError } from "@/lib/api-error";
import { eventBus } from "@/services/event-bus";
import { dailyVideoService } from "@/services/daily-video-service";
import { getS3Client } from "@/lib/s3-client";
import { env } from "@/env";
import { getUserPlatformRole } from "@/db/queries/groups";
import {
  createEvent as dbCreateEvent,
  updateEvent as dbUpdateEvent,
  cancelEvent as dbCancelEvent,
  getEventById,
  rsvpToEvent as dbRsvpToEvent,
  cancelRsvp as dbCancelRsvp,
  cancelAllEventRsvps,
  markAttended as dbMarkAttended,
  listEventAttendees,
  getAttendeeStatus,
} from "@/db/queries/events";

export { listEventAttendees };

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  eventType: z.enum(["general", "group"]).default("general"),
  groupId: z.string().uuid().optional().or(z.literal("")),
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

export const UpdateEventSchema = CreateEventSchema.omit({
  eventType: true, // event type cannot be changed after creation
  groupId: true, // group association cannot be changed after creation
  recurrencePattern: true, // recurrence cannot be changed after creation
})
  .partial()
  .extend({
    dateChangeComment: z.string().min(1).optional(),
  });
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

// ─── Recurrence constants ─────────────────────────────────────────────────────

const RECURRENCE_INSTANCE_COUNTS = {
  daily: 7,
  weekly: 8,
  monthly: 6,
} as const;

const RECURRENCE_OFFSETS_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;

// ─── Service functions ────────────────────────────────────────────────────────

export async function createEvent(
  userId: string,
  data: CreateEventInput,
): Promise<{ eventId: string }> {
  // Permission check
  const permission = await canCreateEvent(userId);
  if (!permission.allowed) {
    throw new ApiError({ title: permission.reason ?? "Forbidden", status: 403 });
  }

  const now = new Date();
  const startTime = new Date(data.startTime);
  const endTime = new Date(data.endTime);

  // Validate startTime is in the future
  if (startTime <= now) {
    throw new ApiError({ title: "Events.validation.futureDate", status: 422 });
  }

  // Validate endTime > startTime
  if (endTime <= startTime) {
    throw new ApiError({ title: "Events.validation.endAfterStart", status: 422 });
  }

  // Validate groupId required for group events
  if (data.eventType === "group" && !data.groupId) {
    throw new ApiError({ title: "Events.validation.groupRequired", status: 422 });
  }

  const durationMinutes = Math.ceil((endTime.getTime() - startTime.getTime()) / 60000);

  // For virtual/hybrid events, auto-provision a Daily.co meeting room.
  // meetingLink from input is ignored for virtual/hybrid (overwritten by Daily URL).
  const event = await dbCreateEvent({
    title: data.title,
    description: data.description ?? null,
    creatorId: userId,
    groupId: data.groupId || null,
    eventType: data.eventType,
    format: data.format,
    location: data.location ?? null,
    meetingLink: data.meetingLink || null,
    timezone: data.timezone,
    startTime,
    endTime,
    durationMinutes,
    registrationLimit: data.registrationLimit ?? null,
    recurrencePattern: data.recurrencePattern,
    status: "upcoming",
  });

  // Auto-provision Daily meeting for virtual/hybrid events
  if (data.format === "virtual" || data.format === "hybrid") {
    try {
      const { roomUrl, roomName } = await dailyVideoService.createMeeting(event.id, endTime);
      await dbUpdateEvent(event.id, userId, { meetingLink: roomUrl, dailyRoomName: roomName });
      // Keep local reference for EventBus emit below
      event.meetingLink = roomUrl;
    } catch {
      // Non-fatal: meeting link will be null; host can update manually
    }
  }

  // Generate recurrence instances if needed
  if (data.recurrencePattern !== "none") {
    await generateRecurrenceInstances(event, data.recurrencePattern, durationMinutes);
  }

  await eventBus.emit("event.created", {
    eventId: event.id,
    creatorId: userId,
    title: event.title,
    eventType: event.eventType,
    format: event.format,
    startTime: event.startTime.toISOString(),
    groupId: event.groupId ?? undefined,
    timestamp: new Date().toISOString(),
  });

  return { eventId: event.id };
}

async function generateRecurrenceInstances(
  parent: Awaited<ReturnType<typeof dbCreateEvent>>,
  pattern: "daily" | "weekly" | "monthly",
  durationMinutes: number,
): Promise<void> {
  const count = RECURRENCE_INSTANCE_COUNTS[pattern];
  const instances = [];

  for (let i = 1; i <= count; i++) {
    let instanceStart: Date;
    let instanceEnd: Date;

    if (pattern === "monthly") {
      instanceStart = new Date(parent.startTime);
      instanceStart.setMonth(instanceStart.getMonth() + i);
      instanceEnd = new Date(parent.endTime);
      instanceEnd.setMonth(instanceEnd.getMonth() + i);
    } else {
      const offsetMs = RECURRENCE_OFFSETS_MS[pattern];
      instanceStart = new Date(parent.startTime.getTime() + i * offsetMs);
      instanceEnd = new Date(parent.endTime.getTime() + i * offsetMs);
    }

    instances.push(
      dbCreateEvent({
        title: parent.title,
        description: parent.description,
        creatorId: parent.creatorId,
        groupId: parent.groupId,
        eventType: parent.eventType,
        format: parent.format,
        location: parent.location,
        meetingLink: parent.meetingLink,
        timezone: parent.timezone,
        startTime: instanceStart,
        endTime: instanceEnd,
        durationMinutes,
        registrationLimit: parent.registrationLimit,
        recurrencePattern: "none", // instances are standalone
        recurrenceParentId: parent.id,
        status: "upcoming",
      }),
    );
  }

  await Promise.all(instances);
}

export async function updateEvent(
  userId: string,
  eventId: string,
  data: UpdateEventInput,
): Promise<{ eventId: string }> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  if (event.creatorId !== userId) {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }

  // Validate date constraints when start/end times are being updated
  const now = new Date();
  if (data.startTime !== undefined) {
    const newStart = new Date(data.startTime);
    if (newStart <= now) {
      throw new ApiError({ title: "Events.validation.futureDate", status: 422 });
    }
  }
  if (data.startTime !== undefined && data.endTime !== undefined) {
    const newStart = new Date(data.startTime);
    const newEnd = new Date(data.endTime);
    if (newEnd <= newStart) {
      throw new ApiError({ title: "Events.validation.endAfterStart", status: 422 });
    }
  } else if (data.endTime !== undefined && data.startTime === undefined) {
    // Updating only endTime — validate against existing startTime
    const newEnd = new Date(data.endTime);
    if (newEnd <= event.startTime) {
      throw new ApiError({ title: "Events.validation.endAfterStart", status: 422 });
    }
  }

  const updates: Parameters<typeof dbUpdateEvent>[2] = {};

  // Require dateChangeComment and auto-compute dateChangeType when startTime changes.
  // Use plain English in ApiError title — NOT an i18n key (would show as raw string to user).
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

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description ?? null;
  if (data.format !== undefined) updates.format = data.format;
  if (data.location !== undefined) updates.location = data.location ?? null;
  if (data.meetingLink !== undefined) updates.meetingLink = data.meetingLink || null;
  if (data.timezone !== undefined) updates.timezone = data.timezone;
  if (data.startTime !== undefined) updates.startTime = new Date(data.startTime);
  if (data.endTime !== undefined) updates.endTime = new Date(data.endTime);
  if (data.registrationLimit !== undefined)
    updates.registrationLimit = data.registrationLimit ?? null;
  if (data.startTime !== undefined && data.endTime !== undefined) {
    updates.durationMinutes = Math.ceil(
      (new Date(data.endTime).getTime() - new Date(data.startTime).getTime()) / 60000,
    );
  }

  await dbUpdateEvent(eventId, userId, updates);

  await eventBus.emit("event.updated", {
    eventId,
    updatedBy: userId,
    title: event.title,
    dateChangeType: updates.dateChangeType ?? null,
    timestamp: new Date().toISOString(),
  });

  return { eventId };
}

/**
 * RSVP a user to an event. Handles waitlist logic.
 * Returns { status, waitlistPosition, attendeeCount } on success.
 * Throws ApiError 404/409/422 on failure.
 */
export async function rsvpToEvent(
  userId: string,
  eventId: string,
): Promise<{
  status: "registered" | "waitlisted";
  waitlistPosition: number | null;
  attendeeCount: number;
}> {
  const result = await dbRsvpToEvent(eventId, userId);
  if (!result.success) {
    throw new ApiError({ title: result.reason, status: result.code });
  }

  await eventBus.emit("event.rsvp", {
    eventId,
    userId,
    status: result.status,
    waitlistPosition: result.waitlistPosition,
    attendeeCount: result.attendeeCount,
    timestamp: new Date().toISOString(),
  });

  return {
    status: result.status,
    waitlistPosition: result.waitlistPosition,
    attendeeCount: result.attendeeCount,
  };
}

/**
 * Cancel a user's RSVP for an event. Triggers waitlist promotion if applicable.
 * Throws ApiError 404 if no RSVP found, 409 if already cancelled.
 */
export async function cancelEventRsvp(userId: string, eventId: string): Promise<void> {
  // Get event title for the waitlist promotion notification payload
  const event = await getEventById(eventId);
  if (!event) throw new ApiError({ title: "Event not found", status: 404 });

  const result = await dbCancelRsvp(eventId, userId);
  if (!result.success) {
    throw new ApiError({ title: result.reason, status: result.code });
  }

  await eventBus.emit("event.rsvp_cancelled", {
    eventId,
    userId,
    previousStatus: result.previousStatus,
    attendeeCount: result.attendeeCount,
    timestamp: new Date().toISOString(),
  });

  // Emit waitlist promotion event for the promoted user (if any)
  if (result.promotedUserId) {
    await eventBus.emit("event.waitlist_promoted", {
      eventId,
      promotedUserId: result.promotedUserId,
      title: event.title,
      startTime: event.startTime.toISOString(),
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Video / Attendance Service Functions ────────────────────────────────────

const JOIN_WINDOW_BEFORE_MS = 15 * 60 * 1000; // 15 minutes before start

/**
 * Issue a meeting join token for an authenticated attendee.
 * Guards: auth (caller must pass userId), RSVP eligibility, event status/time window.
 */
export async function getJoinToken(
  userId: string,
  eventId: string,
): Promise<{ token: string; roomUrl: string }> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Event not found", status: 404 });
  }
  if (event.status === "cancelled") {
    throw new ApiError({ title: "Event is cancelled", status: 403 });
  }

  const attendeeStatus = await getAttendeeStatus(eventId, userId);
  if (!attendeeStatus || !["registered", "attended"].includes(attendeeStatus.status)) {
    throw new ApiError({ title: "You must be registered to join this event", status: 403 });
  }

  // Time window: startTime - 15min to endTime
  const now = new Date();
  const earliest = new Date(event.startTime.getTime() - JOIN_WINDOW_BEFORE_MS);
  if (now < earliest || now > event.endTime) {
    throw new ApiError({ title: "Meeting is not currently available", status: 403 });
  }

  if (!event.meetingLink) {
    throw new ApiError({ title: "No meeting link for this event", status: 403 });
  }

  // Extract room name from the meetingLink URL (last path segment)
  const roomName = event.meetingLink.split("/").at(-1) ?? "";
  const isOwner = event.creatorId === userId;

  const { token } = await dailyVideoService.getMeetingToken(roomName, userId, isOwner);
  return { token, roomUrl: event.meetingLink };
}

/**
 * Mark a user as attended for an event.
 * @param source   - "video" (self-mark on join) | "manual" (host check-in)
 * @param hostUserId - Required when source==="manual"; must be event creator.
 * Idempotent: repeated calls are no-ops.
 */
export async function markAttendance(
  userId: string,
  eventId: string,
  source: "video" | "manual",
  hostUserId?: string,
): Promise<void> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Event not found", status: 404 });
  }

  if (source === "manual") {
    if (!hostUserId || event.creatorId !== hostUserId) {
      throw new ApiError({
        title: "Only the event creator can manually mark attendance",
        status: 403,
      });
    }
  }

  const result = await dbMarkAttended(eventId, userId, new Date());

  // Only emit on first transition (idempotent guard)
  if (!result.alreadyAttended) {
    await eventBus.emit("event.attended", {
      eventId,
      userId,
      hostId: event.creatorId,
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Recording Access Service Functions (Story 7.4) ─────────────────────────

const RECORDING_QUOTA_DEFAULT_BYTES = 53_687_091_200; // 50 GB

async function checkRecordingAccess(
  userId: string,
  eventId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof getEventById>>>> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Event not found", status: 404 });
  }

  const tier = await getUserMembershipTier(userId);
  if (tier !== "TOP_TIER") {
    throw new ApiError({
      title: "Events.recordings.topTierOnly",
      status: 403,
    });
  }

  const attendeeStatus = await getAttendeeStatus(eventId, userId);
  if (!attendeeStatus || !["registered", "attended"].includes(attendeeStatus.status)) {
    throw new ApiError({
      title: "You must be registered to access this recording",
      status: 403,
    });
  }

  return event;
}

/**
 * Get the playback URL for a completed event recording.
 * Requires Top-tier membership AND registered/attended status.
 */
export async function getRecordingPlaybackUrl(
  userId: string,
  eventId: string,
): Promise<{
  url: string | null;
  status: string;
  expiresAt: Date | null;
  sizeBytes: number | null;
  isPreserved: boolean;
}> {
  const event = await checkRecordingAccess(userId, eventId);

  return {
    url: event.recordingMirrorUrl ?? event.recordingUrl ?? null,
    status: event.recordingStatus,
    expiresAt: event.recordingExpiresAt ?? null,
    sizeBytes: event.recordingSizeBytes ?? null,
    isPreserved: event.recordingExpiresAt === null && event.recordingMirrorUrl !== null,
  };
}

/**
 * Generate a 1-hour presigned download URL for a recording.
 * Requires Top-tier membership AND registered/attended status.
 */
export async function getRecordingDownloadUrl(userId: string, eventId: string): Promise<string> {
  const event = await checkRecordingAccess(userId, eventId);

  if (!event.recordingMirrorUrl) {
    throw new ApiError({ title: "Recording not available for download", status: 404 });
  }

  // Extract object key from the full S3 URL
  const mirrorUrl = event.recordingMirrorUrl;
  const objectKey = mirrorUrl.replace(/^https?:\/\/[^/]+\/[^/]+\//, "recordings/");

  const s3 = getS3Client();
  const command = new GetObjectCommand({
    Bucket: env.HETZNER_S3_BUCKET,
    Key: objectKey,
  });

  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/**
 * Preserve a recording permanently (set expiresAt = NULL), subject to quota check.
 * Only event creator or admin may preserve.
 */
export async function preserveRecording(userId: string, eventId: string): Promise<void> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Event not found", status: 404 });
  }

  if (event.creatorId !== userId) {
    // Non-creators must be ADMIN with Top-tier membership
    const [tier, role] = await Promise.all([
      getUserMembershipTier(userId),
      getUserPlatformRole(userId),
    ]);
    if (tier !== "TOP_TIER" || role !== "ADMIN") {
      throw new ApiError({
        title: "Only the event creator or an admin can preserve recordings",
        status: 403,
      });
    }
  }

  if (!event.recordingMirrorUrl) {
    throw new ApiError({ title: "No mirrored recording to preserve", status: 404 });
  }

  // Quota check: sum recording_size_bytes WHERE recording_expires_at IS NULL
  const quotaBytes = await getPlatformSetting<number>(
    "recording_storage_quota_bytes",
    RECORDING_QUOTA_DEFAULT_BYTES,
  );

  const { db } = await import("@/db");
  const { communityEvents: eventsTable } = await import("@/db/schema/community-events");
  const { sql: drizzleSql, isNull: drizzleIsNull } = await import("drizzle-orm");

  const [quotaRow] = await db
    .select({ total: drizzleSql<number>`COALESCE(SUM(recording_size_bytes), 0)` })
    .from(eventsTable)
    .where(drizzleIsNull(eventsTable.recordingExpiresAt));

  const usedBytes = Number(quotaRow?.total ?? 0);
  const recordingSize = event.recordingSizeBytes ?? 0;

  if (usedBytes + recordingSize > quotaBytes) {
    throw new ApiError({
      title: "Events.recordings.quotaReached",
      status: 422,
    });
  }

  // Set expiresAt = NULL (preserved)
  await db
    .update(eventsTable)
    .set({ recordingExpiresAt: null, updatedAt: new Date() })
    .where(drizzleSql`${eventsTable.id} = ${eventId}`);
}

export async function cancelEvent(userId: string, eventId: string, reason: string): Promise<void> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  if (event.creatorId !== userId) {
    throw new ApiError({ title: "Forbidden", status: 403 });
  }

  if (event.status === "cancelled") {
    throw new ApiError({ title: "Already cancelled", status: 422 });
  }

  const cancelled = await dbCancelEvent(eventId, userId, reason);
  if (!cancelled) {
    throw new ApiError({ title: "Status conflict", status: 409 });
  }

  // Cascade: mark all registered/waitlisted attendees as cancelled
  await cancelAllEventRsvps(eventId);

  await eventBus.emit("event.cancelled", {
    eventId,
    cancelledBy: userId,
    title: event.title,
    reason,
    timestamp: new Date().toISOString(),
  });
}
