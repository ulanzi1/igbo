// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/realtime", () => ({
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_CONVERSATION: (id: string) => `conversation:${id}`,
  NAMESPACE_NOTIFICATIONS: "/notifications",
  NAMESPACE_CHAT: "/chat",
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

  it("routes message.sent to conversation room on /chat namespace", async () => {
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

    pmessageCallbacks[0]?.("eventbus:*", "eventbus:message.sent", JSON.stringify(payload));

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
      }),
    );
  });

  it("ignores message.sent when conversationId is missing", async () => {
    const chatEmit = vi.fn();
    const { subscriber, pmessageCallbacks } = makeSubscriber();
    const io = makeIo(vi.fn(), chatEmit);

    await startEventBusBridge(io, subscriber);

    pmessageCallbacks[0]?.(
      "eventbus:*",
      "eventbus:message.sent",
      JSON.stringify({ messageId: MSG_ID, senderId: USER_ID }), // no conversationId
    );

    expect(chatEmit).not.toHaveBeenCalled();
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
});

describe("stopEventBusBridge", () => {
  it("unsubscribes from eventbus:* pattern", async () => {
    const { subscriber } = makeSubscriber();

    await stopEventBusBridge(subscriber);

    expect(subscriber.punsubscribe).toHaveBeenCalledWith("eventbus:*");
  });
});
