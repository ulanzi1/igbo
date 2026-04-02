// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockMarkNotificationAsRead = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/notification-service", () => ({
  markNotificationAsRead: (...args: unknown[]) => mockMarkNotificationAsRead(...args),
}));

vi.mock("@/lib/request-context", () => ({
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

import { PATCH } from "./route";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOTIF_ID = "00000000-0000-4000-8000-000000000002";

function makePatchRequest(notifId: string = NOTIF_ID) {
  return {
    request: new Request("https://example.com/api/v1/notifications/" + notifId + "/read", {
      method: "PATCH",
      headers: { Host: "example.com", Origin: "https://example.com" },
    }),
    params: Promise.resolve({ id: notifId }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID, role: "MEMBER" });
  mockMarkNotificationAsRead.mockResolvedValue(true);
});

describe("PATCH /api/v1/notifications/[id]/read", () => {
  it("returns 200 when notification is marked as read", async () => {
    const { request, params } = makePatchRequest();
    const res = await PATCH(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isRead).toBe(true);
    expect(body.data.id).toBe(NOTIF_ID);
  });

  it("marks notification as read via service", async () => {
    const { request, params } = makePatchRequest();
    await PATCH(request, { params });
    expect(mockMarkNotificationAsRead).toHaveBeenCalledWith(NOTIF_ID, USER_ID);
  });

  it("returns 404 when notification not found", async () => {
    mockMarkNotificationAsRead.mockResolvedValue(false);
    const { request, params } = makePatchRequest();
    const res = await PATCH(request, { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid UUID format", async () => {
    const { request, params } = makePatchRequest("not-a-uuid");
    const res = await PATCH(request, { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const { request, params } = makePatchRequest();
    const res = await PATCH(request, { params });
    expect(res.status).toBe(401);
  });
});
