// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetAdminUserPointsProfile = vi.fn();
const mockGetPointsSummaryStats = vi.fn();
const mockGetPointsLedgerHistory = vi.fn();
const mockGetUserThrottleHistory = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => mockRequireAdminSession(...a),
}));

vi.mock("@igbo/db/queries/points", () => ({
  getAdminUserPointsProfile: (...a: unknown[]) => mockGetAdminUserPointsProfile(...a),
  getPointsSummaryStats: (...a: unknown[]) => mockGetPointsSummaryStats(...a),
  getPointsLedgerHistory: (...a: unknown[]) => mockGetPointsLedgerHistory(...a),
  getUserThrottleHistory: (...a: unknown[]) => mockGetUserThrottleHistory(...a),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const VALID_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const sampleProfile = {
  userId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  displayName: "Alice",
  email: "alice@example.com",
  memberSince: "2024-01-01T00:00:00.000Z",
  badgeType: null,
  badgeAssignedAt: null,
};

const sampleSummary = { total: 100, thisWeek: 10, thisMonth: 40 };

const sampleLedger = {
  entries: [
    {
      id: "e1",
      points: 5,
      reason: "like_received",
      sourceType: "like_received",
      sourceId: "post-1",
      multiplierApplied: "1",
      createdAt: new Date("2024-06-01"),
    },
  ],
  total: 1,
};

const sampleThrottle = {
  entries: [
    {
      date: "2024-06-01T12:00:00.000Z",
      reason: "rapid_fire",
      eventType: "post.reacted",
      eventId: "post-1",
      triggeredBy: "Bob",
    },
  ],
  total: 1,
};

function makeRequest(userId: string, searchParams: Record<string, string> = {}) {
  const url = new URL(`https://example.com/api/v1/admin/members/${userId}/points`);
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
  mockGetAdminUserPointsProfile.mockResolvedValue(sampleProfile);
  mockGetPointsSummaryStats.mockResolvedValue(sampleSummary);
  mockGetPointsLedgerHistory.mockResolvedValue(sampleLedger);
  mockGetUserThrottleHistory.mockResolvedValue(sampleThrottle);
});

describe("GET /api/v1/admin/members/[userId]/points", () => {
  it("returns 401 when unauthenticated", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it("returns 403 when non-admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Forbidden", status: 403 }));
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(403);
  });

  it("returns 400 for non-UUID userId", async () => {
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockGetAdminUserPointsProfile.mockResolvedValue(null);
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with all sections on success", async () => {
    const res = await GET(makeRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.profile.userId).toBe(VALID_UUID);
    expect(body.data.summary).toEqual(sampleSummary);
    expect(body.data.ledger.entries).toHaveLength(1);
    expect(body.data.throttleHistory.entries).toHaveLength(1);
  });

  it("calls all four queries in parallel with correct userId", async () => {
    await GET(makeRequest(VALID_UUID));
    expect(mockGetAdminUserPointsProfile).toHaveBeenCalledWith(VALID_UUID);
    expect(mockGetPointsSummaryStats).toHaveBeenCalledWith(VALID_UUID);
    expect(mockGetPointsLedgerHistory).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(mockGetUserThrottleHistory).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("passes activityType filter to getPointsLedgerHistory", async () => {
    await GET(makeRequest(VALID_UUID, { activityType: "like_received" }));
    expect(mockGetPointsLedgerHistory).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ activityType: "like_received" }),
    );
  });

  it("passes throttlePage and throttleLimit to getUserThrottleHistory", async () => {
    await GET(makeRequest(VALID_UUID, { throttlePage: "2", throttleLimit: "10" }));
    expect(mockGetUserThrottleHistory).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({ page: 2, limit: 10 }),
    );
  });

  it("returns 400 when limit exceeds 100", async () => {
    const res = await GET(makeRequest(VALID_UUID, { limit: "101" }));
    expect(res.status).toBe(400);
  });
});
