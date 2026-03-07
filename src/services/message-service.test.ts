// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const mockCreateMessage = vi.hoisted(() => vi.fn());
const mockGetMessageById = vi.hoisted(() => vi.fn());
const mockGetMessageByIdUnfiltered = vi.hoisted(() => vi.fn());
const mockUpdateMessageContent = vi.hoisted(() => vi.fn());
const mockGetThreadRepliesDb = vi.hoisted(() => vi.fn());
const mockGetConversationMessages = vi.hoisted(() => vi.fn());
const mockEventBusEmit = vi.hoisted(() => vi.fn());
const mockGetAttachmentsForMessages = vi.hoisted(() => vi.fn());
const mockGetReactionsForMessages = vi.hoisted(() => vi.fn());
const mockGetFileUploadById = vi.hoisted(() => vi.fn());
const mockDbAddReaction = vi.hoisted(() => vi.fn());
const mockDbRemoveReaction = vi.hoisted(() => vi.fn());
const mockDbTransaction = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/db/queries/chat-messages", () => ({
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
  getMessageById: (...args: unknown[]) => mockGetMessageById(...args),
  getMessageByIdUnfiltered: (...args: unknown[]) => mockGetMessageByIdUnfiltered(...args),
  updateMessageContent: (...args: unknown[]) => mockUpdateMessageContent(...args),
  getConversationMessages: (...args: unknown[]) => mockGetConversationMessages(...args),
  getThreadReplies: (...args: unknown[]) => mockGetThreadRepliesDb(...args),
}));

vi.mock("@/db/queries/chat-message-attachments", () => ({
  getAttachmentsForMessages: (...args: unknown[]) => mockGetAttachmentsForMessages(...args),
}));

vi.mock("@/db/queries/chat-message-reactions", () => ({
  addReaction: (...args: unknown[]) => mockDbAddReaction(...args),
  removeReaction: (...args: unknown[]) => mockDbRemoveReaction(...args),
  getReactionsForMessages: (...args: unknown[]) => mockGetReactionsForMessages(...args),
}));

vi.mock("@/db/queries/file-uploads", () => ({
  getFileUploadById: (...args: unknown[]) => mockGetFileUploadById(...args),
}));

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema/chat-messages", () => ({
  chatMessages: {
    id: {},
    conversationId: {},
    senderId: {},
    content: {},
    contentType: {},
    parentMessageId: {},
    createdAt: {},
  },
}));

vi.mock("@/db/schema/chat-conversations", () => ({
  chatConversations: { id: {}, type: {}, updatedAt: {} },
  chatConversationMembers: { conversationId: {}, userId: {} },
}));

vi.mock("@/db/schema/auth-users", () => ({
  authUsers: { id: {}, name: {} },
}));

vi.mock("@/db/schema/chat-message-attachments", () => ({
  chatMessageAttachments: {
    id: {},
    messageId: {},
    fileUploadId: {},
    fileUrl: {},
    fileName: {},
    fileType: {},
    fileSize: {},
  },
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
const UPLOAD_ID = "00000000-0000-4000-8000-000000000004";

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

// Fluent select chain helper: db.select().from().where().limit() resolves to given value
function makeSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  // Also make `.where()` directly awaitable (for count query without .limit())
  chain.where.mockImplementation((..._args: unknown[]) => {
    const awaitable = Object.assign(Promise.resolve(result), chain);
    return awaitable;
  });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: getMessages returns empty
  mockGetAttachmentsForMessages.mockResolvedValue([]);
  mockGetReactionsForMessages.mockResolvedValue([]);
  // Default: db.update fluent chain resolves cleanly
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
  // Default: db.select() chain — conversation type = "group" (safe default; doesn't trigger DM email path)
  mockDbSelect.mockImplementation(() => makeSelectChain([{ type: "group" }]));
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

describe("messageService.sendMessageWithAttachments", () => {
  const mockAttachment = {
    id: "att-1",
    messageId: MSG_ID,
    fileUploadId: UPLOAD_ID,
    fileUrl: "https://cdn.example.com/img.jpg",
    fileName: "img.jpg",
    fileType: "image/jpeg",
    fileSize: 12345,
    createdAt: new Date(),
  };

  it("creates message with attachments in transaction", async () => {
    mockGetFileUploadById.mockResolvedValue(mockReadyUpload);
    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const sharedReturning = vi
        .fn()
        .mockResolvedValueOnce([mockMessage])
        .mockResolvedValueOnce([mockAttachment]);
      const fakeTx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ returning: sharedReturning })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      };
      return fn(fakeTx);
    });

    const result = await messageService.sendMessageWithAttachments({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Check this out!",
      attachmentFileUploadIds: [UPLOAD_ID],
    });

    expect(result).toEqual(mockMessage);
    expect(mockDbTransaction).toHaveBeenCalledOnce();
  });

  it("throws error when too many attachments", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `upload-${i}`);
    await expect(
      messageService.sendMessageWithAttachments({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Too many",
        attachmentFileUploadIds: ids,
      }),
    ).rejects.toThrow("Cannot attach more than 10 files per message");
  });

  it("throws error when file upload not found", async () => {
    mockGetFileUploadById.mockResolvedValue(null);
    await expect(
      messageService.sendMessageWithAttachments({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Test",
        attachmentFileUploadIds: [UPLOAD_ID],
      }),
    ).rejects.toThrow(`File upload not found: ${UPLOAD_ID}`);
  });

  it("throws error when file upload is not ready", async () => {
    mockGetFileUploadById.mockResolvedValue({ ...mockReadyUpload, status: "pending_scan" });
    await expect(
      messageService.sendMessageWithAttachments({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Test",
        attachmentFileUploadIds: [UPLOAD_ID],
      }),
    ).rejects.toThrow(`File upload is not ready: ${UPLOAD_ID}`);
  });

  it("throws error when upload does not belong to sender", async () => {
    const otherUserUpload = { ...mockReadyUpload, uploaderId: "other-user-id" };
    mockGetFileUploadById.mockResolvedValue(otherUserUpload);
    await expect(
      messageService.sendMessageWithAttachments({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Test",
        attachmentFileUploadIds: [UPLOAD_ID],
      }),
    ).rejects.toThrow(`File upload does not belong to sender: ${UPLOAD_ID}`);
  });

  it("emits message.sent event with attachments payload", async () => {
    mockGetFileUploadById.mockResolvedValue(mockReadyUpload);
    mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Shared returning mock so sequential insert().values().returning() calls
      // return the correct value each time (first: message row, second: attachment row)
      const sharedReturning = vi
        .fn()
        .mockResolvedValueOnce([mockMessage])
        .mockResolvedValueOnce([mockAttachment]);
      const fakeTx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({ returning: sharedReturning })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
      };
      return fn(fakeTx);
    });

    await messageService.sendMessageWithAttachments({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "With attachment",
      attachmentFileUploadIds: [UPLOAD_ID],
    });

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "message.sent",
      expect.objectContaining({
        messageId: MSG_ID,
        attachments: expect.arrayContaining([
          expect.objectContaining({ fileUrl: "https://cdn.example.com/img.jpg" }),
        ]),
      }),
    );
  });
});

describe("messageService.sendSystemMessage", () => {
  it("creates a message with contentType=system", async () => {
    const sysMsg = { ...mockMessage, contentType: "system" as const };
    mockCreateMessage.mockResolvedValue(sysMsg);

    const result = await messageService.sendSystemMessage(CONV_ID, USER_ID, "Ada was added");

    expect(mockCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Ada was added",
        contentType: "system",
      }),
    );
    expect(result.contentType).toBe("system");
  });

  it("emits message.sent event with system contentType", async () => {
    const sysMsg = { ...mockMessage, contentType: "system" as const };
    mockCreateMessage.mockResolvedValue(sysMsg);

    await messageService.sendSystemMessage(CONV_ID, USER_ID, "Ada left");

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "message.sent",
      expect.objectContaining({
        contentType: "system",
        conversationId: CONV_ID,
      }),
    );
  });

  it("propagates DB errors without emitting event", async () => {
    mockCreateMessage.mockRejectedValue(new Error("DB error"));
    await expect(messageService.sendSystemMessage(CONV_ID, USER_ID, "test")).rejects.toThrow(
      "DB error",
    );
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
    expect(result.messages).toHaveLength(1);
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

  it("batch-loads attachments and groups by messageId", async () => {
    const msg2Id = "00000000-0000-4000-8000-000000000010";
    const msg2 = { ...mockMessage, id: msg2Id };
    mockGetConversationMessages.mockResolvedValue({
      messages: [mockMessage, msg2],
      hasMore: false,
    });
    mockGetAttachmentsForMessages.mockResolvedValue([
      {
        id: "att-1",
        messageId: MSG_ID,
        fileUploadId: UPLOAD_ID,
        fileUrl: "https://cdn.example.com/img.jpg",
        fileName: "img.jpg",
        fileType: "image/jpeg",
        fileSize: 100,
        createdAt: new Date(),
      },
    ]);

    const result = await messageService.getMessages(CONV_ID);
    expect(mockGetAttachmentsForMessages).toHaveBeenCalledWith([MSG_ID, msg2Id]);
    expect(result.messages).toHaveLength(2);
  });

  it("returns empty when no messages", async () => {
    mockGetConversationMessages.mockResolvedValue({ messages: [], hasMore: false });
    const result = await messageService.getMessages(CONV_ID);
    expect(result.messages).toEqual([]);
    expect(mockGetAttachmentsForMessages).not.toHaveBeenCalled();
  });
});

describe("messageService.addReaction", () => {
  it("adds reaction and emits reaction.added event", async () => {
    mockDbAddReaction.mockResolvedValue({
      messageId: MSG_ID,
      userId: USER_ID,
      emoji: "👍",
      createdAt: new Date(),
    });

    const result = await messageService.addReaction(MSG_ID, USER_ID, "👍", CONV_ID);

    expect(result).toEqual({ messageId: MSG_ID, userId: USER_ID, emoji: "👍" });
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "reaction.added",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        emoji: "👍",
      }),
    );
  });

  it("returns null and does not emit when reaction already exists", async () => {
    mockDbAddReaction.mockResolvedValue(null);

    const result = await messageService.addReaction(MSG_ID, USER_ID, "👍", CONV_ID);

    expect(result).toBeNull();
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });
});

describe("messageService.removeReaction", () => {
  it("removes reaction and emits reaction.removed event", async () => {
    mockDbRemoveReaction.mockResolvedValue(true);

    const result = await messageService.removeReaction(MSG_ID, USER_ID, "👍", CONV_ID);

    expect(result).toBe(true);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "reaction.removed",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        userId: USER_ID,
        emoji: "👍",
      }),
    );
  });

  it("returns false and does not emit when reaction not found", async () => {
    mockDbRemoveReaction.mockResolvedValue(false);

    const result = await messageService.removeReaction(MSG_ID, USER_ID, "👍", CONV_ID);

    expect(result).toBe(false);
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });
});

describe("messageService.updateMessage", () => {
  const updatedMessage = {
    ...mockMessage,
    content: "Updated content",
    editedAt: new Date("2026-02-01T12:05:00Z"),
  };

  it("updates content and returns updated message", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue(mockMessage);
    mockUpdateMessageContent.mockResolvedValue(updatedMessage);

    const result = await messageService.updateMessage(MSG_ID, USER_ID, "Updated content");

    expect(result).toEqual(updatedMessage);
    expect(mockUpdateMessageContent).toHaveBeenCalledWith(MSG_ID, "Updated content");
  });

  it("emits message.edited event with correct payload", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue(mockMessage);
    mockUpdateMessageContent.mockResolvedValue(updatedMessage);

    await messageService.updateMessage(MSG_ID, USER_ID, "Updated content");

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "message.edited",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Updated content",
        editedAt: updatedMessage.editedAt!.toISOString(),
      }),
    );
  });

  it("throws NOT_FOUND when message does not exist", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue(null);

    const err = await messageService.updateMessage(MSG_ID, USER_ID, "x").catch((e) => e);

    expect((err as NodeJS.ErrnoException).code).toBe("NOT_FOUND");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when user is not the sender", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue({ ...mockMessage, senderId: "other-user-id" });

    const err = await messageService.updateMessage(MSG_ID, USER_ID, "x").catch((e) => e);

    expect((err as NodeJS.ErrnoException).code).toBe("FORBIDDEN");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("throws GONE when message is already deleted", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue({
      ...mockMessage,
      deletedAt: new Date("2026-01-31T10:00:00Z"),
    });

    const err = await messageService.updateMessage(MSG_ID, USER_ID, "x").catch((e) => e);

    expect((err as NodeJS.ErrnoException).code).toBe("GONE");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });
});

describe("messageService.deleteMessage", () => {
  it("soft-deletes message and emits message.deleted event", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue(mockMessage);

    await messageService.deleteMessage(MSG_ID, USER_ID);

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "message.deleted",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
      }),
    );
  });

  it("returns void (not the deleted row) on success", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue(mockMessage);

    const result = await messageService.deleteMessage(MSG_ID, USER_ID);

    expect(result).toBeUndefined();
  });

  it("throws NOT_FOUND when message does not exist", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue(null);

    const err = await messageService.deleteMessage(MSG_ID, USER_ID).catch((e) => e);

    expect((err as NodeJS.ErrnoException).code).toBe("NOT_FOUND");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when user is not the sender", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue({ ...mockMessage, senderId: "other-user-id" });

    const err = await messageService.deleteMessage(MSG_ID, USER_ID).catch((e) => e);

    expect((err as NodeJS.ErrnoException).code).toBe("FORBIDDEN");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });

  it("throws GONE when message is already deleted", async () => {
    mockGetMessageByIdUnfiltered.mockResolvedValue({
      ...mockMessage,
      deletedAt: new Date("2026-01-31T10:00:00Z"),
    });

    const err = await messageService.deleteMessage(MSG_ID, USER_ID).catch((e) => e);

    expect((err as NodeJS.ErrnoException).code).toBe("GONE");
    expect(mockEventBusEmit).not.toHaveBeenCalled();
  });
});

describe("messageService.getThreadReplies", () => {
  const PARENT_ID = "00000000-0000-4000-8000-000000000050";
  const reply1 = {
    ...mockMessage,
    id: "00000000-0000-4000-8000-000000000051",
    parentMessageId: PARENT_ID,
  };
  const reply2 = {
    ...mockMessage,
    id: "00000000-0000-4000-8000-000000000052",
    parentMessageId: PARENT_ID,
  };

  it("returns empty array when no replies exist", async () => {
    mockGetThreadRepliesDb.mockResolvedValue([]);

    const result = await messageService.getThreadReplies(PARENT_ID);

    expect(result).toEqual([]);
    expect(mockGetAttachmentsForMessages).not.toHaveBeenCalled();
    expect(mockGetReactionsForMessages).not.toHaveBeenCalled();
  });

  it("batch-loads attachments and reactions for replies", async () => {
    mockGetThreadRepliesDb.mockResolvedValue([reply1, reply2]);

    const result = await messageService.getThreadReplies(PARENT_ID);

    expect(result).toHaveLength(2);
    expect(mockGetAttachmentsForMessages).toHaveBeenCalledWith([reply1.id, reply2.id]);
    expect(mockGetReactionsForMessages).toHaveBeenCalledWith([reply1.id, reply2.id]);
  });

  it("associates attachments with their reply message", async () => {
    mockGetThreadRepliesDb.mockResolvedValue([reply1]);
    mockGetAttachmentsForMessages.mockResolvedValue([
      {
        id: "att-r1",
        messageId: reply1.id,
        fileUploadId: UPLOAD_ID,
        fileUrl: "https://cdn.example.com/r1.jpg",
        fileName: "r1.jpg",
        fileType: "image/jpeg",
        fileSize: 999,
        createdAt: new Date(),
      },
    ]);

    const result = await messageService.getThreadReplies(PARENT_ID);

    const rows = result as unknown as Array<{ _attachments: { id: string }[] }>;
    expect(rows[0]?._attachments).toHaveLength(1);
  });
});

describe("mention detection (via sendMessage)", () => {
  const MENTIONED_ID = "00000000-0000-4000-8000-000000000099";

  it("emits message.mentioned when content contains a mention token", async () => {
    const content = `Hello @[Ada](mention:${MENTIONED_ID})!`;
    mockCreateMessage.mockResolvedValue({ ...mockMessage, content });

    await messageService.sendMessage({ conversationId: CONV_ID, senderId: USER_ID, content });

    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "message.mentioned",
      expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        mentionedUserIds: [MENTIONED_ID],
      }),
    );
  });

  it("does not emit message.mentioned when sender mentions themselves", async () => {
    const content = `@[Me](mention:${USER_ID}) reminding myself`;
    mockCreateMessage.mockResolvedValue({ ...mockMessage, content });

    await messageService.sendMessage({ conversationId: CONV_ID, senderId: USER_ID, content });

    const mentionCalls = mockEventBusEmit.mock.calls.filter((c) => c[0] === "message.mentioned");
    expect(mentionCalls).toHaveLength(0);
  });

  it("collects multiple unique mentioned user IDs", async () => {
    const ID1 = "00000000-0000-4000-8000-000000000091";
    const ID2 = "00000000-0000-4000-8000-000000000092";
    const content = `@[Ada](mention:${ID1}) and @[Eze](mention:${ID2}) hi`;
    mockCreateMessage.mockResolvedValue({ ...mockMessage, content });

    await messageService.sendMessage({ conversationId: CONV_ID, senderId: USER_ID, content });

    const mentionCall = mockEventBusEmit.mock.calls.find((c) => c[0] === "message.mentioned");
    expect(mentionCall).toBeTruthy();
    const ids = (mentionCall![1] as { mentionedUserIds: string[] }).mentionedUserIds;
    expect(ids).toHaveLength(2);
    expect(ids).toContain(ID1);
    expect(ids).toContain(ID2);
  });

  it("de-duplicates repeated mentions of the same user", async () => {
    const content = `@[Ada](mention:${MENTIONED_ID}) and @[Ada](mention:${MENTIONED_ID}) again`;
    mockCreateMessage.mockResolvedValue({ ...mockMessage, content });

    await messageService.sendMessage({ conversationId: CONV_ID, senderId: USER_ID, content });

    const mentionCall = mockEventBusEmit.mock.calls.find((c) => c[0] === "message.mentioned");
    expect(mentionCall).toBeTruthy();
    expect((mentionCall![1] as { mentionedUserIds: string[] }).mentionedUserIds).toHaveLength(1);
  });

  it("does not emit message.mentioned when content has no mentions", async () => {
    mockCreateMessage.mockResolvedValue(mockMessage);

    await messageService.sendMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Hello world",
    });

    const mentionCalls = mockEventBusEmit.mock.calls.filter((c) => c[0] === "message.mentioned");
    expect(mentionCalls).toHaveLength(0);
  });

  it("includes contentPreview (first 100 chars) in event payload", async () => {
    const content = `@[Ada](mention:${MENTIONED_ID}) short message`;
    mockCreateMessage.mockResolvedValue({ ...mockMessage, content });

    await messageService.sendMessage({ conversationId: CONV_ID, senderId: USER_ID, content });

    const mentionCall = mockEventBusEmit.mock.calls.find((c) => c[0] === "message.mentioned");
    expect((mentionCall![1] as { contentPreview: string }).contentPreview).toBe(content);
  });
});

describe("messageService.getMessages (soft-delete content blanking)", () => {
  it("blanks content for soft-deleted messages", async () => {
    const deletedMsg = {
      ...mockMessage,
      id: "00000000-0000-4000-8000-000000000060",
      deletedAt: new Date("2026-02-01T11:00:00Z"),
      content: "secret content",
    };
    mockGetConversationMessages.mockResolvedValue({
      messages: [deletedMsg, mockMessage],
      hasMore: false,
    });

    const result = await messageService.getMessages(CONV_ID);

    const deleted = result.messages.find((m) => m.deletedAt !== null);
    const alive = result.messages.find((m) => m.deletedAt === null);
    expect(deleted?.content).toBe("");
    expect(alive?.content).toBe("Hello!");
  });

  it("preserves content for non-deleted messages", async () => {
    mockGetConversationMessages.mockResolvedValue({ messages: [mockMessage], hasMore: false });

    const result = await messageService.getMessages(CONV_ID);

    expect(result.messages[0]?.content).toBe("Hello!");
  });
});
