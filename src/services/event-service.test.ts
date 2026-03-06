// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/db/queries/events", () => ({
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  listUpcomingEvents: vi.fn(),
  listGroupEvents: vi.fn(),
  getEventsByParentId: vi.fn(),
  rsvpToEvent: vi.fn(),
  cancelRsvp: vi.fn(),
  cancelAllEventRsvps: vi.fn(),
  getAttendeeStatus: vi.fn(),
  listPastEvents: vi.fn(),
  listMyRsvps: vi.fn(),
  markAttended: vi.fn(),
  listEventAttendees: vi.fn(),
}));

vi.mock("@/services/permissions", () => ({
  canCreateEvent: vi.fn(),
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/services/daily-video-service", () => ({
  dailyVideoService: {
    createMeeting: vi
      .fn()
      .mockResolvedValue({ roomUrl: "https://igbo.daily.co/room", roomName: "room" }),
    getMeetingToken: vi.fn().mockResolvedValue({ token: "tok" }),
  },
}));

vi.mock("@/lib/api-error", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor({ title, status }: { title: string; status: number }) {
      super(title);
      this.status = status;
    }
  },
}));

// Mocks for recording service dependencies added in Story 7.4
vi.mock("@/env", () => ({
  env: {
    HETZNER_S3_BUCKET: "test-bucket",
    HETZNER_S3_ENDPOINT: "https://s3.example.com",
    HETZNER_S3_REGION: "eu-central-1",
    HETZNER_S3_ACCESS_KEY_ID: "key",
    HETZNER_S3_SECRET_ACCESS_KEY: "secret",
    DAILY_WEBHOOK_SECRET: "",
  },
}));

vi.mock("@/lib/s3-client", () => ({
  getS3Client: vi.fn().mockReturnValue({}),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn(function GetObjectCommand(
    this: Record<string, unknown>,
    args: Record<string, unknown>,
  ) {
    Object.assign(this, args);
  }),
  S3Client: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://presigned.example.com/download"),
}));

vi.mock("@/db/queries/auth-permissions", () => ({
  getUserMembershipTier: vi.fn().mockResolvedValue("TOP_TIER"),
}));

vi.mock("@/db/queries/groups", () => ({
  getUserPlatformRole: vi.fn().mockResolvedValue("MEMBER"),
}));

vi.mock("@/db/queries/platform-settings", () => ({
  getPlatformSetting: vi.fn().mockResolvedValue(53_687_091_200),
}));

import {
  createEvent as dbCreateEvent,
  getEventById,
  rsvpToEvent as dbRsvpToEvent,
  cancelRsvp as dbCancelRsvp,
  cancelAllEventRsvps,
} from "@/db/queries/events";
import { canCreateEvent } from "@/services/permissions";
import { eventBus } from "@/services/event-bus";

const mockEvent = {
  id: "event-1",
  title: "Test Event",
  description: null,
  creatorId: "user-1",
  groupId: null,
  eventType: "general" as const,
  format: "virtual" as const,
  location: null,
  meetingLink: null,
  timezone: "UTC",
  startTime: new Date("2030-01-01T10:00:00Z"),
  endTime: new Date("2030-01-01T11:00:00Z"),
  durationMinutes: 60,
  registrationLimit: null,
  attendeeCount: 0,
  recurrencePattern: "none" as const,
  recurrenceParentId: null,
  status: "upcoming" as const,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const futureStart = new Date(Date.now() + 86400000).toISOString(); // +1 day
const futureEnd = new Date(Date.now() + 90000000).toISOString(); // +25h

describe("event-service", () => {
  beforeEach(() => {
    vi.mocked(canCreateEvent).mockReset();
    vi.mocked(dbCreateEvent).mockReset();
    vi.mocked(getEventById).mockReset();
    vi.mocked(eventBus.emit).mockReset();
    vi.mocked(dbRsvpToEvent).mockReset();
    vi.mocked(dbCancelRsvp).mockReset();
    vi.mocked(cancelAllEventRsvps).mockReset();

    vi.mocked(canCreateEvent).mockResolvedValue({ allowed: true });
    vi.mocked(dbCreateEvent).mockResolvedValue(mockEvent);
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
    vi.mocked(cancelAllEventRsvps).mockResolvedValue(undefined);
  });

  describe("createEvent", () => {
    it("throws 403 for BASIC tier user", async () => {
      vi.mocked(canCreateEvent).mockResolvedValue({
        allowed: false,
        reason: "Permissions.eventCreationRequired",
      });
      const { createEvent } = await import("./event-service");
      await expect(
        createEvent("user-1", {
          title: "Test",
          eventType: "general",
          format: "virtual",
          timezone: "UTC",
          startTime: futureStart,
          endTime: futureEnd,
          recurrencePattern: "none",
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("creates single event when recurrencePattern='none'", async () => {
      const { createEvent } = await import("./event-service");
      const result = await createEvent("user-1", {
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "none",
      });
      expect(result).toEqual({ eventId: "event-1" });
      expect(dbCreateEvent).toHaveBeenCalledTimes(1);
    });

    it("emits event.created EventBus event on success", async () => {
      const { createEvent } = await import("./event-service");
      await createEvent("user-1", {
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "none",
      });
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.created",
        expect.objectContaining({ eventId: "event-1" }),
      );
    });

    it("generates 8 instances for weekly recurrence (dbCreateEvent called 9 times)", async () => {
      const { createEvent } = await import("./event-service");
      await createEvent("user-1", {
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "weekly",
      });
      expect(dbCreateEvent).toHaveBeenCalledTimes(9); // 1 parent + 8 instances
    });

    it("generates 7 instances for daily recurrence", async () => {
      const { createEvent } = await import("./event-service");
      await createEvent("user-1", {
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "daily",
      });
      expect(dbCreateEvent).toHaveBeenCalledTimes(8); // 1 parent + 7 instances
    });

    it("generates 6 instances for monthly recurrence", async () => {
      const { createEvent } = await import("./event-service");
      await createEvent("user-1", {
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "monthly",
      });
      expect(dbCreateEvent).toHaveBeenCalledTimes(7); // 1 parent + 6 instances
    });

    it("throws 422 ApiError when startTime is in the past", async () => {
      const { createEvent } = await import("./event-service");
      await expect(
        createEvent("user-1", {
          title: "Test",
          eventType: "general",
          format: "virtual",
          timezone: "UTC",
          startTime: "2020-01-01T10:00:00.000Z",
          endTime: "2020-01-01T11:00:00.000Z",
          recurrencePattern: "none",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 ApiError when endTime <= startTime", async () => {
      const { createEvent } = await import("./event-service");
      await expect(
        createEvent("user-1", {
          title: "Test",
          eventType: "general",
          format: "virtual",
          timezone: "UTC",
          startTime: futureStart,
          endTime: new Date(new Date(futureStart).getTime() - 3600000).toISOString(),
          recurrencePattern: "none",
        }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("CreateEventSchema accepts empty string groupId (coerces to falsy for || null)", async () => {
      const { CreateEventSchema } = await import("./event-service");
      const result = CreateEventSchema.safeParse({
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "none",
        groupId: "",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // The schema allows "" — the service converts it via || null
        expect(result.data.groupId || null).toBeNull();
      }
    });

    it("passes groupId=null to DB when groupId is empty string", async () => {
      const { createEvent } = await import("./event-service");
      await createEvent("user-1", {
        title: "Test",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: futureStart,
        endTime: futureEnd,
        recurrencePattern: "none",
        groupId: "",
      });
      expect(dbCreateEvent).toHaveBeenCalledWith(expect.objectContaining({ groupId: null }));
    });
  });

  describe("updateEvent", () => {
    it("emits event.updated EventBus event on success", async () => {
      const { updateEvent: dbUpdate } = await import("@/db/queries/events");
      vi.mocked(dbUpdate).mockResolvedValue(mockEvent);
      const { updateEvent } = await import("./event-service");
      await updateEvent("user-1", "event-1", { title: "New Title" });
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.updated",
        expect.objectContaining({ eventId: "event-1" }),
      );
    });

    it("throws 404 when event not found", async () => {
      vi.mocked(getEventById).mockResolvedValue(null);
      const { updateEvent } = await import("./event-service");
      await expect(updateEvent("user-1", "nonexistent", { title: "x" })).rejects.toMatchObject({
        status: 404,
      });
    });

    it("throws 422 when updated startTime is in the past", async () => {
      const { updateEvent } = await import("./event-service");
      await expect(
        updateEvent("user-1", "event-1", { startTime: "2020-01-01T10:00:00.000Z" }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when updated endTime <= startTime", async () => {
      const { updateEvent } = await import("./event-service");
      const start = new Date(Date.now() + 86400000).toISOString();
      const end = new Date(Date.now() + 86400000 - 3600000).toISOString();
      await expect(
        updateEvent("user-1", "event-1", { startTime: start, endTime: end }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it("throws 422 when startTime changed but dateChangeComment absent", async () => {
      const { updateEvent } = await import("./event-service");
      const newStart = new Date(Date.now() + 172800000).toISOString(); // +2 days
      await expect(updateEvent("user-1", "event-1", { startTime: newStart })).rejects.toMatchObject(
        { status: 422 },
      );
    });

    it("sets dateChangeType='postponed' when new startTime is later than current", async () => {
      const { updateEvent: dbUpdate } = await import("@/db/queries/events");
      vi.mocked(dbUpdate).mockResolvedValue(mockEvent);
      const { updateEvent } = await import("./event-service");
      const newStart = new Date("2031-06-01T10:00:00Z").toISOString(); // later than mockEvent.startTime (2030-01-01)
      await updateEvent("user-1", "event-1", {
        startTime: newStart,
        dateChangeComment: "Postponed due to holidays",
      });
      expect(dbUpdate).toHaveBeenCalledWith(
        "event-1",
        "user-1",
        expect.objectContaining({ dateChangeType: "postponed" }),
      );
    });

    it("sets dateChangeType='preponed' when new startTime is earlier than current", async () => {
      const { updateEvent: dbUpdate } = await import("@/db/queries/events");
      vi.mocked(dbUpdate).mockResolvedValue(mockEvent);
      // mockEvent.startTime is 2030-01-01T10:00:00Z; newStart is in 2029
      const newStart = new Date("2029-06-01T10:00:00Z").toISOString();
      vi.mocked(getEventById).mockResolvedValue({
        ...mockEvent,
        startTime: new Date("2030-01-01T10:00:00Z"),
      });
      const { updateEvent } = await import("./event-service");
      await updateEvent("user-1", "event-1", {
        startTime: newStart,
        dateChangeComment: "Earlier slot available",
      });
      expect(dbUpdate).toHaveBeenCalledWith(
        "event-1",
        "user-1",
        expect.objectContaining({ dateChangeType: "preponed" }),
      );
    });

    it("does not set dateChangeType when startTime not in payload", async () => {
      const { updateEvent: dbUpdate } = await import("@/db/queries/events");
      vi.mocked(dbUpdate).mockResolvedValue(mockEvent);
      const { updateEvent } = await import("./event-service");
      await updateEvent("user-1", "event-1", { title: "Updated title" });
      const callArgs = vi.mocked(dbUpdate).mock.calls[0]?.[2];
      expect(callArgs).not.toHaveProperty("dateChangeType");
    });

    it("emits event.updated with dateChangeType when date changes", async () => {
      const { updateEvent: dbUpdate } = await import("@/db/queries/events");
      vi.mocked(dbUpdate).mockResolvedValue(mockEvent);
      const { updateEvent } = await import("./event-service");
      const newStart = new Date("2031-06-01T10:00:00Z").toISOString(); // later than mockEvent.startTime (2030-01-01)
      await updateEvent("user-1", "event-1", { startTime: newStart, dateChangeComment: "Delayed" });
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.updated",
        expect.objectContaining({ dateChangeType: "postponed" }),
      );
    });
  });

  describe("cancelEvent", () => {
    it("emits event.cancelled EventBus event on success", async () => {
      const { cancelEvent: dbCancel } = await import("@/db/queries/events");
      vi.mocked(dbCancel).mockResolvedValue(true);
      const { cancelEvent } = await import("./event-service");
      await cancelEvent("user-1", "event-1", "Venue unavailable");
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.cancelled",
        expect.objectContaining({ eventId: "event-1" }),
      );
    });

    it("throws 403 when userId !== event.creatorId", async () => {
      vi.mocked(getEventById).mockResolvedValue({ ...mockEvent, creatorId: "other-user" });
      const { cancelEvent } = await import("./event-service");
      await expect(cancelEvent("user-1", "event-1", "reason")).rejects.toMatchObject({
        status: 403,
      });
    });

    it("calls cancelAllEventRsvps after cancelling event", async () => {
      const { cancelEvent: dbCancel } = await import("@/db/queries/events");
      vi.mocked(dbCancel).mockResolvedValue(true);
      const { cancelEvent } = await import("./event-service");
      await cancelEvent("user-1", "event-1", "reason");
      expect(cancelAllEventRsvps).toHaveBeenCalledWith("event-1");
    });

    it("emits event.cancelled after cascading RSVP cancellations", async () => {
      const { cancelEvent: dbCancel } = await import("@/db/queries/events");
      vi.mocked(dbCancel).mockResolvedValue(true);
      const { cancelEvent } = await import("./event-service");
      await cancelEvent("user-1", "event-1", "reason");
      // cancelAllEventRsvps called before event.cancelled emit
      const cancelAllCallOrder = vi.mocked(cancelAllEventRsvps).mock.invocationCallOrder[0];
      const emitCallOrder = vi.mocked(eventBus.emit).mock.invocationCallOrder[0];
      expect(cancelAllCallOrder).toBeLessThan(emitCallOrder!);
    });

    it("passes reason to dbCancelEvent", async () => {
      const { cancelEvent: dbCancel } = await import("@/db/queries/events");
      vi.mocked(dbCancel).mockResolvedValue(true);
      const { cancelEvent } = await import("./event-service");
      await cancelEvent("user-1", "event-1", "Venue flooded");
      expect(dbCancel).toHaveBeenCalledWith("event-1", "user-1", "Venue flooded");
    });

    it("emits event.cancelled with reason in payload", async () => {
      const { cancelEvent: dbCancel } = await import("@/db/queries/events");
      vi.mocked(dbCancel).mockResolvedValue(true);
      const { cancelEvent } = await import("./event-service");
      await cancelEvent("user-1", "event-1", "Weather emergency");
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.cancelled",
        expect.objectContaining({ reason: "Weather emergency" }),
      );
    });
  });

  describe("rsvpToEvent", () => {
    it("calls dbRsvpToEvent and emits event.rsvp on success", async () => {
      vi.mocked(dbRsvpToEvent).mockResolvedValue({
        success: true,
        status: "registered",
        waitlistPosition: null,
        attendeeCount: 1,
      });
      const { rsvpToEvent } = await import("./event-service");
      const result = await rsvpToEvent("user-1", "event-1");
      expect(result).toMatchObject({ status: "registered", waitlistPosition: null });
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.rsvp",
        expect.objectContaining({ eventId: "event-1", userId: "user-1", status: "registered" }),
      );
    });

    it("throws ApiError 409 when DB returns { success: false, code: 409 }", async () => {
      vi.mocked(dbRsvpToEvent).mockResolvedValue({
        success: false,
        code: 409,
        reason: "Already registered or waitlisted for this event",
      });
      const { rsvpToEvent } = await import("./event-service");
      await expect(rsvpToEvent("user-1", "event-1")).rejects.toMatchObject({ status: 409 });
    });

    it("throws ApiError 404 when DB returns { success: false, code: 404 }", async () => {
      vi.mocked(dbRsvpToEvent).mockResolvedValue({
        success: false,
        code: 404,
        reason: "Event not found",
      });
      const { rsvpToEvent } = await import("./event-service");
      await expect(rsvpToEvent("user-1", "event-1")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("cancelEventRsvp", () => {
    it("calls dbCancelRsvp and emits event.rsvp_cancelled on success", async () => {
      vi.mocked(dbCancelRsvp).mockResolvedValue({
        success: true,
        previousStatus: "registered",
        promotedUserId: null,
        attendeeCount: 0,
      });
      const { cancelEventRsvp } = await import("./event-service");
      await cancelEventRsvp("user-1", "event-1");
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.rsvp_cancelled",
        expect.objectContaining({ eventId: "event-1", userId: "user-1" }),
      );
    });

    it("emits event.waitlist_promoted when promotedUserId is returned", async () => {
      vi.mocked(dbCancelRsvp).mockResolvedValue({
        success: true,
        previousStatus: "registered",
        promotedUserId: "promoted-user",
        attendeeCount: 5,
      });
      const { cancelEventRsvp } = await import("./event-service");
      await cancelEventRsvp("user-1", "event-1");
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.waitlist_promoted",
        expect.objectContaining({ eventId: "event-1", promotedUserId: "promoted-user" }),
      );
    });

    it("does NOT emit event.waitlist_promoted when no promoted user", async () => {
      vi.mocked(dbCancelRsvp).mockResolvedValue({
        success: true,
        previousStatus: "waitlisted",
        promotedUserId: null,
        attendeeCount: 0,
      });
      const { cancelEventRsvp } = await import("./event-service");
      await cancelEventRsvp("user-1", "event-1");
      expect(eventBus.emit).not.toHaveBeenCalledWith("event.waitlist_promoted", expect.anything());
    });

    it("throws ApiError 404 when event not found", async () => {
      vi.mocked(getEventById).mockResolvedValue(null);
      const { cancelEventRsvp } = await import("./event-service");
      await expect(cancelEventRsvp("user-1", "nonexistent")).rejects.toMatchObject({ status: 404 });
    });
  });
});
