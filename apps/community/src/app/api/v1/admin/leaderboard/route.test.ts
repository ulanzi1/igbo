// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetTopPointsEarners = vi.fn();
const mockGetThrottledUsersReport = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@igbo/db/queries/points", () => ({
  getTopPointsEarners: (...a: unknown[]) => mockGetTopPointsEarners(...a),
  getThrottledUsersReport: (...a: unknown[]) => mockGetThrottledUsersReport(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const sampleUser = {
  userId: "user-1",
  displayName: "Alice",
  email: "alice@example.com",
  totalPoints: 150,
  badgeType: null,
  memberSince: "2024-01-01T00:00:00.000Z",
};

const sampleFlaggedUser = {
  userId: "user-2",
  displayName: "Bob",
  throttleCount: 5,
  lastThrottledAt: "2024-06-15T12:00:00.000Z",
  reasons: ["rapid_fire"],
};

function makeRequest(searchParams: Record<string, string> = {}) {
  const url = new URL("https://example.com/api/v1/admin/leaderboard");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: {
      Host: "example.com",
      Origin: "https://example.com",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockGetTopPointsEarners.mockResolvedValue({ users: [sampleUser], total: 1 });
  mockGetThrottledUsersReport.mockResolvedValue({ users: [sampleFlaggedUser], total: 1 });
});

describe("GET /api/v1/admin/leaderboard", () => {
  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns leaderboard data with default params (view=leaderboard)", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data).toHaveLength(1);
    expect(body.data.data[0].userId).toBe("user-1");
    expect(body.data.pagination).toMatchObject({ page: 1, limit: 25, total: 1 });
    expect(mockGetTopPointsEarners).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 25 }),
    );
  });

  it("passes date range and activityType filters to getTopPointsEarners", async () => {
    await GET(
      makeRequest({
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        activityType: "like_received",
      }),
    );
    expect(mockGetTopPointsEarners).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        activityType: "like_received",
      }),
    );
  });

  it("returns flagged users when view=flagged", async () => {
    const res = await GET(makeRequest({ view: "flagged" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.data[0].userId).toBe("user-2");
    expect(mockGetThrottledUsersReport).toHaveBeenCalledTimes(1);
    expect(mockGetTopPointsEarners).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid activityType", async () => {
    const res = await GET(makeRequest({ activityType: "invalid_type" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when dateFrom > dateTo", async () => {
    const res = await GET(makeRequest({ dateFrom: "2024-12-31", dateTo: "2024-01-01" }));
    expect(res.status).toBe(400);
  });

  it("forwards pagination params to query function", async () => {
    await GET(makeRequest({ page: "2", limit: "10" }));
    expect(mockGetTopPointsEarners).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10 }),
    );
  });

  it("returns 400 for limit exceeding max (100)", async () => {
    const res = await GET(makeRequest({ limit: "101" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid dateFrom format", async () => {
    const res = await GET(makeRequest({ dateFrom: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid dateTo format", async () => {
    const res = await GET(makeRequest({ dateTo: "garbage" }));
    expect(res.status).toBe(400);
  });
});
