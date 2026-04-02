// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockGetNotifications = vi.fn();
const mockGetUnreadCount = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/notifications", () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    NOTIFICATION_FETCH: { maxRequests: 60, windowMs: 60_000 },
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

import { GET } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const MOCK_NOTIFICATIONS = [
  {
    id: "00000000-0000-4000-8000-000000000002",
    userId: USER_ID,
    type: "system",
    title: "Welcome",
    body: "Welcome to Igbo!",
    link: null,
    isRead: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/notifications");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  mockGetUnreadCount.mockResolvedValue(1);
});

describe("GET /api/v1/notifications", () => {
  it("returns 200 with notifications and unread count", async () => {
    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.notifications).toHaveLength(1);
    expect(body.data.unreadCount).toBe(1);
  });

  it("passes since parameter to getNotifications", async () => {
    const sinceDate = "2026-01-01T00:00:00.000Z";
    const req = makeGetRequest({ since: sinceDate });
    await GET(req);

    expect(mockGetNotifications).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ since: expect.any(Date) }),
    );
  });

  it("passes limit parameter to getNotifications", async () => {
    const req = makeGetRequest({ limit: "10" });
    await GET(req);

    expect(mockGetNotifications).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("returns 400 for invalid since date", async () => {
    const req = makeGetRequest({ since: "not-a-date" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid limit value", async () => {
    const req = makeGetRequest({ limit: "0" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit greater than 100", async () => {
    const req = makeGetRequest({ limit: "101" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      limit: 60,
    });
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(429);
  });
});
