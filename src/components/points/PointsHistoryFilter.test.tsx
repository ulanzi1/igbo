// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { PointsHistoryFilter } from "./PointsHistoryFilter";

describe("PointsHistoryFilter", () => {
  it("renders 4 filter options", () => {
    render(<PointsHistoryFilter activeType="" onFilterChange={vi.fn()} />);
    expect(screen.getAllByRole("button").length).toBe(4);
  });

  it("fires callback with correct value on click", () => {
    const onChange = vi.fn();
    render(<PointsHistoryFilter activeType="" onFilterChange={onChange} />);
    const btn = screen.getByText("filter.like_received");
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith("like_received");
  });

  it("highlights active filter with aria-pressed=true", () => {
    render(<PointsHistoryFilter activeType="like_received" onFilterChange={vi.fn()} />);
    const btn = screen.getByText("filter.like_received");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("non-active filters have aria-pressed=false", () => {
    render(<PointsHistoryFilter activeType="" onFilterChange={vi.fn()} />);
    const btn = screen.getByText("filter.event_attended");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
});
