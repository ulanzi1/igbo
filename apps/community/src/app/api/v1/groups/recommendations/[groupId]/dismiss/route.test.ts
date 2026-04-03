// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db", () => ({ db: {} }));

const mockRequireAuthenticatedSession = vi.fn();
const mockDismissGroupRecommendation = vi.fn();
const mockInvalidateRecommendationCache = vi.fn();

vi.mock("@igbo/auth/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/recommendations", () => ({
  dismissGroupRecommendation: (...args: unknown[]) => mockDismissGroupRecommendation(...args),
}));

vi.mock("@/services/recommendation-service", () => ({
  invalidateRecommendationCache: (...args: unknown[]) => mockInvalidateRecommendationCache(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000, limit: 60 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { POST } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUP_ID = "00000000-0000-4000-8000-000000000010";

function makeRequest(groupId: string) {
  return new Request(`http://localhost/api/v1/groups/recommendations/${groupId}/dismiss`, {
    method: "POST",
    headers: { Origin: "http://localhost", Host: "localhost" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/groups/recommendations/[groupId]/dismiss", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await POST(makeRequest(GROUP_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID groupId", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID });
    const res = await POST(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("calls dismiss and invalidate then returns 200 for valid request", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID });
    mockDismissGroupRecommendation.mockResolvedValue(undefined);
    mockInvalidateRecommendationCache.mockResolvedValue(undefined);

    const res = await POST(makeRequest(GROUP_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { dismissed: boolean } };
    expect(body.data.dismissed).toBe(true);
    expect(mockDismissGroupRecommendation).toHaveBeenCalledWith(USER_ID, GROUP_ID);
    expect(mockInvalidateRecommendationCache).toHaveBeenCalledWith(USER_ID);
  });
});
