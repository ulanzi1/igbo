// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "analyticsDays" && params) return `${params.count}d`;
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => "en",
}));

vi.mock("@/providers/density-context", () => ({
  useDensity: () => ({ density: "comfortable" }),
  DENSITY_STYLES: {
    comfortable: "py-4 px-4 text-base",
    compact: "py-3 px-3 text-sm",
    dense: "py-2 px-2 text-sm",
  },
}));

vi.mock("./admin-analytics-trend", () => ({
  AdminAnalyticsTrend: ({ trend }: { trend: unknown }) => (
    <div data-testid="trend">{trend ? "has-trend" : "no-trend"}</div>
  ),
}));

import { AdminAnalyticsMetricCard } from "./admin-analytics-metric-card";

describe("AdminAnalyticsMetricCard", () => {
  it("renders title and numeric value", () => {
    render(<AdminAnalyticsMetricCard title="Active Postings" value={42} />);
    expect(screen.getByText("Active Postings")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("formats percent values correctly", () => {
    render(<AdminAnalyticsMetricCard title="Approval Rate" value={0.75} formatAs="percent" />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("formats days values with 'd' suffix", () => {
    render(<AdminAnalyticsMetricCard title="Time to Fill" value={14} formatAs="days" />);
    expect(screen.getByText("14d")).toBeInTheDocument();
  });

  it("shows N/A for null days value", () => {
    render(<AdminAnalyticsMetricCard title="Time to Fill" value={null} formatAs="days" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("formats duration in milliseconds to human-readable", () => {
    render(
      <AdminAnalyticsMetricCard title="Avg Review Time" value={5400000} formatAs="duration" />,
    );
    // 5400000ms = 90 minutes = 1h 30m
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });

  it("shows N/A when value is null", () => {
    render(<AdminAnalyticsMetricCard title="Metric" value={null} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders trend component when trend prop provided", () => {
    render(
      <AdminAnalyticsMetricCard
        title="Submissions"
        value={10}
        trend={{ direction: "up", percentChange: 10 }}
      />,
    );
    expect(screen.getByTestId("trend")).toBeInTheDocument();
    expect(screen.getByTestId("trend").textContent).toBe("has-trend");
  });

  it("renders no trend component when trend is not passed", () => {
    render(<AdminAnalyticsMetricCard title="Active" value={5} />);
    expect(screen.queryByTestId("trend")).not.toBeInTheDocument();
  });

  it("has no axe accessibility violations", async () => {
    const { container } = render(<AdminAnalyticsMetricCard title="Test Metric" value={42} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
