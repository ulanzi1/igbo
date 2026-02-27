// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetConversationById = vi.fn();
const mockIsConversationMember = vi.fn();
const mockGetMemberJoinedAt = vi.fn();
const mockGetMessages = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  getMemberJoinedAt: (...args: unknown[]) => mockGetMemberJoinedAt(...args),
}));

vi.mock("@/services/message-service", () => ({
  messageService: {
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
  },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MESSAGE_FETCH: { maxRequests: 120, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 119,
    resetAt: Date.now() + 60_000,
    limit: 120,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

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
  senderId: USER_ID,
  content: "Hello!",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-02-01T12:00:00Z"),
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL(`https://example.com/api/v1/conversations/${CONV_ID}/messages`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetConversationById.mockResolvedValue(mockConversation);
  mockIsConversationMember.mockResolvedValue(true);
  mockGetMemberJoinedAt.mockResolvedValue(null); // default: no join restriction
  mockGetMessages.mockResolvedValue({ messages: [mockMessage], hasMore: false });
});

describe("GET /api/v1/conversations/[conversationId]/messages", () => {
  it("returns 200 with messages", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.messages[0].messageId).toBe(MSG_ID);
    expect(body.data.meta.hasMore).toBe(false);
  });

  it("includes next cursor when hasMore=true", async () => {
    mockGetMessages.mockResolvedValue({ messages: [mockMessage], hasMore: true });
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body.data.meta.cursor).toBe(MSG_ID);
  });

  it("passes cursor and limit params to messageService", async () => {
    await GET(makeGetRequest({ cursor: MSG_ID, limit: "10", direction: "after" }));
    expect(mockGetMessages).toHaveBeenCalledWith(
      CONV_ID,
      expect.objectContaining({ cursor: MSG_ID, limit: 10, direction: "after" }),
    );
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid limit", async () => {
    const res = await GET(makeGetRequest({ limit: "101" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid direction", async () => {
    const res = await GET(makeGetRequest({ direction: "sideways" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });
});
