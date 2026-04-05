import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/flow/job-posting-preview", () => ({
  JobPostingPreview: ({
    posting,
    isDraft,
  }: {
    posting: { title: string; status: string };
    isDraft: boolean;
  }) => (
    <div data-testid="job-posting-preview">
      <span data-testid="preview-title">{posting.title}</span>
      {isDraft && <div data-testid="preview-banner">Preview — Not Yet Published</div>}
    </div>
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import Page from "./page";

expect.extend(toHaveNoViolations);

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
  status: "draft",
  culturalContextJson: null,
  descriptionIgboHtml: null,
  applicationDeadline: null,
  expiresAt: null,
  adminFeedbackComment: null,
  closedOutcome: null,
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue(mockCompany as never);
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  } as never);
});

async function renderPage(locale = "en", jobId = "posting-uuid") {
  const node = await Page({ params: Promise.resolve({ locale, jobId }) });
  return render(node as React.ReactElement);
}

describe("JobPostingPreviewPage", () => {
  it("renders the preview component with posting data", async () => {
    await renderPage();
    expect(screen.getByTestId("job-posting-preview")).toBeTruthy();
    expect(screen.getByTestId("preview-title").textContent).toBe("Senior Engineer");
  });

  it("shows preview banner for draft posting", async () => {
    await renderPage();
    expect(screen.getByTestId("preview-banner")).toBeTruthy();
  });

  it("does not show preview banner for active posting", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, status: "active" },
      company: mockCompany,
    } as never);
    await renderPage();
    expect(screen.queryByTestId("preview-banner")).toBeNull();
  });

  it("redirects when employer has no company profile", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("redirects when posting belongs to different company (ownership check)", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, companyId: "other-company" },
      company: mockCompany,
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("passes axe-core accessibility check", async () => {
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
