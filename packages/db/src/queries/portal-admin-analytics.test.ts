// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("../index", () => ({
  db: {
    execute: vi.fn(),
  },
}));

vi.mock("./portal-admin-reviews", () => ({
  getAdminActivitySummary: vi.fn(),
}));

import { db } from "../index";
import { getAdminActivitySummary } from "./portal-admin-reviews";
import {
  getPostingsAnalytics,
  getApplicationsAnalytics,
  getHiringAnalytics,
  getUsersAnalytics,
  getReviewPerformanceAnalytics,
} from "./portal-admin-analytics";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPostingsAnalytics", () => {
  it("returns parsed counts from raw SQL row", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        active_count: "10",
        pending_review_count: "3",
        rejected_count: "2",
        expired_count: "5",
        prev_rejected_count: "1",
        prev_expired_count: "4",
      },
    ] as never);

    const result = await getPostingsAnalytics();
    expect(result.activeCount).toBe(10);
    expect(result.pendingReviewCount).toBe(3);
    expect(result.rejectedCount).toBe(2);
    expect(result.expiredCount).toBe(5);
    expect(result.prevRejectedCount).toBe(1);
    expect(result.prevExpiredCount).toBe(4);
  });

  it("returns zeros for null/empty results (zero-data edge case)", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        active_count: null,
        pending_review_count: null,
        rejected_count: null,
        expired_count: null,
        prev_rejected_count: null,
        prev_expired_count: null,
      },
    ] as never);

    const result = await getPostingsAnalytics();
    expect(result.activeCount).toBe(0);
    expect(result.pendingReviewCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.expiredCount).toBe(0);
  });

  it("accepts custom periodDays parameter", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        active_count: "5",
        pending_review_count: "0",
        rejected_count: "0",
        expired_count: "0",
        prev_rejected_count: "0",
        prev_expired_count: "0",
      },
    ] as never);

    await getPostingsAnalytics(7);
    expect(db.execute).toHaveBeenCalledOnce();
  });
});

describe("getApplicationsAnalytics", () => {
  it("computes avgPerPosting (rounded to 1 decimal) and interviewConversionRate", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        submitted_count: "20",
        distinct_jobs_current: "4",
        interview_count: "10",
        prev_submitted_count: "15",
        prev_distinct_jobs: "3",
        prev_interview_count: "6",
      },
    ] as never);

    const result = await getApplicationsAnalytics();
    expect(result.submittedCount).toBe(20);
    expect(result.avgPerPosting).toBe(5); // 20 / 4
    expect(result.interviewConversionRate).toBe(0.5); // 10 / 20
    expect(result.prevSubmittedCount).toBe(15);
    expect(result.prevAvgPerPosting).toBe(5); // 15 / 3
    expect(result.prevInterviewConversionRate).toBe(0.4); // 6 / 15
  });

  it("rounds avgPerPosting to 1 decimal place", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        submitted_count: "10",
        distinct_jobs_current: "3",
        interview_count: "0",
        prev_submitted_count: "7",
        prev_distinct_jobs: "3",
        prev_interview_count: "0",
      },
    ] as never);

    const result = await getApplicationsAnalytics();
    // 10 / 3 = 3.333... → rounded to 3.3
    expect(result.avgPerPosting).toBe(3.3);
    // 7 / 3 = 2.333... → rounded to 2.3
    expect(result.prevAvgPerPosting).toBe(2.3);
  });

  it("guards against division by zero when no applications", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        submitted_count: "0",
        distinct_jobs_current: "0",
        interview_count: "0",
        prev_submitted_count: "0",
        prev_distinct_jobs: "0",
        prev_interview_count: "0",
      },
    ] as never);

    const result = await getApplicationsAnalytics();
    expect(result.avgPerPosting).toBe(0);
    expect(result.interviewConversionRate).toBe(0);
    expect(result.prevAvgPerPosting).toBe(0);
    expect(result.prevInterviewConversionRate).toBe(0);
    expect(Number.isNaN(result.interviewConversionRate)).toBe(false);
  });

  it("returns zeros for null DB values", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        submitted_count: null,
        distinct_jobs_current: null,
        interview_count: null,
        prev_submitted_count: null,
        prev_distinct_jobs: null,
        prev_interview_count: null,
      },
    ] as never);

    const result = await getApplicationsAnalytics();
    expect(result.submittedCount).toBe(0);
    expect(result.avgPerPosting).toBe(0);
    expect(result.interviewConversionRate).toBe(0);
  });
});

describe("getHiringAnalytics", () => {
  it("returns hiring metrics including median time to fill", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        hires_count: "5",
        offered_or_hired_count: "8",
        prev_hires_count: "3",
        prev_offered_or_hired_count: "6",
        median_ttf_days: "14.5",
        prev_median_ttf_days: "20.0",
      },
    ] as never);

    const result = await getHiringAnalytics();
    expect(result.hiresCount).toBe(5);
    expect(result.offerAcceptRate).toBeCloseTo(0.625); // 5/8
    expect(result.medianTimeToFillDays).toBe(14.5);
    expect(result.prevHiresCount).toBe(3);
    expect(result.prevMedianTimeToFillDays).toBe(20.0);
    expect(result.prevOfferAcceptRate).toBe(0.5); // 3/6
  });

  it("returns null for medianTimeToFillDays when no hires exist", async () => {
    vi.mocked(db.execute).mockResolvedValue([
      {
        hires_count: "0",
        offered_or_hired_count: "0",
        prev_hires_count: "0",
        prev_offered_or_hired_count: "0",
        median_ttf_days: null,
        prev_median_ttf_days: null,
      },
    ] as never);

    const result = await getHiringAnalytics();
    expect(result.medianTimeToFillDays).toBeNull();
    expect(result.prevMedianTimeToFillDays).toBeNull();
    expect(result.offerAcceptRate).toBe(0);
    expect(result.prevOfferAcceptRate).toBe(0);
  });
});

describe("getUsersAnalytics", () => {
  it("returns user activity metrics from parallel queries", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{ active_seekers: "12", prev_active_seekers: "8" }] as never)
      .mockResolvedValueOnce([{ active_employers: "5" }] as never)
      .mockResolvedValueOnce([{ new_registrations: "20", prev_new_registrations: "15" }] as never);

    const result = await getUsersAnalytics();
    expect(result.activeSeekers).toBe(12);
    expect(result.activeEmployers).toBe(5);
    expect(result.newRegistrations).toBe(20);
    expect(result.prevActiveSeekers).toBe(8);
    expect(result.prevNewRegistrations).toBe(15);
  });

  it("returns zeros when all DB results are null/empty", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{ active_seekers: null, prev_active_seekers: null }] as never)
      .mockResolvedValueOnce([{ active_employers: null }] as never)
      .mockResolvedValueOnce([{ new_registrations: null, prev_new_registrations: null }] as never);

    const result = await getUsersAnalytics();
    expect(result.activeSeekers).toBe(0);
    expect(result.activeEmployers).toBe(0);
    expect(result.newRegistrations).toBe(0);
  });

  it("calls db.execute three times for parallel queries", async () => {
    vi.mocked(db.execute)
      .mockResolvedValueOnce([{ active_seekers: "0", prev_active_seekers: "0" }] as never)
      .mockResolvedValueOnce([{ active_employers: "0" }] as never)
      .mockResolvedValueOnce([{ new_registrations: "0", prev_new_registrations: "0" }] as never);

    await getUsersAnalytics();
    expect(db.execute).toHaveBeenCalledTimes(3);
  });
});

describe("getReviewPerformanceAnalytics", () => {
  const mockSummary = {
    pendingCount: 2,
    reviewsToday: 5,
    avgReviewTimeMs: 120000,
    approvalRate: 0.7,
    rejectionRate: 0.2,
    changesRequestedRate: 0.1,
  };

  it("returns current period from getAdminActivitySummary + previous period rates", async () => {
    vi.mocked(getAdminActivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(db.execute).mockResolvedValue([
      {
        approved_count: "6",
        rejected_count: "2",
        changes_requested_count: "2",
        total_count: "10",
      },
    ] as never);

    const result = await getReviewPerformanceAnalytics();
    expect(result.approvalRate).toBe(0.7);
    expect(result.rejectionRate).toBe(0.2);
    expect(result.changesRequestedRate).toBe(0.1);
    expect(result.avgReviewTimeMs).toBe(120000);
    expect(result.prevApprovalRate).toBe(0.6); // 6/10
    expect(result.prevRejectionRate).toBe(0.2); // 2/10
    expect(result.prevChangesRequestedRate).toBe(0.2); // 2/10
  });

  it("returns zero previous rates when no previous period reviews exist", async () => {
    vi.mocked(getAdminActivitySummary).mockResolvedValue(mockSummary);
    vi.mocked(db.execute).mockResolvedValue([
      { approved_count: "0", rejected_count: "0", changes_requested_count: "0", total_count: "0" },
    ] as never);

    const result = await getReviewPerformanceAnalytics();
    expect(result.prevApprovalRate).toBe(0);
    expect(result.prevRejectionRate).toBe(0);
    expect(result.prevChangesRequestedRate).toBe(0);
    expect(Number.isNaN(result.prevApprovalRate)).toBe(false);
  });

  it("handles null avgReviewTimeMs from getAdminActivitySummary", async () => {
    vi.mocked(getAdminActivitySummary).mockResolvedValue({
      ...mockSummary,
      avgReviewTimeMs: null,
    });
    vi.mocked(db.execute).mockResolvedValue([
      { approved_count: "0", rejected_count: "0", changes_requested_count: "0", total_count: "0" },
    ] as never);

    const result = await getReviewPerformanceAnalytics();
    expect(result.avgReviewTimeMs).toBeNull();
  });
});
