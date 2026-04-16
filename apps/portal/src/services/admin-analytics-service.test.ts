// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/portal-admin-analytics", () => ({
  getPostingsAnalytics: vi.fn(),
  getApplicationsAnalytics: vi.fn(),
  getHiringAnalytics: vi.fn(),
  getUsersAnalytics: vi.fn(),
  getReviewPerformanceAnalytics: vi.fn(),
}));

import {
  getPostingsAnalytics,
  getApplicationsAnalytics,
  getHiringAnalytics,
  getUsersAnalytics,
  getReviewPerformanceAnalytics,
} from "@igbo/db/queries/portal-admin-analytics";
import { computeTrend, getPlatformAnalytics } from "./admin-analytics-service";

const mockPostings = {
  activeCount: 10,
  pendingReviewCount: 3,
  rejectedCount: 2,
  expiredCount: 5,
  prevRejectedCount: 1,
  prevExpiredCount: 4,
};

const mockApplications = {
  submittedCount: 20,
  avgPerPosting: 5,
  interviewConversionRate: 0.5,
  prevSubmittedCount: 15,
  prevAvgPerPosting: 5,
  prevInterviewConversionRate: 0.4,
};

const mockHiring = {
  medianTimeToFillDays: 14.5,
  hiresCount: 5,
  offerAcceptRate: 0.625,
  prevMedianTimeToFillDays: 20,
  prevHiresCount: 3,
  prevOfferAcceptRate: 0.5,
};

const mockUsers = {
  activeSeekers: 12,
  activeEmployers: 5,
  newRegistrations: 20,
  prevActiveSeekers: 8,
  prevActiveEmployers: 5,
  prevNewRegistrations: 15,
};

const mockReview = {
  avgReviewTimeMs: 120000,
  approvalRate: 0.7,
  rejectionRate: 0.2,
  changesRequestedRate: 0.1,
  prevApprovalRate: 0.65,
  prevRejectionRate: 0.25,
  prevChangesRequestedRate: 0.1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPostingsAnalytics).mockResolvedValue(mockPostings);
  vi.mocked(getApplicationsAnalytics).mockResolvedValue(mockApplications);
  vi.mocked(getHiringAnalytics).mockResolvedValue(mockHiring);
  vi.mocked(getUsersAnalytics).mockResolvedValue(mockUsers);
  vi.mocked(getReviewPerformanceAnalytics).mockResolvedValue(mockReview);
});

describe("computeTrend", () => {
  it("returns null when previous is null (no data)", () => {
    expect(computeTrend(10, null)).toBeNull();
    expect(computeTrend(0, undefined)).toBeNull();
  });

  it("returns stable when both values are 0", () => {
    const result = computeTrend(0, 0);
    expect(result).toEqual({ direction: "stable", percentChange: 0 });
  });

  it("returns up 100% when previous is 0 and current is positive", () => {
    const result = computeTrend(5, 0);
    expect(result).toEqual({ direction: "up", percentChange: 100 });
  });

  it("returns down 100% when previous is 0 and current is negative", () => {
    const result = computeTrend(-3, 0);
    expect(result).toEqual({ direction: "down", percentChange: 100 });
  });

  it("returns up direction when current > previous (outside stable threshold)", () => {
    const result = computeTrend(110, 100);
    expect(result?.direction).toBe("up");
    expect(result?.percentChange).toBe(10);
  });

  it("returns down direction when current < previous (outside stable threshold)", () => {
    const result = computeTrend(80, 100);
    expect(result?.direction).toBe("down");
    expect(result?.percentChange).toBe(20);
  });

  it("returns stable when change is within ±1% threshold", () => {
    const result = computeTrend(100, 100);
    expect(result?.direction).toBe("stable");

    const result2 = computeTrend(100.5, 100);
    expect(result2?.direction).toBe("stable");
  });

  it("rounds percentChange to 1 decimal", () => {
    const result = computeTrend(133, 100);
    expect(result?.percentChange).toBe(33);

    const result2 = computeTrend(115, 100);
    expect(result2?.percentChange).toBe(15);
  });
});

describe("getPlatformAnalytics", () => {
  it("calls all 5 query functions", async () => {
    await getPlatformAnalytics();
    expect(getPostingsAnalytics).toHaveBeenCalledOnce();
    expect(getApplicationsAnalytics).toHaveBeenCalledOnce();
    expect(getHiringAnalytics).toHaveBeenCalledOnce();
    expect(getUsersAnalytics).toHaveBeenCalledOnce();
    expect(getReviewPerformanceAnalytics).toHaveBeenCalledOnce();
  });

  it("sets activeCount and pendingReviewCount trend to null (snapshots)", async () => {
    const result = await getPlatformAnalytics();
    expect(result.postings.activeCount.trend).toBeNull();
    expect(result.postings.pendingReviewCount.trend).toBeNull();
  });

  it("computes trend for rejectedCount", async () => {
    const result = await getPlatformAnalytics();
    // current=2, prev=1 → up 100%
    expect(result.postings.rejectedCount.trend?.direction).toBe("up");
    expect(result.postings.rejectedCount.trend?.percentChange).toBe(100);
  });

  it("includes generatedAt ISO timestamp", async () => {
    const result = await getPlatformAnalytics();
    expect(result.generatedAt).toBeDefined();
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(new Date(result.generatedAt).getFullYear()).toBeGreaterThanOrEqual(2024);
  });

  it("handles zero-data edge case without crashes", async () => {
    vi.mocked(getPostingsAnalytics).mockResolvedValue({
      activeCount: 0,
      pendingReviewCount: 0,
      rejectedCount: 0,
      expiredCount: 0,
      prevRejectedCount: 0,
      prevExpiredCount: 0,
    });
    vi.mocked(getApplicationsAnalytics).mockResolvedValue({
      submittedCount: 0,
      avgPerPosting: 0,
      interviewConversionRate: 0,
      prevSubmittedCount: 0,
      prevAvgPerPosting: 0,
      prevInterviewConversionRate: 0,
    });
    vi.mocked(getHiringAnalytics).mockResolvedValue({
      medianTimeToFillDays: null,
      hiresCount: 0,
      offerAcceptRate: 0,
      prevMedianTimeToFillDays: null,
      prevHiresCount: 0,
      prevOfferAcceptRate: 0,
    });
    vi.mocked(getUsersAnalytics).mockResolvedValue({
      activeSeekers: 0,
      activeEmployers: 0,
      newRegistrations: 0,
      prevActiveSeekers: 0,
      prevActiveEmployers: 0,
      prevNewRegistrations: 0,
    });
    vi.mocked(getReviewPerformanceAnalytics).mockResolvedValue({
      avgReviewTimeMs: null,
      approvalRate: 0,
      rejectionRate: 0,
      changesRequestedRate: 0,
      prevApprovalRate: 0,
      prevRejectionRate: 0,
      prevChangesRequestedRate: 0,
    });

    const result = await getPlatformAnalytics();
    expect(result.postings.activeCount.value).toBe(0);
    expect(result.hiring.medianTimeToFillDays.value).toBeNull();
    expect(result.review.avgReviewTimeMs).toBeNull();
    expect(result.applications.interviewConversionRate.value).toBe(0);
    expect(Number.isNaN(result.applications.avgPerPosting.value)).toBe(false);
  });

  it("sets activeEmployers trend to null (point-in-time metric)", async () => {
    const result = await getPlatformAnalytics();
    expect(result.users.activeEmployers.trend).toBeNull();
  });

  it("returns correct review metrics including avgReviewTimeMs", async () => {
    const result = await getPlatformAnalytics();
    expect(result.review.avgReviewTimeMs).toBe(120000);
    expect(result.review.approvalRate.value).toBe(0.7);
  });
});
