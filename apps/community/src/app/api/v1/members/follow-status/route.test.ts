// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Mocks ──────────────────────────────────────────────────────────────────────
const mockRequireAuthenticatedSession = vi.fn();
const mockBatchIsFollowing = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@igbo/db/queries/follows", () => ({
  batchIsFollowing: (...args: unknown[]) => mockBatchIsFollowing(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    FOLLOW_STATUS_BATCH: { maxRequests: 120, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 119,
    resetAt: Date.now() + 60_000,
    limit: 120,
  }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";
const USER_A = "00000000-0000-4000-8000-000000000002";
const USER_B = "00000000-0000-4000-8000-000000000003";

function makeGetRequest(queryString: string) {
  return new Request(`https://example.com/api/v1/members/follow-status?${queryString}`, {
    method: "GET",
    headers: { Host: "example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuthenticatedSession.mockResolvedValue({ userId: VIEWER_ID });
  mockBatchIsFollowing.mockResolvedValue({});
});

describe("GET /api/v1/members/follow-status", () => {
  it("returns follow status map for valid userIds", async () => {
    mockBatchIsFollowing.mockResolvedValue({ [USER_A]: true, [USER_B]: false });

    const res = await GET(makeGetRequest(`userIds=${USER_A},${USER_B}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, boolean> };
    expect(body.data).toEqual({ [USER_A]: true, [USER_B]: false });
    expect(mockBatchIsFollowing).toHaveBeenCalledWith(
      VIEWER_ID,
      expect.arrayContaining([USER_A, USER_B]),
    );
  });

  it("returns 400 when userIds param is missing", async () => {
    const res = await GET(makeGetRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns 400 when userIds is an empty string", async () => {
    const res = await GET(makeGetRequest("userIds="));
    expect(res.status).toBe(400);
  });

  it("returns 400 when any userId is not a valid UUID", async () => {
    const res = await GET(makeGetRequest(`userIds=not-a-uuid,${USER_A}`));
    expect(res.status).toBe(400);
    expect(mockBatchIsFollowing).not.toHaveBeenCalled();
  });

  it("returns 400 when more than 50 userIds are provided", async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const res = await GET(makeGetRequest(`userIds=${ids.join(",")}`));
    expect(res.status).toBe(400);
    expect(mockBatchIsFollowing).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ status: 401, title: "Unauthorized" }),
    );
    const res = await GET(makeGetRequest(`userIds=${USER_A}`));
    expect(res.status).toBe(401);
  });

  it("strips whitespace from comma-separated userIds", async () => {
    mockBatchIsFollowing.mockResolvedValue({ [USER_A]: false, [USER_B]: true });

    const res = await GET(makeGetRequest(`userIds= ${USER_A} , ${USER_B} `));

    expect(res.status).toBe(200);
    expect(mockBatchIsFollowing).toHaveBeenCalledWith(
      VIEWER_ID,
      expect.arrayContaining([USER_A, USER_B]),
    );
  });

  it("works with a single userId", async () => {
    mockBatchIsFollowing.mockResolvedValue({ [USER_A]: true });

    const res = await GET(makeGetRequest(`userIds=${USER_A}`));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, boolean> };
    expect(body.data[USER_A]).toBe(true);
  });
});
