// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

import { AdminAnalyticsTrend } from "./admin-analytics-trend";
import type { TrendData } from "@/services/admin-analytics-service";

describe("AdminAnalyticsTrend", () => {
  it("renders 'no data' text when trend is null", () => {
    render(<AdminAnalyticsTrend trend={null} />);
    expect(screen.getByText("trendNoData")).toBeInTheDocument();
  });

  it("renders 'stable' with minus icon when direction is stable", () => {
    const trend: TrendData = { direction: "stable", percentChange: 0 };
    render(<AdminAnalyticsTrend trend={trend} />);
    expect(screen.getByText("trendStable")).toBeInTheDocument();
  });

  it("renders up trend with correct aria-label", () => {
    const trend: TrendData = { direction: "up", percentChange: 15 };
    render(<AdminAnalyticsTrend trend={trend} />);
    const el = screen.getByText(/trendUp/);
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-label");
    expect(el.getAttribute("aria-label")).toContain("trendUp");
  });

  it("renders down trend with correct aria-label", () => {
    const trend: TrendData = { direction: "down", percentChange: 20 };
    render(<AdminAnalyticsTrend trend={trend} />);
    const el = screen.getByText(/trendDown/);
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("aria-label")).toContain("trendDown");
  });

  it("applies green color for up trend", () => {
    const trend: TrendData = { direction: "up", percentChange: 10 };
    const { container } = render(<AdminAnalyticsTrend trend={trend} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-green-600");
  });

  it("applies red color for down trend", () => {
    const trend: TrendData = { direction: "down", percentChange: 10 };
    const { container } = render(<AdminAnalyticsTrend trend={trend} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("text-red-600");
  });

  it("has no axe accessibility violations for null trend", async () => {
    const { container } = render(<AdminAnalyticsTrend trend={null} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations for up trend", async () => {
    const trend: TrendData = { direction: "up", percentChange: 15 };
    const { container } = render(<AdminAnalyticsTrend trend={trend} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
