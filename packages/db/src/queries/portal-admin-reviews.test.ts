// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock the db module
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();

// Chain builder pattern
function createChain(returnValue: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(Promise.resolve(returnValue));
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

vi.mock("../index", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../schema/portal-admin-reviews", () => ({
  portalAdminReviews: {
    id: "id_col",
    postingId: "posting_id_col",
    reviewerUserId: "reviewer_user_id_col",
    decision: "decision_col",
    feedbackComment: "feedback_comment_col",
    reviewedAt: "reviewed_at_col",
    createdAt: "created_at_col",
  },
}));

vi.mock("../schema/portal-job-postings", () => ({
  portalJobPostings: {
    id: "pjp_id",
    companyId: "pjp_company_id",
    title: "pjp_title",
    descriptionHtml: "pjp_desc_html",
    requirements: "pjp_requirements",
    salaryMin: "pjp_salary_min",
    salaryMax: "pjp_salary_max",
    salaryCompetitiveOnly: "pjp_salary_competitive",
    location: "pjp_location",
    employmentType: "pjp_employment_type",
    status: "pjp_status",
    culturalContextJson: "pjp_cultural_context",
    descriptionIgboHtml: "pjp_desc_igbo",
    applicationDeadline: "pjp_app_deadline",
    expiresAt: "pjp_expires_at",
    adminFeedbackComment: "pjp_admin_feedback",
    closedOutcome: "pjp_closed_outcome",
    closedAt: "pjp_closed_at",
    archivedAt: "pjp_archived_at",
    revisionCount: "pjp_revision_count",
    viewCount: "pjp_view_count",
    communityPostId: "pjp_community_post_id",
    createdAt: "pjp_created_at",
    updatedAt: "pjp_updated_at",
  },
}));

vi.mock("../schema/portal-company-profiles", () => ({
  portalCompanyProfiles: {
    id: "pcp_id",
    ownerUserId: "pcp_owner_user_id",
    name: "pcp_name",
    logoUrl: "pcp_logo_url",
    description: "pcp_description",
    industry: "pcp_industry",
    companySize: "pcp_company_size",
    cultureInfo: "pcp_culture_info",
    trustBadge: "pcp_trust_badge",
    onboardingCompletedAt: "pcp_onboarding_at",
    createdAt: "pcp_created_at",
    updatedAt: "pcp_updated_at",
  },
}));

vi.mock("../schema/auth-users", () => ({
  authUsers: {
    id: "au_id",
    name: "au_name",
    email: "au_email",
    createdAt: "au_created_at",
  },
}));

const makeSqlExpr = () => {
  const expr: Record<string, unknown> = { sql: true };
  expr.as = vi.fn().mockReturnValue(expr);
  return expr;
};

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((col: unknown, val: unknown) => ({ gte: [col, val] })),
  lte: vi.fn((col: unknown, val: unknown) => ({ lte: [col, val] })),
  count: vi.fn(() => ({ count: true })),
  sql: Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => makeSqlExpr()),
    { as: vi.fn() },
  ),
}));

import { db } from "../index";
import {
  listPendingReviewPostings,
  getPostingWithReviewContext,
  getAdminActivitySummary,
  countPendingReviewPostings,
} from "./portal-admin-reviews";

const BASE_POSTING_ROW = {
  postingId: "posting-1",
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
  postingCreatedAt: new Date("2026-01-01"),
  postingUpdatedAt: new Date("2026-01-01"),
  companyProfileId: "company-1",
  companyOwnerUserId: "user-1",
  companyName: "Tech Corp",
  companyLogoUrl: null,
  companyDescription: null,
  companyIndustry: "technology",
  companySize: "11-50",
  companyCultureInfo: null,
  companyTrustBadge: true,
  companyOnboardingCompletedAt: new Date("2025-12-01"),
  companyCreatedAt: new Date("2025-12-01"),
  companyUpdatedAt: new Date("2025-12-01"),
  employerName: "John Doe",
  employerTotalPostings: 3,
};

function setupDbChain(responses: unknown[]) {
  let callIndex = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const resp = responses[callIndex] ?? [];
    callIndex++;
    return {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue(resp),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resp).then(resolve),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPendingReviewPostings", () => {
  it("returns only pending_review postings", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({ page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.posting.status).toBe("pending_review");
  });

  it("respects pagination with page and pageSize", async () => {
    setupDbChain([[], [{ total: 50 }]]);

    const result = await listPendingReviewPostings({ page: 3, pageSize: 10 });

    expect(result.total).toBe(50);
    expect(result.items).toHaveLength(0);
  });

  it("returns correct employer name", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({ page: 1, pageSize: 20 });

    expect(result.items[0]?.employerName).toBe("John Doe");
  });

  it("handles null employer name", async () => {
    setupDbChain([[{ ...BASE_POSTING_ROW, employerName: null }], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({ page: 1, pageSize: 20 });

    expect(result.items[0]?.employerName).toBeNull();
  });

  it("employerTotalPostings is included on posting", async () => {
    setupDbChain([[{ ...BASE_POSTING_ROW, employerTotalPostings: 5 }], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({ page: 1, pageSize: 20 });

    expect(result.items[0]?.posting.employerTotalPostings).toBe(5);
  });

  it("returns empty list with zero total for no pending postings", async () => {
    setupDbChain([[], [{ total: 0 }]]);

    const result = await listPendingReviewPostings({ page: 1, pageSize: 20 });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it("filters by verifiedOnly", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({
      page: 1,
      pageSize: 20,
      verifiedOnly: true,
    });

    expect(result.items).toHaveLength(1);
  });

  it("filters by dateFrom and dateTo", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({
      page: 1,
      pageSize: 20,
      dateFrom: new Date("2025-01-01"),
      dateTo: new Date("2026-12-31"),
    });

    expect(result.items).toHaveLength(1);
  });

  it("filters by minRevisionCount", async () => {
    setupDbChain([[{ ...BASE_POSTING_ROW, revisionCount: 2 }], [{ total: 1 }]]);

    const result = await listPendingReviewPostings({
      page: 1,
      pageSize: 20,
      minRevisionCount: 1,
    });

    expect(result.items[0]?.posting.revisionCount).toBe(2);
  });
});

describe("getPostingWithReviewContext", () => {
  it("returns full review context for valid postingId", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 3 }], [{ cnt: 2 }], [{ cnt: 1 }]]);

    const result = await getPostingWithReviewContext("posting-1");

    expect(result).not.toBeNull();
    expect(result?.posting.id).toBe("posting-1");
    expect(result?.company.name).toBe("Tech Corp");
    expect(result?.totalPostings).toBe(3);
    expect(result?.approvedCount).toBe(2);
    expect(result?.rejectedCount).toBe(1);
  });

  it("returns null for non-existent posting", async () => {
    setupDbChain([[]]);

    const result = await getPostingWithReviewContext("nonexistent");

    expect(result).toBeNull();
  });

  it("returns correct employer name in context", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 1 }], [{ cnt: 0 }], [{ cnt: 0 }]]);

    const result = await getPostingWithReviewContext("posting-1");

    expect(result?.employerName).toBe("John Doe");
  });

  it("returns zero stats when no reviews exist", async () => {
    setupDbChain([[BASE_POSTING_ROW], [{ total: 1 }], [{ cnt: 0 }], [{ cnt: 0 }]]);

    const result = await getPostingWithReviewContext("posting-1");

    expect(result?.approvedCount).toBe(0);
    expect(result?.rejectedCount).toBe(0);
  });
});

describe("getAdminActivitySummary", () => {
  it("returns zeros for empty system", async () => {
    setupDbChain([
      [{ total: 0 }], // pending count
      [{ total: 0 }], // reviews today
      [{ total: 0 }], // all reviews
      [{ total: 0 }], // approved
      [{ total: 0 }], // rejected
      [{ total: 0 }], // changes_requested
      [{ avgMs: null }], // avg review time
    ]);

    const result = await getAdminActivitySummary();

    expect(result.pendingCount).toBe(0);
    expect(result.reviewsToday).toBe(0);
    expect(result.avgReviewTimeMs).toBeNull();
    expect(result.approvalRate).toBe(0);
    expect(result.rejectionRate).toBe(0);
    expect(result.changesRequestedRate).toBe(0);
  });

  it("calculates correct approval/rejection rates", async () => {
    setupDbChain([
      [{ total: 5 }], // pending count
      [{ total: 3 }], // reviews today
      [{ total: 10 }], // all reviews
      [{ total: 7 }], // approved
      [{ total: 2 }], // rejected
      [{ total: 1 }], // changes_requested
      [{ avgMs: "300000" }], // avg review time 5 min
    ]);

    const result = await getAdminActivitySummary();

    expect(result.pendingCount).toBe(5);
    expect(result.reviewsToday).toBe(3);
    expect(result.approvalRate).toBeCloseTo(0.7);
    expect(result.rejectionRate).toBeCloseTo(0.2);
    expect(result.changesRequestedRate).toBeCloseTo(0.1);
    expect(result.avgReviewTimeMs).toBe(300000);
  });
});

describe("countPendingReviewPostings", () => {
  it("returns count of pending review postings", async () => {
    setupDbChain([[{ total: 7 }]]);

    const count = await countPendingReviewPostings();

    expect(count).toBe(7);
  });

  it("returns 0 when no pending postings", async () => {
    setupDbChain([[{ total: 0 }]]);

    const count = await countPendingReviewPostings();

    expect(count).toBe(0);
  });
});
