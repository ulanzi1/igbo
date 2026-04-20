// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-company-profile", () => ({
  requireCompanyProfile: vi.fn(),
}));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsForEmployer: vi.fn(),
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
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/components/domain/employer-applications-table", () => ({
  EmployerApplicationsTable: (props: { initialApplications: unknown[]; initialTotal: number }) => (
    <div data-testid="employer-applications-table" data-total={props.initialTotal}>
      {JSON.stringify(props.initialApplications)}
    </div>
  ),
}));

import { render, screen } from "@testing-library/react";
import { requireCompanyProfile } from "@/lib/require-company-profile";
import { getApplicationsForEmployer } from "@igbo/db/queries/portal-applications";
import EmployerApplicationsPage from "./page";

const mockApplications = [
  {
    id: "app-1",
    jobId: "jp-1",
    seekerUserId: "u-1",
    applicantName: "Ada Okafor",
    jobTitle: "Senior Engineer",
    status: "submitted",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  },
  {
    id: "app-2",
    jobId: "jp-2",
    seekerUserId: "u-2",
    applicantName: "Emeka Nwosu",
    jobTitle: "Product Manager",
    status: "under_review",
    createdAt: new Date("2026-01-03"),
    updatedAt: new Date("2026-01-04"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCompanyProfile).mockResolvedValue({ id: "c-1" } as never);
  vi.mocked(getApplicationsForEmployer).mockResolvedValue({
    applications: mockApplications,
    total: 2,
  } as never);
});

async function renderPage(locale = "en", searchParams: Record<string, string> = {}) {
  const node = await EmployerApplicationsPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(node as React.ReactElement);
}

describe("EmployerApplicationsPage", () => {
  it("redirects non-employer users when requireCompanyProfile returns null", async () => {
    vi.mocked(requireCompanyProfile).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("renders page title for employers", async () => {
    await renderPage();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Portal.employerApplications.pageTitle");
  });

  it("passes initial data from DB query to table component", async () => {
    await renderPage();
    const table = screen.getByTestId("employer-applications-table");
    expect(table.getAttribute("data-total")).toBe("2");
    expect(table.textContent).toContain("app-1");
    expect(table.textContent).toContain("app-2");
  });

  it("handles status filter from searchParams", async () => {
    await renderPage("en", { status: "inReview" });
    expect(vi.mocked(getApplicationsForEmployer)).toHaveBeenCalledWith(
      "c-1",
      expect.objectContaining({
        statusFilter: ["under_review", "shortlisted"],
      }),
    );
  });
});
