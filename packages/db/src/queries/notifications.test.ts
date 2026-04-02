// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── DB Mock ────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("../schema/platform-notifications", () => ({
  platformNotifications: {
    id: "id",
    userId: "user_id",
    type: "type",
    title: "title",
    body: "body",
    link: "link",
    isRead: "is_read",
    createdAt: "created_at",
  },
}));

import {
  createNotification,
  getNotifications,
  getNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
} from "./notifications";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOTIF_ID = "00000000-0000-4000-8000-000000000002";

const mockNotification = {
  id: NOTIF_ID,
  userId: USER_ID,
  type: "system" as const,
  title: "Test",
  body: "Test body",
  link: null,
  isRead: false,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createNotification ──────────────────────────────────────────────────────

describe("createNotification", () => {
  it("inserts a notification and returns it", async () => {
    const mockReturning = vi.fn().mockResolvedValue([mockNotification]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });

    const result = await createNotification({
      userId: USER_ID,
      type: "system",
      title: "Test",
      body: "Test body",
    });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, type: "system", title: "Test" }),
    );
    expect(result).toEqual(mockNotification);
  });
});

// ─── getNotifications ────────────────────────────────────────────────────────

describe("getNotifications", () => {
  it("returns paginated notifications for a user", async () => {
    const mockLimit = vi.fn().mockResolvedValue([mockNotification]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const results = await getNotifications(USER_ID);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(results).toEqual([mockNotification]);
  });

  it("applies since filter when provided", async () => {
    const since = new Date("2025-01-01");
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    await getNotifications(USER_ID, { since });

    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(20);
  });

  it("uses custom limit when provided", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    await getNotifications(USER_ID, { limit: 5 });

    expect(mockLimit).toHaveBeenCalledWith(5);
  });
});

// ─── getNotificationById ─────────────────────────────────────────────────────

describe("getNotificationById", () => {
  it("returns notification when found", async () => {
    const mockLimit = vi.fn().mockResolvedValue([mockNotification]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getNotificationById(NOTIF_ID);

    expect(result).toEqual(mockNotification);
  });

  it("returns null when not found", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await getNotificationById(NOTIF_ID);

    expect(result).toBeNull();
  });
});

// ─── markNotificationRead ────────────────────────────────────────────────────

describe("markNotificationRead", () => {
  it("returns true when notification was updated", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: NOTIF_ID }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await markNotificationRead(NOTIF_ID, USER_ID);

    expect(result).toBe(true);
    expect(mockSet).toHaveBeenCalledWith({ isRead: true });
  });

  it("returns false when notification was not found", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    const result = await markNotificationRead(NOTIF_ID, USER_ID);

    expect(result).toBe(false);
  });
});

// ─── markAllNotificationsRead ────────────────────────────────────────────────

describe("markAllNotificationsRead", () => {
  it("updates all unread notifications for the user", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });

    await markAllNotificationsRead(USER_ID);

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ isRead: true });
    expect(mockWhere).toHaveBeenCalled();
  });
});

// ─── getUnreadCount ──────────────────────────────────────────────────────────

describe("getUnreadCount", () => {
  it("returns count of unread notifications", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ value: 2 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const count = await getUnreadCount(USER_ID);

    expect(count).toBe(2);
  });

  it("returns 0 when no unread notifications", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ value: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const count = await getUnreadCount(USER_ID);

    expect(count).toBe(0);
  });
});
