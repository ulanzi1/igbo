// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock ─────────────────────────────────────────────────────────────
vi.mock("@/config/realtime", () => ({
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_CONVERSATION: (id: string) => `conversation:${id}`,
  CHAT_REPLAY_WINDOW_MS: 86_400_000, // 24h
  REDIS_TYPING_KEY: (convId: string, userId: string) => `typing:${convId}:${userId}`,
  TYPING_EXPIRE_SECONDS: 5,
}));

// ── DB query mocks ──────────────────────────────────────────────────────────
const mockGetUserConversationIds = vi.hoisted(() => vi.fn());
const mockGetMessagesSince = vi.hoisted(() => vi.fn());
const mockIsConversationMember = vi.hoisted(() => vi.fn());
const mockGetConversationMembers = vi.hoisted(() => vi.fn());
const mockGetUsersWhoBlocked = vi.hoisted(() => vi.fn());
const mockGetAttachmentsForMessages = vi.hoisted(() => vi.fn());
const mockGetReactionsForMessages = vi.hoisted(() => vi.fn());

const mockMarkConversationRead = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/chat-conversations", () => ({
  getUserConversationIds: (...args: unknown[]) => mockGetUserConversationIds(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  getConversationMembers: (...args: unknown[]) => mockGetConversationMembers(...args),
  markConversationRead: (...args: unknown[]) => mockMarkConversationRead(...args),
}));

vi.mock("@/db/queries/chat-messages", () => ({
  getMessagesSince: (...args: unknown[]) => mockGetMessagesSince(...args),
}));

vi.mock("@/db/queries/block-mute", () => ({
  getUsersWhoBlocked: (...args: unknown[]) => mockGetUsersWhoBlocked(...args),
}));

vi.mock("@/db/queries/chat-message-attachments", () => ({
  getAttachmentsForMessages: (...args: unknown[]) => mockGetAttachmentsForMessages(...args),
}));

vi.mock("@/db/queries/chat-message-reactions", () => ({
  getReactionsForMessages: (...args: unknown[]) => mockGetReactionsForMessages(...args),
}));

const mockSendMessage = vi.hoisted(() => vi.fn());
const mockSendMessageWithAttachments = vi.hoisted(() => vi.fn());
const mockUpdateMessage = vi.hoisted(() => vi.fn());
const mockDeleteMessage = vi.hoisted(() => vi.fn());
const mockGetFileUploadById = vi.hoisted(() => vi.fn());

vi.mock("@/services/message-service", () => ({
  messageService: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    sendMessageWithAttachments: (...args: unknown[]) => mockSendMessageWithAttachments(...args),
    updateMessage: (...args: unknown[]) => mockUpdateMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  },
}));

vi.mock("@/db/queries/file-uploads", () => ({
  getFileUploadById: (...args: unknown[]) => mockGetFileUploadById(...args),
}));

import { setupChatNamespace } from "./chat";
import type { Namespace, Socket } from "socket.io";
import type Redis from "ioredis";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

// Mock Redis passed to setupChatNamespace
const mockRedis = {
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
} as unknown as Redis;

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeNamespace(_socket?: Socket): {
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

const UPLOAD_ID = "00000000-0000-4000-8000-000000000005";

const mockReadyUpload = {
  id: UPLOAD_ID,
  uploaderId: USER_ID,
  objectKey: "chat/img.jpg",
  originalFilename: "img.jpg",
  fileType: "image/jpeg",
  fileSize: 12345,
  status: "ready" as const,
  processedUrl: "https://cdn.example.com/img.jpg",
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserConversationIds.mockResolvedValue([CONV_ID]);
  mockIsConversationMember.mockResolvedValue(true);
  mockGetConversationMembers.mockResolvedValue([{ userId: "other-user", conversationId: CONV_ID }]);
  mockGetUsersWhoBlocked.mockResolvedValue([]);
  mockSendMessage.mockResolvedValue(mockMessage);
  mockSendMessageWithAttachments.mockResolvedValue(mockMessage);
  mockUpdateMessage.mockResolvedValue({ ...mockMessage, content: "Updated", editedAt: new Date() });
  mockDeleteMessage.mockResolvedValue(undefined);
  mockGetFileUploadById.mockResolvedValue(mockReadyUpload);
  mockGetMessagesSince.mockResolvedValue([]);
  mockGetAttachmentsForMessages.mockResolvedValue([]);
  mockGetReactionsForMessages.mockResolvedValue([]);
  mockMarkConversationRead.mockResolvedValue(undefined);
  (mockRedis.set as ReturnType<typeof vi.fn>).mockResolvedValue("OK");
  (mockRedis.del as ReturnType<typeof vi.fn>).mockResolvedValue(1);
});

describe("setupChatNamespace", () => {
  it("registers a connection handler", () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    expect(ns.on).toHaveBeenCalledWith("connection", expect.any(Function));
    expect(connectionCallbacks).toHaveLength(1);
  });

  it("auto-joins conversation rooms on connect", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);

    await vi.waitFor(() => {
      expect(socket.join).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    });
  });

  it("emits conversation:joined after auto-join", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);

    await vi.waitFor(() => {
      expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        "conversation:joined",
        expect.objectContaining({ conversationId: CONV_ID }),
      );
    });
  });

  it("registers message:send, message:delivered, sync:request, message:edit, message:delete, typing:start, typing:stop, message:read handlers", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);

    expect(events["message:send"]).toBeDefined();
    expect(events["message:delivered"]).toBeDefined();
    expect(events["sync:request"]).toBeDefined();
    expect(events["message:edit"]).toBeDefined();
    expect(events["message:delete"]).toBeDefined();
    expect(events["typing:start"]).toBeDefined();
    expect(events["typing:stop"]).toBeDefined();
    expect(events["message:read"]).toBeDefined();
  });
});

describe("message:send handler", () => {
  async function triggerConnect(userId = USER_ID) {
    const { socket, events } = makeSocket(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
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

  it("rejects when content is empty whitespace with no attachments", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();
    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "   " }, ack);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("allows attachment-only message with empty content", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!(
      { conversationId: CONV_ID, content: "", attachmentFileUploadIds: [UPLOAD_ID] },
      ack,
    );

    expect(mockSendMessageWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "",
        attachmentFileUploadIds: [UPLOAD_ID],
      }),
    );
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ messageId: MSG_ID }));
  });

  it("handles DB errors gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("DB down"));
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!({ conversationId: CONV_ID, content: "Hello!" }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("calls sendMessageWithAttachments when attachmentFileUploadIds provided", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!(
      { conversationId: CONV_ID, content: "Look at this!", attachmentFileUploadIds: [UPLOAD_ID] },
      ack,
    );

    expect(mockSendMessageWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Look at this!",
        attachmentFileUploadIds: [UPLOAD_ID],
      }),
    );
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ messageId: MSG_ID }));
  });

  it("calls sendMessage (no attachments) when empty attachmentFileUploadIds provided", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!(
      { conversationId: CONV_ID, content: "Hello!", attachmentFileUploadIds: [] },
      ack,
    );

    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockSendMessageWithAttachments).not.toHaveBeenCalled();
  });

  it("rejects when more than 10 attachments provided", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();
    const ids = Array.from({ length: 11 }, (_, i) => `upload-${i}`);

    await events["message:send"]![0]!(
      { conversationId: CONV_ID, content: "Too many", attachmentFileUploadIds: ids },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(mockSendMessageWithAttachments).not.toHaveBeenCalled();
  });

  it("rejects when attachment upload is not ready", async () => {
    mockGetFileUploadById.mockResolvedValue({ ...mockReadyUpload, status: "pending_scan" });
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!(
      { conversationId: CONV_ID, content: "Test", attachmentFileUploadIds: [UPLOAD_ID] },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(mockSendMessageWithAttachments).not.toHaveBeenCalled();
  });

  it("rejects when attachment does not belong to sender", async () => {
    mockGetFileUploadById.mockResolvedValue({ ...mockReadyUpload, uploaderId: "other-user" });
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:send"]![0]!(
      { conversationId: CONV_ID, content: "Test", attachmentFileUploadIds: [UPLOAD_ID] },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(mockSendMessageWithAttachments).not.toHaveBeenCalled();
  });
});

describe("sync:request handler", () => {
  it("emits sync:full_refresh when no lastReceivedAt", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
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
    setupChatNamespace(ns, mockRedis);
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
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastReceivedAt: recentTs.toISOString() });

    expect(mockGetAttachmentsForMessages).toHaveBeenCalledWith([MSG_ID]);
    expect(mockGetReactionsForMessages).toHaveBeenCalledWith([MSG_ID]);
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:replay",
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            messageId: MSG_ID,
            attachments: [],
            reactions: [],
          }),
        ]),
        hasMore: false,
      }),
    );
  });

  it("replays missed messages with attachments and reactions", async () => {
    const recentTs = new Date(Date.now() - 60_000);
    const missedMsg = { ...mockMessage, createdAt: new Date(Date.now() - 30_000) };
    mockGetMessagesSince.mockResolvedValue([missedMsg]);
    mockGetAttachmentsForMessages.mockResolvedValue([
      {
        id: "att-1",
        messageId: MSG_ID,
        fileUrl: "/img.webp",
        fileName: "img.png",
        fileType: "image/png",
        fileSize: 1024,
      },
    ]);
    mockGetReactionsForMessages.mockResolvedValue([
      { messageId: MSG_ID, userId: "other-user", emoji: "👍", createdAt: new Date() },
    ]);

    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastReceivedAt: recentTs.toISOString() });

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:replay",
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            messageId: MSG_ID,
            attachments: [
              {
                id: "att-1",
                fileUrl: "/img.webp",
                fileName: "img.png",
                fileType: "image/png",
                fileSize: 1024,
              },
            ],
            reactions: [expect.objectContaining({ emoji: "👍", userId: "other-user" })],
          }),
        ]),
      }),
    );
  });

  it("emits sync:full_refresh when invalid timestamp provided", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
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
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastReceivedAt: recentTs });
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.any(Object),
    );
  });
});

describe("message:edit handler", () => {
  async function triggerConnect(userId = USER_ID) {
    const { socket, events } = makeSocket(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns };
  }

  it("edits message via messageService and ACKs success", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "Updated" },
      ack,
    );

    expect(mockUpdateMessage).toHaveBeenCalledWith(MSG_ID, USER_ID, "Updated");
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("rejects when conversationId is missing", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!({ messageId: MSG_ID, content: "x" }, ack);

    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when messageId is missing", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!({ conversationId: CONV_ID, content: "x" }, ack);

    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when content is empty", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "" },
      ack,
    );

    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when content exceeds 4000 characters", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "x".repeat(4001) },
      ack,
    );

    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when user is not a conversation member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "x" },
      ack,
    );

    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns NOT_FOUND error when service throws NOT_FOUND code", async () => {
    const err = new Error("not found") as NodeJS.ErrnoException;
    err.code = "NOT_FOUND";
    mockUpdateMessage.mockRejectedValue(err);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "x" },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns FORBIDDEN error when service throws FORBIDDEN code", async () => {
    const err = new Error("forbidden") as NodeJS.ErrnoException;
    err.code = "FORBIDDEN";
    mockUpdateMessage.mockRejectedValue(err);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "x" },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns GONE error when service throws GONE code", async () => {
    const err = new Error("gone") as NodeJS.ErrnoException;
    err.code = "GONE";
    mockUpdateMessage.mockRejectedValue(err);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:edit"]![0]!(
      { conversationId: CONV_ID, messageId: MSG_ID, content: "x" },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

describe("message:delete handler", () => {
  async function triggerConnect(userId = USER_ID) {
    const { socket, events } = makeSocket(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns };
  }

  it("deletes message via messageService and ACKs success", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ conversationId: CONV_ID, messageId: MSG_ID }, ack);

    expect(mockDeleteMessage).toHaveBeenCalledWith(MSG_ID, USER_ID);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("rejects when conversationId is missing", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ messageId: MSG_ID }, ack);

    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when messageId is missing", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ conversationId: CONV_ID }, ack);

    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("rejects when user is not a conversation member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ conversationId: CONV_ID, messageId: MSG_ID }, ack);

    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns NOT_FOUND error when service throws NOT_FOUND code", async () => {
    const err = new Error("not found") as NodeJS.ErrnoException;
    err.code = "NOT_FOUND";
    mockDeleteMessage.mockRejectedValue(err);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ conversationId: CONV_ID, messageId: MSG_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns FORBIDDEN error when service throws FORBIDDEN code", async () => {
    const err = new Error("forbidden") as NodeJS.ErrnoException;
    err.code = "FORBIDDEN";
    mockDeleteMessage.mockRejectedValue(err);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ conversationId: CONV_ID, messageId: MSG_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns GONE error when service throws GONE code", async () => {
    const err = new Error("gone") as NodeJS.ErrnoException;
    err.code = "GONE";
    mockDeleteMessage.mockRejectedValue(err);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delete"]![0]!({ conversationId: CONV_ID, messageId: MSG_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});

describe("typing:start handler", () => {
  function makeSocketWithTo(userId: string = USER_ID) {
    const events: Record<string, ((...args: unknown[]) => void)[]> = {};
    const toEmit = vi.fn();
    const toChain = { emit: toEmit };
    const socket = {
      data: { userId },
      join: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
      to: vi.fn().mockReturnValue(toChain),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        events[event] = events[event] ?? [];
        events[event]!.push(cb);
      }),
    } as unknown as Socket;
    return { socket, events, toEmit };
  }

  async function triggerConnect(userId = USER_ID) {
    const { socket, events, toEmit } = makeSocketWithTo(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns, toEmit };
  }

  it("stores typing state in Redis and broadcasts to room", async () => {
    const { events, toEmit } = await triggerConnect();
    const ack = vi.fn();

    await events["typing:start"]![0]!({ conversationId: CONV_ID }, ack);

    expect(mockRedis.set).toHaveBeenCalledWith(`typing:${CONV_ID}:${USER_ID}`, "1", "EX", 5);
    expect(toEmit).toHaveBeenCalledWith(
      "typing:start",
      expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID }),
    );
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it("returns error for invalid conversationId", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["typing:start"]![0]!({ conversationId: "" }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(mockRedis.set).not.toHaveBeenCalledWith(
      expect.stringContaining("typing:"),
      "1",
      "EX",
      5,
    );
  });

  it("returns error when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["typing:start"]![0]!({ conversationId: CONV_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: "Not a member" }));
  });
});

describe("typing:stop handler", () => {
  function makeSocketWithTo(userId: string = USER_ID) {
    const events: Record<string, ((...args: unknown[]) => void)[]> = {};
    const toEmit = vi.fn();
    const toChain = { emit: toEmit };
    const socket = {
      data: { userId },
      join: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
      to: vi.fn().mockReturnValue(toChain),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        events[event] = events[event] ?? [];
        events[event]!.push(cb);
      }),
    } as unknown as Socket;
    return { socket, events, toEmit };
  }

  async function triggerConnect(userId = USER_ID) {
    const { socket, events, toEmit } = makeSocketWithTo(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns, toEmit };
  }

  it("deletes Redis key and broadcasts to room", async () => {
    const { events, toEmit } = await triggerConnect();

    await events["typing:stop"]![0]!({ conversationId: CONV_ID });

    expect(mockRedis.del).toHaveBeenCalledWith(`typing:${CONV_ID}:${USER_ID}`);
    expect(toEmit).toHaveBeenCalledWith(
      "typing:stop",
      expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID }),
    );
  });

  it("ignores invalid conversationId", async () => {
    const { events } = await triggerConnect();

    // Should not throw
    await events["typing:stop"]![0]!({ conversationId: "" });

    expect(mockRedis.del).not.toHaveBeenCalledWith(expect.stringContaining("typing:"));
  });

  it("rejects non-member (does not delete Redis key or broadcast)", async () => {
    mockIsConversationMember.mockResolvedValueOnce(false);
    const { events, toEmit } = await triggerConnect();

    await events["typing:stop"]![0]!({ conversationId: CONV_ID });

    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(toEmit).not.toHaveBeenCalled();
  });
});

describe("message:delivered handler (Story 2.6 — real implementation)", () => {
  function makeSocketWithTo(userId: string = USER_ID) {
    const events: Record<string, ((...args: unknown[]) => void)[]> = {};
    const toEmit = vi.fn();
    const toChain = { emit: toEmit };
    const socket = {
      data: { userId },
      join: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
      to: vi.fn().mockReturnValue(toChain),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        events[event] = events[event] ?? [];
        events[event]!.push(cb);
      }),
    } as unknown as Socket;
    return { socket, events, toEmit };
  }

  async function triggerConnect(userId = USER_ID) {
    const { socket, events, toEmit } = makeSocketWithTo(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns, toEmit };
  }

  it("stores delivery in Redis and broadcasts to room", async () => {
    const { events, toEmit } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delivered"]![0]!({ messageId: MSG_ID, conversationId: CONV_ID }, ack);

    expect(mockRedis.set).toHaveBeenCalledWith(`delivered:${MSG_ID}:${USER_ID}`, "1", "EX", 86_400);
    expect(toEmit).toHaveBeenCalledWith(
      "message:delivered",
      expect.objectContaining({ messageId: MSG_ID, deliveredBy: USER_ID }),
    );
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it("returns error for missing payload fields", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delivered"]![0]!({ messageId: "", conversationId: "" }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it("returns error for non-string messageId or conversationId", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delivered"]![0]!({ messageId: 123, conversationId: CONV_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid payload" }));
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("returns error when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:delivered"]![0]!({ messageId: MSG_ID, conversationId: CONV_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: "Not a member" }));
  });
});

describe("message:read handler", () => {
  async function triggerConnect(userId = USER_ID) {
    const { socket, events } = makeSocket(userId);
    const { ns, connectionCallbacks } = makeNamespace(socket);
    setupChatNamespace(ns, mockRedis);
    await connectionCallbacks[0]!(socket);
    return { socket, events, ns };
  }

  it("calls markConversationRead and broadcasts to room", async () => {
    const { events, ns } = await triggerConnect();
    const ack = vi.fn();

    await events["message:read"]![0]!({ conversationId: CONV_ID }, ack);

    expect(mockMarkConversationRead).toHaveBeenCalledWith(CONV_ID, USER_ID);
    const nsMock = ns as unknown as { emit: ReturnType<typeof vi.fn> };
    expect(nsMock.emit).toHaveBeenCalledWith(
      "message:read",
      expect.objectContaining({ conversationId: CONV_ID, readerId: USER_ID }),
    );
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it("returns error for invalid conversationId", async () => {
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:read"]![0]!({ conversationId: "" }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(mockMarkConversationRead).not.toHaveBeenCalled();
  });

  it("returns error when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { events } = await triggerConnect();
    const ack = vi.fn();

    await events["message:read"]![0]!({ conversationId: CONV_ID }, ack);

    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ error: "Not a member" }));
    expect(mockMarkConversationRead).not.toHaveBeenCalled();
  });
});
