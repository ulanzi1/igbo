// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/services/admin-review-service", () => ({
  getReviewQueue: vi.fn(),
  getDashboardSummary: vi.fn(),
}));
vi.mock("@/components/domain/admin-dashboard-summary", () => ({
  AdminDashboardSummary: () => <div data-testid="dashboard-summary" />,
}));
vi.mock("@/components/domain/review-queue-table", () => ({
  ReviewQueueTable: ({
    initialItems,
    initialTotal,
  }: {
    initialItems: unknown[];
    initialTotal: number;
  }) => (
    <div
      data-testid="review-queue-table"
      data-count={initialItems.length}
      data-total={initialTotal}
    />
  ),
}));

import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { getReviewQueue, getDashboardSummary } from "@/services/admin-review-service";
import AdminPage from "./page";

const mockSummary = {
  pendingCount: 5,
  reviewsToday: 3,
  avgReviewTimeMs: 300000,
  approvalRate: 0.7,
  rejectionRate: 0.2,
  changesRequestedRate: 0.1,
};

const mockQueueItem = {
  posting: {
    id: "posting-1",
    title: "Engineer",
    createdAt: new Date(),
    status: "pending_review",
    revisionCount: 0,
    employerTotalPostings: 3,
  },
  company: { id: "company-1", name: "Tech Corp", trustBadge: true },
  employerName: "John",
  confidenceIndicator: {
    level: "high",
    verifiedEmployer: true,
    violationCount: 0,
    reportCount: 0,
    engagementLevel: "high",
  },
  isFirstTimeEmployer: false,
  screeningResult: null,
};

function makeParams(locale = "en") {
  return Promise.resolve({ locale });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "admin-1", activePortalRole: "JOB_ADMIN" },
  } as never);
  vi.mocked(getReviewQueue).mockResolvedValue({
    items: [mockQueueItem] as never,
    total: 1,
  });
  vi.mocked(getDashboardSummary).mockResolvedValue(mockSummary);
});

describe("AdminPage", () => {
  it("renders for JOB_ADMIN without redirect", async () => {
    const result = await AdminPage({ params: makeParams() });

    expect(redirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("shows dashboard summary", async () => {
    await AdminPage({ params: makeParams() });

    expect(getDashboardSummary).toHaveBeenCalled();
  });

  it("shows queue items", async () => {
    await AdminPage({ params: makeParams() });

    expect(getReviewQueue).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it("redirects non-JOB_ADMIN (EMPLOYER) to home", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "emp-1", activePortalRole: "EMPLOYER" },
    } as never);

    await AdminPage({ params: makeParams("en") });

    expect(redirect).toHaveBeenCalledWith("/en");
  });

  it("shows empty state when no pending postings", async () => {
    vi.mocked(getReviewQueue).mockResolvedValue({ items: [], total: 0 });

    const result = await AdminPage({ params: makeParams() });

    expect(result).toBeDefined();
    expect(getReviewQueue).toHaveBeenCalled();
  });
});
