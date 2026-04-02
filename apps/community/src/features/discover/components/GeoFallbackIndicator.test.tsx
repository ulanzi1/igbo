// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { GeoFallbackIndicator } from "./GeoFallbackIndicator";
import type { GeoFallbackLevel, GeoFallbackLevelCounts } from "@/services/geo-search";

vi.mock("next-intl", () => ({
  useTranslations: (_namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

const LEVEL_COUNTS_CITY_OK: GeoFallbackLevelCounts = {
  city: 10,
  state: 25,
  country: 50,
  global: 200,
};

const LEVEL_COUNTS_FALLBACK: GeoFallbackLevelCounts = {
  city: 2,
  state: 25,
  country: 50,
  global: 200,
};

const LOCATION_LABELS = { city: "Houston", state: "Texas", country: "United States" };

const mockOnLevelSelect = vi.fn();
const mockOnTooltipDismiss = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeoFallbackIndicator", () => {
  it("renders city count label when activeLevel is 'city'", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_CITY_OK}
        activeLevel="city"
        selectedLevel="city"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    // Should show cityCount message (not cityGrowing) — appears in header and ring buttons
    expect(screen.getAllByText(/cityCount/).length).toBeGreaterThan(0);
    expect(screen.queryByText("cityGrowing")).not.toBeInTheDocument();
  });

  it("renders warm fallback message when activeLevel is not 'city'", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_FALLBACK}
        activeLevel="state"
        selectedLevel="state"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    expect(screen.getByText("cityGrowing")).toBeInTheDocument();
  });

  it("renders ring buttons for each non-null level", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_CITY_OK}
        activeLevel="city"
        selectedLevel="city"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    // Should have 4 ring buttons: city, state, country, global
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it("active/selected ring has aria-pressed='true', others 'false'", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_CITY_OK}
        activeLevel="city"
        selectedLevel="state"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    // Find ring group buttons (exclude tooltip dismiss button)
    const ringButtons = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    const pressedButton = ringButtons.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressedButton).toBeDefined();

    // Should have exactly one pressed button
    const pressedCount = ringButtons.filter(
      (b) => b.getAttribute("aria-pressed") === "true",
    ).length;
    expect(pressedCount).toBe(1);
  });

  it("ring click calls onLevelSelect with correct level", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_CITY_OK}
        activeLevel="city"
        selectedLevel="city"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    // Click first ring button (city)
    const ringButtons = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    fireEvent.click(ringButtons[0]!);

    expect(mockOnLevelSelect).toHaveBeenCalledWith("city");
  });

  it("tooltip renders when showTooltip is true", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_FALLBACK}
        activeLevel="state"
        selectedLevel="state"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
        showTooltip={true}
        onTooltipDismiss={mockOnTooltipDismiss}
      />,
    );

    // Tooltip contains dismiss button
    expect(screen.getByText("tooltipDismiss")).toBeInTheDocument();
  });

  it("tooltip dismiss calls onTooltipDismiss", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_FALLBACK}
        activeLevel="state"
        selectedLevel="state"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
        showTooltip={true}
        onTooltipDismiss={mockOnTooltipDismiss}
      />,
    );

    fireEvent.click(screen.getByText("tooltipDismiss"));
    expect(mockOnTooltipDismiss).toHaveBeenCalledOnce();
  });

  it("tooltip is hidden when showTooltip is false", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_FALLBACK}
        activeLevel="state"
        selectedLevel="state"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
        showTooltip={false}
      />,
    );

    expect(screen.queryByText("tooltipDismiss")).not.toBeInTheDocument();
  });

  it("global ring renders with globalRingLabel aria-label", () => {
    render(
      <GeoFallbackIndicator
        levelCounts={LEVEL_COUNTS_CITY_OK}
        activeLevel="city"
        selectedLevel="city"
        locationLabels={LOCATION_LABELS}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    // Global ring button should have aria-label containing globalRingLabel
    const globalButton = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-label")?.includes("globalRingLabel"));
    expect(globalButton).toBeDefined();
  });

  it("does not render city ring when city count is null", () => {
    const countsNoCityParam: GeoFallbackLevelCounts = {
      city: null,
      state: 25,
      country: 50,
      global: 200,
    };

    render(
      <GeoFallbackIndicator
        levelCounts={countsNoCityParam}
        activeLevel="state"
        selectedLevel="state"
        locationLabels={{ state: "Texas", country: "United States" }}
        onLevelSelect={mockOnLevelSelect}
      />,
    );

    const ringButtons = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    // Should have 3 rings: state, country, global (no city)
    expect(ringButtons).toHaveLength(3);
  });
});
