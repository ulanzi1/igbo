import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingWithCompany: vi.fn(),
}));
vi.mock("@/lib/sanitize", () => ({
  sanitizeHtml: vi.fn((html: string) => html),
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
vi.mock("@/components/domain/view-tracker", () => ({
  ViewTracker: ({ jobId }: { jobId: string }) => (
    <div data-testid="view-tracker" data-job-id={jobId} />
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
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
  viewCount: 5,
  communityPostId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJobPostingWithCompany).mockResolvedValue({
    posting: mockPosting,
    company: mockCompany,
  } as never);
});

async function renderPage(locale = "en", jobId = "posting-uuid") {
  const node = await Page({ params: Promise.resolve({ locale, jobId }) });
  return render(node as React.ReactElement);
}

describe("JobDetailPage (seeker)", () => {
  it("renders job title and company name", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Senior Engineer" })).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
  });

  it("renders ViewTracker with correct jobId", async () => {
    await renderPage();
    const tracker = screen.getByTestId("view-tracker");
    expect(tracker.getAttribute("data-job-id")).toBe("posting-uuid");
  });

  it("redirects to /jobs when posting not found", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/jobs");
  });

  it("redirects to /jobs when posting is not active", async () => {
    vi.mocked(getJobPostingWithCompany).mockResolvedValue({
      posting: { ...mockPosting, status: "paused" },
      company: mockCompany,
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en/jobs");
  });

  it("renders job description when available", async () => {
    await renderPage();
    expect(screen.getByText("jobDescription")).toBeTruthy();
  });
});
