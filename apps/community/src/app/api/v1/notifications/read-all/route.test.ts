// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockMarkAllNotificationsAsRead = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/notification-service", () => ({
  markAllNotificationsAsRead: (...args: unknown[]) => mockMarkAllNotificationsAsRead(...args),
}));

vi.mock("@/lib/request-context", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    PROFILE_UPDATE: { maxRequests: 20, windowMs: 60_000 },
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

import { POST } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makePostRequest() {
  return new Request("https://example.com/api/v1/notifications/read-all", {
    method: "POST",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockMarkAllNotificationsAsRead.mockResolvedValue(undefined);
});

describe("POST /api/v1/notifications/read-all", () => {
  it("returns 200 with success: true", async () => {
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
  });

  it("marks all notifications as read via service", async () => {
    const req = makePostRequest();
    await POST(req);
    expect(mockMarkAllNotificationsAsRead).toHaveBeenCalledWith(USER_ID);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 on DB failure", async () => {
    mockMarkAllNotificationsAsRead.mockRejectedValue(new Error("DB error"));
    const req = makePostRequest();
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
