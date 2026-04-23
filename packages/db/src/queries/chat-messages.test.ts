// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mock factories ──────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../index", () => ({ db: mockDb }));
vi.mock("../schema/chat-messages", () => ({
  chatMessages: {
    id: { name: "id" },
    conversationId: { name: "conversation_id" },
    senderId: { name: "sender_id" },
    createdAt: { name: "created_at" },
    deletedAt: { name: "deleted_at" },
  },
}));
vi.mock("../schema/chat-conversations", () => ({
  chatConversations: {
    id: { name: "id" },
    updatedAt: { name: "updated_at" },
  },
}));

import {
  createMessage,
  getMessageById,
  getConversationMessages,
  getMessagesSince,
  softDeleteMessage,
} from "./chat-messages";

const CONV_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Hello world",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-02-01T12:00:00Z"),
};

function chainable(returnValue: unknown) {
  // The chain is itself a thenable so it resolves at any terminal await.
  const resolved = Promise.resolve(returnValue);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "where", "orderBy", "values", "set"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["limit"] = vi.fn().mockResolvedValue(returnValue);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMessageById", () => {
  it("returns message when found", async () => {
    const chain = chainable([mockMessage]);
    mockDb.select.mockReturnValue(chain);
    const result = await getMessageById(MSG_ID);
    expect(result).toEqual(mockMessage);
  });

  it("returns null when not found", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getMessageById(MSG_ID);
    expect(result).toBeNull();
  });
});

describe("createMessage", () => {
  it("creates a message and updates conversation in a transaction", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const txChain = chainable([mockMessage]);
      const tx = {
        insert: vi.fn().mockReturnValue(txChain),
        update: vi.fn().mockReturnValue(txChain),
      };
      return cb(tx as unknown as typeof mockDb);
    });

    const result = await createMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Hello world",
      contentType: "text",
    });

    expect(result).toEqual(mockMessage);
    expect(mockDb.transaction).toHaveBeenCalled();
  });

  it("uses provided tx directly without wrapping in db.transaction", async () => {
    const txChain = chainable([mockMessage]);
    const mockTx = {
      insert: vi.fn().mockReturnValue(txChain),
      update: vi.fn().mockReturnValue(txChain),
    };

    const result = await createMessage(
      {
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Hello world",
        contentType: "text",
      },
      mockTx,
    );

    expect(result).toEqual(mockMessage);
    // db.transaction should NOT have been called — the provided tx is used
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockTx.insert).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalled();
  });

  it("maintains backward compatibility when no tx is provided", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const txChain = chainable([mockMessage]);
      const tx = {
        insert: vi.fn().mockReturnValue(txChain),
        update: vi.fn().mockReturnValue(txChain),
      };
      return cb(tx as unknown as typeof mockDb);
    });

    await createMessage({
      conversationId: CONV_ID,
      senderId: USER_ID,
      content: "Hello world",
      contentType: "text",
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });
});

describe("getConversationMessages", () => {
  it("returns messages without cursor (latest page)", async () => {
    const chain = chainable([mockMessage]);
    mockDb.select.mockReturnValue(chain);
    const { messages, hasMore } = await getConversationMessages(CONV_ID);
    expect(Array.isArray(messages)).toBe(true);
    expect(typeof hasMore).toBe("boolean");
  });

  it("caps limit at 100", async () => {
    const chain = chainable([mockMessage]);
    mockDb.select.mockReturnValue(chain);
    // Should not throw with limit > 100
    await getConversationMessages(CONV_ID, { limit: 200 });
    // limit + 1 = 101 (capped at 100, passed as 101 to detect hasMore)
    expect(chain["limit"]).toHaveBeenCalledWith(101);
  });

  it("sets hasMore=true when extra row present", async () => {
    // Return limit+1 rows to signal hasMore
    const extraRows = Array.from({ length: 51 }, (_, i) => ({
      ...mockMessage,
      id: `msg-${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    const chain = chainable(extraRows);
    mockDb.select.mockReturnValue(chain);
    const { hasMore } = await getConversationMessages(CONV_ID, { limit: 50 });
    expect(hasMore).toBe(true);
  });

  it("resolves cursor to timestamp when cursor provided", async () => {
    // First call returns cursor row, second returns messages
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return chainable([{ createdAt: mockMessage.createdAt }]);
      return chainable([mockMessage]);
    });

    const { messages } = await getConversationMessages(CONV_ID, { cursor: MSG_ID });
    expect(messages).toBeDefined();
  });
});

describe("getMessagesSince", () => {
  it("returns messages since given timestamp", async () => {
    const chain = chainable([mockMessage]);
    mockDb.select.mockReturnValue(chain);
    const since = new Date(Date.now() - 60_000);
    const messages = await getMessagesSince(CONV_ID, since);
    expect(Array.isArray(messages)).toBe(true);
  });
});

describe("softDeleteMessage", () => {
  it("returns true when message is deleted", async () => {
    const chain = chainable([{ id: MSG_ID }]);
    mockDb.update.mockReturnValue(chain);
    const result = await softDeleteMessage(MSG_ID, USER_ID);
    expect(result).toBe(true);
  });

  it("returns false when message not found or not owned by user", async () => {
    const chain = chainable([]);
    mockDb.update.mockReturnValue(chain);
    const result = await softDeleteMessage(MSG_ID, USER_ID);
    expect(result).toBe(false);
  });
});
