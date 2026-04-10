import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: vi.fn(),
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
  getTranslations: vi.fn().mockResolvedValue((key: string, params?: Record<string, unknown>) => {
    if (params) {
      return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    }
    return key;
  }),
}));
vi.mock("@/components/flow/ats-pipeline-view", () => ({
  AtsPipelineView: ({ applications }: { applications: unknown[] }) => (
    <div data-testid="ats-pipeline-view" data-count={applications.length} />
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getApplicationsWithSeekerDataByJobId } from "@igbo/db/queries/portal-applications";
import Page from "./page";

const mockCompany = {
  id: "company-1",
  ownerUserId: "user-1",
  name: "Acme Corp",
  onboardingCompletedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPosting = {
  id: "job-1",
  companyId: "company-1",
  title: "Software Engineer",
  status: "active",
  employmentType: "full_time",
  location: "Lagos",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockApplications = [
  {
    id: "app-1",
    jobId: "job-1",
    seekerUserId: "u-1",
    status: "submitted" as const,
    createdAt: new Date("2026-01-01"),
    coverLetterText: null,
    portfolioLinksJson: [],
    selectedCvId: null,
    seekerName: "Ada Okafor",
    seekerHeadline: "Engineer",
    seekerProfileId: "sp-1",
    seekerSkills: [],
  },
];

const PARAMS = Promise.resolve({ locale: "en", jobId: "job-1" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue(mockCompany as never);
  vi.mocked(getJobPostingById).mockResolvedValue(mockPosting as never);
  vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue(mockApplications as never);
});

describe("CandidatesPage", () => {
  it("renders the pipeline view with applications", async () => {
    const ui = await Page({ params: PARAMS });
    render(ui as React.ReactElement);

    expect(screen.getByTestId("ats-pipeline-view")).toBeInTheDocument();
    expect(screen.getByTestId("ats-pipeline-view")).toHaveAttribute("data-count", "1");
  });

  it("renders breadcrumbs with job title", async () => {
    const ui = await Page({ params: PARAMS });
    render(ui as React.ReactElement);

    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("redirects when not an employer", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null);
    await expect(Page({ params: PARAMS })).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects when job not found", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue(null);
    await expect(Page({ params: PARAMS })).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("redirects when job belongs to different company", async () => {
    vi.mocked(getJobPostingById).mockResolvedValue({
      ...mockPosting,
      companyId: "other-company",
    } as never);
    await expect(Page({ params: PARAMS })).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("renders empty pipeline when no applications", async () => {
    vi.mocked(getApplicationsWithSeekerDataByJobId).mockResolvedValue([]);
    const ui = await Page({ params: PARAMS });
    render(ui as React.ReactElement);

    expect(screen.getByTestId("ats-pipeline-view")).toHaveAttribute("data-count", "0");
  });

  it("calls getApplicationsWithSeekerDataByJobId with jobId", async () => {
    await Page({ params: PARAMS });
    expect(getApplicationsWithSeekerDataByJobId).toHaveBeenCalledWith("job-1");
  });
});
