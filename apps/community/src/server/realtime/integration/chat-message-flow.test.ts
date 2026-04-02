// @vitest-environment node
/**
 * Socket.IO integration test for /chat namespace message flow.
 *
 * Uses a real Socket.IO Server bound to port 0 (OS-assigned) in-process.
 * All DB and service layers are mocked — this validates handler logic at the
 * real TCP/event level, catching event name mismatches and ACK shape errors
 * that unit tests with mock sockets cannot catch.
 *
 * What is NOT tested here (tested elsewhere):
 *   - message:new broadcast — goes through EventBus→Redis→bridge (eventbus-bridge.test.ts)
 *   - typing, sync, message:edit/delete — already covered in chat.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import type Redis from "ioredis";

// ── Config mock ───────────────────────────────────────────────────────────────
vi.mock("@igbo/config/realtime", () => ({
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_CONVERSATION: (id: string) => `conversation:${id}`,
  CHAT_REPLAY_WINDOW_MS: 86_400_000,
  REDIS_TYPING_KEY: (convId: string, userId: string) => `typing:${convId}:${userId}`,
  TYPING_EXPIRE_SECONDS: 5,
}));

// ── DB query mocks ────────────────────────────────────────────────────────────
const mockGetUserConversationIds = vi.hoisted(() => vi.fn());
const mockIsConversationMember = vi.hoisted(() => vi.fn());
const mockMarkConversationRead = vi.hoisted(() => vi.fn());
const mockGetConversationMembers = vi.hoisted(() => vi.fn());
const mockGetMessagesSince = vi.hoisted(() => vi.fn());
const mockGetAttachmentsForMessages = vi.hoisted(() => vi.fn());
const mockGetReactionsForMessages = vi.hoisted(() => vi.fn());
const mockGetUsersWhoBlocked = vi.hoisted(() => vi.fn());
const mockGetFileUploadById = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/chat-conversations", () => ({
  getUserConversationIds: (...args: unknown[]) => mockGetUserConversationIds(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  markConversationRead: (...args: unknown[]) => mockMarkConversationRead(...args),
  // Exposed via dynamic import inside checkIfAnyMemberBlocked
  getConversationMembers: (...args: unknown[]) => mockGetConversationMembers(...args),
}));

vi.mock("@/db/queries/chat-messages", () => ({
  getMessagesSince: (...args: unknown[]) => mockGetMessagesSince(...args),
}));

vi.mock("@/db/queries/chat-message-attachments", () => ({
  getAttachmentsForMessages: (...args: unknown[]) => mockGetAttachmentsForMessages(...args),
}));

vi.mock("@/db/queries/chat-message-reactions", () => ({
  getReactionsForMessages: (...args: unknown[]) => mockGetReactionsForMessages(...args),
}));

// Exposed via dynamic import inside checkIfAnyMemberBlocked
vi.mock("@/db/queries/block-mute", () => ({
  getUsersWhoBlocked: (...args: unknown[]) => mockGetUsersWhoBlocked(...args),
}));

// Exposed via dynamic import inside validateAttachments
vi.mock("@/db/queries/file-uploads", () => ({
  getFileUploadById: (...args: unknown[]) => mockGetFileUploadById(...args),
}));

// ── Service mocks ─────────────────────────────────────────────────────────────
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockSendMessageWithAttachments = vi.hoisted(() => vi.fn());
const mockUpdateMessage = vi.hoisted(() => vi.fn());
const mockDeleteMessage = vi.hoisted(() => vi.fn());

vi.mock("@/services/message-service", () => ({
  messageService: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    sendMessageWithAttachments: (...args: unknown[]) => mockSendMessageWithAttachments(...args),
    updateMessage: (...args: unknown[]) => mockUpdateMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  },
}));

// ── Test constants ────────────────────────────────────────────────────────────
const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_CONV_ID = "00000000-0000-4000-8000-000000000002";
const TEST_MSG_ID = "00000000-0000-4000-8000-000000000003";

const TEST_MESSAGE = {
  conversationId: TEST_CONV_ID,
  senderId: TEST_USER_ID,
  content: "Hello from integration test",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-02-28T10:00:00Z"),
};

// ── Server lifecycle ──────────────────────────────────────────────────────────
import { setupChatNamespace } from "../namespaces/chat";

const mockRedis = {
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  get: vi.fn().mockResolvedValue(null),
} as unknown as Redis;

let serverPort: number;
let io: Server;
let httpServer: ReturnType<typeof createServer>;
let client: ClientSocket;

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer, { transports: ["websocket"] });

  const chatNs = io.of("/chat");

  // Test auth bypass — sets userId without JWT validation
  chatNs.use((socket, next) => {
    socket.data.userId = TEST_USER_ID;
    next();
  });

  setupChatNamespace(chatNs, mockRedis);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  serverPort = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock behaviours — happy path
  mockGetUserConversationIds.mockResolvedValue([TEST_CONV_ID]);
  mockIsConversationMember.mockResolvedValue(true);
  mockGetConversationMembers.mockResolvedValue([{ userId: "other-user-id" }]);
  mockGetUsersWhoBlocked.mockResolvedValue([]); // no blockers by default
  mockSendMessage.mockResolvedValue({ id: TEST_MSG_ID, ...TEST_MESSAGE });
  mockMarkConversationRead.mockResolvedValue(undefined);
});

afterEach(() => {
  if (client?.connected) {
    client.disconnect();
  }
});

// ── Helper: connect and wait for socket to be ready ───────────────────────────
function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${serverPort}/chat`, {
      transports: ["websocket"],
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

// ── Helper: emit with ACK (real async — no fake timers) ───────────────────────
function emitWithAck(socket: ClientSocket, event: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Socket.IO /chat integration — message:send flow", () => {
  it("client connects to /chat without errors", async () => {
    client = await connectClient();
    expect(client.connected).toBe(true);
  });

  it("message:send with valid payload returns ACK { messageId }", async () => {
    client = await connectClient();

    const ack = await emitWithAck(client, "message:send", {
      conversationId: TEST_CONV_ID,
      content: "Hello!",
    });

    expect(ack).toMatchObject({ messageId: TEST_MSG_ID });
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: TEST_CONV_ID,
        senderId: TEST_USER_ID,
        content: "Hello!",
      }),
    );
  });

  it("message:send missing conversationId returns ACK { error } and does not call sendMessage", async () => {
    client = await connectClient();

    const ack = await emitWithAck(client, "message:send", {
      content: "No conversation ID",
    });

    expect(ack).toMatchObject({ error: expect.any(String) });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("message:send when not a conversation member returns ACK { error }", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    client = await connectClient();

    const ack = await emitWithAck(client, "message:send", {
      conversationId: TEST_CONV_ID,
      content: "Sneaky message",
    });

    expect(ack).toMatchObject({ error: expect.any(String) });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("message:send when sender is blocked by a member returns ACK { error }", async () => {
    // other-user has blocked TEST_USER_ID
    mockGetUsersWhoBlocked.mockResolvedValue(["other-user-id"]);
    mockGetConversationMembers.mockResolvedValue([{ userId: "other-user-id" }]);
    client = await connectClient();

    const ack = await emitWithAck(client, "message:send", {
      conversationId: TEST_CONV_ID,
      content: "Blocked message",
    });

    expect(ack).toMatchObject({ error: expect.any(String) });
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe("Socket.IO /chat integration — auto-join", () => {
  it("emits conversation:joined for each conversation on connect", async () => {
    const joinedConvIds: string[] = [];

    await new Promise<void>((resolve, reject) => {
      client = ioc(`http://localhost:${serverPort}/chat`, {
        transports: ["websocket"],
        forceNew: true,
      });

      client.on("conversation:joined", (payload: { conversationId: string }) => {
        joinedConvIds.push(payload.conversationId);
        if (joinedConvIds.length >= 1) resolve();
      });

      client.once("connect_error", reject);

      // Safety timeout in case the event never fires
      setTimeout(() => {
        if (joinedConvIds.length === 0) reject(new Error("conversation:joined never received"));
      }, 2000);
    });

    expect(joinedConvIds).toContain(TEST_CONV_ID);
    expect(mockGetUserConversationIds).toHaveBeenCalledWith(TEST_USER_ID);
  });
});
