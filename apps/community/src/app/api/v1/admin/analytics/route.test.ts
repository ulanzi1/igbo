// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequireAdminSession = vi.fn();
const mockGetSummaryMetrics = vi.fn();
const mockGetGrowthSeries = vi.fn();
const mockGetEngagementMetrics = vi.fn();
const mockGetLatestBreakdownSnapshot = vi.fn();
const mockCurrentlyOnlineUsers = vi.fn();
const mockTodayPartialDau = vi.fn();

vi.mock("@igbo/auth/admin-auth", () => ({
  requireAdminSession: (...args: unknown[]) => mockRequireAdminSession(...args),
}));

vi.mock("@igbo/db/queries/analytics", () => ({
  getSummaryMetrics: (...args: unknown[]) => mockGetSummaryMetrics(...args),
  getGrowthSeries: (...args: unknown[]) => mockGetGrowthSeries(...args),
  getEngagementMetrics: (...args: unknown[]) => mockGetEngagementMetrics(...args),
  getLatestBreakdownSnapshot: (...args: unknown[]) => mockGetLatestBreakdownSnapshot(...args),
  currentlyOnlineUsers: (...args: unknown[]) => mockCurrentlyOnlineUsers(...args),
  todayPartialDau: (...args: unknown[]) => mockTodayPartialDau(...args),
}));

vi.mock("@/lib/request-context", () => ({
  runWithContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

import { GET } from "./route";

const MOCK_SUMMARY = { dau: 100, mau: 2000, registrations: 5, approvals: 3, netGrowth: 2 };
const MOCK_GROWTH = { registrations: [], approvals: [], netGrowth: [] };
const MOCK_ENGAGEMENT = {
  posts: 50,
  messages: 300,
  articles: 5,
  events: 2,
  avgEventAttendance: 12,
};

function makeRequest(params = "") {
  return new Request(`https://example.com/api/v1/admin/analytics${params}`, {
    method: "GET",
    headers: { Host: "example.com", Origin: "https://example.com" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminSession.mockResolvedValue({ adminId: "admin-1" });
  mockGetSummaryMetrics.mockResolvedValue(MOCK_SUMMARY);
  mockGetGrowthSeries.mockResolvedValue(MOCK_GROWTH);
  mockGetEngagementMetrics.mockResolvedValue(MOCK_ENGAGEMENT);
  mockGetLatestBreakdownSnapshot.mockResolvedValue(null);
  mockCurrentlyOnlineUsers.mockResolvedValue(7);
  mockTodayPartialDau.mockResolvedValue(42);
});

describe("GET /api/v1/admin/analytics", () => {
  it("returns 200 with full dashboard payload", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("summary");
    expect(body.data).toHaveProperty("growth");
    expect(body.data).toHaveProperty("engagement");
    expect(body.data).toHaveProperty("live");
    expect(body.data).toHaveProperty("geoBreakdown");
    expect(body.data).toHaveProperty("tierBreakdown");
    expect(body.data).toHaveProperty("topContent");
    expect(body.data).toHaveProperty("dateRange");
  });

  it("includes DAU/MAU ratio derived client-side in summary", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data.summary).toHaveProperty("dauMauRatio");
    expect(body.data.summary.dauMauRatio).toBe(0.05); // 100/2000
  });

  it("includes live indicators", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data.live.currentlyOnline).toBe(7);
    expect(body.data.live.todayPartialDau).toBe(42);
  });

  it("returns only live when live=true", async () => {
    const res = await GET(makeRequest("?live=true"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty("live");
    expect(body.data).not.toHaveProperty("summary");
    expect(mockGetSummaryMetrics).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid toDate", async () => {
    const res = await GET(makeRequest("?toDate=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid fromDate", async () => {
    const res = await GET(makeRequest("?fromDate=baddate&toDate=2026-03-01"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when fromDate is after toDate", async () => {
    const res = await GET(makeRequest("?fromDate=2026-03-10&toDate=2026-03-01"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not admin", async () => {
    const { ApiError } = await import("@/lib/api-error");
    mockRequireAdminSession.mockRejectedValue(new ApiError({ title: "Unauthorized", status: 401 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("accepts valid custom date range", async () => {
    const res = await GET(makeRequest("?fromDate=2026-02-01&toDate=2026-03-01"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.dateRange).toEqual({ fromDate: "2026-02-01", toDate: "2026-03-01" });
  });

  it("uses DAU/MAU ratio of 0 when MAU is 0", async () => {
    mockGetSummaryMetrics.mockResolvedValue({ ...MOCK_SUMMARY, mau: 0 });
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.data.summary.dauMauRatio).toBe(0);
  });

  it("defaults to 30-day range when no date params provided", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();
    const { fromDate, toDate } = body.data.dateRange;
    const diffMs = new Date(toDate).getTime() - new Date(fromDate).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(29);
  });
});
