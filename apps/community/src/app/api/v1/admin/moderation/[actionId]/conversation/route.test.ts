// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetModerationActionById = vi.fn();
const mockGetMessageById = vi.fn();
const mockGetConversationMessages = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/moderation", () => ({
  getModerationActionById: (...args: unknown[]) => mockGetModerationActionById(...args),
}));

vi.mock("@igbo/db/queries/chat-messages", () => ({
  getMessageById: (...args: unknown[]) => mockGetMessageById(...args),
  getConversationMessages: (...args: unknown[]) => mockGetConversationMessages(...args),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const ADMIN_ID = "admin-uuid-1";
const ACTION_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000002";
const AUTHOR_ID = "00000000-0000-4000-8000-000000000003";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000004";

const MOCK_MESSAGE_ITEM = {
  id: ACTION_ID,
  contentType: "message" as const,
  contentId: MESSAGE_ID,
  contentAuthorId: AUTHOR_ID,
  authorName: "Alice",
  flagReason: "harassment",
  keywordMatched: null,
  autoFlagged: true,
  flaggedAt: new Date(),
  status: "pending" as const,
  visibilityOverride: "visible" as const,
  reportCount: 0,
};

const MOCK_FLAGGED_MESSAGE = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: AUTHOR_ID,
  content: "bad message",
  createdAt: new Date(),
};

function makeRequest() {
  return new Request(`https://example.com/api/v1/admin/moderation/${ACTION_ID}/conversation`, {
    method: "GET",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: ADMIN_ID });
  mockGetModerationActionById.mockResolvedValue(MOCK_MESSAGE_ITEM);
  mockGetMessageById.mockResolvedValue(MOCK_FLAGGED_MESSAGE);
  mockGetConversationMessages.mockResolvedValue({ messages: [], hasMore: false });
  mockLogAdminAction.mockResolvedValue(undefined);
});

describe("GET /api/v1/admin/moderation/[actionId]/conversation", () => {
  it("returns 200 with flagged message and context window for admin", async () => {
    const contextMessages = [{ id: "msg-1", content: "hello" }];
    mockGetConversationMessages
      .mockResolvedValueOnce({ messages: contextMessages, hasMore: false })
      .mockResolvedValueOnce({ messages: [], hasMore: false });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.flaggedMessage.id).toBe(MESSAGE_ID);
    expect(body.data.conversationId).toBe(CONVERSATION_ID);
    expect(body.data.contextBefore).toEqual(contextMessages);
  });

  it("logs VIEW_DISPUTE_CONVERSATION audit entry", async () => {
    await GET(makeRequest());
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VIEW_DISPUTE_CONVERSATION",
        actorId: ADMIN_ID,
        targetUserId: AUTHOR_ID,
        details: expect.objectContaining({
          moderationActionId: ACTION_ID,
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
        }),
      }),
    );
  });

  it("returns 403 for non-admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 when moderation item is not a message type", async () => {
    mockGetModerationActionById.mockResolvedValue({
      ...MOCK_MESSAGE_ITEM,
      contentType: "post",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 404 when flagged message is not found", async () => {
    mockGetMessageById.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when moderation action is not found", async () => {
    mockGetModerationActionById.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
  });

  it("does not mutate conversation membership (getConversationMessages called, not join)", async () => {
    await GET(makeRequest());
    // Verify we only read messages, never added to membership
    expect(mockGetConversationMessages).toHaveBeenCalledTimes(2);
    expect(mockGetConversationMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ cursor: MESSAGE_ID, direction: "before" }),
    );
    expect(mockGetConversationMessages).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ cursor: MESSAGE_ID, direction: "after" }),
    );
  });
});
