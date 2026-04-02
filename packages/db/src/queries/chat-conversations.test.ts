// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mock factories ──────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../index", () => ({ db: mockDb }));
vi.mock("../schema/chat-conversations", () => ({
  chatConversations: {
    id: { name: "id" },
    type: { name: "type" },
    deletedAt: { name: "deleted_at" },
    updatedAt: { name: "updated_at" },
  },
  chatConversationMembers: {
    conversationId: { name: "conversation_id" },
    userId: { name: "user_id" },
    lastReadAt: { name: "last_read_at" },
  },
}));
vi.mock("../schema/community-profiles", () => ({
  communityProfiles: {
    userId: { name: "user_id" },
    displayName: { name: "display_name" },
    photoUrl: { name: "photo_url" },
    deletedAt: { name: "deleted_at" },
  },
}));

import {
  createConversation,
  getConversationById,
  getUserConversations,
  getUserConversationIds,
  isConversationMember,
  getConversationMembers,
  findExistingDirectConversation,
  markConversationRead,
  addConversationMember,
  removeConversationMember,
  getConversationMemberCount,
  getConversationWithMembers,
  checkGroupBlockConflict,
  getMemberJoinedAt,
} from "./chat-conversations";

const CONV_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const OTHER_ID = "00000000-0000-4000-8000-000000000003";

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
  it("returns enriched conversations and hasMore for user", async () => {
    const mockRow = {
      id: CONV_ID,
      type: "direct",
      created_at: new Date("2026-02-01T00:00:00Z"),
      updated_at: new Date("2026-02-01T00:00:00Z"),
      other_member_id: OTHER_ID,
      other_member_display_name: "Ada",
      other_member_photo_url: null,
      last_message_content: null,
      last_message_sender_id: null,
      last_message_created_at: null,
      unread_count: 0,
    };
    mockDb.execute.mockResolvedValue([mockRow]);
    const result = await getUserConversations(USER_ID);
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.id).toBe(CONV_ID);
    expect(result.conversations[0]?.otherMember.displayName).toBe("Ada");
    expect(result.hasMore).toBe(false);
  });

  it("sets hasMore=true when extra row returned", async () => {
    const manyRows = Array.from({ length: 21 }, (_, i) => ({
      id: `conv-${i}`,
      type: "direct",
      created_at: new Date(),
      updated_at: new Date(),
      other_member_id: OTHER_ID,
      other_member_display_name: "Ada",
      other_member_photo_url: null,
      last_message_content: null,
      last_message_sender_id: null,
      last_message_created_at: null,
      unread_count: 0,
    }));
    mockDb.execute.mockResolvedValue(manyRows);
    const result = await getUserConversations(USER_ID);
    expect(result.hasMore).toBe(true);
    expect(result.conversations).toHaveLength(20);
  });

  it("includes lastMessage when present", async () => {
    const mockRow = {
      id: CONV_ID,
      type: "direct",
      created_at: new Date("2026-02-01T00:00:00Z"),
      updated_at: new Date("2026-02-01T00:00:00Z"),
      other_member_id: OTHER_ID,
      other_member_display_name: "Ada",
      other_member_photo_url: null,
      last_message_content: "Hello there",
      last_message_sender_id: OTHER_ID,
      last_message_created_at: new Date("2026-02-01T10:00:00Z"),
      unread_count: 2,
    };
    mockDb.execute.mockResolvedValue([mockRow]);
    const result = await getUserConversations(USER_ID);
    expect(result.conversations[0]?.lastMessage?.content).toBe("Hello there");
    expect(result.conversations[0]?.unreadCount).toBe(2);
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

describe("findExistingDirectConversation", () => {
  it("returns conversation ID when found", async () => {
    mockDb.execute.mockResolvedValue([{ id: CONV_ID }]);
    const result = await findExistingDirectConversation(USER_ID, OTHER_ID);
    expect(result).toBe(CONV_ID);
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it("returns null when no direct conversation exists", async () => {
    mockDb.execute.mockResolvedValue([]);
    const result = await findExistingDirectConversation(USER_ID, OTHER_ID);
    expect(result).toBeNull();
  });
});

describe("markConversationRead", () => {
  it("updates last_read_at for the user in the conversation", async () => {
    const chain = chainable([]);
    mockDb.update.mockReturnValue(chain);
    await markConversationRead(CONV_ID, USER_ID);
    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("getUserConversations — group conversations", () => {
  it("populates members and memberCount for group type", async () => {
    const mockRow = {
      id: CONV_ID,
      type: "group",
      created_at: new Date("2026-02-01T00:00:00Z"),
      updated_at: new Date("2026-02-01T00:00:00Z"),
      other_member_id: OTHER_ID,
      other_member_display_name: "Ada",
      other_member_photo_url: null,
      last_message_content: "Hey group!",
      last_message_sender_id: OTHER_ID,
      last_message_sender_display_name: "Ada",
      last_message_created_at: new Date("2026-02-01T10:00:00Z"),
      unread_count: 1,
      group_members: [{ id: OTHER_ID, displayName: "Ada", photoUrl: null }],
      member_count: 3,
    };
    mockDb.execute.mockResolvedValue([mockRow]);
    const result = await getUserConversations(USER_ID);
    const conv = result.conversations[0]!;
    expect(conv.type).toBe("group");
    expect(conv.members).toHaveLength(1);
    expect(conv.memberCount).toBe(3);
  });

  it("includes senderDisplayName in lastMessage for group conversations", async () => {
    const mockRow = {
      id: CONV_ID,
      type: "group",
      created_at: new Date(),
      updated_at: new Date(),
      other_member_id: OTHER_ID,
      other_member_display_name: "Ada",
      other_member_photo_url: null,
      last_message_content: "Hello",
      last_message_sender_id: OTHER_ID,
      last_message_sender_display_name: "Ada",
      last_message_created_at: new Date(),
      unread_count: 0,
      group_members: [],
      member_count: 2,
    };
    mockDb.execute.mockResolvedValue([mockRow]);
    const result = await getUserConversations(USER_ID);
    expect(result.conversations[0]!.lastMessage?.senderDisplayName).toBe("Ada");
  });

  it("does not set members/memberCount for direct conversations", async () => {
    const mockRow = {
      id: CONV_ID,
      type: "direct",
      created_at: new Date(),
      updated_at: new Date(),
      other_member_id: OTHER_ID,
      other_member_display_name: "Ada",
      other_member_photo_url: null,
      last_message_content: null,
      last_message_sender_id: null,
      last_message_sender_display_name: null,
      last_message_created_at: null,
      unread_count: 0,
      group_members: null,
      member_count: null,
    };
    mockDb.execute.mockResolvedValue([mockRow]);
    const result = await getUserConversations(USER_ID);
    const conv = result.conversations[0]!;
    expect(conv.members).toBeUndefined();
    expect(conv.memberCount).toBeUndefined();
  });
});

describe("addConversationMember", () => {
  it("executes insert SQL", async () => {
    mockDb.execute.mockResolvedValue([]);
    await addConversationMember(CONV_ID, USER_ID);
    expect(mockDb.execute).toHaveBeenCalled();
  });
});

describe("removeConversationMember", () => {
  it("calls db.delete", async () => {
    const chain = chainable([]);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    mockDb.delete = vi.fn().mockReturnValue(chain);
    await removeConversationMember(CONV_ID, USER_ID);
    // eslint-disable-next-line drizzle/enforce-delete-with-where
    expect(mockDb.delete).toHaveBeenCalled();
  });
});

describe("getConversationMemberCount", () => {
  it("returns the count from DB", async () => {
    mockDb.execute.mockResolvedValue([{ count: 5 }]);
    const count = await getConversationMemberCount(CONV_ID);
    expect(count).toBe(5);
  });

  it("returns 0 when no rows", async () => {
    mockDb.execute.mockResolvedValue([]);
    const count = await getConversationMemberCount(CONV_ID);
    expect(count).toBe(0);
  });
});

describe("getConversationWithMembers", () => {
  it("returns null when conversation not found", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);
    const result = await getConversationWithMembers(CONV_ID);
    expect(result).toBeNull();
  });

  it("returns conversation and members when found", async () => {
    // First call: getConversationById
    const selectChain = chainable([mockConversation]);
    mockDb.select.mockReturnValue(selectChain);
    // Second call: member rows
    mockDb.execute.mockResolvedValue([{ id: USER_ID, displayName: "Ada", photoUrl: null }]);

    const result = await getConversationWithMembers(CONV_ID);
    expect(result).not.toBeNull();
    expect(result!.conversation.id).toBe(CONV_ID);
    expect(result!.members).toHaveLength(1);
    expect(result!.memberCount).toBe(1);
  });
});

describe("checkGroupBlockConflict", () => {
  it("returns false when existingMemberIds is empty", async () => {
    const result = await checkGroupBlockConflict(USER_ID, []);
    expect(result).toBe(false);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("returns true when a block row exists", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    const result = await checkGroupBlockConflict(USER_ID, [OTHER_ID]);
    expect(result).toBe(true);
  });

  it("returns false when no block rows exist", async () => {
    mockDb.execute.mockResolvedValue([]);
    const result = await checkGroupBlockConflict(USER_ID, [OTHER_ID]);
    expect(result).toBe(false);
  });
});

describe("getMemberJoinedAt", () => {
  it("returns the joined_at date when member exists", async () => {
    const joinedAt = new Date("2026-02-15T10:00:00Z");
    mockDb.execute.mockResolvedValue([{ joined_at: joinedAt }]);
    const result = await getMemberJoinedAt(CONV_ID, USER_ID);
    expect(result).toEqual(joinedAt);
  });

  it("returns null when member not found", async () => {
    mockDb.execute.mockResolvedValue([]);
    const result = await getMemberJoinedAt(CONV_ID, USER_ID);
    expect(result).toBeNull();
  });
});
