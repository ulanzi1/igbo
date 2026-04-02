// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../index", () => ({
  db: {
    transaction: vi.fn(),
    execute: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("../schema/community-events", () => ({
  communityEvents: {},
  communityEventAttendees: {},
  attendeeStatusEnum: { enumValues: ["registered", "waitlisted", "attended", "cancelled"] },
}));

vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, op: "eq" })),
  and: vi.fn((...args) => ({ args, op: "and" })),
  isNull: vi.fn((col) => ({ col, op: "isNull" })),
  asc: vi.fn((col) => ({ col, op: "asc" })),
  sql: Object.assign(
    vi.fn((parts, ...vals) => ({ parts, vals, op: "sql" })),
    {
      raw: vi.fn((s) => s),
    },
  ),
  inArray: vi.fn((col, vals) => ({ col, vals, op: "inArray" })),
}));

import { db } from "../index";
import { markAttended, listEventAttendees } from "./events";

const EVENT_ID = "event-abc";
const USER_ID = "user-xyz";
const JOINED_AT = new Date("2030-01-01T10:00:00Z");

describe("markAttended", () => {
  beforeEach(() => {
    vi.mocked(db.transaction).mockReset();
  });

  it("returns alreadyAttended=false on first attendance (registered → attended)", async () => {
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([{ status: "registered" }]),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      return fn(tx as unknown as typeof db);
    });

    const result = await markAttended(EVENT_ID, USER_ID, JOINED_AT);
    expect(result).toEqual({ alreadyAttended: false });
  });

  it("returns alreadyAttended=true when status is already attended (idempotent)", async () => {
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([{ status: "attended" }]),
        update: vi.fn(),
      };
      return fn(tx as unknown as typeof db);
    });

    const result = await markAttended(EVENT_ID, USER_ID, JOINED_AT);
    expect(result).toEqual({ alreadyAttended: true });
  });

  it("throws when attendee row not found", async () => {
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([]), // no row
      };
      return fn(tx as unknown as typeof db);
    });

    await expect(markAttended(EVENT_ID, USER_ID, JOINED_AT)).rejects.toThrow("Attendee not found");
  });

  it("transitions waitlisted → attended (returns alreadyAttended=false)", async () => {
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    });
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([{ status: "waitlisted" }]),
        update: updateMock,
      };
      return fn(tx as unknown as typeof db);
    });

    const result = await markAttended(EVENT_ID, USER_ID, JOINED_AT);
    expect(result).toEqual({ alreadyAttended: false });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("throws when attendee status is cancelled (cannot mark cancelled as attended)", async () => {
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const tx = {
        execute: vi.fn().mockResolvedValue([{ status: "cancelled" }]),
      };
      return fn(tx as unknown as typeof db);
    });

    await expect(markAttended(EVENT_ID, USER_ID, JOINED_AT)).rejects.toThrow(
      "Cannot mark cancelled attendee as attended",
    );
  });
});

describe("listEventAttendees", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
  });

  it("returns attendees joined with profiles", async () => {
    const fakeRows = [
      { userId: USER_ID, displayName: "Ada Eze", status: "registered", joinedAt: null },
      { userId: "user-2", displayName: "Emeka Obi", status: "attended", joinedAt: JOINED_AT },
    ];

    const fakeRowsWithBadge = fakeRows.map((r) => ({ ...r, badgeType: null }));
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(fakeRowsWithBadge),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof db.select>);

    const result = await listEventAttendees(EVENT_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ userId: USER_ID, displayName: "Ada Eze" });
  });
});
