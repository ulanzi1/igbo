// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetConversationById = vi.fn();
const mockIsConversationMember = vi.fn();
const mockAddConversationMember = vi.fn();
const mockRemoveConversationMember = vi.fn();
const mockGetConversationMemberCount = vi.fn();
const mockGetConversationMembers = vi.fn();
const mockCheckGroupBlockConflict = vi.fn();
const mockSendSystemMessage = vi.fn();
const mockSoftDeleteConversation = vi.fn();
const mockGetProfileByUserId = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  addConversationMember: (...args: unknown[]) => mockAddConversationMember(...args),
  removeConversationMember: (...args: unknown[]) => mockRemoveConversationMember(...args),
  getConversationMemberCount: (...args: unknown[]) => mockGetConversationMemberCount(...args),
  getConversationMembers: (...args: unknown[]) => mockGetConversationMembers(...args),
  checkGroupBlockConflict: (...args: unknown[]) => mockCheckGroupBlockConflict(...args),
  softDeleteConversation: (...args: unknown[]) => mockSoftDeleteConversation(...args),
}));

vi.mock("@/services/message-service", () => ({
  messageService: {
    sendSystemMessage: (...args: unknown[]) => mockSendSystemMessage(...args),
  },
}));

vi.mock("@/db/queries/community-profiles", () => ({
  getProfileByUserId: (...args: unknown[]) => mockGetProfileByUserId(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    CONVERSATION_MEMBER_MANAGE: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAt: Date.now() + 60_000,
    limit: 20,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock("@igbo/config/chat", () => ({
  MAX_GROUP_MEMBERS: 50,
}));

import { POST, DELETE } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NEW_USER_ID = "00000000-0000-4000-8000-000000000002";
const CONV_ID = "00000000-0000-4000-8000-000000000003";

const mockGroupConversation = {
  id: CONV_ID,
  type: "group" as const,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  deletedAt: null,
};

const mockDirectConversation = {
  id: CONV_ID,
  type: "direct" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockSystemMessage = {
  id: "msg-1",
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Ada was added",
  contentType: "system" as const,
  parentMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date(),
};

function makePostRequest(body: unknown, conversationId = CONV_ID) {
  return new Request(`https://example.com/api/v1/conversations/${conversationId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(conversationId = CONV_ID) {
  return new Request(`https://example.com/api/v1/conversations/${conversationId}/members`, {
    method: "DELETE",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetConversationById.mockResolvedValue(mockGroupConversation);
  // POST handler calls isConversationMember twice:
  //   1st: requester membership check → true
  //   2nd: new user "already a member" check → false (not already a member)
  // DELETE handler calls it once:
  //   1st: requester membership check → true
  mockIsConversationMember.mockResolvedValueOnce(true).mockResolvedValue(false);
  mockAddConversationMember.mockResolvedValue(undefined);
  mockRemoveConversationMember.mockResolvedValue(undefined);
  mockGetConversationMemberCount.mockResolvedValue(3);
  mockGetConversationMembers.mockResolvedValue([{ userId: USER_ID, conversationId: CONV_ID }]);
  mockCheckGroupBlockConflict.mockResolvedValue(false);
  mockSendSystemMessage.mockResolvedValue(mockSystemMessage);
  mockSoftDeleteConversation.mockResolvedValue(undefined);
  mockGetProfileByUserId.mockResolvedValue({ displayName: "Ada" });
});

describe("POST /api/v1/conversations/[conversationId]/members", () => {
  it("adds member and returns 200 with member details", async () => {
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.member.userId).toBe(NEW_USER_ID);
    expect(mockAddConversationMember).toHaveBeenCalledWith(CONV_ID, NEW_USER_ID);
  });

  it("sends system message after adding member", async () => {
    await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(mockSendSystemMessage).toHaveBeenCalledWith(
      CONV_ID,
      USER_ID,
      "Ada was added to the conversation",
    );
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(404);
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 400 when conversation is direct type", async () => {
    mockGetConversationById.mockResolvedValue(mockDirectConversation);
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(400);
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 403 when requester is not a member", async () => {
    // Override: first call returns false (requester is not a member)
    mockIsConversationMember.mockReset().mockResolvedValue(false);
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(403);
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 400 when userId is not a valid UUID", async () => {
    const res = await POST(makePostRequest({ userId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 400 when userId is missing", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 400 when new user is already a member", async () => {
    // Override: both calls return true (new user IS already a member)
    mockIsConversationMember.mockReset().mockResolvedValue(true);
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("already a member");
  });

  it("returns 400 when group is at max capacity", async () => {
    mockGetConversationMemberCount.mockResolvedValue(50);
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("maximum");
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 403 when block conflict exists", async () => {
    mockCheckGroupBlockConflict.mockResolvedValue(true);
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(403);
    expect(mockAddConversationMember).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request(`https://example.com/api/v1/conversations/${CONV_ID}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "example.com",
        Origin: "https://example.com",
      },
      body: "{invalid}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await POST(makePostRequest({ userId: NEW_USER_ID }));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/v1/conversations/[conversationId]/members", () => {
  it("removes requester from group and returns 200", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.left).toBe(true);
    expect(mockRemoveConversationMember).toHaveBeenCalledWith(CONV_ID, USER_ID);
  });

  it("sends system message before removing member", async () => {
    await DELETE(makeDeleteRequest());
    expect(mockSendSystemMessage).toHaveBeenCalledWith(
      CONV_ID,
      USER_ID,
      "Ada left the conversation",
    );
  });

  it("soft-deletes conversation when 1 or fewer members remain", async () => {
    mockGetConversationMemberCount.mockResolvedValue(1);
    await DELETE(makeDeleteRequest());
    expect(mockSoftDeleteConversation).toHaveBeenCalledWith(CONV_ID);
  });

  it("does not soft-delete when 2+ members remain", async () => {
    mockGetConversationMemberCount.mockResolvedValue(3);
    await DELETE(makeDeleteRequest());
    expect(mockSoftDeleteConversation).not.toHaveBeenCalled();
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(404);
    expect(mockRemoveConversationMember).not.toHaveBeenCalled();
  });

  it("returns 400 when conversation is direct type", async () => {
    mockGetConversationById.mockResolvedValue(mockDirectConversation);
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("direct");
    expect(mockRemoveConversationMember).not.toHaveBeenCalled();
  });

  it("returns 403 when requester is not a member", async () => {
    mockIsConversationMember.mockReset().mockResolvedValue(false);
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(403);
    expect(mockRemoveConversationMember).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(401);
  });
});
