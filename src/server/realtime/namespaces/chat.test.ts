// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock ─────────────────────────────────────────────────────────────
vi.mock("@/config/realtime", () => ({
  ROOM_CONVERSATION: (id: string) => `conversation:${id}`,
  CHAT_REPLAY_WINDOW_MS: 86_400_000, // 24h
}));

// ── DB query mocks ──────────────────────────────────────────────────────────
const mockGetUserConversationIds = vi.hoisted(() => vi.fn());
const mockGetMessagesSince = vi.hoisted(() => vi.fn());
const mockIsConversationMember = vi.hoisted(() => vi.fn());
const mockGetConversationMembers = vi.hoisted(() => vi.fn());
const mockGetUsersWhoBlocked = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/chat-conversations", () => ({
  getUserConversationIds: (...args: unknown[]) => mockGetUserConversationIds(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  getConversationMembers: (...args: unknown[]) => mockGetConversationMembers(...args),
}));

vi.mock("@/db/queries/chat-messages", () => ({
  getMessagesSince: (...args: unknown[]) => mockGetMessagesSince(...args),
}));

vi.mock("@/db/queries/block-mute", () => ({
  getUsersWhoBlocked: (...args: unknown[]) => mockGetUsersWhoBlocked(...args),
}));

const mockSendMessage = vi.hoisted(() => vi.fn());
vi.mock("@/services/message-service", () => ({
  messageService: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  },
}));

import { setupChatNamespace } from "./chat";
import type { Namespace, Socket } from "socket.io";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Hello!",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-02-01T12:00:00Z"),
};

function makeSocket(userId: string = USER_ID): {
  socket: Socket;
  events: Record<string, ((...args: unknown[]) => void)[]>;
} {
  const events: Record<string, ((...args: unknown[]) => void)[]> = {};
  const socket = {
    data: { userId },
    join: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      events[event] = events[event] ?? [];
      events[event]!.push(cb);
    }),
  } as unknown as Socket;
  return { socket, events };
}

function makeNamespace(_socket: Socket): {
  ns: Namespace;
  connectionCallbacks: ((s: Socket) => void)[];
} {
  const connectionCallbacks: ((s: Socket) => void)[] = [];
  const ns = {
    on: vi.fn((event: string, cb: (s: Socket) => void) => {
      if (event === "connection") connectionCallbacks.push(cb);
    }),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    of: vi.fn().mockReturnThis(),
  } as unknown as Namespace;
  return { ns, connectionCallbacks };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserConversationIds.mockResolvedValue([CONV_ID]);
  mockIsConversationMember.mockResolvedValue(true);
  mockGetConversationMembers.mockResolvedValue([{ userId: "other-user", conversationId: CONV_ID }]);
  mockGetUsersWhoBlocked.mockResolvedValue([]);
  mockSendMessage.mockResolvedValue(mockMessage);
  mockGetMessagesSince.mockResolvedValue([]);
});

describe("setupChatNamespace", () => {
  it("registers a connection handler", () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    expect(ns.on).toHaveBeenCalledWith("connection", expect.any(Function));
    expect(connectionCallbacks).toHaveLength(1);
  });

  it("auto-joins conversation rooms on connect", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    await vi.waitFor(() => {
      expect(socket.join).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    });
  });

  it("emits conversation:joined after auto-join", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    await vi.waitFor(() => {
      expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        "conversation:joined",
        expect.objectContaining({ conversationId: CONV_ID }),
      );
    });
  });

  it("registers message:send, message:delivered, sync:request handlers", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    expect(events["message:send"]).toBeDefined();
    expect(events["message:delivered"]).toBeDefined();
    expect(events["sync:request"]).toBeDefined();
  });
});

describe("message:send handler", () => {
  async function triggerConnect(userId = USER_ID) {
    const { socket, events } = makeSocket(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns };
  }

  it("sends a message via messageService and ACKs (broadcast via EventBus bridge)", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "Hello!" }, ack);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Hello!",
        contentType: "text",
      }),
    );
    // message:new is emitted by EventBus bridge (not directly by handler)
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ messageId: MSG_ID }));
  });

  it("rejects when sender is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "Hello!" }, ack);

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when a member has blocked the sender", async () => {
    mockGetUsersWhoBlocked.mockResolvedValue(["other-user"]);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "Hello!" }, ack);

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects message when block check fails (fail closed)", async () => {
    mockGetUsersWhoBlocked.mockRejectedValue(new Error("DB down"));
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "Hello!" }, ack);

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when conversationId is missing", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();
    await events["message:send"]![0]!({ content: "Hi" }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when content is empty whitespace", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();
    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "   " }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("handles DB errors gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("DB down"));
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "Hello!" }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

describe("message:delivered handler", () => {
  it("acknowledges delivery (Phase 1 no-op)", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    const ack = vi.fn();
    await events["message:delivered"]![0]!({ messageId: MSG_ID }, ack);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });
});

describe("sync:request handler", () => {
  it("emits sync:full_refresh when no lastReceivedAt", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({});
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
  });

  it("emits sync:full_refresh when gap exceeds 24h", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    const oldTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await events["sync:request"]![0]!({ lastReceivedAt: oldTs });
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.any(Object),
    );
  });

  it("replays missed messages when gap is within 24h", async () => {
    const recentTs = new Date(Date.now() - 60_000);
    const missedMsg = { ...mockMessage, createdAt: new Date(Date.now() - 30_000) };
    mockGetMessagesSince.mockResolvedValue([missedMsg]);

    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastReceivedAt: recentTs.toISOString() });

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:replay",
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ messageId: MSG_ID })]),
        hasMore: false,
      }),
    );
  });

  it("emits sync:full_refresh when invalid timestamp provided", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastReceivedAt: "not-a-date" });
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.any(Object),
    );
  });

  it("emits sync:full_refresh on DB error", async () => {
    mockGetMessagesSince.mockRejectedValue(new Error("DB down"));
    const recentTs = new Date(Date.now() - 60_000).toISOString();

    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastReceivedAt: recentTs });
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.any(Object),
    );
  });
});
