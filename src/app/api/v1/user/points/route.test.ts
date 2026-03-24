// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/permissions", () => ({
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
}));
vi.mock("@/services/points-engine", () => ({
  getUserPointsBalance: vi.fn().mockResolvedValue(42),
  getBadgeMultiplier: vi.fn().mockResolvedValue(1),
}));
vi.mock("@/db/queries/points", () => ({
  getPointsSummaryStats: vi.fn().mockResolvedValue({ total: 42, thisWeek: 5, thisMonth: 20 }),
}));
vi.mock("@/lib/request-context", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getUserPointsBalance } from "@/services/points-engine";
import { getPointsSummaryStats } from "@/db/queries/points";
import { ApiError } from "@/lib/api-error";

const mockRequireAuth = vi.mocked(requireAuthenticatedSession);
const mockGetBalance = vi.mocked(getUserPointsBalance);
const mockGetSummary = vi.mocked(getPointsSummaryStats);

function makeRequest() {
  return new Request("http://localhost/api/v1/user/points");
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetBalance.mockReset();
  mockGetSummary.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: "user-1", role: "MEMBER", tier: "BASIC" });
  mockGetBalance.mockResolvedValue(42);
  mockGetSummary.mockResolvedValue({ total: 42, thisWeek: 5, thisMonth: 20 });
});

describe("GET /api/v1/user/points", () => {
  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns balance and summary from service + query", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.balance).toBe(42);
    expect(json.data.summary).toEqual({ total: 42, thisWeek: 5, thisMonth: 20 });
  });

  it("returns balance=0 when user has no points", async () => {
    mockGetBalance.mockResolvedValue(0);
    mockGetSummary.mockResolvedValue({ total: 0, thisWeek: 0, thisMonth: 0 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.balance).toBe(0);
    expect(json.data.summary.total).toBe(0);
  });

  it("returns summary stats correctly", async () => {
    mockGetSummary.mockResolvedValue({ total: 100, thisWeek: 10, thisMonth: 50 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.summary.thisWeek).toBe(10);
    expect(json.data.summary.thisMonth).toBe(50);
  });

  it("propagates service error as 500", async () => {
    mockGetBalance.mockRejectedValue(new Error("Redis down"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
