// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ActiveFiltersBar } from "./active-filters-bar";
import type { JobSearchUrlState } from "@/lib/search-url-params";
import { DEFAULT_SEARCH_STATE } from "@/lib/search-url-params";

expect.extend(toHaveNoViolations);

function makeFilters(overrides: Partial<JobSearchUrlState> = {}): JobSearchUrlState {
  return { ...DEFAULT_SEARCH_STATE, ...overrides };
}

describe("ActiveFiltersBar — empty state", () => {
  it("renders null when no active filters", () => {
    const { container } = renderWithPortalProviders(
      <ActiveFiltersBar filters={makeFilters()} onRemove={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("ActiveFiltersBar — location chips", () => {
  it("renders one chip per location value", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ location: ["Lagos", "Toronto"] })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-chip-location-Lagos")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-location-Toronto")).toBeInTheDocument();
  });

  it("calls onRemove with (location, value) when chip is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ location: ["Lagos"] })}
        onRemove={onRemove}
        onClearAll={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("filter-chip-location-Lagos"));
    expect(onRemove).toHaveBeenCalledWith("location", "Lagos");
  });
});

describe("ActiveFiltersBar — salary chips", () => {
  it("renders salaryMin chip with formatted label", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ salaryMin: 50000 })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-chip-salaryMin")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-salaryMin")).toHaveTextContent("50,000");
  });

  it("renders salaryMax chip with formatted label", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ salaryMax: 100000 })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-chip-salaryMax")).toBeInTheDocument();
  });

  it("calls onRemove with (salaryMin) when salaryMin chip clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ salaryMin: 50000 })}
        onRemove={onRemove}
        onClearAll={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId("filter-chip-salaryMin"));
    expect(onRemove).toHaveBeenCalledWith("salaryMin", undefined);
  });
});

describe("ActiveFiltersBar — boolean filter chips", () => {
  it("renders remote chip when remote=true", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ remote: true })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-chip-remote")).toBeInTheDocument();
  });

  it("renders diaspora chip when culturalContextDiasporaFriendly=true", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ culturalContextDiasporaFriendly: true })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-chip-culturalContextDiasporaFriendly")).toBeInTheDocument();
  });

  it("renders igbo chip when culturalContextIgboPreferred=true", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ culturalContextIgboPreferred: true })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-chip-culturalContextIgboPreferred")).toBeInTheDocument();
  });
});

describe("ActiveFiltersBar — clear all", () => {
  it("renders clear-all button when chips present", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ remote: true })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByTestId("clear-all-filters")).toBeInTheDocument();
  });

  it("calls onClearAll when clear-all button clicked", async () => {
    const user = userEvent.setup();
    const onClearAll = vi.fn();
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ remote: true })}
        onRemove={vi.fn()}
        onClearAll={onClearAll}
      />,
    );
    await user.click(screen.getByTestId("clear-all-filters"));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});

describe("ActiveFiltersBar — chip count", () => {
  it("renders one chip per active filter value", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({
          location: ["Lagos", "Toronto"],
          employmentType: ["full_time"],
          remote: true,
        })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    // 2 location + 1 employmentType + 1 remote = 4 chips
    const bar = screen.getByTestId("active-filters-bar");
    const chips = bar.querySelectorAll("[data-testid^='filter-chip-']");
    expect(chips).toHaveLength(4);
  });
});

describe("ActiveFiltersBar — accessibility", () => {
  it("passes axe check", async () => {
    const { container } = renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ location: ["Lagos"], remote: true })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has role=group on the bar", () => {
    renderWithPortalProviders(
      <ActiveFiltersBar
        filters={makeFilters({ remote: true })}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByRole("group")).toBeInTheDocument();
  });
});
