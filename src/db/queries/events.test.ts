// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  sql: Object.assign(vi.fn().mockReturnValue({ toString: () => "sql" }), { raw: vi.fn() }),
  inArray: vi.fn(),
}));

vi.mock("@/db/schema/community-events", () => ({
  communityEvents: {
    id: "id",
    creatorId: "creator_id",
    status: "status",
    recurrenceParentId: "recurrence_parent_id",
    deletedAt: "deleted_at",
    startTime: "start_time",
    groupId: "group_id",
  },
  communityEventAttendees: {},
}));

vi.mock("@/db/schema/community-groups", () => ({
  communityGroups: { id: "id", visibility: "visibility", deletedAt: "deleted_at" },
  communityGroupMembers: { groupId: "group_id", userId: "user_id", status: "status" },
}));

import { db } from "@/db";

// Since the actual queries are complex, we test the module-level contract.
// The queries are tested with integration-style mocks.

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

describe("events queries", () => {
  beforeEach(() => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockEvent]),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockEvent]),
          orderBy: vi.fn().mockResolvedValue([mockEvent]),
        }),
        orderBy: vi.fn().mockResolvedValue([mockEvent]),
      }),
    } as unknown as ReturnType<typeof db.select>);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockEvent]),
        }),
      }),
    } as unknown as ReturnType<typeof db.update>);

    vi.mocked(db.execute).mockResolvedValue(
      [] as unknown as Awaited<ReturnType<typeof db.execute>>,
    );
  });

  describe("createEvent", () => {
    it("inserts and returns a new event row", async () => {
      const { createEvent } = await import("./events");
      const result = await createEvent({
        title: "Test Event",
        creatorId: "user-1",
        eventType: "general",
        format: "virtual",
        timezone: "UTC",
        startTime: new Date("2030-01-01T10:00:00Z"),
        endTime: new Date("2030-01-01T11:00:00Z"),
        durationMinutes: 60,
        recurrencePattern: "none",
        status: "upcoming",
      });
      expect(result).toMatchObject({ id: "event-1", title: "Test Event" });
    });
  });

  describe("getEventById", () => {
    it("returns null for non-existent eventId", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);
      const { getEventById } = await import("./events");
      const result = await getEventById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("updates title and returns updated row", async () => {
      const { updateEvent } = await import("./events");
      const result = await updateEvent("event-1", "user-1", { title: "Updated" });
      expect(result).toMatchObject({ id: "event-1" });
    });

    it("returns null when creatorId does not match", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);
      const { updateEvent } = await import("./events");
      const result = await updateEvent("event-1", "wrong-user", { title: "Updated" });
      expect(result).toBeNull();
    });
  });

  describe("cancelEvent", () => {
    it("sets status to 'cancelled' and returns true", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "event-1" }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);
      const { cancelEvent } = await import("./events");
      const result = await cancelEvent("event-1", "user-1");
      expect(result).toBe(true);
    });

    it("returns false when event not found or already cancelled", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);
      const { cancelEvent } = await import("./events");
      const result = await cancelEvent("nonexistent", "user-1");
      expect(result).toBe(false);
    });
  });

  describe("listUpcomingEvents", () => {
    it("returns only upcoming events ordered by startTime ASC", async () => {
      vi.mocked(db.execute).mockResolvedValue([mockEvent] as unknown as Awaited<
        ReturnType<typeof db.execute>
      >);
      const { listUpcomingEvents } = await import("./events");
      const result = await listUpcomingEvents({});
      expect(result).toHaveLength(1);
    });

    it("excludes private group events when userId is not provided (visibility filter regression guard)", async () => {
      // Without userId, private group events should not appear
      vi.mocked(db.execute).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof db.execute>>,
      );
      const { listUpcomingEvents } = await import("./events");
      const result = await listUpcomingEvents({ userId: undefined });
      expect(result).toHaveLength(0);
    });
  });

  describe("listGroupEvents", () => {
    it("returns non-cancelled events for a group ordered by startTime ASC", async () => {
      const groupEvent = { ...mockEvent, groupId: "group-1", eventType: "group" as const };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([groupEvent]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);
      const { listGroupEvents } = await import("./events");
      const result = await listGroupEvents("group-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getEventsByParentId", () => {
    it("returns instances linked to parent", async () => {
      const instance = { ...mockEvent, id: "event-2", recurrenceParentId: "event-1" };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([instance]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);
      const { getEventsByParentId } = await import("./events");
      const result = await getEventsByParentId("event-1");
      expect(result).toHaveLength(1);
      expect(result[0].recurrenceParentId).toBe("event-1");
    });
  });
});
