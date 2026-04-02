// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/db/schema/community-group-channels", () => ({
  communityGroupChannels: {
    id: "id",
    groupId: "group_id",
    isDefault: "is_default",
    createdAt: "created_at",
  },
}));
vi.mock("@/db/schema/chat-conversations", () => ({
  chatConversations: { id: "id", channelId: "channel_id", deletedAt: "deleted_at" },
  chatConversationMembers: { conversationId: "conversation_id", userId: "user_id", role: "role" },
}));
vi.mock("@/db/schema/community-groups", () => ({
  communityGroupMembers: { groupId: "group_id", userId: "user_id", status: "status" },
}));
vi.mock("@/db/schema/chat-message-attachments", () => ({
  chatMessageAttachments: {
    id: "id",
    messageId: "message_id",
    createdAt: "created_at",
    fileUrl: "file_url",
    fileName: "file_name",
    fileType: "file_type",
    fileSize: "file_size",
  },
}));
vi.mock("@/db/schema/chat-messages", () => ({
  chatMessages: { id: "id", conversationId: "conversation_id", senderId: "sender_id" },
}));
vi.mock("@/db/schema/auth-users", () => ({
  authUsers: { id: "id", name: "name" },
}));

import { db } from "@/db";

const mockDb = db as Record<string, ReturnType<typeof vi.fn>>;

// Chain mock builder
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
    "returning",
    "onConflictDoNothing",
    "set",
    "values",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  (chain as Record<string, unknown>).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve);
  // Make it thenable so await works
  Object.assign(chain, {
    [Symbol.iterator]: undefined,
  });
  // Actually make it return the result on final call
  for (const m of ["where", "limit", "offset", "orderBy", "returning", "onConflictDoNothing"]) {
    (chain as Record<string, ReturnType<typeof vi.fn>>)[m] = vi.fn().mockResolvedValue(result);
  }
  return chain;
}

describe("listGroupChannels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns channels joined with conversationId", async () => {
    const mockRows = [
      {
        id: "chan-1",
        groupId: "group-1",
        name: "General",
        description: null,
        isDefault: true,
        createdBy: "user-1",
        createdAt: new Date(),
        conversationId: "conv-1",
      },
    ];

    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockRows),
    };

    mockDb.select = vi.fn().mockReturnValue(chain);

    const { listGroupChannels } = await import("@/db/queries/group-channels");
    const result = await listGroupChannels("group-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("General");
    expect(result[0]?.conversationId).toBe("conv-1");
  });
});

describe("getDefaultChannelConversationId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns conversationId when default channel exists", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "conv-1" }]),
    };
    mockDb.select = vi.fn().mockReturnValue(chain);

    const { getDefaultChannelConversationId } = await import("@/db/queries/group-channels");
    const result = await getDefaultChannelConversationId("group-1");
    expect(result).toBe("conv-1");
  });

  it("returns null when no default channel", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDb.select = vi.fn().mockReturnValue(chain);

    const { getDefaultChannelConversationId } = await import("@/db/queries/group-channels");
    const result = await getDefaultChannelConversationId("group-1");
    expect(result).toBeNull();
  });
});

describe("countGroupChannels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns count", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 3 }]),
    };
    mockDb.select = vi.fn().mockReturnValue(chain);

    const { countGroupChannels } = await import("@/db/queries/group-channels");
    const result = await countGroupChannels("group-1");
    expect(result).toBe(3);
  });

  it("returns 0 when no rows", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select = vi.fn().mockReturnValue(chain);

    const { countGroupChannels } = await import("@/db/queries/group-channels");
    const result = await countGroupChannels("group-1");
    expect(result).toBe(0);
  });
});

describe("listActiveGroupMemberIds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns array of userIds", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]),
    };
    mockDb.select = vi.fn().mockReturnValue(chain);

    const { listActiveGroupMemberIds } = await import("@/db/queries/group-channels");
    const result = await listActiveGroupMemberIds("group-1");
    expect(result).toEqual(["u1", "u2"]);
  });
});

describe("softDeleteChannelConversation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates deletedAt", async () => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.update = vi.fn().mockReturnValue(chain);

    const { softDeleteChannelConversation } = await import("@/db/queries/group-channels");
    await softDeleteChannelConversation("conv-1");
    expect(mockDb.update).toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalled();
  });
});
