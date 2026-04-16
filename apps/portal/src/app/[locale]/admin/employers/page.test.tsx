import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-admin-all-companies", () => ({
  listAllCompaniesForAdmin: vi.fn(),
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
vi.mock("@/components/domain/all-companies-table", () => ({
  AllCompaniesTable: ({
    initialCompanies,
    initialTotal,
  }: {
    initialCompanies: unknown[];
    initialTotal: number;
  }) => (
    <div
      data-testid="all-companies-table"
      data-total={initialTotal}
      data-companies={initialCompanies.length}
    />
  ),
}));

import React from "react";
import { auth } from "@igbo/auth";
import { listAllCompaniesForAdmin } from "@igbo/db/queries/portal-admin-all-companies";
import Page from "./page";

const adminSession = { user: { id: "admin-1", activePortalRole: "JOB_ADMIN" } };

const mockCompaniesResult = {
  companies: [
    {
      id: "company-1",
      name: "Tech Corp",
      trustBadge: true,
      ownerName: "John Doe",
      verificationDisplayStatus: "verified" as const,
      activePostingCount: 3,
      openViolationCount: 0,
      createdAt: new Date("2026-03-01"),
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAllCompaniesForAdmin).mockResolvedValue(mockCompaniesResult);
});

async function renderPage() {
  const node = await Page({ params: Promise.resolve({ locale: "en" }) });
  return render(node as React.ReactElement);
}

describe("AdminEmployersPage", () => {
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

  it("renders AllCompaniesTable for JOB_ADMIN", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByTestId("all-companies-table")).toBeInTheDocument();
  });

  it("passes initial companies and total to AllCompaniesTable", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    const table = screen.getByTestId("all-companies-table");
    expect(table).toHaveAttribute("data-total", "1");
    expect(table).toHaveAttribute("data-companies", "1");
  });

  it("calls listAllCompaniesForAdmin with page=1 and pageSize=20", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(listAllCompaniesForAdmin).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it("renders heading and subtitle", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("employersTitle");
    expect(screen.getByText("employersSubtitle")).toBeInTheDocument();
  });
});
