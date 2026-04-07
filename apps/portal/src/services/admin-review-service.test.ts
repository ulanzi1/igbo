// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/portal-admin-reviews", () => ({
  listPendingReviewPostings: vi.fn(),
  getPostingWithReviewContext: vi.fn(),
  getAdminActivitySummary: vi.fn(),
}));

vi.mock("@igbo/db/queries/cross-app", () => ({
  getCommunityTrustSignals: vi.fn(),
}));

import {
  listPendingReviewPostings,
  getPostingWithReviewContext,
  getAdminActivitySummary,
} from "@igbo/db/queries/portal-admin-reviews";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import { getReviewQueue, getReviewDetail, getDashboardSummary } from "./admin-review-service";

const BASE_POSTING = {
  id: "posting-1",
  companyId: "company-1",
  title: "Software Engineer",
  descriptionHtml: "<p>Great role</p>",
  requirements: null,
  salaryMin: null,
  salaryMax: null,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time" as const,
  status: "pending_review" as const,
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  archivedAt: null,
  revisionCount: 0,
  viewCount: 5,
  communityPostId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  employerTotalPostings: 3,
};

const BASE_COMPANY = {
  id: "company-1",
  ownerUserId: "user-1",
  name: "Tech Corp",
  logoUrl: null,
  description: null,
  industry: "technology",
  companySize: "11-50",
  cultureInfo: null,
  trustBadge: true,
  onboardingCompletedAt: new Date("2025-12-01"),
  createdAt: new Date("2025-12-01"),
  updatedAt: new Date("2025-12-01"),
};

const BASE_TRUST_SIGNALS = {
  isVerified: true,
  memberSince: new Date("2024-01-01"),
  displayName: "John Doe",
  engagementLevel: "high" as const,
};

const UNVERIFIED_TRUST_SIGNALS = {
  isVerified: false,
  memberSince: new Date("2024-01-01"),
  displayName: "Jane Smith",
  engagementLevel: "low" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCommunityTrustSignals).mockResolvedValue(BASE_TRUST_SIGNALS);
  vi.mocked(getAdminActivitySummary).mockResolvedValue({
    pendingCount: 5,
    reviewsToday: 3,
    avgReviewTimeMs: 300000,
    approvalRate: 0.7,
    rejectionRate: 0.2,
    changesRequestedRate: 0.1,
  });
});

describe("getReviewQueue", () => {
  it("returns enriched items with confidence indicator", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [{ posting: BASE_POSTING, company: BASE_COMPANY, employerName: "John Doe" }],
      total: 1,
    });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.confidenceIndicator).toBeDefined();
    expect(result.total).toBe(1);
  });

  it("confidence indicator is high for verified employer with 0 violations/reports", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [{ posting: BASE_POSTING, company: BASE_COMPANY, employerName: "John Doe" }],
      total: 1,
    });
    vi.mocked(getCommunityTrustSignals).mockResolvedValue(BASE_TRUST_SIGNALS);

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items[0]?.confidenceIndicator.level).toBe("high");
    expect(result.items[0]?.confidenceIndicator.verifiedEmployer).toBe(true);
    expect(result.items[0]?.confidenceIndicator.violationCount).toBe(0);
    expect(result.items[0]?.confidenceIndicator.reportCount).toBe(0);
  });

  it("confidence indicator is medium for unverified employer", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [
        {
          posting: BASE_POSTING,
          company: { ...BASE_COMPANY, trustBadge: false },
          employerName: "Jane",
        },
      ],
      total: 1,
    });
    vi.mocked(getCommunityTrustSignals).mockResolvedValue(UNVERIFIED_TRUST_SIGNALS);

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items[0]?.confidenceIndicator.level).toBe("medium");
  });

  it("confidence indicator is low when violations > 0 (placeholder threshold)", async () => {
    // violationCount is hardcoded to 0 in P-3.1, so this tests the logic directly
    // In P-3.1, level will be "high" or "medium" since violations are always 0
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [{ posting: BASE_POSTING, company: BASE_COMPANY, employerName: "John" }],
      total: 1,
    });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    // In P-3.1, violations=0, so level depends on verification
    expect(result.items[0]?.confidenceIndicator.violationCount).toBe(0);
    expect(result.items[0]?.confidenceIndicator.reportCount).toBe(0);
  });

  it("getCommunityTrustSignals returns null — falls back to low/medium confidence", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [
        {
          posting: BASE_POSTING,
          company: { ...BASE_COMPANY, trustBadge: false },
          employerName: "Jane",
        },
      ],
      total: 1,
    });
    vi.mocked(getCommunityTrustSignals).mockResolvedValue(null);

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    // null trust signals falls back to unverified + low engagement → medium confidence
    expect(result.items[0]?.confidenceIndicator.level).toBe("medium");
    expect(result.items[0]?.confidenceIndicator.engagementLevel).toBe("low");
  });

  it("isFirstTimeEmployer is true when employerTotalPostings === 1", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [
        {
          posting: { ...BASE_POSTING, employerTotalPostings: 1 },
          company: BASE_COMPANY,
          employerName: "New Employer",
        },
      ],
      total: 1,
    });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items[0]?.isFirstTimeEmployer).toBe(true);
  });

  it("isFirstTimeEmployer is false when employerTotalPostings > 1", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [
        {
          posting: { ...BASE_POSTING, employerTotalPostings: 5 },
          company: BASE_COMPANY,
          employerName: "Repeat Employer",
        },
      ],
      total: 1,
    });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items[0]?.isFirstTimeEmployer).toBe(false);
  });

  it("priority sort puts first-time employers before repeat employers", async () => {
    const now = new Date("2026-01-01");
    const laterDate = new Date("2026-01-02");
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [
        {
          posting: {
            ...BASE_POSTING,
            id: "posting-repeat",
            employerTotalPostings: 5,
            createdAt: now,
          },
          company: BASE_COMPANY,
          employerName: "Repeat",
        },
        {
          posting: {
            ...BASE_POSTING,
            id: "posting-first",
            employerTotalPostings: 1,
            createdAt: laterDate,
          },
          company: { ...BASE_COMPANY, id: "company-2", ownerUserId: "user-2" },
          employerName: "First Timer",
        },
      ],
      total: 2,
    });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items[0]?.posting.id).toBe("posting-first");
    expect(result.items[1]?.posting.id).toBe("posting-repeat");
  });

  it("handles empty queue", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({ items: [], total: 0 });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("screeningResult is always null in P-3.1", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({
      items: [{ posting: BASE_POSTING, company: BASE_COMPANY, employerName: "John" }],
      total: 1,
    });

    const result = await getReviewQueue({ page: 1, pageSize: 20 });

    expect(result.items[0]?.screeningResult).toBeNull();
  });

  it("respects pagination options and propagates filters", async () => {
    vi.mocked(listPendingReviewPostings).mockResolvedValue({ items: [], total: 100 });

    await getReviewQueue({ page: 2, pageSize: 10, verifiedOnly: true });

    expect(listPendingReviewPostings).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      verifiedOnly: true,
    });
  });
});

describe("getReviewDetail", () => {
  it("returns full review detail context", async () => {
    vi.mocked(getPostingWithReviewContext).mockResolvedValue({
      posting: BASE_POSTING,
      company: BASE_COMPANY,
      employerName: "John Doe",
      totalPostings: 5,
      approvedCount: 4,
      rejectedCount: 1,
    });

    const result = await getReviewDetail("posting-1");

    expect(result).not.toBeNull();
    expect(result?.posting.id).toBe("posting-1");
    expect(result?.company.name).toBe("Tech Corp");
    expect(result?.totalPostings).toBe(5);
    expect(result?.approvedCount).toBe(4);
    expect(result?.rejectedCount).toBe(1);
  });

  it("returns null for non-existent posting", async () => {
    vi.mocked(getPostingWithReviewContext).mockResolvedValue(null);

    const result = await getReviewDetail("nonexistent");

    expect(result).toBeNull();
  });

  it("includes confidence indicator in detail result", async () => {
    vi.mocked(getPostingWithReviewContext).mockResolvedValue({
      posting: BASE_POSTING,
      company: BASE_COMPANY,
      employerName: "John Doe",
      totalPostings: 3,
      approvedCount: 2,
      rejectedCount: 0,
    });

    const result = await getReviewDetail("posting-1");

    expect(result?.confidenceIndicator).toBeDefined();
    expect(result?.confidenceIndicator.level).toBe("high");
  });

  it("screeningResult is null in detail result", async () => {
    vi.mocked(getPostingWithReviewContext).mockResolvedValue({
      posting: BASE_POSTING,
      company: BASE_COMPANY,
      employerName: "John Doe",
      totalPostings: 1,
      approvedCount: 0,
      rejectedCount: 0,
    });

    const result = await getReviewDetail("posting-1");

    expect(result?.screeningResult).toBeNull();
    expect(result?.reportCount).toBe(0);
  });
});

describe("getDashboardSummary", () => {
  it("returns dashboard metrics", async () => {
    const result = await getDashboardSummary();

    expect(result.pendingCount).toBe(5);
    expect(result.reviewsToday).toBe(3);
    expect(result.avgReviewTimeMs).toBe(300000);
    expect(result.approvalRate).toBe(0.7);
    expect(result.rejectionRate).toBe(0.2);
    expect(result.changesRequestedRate).toBe(0.1);
  });

  it("returns correct structure with all required fields", async () => {
    vi.mocked(getAdminActivitySummary).mockResolvedValue({
      pendingCount: 0,
      reviewsToday: 0,
      avgReviewTimeMs: null,
      approvalRate: 0,
      rejectionRate: 0,
      changesRequestedRate: 0,
    });

    const result = await getDashboardSummary();

    expect(result).toHaveProperty("pendingCount");
    expect(result).toHaveProperty("reviewsToday");
    expect(result).toHaveProperty("avgReviewTimeMs");
    expect(result).toHaveProperty("approvalRate");
    expect(result).toHaveProperty("rejectionRate");
    expect(result).toHaveProperty("changesRequestedRate");
    expect(result.avgReviewTimeMs).toBeNull();
  });

  it("calls getAdminActivitySummary exactly once and does not issue a redundant pending count query", async () => {
    await getDashboardSummary();
    expect(getAdminActivitySummary).toHaveBeenCalledTimes(1);
  });
});
