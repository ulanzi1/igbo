// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (_namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));

// Mock child components
vi.mock("./DiscoverSearch", () => ({
  DiscoverSearch: ({ viewerProfile }: { viewerProfile: unknown }) =>
    React.createElement("div", {
      "data-testid": "discover-search",
      "data-city": (viewerProfile as { locationCity?: string } | null)?.locationCity ?? "",
    }),
}));

vi.mock("./MemberGrid", () => ({
  MemberGrid: ({
    filters,
  }: {
    filters: { locationCity: string; locationState: string; locationCountry: string };
  }) =>
    React.createElement("div", {
      "data-testid": "member-grid",
      "data-filter-city": filters.locationCity,
      "data-filter-state": filters.locationState,
      "data-filter-country": filters.locationCountry,
    }),
}));

vi.mock("./GeoFallbackIndicator", () => ({
  GeoFallbackIndicator: ({
    activeLevel,
    selectedLevel,
    onLevelSelect,
    showTooltip,
    onTooltipDismiss,
  }: {
    activeLevel: string;
    selectedLevel: string;
    onLevelSelect: (level: string) => void;
    showTooltip?: boolean;
    onTooltipDismiss?: () => void;
  }) =>
    React.createElement(
      "div",
      {
        "data-testid": "geo-fallback-indicator",
        "data-active-level": activeLevel,
        "data-selected-level": selectedLevel,
      },
      showTooltip &&
        React.createElement("button", { onClick: onTooltipDismiss }, "dismiss-tooltip"),
      React.createElement(
        "button",
        { onClick: () => onLevelSelect("state"), "data-testid": "select-state" },
        "select-state",
      ),
    ),
}));

const mockUseGeoFallback = vi.fn();
vi.mock("../hooks/use-geo-fallback", () => ({
  useGeoFallback: (...args: unknown[]) => mockUseGeoFallback(...args),
}));

import { DiscoverContent } from "./DiscoverContent";

const VIEWER_PROFILE = {
  locationCity: "Houston",
  locationState: "Texas",
  locationCountry: "United States",
  interests: ["music"],
};

const GEO_FALLBACK_STATE_LEVEL = {
  data: {
    activeLevel: "state" as const,
    levelCounts: { city: 2, state: 25, country: 50, global: 200 },
    activeLocationLabel: "Texas",
    members: [],
    hasMore: false,
    nextCursor: null,
  },
  isSuccess: true,
  isLoading: false,
  isError: false,
};

const GEO_FALLBACK_CITY_LEVEL = {
  data: {
    activeLevel: "city" as const,
    levelCounts: { city: 10, state: 25, country: 50, global: 200 },
    activeLocationLabel: "Houston",
    members: [],
    hasMore: false,
    nextCursor: null,
  },
  isSuccess: true,
  isLoading: false,
  isError: false,
};

const mockLocalStorage: Record<string, string> = {};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock localStorage
  for (const key of Object.keys(mockLocalStorage)) {
    delete mockLocalStorage[key];
  }
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mockLocalStorage[k] ?? null,
    setItem: (k: string, v: string) => {
      mockLocalStorage[k] = v;
    },
  });
  mockUseGeoFallback.mockReturnValue({ data: undefined, isSuccess: false, isLoading: true });
});

describe("DiscoverContent", () => {
  it("renders DiscoverSearch and MemberGrid", () => {
    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);
    expect(screen.getByTestId("discover-search")).toBeInTheDocument();
    expect(screen.getByTestId("member-grid")).toBeInTheDocument();
  });

  it("shows GeoFallbackIndicator when viewer has location and geo data loaded", async () => {
    mockUseGeoFallback.mockReturnValue(GEO_FALLBACK_STATE_LEVEL);

    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);

    await act(async () => {});

    expect(screen.getByTestId("geo-fallback-indicator")).toBeInTheDocument();
  });

  it("does not show GeoFallbackIndicator when viewerProfile has no location", () => {
    mockUseGeoFallback.mockReturnValue({ data: undefined, isSuccess: false, isLoading: false });

    render(
      <DiscoverContent
        viewerProfile={{
          locationCity: null,
          locationState: null,
          locationCountry: null,
          interests: [],
        }}
      />,
    );

    expect(screen.queryByTestId("geo-fallback-indicator")).not.toBeInTheDocument();
  });

  it("shows tooltip when activeLevel is not 'city' and tooltip not dismissed", async () => {
    mockUseGeoFallback.mockReturnValue(GEO_FALLBACK_STATE_LEVEL);

    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);

    await act(async () => {});

    const indicator = screen.getByTestId("geo-fallback-indicator");
    expect(indicator.getAttribute("data-active-level")).toBe("state");
    // Tooltip dismiss button rendered when showTooltip=true
    expect(screen.getByText("dismiss-tooltip")).toBeInTheDocument();
  });

  it("hides tooltip after dismissal and persists to localStorage", async () => {
    mockUseGeoFallback.mockReturnValue(GEO_FALLBACK_STATE_LEVEL);

    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);

    await act(async () => {});

    fireEvent.click(screen.getByText("dismiss-tooltip"));

    expect(screen.queryByText("dismiss-tooltip")).not.toBeInTheDocument();
    expect(mockLocalStorage["discover:fallback:tooltip-dismissed"]).toBe("true");
  });

  it("auto-sets filters to match activeLevel on first load", async () => {
    mockUseGeoFallback.mockReturnValue(GEO_FALLBACK_STATE_LEVEL);

    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);

    await act(async () => {});

    // selectedLevel should match activeLevel "state"
    const indicator = screen.getByTestId("geo-fallback-indicator");
    expect(indicator.getAttribute("data-selected-level")).toBe("state");

    // MemberGrid should receive state-level filters
    const grid = screen.getByTestId("member-grid");
    expect(grid.getAttribute("data-filter-city")).toBe("");
    expect(grid.getAttribute("data-filter-state")).toBe("Texas");
    expect(grid.getAttribute("data-filter-country")).toBe("");
  });

  it("updates selectedLevel and filters when user clicks a level ring", async () => {
    mockUseGeoFallback.mockReturnValue(GEO_FALLBACK_CITY_LEVEL);

    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);

    await act(async () => {});

    // Initially city level
    const indicator = screen.getByTestId("geo-fallback-indicator");
    expect(indicator.getAttribute("data-selected-level")).toBe("city");

    // Click "select-state" to switch to state level
    fireEvent.click(screen.getByTestId("select-state"));

    // selectedLevel updated
    expect(indicator.getAttribute("data-selected-level")).toBe("state");

    // MemberGrid filters updated to state level
    const grid = screen.getByTestId("member-grid");
    expect(grid.getAttribute("data-filter-city")).toBe("");
    expect(grid.getAttribute("data-filter-state")).toBe("Texas");
    expect(grid.getAttribute("data-filter-country")).toBe("");
  });

  it("does not show tooltip when activeLevel is 'city'", async () => {
    mockUseGeoFallback.mockReturnValue(GEO_FALLBACK_CITY_LEVEL);

    render(<DiscoverContent viewerProfile={VIEWER_PROFILE} />);

    await act(async () => {});

    expect(screen.queryByText("dismiss-tooltip")).not.toBeInTheDocument();
  });
});
