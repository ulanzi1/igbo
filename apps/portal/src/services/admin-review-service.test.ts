// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db/queries/portal-admin-reviews", () => ({
  listPendingReviewPostings: vi.fn(),
  getPostingWithReviewContext: vi.fn(),
  getAdminActivitySummary: vi.fn(),
  getReviewHistoryForPosting: vi.fn(),
}));

vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
}));

vi.mock("@igbo/db/queries/cross-app", () => ({
  getCommunityTrustSignals: vi.fn(),
}));

// Mock db for transaction-based service functions
vi.mock("@igbo/db", () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@igbo/db/schema/portal-company-profiles", () => ({
  portalCompanyProfiles: { id: "pcp_id", trustBadge: "pcp_trust_badge", ownerUserId: "pcp_owner" },
}));
vi.mock("@igbo/db/schema/portal-job-postings", () => ({
  portalJobPostings: {
    id: "pjp_id",
    status: "pjp_status",
    revisionCount: "pjp_rev_count",
    adminFeedbackComment: "pjp_feedback",
  },
}));
vi.mock("@igbo/db/schema/portal-admin-reviews", () => ({
  portalAdminReviews: {
    id: "par_id",
    postingId: "par_posting_id",
    decision: "par_decision",
    reviewedAt: "par_reviewed_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((col: unknown, val: unknown) => ({ gte: [col, val] })),
  count: vi.fn(() => ({ count: true })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  sql: Object.assign(
    vi.fn((_s: TemplateStringsArray, ..._v: unknown[]) => ({ sql: true })),
    { as: vi.fn() },
  ),
}));

vi.mock("@/services/event-bus", () => ({
  portalEventBus: { emit: vi.fn() },
}));

import {
  listPendingReviewPostings,
  getPostingWithReviewContext,
  getAdminActivitySummary,
  getReviewHistoryForPosting,
} from "@igbo/db/queries/portal-admin-reviews";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getCommunityTrustSignals } from "@igbo/db/queries/cross-app";
import { db } from "@igbo/db";
import { portalEventBus } from "@/services/event-bus";
import {
  getReviewQueue,
  getReviewDetail,
  getDashboardSummary,
  approvePosting,
  rejectPosting,
  requestChanges,
  checkFastLaneEligibility,
} from "./admin-review-service";

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

const PENDING_POSTING = {
  ...BASE_POSTING,
  status: "pending_review" as const,
  revisionCount: 0,
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
  vi.mocked(getReviewHistoryForPosting).mockResolvedValue([]);
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

// ---------------------------------------------------------------------------
// P-3.2: Decision function tests
// ---------------------------------------------------------------------------

// Closure-based tx mock — captures insert.values payloads + update.set
// payloads, and lets each test override what UPDATE … RETURNING yields
// (so we can simulate the race-condition empty-rowset case).
type CapturedInsert = { table: unknown; values: unknown };
type CapturedUpdate = { table: unknown; set: unknown };

interface TxCapture {
  inserts: CapturedInsert[];
  updates: CapturedUpdate[];
  setReturning: (rows: unknown[]) => void;
}

function installTxMock(): TxCapture {
  const inserts: CapturedInsert[] = [];
  const updates: CapturedUpdate[] = [];
  let returningRows: unknown[] = [{ id: "posting-1" }];

  const tx = {
    insert: (table: unknown) => ({
      values: (data: unknown) => {
        inserts.push({ table, values: data });
        return Promise.resolve(undefined);
      },
    }),
    update: (table: unknown) => ({
      set: (data: unknown) => {
        updates.push({ table, set: data });
        return {
          where: () => ({
            returning: () => Promise.resolve(returningRows),
          }),
        };
      },
    }),
  };

  vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never));

  return {
    inserts,
    updates,
    setReturning: (rows: unknown[]) => {
      returningRows = rows;
    },
  };
}

describe("approvePosting", () => {
  let cap: TxCapture;

  beforeEach(() => {
    vi.mocked(getJobPostingById).mockResolvedValue(PENDING_POSTING as never);
    cap = installTxMock();
  });

  it("approves a pending posting, persists review row, and emits event", async () => {
    await approvePosting("posting-1", "admin-1");

    expect(db.transaction).toHaveBeenCalledTimes(1);

    // The UPDATE must run BEFORE the INSERT (race-safety: fail-fast on contention).
    expect(cap.updates).toHaveLength(1);
    expect(cap.updates[0]?.set).toMatchObject({ status: "active" });

    expect(cap.inserts).toHaveLength(1);
    expect(cap.inserts[0]?.values).toMatchObject({
      postingId: "posting-1",
      reviewerUserId: "admin-1",
      decision: "approved",
      feedbackComment: null,
    });

    expect(vi.mocked(portalEventBus.emit)).toHaveBeenCalledWith(
      "job.reviewed",
      expect.objectContaining({
        jobId: "posting-1",
        reviewerUserId: "admin-1",
        decision: "approved",
        companyId: "company-1",
      }),
    );
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);

    await expect(approvePosting("bad-id", "admin-1")).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when posting is not pending_review (idempotency — already approved)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...PENDING_POSTING,
      status: "active",
    } as never);

    await expect(approvePosting("posting-1", "admin-1")).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 when concurrent admin already changed the status (RETURNING is empty)", async () => {
    cap.setReturning([]);

    await expect(approvePosting("posting-1", "admin-1")).rejects.toMatchObject({ status: 409 });
    // Insert must NOT happen when the guarded UPDATE matches no rows.
    expect(cap.inserts).toHaveLength(0);
    // Event bus must NOT fire on the race loser.
    expect(vi.mocked(portalEventBus.emit)).not.toHaveBeenCalled();
  });
});

describe("rejectPosting", () => {
  let cap: TxCapture;

  beforeEach(() => {
    vi.mocked(getJobPostingById).mockResolvedValue(PENDING_POSTING as never);
    cap = installTxMock();
  });

  it("rejects a posting and persists reason on both review row and posting", async () => {
    const reason = "This posting violates our policy guidelines.";
    await rejectPosting("posting-1", "admin-1", reason, "policy_violation");

    expect(db.transaction).toHaveBeenCalledTimes(1);

    expect(cap.updates).toHaveLength(1);
    expect(cap.updates[0]?.set).toMatchObject({
      status: "rejected",
      adminFeedbackComment: reason,
    });

    expect(cap.inserts).toHaveLength(1);
    expect(cap.inserts[0]?.values).toMatchObject({
      postingId: "posting-1",
      reviewerUserId: "admin-1",
      decision: "rejected",
      feedbackComment: reason,
    });

    expect(vi.mocked(portalEventBus.emit)).toHaveBeenCalledWith(
      "job.reviewed",
      expect.objectContaining({
        decision: "rejected",
      }),
    );
  });

  it("throws 400 when reason is shorter than 20 chars", async () => {
    await expect(
      rejectPosting("posting-1", "admin-1", "Too short", "policy_violation"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when category is invalid", async () => {
    await expect(
      rejectPosting(
        "posting-1",
        "admin-1",
        "This is a valid reason text here",
        "invalid_cat" as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);

    await expect(
      rejectPosting("bad-id", "admin-1", "Valid reason text here please", "other"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when posting is not pending_review", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...PENDING_POSTING,
      status: "rejected",
    } as never);

    await expect(
      rejectPosting(
        "posting-1",
        "admin-1",
        "This posting violates our guidelines.",
        "policy_violation",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 on race (RETURNING empty) and skips review insert + event emission", async () => {
    cap.setReturning([]);

    await expect(
      rejectPosting("posting-1", "admin-1", "Valid reason text right here.", "other"),
    ).rejects.toMatchObject({ status: 409 });
    expect(cap.inserts).toHaveLength(0);
    expect(vi.mocked(portalEventBus.emit)).not.toHaveBeenCalled();
  });
});

describe("requestChanges", () => {
  let cap: TxCapture;

  beforeEach(() => {
    vi.mocked(getJobPostingById).mockResolvedValue(PENDING_POSTING as never);
    cap = installTxMock();
  });

  it("requests changes — persists feedback, increments revisionCount, emits event", async () => {
    const feedback = "Please add salary information and improve job description.";
    await requestChanges("posting-1", "admin-1", feedback);

    expect(db.transaction).toHaveBeenCalledTimes(1);

    expect(cap.updates).toHaveLength(1);
    expect(cap.updates[0]?.set).toMatchObject({
      status: "draft",
      adminFeedbackComment: feedback,
    });
    // revisionCount uses an SQL expression — assert the property is present
    // (the mock for `sql` returns `{ sql: true }`).
    expect((cap.updates[0]?.set as Record<string, unknown>).revisionCount).toBeDefined();

    expect(cap.inserts).toHaveLength(1);
    expect(cap.inserts[0]?.values).toMatchObject({
      postingId: "posting-1",
      reviewerUserId: "admin-1",
      decision: "changes_requested",
      feedbackComment: feedback,
    });

    expect(vi.mocked(portalEventBus.emit)).toHaveBeenCalledWith(
      "job.reviewed",
      expect.objectContaining({
        decision: "changes_requested",
      }),
    );
  });

  it("throws 400 when feedback is shorter than 20 chars", async () => {
    await expect(requestChanges("posting-1", "admin-1", "Too short")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("throws 409 when max revisions reached (revisionCount >= 3)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...PENDING_POSTING,
      revisionCount: 3,
    } as never);

    await expect(
      requestChanges("posting-1", "admin-1", "Please improve the description section."),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 404 when posting not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);

    await expect(
      requestChanges("bad-id", "admin-1", "Please improve the description section."),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 409 when posting is not pending_review", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...PENDING_POSTING,
      status: "draft",
    } as never);

    await expect(
      requestChanges("posting-1", "admin-1", "Please improve the description section."),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 409 on race (RETURNING empty) and skips review insert + event emission", async () => {
    cap.setReturning([]);

    await expect(
      requestChanges("posting-1", "admin-1", "Please improve the description section."),
    ).rejects.toMatchObject({ status: 409 });
    expect(cap.inserts).toHaveLength(0);
    expect(vi.mocked(portalEventBus.emit)).not.toHaveBeenCalled();
  });
});

describe("checkFastLaneEligibility", () => {
  function setupDbSelect(responses: unknown[]) {
    let callIndex = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const resp = responses[callIndex] ?? [];
      callIndex++;
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(resp),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resp).then(resolve),
      } as never;
    });
  }

  it("returns ineligible when trustBadge is false", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(PENDING_POSTING as never);
    setupDbSelect([[{ trustBadge: false }], [{ cnt: 0 }]]);

    const result = await checkFastLaneEligibility("posting-1");

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Employer is not verified (trustBadge=false)");
  });

  it("returns ineligible when recent rejections exist", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(PENDING_POSTING as never);
    setupDbSelect([[{ trustBadge: true }], [{ cnt: 1 }]]);

    const result = await checkFastLaneEligibility("posting-1");

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Violations (rejections) found in last 60 days");
  });

  it("always ineligible due to missing screening (P-3.3 not yet implemented)", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(PENDING_POSTING as never);
    // Even with all other conditions met, screening=null makes ineligible
    setupDbSelect([[{ trustBadge: true }], [{ cnt: 0 }]]);

    const result = await checkFastLaneEligibility("posting-1");

    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("Screening"))).toBe(true);
  });

  it("returns ineligible with 'Posting not found' when posting doesn't exist", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);

    const result = await checkFastLaneEligibility("nonexistent");

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Posting not found");
  });
});
