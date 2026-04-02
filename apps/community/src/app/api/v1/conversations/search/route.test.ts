// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockSearchMessages = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({
  searchMessages: (...args: unknown[]) => mockSearchMessages(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    MESSAGE_SEARCH: { maxRequests: 30, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 60_000,
    limit: 30,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_RESULTS = [
  {
    messageId: "00000000-0000-4000-8000-000000000010",
    conversationId: "00000000-0000-4000-8000-000000000020",
    senderId: "00000000-0000-4000-8000-000000000002",
    senderDisplayName: "Alice",
    senderPhotoUrl: null,
    content: "Hello world igbo",
    snippet: "Hello <mark>world</mark> igbo",
    contentType: "text",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    conversationType: "direct" as const,
    conversationName: "Alice",
  },
];

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/conversations/search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockSearchMessages.mockResolvedValue(MOCK_RESULTS);
});

describe("GET /api/v1/conversations/search", () => {
  it("returns 400 when q is missing", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/3 characters/);
  });

  it("returns 400 when q is shorter than 3 chars", async () => {
    const res = await GET(makeGetRequest({ q: "ab" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/3 characters/);
  });

  it("returns 200 with results array on valid query", async () => {
    const res = await GET(makeGetRequest({ q: "igbo" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toHaveLength(1);
    expect(body.data.query).toBe("igbo");
    expect(mockSearchMessages).toHaveBeenCalledWith(USER_ID, "igbo", 20);
  });

  it("returns 400 when limit is 0", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", limit: "0" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/limit/i);
  });

  it("returns 400 when limit is greater than 50", async () => {
    const res = await GET(makeGetRequest({ q: "igbo", limit: "51" }));
    expect(res.status).toBe(400);
  });

  it("passes custom limit to searchMessages", async () => {
    const res = await GET(makeGetRequest({ q: "hello", limit: "10" }));
    expect(res.status).toBe(200);
    expect(mockSearchMessages).toHaveBeenCalledWith(USER_ID, "hello", 10);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeGetRequest({ q: "igbo" }));
    expect(res.status).toBe(401);
  });
});
