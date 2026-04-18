import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-all-postings", () => ({
  listAllPostingsForAdmin: vi.fn(),
  getCompaniesWithPostings: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/domain/all-postings-table", () => ({
  AllPostingsTable: ({
    initialPostings,
    initialTotal,
    companies,
  }: {
    initialPostings: unknown[];
    initialTotal: number;
    companies: unknown[];
  }) => (
    <div
      data-testid="all-postings-table"
      data-total={initialTotal}
      data-postings={initialPostings.length}
      data-companies={companies.length}
    />
  ),
}));

import React from "react";
import { auth } from "@igbo/auth";
import {
  listAllPostingsForAdmin,
  getCompaniesWithPostings,
} from "@igbo/db/queries/portal-admin-all-postings";
import Page from "./page";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

const mockPostingsResult = {
  postings: [
    {
      id: "posting-1",
      title: "Software Engineer",
      status: "active" as const,
      location: "Lagos",
      employmentType: "full_time",
      archivedAt: null,
      createdAt: new Date("2026-03-01"),
      companyId: "company-1",
      companyName: "Tech Corp",
      companyTrustBadge: false,
      employerName: "John Doe",
      applicationDeadline: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const mockCompanies = [{ id: "company-1", name: "Tech Corp" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAllPostingsForAdmin).mockResolvedValue(mockPostingsResult);
  vi.mocked(getCompaniesWithPostings).mockResolvedValue(mockCompanies);
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("AdminAllPostingsPage", () => {
  it("redirects non-admin users", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", activePortalRole: "EMPLOYER" },
    } as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects unauthenticated users", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("renders AllPostingsTable for JOB_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByTestId("all-postings-table")).toBeInTheDocument();
  });

  it("passes initial postings and companies to AllPostingsTable", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    const table = screen.getByTestId("all-postings-table");
    expect(table).toHaveAttribute("data-total", "1");
    expect(table).toHaveAttribute("data-postings", "1");
    expect(table).toHaveAttribute("data-companies", "1");
  });

  it("fetches postings with page=1 and pageSize=20", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(listAllPostingsForAdmin).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(getCompaniesWithPostings).toHaveBeenCalled();
  });

  it("renders heading and subtitle", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    // Translations return key as value in test
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("allPostingsTitle");
    expect(screen.getByText("allPostingsSubtitle")).toBeInTheDocument();
  });
});
