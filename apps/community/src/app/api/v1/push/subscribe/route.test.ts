// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequireAuthenticatedSession = vi.fn();
const mockUpsertPushSubscription = vi.fn();
const mockDeleteAllUserPushSubscriptions = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/push-subscriptions", () => ({
  upsertPushSubscription: (...args: unknown[]) => mockUpsertPushSubscription(...args),
  deleteAllUserPushSubscriptions: (...args: unknown[]) =>
    mockDeleteAllUserPushSubscriptions(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {},
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

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
  },
}));

import { POST, DELETE } from "./route";

const USER_ID = "user-123";
const VALID_BODY = {
  endpoint: "https://push.example.com/sub/abc123",
  keys: { p256dh: "p256dhkey", auth: "authkey" },
};

function makeRequest(method: string, body?: unknown) {
  const origin = "https://app.example.com";
  return new Request(`${origin}/api/v1/push/subscribe`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Host: "app.example.com",
      Origin: origin,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID });
  mockUpsertPushSubscription.mockResolvedValue(undefined);
  mockDeleteAllUserPushSubscriptions.mockResolvedValue(undefined);
});

// ─── POST /api/v1/push/subscribe ─────────────────────────────────────────────

describe("POST /api/v1/push/subscribe", () => {
  it("returns 201 with ok:true on valid subscription", async () => {
    const res = await POST(makeRequest("POST", VALID_BODY));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { ok: boolean } };
    expect(json.data.ok).toBe(true);
    expect(mockUpsertPushSubscription).toHaveBeenCalledWith(USER_ID, VALID_BODY);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const res = await POST(makeRequest("POST", VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body (missing keys)", async () => {
    const res = await POST(makeRequest("POST", { endpoint: "https://push.example.com" }));
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/v1/push/subscribe ───────────────────────────────────────────

describe("DELETE /api/v1/push/subscribe", () => {
  it("returns 200 with ok:true on successful unsubscribe", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ok: boolean } };
    expect(json.data.ok).toBe(true);
    expect(mockDeleteAllUserPushSubscriptions).toHaveBeenCalledWith(USER_ID);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );

    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(401);
  });
});
