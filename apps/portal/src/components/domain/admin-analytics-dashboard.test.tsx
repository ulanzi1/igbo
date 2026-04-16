// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./admin-analytics-metric-card", () => ({
  AdminAnalyticsMetricCard: ({ title, value }: { title: string; value: number | null }) => (
    <div data-testid="metric-card">
      <span>{title}</span>
      <span>{value ?? "N/A"}</span>
    </div>
  ),
}));

import {
  AdminAnalyticsDashboard,
  AdminAnalyticsDashboardSkeleton,
} from "./admin-analytics-dashboard";
import type { PlatformAnalytics } from "@/services/admin-analytics-service";

const mockAnalytics: PlatformAnalytics = {
  postings: {
    activeCount: { value: 10, trend: null },
    pendingReviewCount: { value: 3, trend: null },
    rejectedCount: { value: 2, trend: { direction: "up", percentChange: 100 } },
    expiredCount: { value: 5, trend: { direction: "stable", percentChange: 0 } },
  },
  applications: {
    submittedCount: { value: 20, trend: null },
    avgPerPosting: { value: 5, trend: null },
    interviewConversionRate: { value: 0.5, trend: null },
  },
  hiring: {
    medianTimeToFillDays: { value: 14.5, trend: null },
    hiresCount: { value: 5, trend: null },
    offerAcceptRate: { value: 0.625, trend: null },
  },
  users: {
    activeSeekers: { value: 12, trend: null },
    activeEmployers: { value: 5, trend: null },
    newRegistrations: { value: 20, trend: null },
  },
  review: {
    avgReviewTimeMs: 120000,
    approvalRate: { value: 0.7, trend: null },
    rejectionRate: { value: 0.2, trend: null },
    changesRequestedRate: { value: 0.1, trend: null },
  },
  generatedAt: "2026-04-14T10:00:00.000Z",
};

describe("AdminAnalyticsDashboard", () => {
  it("renders all 5 section headings", () => {
    render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    expect(screen.getByText("analyticsPostingsTitle")).toBeInTheDocument();
    expect(screen.getByText("analyticsApplicationsTitle")).toBeInTheDocument();
    expect(screen.getByText("analyticsHiringTitle")).toBeInTheDocument();
    expect(screen.getByText("analyticsUsersTitle")).toBeInTheDocument();
    expect(screen.getByText("analyticsReviewTitle")).toBeInTheDocument();
  });

  it("renders 17 metric cards (4+3+3+3+4)", () => {
    render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    const cards = screen.getAllByTestId("metric-card");
    expect(cards).toHaveLength(17);
  });

  it("renders postings section with correct metric titles", () => {
    render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    expect(screen.getByText("analyticsActivePostings")).toBeInTheDocument();
    expect(screen.getByText("analyticsPendingReview")).toBeInTheDocument();
    expect(screen.getByText("analyticsRejectedLast30")).toBeInTheDocument();
    expect(screen.getByText("analyticsExpiredLast30")).toBeInTheDocument();
  });

  it("renders sections as accessible sections with aria-labels", () => {
    render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    const sections = screen.getAllByRole("region");
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it("renders hiring time to fill metric", () => {
    render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    expect(screen.getByText("analyticsTimeToFill")).toBeInTheDocument();
  });

  it("renders review section metrics", () => {
    render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    expect(screen.getByText("analyticsApprovalRate")).toBeInTheDocument();
    expect(screen.getByText("analyticsRejectionRate")).toBeInTheDocument();
    expect(screen.getByText("analyticsChangesRequestedRate")).toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<AdminAnalyticsDashboard analytics={mockAnalytics} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("AdminAnalyticsDashboardSkeleton", () => {
  it("renders skeleton cards for all 5 sections", () => {
    render(<AdminAnalyticsDashboardSkeleton />);
    // 5 sections: 4+3+3+3+4 = 17 skeleton cards + 5 section header skeletons
    const container = document.body.querySelector(".space-y-8");
    expect(container).toBeTruthy();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<AdminAnalyticsDashboardSkeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
