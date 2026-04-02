// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockIsConversationMember = vi.fn();
const mockGetConversationNotificationPreference = vi.fn();
const mockUpdateConversationNotificationPreference = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({
  isConversationMember: (...args: unknown[]) => mockIsConversationMember(...args),
  getConversationNotificationPreference: (...args: unknown[]) =>
    mockGetConversationNotificationPreference(...args),
  updateConversationNotificationPreference: (...args: unknown[]) =>
    mockUpdateConversationNotificationPreference(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    CONVERSATION_PREFERENCE: { maxRequests: 60, windowMs: 60_000 },
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

import { GET, PATCH } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000003";

function makeGetRequest() {
  return new Request(`https://example.com/api/v1/conversations/${CONV_ID}/preferences`, {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

function makePatchRequest(body: unknown) {
  return new Request(`https://example.com/api/v1/conversations/${CONV_ID}/preferences`, {
    method: "PATCH",
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
  mockIsConversationMember.mockResolvedValue(true);
  mockGetConversationNotificationPreference.mockResolvedValue("all");
  mockUpdateConversationNotificationPreference.mockResolvedValue(undefined);
});

describe("GET /api/v1/conversations/[conversationId]/preferences", () => {
  it("returns current notification preference (default 'all')", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notificationPreference).toBe("all");
    expect(mockGetConversationNotificationPreference).toHaveBeenCalledWith(CONV_ID, USER_ID);
  });

  it("returns 403 for non-member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/v1/conversations/[conversationId]/preferences", () => {
  it("updates preference to 'mentions' and returns { ok: true }", async () => {
    const res = await PATCH(makePatchRequest({ notificationPreference: "mentions" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(mockUpdateConversationNotificationPreference).toHaveBeenCalledWith(
      CONV_ID,
      USER_ID,
      "mentions",
    );
  });

  it("updates preference to 'muted'", async () => {
    const res = await PATCH(makePatchRequest({ notificationPreference: "muted" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid preference value", async () => {
    const res = await PATCH(makePatchRequest({ notificationPreference: "invalid" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/notificationPreference/);
  });

  it("returns 403 for non-member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const res = await PATCH(makePatchRequest({ notificationPreference: "all" }));
    expect(res.status).toBe(403);
  });

  it("requires Origin header (CSRF)", async () => {
    const req = new Request(`https://example.com/api/v1/conversations/${CONV_ID}/preferences`, {
      method: "PATCH",
      headers: {
        Host: "example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notificationPreference: "all" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });
});
