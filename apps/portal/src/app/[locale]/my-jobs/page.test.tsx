import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingsByCompanyId: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/domain/job-posting-card", () => ({
  JobPostingCard: ({ posting }: { posting: { id: string; title: string; status: string } }) => (
    <div data-testid="job-posting-card" data-id={posting.id}>
      <span>{posting.title}</span>
      <span data-testid={`status-${posting.id}`}>{posting.status}</span>
    </div>
  ),
  JobPostingCardSkeleton: () => <div>CardSkeleton</div>,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getJobPostingsByCompanyId } from "@igbo/db/queries/portal-job-postings";
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
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue(mockProfile as never);
  vi.mocked(getJobPostingsByCompanyId).mockResolvedValue([]);
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("MyJobsPage", () => {
  it("renders empty state when no postings", async () => {
    vi.mocked(getJobPostingsByCompanyId).mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText("empty")).toBeTruthy();
    expect(screen.getByText("emptyDescription")).toBeTruthy();
  });

  it("renders list of postings when postings exist", async () => {
    vi.mocked(getJobPostingsByCompanyId).mockResolvedValue(mockPostings as never);
    await renderPage();
    const cards = screen.getAllByTestId("job-posting-card");
    expect(cards.length).toBe(2);
    expect(screen.getByText("Senior Engineer")).toBeTruthy();
    expect(screen.getByText("Junior Designer")).toBeTruthy();
  });

  it("shows Create New Job button linking to /jobs/new", async () => {
    await renderPage();
    const createLinks = screen.getAllByRole("link", { name: "createNew" });
    expect(createLinks.length).toBeGreaterThan(0);
    expect(createLinks[0]!.getAttribute("href")).toContain("/jobs/new");
  });

  it("shows Create First Job link in empty state", async () => {
    vi.mocked(getJobPostingsByCompanyId).mockResolvedValue([]);
    await renderPage();
    const link = screen.getByRole("link", { name: "createFirst" });
    expect(link.getAttribute("href")).toContain("/jobs/new");
  });

  it("redirects non-employer when requireCompanyProfile returns null", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("passes axe-core accessibility assertion on empty state", async () => {
    vi.mocked(getJobPostingsByCompanyId).mockResolvedValue([]);
    const { container } = await renderPage();
    const results = await axe(container);
    // @ts-expect-error jest-axe matcher not in vitest types
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core accessibility assertion with postings", async () => {
    vi.mocked(getJobPostingsByCompanyId).mockResolvedValue(mockPostings as never);
    const { container } = await renderPage();
    const results = await axe(container);
    // @ts-expect-error jest-axe matcher not in vitest types
    expect(results).toHaveNoViolations();
  });
});
