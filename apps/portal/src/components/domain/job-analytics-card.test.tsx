// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { JobAnalyticsCard, JobAnalyticsCardSkeleton } from "./job-analytics-card";

expect.extend(toHaveNoViolations);

const mockAnalytics = {
  views: 42,
  applications: 5,
  conversionRate: 11.9,
  sharedToCommunity: false,
};

describe("JobAnalyticsCard", () => {
  it("renders all 3 metrics (Views, Applications, Conversion Rate)", () => {
    renderWithPortalProviders(<JobAnalyticsCard analytics={mockAnalytics} />);
    expect(screen.getByText("Views")).toBeInTheDocument();
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText("Conversion Rate")).toBeInTheDocument();
  });

  it("displays view and application counts correctly", () => {
    renderWithPortalProviders(<JobAnalyticsCard analytics={mockAnalytics} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("displays conversion rate with 1 decimal place", () => {
    renderWithPortalProviders(<JobAnalyticsCard analytics={mockAnalytics} />);
    expect(screen.getByText("11.9%")).toBeInTheDocument();
  });

  it('shows "N/A" when views is 0 (no division by zero)', () => {
    renderWithPortalProviders(
      <JobAnalyticsCard
        analytics={{ ...mockAnalytics, views: 0, applications: 0, conversionRate: 0 }}
      />,
    );
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders with dense density", () => {
    const { container } = renderWithPortalProviders(
      <JobAnalyticsCard analytics={mockAnalytics} />,
      { density: "dense" },
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("passes accessibility check", async () => {
    const { container } = renderWithPortalProviders(<JobAnalyticsCard analytics={mockAnalytics} />);
    // @ts-expect-error — jest-axe matcher not in vitest types
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("JobAnalyticsCardSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = renderWithPortalProviders(<JobAnalyticsCardSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });
});
