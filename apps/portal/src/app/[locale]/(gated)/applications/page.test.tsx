import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/portal-applications", () => ({
  getApplicationsWithJobDataBySeekerId: vi.fn(),
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
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/domain/application-status-badge", () => ({
  ApplicationStatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`status-badge-${status}`}>{status}</span>
  ),
}));

import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { auth } from "@igbo/auth";
import { getApplicationsWithJobDataBySeekerId } from "@igbo/db/queries/portal-applications";
import ApplicationsPage from "./page";

expect.extend(toHaveNoViolations);

const seekerSession = {
  user: { id: "seeker-1", activePortalRole: "JOB_SEEKER" },
};

const mockApplications = [
  {
    id: "app-1",
    jobId: "jp-1",
    status: "submitted" as const,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    transitionedAt: null,
    jobTitle: "Senior Engineer",
    companyId: "cp-1",
    companyName: "Acme Corp",
  },
  {
    id: "app-2",
    jobId: "jp-2",
    status: "under_review" as const,
    createdAt: new Date("2026-01-03"),
    updatedAt: new Date("2026-01-04"),
    transitionedAt: null,
    jobTitle: "Product Manager",
    companyId: "cp-2",
    companyName: "Beta Inc",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(
    seekerSession as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
  );
  vi.mocked(getApplicationsWithJobDataBySeekerId).mockResolvedValue(mockApplications as never);
});

async function renderPage(locale = "en", status?: string) {
  const node = await ApplicationsPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(status ? { status } : {}),
  });
  return render(node as React.ReactElement);
}

describe("ApplicationsPage", () => {
  it("renders the list of applications", async () => {
    await renderPage();
    expect(screen.getByText("Senior Engineer")).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Product Manager")).toBeTruthy();
  });

  it("redirects to locale root if not JOB_SEEKER", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "employer-1", activePortalRole: "EMPLOYER" },
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("redirects if unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(renderPage()).rejects.toThrow("REDIRECT:/en");
  });

  it("renders filter tabs", async () => {
    await renderPage();
    expect(screen.getByTestId("filter-tab-all")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-active")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-withdrawn")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-rejected")).toBeTruthy();
    expect(screen.getByTestId("filter-tab-hired")).toBeTruthy();
  });

  it("renders empty state when no applications", async () => {
    vi.mocked(getApplicationsWithJobDataBySeekerId).mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText("Portal.applications.emptyTitle")).toBeTruthy();
    expect(screen.getByText("Portal.applications.emptyCta")).toBeTruthy();
  });

  it("renders filter empty state when filter has no results", async () => {
    vi.mocked(getApplicationsWithJobDataBySeekerId).mockResolvedValue(mockApplications as never);
    await renderPage("en", "hired");
    // hired filter yields 0 from mock data — filterEmpty should appear
    const text = screen.queryByText(/Portal\.applications\.filterEmpty/);
    expect(text).toBeTruthy();
  });

  it("filters applications by active status", async () => {
    await renderPage("en", "active");
    // Both submitted and under_review are "active"
    expect(screen.getByText("Senior Engineer")).toBeTruthy();
    expect(screen.getByText("Product Manager")).toBeTruthy();
  });

  it("shows status badges for each application", async () => {
    await renderPage();
    expect(screen.getByTestId("status-badge-submitted")).toBeTruthy();
    expect(screen.getByTestId("status-badge-under_review")).toBeTruthy();
  });

  it("passes axe-core accessibility assertion on empty state", async () => {
    vi.mocked(getApplicationsWithJobDataBySeekerId).mockResolvedValue([]);
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe-core accessibility assertion with applications", async () => {
    const { container } = await renderPage();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
