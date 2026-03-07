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
const mockFindUserById = vi.hoisted(() => vi.fn());
const mockEnqueueEmailJob = vi.hoisted(() => vi.fn());

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
  getRedisClient: () => mockGetRedisPublisher(), // router uses getRedisClient for DnD check
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  getConversationNotificationPreference: (...args: unknown[]) =>
    mockGetConversationNotificationPreference(...args),
}));

vi.mock("@/db/queries/groups", () => ({
  listGroupLeaders: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  findUserByEmail: vi.fn(),
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: (...args: unknown[]) => mockEnqueueEmailJob(...args),
  emailService: { send: vi.fn() },
}));

const mockSendPushNotifications = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/push-service", () => ({
  sendPushNotifications: (...args: unknown[]) => mockSendPushNotifications(...args),
}));

const mockGetEventById = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/events", () => ({
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  getAttendeeStatus: vi.fn(),
  rsvpToEvent: vi.fn(),
  cancelRsvp: vi.fn(),
  cancelAllEventRsvps: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  cancelEvent: vi.fn(),
  markAttended: vi.fn(),
  listEventAttendees: vi.fn(),
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
  mockFindUserById.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000050",
    email: "author@example.com",
    name: "Test Author",
    languagePreference: "en",
  });
  mockEnqueueEmailJob.mockReturnValue(undefined);
  mockSendPushNotifications.mockResolvedValue(undefined);
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

  it("registers message.sent listener (Story 9.2 — first-DM email)", () => {
    expect(handlerRef.current.has("message.sent")).toBe(true);
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

  it("DnD active — in-app still delivered (behavior change: DnD now only suppresses email/push)", async () => {
    // Story 9.1: DnD (quiet hours) moved into NotificationRouter. Router suppresses email/push
    // but in-app is ALWAYS delivered (AC3). Previously, DnD suppressed all delivery.
    mockGetConversationNotificationPreference.mockResolvedValue("all");
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    mockRedisExists.mockResolvedValue(1); // DnD active
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    // In-app notification IS created even when DnD is active (silent accumulation)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: RECIPIENT_1, type: "mention" }),
    );
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

  it("uses actorId === userId (self-notify pattern bypasses block/mute — router skips filter)", async () => {
    // Story 9.1: self-notify bypass now happens inside NotificationRouter.
    // When actorId === userId, filterNotificationRecipients is NOT called at all.
    mockFilterNotificationRecipients.mockResolvedValue([]);
    const handler = handlerRef.current.get("article.published");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      slug: "my-article-abc123",
      timestamp: new Date().toISOString(),
    });

    // Block filter is bypassed entirely for self-notify — notification still created
    expect(mockFilterNotificationRecipients).not.toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: AUTHOR_ID }),
    );
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

  it("calls enqueueEmailJob with article-rejected template when user has email", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.rejected");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      feedback: "Needs more detail",
      timestamp: new Date().toISOString(),
    });

    expect(mockFindUserById).toHaveBeenCalledWith(AUTHOR_ID);
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining(`article-rejected-${ARTICLE_ID}`),
      expect.objectContaining({
        to: "author@example.com",
        templateId: "article-rejected",
        data: expect.objectContaining({
          title: "My Article",
          feedback: "Needs more detail",
        }) as unknown,
      }),
    );
  });
});

// ─── Article Published Email Tests (Story 6.4) ───────────────────────────────

describe("article.published handler — email (Story 6.4)", () => {
  const AUTHOR_ID = "00000000-0000-4000-8000-000000000050";
  const ARTICLE_ID = "00000000-0000-4000-8000-000000000060";

  it("calls enqueueEmailJob with article-published template when user has email", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.published");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Published Article",
      slug: "my-published-article",
      timestamp: new Date().toISOString(),
    });

    expect(mockFindUserById).toHaveBeenCalledWith(AUTHOR_ID);
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining(`article-published-${ARTICLE_ID}`),
      expect.objectContaining({
        to: "author@example.com",
        templateId: "article-published",
        data: expect.objectContaining({ title: "My Published Article" }) as unknown,
      }),
    );
  });

  it("does NOT call enqueueEmailJob when findUserById returns null", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    mockFindUserById.mockResolvedValue(null);
    const handler = handlerRef.current.get("article.published");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      slug: "my-article",
      timestamp: new Date().toISOString(),
    });

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });
});

// ─── Article Revision Requested Tests (Story 6.4) ────────────────────────────

describe("article.revision_requested handler", () => {
  const AUTHOR_ID = "00000000-0000-4000-8000-000000000052";
  const ARTICLE_ID = "00000000-0000-4000-8000-000000000062";

  it("registers article.revision_requested listener", () => {
    expect(handlerRef.current.has("article.revision_requested")).toBe(true);
  });

  it("calls deliverNotification with feedback as body", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    const handler = handlerRef.current.get("article.revision_requested");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      feedback: "Please add citations",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: AUTHOR_ID,
        type: "admin_announcement",
        title: "notifications.article_revision_requested.title",
        body: "Please add citations",
        link: `/articles/${ARTICLE_ID}/edit`,
      }),
    );
  });

  it("calls enqueueEmailJob with article-revision-requested template when user has email", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    mockFindUserById.mockResolvedValue({
      id: AUTHOR_ID,
      email: "author2@example.com",
      name: "Author Two",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("article.revision_requested");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      feedback: "Please add citations",
      timestamp: new Date().toISOString(),
    });

    expect(mockFindUserById).toHaveBeenCalledWith(AUTHOR_ID);
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining(`article-revision-${ARTICLE_ID}`),
      expect.objectContaining({
        to: "author2@example.com",
        templateId: "article-revision-requested",
        data: expect.objectContaining({
          title: "My Article",
          feedback: "Please add citations",
        }) as unknown,
      }),
    );
  });

  it("does NOT call enqueueEmailJob when findUserById returns null", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    mockFindUserById.mockResolvedValue(null);
    const handler = handlerRef.current.get("article.revision_requested");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      feedback: "Please add citations",
      timestamp: new Date().toISOString(),
    });

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });
});

describe("event.waitlist_promoted handler", () => {
  const PROMOTED_USER_ID = "00000000-0000-4000-8000-000000000099";
  const EVENT_ID = "00000000-0000-4000-8000-000000000088";

  it("registers event.waitlist_promoted listener", () => {
    expect(handlerRef.current.has("event.waitlist_promoted")).toBe(true);
  });

  it("calls createNotification with event_reminder type and promoted user as recipient", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([PROMOTED_USER_ID]);
    const handler = handlerRef.current.get("event.waitlist_promoted");

    await handler?.({
      eventId: EVENT_ID,
      promotedUserId: PROMOTED_USER_ID,
      title: "Community Night Out",
      startTime: new Date("2030-06-15T18:00:00Z").toISOString(),
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PROMOTED_USER_ID,
        type: "event_reminder",
        title: "notifications.event_waitlist_promoted.title",
        body: "Community Night Out",
        link: `/events/${EVENT_ID}`,
      }),
    );
  });
});

describe("event.reminder handler", () => {
  const ATTENDEE_USER_ID = "00000000-0000-4000-8000-000000000077";
  const EVENT_ID = "00000000-0000-4000-8000-000000000088";

  it("registers event.reminder listener", () => {
    expect(handlerRef.current.has("event.reminder")).toBe(true);
  });

  it("delivers event_reminder notification to the attendee", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([ATTENDEE_USER_ID]);
    const handler = handlerRef.current.get("event.reminder");

    await handler?.({
      eventId: EVENT_ID,
      userId: ATTENDEE_USER_ID,
      title: "Community Night Out",
      startTime: new Date("2030-06-15T18:00:00Z").toISOString(),
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ATTENDEE_USER_ID,
        type: "event_reminder",
        title: "notifications.event_reminder.title",
        body: "Community Night Out",
        link: `/events/${EVENT_ID}`,
      }),
    );
  });
});

describe("recording.mirror_failed handler", () => {
  const CREATOR_ID = "00000000-0000-4000-8000-000000000033";
  const EVENT_ID = "00000000-0000-4000-8000-000000000088";

  it("registers recording.mirror_failed listener", () => {
    expect(handlerRef.current.has("recording.mirror_failed")).toBe(true);
  });

  it("notifies creator when recording mirror fails", async () => {
    mockGetEventById.mockResolvedValue({
      id: EVENT_ID,
      creatorId: CREATOR_ID,
      title: "Dev Summit",
    });
    mockFilterNotificationRecipients.mockResolvedValue([CREATOR_ID]);
    const handler = handlerRef.current.get("recording.mirror_failed");

    await handler?.({ eventId: EVENT_ID, retryCount: 20, timestamp: new Date().toISOString() });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CREATOR_ID,
        type: "system",
        title: "notifications.recording_failed.title",
        body: "Dev Summit",
        link: `/events/${EVENT_ID}`,
      }),
    );
  });

  it("is a no-op when event not found", async () => {
    mockGetEventById.mockResolvedValue(null);
    const handler = handlerRef.current.get("recording.mirror_failed");
    await handler?.({ eventId: "unknown", retryCount: 20, timestamp: new Date().toISOString() });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

describe("recording.expiring_warning handler", () => {
  const CREATOR_ID = "00000000-0000-4000-8000-000000000033";
  const EVENT_ID = "00000000-0000-4000-8000-000000000088";

  it("registers recording.expiring_warning listener", () => {
    expect(handlerRef.current.has("recording.expiring_warning")).toBe(true);
  });

  it("notifies creator when recording is about to expire", async () => {
    mockGetEventById.mockResolvedValue({
      id: EVENT_ID,
      creatorId: CREATOR_ID,
      title: "Dev Summit",
    });
    mockFilterNotificationRecipients.mockResolvedValue([CREATOR_ID]);
    const handler = handlerRef.current.get("recording.expiring_warning");
    const expiresAt = new Date("2026-04-01T00:00:00Z");

    await handler?.({
      eventId: EVENT_ID,
      title: "Dev Summit",
      expiresAt: expiresAt.toISOString(),
      daysRemaining: 14,
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CREATOR_ID,
        type: "system",
        title: "notifications.recording_expiring.title",
        body: "Dev Summit",
        link: `/events/${EVENT_ID}`,
      }),
    );
  });

  it("is a no-op when event not found", async () => {
    mockGetEventById.mockResolvedValue(null);
    const handler = handlerRef.current.get("recording.expiring_warning");
    await handler?.({
      eventId: "unknown",
      title: "x",
      expiresAt: new Date().toISOString(),
      daysRemaining: 14,
      timestamp: new Date().toISOString(),
    });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

// ─── Story 9.1 Regression Tests (NotificationRouter integration) ──────────────

describe("Story 9.1 regression — NotificationRouter integration", () => {
  const CONV_ID = "00000000-0000-4000-8000-000000000030";
  const SENDER_ID = "00000000-0000-4000-8000-000000000002";
  const RECIPIENT_1 = "00000000-0000-4000-8000-000000000003";

  const makeMentionPayload = (mentionedUserIds: string[]) => ({
    messageId: "00000000-0000-4000-8000-000000000010",
    conversationId: CONV_ID,
    senderId: SENDER_ID,
    mentionedUserIds,
    contentPreview: "Hey @Alice check this out",
    timestamp: new Date().toISOString(),
  });

  it("R1. DnD suppresses email but in-app still created for message.mentioned", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("all");
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    mockRedisExists.mockResolvedValue(1); // DnD active
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    // In-app: always delivered (createNotification called)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: RECIPIENT_1, type: "mention" }),
    );
    expect(mockPublish).toHaveBeenCalledWith("eventbus:notification.created", expect.any(String));
  });

  it("R2. per-conversation 'muted' suppresses in-app AND email for message.mentioned", async () => {
    mockGetConversationNotificationPreference.mockResolvedValue("muted");
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    const handler = handlerRef.current.get("message.mentioned");

    await handler?.(makeMentionPayload([RECIPIENT_1]));

    // All channels suppressed — no notification created
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalledWith(
      "eventbus:notification.created",
      expect.any(String),
    );
  });

  it("R3. block filter still suppresses in-app for deliverNotification() (regression guard)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([]); // blocked
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("R4. points.throttled EventBus event triggers notification delivery through router", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_1]);
    const handler = handlerRef.current.get("points.throttled");

    // Handler must be registered (inside HMR guard block)
    expect(handler).toBeDefined();

    await handler?.({
      userId: RECIPIENT_1,
      actionType: "rapid_fire",
      eventType: "post.reacted",
      eventId: "post-abc",
      timestamp: new Date().toISOString(),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: RECIPIENT_1,
        type: "system",
        title: "notifications.points_throttled.title",
        body: "notifications.points_throttled.body",
        link: "/points",
      }),
    );
  });
});

// ─── Story 9.2: Email dispatch in deliverNotification() ────────────────────────

describe("Story 9.2 — email dispatch via deliverNotification()", () => {
  const USER_ID = "00000000-0000-4000-8000-000000000001";
  const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
  const EVENT_ID = "00000000-0000-4000-8000-000000000088";

  it("E1. enqueues email when router says email not suppressed AND user has email AND template exists", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(0); // no DnD
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      email: "test@example.com",
      name: "Test User",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("event.reminder");

    await handler?.({
      eventId: EVENT_ID,
      userId: USER_ID,
      title: "Igbo Language Class",
      startTime: "2026-03-15T14:00:00Z",
      reminderType: "24h",
      timestamp: new Date().toISOString(),
    });

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining(`notif-event_reminder-${USER_ID}`),
      expect.objectContaining({
        to: "test@example.com",
        templateId: "notification-event-reminder",
        data: expect.objectContaining({ name: "Test User" }) as unknown,
        locale: "en",
      }),
    );
  });

  it("E2. does NOT enqueue email when router says email suppressed (DnD active)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(1); // DnD active
    const handler = handlerRef.current.get("event.reminder");

    await handler?.({
      eventId: EVENT_ID,
      userId: USER_ID,
      title: "Igbo Language Class",
      startTime: "2026-03-15T14:00:00Z",
      reminderType: "24h",
      timestamp: new Date().toISOString(),
    });

    // email suppressed by DnD — enqueueEmailJob NOT called for the notification channel
    // (may be called for article direct-sends but not for this event_reminder via deliverNotification)
    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls).toHaveLength(0);
  });

  it("E3. does NOT enqueue email when user has no email (null)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      email: null,
      name: "Test User",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("event.reminder");

    await handler?.({
      eventId: EVENT_ID,
      userId: USER_ID,
      title: "Igbo Language Class",
      startTime: "2026-03-15T14:00:00Z",
      reminderType: "24h",
      timestamp: new Date().toISOString(),
    });

    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls).toHaveLength(0);
  });

  it("E4. does NOT enqueue email when type has no mapped template (system type)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      email: "test@example.com",
      name: "Test User",
      languagePreference: "en",
    });
    // 'system' type is not in EMAIL_ELIGIBLE_TYPES — router suppresses email for it
    const handler = handlerRef.current.get("points.throttled");

    await handler?.({
      userId: USER_ID,
      actionType: "rapid_fire",
      eventType: "post.reacted",
      eventId: "post-abc",
      timestamp: new Date().toISOString(),
    });

    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls).toHaveLength(0);
  });

  it("E5. email uses user's languagePreference ('ig') for locale", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      email: "test@example.com",
      name: "Test User",
      languagePreference: "ig",
    });
    const handler = handlerRef.current.get("event.reminder");

    await handler?.({
      eventId: EVENT_ID,
      userId: USER_ID,
      title: "Igbo Language Class",
      startTime: "2026-03-15T14:00:00Z",
      reminderType: "24h",
      timestamp: new Date().toISOString(),
    });

    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls[0]?.[1]).toMatchObject({ locale: "ig" });
  });

  it("E6. emailData is merged with { name } in enqueueEmailJob data", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([USER_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      email: "test@example.com",
      name: "Chidi",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("event.reminder");

    await handler?.({
      eventId: EVENT_ID,
      userId: USER_ID,
      title: "Community Night",
      startTime: "2026-03-15T18:00:00Z",
      reminderType: "1h",
      timestamp: new Date().toISOString(),
    });

    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls[0]?.[1]).toMatchObject({
      data: expect.objectContaining({
        name: "Chidi",
        eventTitle: "Community Night",
        startTime: "2026-03-15T18:00:00Z",
        eventUrl: `/events/${EVENT_ID}`,
      }) as unknown,
    });
  });
});

// ─── Story 9.2: message.sent handler ──────────────────────────────────────────

describe("Story 9.2 — message.sent handler (first-DM email)", () => {
  const SENDER_ID = "00000000-0000-4000-8000-000000000011";
  const RECIPIENT_ID = "00000000-0000-4000-8000-000000000012";
  const CONV_ID = "00000000-0000-4000-8000-000000000020";

  const makeFirstDmPayload = (overrides: Record<string, unknown> = {}) => ({
    messageId: "msg-001",
    senderId: SENDER_ID,
    conversationId: CONV_ID,
    content: "Hello!",
    contentType: "text",
    createdAt: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    recipientId: RECIPIENT_ID,
    messagePreview: "Hello!",
    messageCount: 1,
    conversationType: "direct" as const,
    senderName: "Emeka",
    ...overrides,
  });

  beforeEach(() => {
    mockFilterNotificationRecipients.mockResolvedValue([RECIPIENT_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: RECIPIENT_ID,
      email: "recipient@example.com",
      name: "Adaeze",
      languagePreference: "en",
    });
  });

  it("M1. first DM (messageCount===1, conversationType==='direct') triggers deliverNotification with type 'message'", async () => {
    const handler = handlerRef.current.get("message.sent");

    await handler?.(makeFirstDmPayload());

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: RECIPIENT_ID,
        type: "message",
        title: "notifications.new_message.title",
        body: "notifications.new_message.body",
        link: `/chat/${CONV_ID}`,
      }),
    );
  });

  it("M2. subsequent messages (messageCount > 1) do NOT trigger deliverNotification", async () => {
    const handler = handlerRef.current.get("message.sent");

    await handler?.(makeFirstDmPayload({ messageCount: 2 }));

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("M3. group channel message (conversationType==='channel') does NOT trigger deliverNotification even if messageCount===1", async () => {
    const handler = handlerRef.current.get("message.sent");

    await handler?.(makeFirstDmPayload({ conversationType: "channel" }));

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("M4. missing recipientId silently skips delivery", async () => {
    const handler = handlerRef.current.get("message.sent");

    await handler?.(makeFirstDmPayload({ recipientId: undefined }));

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});

// ─── Story 9.2 Review Fixes ──────────────────────────────────────────────────

describe("Story 9.2 review — F3: article handlers do NOT trigger router email", () => {
  const AUTHOR_ID = "00000000-0000-4000-8000-000000000050";
  const ARTICLE_ID = "00000000-0000-4000-8000-000000000060";

  it("article.published does NOT enqueue notification-member-approved email (only direct article-published email)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: AUTHOR_ID,
      email: "author@example.com",
      name: "Test Author",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("article.published");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      slug: "my-article",
      timestamp: new Date().toISOString(),
    });

    // Should only have the direct article-published email, NOT a notif-admin_announcement email
    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls).toHaveLength(0);

    // The direct article email SHOULD still fire
    const articleEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("article-published-"),
    );
    expect(articleEmailCalls).toHaveLength(1);
  });

  it("article.rejected does NOT enqueue notification-member-approved email (only direct article-rejected email)", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([AUTHOR_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: AUTHOR_ID,
      email: "author@example.com",
      name: "Test Author",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("article.rejected");

    await handler?.({
      articleId: ARTICLE_ID,
      authorId: AUTHOR_ID,
      title: "My Article",
      feedback: "Needs work",
      timestamp: new Date().toISOString(),
    });

    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls).toHaveLength(0);

    const articleEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("article-rejected-"),
    );
    expect(articleEmailCalls).toHaveLength(1);
  });
});

describe("Story 9.2 review — F6: event.waitlist_promoted email dispatch", () => {
  const PROMOTED_USER_ID = "00000000-0000-4000-8000-000000000099";
  const EVENT_ID = "00000000-0000-4000-8000-000000000088";

  it("enqueues notification-event-reminder email with startTime for waitlist_promoted", async () => {
    mockFilterNotificationRecipients.mockResolvedValue([PROMOTED_USER_ID]);
    mockRedisExists.mockResolvedValue(0);
    mockFindUserById.mockResolvedValue({
      id: PROMOTED_USER_ID,
      email: "promoted@example.com",
      name: "Lucky Member",
      languagePreference: "en",
    });
    const handler = handlerRef.current.get("event.waitlist_promoted");

    await handler?.({
      eventId: EVENT_ID,
      promotedUserId: PROMOTED_USER_ID,
      title: "Community Night Out",
      startTime: "2030-06-15T18:00:00Z",
      timestamp: new Date().toISOString(),
    });

    const notifEmailCalls = mockEnqueueEmailJob.mock.calls.filter((args) =>
      String(args[0]).startsWith("notif-"),
    );
    expect(notifEmailCalls).toHaveLength(1);
    expect(notifEmailCalls[0]?.[1]).toMatchObject({
      to: "promoted@example.com",
      templateId: "notification-event-reminder",
      data: expect.objectContaining({
        name: "Lucky Member",
        eventTitle: "Community Night Out",
        startTime: "2030-06-15T18:00:00Z",
        eventUrl: `/events/${EVENT_ID}`,
      }) as unknown,
    });
  });
});

// ─── Story 9.3: Push delivery via deliverNotification ────────────────────────

describe("push delivery (Story 9.3)", () => {
  it("sendPushNotifications called when push not suppressed (eligible type, no DnD)", async () => {
    // member.approved → type: admin_announcement → push eligible, no DnD
    mockRedisExists.mockResolvedValue(0);
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockSendPushNotifications).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        title: "notifications.member_approved.title",
        body: "notifications.member_approved.body",
        icon: "/icon-192.png",
        link: "/dashboard",
      }),
    );
  });

  it("sendPushNotifications NOT called when push suppressed (DnD active)", async () => {
    mockRedisExists.mockResolvedValue(1); // DnD active
    const approvedHandler = handlerRef.current.get("member.approved");

    await approvedHandler?.({
      userId: "00000000-0000-4000-8000-000000000001",
      approvedBy: "00000000-0000-4000-8000-000000000002",
      timestamp: new Date().toISOString(),
    });

    expect(mockSendPushNotifications).not.toHaveBeenCalled();
  });
});
