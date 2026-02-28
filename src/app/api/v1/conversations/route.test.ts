// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockGetUserConversations = vi.fn();
const mockCreateConversation = vi.fn();
const mockIsBlocked = vi.fn();
const mockGetBlockedUserIds = vi.fn();
const mockFindExistingDirectConversation = vi.fn();
const mockGetConversationById = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/db/queries/chat-conversations", () => ({
  getUserConversations: (...args: unknown[]) => mockGetUserConversations(...args),
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  findExistingDirectConversation: (...args: unknown[]) =>
    mockFindExistingDirectConversation(...args),
  getConversationById: (...args: unknown[]) => mockGetConversationById(...args),
}));

vi.mock("@/db/queries/block-mute", () => ({
  isBlocked: (...args: unknown[]) => mockIsBlocked(...args),
  getBlockedUserIds: (...args: unknown[]) => mockGetBlockedUserIds(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    CONVERSATION_LIST: { maxRequests: 60, windowMs: 60_000 },
    CONVERSATION_CREATE: { maxRequests: 10, windowMs: 60_000 },
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

import { GET, POST } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";
const CONV_ID = "00000000-0000-4000-8000-000000000003";

const mockConversation = {
  id: CONV_ID,
  type: "direct" as const,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  updatedAt: new Date("2026-02-01T00:00:00Z"),
  deletedAt: null,
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/conversations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

function makePostRequest(body: unknown) {
  return new Request("https://example.com/api/v1/conversations", {
    method: "POST",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetUserConversations.mockResolvedValue({ conversations: [mockConversation], hasMore: false });
  mockCreateConversation.mockResolvedValue(mockConversation);
  mockIsBlocked.mockResolvedValue(false);
  mockGetBlockedUserIds.mockResolvedValue([]);
  mockFindExistingDirectConversation.mockResolvedValue(null);
  mockGetConversationById.mockResolvedValue(mockConversation);
});

describe("GET /api/v1/conversations", () => {
  it("returns 200 with conversations list and pagination meta", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversations).toHaveLength(1);
    expect(body.data.conversations[0].id).toBe(CONV_ID);
    expect(body.data.meta.hasMore).toBe(false);
    expect(body.data.meta.cursor).toBeNull();
  });

  it("passes limit and cursor params to query", async () => {
    const cursor = "2026-02-01T00:00:00.000Z";
    await GET(makeGetRequest({ limit: "10", cursor }));
    expect(mockGetUserConversations).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ limit: 10, cursor }),
    );
  });

  it("returns 400 for invalid limit", async () => {
    const res = await GET(makeGetRequest({ limit: "0" }));
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

  it("passes blockedUserIds to getUserConversations when user has blocked someone", async () => {
    mockGetBlockedUserIds.mockResolvedValue([OTHER_ID]);
    await GET(makeGetRequest());
    expect(mockGetUserConversations).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ blockedUserIds: [OTHER_ID] }),
    );
  });

  it("passes empty blockedUserIds when user has no blocks", async () => {
    mockGetBlockedUserIds.mockResolvedValue([]);
    await GET(makeGetRequest());
    expect(mockGetUserConversations).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ blockedUserIds: [] }),
    );
  });
});

describe("POST /api/v1/conversations", () => {
  it("creates a conversation and returns 201", async () => {
    const res = await POST(makePostRequest({ type: "direct", memberIds: [OTHER_ID] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.conversation.id).toBe(CONV_ID);
  });

  it("always includes the creator in memberIds", async () => {
    await POST(makePostRequest({ type: "direct", memberIds: [OTHER_ID] }));
    expect(mockCreateConversation).toHaveBeenCalledWith(
      "direct",
      expect.arrayContaining([USER_ID, OTHER_ID]),
    );
  });

  it("returns 400 for invalid type", async () => {
    const res = await POST(makePostRequest({ type: "invalid", memberIds: [OTHER_ID] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty memberIds", async () => {
    const res = await POST(makePostRequest({ type: "direct", memberIds: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when a member has blocked the creator", async () => {
    mockIsBlocked.mockResolvedValue(true);
    const res = await POST(makePostRequest({ type: "direct", memberIds: [OTHER_ID] }));
    expect(res.status).toBe(403);
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://example.com/api/v1/conversations", {
      method: "POST",
      headers: {
        Host: "example.com",
        Origin: "https://example.com",
        "Content-Type": "application/json",
      },
      body: "{invalid}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-UUID memberIds", async () => {
    const res = await POST(makePostRequest({ type: "direct", memberIds: ["not-a-uuid"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("valid UUIDs");
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("returns 400 when creating direct conversation with self only", async () => {
    const res = await POST(makePostRequest({ type: "direct", memberIds: [USER_ID] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("yourself");
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("returns 200 with existing conversation when direct conversation already exists (idempotent)", async () => {
    mockFindExistingDirectConversation.mockResolvedValue(CONV_ID);
    mockGetConversationById.mockResolvedValue(mockConversation);

    const res = await POST(makePostRequest({ type: "direct", memberIds: [OTHER_ID] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversation.id).toBe(CONV_ID);
    // Should NOT call createConversation since it already exists
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });
});
