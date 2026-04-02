// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetConversationById = vi.fn();
const mockIsConversationMember = vi.fn();
const mockUpdateMessage = vi.fn();
const mockDeleteMessage = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
}));

vi.mock("@/services/message-service", () => ({
  messageService: {
    updateMessage: (...args: unknown[]) => mockUpdateMessage(...args),
    deleteMessage: (...args: unknown[]) => mockDeleteMessage(...args),
  },
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MESSAGE_EDIT: { maxRequests: 20, windowMs: 60_000 },
    MESSAGE_DELETE: { maxRequests: 10, windowMs: 60_000 },
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

import { PATCH, DELETE } from "./route";

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

const mockUpdatedMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: "Updated content",
  contentType: "text" as const,
  parentMessageId: null,
  editedAt: new Date("2026-02-01T12:05:00Z"),
  deletedAt: null,
  createdAt: new Date("2026-02-01T12:00:00Z"),
};

function makePatchRequest(body: unknown = { content: "Updated content" }) {
  return new Request(`https://example.com/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Host: "example.com",
      Origin: "https://example.com",
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest() {
  return new Request(`https://example.com/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`, {
    method: "DELETE",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

function makeServiceError(code: string, message: string) {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetConversationById.mockResolvedValue(mockConversation);
  mockIsConversationMember.mockResolvedValue(true);
  mockUpdateMessage.mockResolvedValue(mockUpdatedMessage);
  mockDeleteMessage.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/conversations/[conversationId]/messages/[messageId]", () => {
  it("returns 200 with updated message on success", async () => {
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.content).toBe("Updated content");
    expect(mockUpdateMessage).toHaveBeenCalledWith(MSG_ID, USER_ID, "Updated content");
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a conversation member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty content string", async () => {
    const res = await PATCH(makePatchRequest({ content: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for content exceeding 4000 characters", async () => {
    const res = await PATCH(makePatchRequest({ content: "x".repeat(4001) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing content field", async () => {
    const res = await PATCH(makePatchRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request(
      `https://example.com/api/v1/conversations/${CONV_ID}/messages/${MSG_ID}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Host: "example.com",
          Origin: "https://example.com",
        },
        body: "not-json",
      },
    );
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when service throws NOT_FOUND", async () => {
    mockUpdateMessage.mockRejectedValue(makeServiceError("NOT_FOUND", "Message not found"));
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(404);
  });

  it("returns 403 when service throws FORBIDDEN (not owner)", async () => {
    mockUpdateMessage.mockRejectedValue(
      makeServiceError("FORBIDDEN", "Cannot edit another member's message"),
    );
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(403);
  });

  it("returns 410 when service throws GONE (already deleted)", async () => {
    mockUpdateMessage.mockRejectedValue(makeServiceError("GONE", "Message has been deleted"));
    const res = await PATCH(makePatchRequest());
    expect(res.status).toBe(410);
  });
});

describe("DELETE /api/v1/conversations/[conversationId]/messages/[messageId]", () => {
  it("returns 204 No Content on success", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(204);
    expect(mockDeleteMessage).toHaveBeenCalledWith(MSG_ID, USER_ID);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConversationById.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not a conversation member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(403);
  });

  it("returns 404 when service throws NOT_FOUND", async () => {
    mockDeleteMessage.mockRejectedValue(makeServiceError("NOT_FOUND", "Message not found"));
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(404);
  });

  it("returns 403 when service throws FORBIDDEN (not owner)", async () => {
    mockDeleteMessage.mockRejectedValue(
      makeServiceError("FORBIDDEN", "Cannot delete another member's message"),
    );
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(403);
  });

  it("returns 410 when service throws GONE (already deleted)", async () => {
    mockDeleteMessage.mockRejectedValue(
      makeServiceError("GONE", "Message has already been deleted"),
    );
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(410);
  });
});
