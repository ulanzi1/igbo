import React from "react";
import { describe, it, expect, vi } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";

expect.extend(toHaveNoViolations);

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ReportsQueueTable } from "./reports-queue-table";

const ITEMS = [
  {
    postingId: "posting-1",
    postingTitle: "Software Engineer",
    companyName: "Tech Corp",
    companyId: "company-1",
    reportCount: 5,
    latestReportAt: new Date("2026-04-10"),
    priority: "urgent" as const,
  },
  {
    postingId: "posting-2",
    postingTitle: "Designer",
    companyName: "Design Co",
    companyId: "company-2",
    reportCount: 3,
    latestReportAt: new Date("2026-04-09"),
    priority: "elevated" as const,
  },
];

describe("ReportsQueueTable", () => {
  it("renders empty state when no items", () => {
    renderWithPortalProviders(<ReportsQueueTable items={[]} />);
    expect(screen.getByTestId("reports-empty")).toBeDefined();
  });

  it("renders table with items", () => {
    renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    expect(screen.getByTestId("reports-queue-table")).toBeDefined();
    expect(screen.getByTestId("report-row-posting-1")).toBeDefined();
    expect(screen.getByTestId("report-row-posting-2")).toBeDefined();
  });

  it("shows report count badge", () => {
    renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    expect(screen.getByTestId("report-count-posting-1")).toBeDefined();
  });

  it("shows correct priority badge for urgent", () => {
    renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    const badge = screen.getByTestId("priority-badge-posting-1");
    expect(badge.className).toContain("red");
  });

  it("shows correct priority badge for elevated", () => {
    renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    const badge = screen.getByTestId("priority-badge-posting-2");
    expect(badge.className).toContain("amber");
  });

  it("investigate link points to report detail page", () => {
    renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    const links = screen.getAllByRole("link");
    const investigateLink = links.find((l) =>
      l.getAttribute("href")?.includes("/admin/reports/posting-1"),
    );
    expect(investigateLink).toBeDefined();
  });

  it("company name is a link to filtered postings", () => {
    renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    const link = screen.getByTestId("company-link-posting-1");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("admin/postings");
    expect(link.getAttribute("href")).toContain("companyId=company-1");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<ReportsQueueTable items={ITEMS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
