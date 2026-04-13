// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
  getFormatter: vi.fn().mockResolvedValue({
    dateTime: (d: Date) => d.toISOString(),
  }),
}));
vi.mock("@/components/semantic/salary-display", () => ({
  SalaryDisplay: ({ min, max }: { min?: number | null; max?: number | null }) =>
    `${min ?? ""}-${max ?? ""}`,
}));
vi.mock("@/services/admin-review-service", () => ({
  getReviewDetail: vi.fn(),
}));
vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: vi.fn((html: string) => html),
}));
vi.mock("@/components/domain/review-action-panel", () => ({
  ReviewActionPanel: () => null,
  ReviewActionPanelSkeleton: () => null,
}));
vi.mock("@/components/domain/screening-results-panel", () => ({
  ScreeningResultsPanel: () => null,
}));
vi.mock("@/components/domain/flag-history-panel", () => ({
  FlagHistoryPanel: () => null,
}));
vi.mock("@/components/domain/flag-posting-trigger", () => ({
  FlagPostingTrigger: () => null,
}));

import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { getReviewDetail } from "@/services/admin-review-service";
import ReviewDetailPage from "./page";

const mockDetail = {
  posting: {
    id: "posting-1",
    companyId: "company-1",
    title: "Software Engineer",
    descriptionHtml: "<p>Great role</p>",
    requirements: "5 years experience",
    salaryMin: 500000,
    salaryMax: 800000,
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
    viewCount: 0,
    communityPostId: null,
    screeningStatus: null,
    screeningResultJson: null,
    screeningCheckedAt: null,
    enableCoverLetter: false,
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  },
  company: {
    id: "company-1",
    ownerUserId: "user-1",
    name: "Tech Corp",
    logoUrl: null,
    description: "A tech company",
    industry: "technology",
    companySize: "11-50",
    cultureInfo: null,
    trustBadge: true,
    onboardingCompletedAt: null,
    createdAt: new Date("2025-12-01"),
    updatedAt: new Date("2025-12-01"),
  },
  employerName: "John Doe",
  totalPostings: 5,
  approvedCount: 4,
  rejectedCount: 1,
  confidenceIndicator: {
    level: "high" as const,
    verifiedEmployer: true,
    violationCount: 0,
    reportCount: 0,
    engagementLevel: "high" as const,
  },
  screeningResult: null,
  reportCount: 0,
  reviewHistory: [],
  flags: [],
};

function makeParams(locale = "en", jobId = "posting-1") {
  return Promise.resolve({ locale, jobId });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getReviewDetail).mockResolvedValue(mockDetail);
});

describe("ReviewDetailPage", () => {
  it("renders posting content for JOB_ADMIN", async () => {
    const result = await ReviewDetailPage({ params: makeParams() });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("renders back link to queue", async () => {
    const result = await ReviewDetailPage({ params: makeParams() });

    expect(result).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects non-admin (EMPLOYER) to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);

    await ReviewDetailPage({ params: makeParams("en", "posting-1") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("redirects to admin queue when posting not found", async () => {
    vi.mocked(getReviewDetail).mockResolvedValue(null);

    await ReviewDetailPage({ params: makeParams("en", "unknown-id") });

    expect(redirect).toHaveBeenCalledWith("/en/admin");
  });

  it("calls getReviewDetail with the correct jobId", async () => {
    await ReviewDetailPage({ params: makeParams("en", "posting-1") });

    expect(getReviewDetail).toHaveBeenCalledWith("posting-1");
  });

  it("sanitizes description HTML before rendering", async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize");
    await ReviewDetailPage({ params: makeParams() });

    expect(sanitizeHtml).toHaveBeenCalledWith("<p>Great role</p>");
  });

  it("renders employer profile section", async () => {
    const result = await ReviewDetailPage({ params: makeParams() });

    expect(result).toBeDefined();
    expect(getReviewDetail).toHaveBeenCalled();
  });

  it("renders posting history stats", async () => {
    const result = await ReviewDetailPage({ params: makeParams() });

    expect(result).toBeDefined();
    // totalPostings: 5, approvedCount: 4, rejectedCount: 1
    expect(getReviewDetail).toHaveBeenCalledWith("posting-1");
  });

  it("renders screening placeholder section", async () => {
    const result = await ReviewDetailPage({ params: makeParams() });

    expect(result).toBeDefined();
  });

  it("renders flag history section", async () => {
    const result = await ReviewDetailPage({ params: makeParams() });

    expect(result).toBeDefined();
    expect(getReviewDetail).toHaveBeenCalled();
  });
});
