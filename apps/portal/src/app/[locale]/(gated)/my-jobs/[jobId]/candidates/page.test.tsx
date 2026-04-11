import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsWithSeekerDataByJobId: vi.fn(),
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
vi.mock("@/components/flow/ats-pipeline-view", () => ({
  AtsPipelineView: ({ applications }: { applications: Array<{ id: string }> }) => (
    <div data-testid="ats-pipeline-view" data-app-count={applications.length} />
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
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

const mockApplications = [
  {
    id: "app-1",
    jobId: "posting-uuid",
    seekerUserId: "user-1",
    status: "submitted" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    seekerName: "Ada Okafor",
    seekerHeadline: "Senior Engineer",
    seekerProfileId: "sp-1",
    seekerSkills: [],
  },
  {
    id: "app-2",
    jobId: "posting-uuid",
    seekerUserId: "user-2",
    status: "under_review" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    seekerName: "Bob Eze",
    seekerHeadline: "Designer",
    seekerProfileId: "sp-2",
    seekerSkills: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue(mockCompany as never);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  } as never);
  vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue(mockApplications);
});

async function renderPage(locale = "en", jobId = "posting-uuid") {
  const node = await Page({ params: Promise.resolve({ locale, jobId }) });
  return render(node as React.ReactElement);
}

describe("AtsCandidatesPage", () => {
  it("renders the pipeline view with applications", async () => {
    await renderPage();
    const view = screen.getByTestId("ats-pipeline-view");
    expect(view).toBeTruthy();
    expect(view.getAttribute("data-app-count")).toBe("2");
  });

  it("renders the page with breadcrumb and title", async () => {
    await renderPage();
    expect(screen.getByTestId("ats-candidates-page")).toBeTruthy();
    // Title is translated — the mocked getTranslations returns the key
    expect(screen.getAllByText("pageTitle").length).toBeGreaterThan(0);
  });

  it("renders with zero applications (empty state handled by AtsPipelineView)", async () => {
    vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue([]);
    await renderPage();
    const view = screen.getByTestId("ats-pipeline-view");
    expect(view.getAttribute("data-app-count")).toBe("0");
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
});
