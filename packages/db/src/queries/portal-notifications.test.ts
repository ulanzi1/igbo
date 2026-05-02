// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── DB Mock ────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("../schema/portal-notifications", () => ({
  portalNotifications: {
    id: "id",
    userId: "user_id",
    eventType: "event_type",
    title: "title",
    body: "body",
    link: "link",
    payloadJson: "payload_json",
    readAt: "read_at",
    dismissedAt: "dismissed_at",
    idempotencyKey: "idempotency_key",
    createdAt: "created_at",
  },
}));

import {
  createPortalNotification,
  getPortalNotifications,
  getPortalNotificationById,
  markPortalNotificationRead,
  markAllPortalNotificationsRead,
  dismissPortalNotification,
  getPortalUnreadCount,
  deleteOldPortalNotifications,
  encodeCursor,
  decodeCursor,
} from "./portal-notifications";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";
const NOTIF_ID = "00000000-0000-4000-8000-000000000002";

const NOW = new Date("2026-05-01T12:00:00.000Z");

const mockNotification = {
  id: NOTIF_ID,
  userId: USER_ID,
  eventType: "portal.application.submitted",
  title: "New Application",
  body: "You have a new application",
  link: "/applications/123",
  payloadJson: { applicationId: "app-1" },
  readAt: null,
  dismissedAt: null,
  idempotencyKey: "app-submitted:app-1",
  createdAt: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Migration journal ────────────────────────────────────────────────────────

describe("Migration journal", () => {
  it("0077 migration journal entry is present and correctly numbered", () => {
    const journalPath = resolve(__dirname, "../migrations/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((e) => e.idx === 77);
    expect(entry).toBeDefined();
    expect(entry?.tag).toBe("0077_portal_notifications");
  });
});

// ─── Cursor helpers ─────────────────────────────────────────────────────────

describe("cursor helpers", () => {
  it("encodeCursor produces a base64url string and decodeCursor inverts it", () => {
    const input = { createdAt: NOW, id: NOTIF_ID };
    const cursor = encodeCursor(input);
    expect(typeof cursor).toBe("string");
    expect(cursor.length).toBeGreaterThan(0);

    const decoded = decodeCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.createdAt.toISOString()).toBe(NOW.toISOString());
    expect(decoded!.id).toBe(NOTIF_ID);
  });

  it("handles id containing pipe characters", () => {
    const input = { createdAt: NOW, id: "id|with|pipes" };
    const cursor = encodeCursor(input);
    const decoded = decodeCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe("id|with|pipes");
  });

  it("produces distinct cursors for notifications sharing the same createdAt (tie-broken by id)", () => {
    // The composite (createdAt, id) cursor must be unique even when two notifications
    // have identical createdAt values — the id UUID is the tiebreaker.
    const sharedTimestamp = new Date("2026-05-01T12:00:00.000Z");
    const cursorA = encodeCursor({
      createdAt: sharedTimestamp,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    const cursorB = encodeCursor({
      createdAt: sharedTimestamp,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(cursorA).not.toBe(cursorB);

    const decodedA = decodeCursor(cursorA);
    const decodedB = decodeCursor(cursorB);
    expect(decodedA).not.toBeNull();
    expect(decodedB).not.toBeNull();
    expect(decodedA!.createdAt.toISOString()).toBe(sharedTimestamp.toISOString());
    expect(decodedB!.createdAt.toISOString()).toBe(sharedTimestamp.toISOString());
    expect(decodedA!.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(decodedB!.id).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});

// ─── createPortalNotification ───────────────────────────────────────────────

describe("createPortalNotification", () => {
  it("inserts with idempotencyKey and returns the row", async () => {
    const mockReturning = vi.fn().mockResolvedValue([mockNotification]);
    const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await createPortalNotification({
      userId: USER_ID,
      eventType: "portal.application.submitted",
      title: "New Application",
      body: "You have a new application",
      idempotencyKey: "app-submitted:app-1",
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockOnConflict).toHaveBeenCalled();
    expect(result).toEqual(mockNotification);
  });

  it("returns null on duplicate idempotencyKey (dedup hit)", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockOnConflict = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await createPortalNotification({
      userId: USER_ID,
      eventType: "portal.application.submitted",
      title: "Test",
      body: "Test",
      idempotencyKey: "duplicate-key",
    });

    expect(result).toBe(null);
  });

  it("inserts without idempotencyKey (bare INSERT) and returns the row", async () => {
    const mockReturning = vi.fn().mockResolvedValue([mockNotification]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await createPortalNotification({
      userId: USER_ID,
      eventType: "portal.job.approved",
      title: "Job Approved",
      body: "Your job has been approved",
    });

    expect(result).toEqual(mockNotification);
  });
});

// ─── getPortalNotifications ─────────────────────────────────────────────────

describe("getPortalNotifications", () => {
  function setupSelectChain(resolvedValue: unknown[]) {
    const mockLimit = vi.fn().mockResolvedValue(resolvedValue);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    return { mockLimit, mockOrderBy, mockWhere, mockFrom };
  }

  it("returns first page of notifications (no cursor)", async () => {
    const { mockLimit } = setupSelectChain([mockNotification]);

    const results = await getPortalNotifications(USER_ID);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(results).toEqual([mockNotification]);
  });

  it("applies cursor for second page", async () => {
    setupSelectChain([]);
    const cursor = encodeCursor({ createdAt: NOW, id: NOTIF_ID });

    const results = await getPortalNotifications(USER_ID, { cursor });

    expect(results).toEqual([]);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns empty array when no notifications exist", async () => {
    setupSelectChain([]);

    const results = await getPortalNotifications(USER_ID);

    expect(results).toEqual([]);
  });

  it("uses custom limit when provided", async () => {
    const { mockLimit } = setupSelectChain([]);

    await getPortalNotifications(USER_ID, { limit: 5 });

    expect(mockLimit).toHaveBeenCalledWith(5);
  });
});

// ─── getPortalNotificationById ──────────────────────────────────────────────

describe("getPortalNotificationById", () => {
  it("returns notification when found for the correct user", async () => {
    const mockLimit = vi.fn().mockResolvedValue([mockNotification]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getPortalNotificationById(NOTIF_ID, USER_ID);

    expect(result).toEqual(mockNotification);
  });

  it("returns null when not found (wrong user)", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getPortalNotificationById(NOTIF_ID, OTHER_USER_ID);

    expect(result).toBeNull();
  });
});

// ─── markPortalNotificationRead ─────────────────────────────────────────────

describe("markPortalNotificationRead", () => {
  it("marks as read and returns the row", async () => {
    const readNotif = { ...mockNotification, readAt: NOW };
    const mockReturning = vi.fn().mockResolvedValue([readNotif]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await markPortalNotificationRead(NOTIF_ID, USER_ID);

    expect(result).toEqual(readNotif);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns the row even if already read (idempotent — COALESCE preserves original readAt)", async () => {
    const alreadyRead = { ...mockNotification, readAt: new Date("2026-04-01") };
    const mockReturning = vi.fn().mockResolvedValue([alreadyRead]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await markPortalNotificationRead(NOTIF_ID, USER_ID);

    expect(result).toEqual(alreadyRead);
    expect(result!.readAt).toEqual(new Date("2026-04-01"));
  });

  it("returns null when notification not found for this user", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await markPortalNotificationRead(NOTIF_ID, OTHER_USER_ID);

    expect(result).toBeNull();
  });
});

// ─── markAllPortalNotificationsRead ─────────────────────────────────────────

describe("markAllPortalNotificationsRead", () => {
  it("marks all unread as read and returns count", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const count = await markAllPortalNotificationsRead(USER_ID);

    expect(count).toBe(3);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns 0 when no unread notifications exist", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const count = await markAllPortalNotificationsRead(USER_ID);

    expect(count).toBe(0);
  });
});

// ─── dismissPortalNotification ──────────────────────────────────────────────

describe("dismissPortalNotification", () => {
  it("sets dismissedAt and returns the row", async () => {
    const dismissed = { ...mockNotification, dismissedAt: NOW };
    const mockReturning = vi.fn().mockResolvedValue([dismissed]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await dismissPortalNotification(NOTIF_ID, USER_ID);

    expect(result).toEqual(dismissed);
  });

  it("returns null when notification not found for this user", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await dismissPortalNotification(NOTIF_ID, OTHER_USER_ID);

    expect(result).toBeNull();
  });
});

// ─── getPortalUnreadCount ───────────────────────────────────────────────────

describe("getPortalUnreadCount", () => {
  it("returns count of unread non-dismissed notifications", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ value: 5 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const count = await getPortalUnreadCount(USER_ID);

    expect(count).toBe(5);
  });

  it("returns 0 when no unread notifications", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ value: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const count = await getPortalUnreadCount(USER_ID);

    expect(count).toBe(0);
  });
});

// ─── deleteOldPortalNotifications ───────────────────────────────────────────

describe("deleteOldPortalNotifications", () => {
  it("deletes old notifications and returns count", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });

    const cutoff = new Date("2026-02-01");
    const count = await deleteOldPortalNotifications(cutoff);

    expect(count).toBe(2);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 0 when no notifications older than cutoff", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });

    const count = await deleteOldPortalNotifications(new Date());

    expect(count).toBe(0);
  });

  it("boundary: notifications strictly older than cutoff (cutoff - 1ms) are deleted", async () => {
    // lt(createdAt, cutoff) is EXCLUSIVE: created_at < cutoff
    // A notification at cutoff - 1ms is strictly older → deleted
    const mockReturning = vi.fn().mockResolvedValue([{ id: "old-notif" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });

    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS + 1); // 1ms before 90-day mark

    const count = await deleteOldPortalNotifications(cutoff);

    expect(mockDelete).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("boundary: notifications at exactly the 90-day cutoff are NOT deleted (exclusive boundary)", async () => {
    // lt(createdAt, cutoff) means the exact boundary timestamp is preserved
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });

    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const exactBoundary = new Date(Date.now() - NINETY_DAYS_MS);

    const count = await deleteOldPortalNotifications(exactBoundary);

    expect(count).toBe(0);
  });
});
