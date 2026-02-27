// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const mockCreateMessage = vi.hoisted(() => vi.fn());
const mockGetMessageById = vi.hoisted(() => vi.fn());
const mockGetConversationMessages = vi.hoisted(() => vi.fn());
const mockEventBusEmit = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/chat-messages", () => ({
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
  getMessageById: (...args: unknown[]) => mockGetMessageById(...args),
  getConversationMessages: (...args: unknown[]) => mockGetConversationMessages(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEventBusEmit(...args),
    on: vi.fn(),
  },
}));

import { messageService } from "./message-service";

const CONV_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("messageService.sendMessage", () => {
  it("creates message and returns it", async () => {
    mockCreateMessage.mockResolvedValue(mockMessage);

    const result = await messageService.sendMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Hello!",
    });

    expect(result).toEqual(mockMessage);
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Hello!",
        contentType: "text",
      }),
    );
  });

  it("defaults contentType to 'text'", async () => {
    mockCreateMessage.mockResolvedValue(mockMessage);
    await messageService.sendMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Hello!",
    });
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "text" }),
    );
  });

  it("uses provided contentType", async () => {
    const richMsg = { ...mockMessage, contentType: "rich_text" as const };
    mockCreateMessage.mockResolvedValue(richMsg);
    await messageService.sendMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "<p>Hi</p>",
      contentType: "rich_text",
    });
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "rich_text" }),
    );
  });

  it("passes parentMessageId when provided", async () => {
    const PARENT_ID = "00000000-0000-4000-8000-000000000099";
    mockCreateMessage.mockResolvedValue({ ...mockMessage, parentMessageId: PARENT_ID });
    await messageService.sendMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Reply",
      parentMessageId: PARENT_ID,
    });
    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ parentMessageId: PARENT_ID }),
    );
  });

  it("emits message.sent event with full payload", async () => {
    mockCreateMessage.mockResolvedValue(mockMessage);
    await messageService.sendMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Hello!",
    });

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "message.sent",
      expect.objectContaining({
        messageId: MSG_ID,
        senderId: USER_ID,
        conversationId: CONV_ID,
        content: "Hello!",
        contentType: "text",
        createdAt: mockMessage.createdAt.toISOString(),
        timestamp: mockMessage.createdAt.toISOString(),
      }),
    );
  });

  it("propagates DB errors", async () => {
    mockCreateMessage.mockRejectedValue(new Error("DB error"));
    await expect(
      messageService.sendMessage({ conversationId: CONV_ID, senderId: USER_ID, content: "Hi" }),
    ).rejects.toThrow("DB error");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });
});

describe("messageService.getMessage", () => {
  it("returns message when found", async () => {
    mockGetMessageById.mockResolvedValue(mockMessage);
    const result = await messageService.getMessage(MSG_ID);
    expect(result).toEqual(mockMessage);
  });

  it("returns null when not found", async () => {
    mockGetMessageById.mockResolvedValue(null);
    const result = await messageService.getMessage(MSG_ID);
    expect(result).toBeNull();
  });
});

describe("messageService.getMessages", () => {
  it("returns messages and hasMore flag", async () => {
    mockGetConversationMessages.mockResolvedValue({ messages: [mockMessage], hasMore: false });
    const result = await messageService.getMessages(CONV_ID);
    expect(result.messages).toEqual([mockMessage]);
    expect(result.hasMore).toBe(false);
  });

  it("passes pagination params", async () => {
    mockGetConversationMessages.mockResolvedValue({ messages: [], hasMore: false });
    await messageService.getMessages(CONV_ID, { cursor: MSG_ID, limit: 10, direction: "before" });
    expect(mockGetConversationMessages).toHaveBeenCalledWith(CONV_ID, {
      cursor: MSG_ID,
      limit: 10,
      direction: "before",
    });
  });
});
