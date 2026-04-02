// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetConversationById = vi.fn();
const mockIsConversationMember = vi.fn();
const mockGetMessageById = vi.fn();
const mockIsBlocked = vi.fn();
const mockAddReaction = vi.fn();
const mockRemoveReaction = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
}));

vi.mock("@igbo/db/queries/chat-messages", () => ({
  getMessageById: (...args: unknown[]) => mockGetMessageById(...args),
}));

vi.mock("@igbo/db/queries/block-mute", () => ({
  isBlocked: (...args: unknown[]) => mockIsBlocked(...args),
}));

vi.mock("@/services/message-service", () => ({
  messageService: {
    addReaction: (...args: unknown[]) => mockAddReaction(...args),
    removeReaction: (...args: unknown[]) => mockRemoveReaction(...args),
  },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MESSAGE_REACTION: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60_000,
    limit: 60,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST, DELETE } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const AUTHOR_ID = "00000000-0000-4000-8000-000000000002";
const CONV_ID = "00000000-0000-4000-8000-000000000003";
const MSG_ID = "00000000-0000-4000-8000-000000000004";

const mockConversation = {
  id: CONV_ID,
  type: "direct" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: AUTHOR_ID,
  content: "Hello!",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

function makeRequest(method: string, body?: unknown) {
  const url = `https://example.com/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}/reactions`;
  return new Request(url, {
    method,
    headers: {
      Host: "example.com",
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetConversationById.mockResolvedValue(mockConversation);
  mockIsConversationMember.mockResolvedValue(true);
  mockGetMessageById.mockResolvedValue(mockMessage);
  mockIsBlocked.mockResolvedValue(false);
  mockAddReaction.mockResolvedValue({ messageId: MSG_ID, userId: USER_ID, emoji: "👍" });
  mockRemoveReaction.mockResolvedValue(true);
});

describe("POST /api/v1/conversations/[conversationId]/messages/[messageId]/reactions", () => {
  it("returns 200 when reaction is added successfully", async () => {
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.added).toBe(true);
    expect(body.data.emoji).toBe("👍");
  });

  it("calls messageService.addReaction with correct params", async () => {
    await POST(makeRequest("POST", { emoji: "❤️" }));
    expect(mockAddReaction).toHaveBeenCalledWith(MSG_ID, USER_ID, "❤️", CONV_ID);
  });

  it("returns 200 with added=false when reaction already existed", async () => {
    mockAddReaction.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.added).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when message not found", async () => {
    mockGetMessageById.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when message belongs to a different conversation", async () => {
    mockGetMessageById.mockResolvedValue({
      ...mockMessage,
      conversationId: "00000000-0000-4000-8000-000000000099",
    });
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when message author has blocked reactor", async () => {
    // First call: isBlocked(authorId, userId) = true
    // Second call: isBlocked(userId, authorId) = false
    mockIsBlocked.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when reactor has blocked message author", async () => {
    mockIsBlocked.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const res = await POST(makeRequest("POST", { emoji: "👍" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest("POST", { emoji: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing emoji", async () => {
    const res = await POST(makeRequest("POST", {}));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/conversations/[conversationId]/messages/[messageId]/reactions", () => {
  it("returns 200 when reaction is removed", async () => {
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.removed).toBe(true);
    expect(body.data.emoji).toBe("👍");
  });

  it("calls messageService.removeReaction with correct params", async () => {
    await DELETE(makeRequest("DELETE", { emoji: "🔥" }));
    expect(mockRemoveReaction).toHaveBeenCalledWith(MSG_ID, USER_ID, "🔥", CONV_ID);
  });

  it("returns 200 with removed=false when reaction did not exist", async () => {
    mockRemoveReaction.mockResolvedValue(false);
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.removed).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when message not found", async () => {
    mockGetMessageById.mockResolvedValue(null);
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when message belongs to a different conversation", async () => {
    mockGetMessageById.mockResolvedValue({
      ...mockMessage,
      conversationId: "00000000-0000-4000-8000-000000000099",
    });
    const res = await DELETE(makeRequest("DELETE", { emoji: "👍" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    const res = await DELETE(makeRequest("DELETE", {}));
    expect(res.status).toBe(400);
  });
});
