// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { CONV_ID, CURRENT_USER, USER_A, USER_B, mockCreate, mockCheckBlocks } = vi.hoisted(() => {
  const CONV_ID = "00000000-0000-4000-8000-000000000001";
  const CURRENT_USER = "00000000-0000-4000-8000-000000000010";
  const USER_A = "00000000-0000-4000-8000-000000000002";
  const USER_B = "00000000-0000-4000-8000-000000000003";
  return {
    CONV_ID,
    CURRENT_USER,
    USER_A,
    USER_B,
    mockCreate: vi.fn().mockResolvedValue({ id: CONV_ID }),
    mockCheckBlocks: vi.fn().mockResolvedValue(false),
  };
});

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: CURRENT_USER }),
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  createConversation: (...args: unknown[]) => mockCreate(...args),
  checkBlocksAmongMembers: (...args: unknown[]) => mockCheckBlocks(...args),
}));

vi.mock("@/config/chat", () => ({ MAX_GROUP_MEMBERS: 50 }));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

import { createGroupConversation } from "./create-group-conversation";
import { eventBus } from "@/services/event-bus";

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: CONV_ID });
  mockCheckBlocks.mockResolvedValue(false);
});

describe("createGroupConversation", () => {
  it("creates group conversation and emits event", async () => {
    const result = await createGroupConversation([USER_A, USER_B]);

    expect(result).toEqual({ conversationId: CONV_ID });
    expect(mockCreate).toHaveBeenCalledWith("group", [CURRENT_USER, USER_A, USER_B]);
    expect(eventBus.emit).toHaveBeenCalledWith(
      "conversation.created",
      expect.objectContaining({ conversationId: CONV_ID, type: "group" }),
    );
  });

  it("returns error when block conflict exists", async () => {
    mockCheckBlocks.mockResolvedValue(true);

    const result = await createGroupConversation([USER_A, USER_B]);
    expect(result).toEqual({ error: "Cannot create conversation with this user" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns error when fewer than 2 other members", async () => {
    const result = await createGroupConversation([USER_A]);
    expect(result).toEqual({ error: "Group conversations require at least 2 other members" });
  });

  it("returns generic error when DB throws", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));

    const result = await createGroupConversation([USER_A, USER_B]);
    expect(result).toEqual({ error: "Failed to create group conversation" });
  });
});
