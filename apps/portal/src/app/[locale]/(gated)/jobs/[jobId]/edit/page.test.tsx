import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("@/services/job-posting-service", () => ({
  canEditPosting: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/flow/job-posting-form", () => ({
  JobPostingForm: ({
    mode,
    initialData,
  }: {
    mode: string;
    initialData?: { title: string; status: string; adminFeedbackComment?: string | null };
  }) => (
    <div data-testid="job-posting-form">
      <span data-testid="form-mode">{mode}</span>
      {initialData?.title && <span data-testid="form-title">{initialData.title}</span>}
      {initialData?.adminFeedbackComment && (
        <span data-testid="form-feedback">{initialData.adminFeedbackComment}</span>
      )}
    </div>
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { canEditPosting } from "@/services/job-posting-service";
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
  vi.mocked(canEditPosting).mockReturnValue(true);
});

async function renderPage(locale = "en", jobId = "posting-uuid") {
  const node = await Page({ params: Promise.resolve({ locale, jobId }) });
  return render(node as React.ReactElement);
}

describe("JobPostingEditPage", () => {
  it("renders form in edit mode", async () => {
    await renderPage();
    expect(screen.getByTestId("job-posting-form")).toBeTruthy();
    expect(screen.getByTestId("form-mode").textContent).toBe("edit");
  });

  it("pre-fills form with posting data", async () => {
    await renderPage();
    expect(screen.getByTestId("form-title").textContent).toBe("Senior Engineer");
  });

  it("redirects when posting is pending_review (canEditPosting returns false)", async () => {
    vi.mocked(canEditPosting).mockReturnValue(false);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("redirects when employer has no company profile", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/my-jobs");
  });

  it("redirects when posting belongs to different company", async () => {
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
