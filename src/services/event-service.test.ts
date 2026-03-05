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
}));

vi.mock("@/services/permissions", () => ({
  canCreateEvent: vi.fn(),
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn().mockResolvedValue(undefined) },
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

import { createEvent as dbCreateEvent, getEventById } from "@/db/queries/events";
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

    vi.mocked(canCreateEvent).mockResolvedValue({ allowed: true });
    vi.mocked(dbCreateEvent).mockResolvedValue(mockEvent);
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
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
  });

  describe("cancelEvent", () => {
    it("emits event.cancelled EventBus event on success", async () => {
      const { cancelEvent: dbCancel } = await import("@/db/queries/events");
      vi.mocked(dbCancel).mockResolvedValue(true);
      const { cancelEvent } = await import("./event-service");
      await cancelEvent("user-1", "event-1");
      expect(eventBus.emit).toHaveBeenCalledWith(
        "event.cancelled",
        expect.objectContaining({ eventId: "event-1" }),
      );
    });

    it("throws 403 when userId !== event.creatorId", async () => {
      vi.mocked(getEventById).mockResolvedValue({ ...mockEvent, creatorId: "other-user" });
      const { cancelEvent } = await import("./event-service");
      await expect(cancelEvent("user-1", "event-1")).rejects.toMatchObject({ status: 403 });
    });
  });
});
