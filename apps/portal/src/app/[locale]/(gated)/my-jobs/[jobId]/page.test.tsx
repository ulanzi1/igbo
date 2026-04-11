import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
  getJobAnalytics: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string, params?: Record<string, string>) => {
    if (params) {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), key);
    }
    return key;
  }),
}));
vi.mock("@/components/domain/job-analytics-card", () => ({
  JobAnalyticsCard: ({ analytics }: { analytics: { views: number; applications: number } }) => (
    <div data-testid="job-analytics-card">
      <span data-testid="views">{analytics.views}</span>
      <span data-testid="applications">{analytics.applications}</span>
    </div>
  ),
  JobAnalyticsCardSkeleton: () => <div data-testid="job-analytics-skeleton" />,
}));
vi.mock("@/components/domain/share-to-community-button", () => ({
  ShareToCommunityButton: ({ isActive, isShared }: { isActive: boolean; isShared: boolean }) => (
    <div
      data-testid="share-to-community-button"
      data-is-active={String(isActive)}
      data-is-shared={String(isShared)}
    />
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany, getJobAnalytics } from "@igbo/db/queries/portal-job-postings";
import Page from "./page";

const mockCompany = {
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

const mockPosting = {
  id: "posting-uuid",
  companyId: "company-uuid",
  title: "Senior Engineer",
  descriptionHtml: "<p>Great role</p>",
  requirements: null,
  salaryMin: null,
  salaryMax: null,
  salaryCompetitiveOnly: false,
  location: "Lagos",
  employmentType: "full_time",
  status: "active",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  archivedAt: null,
  viewCount: 10,
  communityPostId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAnalytics = {
  viewCount: 10,
  applicationCount: 2,
  conversionRate: 20,
  communityPostId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue(mockCompany as never);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  } as never);
  vi.mocked(getJobAnalytics).mockResolvedValue(mockAnalytics);
});

async function renderPage(locale = "en", jobId = "posting-uuid") {
  const node = await Page({ params: Promise.resolve({ locale, jobId }) });
  return render(node as React.ReactElement);
}

describe("EmployerJobDetailPage", () => {
  it("renders analytics card with analytics data", async () => {
    await renderPage();
    expect(screen.getByTestId("job-analytics-card")).toBeTruthy();
    expect(screen.getByTestId("views").textContent).toBe("10");
    expect(screen.getByTestId("applications").textContent).toBe("2");
  });

  it("renders share to community button with active/shared state", async () => {
    await renderPage();
    const btn = screen.getByTestId("share-to-community-button");
    expect(btn.getAttribute("data-is-active")).toBe("true");
    expect(btn.getAttribute("data-is-shared")).toBe("false");
  });

  it("shows share button as shared when communityPostId is set", async () => {
    vi.mocked(getJobAnalytics).mockResolvedValue({
      ...mockAnalytics,
      communityPostId: "comm-post-1",
    });
    await renderPage();
    const btn = screen.getByTestId("share-to-community-button");
    expect(btn.getAttribute("data-is-shared")).toBe("true");
  });

  it("shows analytics for non-active postings (historical access)", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, status: "filled" },
      company: mockCompany,
    } as never);
    await renderPage();
    expect(screen.getByTestId("job-analytics-card")).toBeTruthy();
    const btn = screen.getByTestId("share-to-community-button");
    expect(btn.getAttribute("data-is-active")).toBe("false");
  });

  it("redirects to / when no company profile", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects to /my-jobs when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("redirects to /my-jobs when posting belongs to different company", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, companyId: "other-company" },
      company: mockCompany,
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("renders 'View Candidates' link with correct href and count", async () => {
    await renderPage();
    const link = screen.getByTestId("view-candidates-link");
    expect(link.getAttribute("href")).toBe("/en/my-jobs/posting-uuid/candidates");
    // mockAnalytics.applicationCount === 2
    expect(link.getAttribute("data-application-count")).toBe("2");
  });

  it("'View Candidates' link defaults count to 0 when analytics is null", async () => {
    vi.mocked(getJobAnalytics).mockResolvedValue(null);
    await renderPage();
    const link = screen.getByTestId("view-candidates-link");
    expect(link.getAttribute("data-application-count")).toBe("0");
  });
});
