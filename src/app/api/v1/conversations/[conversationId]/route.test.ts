// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAuthenticatedSession = vi.fn();
const mockIsConversationMember = vi.fn();
const mockGetConversationById = vi.fn();
const mockMarkConversationRead = vi.fn();
const mockGetConversationWithMembers = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
  markConversationRead: (...args: unknown[]) => mockMarkConversationRead(...args),
  getConversationWithMembers: (...args: unknown[]) => mockGetConversationWithMembers(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    CONVERSATION_READ: { maxRequests: 120, windowMs: 60_000 },
    CONVERSATION_MARK_READ: { maxRequests: 120, windowMs: 60_000 },
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

import { GET, PATCH } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";

const mockConversation = {
  id: CONV_ID,
  type: "direct" as const,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  deletedAt: null,
};

function makeRequest(method: string) {
  return new Request(`https://example.com/api/v1/conversations/${CONV_ID}`, {
    method,
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetConversationById.mockResolvedValue(mockConversation);
  mockIsConversationMember.mockResolvedValue(true);
  mockMarkConversationRead.mockResolvedValue(undefined);
  mockGetConversationWithMembers.mockResolvedValue({
    conversation: mockConversation,
    members: [],
    memberCount: 0,
  });
});

describe("GET /api/v1/conversations/[conversationId]", () => {
  it("returns 200 with conversation data", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversation.id).toBe(CONV_ID);
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/conversations/[conversationId]", () => {
  it("returns 200 and marks conversation as read", async () => {
    const res = await PATCH(makeRequest("PATCH"));
    expect(res.status).toBe(200);
    expect(mockMarkConversationRead).toHaveBeenCalledWith(CONV_ID, USER_ID);
  });

  it("returns 403 when user is not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await PATCH(makeRequest("PATCH"));
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await PATCH(makeRequest("PATCH"));
    expect(res.status).toBe(401);
  });
});
