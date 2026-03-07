// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@/db/queries/points", () => ({
  getPointsLedgerHistory: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
}));
vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getPointsLedgerHistory } from "@/db/queries/points";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetHistory = vi.mocked(getPointsLedgerHistory);

const BASE = "http://localhost/api/v1/user/points/history";

function makeRequest(query = "") {
  return new Request(`${BASE}${query}`);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetHistory.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockGetHistory.mockResolvedValue({ entries: [], total: 0 });
});

describe("GET /api/v1/user/points/history", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns paginated entries with defaults (page=1, limit=20)", async () => {
    const entry = {
      id: "e1",
      points: 1,
      reason: "like_received",
      sourceType: "like_received",
      sourceId: "post-1",
      multiplierApplied: "1.00",
      createdAt: new Date(),
    };
    mockGetHistory.mockResolvedValue({ entries: [entry], total: 1 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.entries).toHaveLength(1);
    expect(json.data.total).toBe(1);
    expect(json.data.page).toBe(1);
    expect(json.data.limit).toBe(20);
    expect(mockGetHistory).toHaveBeenCalledWith("user-1", {
      page: 1,
      limit: 20,
      activityType: undefined,
    });
  });

  it("forwards activityType filter to query", async () => {
    const res = await GET(makeRequest("?type=like_received"));
    expect(res.status).toBe(200);
    expect(mockGetHistory).toHaveBeenCalledWith("user-1", {
      page: 1,
      limit: 20,
      activityType: "like_received",
    });
  });

  it("defaults invalid page to 1", async () => {
    await GET(makeRequest("?page=abc"));
    expect(mockGetHistory).toHaveBeenCalledWith("user-1", expect.objectContaining({ page: 1 }));
  });

  it("clamps limit to maximum of 100", async () => {
    await GET(makeRequest("?limit=9999"));
    expect(mockGetHistory).toHaveBeenCalledWith("user-1", expect.objectContaining({ limit: 100 }));
  });

  it("returns empty result when no entries", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.entries).toHaveLength(0);
    expect(json.data.total).toBe(0);
  });

  it("returns 400 for invalid activity type filter", async () => {
    const res = await GET(makeRequest("?type=bogus_type"));
    expect(res.status).toBe(400);
  });
});
