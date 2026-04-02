// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema/community-events", () => ({
  communityEvents: { id: "id", recordingUrl: "recording_url" },
  communityEventAttendees: {},
  attendeeStatusEnum: { enumValues: ["registered", "waitlisted", "attended", "cancelled"] },
}));

vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, op: "eq" })),
  and: vi.fn((...args) => ({ args, op: "and" })),
  isNull: vi.fn((col) => ({ col, op: "isNull" })),
  lte: vi.fn((col, val) => ({ col, val, op: "lte" })),
  asc: vi.fn((col) => ({ col, op: "asc" })),
  inArray: vi.fn((col, vals) => ({ col, vals, op: "inArray" })),
  sql: Object.assign(
    vi.fn((parts, ...vals) => ({ parts, vals, op: "sql" })),
    {
      raw: vi.fn((s) => s),
    },
  ),
}));

import { db } from "@/db";
import {
  setRecordingSourceUrl,
  setRecordingMirror,
  markRecordingLost,
  listExpiringRecordings,
  listExpiredRecordings,
  markRecordingWarningSent,
  listPendingMirrorRetries,
  updateMirrorRetrySchedule,
  listRegisteredAttendeeUserIds,
  getEventByRoomName,
} from "./events";

const EVENT_ID = "event-abc";
const ROOM_NAME = "igbo-evt-eventabceventabce";
const MIRROR_URL = "https://storage.example.com/recordings/event-abc/recording.mp4";
const RECORDING_URL = "https://download.daily.co/recording.mp4";

// Helper to build a chainable Drizzle update mock
function mockUpdate(returnRows: unknown[] = []) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(returnRows),
    }),
  };
}

// Helper to build chainable select mock
function mockSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.mocked(db.update).mockReset();
  vi.mocked(db.select).mockReset();
  vi.mocked(db.execute).mockReset();
});

describe("setRecordingSourceUrl", () => {
  it("sets recording_url and status to mirroring", async () => {
    vi.mocked(db.update).mockReturnValue(mockUpdate() as ReturnType<typeof db.update>);

    await setRecordingSourceUrl(EVENT_ID, RECORDING_URL);

    expect(db.update).toHaveBeenCalledTimes(1);
    const setMock = vi.mocked(db.update).mock.results[0]!.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingUrl: RECORDING_URL,
        recordingStatus: "mirroring",
      }),
    );
  });
});

describe("setRecordingMirror", () => {
  it("sets mirror fields and status to ready", async () => {
    vi.mocked(db.update).mockReturnValue(mockUpdate() as ReturnType<typeof db.update>);

    const sizeBytes = 500_000_000;
    const expiresAt = new Date("2026-06-01T00:00:00Z");

    await setRecordingMirror(EVENT_ID, MIRROR_URL, sizeBytes, expiresAt);

    const setMock = vi.mocked(db.update).mock.results[0]!.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingMirrorUrl: MIRROR_URL,
        recordingSizeBytes: sizeBytes,
        recordingExpiresAt: expiresAt,
        recordingStatus: "ready",
        recordingMirrorRetryCount: 0,
        recordingMirrorNextRetryAt: null,
      }),
    );
  });
});

describe("markRecordingLost", () => {
  it("sets status to lost and nulls URLs", async () => {
    vi.mocked(db.update).mockReturnValue(mockUpdate() as ReturnType<typeof db.update>);

    await markRecordingLost(EVENT_ID);

    const setMock = vi.mocked(db.update).mock.results[0]!.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingStatus: "lost",
        recordingUrl: null,
        recordingMirrorUrl: null,
      }),
    );
  });
});

describe("listExpiringRecordings", () => {
  it("returns events expiring within window with no warning sent", async () => {
    const fakeEvent = { id: EVENT_ID, title: "Test Event" };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([fakeEvent]),
      }),
    } as ReturnType<typeof db.select>);

    const result = await listExpiringRecordings(14);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: EVENT_ID });
  });
});

describe("listExpiredRecordings", () => {
  it("returns events with expired recordings that have a mirror URL", async () => {
    const fakeEvent = { id: EVENT_ID, recordingMirrorUrl: MIRROR_URL };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([fakeEvent]),
      }),
    } as ReturnType<typeof db.select>);

    const result = await listExpiredRecordings();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ recordingMirrorUrl: MIRROR_URL });
  });
});

describe("markRecordingWarningSent", () => {
  it("updates recording_warning_sent_at", async () => {
    vi.mocked(db.update).mockReturnValue(mockUpdate() as ReturnType<typeof db.update>);
    const ts = new Date("2026-03-01T10:00:00Z");

    await markRecordingWarningSent(EVENT_ID, ts);

    const setMock = vi.mocked(db.update).mock.results[0]!.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setMock.set).toHaveBeenCalledWith(
      expect.objectContaining({ recordingWarningSentAt: ts }),
    );
  });
});

describe("listPendingMirrorRetries", () => {
  it("returns mirroring events where retry time has passed", async () => {
    const fakeEvent = {
      id: EVENT_ID,
      recordingStatus: "mirroring",
      recordingMirrorNextRetryAt: null,
    };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([fakeEvent]),
      }),
    } as ReturnType<typeof db.select>);

    const result = await listPendingMirrorRetries();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ recordingStatus: "mirroring" });
  });
});

describe("updateMirrorRetrySchedule", () => {
  it("updates retry tracking fields", async () => {
    vi.mocked(db.update).mockReturnValue(mockUpdate() as ReturnType<typeof db.update>);
    const nextRetry = new Date(Date.now() + 6 * 60 * 60 * 1000);

    await updateMirrorRetrySchedule(EVENT_ID, nextRetry, 3);

    const setMock = vi.mocked(db.update).mock.results[0]!.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingMirrorNextRetryAt: nextRetry,
        recordingMirrorRetryCount: 3,
      }),
    );
  });
});

describe("listRegisteredAttendeeUserIds", () => {
  it("returns user IDs of registered and attended attendees", async () => {
    const rows = [{ userId: "user-1" }, { userId: "user-2" }];
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    } as ReturnType<typeof db.select>);

    const result = await listRegisteredAttendeeUserIds(EVENT_ID);
    expect(result).toEqual(["user-1", "user-2"]);
  });

  it("returns empty array when no attendees", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as ReturnType<typeof db.select>);

    const result = await listRegisteredAttendeeUserIds(EVENT_ID);
    expect(result).toEqual([]);
  });
});

describe("getEventByRoomName", () => {
  it("returns event when room_name matches", async () => {
    const fakeEvent = { id: EVENT_ID, dailyRoomName: ROOM_NAME };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([fakeEvent]),
        }),
      }),
    } as ReturnType<typeof db.select>);

    const result = await getEventByRoomName(ROOM_NAME);
    expect(result).toMatchObject({ id: EVENT_ID, dailyRoomName: ROOM_NAME });
  });

  it("returns null when no event matches", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as ReturnType<typeof db.select>);

    const result = await getEventByRoomName("unknown-room");
    expect(result).toBeNull();
  });
});
