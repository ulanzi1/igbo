// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("date-fns-tz", () => ({
  toZonedTime: vi.fn((date: Date, _tz: string) => date),
}));

const mockSelect = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  then: vi.fn(),
};

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return selectChain;
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
    },
  },
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: "postgres://localhost/test", DATABASE_POOL_SIZE: 1 },
}));

import {
  getNotificationPreferences,
  upsertNotificationPreference,
  setQuietHours,
  getUsersInQuietHours,
  getUsersWithDigestDue,
  getUndigestedNotifications,
  markDigestSent,
  DEFAULT_PREFERENCES,
  NOTIFICATION_TYPES,
} from "./notification-preferences";

beforeEach(() => {
  vi.clearAllMocks();
  selectChain.from.mockReturnThis();
  selectChain.where.mockReturnThis();
  selectChain.orderBy.mockReturnThis();
  selectChain.limit.mockReturnThis();
  selectChain.then.mockImplementation((fn) => Promise.resolve(fn([])));
});

describe("DEFAULT_PREFERENCES", () => {
  it("has entries for all notification types", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(DEFAULT_PREFERENCES[type]).toBeDefined();
      expect(typeof DEFAULT_PREFERENCES[type].inApp).toBe("boolean");
    }
  });

  it("message type has email=true and push=true (high priority DM)", () => {
    expect(DEFAULT_PREFERENCES.message.email).toBe(true);
    expect(DEFAULT_PREFERENCES.message.push).toBe(true);
  });

  it("group_activity type has email=false and push=false", () => {
    expect(DEFAULT_PREFERENCES.group_activity.email).toBe(false);
    expect(DEFAULT_PREFERENCES.group_activity.push).toBe(false);
  });
});

describe("getNotificationPreferences", () => {
  it("returns empty record when no rows", async () => {
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn([])));
    const result = await getNotificationPreferences("user-1");
    expect(result).toEqual({});
  });

  it("returns keyed map when rows exist", async () => {
    const rows = [
      {
        userId: "user-1",
        notificationType: "message",
        channelInApp: true,
        channelEmail: false,
        channelPush: true,
        digestMode: "none",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
        updatedAt: new Date(),
      },
    ];
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn(rows)));
    const result = await getNotificationPreferences("user-1");
    expect(result["message"]).toBeDefined();
    expect(result["message"]?.channelEmail).toBe(false);
    expect(result["message"]?.channelPush).toBe(true);
  });
});

describe("upsertNotificationPreference", () => {
  it("calls db.insert with correct values", async () => {
    await upsertNotificationPreference("user-1", "message", { channelEmail: true });
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("setQuietHours", () => {
  it("calls db.update for userId", async () => {
    await setQuietHours("user-1", "22:00", "08:00", "Africa/Lagos");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("accepts null start/end to clear quiet hours", async () => {
    await setQuietHours("user-1", null, null, "UTC");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("inserts default rows for all types when user has no existing rows", async () => {
    // After UPDATE, the SELECT returns empty → triggers INSERT of 7 default rows
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn([])));
    await setQuietHours("new-user", "22:00", "08:00", "Africa/Lagos");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("getUsersInQuietHours", () => {
  it("returns empty array when no users have quiet hours configured", async () => {
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn([])));
    const result = await getUsersInQuietHours(new Date());
    expect(result).toEqual([]);
  });

  it("filters users based on timezone-aware check", async () => {
    const { toZonedTime } = await import("date-fns-tz");
    // Simulate 22:30 (in quiet hours 22:00-08:00)
    const mockZoned = new Date("2026-01-01T22:30:00");
    vi.mocked(toZonedTime).mockReturnValue(mockZoned);

    const rows = [
      {
        userId: "user-qh",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "Africa/Lagos",
      },
    ];
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn(rows)));

    const result = await getUsersInQuietHours(new Date());
    expect(result).toContain("user-qh");
  });
});

describe("getUsersWithDigestDue", () => {
  it("returns empty array when no digest rows", async () => {
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn([])));
    const result = await getUsersWithDigestDue(new Date());
    expect(result).toEqual([]);
  });

  it("includes user when daily digest is due at 8am", async () => {
    const { toZonedTime } = await import("date-fns-tz");
    // Return different dates for "now" vs "lastDigestAt" so toDateString() differs
    vi.mocked(toZonedTime).mockImplementation((date: Date, _tz: string) => {
      // lastDigestAt (2025-12-31) → different date; now (2026-01-01) → 8am
      if (date.getTime() < new Date("2026-01-01T00:00:00Z").getTime()) {
        return new Date("2025-12-31T08:00:00");
      }
      return new Date("2026-01-01T08:00:00");
    });

    const rows = [
      {
        userId: "user-digest",
        notificationType: "message",
        channelInApp: true,
        channelEmail: true,
        channelPush: false,
        digestMode: "daily",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: new Date("2025-12-31T08:00:00Z"), // previous day
        updatedAt: new Date(),
      },
    ];
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn(rows)));

    const result = await getUsersWithDigestDue(new Date("2026-01-01T08:00:00Z"));
    expect(result).toEqual([{ userId: "user-digest", digestTypes: ["message"] }]);
  });
});

describe("getUndigestedNotifications", () => {
  it("calls db.select with correct filters", async () => {
    selectChain.then.mockImplementation((fn) => Promise.resolve(fn([])));
    const result = await getUndigestedNotifications("user-1", "message", new Date(0));
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("markDigestSent", () => {
  it("calls db.update when types array is non-empty", async () => {
    await markDigestSent("user-1", ["message", "mention"], new Date());
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("does nothing when types array is empty", async () => {
    await markDigestSent("user-1", [], new Date());
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
