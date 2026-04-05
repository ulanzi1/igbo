import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingsByCompanyIdWithFilter: vi.fn(),
}));
vi.mock("@igbo/db/schema/portal-job-postings", () => ({
  portalJobStatusEnum: {
    enumValues: ["draft", "pending_review", "active", "paused", "filled", "expired", "rejected"],
  },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation((ns: string) =>
    Promise.resolve((key: string, params?: Record<string, string>) => {
      const full = `${ns}.${key}`;
      if (params) return `${full}:${JSON.stringify(params)}`;
      return full;
    }),
  ),
}));
vi.mock("@/components/domain/job-posting-card", () => ({
  JobPostingCard: ({
    posting,
    actions,
  }: {
    posting: { id: string; title: string; status: string };
    actions?: React.ReactNode;
  }) => (
    <div data-testid="job-posting-card" data-id={posting.id}>
      <span>{posting.title}</span>
      <span data-testid={`status-${posting.id}`}>{posting.status}</span>
      {actions && <div data-testid="card-actions">{actions}</div>}
    </div>
  ),
  JobPostingCardSkeleton: () => <div>CardSkeleton</div>,
}));
vi.mock("@/components/domain/posting-status-actions", () => ({
  PostingStatusActions: ({ postingId, status }: { postingId: string; status: string }) => (
    <div data-testid={`actions-${postingId}`} data-status={status}>
      Actions
    </div>
  ),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingsByCompanyIdWithFilter } from "@igbo/db/queries/portal-job-postings";
import Page from "./page";

expect.extend(toHaveNoViolations);

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: null,
  description: null,
  industry: null,
  companySize: null,
  cultureInfo: null,
  trustBadge: false,
  onboardingCompletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPostings = [
  {
    id: "posting-1",
    title: "Senior Engineer",
    status: "draft",
    employmentType: "full_time",
    location: "Lagos",
    salaryMin: null,
    salaryMax: null,
    salaryCompetitiveOnly: false,
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
    adminFeedbackComment: null,
  },
  {
    id: "posting-2",
    title: "Junior Designer",
    status: "active",
    employmentType: "part_time",
    location: null,
    salaryMin: null,
    salaryMax: null,
    salaryCompetitiveOnly: true,
    createdAt: new Date("2026-03-02"),
    updatedAt: new Date("2026-03-02"),
    adminFeedbackComment: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue(mockProfile as never);
  vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([]);
});

async function renderPage(locale = "en", status?: string) {
  const node = await Page({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(status ? { status } : {}),
  });
  return render(node as React.ReactElement);
}

describe("MyJobsPage", () => {
  it("renders empty state when no postings", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText("Portal.myJobs.empty")).toBeTruthy();
    expect(screen.getByText("Portal.myJobs.emptyDescription")).toBeTruthy();
  });

  it("renders list of postings when postings exist", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue(mockPostings as never);
    await renderPage();
    const cards = screen.getAllByTestId("job-posting-card");
    expect(cards.length).toBe(2);
    expect(screen.getByText("Senior Engineer")).toBeTruthy();
    expect(screen.getByText("Junior Designer")).toBeTruthy();
  });

  it("shows Create New Job button linking to /jobs/new", async () => {
    await renderPage();
    const createLinks = screen.getAllByRole("link", { name: "Portal.myJobs.createNew" });
    expect(createLinks.length).toBeGreaterThan(0);
    expect(createLinks[0]!.getAttribute("href")).toContain("/jobs/new");
  });

  it("shows Create First Job link in empty state when no filter", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([]);
    await renderPage();
    const link = screen.getByRole("link", { name: "Portal.myJobs.createFirst" });
    expect(link.getAttribute("href")).toContain("/jobs/new");
  });

  it("redirects non-employer when requireCompanyProfile returns null", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("renders filter tabs including All tab", async () => {
    await renderPage();
    expect(screen.getByTestId("filter-tab-all")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-draft")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-active")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-pending_review")).toBeTruthy();
  });

  it("renders expired tab as a functional link (not disabled)", async () => {
    await renderPage();
    const expiredTab = screen.getByTestId("filter-tab-expired");
    expect(expiredTab.tagName).toBe("A");
    expect(expiredTab.getAttribute("href")).toContain("status=expired");
    expect(screen.queryByTestId("filter-tab-expired-disabled")).toBeNull();
  });

  it("filters postings by status from searchParams", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue(mockPostings as never);
    await renderPage("en", "draft");
    // Only draft postings shown
    const cards = screen.getAllByTestId("job-posting-card");
    expect(cards.length).toBe(1);
    expect(screen.getByText("Senior Engineer")).toBeTruthy();
    expect(screen.queryByText("Junior Designer")).toBeNull();
  });

  it("shows noPostingsForFilter message when filter has no results", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([]);
    await renderPage("en", "active");
    expect(screen.getByText("Portal.lifecycle.noPostingsForFilter")).toBeTruthy();
    // Should NOT show emptyDescription (that's only for unfiltered empty state)
    expect(screen.queryByText("Portal.myJobs.emptyDescription")).toBeNull();
  });

  it("treats invalid status as 'show all'", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue(mockPostings as never);
    await renderPage("en", "invalid_status");
    const cards = screen.getAllByTestId("job-posting-card");
    expect(cards.length).toBe(2);
  });

  it("renders PostingStatusActions for each posting", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue(mockPostings as never);
    await renderPage();
    expect(screen.getByTestId("actions-posting-1")).toBeTruthy();
    expect(screen.getByTestId("actions-posting-2")).toBeTruthy();
  });

  it("PostingStatusActions receives correct status", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue(mockPostings as never);
    await renderPage();
    expect(screen.getByTestId("actions-posting-1").getAttribute("data-status")).toBe("draft");
    expect(screen.getByTestId("actions-posting-2").getAttribute("data-status")).toBe("active");
  });

  it("renders archived tab as a functional link", async () => {
    await renderPage();
    const archivedTab = screen.getByTestId("filter-tab-archived");
    expect(archivedTab.tagName).toBe("A");
    expect(archivedTab.getAttribute("href")).toContain("status=archived");
  });

  it("filters by archived shows archived postings (separate query)", async () => {
    const archivedPosting = {
      ...mockPostings[0]!,
      id: "archived-1",
      title: "Archived Role",
      status: "expired",
      archivedAt: new Date("2026-02-01"),
    };
    // First call (allPostings) → empty, second call (archived filteredPostings) → archived posting,
    // third call (archivedCount) → archived posting
    vi.mocked(getJobPostingsByCompanyIdWithFilter)
      .mockResolvedValueOnce([]) // allPostings
      .mockResolvedValueOnce([archivedPosting] as never) // filteredPostings (archived filter)
      .mockResolvedValueOnce([archivedPosting] as never); // archivedCount
    await renderPage("en", "archived");
    expect(screen.getByText("Archived Role")).toBeTruthy();
  });

  it("treats 'archived' status param correctly (not treated as invalid)", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([]);
    await renderPage("en", "archived");
    // Should show "noPostingsForFilter" (filter applied), not empty+create link
    expect(screen.getByText("Portal.lifecycle.noPostingsForFilter")).toBeTruthy();
    expect(screen.queryByText("Portal.myJobs.emptyDescription")).toBeNull();
  });

  it("shows expired postings when filtering by expired tab", async () => {
    const expiredPosting = {
      ...mockPostings[0]!,
      id: "expired-1",
      title: "Expired Role",
      status: "expired",
      expiresAt: new Date("2026-01-01"),
      archivedAt: null,
    };
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([expiredPosting] as never);
    await renderPage("en", "expired");
    expect(screen.getByText("Expired Role")).toBeTruthy();
  });

  it("passes axe-core accessibility assertion on empty state", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue([]);
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core accessibility assertion with postings", async () => {
    vi.mocked(getJobPostingsByCompanyIdWithFilter).mockResolvedValue(mockPostings as never);
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
