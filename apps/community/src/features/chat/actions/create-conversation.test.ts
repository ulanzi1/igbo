// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  CONV_ID,
  CURRENT_USER,
  OTHER_ID,
  mockFindExisting,
  mockGetById,
  mockCreate,
  mockIsBlocked,
} = vi.hoisted(() => {
  const CONV_ID = "00000000-0000-4000-8000-000000000001";
  const CURRENT_USER = "00000000-0000-4000-8000-000000000010";
  const OTHER_ID = "00000000-0000-4000-8000-000000000002";
  return {
    CONV_ID,
    CURRENT_USER,
    OTHER_ID,
    mockFindExisting: vi.fn().mockResolvedValue(null),
    mockGetById: vi.fn().mockResolvedValue(null),
    mockCreate: vi.fn().mockResolvedValue({ id: CONV_ID }),
    mockIsBlocked: vi.fn().mockResolvedValue(false),
  };
});

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: CURRENT_USER }),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({
  findExistingDirectConversation: (...args: unknown[]) => mockFindExisting(...args),
  getConversationById: (...args: unknown[]) => mockGetById(...args),
  createConversation: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock("@igbo/db/queries/block-mute", () => ({
  isBlocked: (...args: unknown[]) => mockIsBlocked(...args),
}));

import { createOrFindDirectConversation } from "./create-conversation";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindExisting.mockResolvedValue(null);
  mockGetById.mockResolvedValue(null);
  mockCreate.mockResolvedValue({ id: CONV_ID });
  mockIsBlocked.mockResolvedValue(false);
});

describe("createOrFindDirectConversation", () => {
  it("returns conversationId on success", async () => {
    const result = await createOrFindDirectConversation(OTHER_ID);
    expect(result).toEqual({ conversationId: CONV_ID });
    expect(mockCreate).toHaveBeenCalledWith("direct", [CURRENT_USER, OTHER_ID]);
  });

  it("returns existing conversation if one exists (idempotent)", async () => {
    mockFindExisting.mockResolvedValue(CONV_ID);
    mockGetById.mockResolvedValue({ id: CONV_ID });

    const result = await createOrFindDirectConversation(OTHER_ID);
    expect(result).toEqual({ conversationId: CONV_ID });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns error when blocked", async () => {
    mockIsBlocked.mockResolvedValue(true);

    const result = await createOrFindDirectConversation(OTHER_ID);
    expect(result).toEqual({ error: "Cannot create conversation with this user" });
  });

  it("returns error for self-conversation", async () => {
    const result = await createOrFindDirectConversation(CURRENT_USER);
    expect(result).toEqual({ error: "Cannot create a direct conversation with yourself" });
  });

  it("returns generic error when DB throws", async () => {
    mockCreate.mockRejectedValue(new Error("DB error"));

    const result = await createOrFindDirectConversation(OTHER_ID);
    expect(result).toEqual({ error: "Failed to create conversation" });
  });
});
