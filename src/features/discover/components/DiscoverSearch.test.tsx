// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/features/profiles/components/TagInput", () => ({
  TagInput: ({
    values,
    onChange,
    label,
  }: {
    values: string[];
    onChange: (v: string[]) => void;
    label: string;
  }) =>
    React.createElement(
      "div",
      null,
      React.createElement("span", null, label),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "tag-add",
          onClick: () => onChange([...values, "music"]),
        },
        "Add music",
      ),
      React.createElement("span", { "data-testid": "tag-count" }, values.length),
    ),
}));

import { DiscoverSearch } from "./DiscoverSearch";
import type { DiscoverFilters } from "../types";
import { DEFAULT_FILTERS } from "../types";

const viewerProfile = {
  locationCity: "Enugu",
  locationCountry: "Nigeria",
  interests: ["culture"],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DiscoverSearch", () => {
  it("pre-fills location from viewerProfile on mount", () => {
    const onFiltersChange = vi.fn();
    render(
      <DiscoverSearch
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        viewerProfile={viewerProfile}
      />,
    );

    // On mount, locationCity and locationCountry from viewerProfile are applied
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ locationCity: "Enugu", locationCountry: "Nigeria" }),
    );
  });

  it("text search debounces before calling onFiltersChange", async () => {
    const onFiltersChange = vi.fn();
    render(
      <DiscoverSearch
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        viewerProfile={null}
      />,
    );

    const searchInput = screen.getByRole("searchbox");
    fireEvent.change(searchInput, { target: { value: "Alice" } });

    // Before debounce (300ms)
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFiltersChange).not.toHaveBeenCalled();

    // After debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ query: "Alice" }));
  });

  it("interests selection adds to filter array", () => {
    const onFiltersChange = vi.fn();
    render(
      <DiscoverSearch
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        viewerProfile={null}
      />,
    );

    const addButton = screen.getByTestId("tag-add");
    fireEvent.click(addButton);

    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ interests: ["music"] }));
  });

  it("tier filter updates membershipTier in filters", () => {
    const onFiltersChange = vi.fn();
    render(
      <DiscoverSearch
        filters={DEFAULT_FILTERS}
        onFiltersChange={onFiltersChange}
        viewerProfile={null}
      />,
    );

    const tierSelect = screen.getByLabelText("Discover.tierLabel");
    fireEvent.change(tierSelect, { target: { value: "PROFESSIONAL" } });

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ membershipTier: "PROFESSIONAL" }),
    );
  });

  it("clear button resets filters but preserves location from viewerProfile", () => {
    const filtersWithData: DiscoverFilters = {
      ...DEFAULT_FILTERS,
      query: "Alice",
      interests: ["music"],
      membershipTier: "BASIC",
    };
    const onFiltersChange = vi.fn();

    render(
      <DiscoverSearch
        filters={filtersWithData}
        onFiltersChange={onFiltersChange}
        viewerProfile={viewerProfile}
      />,
    );

    const clearBtn = screen.getByText("Discover.clearFilters");
    fireEvent.click(clearBtn);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "",
        interests: [],
        membershipTier: "",
        locationCity: "Enugu",
        locationCountry: "Nigeria",
      }),
    );
  });
});
