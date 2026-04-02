// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import { PointsSummaryCard } from "./PointsSummaryCard";

describe("PointsSummaryCard", () => {
  it("renders total points stat", () => {
    render(<PointsSummaryCard total={100} thisWeek={10} thisMonth={50} />);
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("renders thisWeek stat", () => {
    render(<PointsSummaryCard total={100} thisWeek={10} thisMonth={50} />);
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("renders thisMonth stat", () => {
    render(<PointsSummaryCard total={100} thisWeek={10} thisMonth={50} />);
    expect(screen.getByText("50")).toBeTruthy();
  });

  it("renders 3 stat labels", () => {
    render(<PointsSummaryCard total={0} thisWeek={0} thisMonth={0} />);
    expect(screen.getByText("summary.total")).toBeTruthy();
    expect(screen.getByText("summary.thisWeek")).toBeTruthy();
    expect(screen.getByText("summary.thisMonth")).toBeTruthy();
  });

  it("renders all zeros gracefully", () => {
    const { container } = render(<PointsSummaryCard total={0} thisWeek={0} thisMonth={0} />);
    expect(container.querySelectorAll("p").length).toBeGreaterThanOrEqual(3);
  });
});
