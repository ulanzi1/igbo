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
const mockRedisExists = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetRedisPublisher = vi.hoisted(() =>
  vi.fn().mockReturnValue({ publish: mockPublish, exists: mockRedisExists }),
);
const mockGetConversationNotificationPreference = vi.hoisted(() =>
  vi.fn().mockResolvedValue("all"),
);

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

vi.mock("@/db/queries/chat-conversations", () => ({
  getConversationNotificationPreference: (...args: unknown[]) =>
    mockGetConversationNotificationPreference(...args),
}));

vi.mock("@/db/queries/groups", () => ({
  listGroupLeaders: vi.fn().mockResolvedValue([]),
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
  mockRedisExists.mockResolvedValue(0);
  mockGetRedisPublisher.mockReturnValue({ publish: mockPublish, exists: mockRedisExists });
  mockGetConversationNotificationPreference.mockResolvedValue("all");
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

describe("message.mentioned handler (Story 2.7)", () => {
  const CONV_ID = "00000000-0000-4000-8000-000000000030";
  const SENDER_ID = "00000000-0000-4000-8000-000000000002";
  const RECIPIENT_1 = "00000000-0000-4000-8000-000000000003";
  const RECIPIENT_2 = "00000000-0000-4000-8000-000000000004";

  const makeMentionPayload = (mentionedUserIds: string[]) => ({
    messageId: "00000000-0000-4000-8000-000000000010",
    conversationId: CONV_ID,
    senderId: SENDER_ID,
    mentionedUserIds,
    contentPreview: "Hey @Alice check this out",
    timestamp: new Date().toISOString(),
  });

  it("registers message.mentioned listener", () => {
    expect(handlerRef.current.has("message.mentioned")).toBe(true);
  });

  it("delivers notification for each mentioned user (no preference set — defaults to 'all')", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("all");
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: RECIPIENT_1,
        type: "mention",
      }),
    );
  });

  it("suppresses notification when conversation preference is 'muted'", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("muted");
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("delivers notification when preference is 'mentions' (it IS a mention)", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("mentions");
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: RECIPIENT_1, type: "mention" }),
    );
  });

  it("suppresses notification when DnD is active (redis.exists returns 1)", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("all");
    mockRedisExists.mockResolvedValue(1); // DnD active
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("handles 2 mentioned users: one muted, one not — only unmuted receives notification", async () => {
    mockGetConversationNotificationPreference
      .mockResolvedValueOnce("muted") // RECIPIENT_1 has muted this conversation
      .mockResolvedValueOnce("all"); // RECIPIENT_2 has no preference
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_2]);
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1, RECIPIENT_2]));

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: RECIPIENT_2 }),
    );
  });

  it("delivers notification for all mentioned users when none have preferences set", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("all");
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1, RECIPIENT_2]));

    // Called once per recipient (2 calls to getConversationNotificationPreference)
    expect(mockGetConversationNotificationPreference).toHaveBeenCalledTimes(2);
  });
});

// ─── Article Notification Tests (Story 6.2) ───────────────────────────────────

describe("article.published handler", () => {
  const AUTHOR_ID = "00000000-0000-4000-8000-000000000050";
  const ARTICLE_ID = "00000000-0000-4000-8000-000000000060";

  it("registers article.published listener", () => {
    expect(handlerRef.current.has("article.published")).toBe(true);
  });

  it("delivers notification to author with slug link", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.published");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      slug: "my-article-abc123",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: AUTHOR_ID,
        type: "admin_announcement",
        title: "notifications.article_published.title",
        body: "notifications.article_published.body",
        link: "/articles/my-article-abc123",
      }),
    );
  });

  it("uses actorId === userId (self-notify pattern bypasses block/mute)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.published");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      slug: "my-article-abc123",
      timestamp: new Date().toISOString(),
    });

    expect(mockFilterNotificationRecipients).toHaveBeenCalledWith([AUTHOR_ID], AUTHOR_ID);
  });
});

describe("article.rejected handler", () => {
  const AUTHOR_ID = "00000000-0000-4000-8000-000000000051";
  const ARTICLE_ID = "00000000-0000-4000-8000-000000000061";

  it("registers article.rejected listener", () => {
    expect(handlerRef.current.has("article.rejected")).toBe(true);
  });

  it("delivers notification with feedback text as body when feedback provided", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.rejected");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      feedback: "Please add more historical context",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: AUTHOR_ID,
        type: "admin_announcement",
        title: "notifications.article_rejected.title",
        body: "Please add more historical context",
        link: `/articles/${ARTICLE_ID}/edit`,
      }),
    );
  });

  it("uses fallback i18n body key when no feedback provided", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.rejected");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "notifications.article_rejected.body",
      }),
    );
  });
});
