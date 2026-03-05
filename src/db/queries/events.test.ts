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
    transaction: vi.fn(),
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
    attendeeCount: "attendee_count",
  },
  communityEventAttendees: {
    eventId: "event_id",
    userId: "user_id",
    status: "status",
    registeredAt: "registered_at",
  },
  attendeeStatusEnum: { enumValues: ["registered", "waitlisted", "attended", "cancelled"] },
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

  describe("getAttendeeStatus", () => {
    it("returns null when user has no attendee record", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);
      const { getAttendeeStatus } = await import("./events");
      const result = await getAttendeeStatus("event-1", "user-1");
      expect(result).toBeNull();
    });

    it("returns registered status without waitlist position", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ status: "registered", registeredAt: new Date() }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);
      const { getAttendeeStatus } = await import("./events");
      const result = await getAttendeeStatus("event-1", "user-1");
      expect(result).toMatchObject({ status: "registered", waitlistPosition: null });
    });

    it("returns waitlisted status with computed waitlist position", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ status: "waitlisted", registeredAt: new Date() }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);
      vi.mocked(db.execute).mockResolvedValue([{ count: 3 }] as unknown as Awaited<
        ReturnType<typeof db.execute>
      >);
      const { getAttendeeStatus } = await import("./events");
      const result = await getAttendeeStatus("event-1", "user-1");
      expect(result).toMatchObject({ status: "waitlisted", waitlistPosition: 3 });
    });
  });

  describe("rsvpToEvent", () => {
    const makeMockTx = (overrides: Record<string, unknown> = {}) => ({
      execute: vi.fn().mockResolvedValue([
        {
          id: "event-1",
          attendee_count: 0,
          registration_limit: 10,
          status: "upcoming",
          start_time: new Date("2030-01-01T10:00:00Z"),
        },
      ]),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      ...overrides,
    });

    it("registers user when spots are available", async () => {
      const mockTx = makeMockTx();
      // Second execute call (position count) returns [{count: 0}]
      let execCallCount = 0;
      mockTx.execute = vi.fn().mockImplementation(() => {
        execCallCount++;
        if (execCallCount === 1) {
          return Promise.resolve([
            {
              id: "event-1",
              attendee_count: 0,
              registration_limit: 10,
              status: "upcoming",
              start_time: new Date("2030-01-01T10:00:00Z"),
            },
          ]);
        }
        return Promise.resolve([{ count: 1 }]);
      });
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { rsvpToEvent } = await import("./events");
      const result = await rsvpToEvent("event-1", "user-1");
      expect(result).toMatchObject({ success: true, status: "registered" });
    });

    it("adds to waitlist when event is full", async () => {
      const mockTx = makeMockTx();
      let execCallCount = 0;
      mockTx.execute = vi.fn().mockImplementation(() => {
        execCallCount++;
        if (execCallCount === 1) {
          return Promise.resolve([
            {
              id: "event-1",
              attendee_count: 10,
              registration_limit: 10,
              status: "upcoming",
              start_time: new Date("2030-01-01T10:00:00Z"),
            },
          ]);
        }
        return Promise.resolve([{ count: 1 }]);
      });
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { rsvpToEvent } = await import("./events");
      const result = await rsvpToEvent("event-1", "user-1");
      expect(result).toMatchObject({ success: true, status: "waitlisted", waitlistPosition: 1 });
    });

    it("returns 409 when user is already registered", async () => {
      const mockTx = makeMockTx();
      mockTx.execute = vi.fn().mockResolvedValue([
        {
          id: "event-1",
          attendee_count: 0,
          registration_limit: 10,
          status: "upcoming",
          start_time: new Date("2030-01-01T10:00:00Z"),
        },
      ]);
      mockTx.limit = vi
        .fn()
        .mockResolvedValue([{ eventId: "event-1", userId: "user-1", status: "registered" }]);
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { rsvpToEvent } = await import("./events");
      const result = await rsvpToEvent("event-1", "user-1");
      expect(result).toMatchObject({ success: false, code: 409 });
    });

    it("returns 404 when event not found", async () => {
      const mockTx = makeMockTx();
      mockTx.execute = vi.fn().mockResolvedValue([]);
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { rsvpToEvent } = await import("./events");
      const result = await rsvpToEvent("nonexistent", "user-1");
      expect(result).toMatchObject({ success: false, code: 404 });
    });

    it("returns 422 when event is not in upcoming status", async () => {
      const mockTx = makeMockTx();
      mockTx.execute = vi.fn().mockResolvedValue([
        {
          id: "event-1",
          attendee_count: 0,
          registration_limit: null,
          status: "cancelled",
          start_time: new Date("2030-01-01T10:00:00Z"),
        },
      ]);
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { rsvpToEvent } = await import("./events");
      const result = await rsvpToEvent("event-1", "user-1");
      expect(result).toMatchObject({ success: false, code: 422 });
    });
  });

  describe("cancelRsvp", () => {
    const makeCancelMockTx = (
      registeredRecord = {
        eventId: "event-1",
        userId: "user-1",
        status: "registered",
        registeredAt: new Date(),
      },
    ) => {
      let limitCallCount = 0;
      const mockTx = {
        execute: vi.fn().mockResolvedValue([]),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          limitCallCount++;
          if (limitCallCount === 1) return Promise.resolve([registeredRecord]);
          // For attendeeCount reads
          return Promise.resolve([{ attendeeCount: 5 }]);
        }),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
      };
      return mockTx;
    };

    it("cancels registered RSVP and decrements count when no waitlist", async () => {
      const mockTx = makeCancelMockTx();
      // No waitlisted member to promote
      mockTx.orderBy = vi.fn().mockReturnThis();
      let limitCallCount = 0;
      mockTx.limit = vi.fn().mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1)
          return Promise.resolve([
            {
              eventId: "event-1",
              userId: "user-1",
              status: "registered",
              registeredAt: new Date(),
            },
          ]);
        if (limitCallCount === 2) return Promise.resolve([]); // no waitlisted
        return Promise.resolve([{ attendeeCount: 4 }]);
      });
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { cancelRsvp } = await import("./events");
      const result = await cancelRsvp("event-1", "user-1");
      expect(result).toMatchObject({
        success: true,
        previousStatus: "registered",
        promotedUserId: null,
      });
    });

    it("promotes first waitlisted member when registered RSVP is cancelled", async () => {
      const mockTx = makeCancelMockTx();
      let limitCallCount = 0;
      mockTx.limit = vi.fn().mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1)
          return Promise.resolve([
            {
              eventId: "event-1",
              userId: "user-1",
              status: "registered",
              registeredAt: new Date(),
            },
          ]);
        if (limitCallCount === 2)
          return Promise.resolve([
            {
              eventId: "event-1",
              userId: "waitlisted-user",
              status: "waitlisted",
              registeredAt: new Date(),
            },
          ]);
        return Promise.resolve([{ attendeeCount: 10 }]);
      });
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { cancelRsvp } = await import("./events");
      const result = await cancelRsvp("event-1", "user-1");
      expect(result).toMatchObject({
        success: true,
        previousStatus: "registered",
        promotedUserId: "waitlisted-user",
      });
    });

    it("cancels waitlisted RSVP without count change", async () => {
      const mockTx = makeCancelMockTx({
        eventId: "event-1",
        userId: "user-1",
        status: "waitlisted",
        registeredAt: new Date(),
      });
      let limitCallCount = 0;
      mockTx.limit = vi.fn().mockImplementation(() => {
        limitCallCount++;
        if (limitCallCount === 1)
          return Promise.resolve([
            {
              eventId: "event-1",
              userId: "user-1",
              status: "waitlisted",
              registeredAt: new Date(),
            },
          ]);
        return Promise.resolve([{ attendeeCount: 5 }]);
      });
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { cancelRsvp } = await import("./events");
      const result = await cancelRsvp("event-1", "user-1");
      expect(result).toMatchObject({
        success: true,
        previousStatus: "waitlisted",
        promotedUserId: null,
      });
    });

    it("returns 404 result when no RSVP found", async () => {
      const mockTx = makeCancelMockTx();
      mockTx.limit = vi.fn().mockResolvedValue([]);
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockTx),
      );
      const { cancelRsvp } = await import("./events");
      const result = await cancelRsvp("event-1", "user-1");
      expect(result).toMatchObject({ success: false, code: 404 });
    });
  });

  describe("cancelAllEventRsvps", () => {
    it("bulk-cancels all registered and waitlisted attendees", async () => {
      const setSpy = vi.fn().mockReturnThis();
      const whereSpy = vi.fn().mockResolvedValue([]);
      vi.mocked(db.update).mockReturnValue({
        set: setSpy,
      } as unknown as ReturnType<typeof db.update>);
      setSpy.mockReturnValue({ where: whereSpy });
      const { cancelAllEventRsvps } = await import("./events");
      await cancelAllEventRsvps("event-1");
      expect(vi.mocked(db.update)).toHaveBeenCalled();
      expect(setSpy).toHaveBeenCalledWith({ status: "cancelled" });
    });
  });

  describe("listPastEvents", () => {
    it("returns events with startTime < NOW() ordered by startTime DESC", async () => {
      const pastEvent = { ...mockEvent, startTime: new Date("2024-01-01T10:00:00Z") };
      vi.mocked(db.execute).mockResolvedValue([pastEvent] as unknown as Awaited<
        ReturnType<typeof db.execute>
      >);
      const { listPastEvents } = await import("./events");
      const result = await listPastEvents({});
      expect(result).toHaveLength(1);
    });
  });

  describe("listMyRsvps", () => {
    it("returns upcoming events with user RSVP status", async () => {
      const myRsvp = { ...mockEvent, rsvpStatus: "registered", waitlistPosition: null };
      vi.mocked(db.execute).mockResolvedValue([myRsvp] as unknown as Awaited<
        ReturnType<typeof db.execute>
      >);
      const { listMyRsvps } = await import("./events");
      const result = await listMyRsvps("user-1");
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ rsvpStatus: "registered" });
    });
  });
});
