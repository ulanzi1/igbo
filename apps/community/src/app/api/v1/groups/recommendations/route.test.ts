// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

const mockRequireAuthenticatedSession = vi.fn();
const mockGetRecommendedGroupsForUser = vi.fn();

vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: (...args: unknown[]) => mockRequireAuthenticatedSession(...args),
}));

vi.mock("@/services/recommendation-service", () => ({
  getRecommendedGroupsForUser: (...args: unknown[]) => mockGetRecommendedGroupsForUser(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock("@/services/rate-limiter", () => ({
  RATE_LIMIT_PRESETS: {
    GROUP_LIST: { maxRequests: 60, windowMs: 60_000 },
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000, limit: 60 }),
  buildRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

import { GET } from "./route";
import { ApiError } from "@/lib/api-error";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const GROUPS = [
  {
    id: "g1",
    name: "Test",
    description: null,
    bannerUrl: null,
    visibility: "public",
    joinType: "open",
    memberCount: 5,
    score: 2,
  },
];

function makeRequest(url = "http://localhost/api/v1/groups/recommendations") {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/groups/recommendations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthenticatedSession.mockRejectedValue(
      new ApiError({ title: "Unauthorized", status: 401 }),
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 with groups for authenticated user", async () => {
    mockRequireAuthenticatedSession.mockResolvedValue({ userId: USER_ID });
    mockGetRecommendedGroupsForUser.mockResolvedValue(GROUPS);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { groups: unknown[] } };
    expect(body.data.groups).toEqual(GROUPS);
  });
});
