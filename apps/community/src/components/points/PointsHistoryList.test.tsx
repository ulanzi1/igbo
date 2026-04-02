// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "pointUnit" && params) return params.count === 1 ? "pt" : "pts";
    return key;
  },
  useLocale: () => "en",
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { PointsHistoryList } from "./PointsHistoryList";
import type { LedgerHistoryRow } from "@igbo/db/queries/points";

const makeEntry = (overrides: Partial<LedgerHistoryRow> = {}): LedgerHistoryRow => ({
  id: "e1",
  points: 1,
  reason: "like_received",
  sourceType: "like_received",
  sourceId: "post-1",
  multiplierApplied: "1.00",
  createdAt: new Date("2026-03-07T14:32:00Z"),
  ...overrides,
});

describe("PointsHistoryList", () => {
  it("renders skeleton when loading", () => {
    render(<PointsHistoryList entries={[]} loading={true} />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders empty state when no entries and not loading", () => {
    render(<PointsHistoryList entries={[]} loading={false} />);
    expect(screen.getByText("history.emptyState")).toBeTruthy();
  });

  it("renders entries with points and source type", () => {
    const entry = makeEntry({ points: 5, sourceType: "event_attended" });
    render(<PointsHistoryList entries={[entry]} loading={false} />);
    expect(screen.getByText("+5 pts")).toBeTruthy();
    expect(screen.getByText("history.sourceTypes.event_attended")).toBeTruthy();
  });

  it("shows multiplier badge only when multiplier > 1", () => {
    const withMultiplier = makeEntry({ multiplierApplied: "3.00" });
    const { rerender } = render(<PointsHistoryList entries={[withMultiplier]} loading={false} />);
    expect(screen.getByText("×3")).toBeTruthy();

    const withoutMultiplier = makeEntry({ multiplierApplied: "1.00" });
    rerender(<PointsHistoryList entries={[withoutMultiplier]} loading={false} />);
    expect(screen.queryByText(/×1/)).toBeNull();
  });

  it("renders singular 'pt' for 1 point", () => {
    const entry = makeEntry({ points: 1 });
    render(<PointsHistoryList entries={[entry]} loading={false} />);
    expect(screen.getByText("+1 pt")).toBeTruthy();
  });
});
