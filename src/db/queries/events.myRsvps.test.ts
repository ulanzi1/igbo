// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
}));

vi.mock("@/env", () => ({ env: {} }));

import { db } from "@/db";

const makeRsvpRow = (overrides: Record<string, unknown> = {}) => ({
  id: "event-1",
  title: "Test Event",
  description: null,
  creatorId: "creator-1",
  groupId: null,
  eventType: "general",
  format: "virtual",
  location: null,
  meetingLink: null,
  timezone: "UTC",
  startTime: new Date("2030-06-01T10:00:00Z"),
  endTime: new Date("2030-06-01T11:00:00Z"),
  durationMinutes: 60,
  registrationLimit: null,
  attendeeCount: 3,
  recurrencePattern: "none",
  recurrenceParentId: null,
  status: "upcoming",
  dateChangeType: null,
  dateChangeComment: null,
  cancellationReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  rsvpStatus: "registered",
  waitlistPosition: null,
  ...overrides,
});

describe("listMyRsvps", () => {
  beforeEach(() => {
    vi.mocked(db.execute).mockReset();
  });

  it("returns active RSVPs with rsvpStatus 'registered'", async () => {
    const row = makeRsvpRow({ rsvpStatus: "registered" });
    vi.mocked(db.execute).mockResolvedValue([row] as unknown as Awaited<
      ReturnType<typeof db.execute>
    >);
    const { listMyRsvps } = await import("./events");
    const result = await listMyRsvps("user-1");
    expect(result[0]).toMatchObject({ rsvpStatus: "registered" });
  });

  it("returns active RSVPs with rsvpStatus 'waitlisted'", async () => {
    const row = makeRsvpRow({ rsvpStatus: "waitlisted", waitlistPosition: 2 });
    vi.mocked(db.execute).mockResolvedValue([row] as unknown as Awaited<
      ReturnType<typeof db.execute>
    >);
    const { listMyRsvps } = await import("./events");
    const result = await listMyRsvps("user-1");
    expect(result[0]).toMatchObject({ rsvpStatus: "waitlisted", waitlistPosition: 2 });
  });

  it("returns organiser-cancelled event with rsvpStatus 'cancelled'", async () => {
    const row = makeRsvpRow({
      status: "cancelled",
      rsvpStatus: "cancelled",
      cancellationReason: "Venue unavailable",
    });
    vi.mocked(db.execute).mockResolvedValue([row] as unknown as Awaited<
      ReturnType<typeof db.execute>
    >);
    const { listMyRsvps } = await import("./events");
    const result = await listMyRsvps("user-1");
    expect(result[0]).toMatchObject({ rsvpStatus: "cancelled", status: "cancelled" });
  });

  it("returns cancellationReason for cancelled event", async () => {
    const row = makeRsvpRow({
      status: "cancelled",
      rsvpStatus: "cancelled",
      cancellationReason: "Speaker cancelled",
    });
    vi.mocked(db.execute).mockResolvedValue([row] as unknown as Awaited<
      ReturnType<typeof db.execute>
    >);
    const { listMyRsvps } = await import("./events");
    const result = await listMyRsvps("user-1");
    expect(result[0]?.cancellationReason).toBe("Speaker cancelled");
  });

  it("returns dateChangeType and dateChangeComment fields", async () => {
    const row = makeRsvpRow({
      dateChangeType: "postponed",
      dateChangeComment: "Due to holidays",
    });
    vi.mocked(db.execute).mockResolvedValue([row] as unknown as Awaited<
      ReturnType<typeof db.execute>
    >);
    const { listMyRsvps } = await import("./events");
    const result = await listMyRsvps("user-1");
    expect(result[0]).toMatchObject({
      dateChangeType: "postponed",
      dateChangeComment: "Due to holidays",
    });
  });

  it("includes member with self-cancelled RSVP when organiser also cancelled (proxy match accepted)", async () => {
    const row = makeRsvpRow({
      status: "cancelled",
      rsvpStatus: "cancelled",
      cancellationReason: "Organiser cancelled after member self-cancelled",
    });
    vi.mocked(db.execute).mockResolvedValue([row] as unknown as Awaited<
      ReturnType<typeof db.execute>
    >);
    const { listMyRsvps } = await import("./events");
    const result = await listMyRsvps("user-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.cancellationReason).toBeDefined();
  });
});

describe("cancelEvent (DB function)", () => {
  beforeEach(() => {
    vi.mocked(db.update).mockReset();
  });

  it("calls db.update with cancellationReason", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "event-1" }]);
    const mockWhere = vi.fn(() => ({ returning: mockReturning }));
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as unknown as ReturnType<
      typeof db.update
    >);

    const { cancelEvent } = await import("./events");
    const result = await cancelEvent("event-1", "creator-1", "Bad weather");
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", cancellationReason: "Bad weather" }),
    );
    expect(result).toBe(true);
  });

  it("returns false when event is already cancelled (no rows updated)", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ returning: mockReturning }));
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as unknown as ReturnType<
      typeof db.update
    >);

    const { cancelEvent } = await import("./events");
    const result = await cancelEvent("event-1", "creator-1", "reason");
    expect(result).toBe(false);
  });
});
