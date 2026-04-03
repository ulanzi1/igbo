// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAuthenticatedSession = vi.fn();
const mockDismissSuggestion = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/suggestion-service", () => ({
  getMemberSuggestions: vi.fn(),
  dismissSuggestion: (...args: unknown[]) => mockDismissSuggestion(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    SUGGESTION_DISMISS: { maxRequests: 20, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAt: Date.now() + 60_000,
    limit: 20,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({ "X-RateLimit-Limit": "20" }),
}));

import { DELETE } from "./route";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const DISMISSED_USER_ID = "00000000-0000-4000-8000-000000000002";

function makeDeleteRequest(userId: string) {
  return new Request(`http://localhost:3000/api/v1/discover/suggestions/${userId}`, {
    method: "DELETE",
    headers: {
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: VIEWER_ID });
  mockDismissSuggestion.mockResolvedValue(undefined);
});

describe("DELETE /api/v1/discover/suggestions/[userId]", () => {
  it("returns 200 { dismissed: true } on success", async () => {
    const req = makeDeleteRequest(DISMISSED_USER_ID);
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { dismissed: boolean } };
    expect(body.data.dismissed).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const req = makeDeleteRequest(DISMISSED_USER_ID);
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when userId path segment is not a valid UUID", async () => {
    const req = makeDeleteRequest("not-a-uuid");
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("calls dismissSuggestion with correct viewer and dismissed userIds", async () => {
    const req = makeDeleteRequest(DISMISSED_USER_ID);
    await DELETE(req);
    expect(mockDismissSuggestion).toHaveBeenCalledWith(VIEWER_ID, DISMISSED_USER_ID);
  });
});
