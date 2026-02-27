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

vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema/chat-conversations", () => ({
  chatConversations: {
    id: { name: "id" },
    type: { name: "type" },
    deletedAt: { name: "deleted_at" },
    updatedAt: { name: "updated_at" },
  },
  chatConversationMembers: {
    conversationId: { name: "conversation_id" },
    userId: { name: "user_id" },
  },
}));

import {
  createConversation,
  getConversationById,
  getUserConversations,
  getUserConversationIds,
  isConversationMember,
  getConversationMembers,
} from "./chat-conversations";

const CONV_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

const mockConversation = {
  id: CONV_ID,
  type: "direct" as const,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  deletedAt: null,
};

function chainable(returnValue: unknown) {
  // The chain object is itself a thenable so it resolves at any terminal await.
  const resolved = Promise.resolve(returnValue);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "where", "orderBy", "values", "set"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  // Terminal methods also resolve directly
  chain["limit"] = vi.fn().mockResolvedValue(returnValue);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getConversationById", () => {
  it("returns conversation when found", async () => {
    const chain = chainable([mockConversation]);
    mockDb.select.mockReturnValue(chain);
    const result = await getConversationById(CONV_ID);
    expect(result).toEqual(mockConversation);
  });

  it("returns null when not found", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getConversationById(CONV_ID);
    expect(result).toBeNull();
  });
});

describe("getUserConversations", () => {
  it("returns conversations and hasMore for user", async () => {
    const chain = chainable([mockConversation]);
    mockDb.select.mockReturnValue(chain);
    const result = await getUserConversations(USER_ID);
    expect(result.conversations).toEqual([mockConversation]);
    expect(result.hasMore).toBe(false);
  });

  it("sets hasMore=true when extra row returned", async () => {
    // Return limit+1 rows (default limit=20, so 21 items)
    const manyConvs = Array.from({ length: 21 }, (_, i) => ({
      ...mockConversation,
      id: `conv-${i}`,
    }));
    const chain = chainable(manyConvs);
    mockDb.select.mockReturnValue(chain);
    const result = await getUserConversations(USER_ID);
    expect(result.hasMore).toBe(true);
    expect(result.conversations).toHaveLength(20);
  });
});

describe("getUserConversationIds", () => {
  it("returns conversation IDs for user", async () => {
    const chain = chainable([{ conversationId: CONV_ID }]);
    mockDb.select.mockReturnValue(chain);
    const ids = await getUserConversationIds(USER_ID);
    expect(ids).toEqual([CONV_ID]);
  });

  it("returns empty array when user has no conversations", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);
    const ids = await getUserConversationIds(USER_ID);
    expect(ids).toEqual([]);
  });
});

describe("isConversationMember", () => {
  it("returns true when user is a member", async () => {
    const chain = chainable([{ conversationId: CONV_ID }]);
    mockDb.select.mockReturnValue(chain);
    const result = await isConversationMember(CONV_ID, USER_ID);
    expect(result).toBe(true);
  });

  it("returns false when user is not a member", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);
    const result = await isConversationMember(CONV_ID, USER_ID);
    expect(result).toBe(false);
  });
});

describe("getConversationMembers", () => {
  it("returns members for a conversation", async () => {
    const mockMember = {
      conversationId: CONV_ID,
      userId: USER_ID,
      joinedAt: new Date(),
      lastReadAt: null,
      notificationPreference: "all",
      role: "member" as const,
    };
    const chain = chainable([mockMember]);
    mockDb.select.mockReturnValue(chain);
    const members = await getConversationMembers(CONV_ID);
    expect(members).toEqual([mockMember]);
  });
});

describe("createConversation", () => {
  it("creates a conversation with members in a transaction", async () => {
    // Mock the transaction to execute the callback
    mockDb.transaction.mockImplementation(async (cb: (tx: typeof mockDb) => Promise<unknown>) => {
      const txChain = chainable([mockConversation]);
      const tx = {
        insert: vi.fn().mockReturnValue(txChain),
        update: vi.fn().mockReturnValue(txChain),
      };
      return cb(tx as unknown as typeof mockDb);
    });

    const result = await createConversation("direct", [USER_ID]);
    expect(result).toEqual(mockConversation);
    expect(mockDb.transaction).toHaveBeenCalled();
  });
});
