// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@igbo/config/realtime", () => ({
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_CONVERSATION: (id: string) => `conversation:${id}`,
  ROOM_EVENT: (id: string) => `event:${id}`,
  NAMESPACE_NOTIFICATIONS: "/notifications",
  NAMESPACE_CHAT: "/chat",
}));

vi.mock("@igbo/db/queries/group-channels", () => ({
  listGroupChannels: vi.fn().mockResolvedValue([]),
}));

const mockDbSelect = vi.hoisted(() => vi.fn());
vi.mock("@igbo/db", () => ({
  db: { select: (...args: unknown[]) => mockDbSelect(...args) },
}));

vi.mock("@igbo/db/schema/chat-messages", () => ({
  chatMessages: { id: "id", conversationId: "conversation_id" },
}));

const mockCreateNotification = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@igbo/db/queries/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
}));

import { startEventBusBridge, stopEventBusBridge } from "./eventbus-bridge";
import type { Server } from "socket.io";
import type Redis from "ioredis";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeSubscriber(): {
  subscriber: Redis;
  pmessageCallbacks: ((pattern: string, channel: string, message: string) => void)[];
} {
  const pmessageCallbacks: ((pattern: string, channel: string, message: string) => void)[] = [];
  const subscriber = {
    on: vi.fn((event: string, cb: (pattern: string, channel: string, message: string) => void) => {
      if (event === "pmessage") pmessageCallbacks.push(cb);
    }),
    psubscribe: vi.fn().mockResolvedValue(undefined),
    punsubscribe: vi.fn().mockResolvedValue(undefined),
  } as unknown as Redis;
  return { subscriber, pmessageCallbacks };
}

function makeIo(notifEmit: ReturnType<typeof vi.fn>, chatEmit?: ReturnType<typeof vi.fn>): Server {
  return {
    of: vi.fn().mockImplementation((namespace: string) => ({
      to: vi.fn().mockReturnValue({
        emit: namespace === "/chat" && chatEmit ? chatEmit : notifEmit,
      }),
    })),
  } as unknown as Server;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const CONV_ID = "00000000-0000-4000-8000-000000000010";
const MSG_ID = "00000000-0000-4000-8000-000000000011";

describe("startEventBusBridge", () => {
  it("subscribes to eventbus:* pattern", async () => {
    const { subscriber } = makeSubscriber();
    const io = makeIo(vi.fn());

    await startEventBusBridge(io, subscriber);

    expect(subscriber.psubscribe).toHaveBeenCalledWith("eventbus:*");
  });

  it("registers pmessage handler", async () => {
    const { subscriber } = makeSubscriber();
    const io = makeIo(vi.fn());

    await startEventBusBridge(io, subscriber);

    expect(subscriber.on).toHaveBeenCalledWith("pmessage", expect.any(Function));
  });

  it("routes notification.created to user room with PlatformNotification-shaped payload", async () => {
    const emitMock = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(emitMock);

    await startEventBusBridge(io, subscriber);

    const payload = {
      userId: USER_ID,
      notificationId: "notif-123",
      type: "system",
      title: "Hello",
      body: "World",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:notification.created", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/notifications");
    // Payload should match PlatformNotification shape (id instead of notificationId)
    expect(emitMock).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({
        id: "notif-123",
        userId: USER_ID,
        type: "system",
        title: "Hello",
        body: "World",
        isRead: false,
      }),
    );
    // Also emits unread:update
    expect(emitMock).toHaveBeenCalledWith(
      "unread:update",
      expect.objectContaining({ userId: USER_ID, increment: 1 }),
    );
  });

  it("routes notification.read to user room", async () => {
    const emitMock = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(emitMock);

    await startEventBusBridge(io, subscriber);

    const payload = {
      userId: USER_ID,
      notificationId: "notif-456",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:notification.read", JSON.stringify(payload));

    expect(emitMock).toHaveBeenCalledWith(
      "notification:read",
      expect.objectContaining({ notificationId: "notif-456" }),
    );
  });

  it("routes chat.message.sent to conversation room on /chat namespace", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      senderId: USER_ID,
      conversationId: CONV_ID,
      content: "Hello!",
      contentType: "text",
      createdAt: ts,
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.message.sent", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/chat");
    expect(chatEmit).toHaveBeenCalledWith(
      "message:new",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Hello!",
        contentType: "text",
        createdAt: ts,
        attachments: [],
        reactions: [],
      }),
    );
  });

  it("includes attachments in message:new when present in payload", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const mockAttachments = [
      {
        id: "att-1",
        fileUrl: "https://cdn.example.com/img.jpg",
        fileName: "img.jpg",
        fileType: "image/jpeg",
        fileSize: 12345,
      },
    ];
    const payload = {
      messageId: MSG_ID,
      senderId: USER_ID,
      conversationId: CONV_ID,
      content: "Check this!",
      contentType: "text",
      createdAt: ts,
      timestamp: ts,
      attachments: mockAttachments,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.message.sent", JSON.stringify(payload));

    expect(chatEmit).toHaveBeenCalledWith(
      "message:new",
      expect.objectContaining({
        attachments: mockAttachments,
        reactions: [],
      }),
    );
  });

  it("routes chat.reaction.added to conversation room", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      userId: USER_ID,
      emoji: "👍",
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.reaction.added", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/chat");
    expect(chatEmit).toHaveBeenCalledWith(
      "reaction:added",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        emoji: "👍",
        action: "added",
      }),
    );
  });

  it("routes chat.reaction.removed to conversation room", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      userId: USER_ID,
      emoji: "❤️",
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.reaction.removed", JSON.stringify(payload));

    expect(chatEmit).toHaveBeenCalledWith(
      "reaction:removed",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        emoji: "❤️",
        action: "removed",
      }),
    );
  });

  it("ignores chat.reaction.added when conversationId is missing", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:chat.reaction.added",
      JSON.stringify({ messageId: MSG_ID, userId: USER_ID, emoji: "👍" }), // no conversationId
    );

    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("ignores chat.message.sent when conversationId is missing", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:chat.message.sent",
      JSON.stringify({ messageId: MSG_ID, senderId: USER_ID }), // no conversationId
    );

    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("routes event.rsvp to event room with attendee count on /notifications namespace", async () => {
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      eventId: "event-1",
      userId: USER_ID,
      status: "registered",
      attendeeCount: 12,
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:event.rsvp", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/notifications");
    expect(notifEmit).toHaveBeenCalledWith(
      "event:attendee_update",
      expect.objectContaining({
        eventId: "event-1",
        attendeeCount: 12,
        timestamp: ts,
      }),
    );
  });

  it("routes event.rsvp_cancelled to event room with updated attendee count", async () => {
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      eventId: "event-1",
      userId: USER_ID,
      attendeeCount: 11,
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:event.rsvp_cancelled", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/notifications");
    expect(notifEmit).toHaveBeenCalledWith(
      "event:attendee_update",
      expect.objectContaining({
        eventId: "event-1",
        attendeeCount: 11,
        timestamp: ts,
      }),
    );
  });

  it("routes event.attended to event room with status=attended on /notifications namespace", async () => {
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      eventId: "event-1",
      userId: USER_ID,
      hostId: "host-user-1",
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:event.attended", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/notifications");
    expect(notifEmit).toHaveBeenCalledWith(
      "event:attendee_update",
      expect.objectContaining({
        eventId: "event-1",
        userId: USER_ID,
        status: "attended",
        timestamp: ts,
      }),
    );
  });

  it("ignores event.attended when eventId is missing", async () => {
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:event.attended",
      JSON.stringify({ userId: USER_ID }), // no eventId
    );

    expect(notifEmit).not.toHaveBeenCalled();
  });

  it("ignores event.rsvp when eventId is missing", async () => {
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:event.rsvp",
      JSON.stringify({ userId: USER_ID, attendeeCount: 5 }), // no eventId
    );

    expect(notifEmit).not.toHaveBeenCalled();
  });

  it("ignores unknown event types gracefully", async () => {
    const emitMock = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(emitMock);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:some.unknown", JSON.stringify({ foo: "bar" }));

    // Should not emit anything
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("ignores malformed JSON messages", async () => {
    const emitMock = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(emitMock);

    await startEventBusBridge(io, subscriber);

    expect(() =>
      pmessageCallbacks[0]?.("eventbus:*", "eventbus:notification.created", "{invalid json"),
    ).not.toThrow();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("routes chat.message.edited to conversation room on /chat namespace", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Edited content",
      editedAt: ts,
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.message.edited", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/chat");
    expect(chatEmit).toHaveBeenCalledWith(
      "message:edited",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        content: "Edited content",
        editedAt: ts,
      }),
    );
  });

  it("ignores chat.message.edited when conversationId is missing", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:chat.message.edited",
      JSON.stringify({ messageId: MSG_ID, content: "x" }), // no conversationId
    );

    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("routes chat.message.deleted to conversation room on /chat namespace", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      senderId: USER_ID,
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.message.deleted", JSON.stringify(payload));

    expect(io.of).toHaveBeenCalledWith("/chat");
    expect(chatEmit).toHaveBeenCalledWith(
      "message:deleted",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
      }),
    );
  });

  it("ignores chat.message.deleted when conversationId is missing", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:chat.message.deleted",
      JSON.stringify({ messageId: MSG_ID }), // no conversationId
    );

    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("routes chat.message.mentioned to each mentioned user's notifications room", async () => {
    const MENTIONED_ID_1 = "00000000-0000-4000-8000-000000000091";
    const MENTIONED_ID_2 = "00000000-0000-4000-8000-000000000092";
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      senderId: USER_ID,
      mentionedUserIds: [MENTIONED_ID_1, MENTIONED_ID_2],
      contentPreview: "Hey @Ada and @Eze!",
      timestamp: ts,
    };

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:chat.message.mentioned",
      JSON.stringify(payload),
    );

    expect(io.of).toHaveBeenCalledWith("/notifications");
    // mention:received emitted for each mentioned user
    expect(notifEmit).toHaveBeenCalledWith(
      "mention:received",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
      }),
    );
    expect(notifEmit).toHaveBeenCalledTimes(2);
  });

  it("emits no mention:received when mentionedUserIds is empty", async () => {
    const notifEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      senderId: USER_ID,
      mentionedUserIds: [],
      contentPreview: "plain text",
      timestamp: ts,
    };

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:chat.message.mentioned",
      JSON.stringify(payload),
    );

    expect(notifEmit).not.toHaveBeenCalled();
  });

  it("includes parentMessageId in message:new when present", async () => {
    const PARENT_ID = "00000000-0000-4000-8000-000000000099";
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const ts = new Date().toISOString();
    const payload = {
      messageId: MSG_ID,
      senderId: USER_ID,
      conversationId: CONV_ID,
      content: "Replying to you",
      contentType: "text",
      createdAt: ts,
      parentMessageId: PARENT_ID,
      timestamp: ts,
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:chat.message.sent", JSON.stringify(payload));

    expect(chatEmit).toHaveBeenCalledWith(
      "message:new",
      expect.objectContaining({
        parentMessageId: PARENT_ID,
      }),
    );
  });
});

describe("content.flagged bridge (message type)", () => {
  const MSG_ID_FLAG = "00000000-0000-4000-8000-000000000020";
  const CONV_ID_FLAG = "00000000-0000-4000-8000-000000000021";

  beforeEach(() => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ conversationId: CONV_ID_FLAG }]),
        }),
      }),
    });
  });

  it("emits message:flagged to conversation room when contentType=message", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = {
      contentType: "message",
      contentId: MSG_ID_FLAG,
      contentAuthorId: "user-1",
      contentPreview: "bad",
      flagReason: "spam",
      severity: "low",
      moderationActionId: "action-1",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:content.flagged", JSON.stringify(payload));

    // Async — wait for promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(chatEmit).toHaveBeenCalledWith(
      "message:flagged",
      expect.objectContaining({ messageId: MSG_ID_FLAG, conversationId: CONV_ID_FLAG }),
    );
  });

  it("does not emit for non-message contentType", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = {
      contentType: "post",
      contentId: "post-1",
      contentAuthorId: "user-1",
      contentPreview: "bad",
      flagReason: "spam",
      severity: "low",
      moderationActionId: "action-1",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:content.flagged", JSON.stringify(payload));
    await new Promise((r) => setTimeout(r, 10));

    expect(chatEmit).not.toHaveBeenCalledWith("message:flagged", expect.anything());
  });
});

describe("content.moderated bridge (message type)", () => {
  const MSG_ID_MOD = "00000000-0000-4000-8000-000000000030";
  const CONV_ID_MOD = "00000000-0000-4000-8000-000000000031";

  beforeEach(() => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ conversationId: CONV_ID_MOD }]),
        }),
      }),
    });
    mockCreateNotification.mockResolvedValue({});
  });

  it("approve → emits message:unflagged", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = {
      contentType: "message",
      contentId: MSG_ID_MOD,
      contentAuthorId: "user-1",
      action: "approve",
      moderatorId: "admin-1",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:content.moderated", JSON.stringify(payload));
    await new Promise((r) => setTimeout(r, 10));

    expect(chatEmit).toHaveBeenCalledWith(
      "message:unflagged",
      expect.objectContaining({ messageId: MSG_ID_MOD, conversationId: CONV_ID_MOD }),
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("remove → emits message:removed and sends notification to author", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = {
      contentType: "message",
      contentId: MSG_ID_MOD,
      contentAuthorId: "user-1",
      action: "remove",
      moderatorId: "admin-1",
      reason: "Violation",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:content.moderated", JSON.stringify(payload));
    await new Promise((r) => setTimeout(r, 10));

    expect(chatEmit).toHaveBeenCalledWith(
      "message:removed",
      expect.objectContaining({
        messageId: MSG_ID_MOD,
        conversationId: CONV_ID_MOD,
        replacementText: "[This message was removed by a moderator]",
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "admin_announcement" }),
    );
  });

  it("dismiss → emits message:unflagged (false positive restore)", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = {
      contentType: "message",
      contentId: MSG_ID_MOD,
      contentAuthorId: "user-1",
      action: "dismiss",
      moderatorId: "admin-1",
      timestamp: new Date().toISOString(),
    };

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:content.moderated", JSON.stringify(payload));
    await new Promise((r) => setTimeout(r, 10));

    expect(chatEmit).not.toHaveBeenCalledWith("message:removed", expect.anything());
    expect(chatEmit).toHaveBeenCalledWith(
      "message:unflagged",
      expect.objectContaining({ messageId: MSG_ID_MOD, conversationId: CONV_ID_MOD }),
    );
  });
});

describe("stopEventBusBridge", () => {
  it("unsubscribes from eventbus:* pattern", async () => {
    const { subscriber } = makeSubscriber();

    await stopEventBusBridge(subscriber);

    expect(subscriber.punsubscribe).toHaveBeenCalledWith("eventbus:*");
  });
});

describe("portal event isolation", () => {
  it("job.published does not throw and does not emit to /notifications or /chat", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = { jobId: "j1", eventId: "e1", version: 1, timestamp: new Date().toISOString() };
    expect(() => {
      pmessageCallbacks[0]?.("eventbus:*", "eventbus:job.published", JSON.stringify(payload));
    }).not.toThrow();

    expect(notifEmit).not.toHaveBeenCalled();
    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("application.submitted does not emit to /notifications or /chat", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const payload = {
      applicationId: "a1",
      jobId: "j1",
      eventId: "e1",
      version: 1,
      timestamp: new Date().toISOString(),
    };
    pmessageCallbacks[0]?.("eventbus:*", "eventbus:application.submitted", JSON.stringify(payload));

    expect(notifEmit).not.toHaveBeenCalled();
    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("all portal event types are recognized as no-ops — none emit to community namespaces", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    const portalEvents = [
      "job.published",
      "job.updated",
      "job.closed",
      "application.submitted",
      "application.status_changed",
      "application.withdrawn",
    ];

    for (const eventName of portalEvents) {
      pmessageCallbacks[0]?.(
        "eventbus:*",
        `eventbus:${eventName}`,
        JSON.stringify({ eventId: "e1", version: 1, timestamp: new Date().toISOString() }),
      );
    }

    expect(notifEmit).not.toHaveBeenCalled();
    expect(chatEmit).not.toHaveBeenCalled();
  });

  it("community events still route correctly after portal events are processed (no regression)", async () => {
    const notifEmit = vi.fn();
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(notifEmit, chatEmit);

    await startEventBusBridge(io, subscriber);

    // Portal event first — must be a no-op
    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:job.published",
      JSON.stringify({
        jobId: "j1",
        eventId: "e1",
        version: 1,
        timestamp: new Date().toISOString(),
      }),
    );

    // Community notification event follows
    const notifPayload = {
      notificationId: "n1",
      userId: USER_ID,
      type: "system",
      title: "Hello",
      body: "World",
      timestamp: new Date().toISOString(),
    };
    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:notification.created",
      JSON.stringify(notifPayload),
    );

    // Community event must still be routed correctly
    expect(notifEmit).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(chatEmit).not.toHaveBeenCalled();
  });
});
