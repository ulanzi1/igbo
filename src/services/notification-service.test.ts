// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// Use vi.hoisted to capture event handlers at module-load time.
// vi.clearAllMocks() clears .mock.calls but NOT the plain Map in handlerRef.
const { handlerRef, mockEventBusOn, mockEventBusEmit } = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const mockOn = vi.fn((event: string, handler: (payload: unknown) => void) => {
    handlers.set(event, handler);
  });
  const mockEmit = vi.fn();
  return { handlerRef: { current: handlers }, mockEventBusOn: mockOn, mockEventBusEmit: mockEmit };
});

const mockCreateNotification = vi.hoisted(() => vi.fn());
const mockMarkNotificationRead = vi.hoisted(() => vi.fn());
const mockMarkAllNotificationsRead = vi.hoisted(() => vi.fn());
const mockFilterNotificationRecipients = vi.hoisted(() => vi.fn());
const mockPublish = vi.hoisted(() => vi.fn().mockResolvedValue(1));
const mockGetRedisPublisher = vi.hoisted(() => vi.fn().mockReturnValue({ publish: mockPublish }));

vi.mock("@/services/event-bus", () => ({
  eventBus: { on: mockEventBusOn, emit: mockEventBusEmit },
}));

vi.mock("@/db/queries/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
}));

vi.mock("@/services/block-service", () => ({
  filterNotificationRecipients: (...args: unknown[]) => mockFilterNotificationRecipients(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedisPublisher: () => mockGetRedisPublisher(),
}));

// Import module once — listeners are registered at load time and captured by handlerRef
import { markNotificationAsRead, markAllNotificationsAsRead } from "./notification-service";

// ─── Tests ───────────────────────────────────────────────────────────────────

const NOTIFICATION_STUB = {
  id: "notif-001",
  userId: "00000000-0000-4000-8000-000000000001",
  type: "admin_announcement" as const,
  title: "notifications.member_approved.title",
  body: "notifications.member_approved.body",
  link: "/dashboard",
  isRead: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateNotification.mockResolvedValue(NOTIFICATION_STUB);
  mockFilterNotificationRecipients.mockResolvedValue(["00000000-0000-4000-8000-000000000001"]);
  mockPublish.mockResolvedValue(1);
  mockGetRedisPublisher.mockReturnValue({ publish: mockPublish });
});

describe("notification-service module loading", () => {
  it("registers member.approved listener", () => {
    expect(handlerRef.current.has("member.approved")).toBe(true);
  });

  it("does NOT register post.reacted listener (deferred until posts exist)", () => {
    expect(handlerRef.current.has("post.reacted")).toBe(false);
  });

  it("does NOT register post.commented listener (deferred until posts exist)", () => {
    expect(handlerRef.current.has("post.commented")).toBe(false);
  });

  it("does NOT register message.sent listener (deferred until chat exists)", () => {
    expect(handlerRef.current.has("message.sent")).toBe(false);
  });

  it("registers member.followed listener", () => {
    expect(handlerRef.current.has("member.followed")).toBe(true);
  });
});

describe("deliverNotification (via listener invocation)", () => {
  it("calls filterNotificationRecipients with recipientId and actorId", async () => {
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockFilterNotificationRecipients).toHaveBeenCalledWith(
      ["00000000-0000-4000-8000-000000000001"],
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("creates a notification record with i18n message keys", async () => {
    mockFilterNotificationRecipients.mockResolvedValue(["00000000-0000-4000-8000-000000000001"]);
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000001",
        type: "admin_announcement",
        title: "notifications.member_approved.title",
        body: "notifications.member_approved.body",
      }),
    );
  });

  it("skips notification when recipient is blocked or muted", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([]);
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("publishes to Redis after creating notification", async () => {
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockPublish).toHaveBeenCalledWith("eventbus:notification.created", expect.any(String));

    const publishedPayload = JSON.parse(mockPublish.mock.calls[0]![1] as string) as {
      userId: string;
      notificationId: string;
    };
    expect(publishedPayload.userId).toBe("00000000-0000-4000-8000-000000000001");
    expect(publishedPayload.notificationId).toBe("notif-001");
  });

  it("member.followed triggers a notification for the followed user", async () => {
    const followedHandler = handlerRef.current.get("member.followed");

    await followedHandler?.({
      followerId: "00000000-0000-4000-8000-000000000002",
      followedId: "00000000-0000-4000-8000-000000000001",
      timestamp: new Date().toISOString(),
    });

    expect(mockFilterNotificationRecipients).toHaveBeenCalledWith(
      ["00000000-0000-4000-8000-000000000001"],
      "00000000-0000-4000-8000-000000000002",
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system",
        title: "notifications.new_follower.title",
      }),
    );
  });

  it("logs warning when Redis publish fails", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPublish.mockRejectedValue(new Error("Redis down"));
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("markNotificationAsRead", () => {
  it("marks notification as read and emits event", async () => {
    mockMarkNotificationRead.mockResolvedValue(true);

    const result = await markNotificationAsRead("notif-001", "user-001");

    expect(result).toBe(true);
    expect(mockMarkNotificationRead).toHaveBeenCalledWith("notif-001", "user-001");
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "notification.read",
      expect.objectContaining({
        userId: "user-001",
        notificationId: "notif-001",
      }),
    );
  });

  it("does not emit event when notification not found", async () => {
    mockMarkNotificationRead.mockResolvedValue(false);

    const result = await markNotificationAsRead("notif-999", "user-001");

    expect(result).toBe(false);
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsAsRead", () => {
  it("marks all as read and emits event with notificationId 'all'", async () => {
    mockMarkAllNotificationsRead.mockResolvedValue(undefined);

    await markAllNotificationsAsRead("user-001");

    expect(mockMarkAllNotificationsRead).toHaveBeenCalledWith("user-001");
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "notification.read",
      expect.objectContaining({
        userId: "user-001",
        notificationId: "all",
      }),
    );
  });
});
