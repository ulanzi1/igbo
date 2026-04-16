// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { JobSearchFilterPanel, JobSearchFilterPanelSkeleton } from "./job-search-filter-panel";
import { DEFAULT_SEARCH_STATE } from "@/lib/search-url-params";
import type { JobSearchUrlState } from "@/lib/search-url-params";

expect.extend(toHaveNoViolations);

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const baseFacets = {
  location: [
    { value: "Lagos", count: 5 },
    { value: "Abuja", count: 2 },
  ],
  employmentType: [
    { value: "full_time", count: 10 },
    { value: "contract", count: 3 },
  ],
  industry: [{ value: "Technology", count: 7 }],
  salaryRange: [
    { bucket: "<50k", count: 1 },
    { bucket: "50k-100k", count: 4 },
    { bucket: "100k-200k", count: 2 },
    { bucket: ">200k", count: 0 },
    { bucket: "competitive", count: 1 },
  ],
};

function makeFilters(overrides: Partial<JobSearchUrlState> = {}): JobSearchUrlState {
  return { ...DEFAULT_SEARCH_STATE, ...overrides };
}

describe("JobSearchFilterPanel — rendering", () => {
  it("renders with data-testid=filter-panel", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
  });

  it("renders Location filter group", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Location")).toBeInTheDocument();
  });

  it("renders Employment Type filter group", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Employment Type")).toBeInTheDocument();
  });

  it("renders Industry filter group", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Industry")).toBeInTheDocument();
  });

  it("renders Salary Range filter group", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Salary Range")).toBeInTheDocument();
  });

  it("renders Remote toggle", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Remote only")).toBeInTheDocument();
  });

  it("renders Cultural Context filter group", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Cultural Context")).toBeInTheDocument();
  });
});

describe("JobSearchFilterPanel — facet counts", () => {
  it("renders location facet values with counts", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Lagos")).toBeInTheDocument();
    expect(screen.getByText("Abuja")).toBeInTheDocument();
  });

  it("renders employment type with translated label", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    expect(screen.getByText("Contract")).toBeInTheDocument();
  });

  it("renders salary bucket chips", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("salary-bucket-<50k")).toBeInTheDocument();
    expect(screen.getByTestId("salary-bucket->200k")).toBeInTheDocument();
    expect(screen.getByTestId("salary-bucket-competitive")).toBeInTheDocument();
  });

  it("competitive bucket chip is disabled", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    const competitiveChip = screen.getByTestId("salary-bucket-competitive");
    expect(competitiveChip).toBeDisabled();
  });
});

describe("JobSearchFilterPanel — zero-count options", () => {
  it("renders zero-count location option with opacity-50 class", () => {
    const facetsWithZero = {
      ...baseFacets,
      location: [
        { value: "Lagos", count: 5 },
        { value: "RareCity", count: 0 },
      ],
    };
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={facetsWithZero} filters={makeFilters()} onChange={vi.fn()} />,
    );
    // Find the container of the zero-count option
    const rareCity = screen.getByLabelText("RareCity (0)");
    const container = rareCity.closest(".flex");
    expect(container).toHaveClass("opacity-50");
  });

  it("zero-count location option is still clickable (not disabled)", () => {
    const facetsWithZero = {
      ...baseFacets,
      location: [{ value: "RareCity", count: 0 }],
    };
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={facetsWithZero} filters={makeFilters()} onChange={vi.fn()} />,
    );
    const checkbox = screen.getByRole("checkbox", { name: "RareCity (0)" });
    expect(checkbox).not.toBeDisabled();
  });
});

describe("JobSearchFilterPanel — onChange interactions", () => {
  it("calls onChange(location, [...]) when a location is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={onChange} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Lagos (5)" }));
    expect(onChange).toHaveBeenCalledWith("location", ["Lagos"]);
  });

  it("calls onChange(remote, true) when remote switch toggled on", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={onChange} />,
    );
    await user.click(screen.getByRole("switch", { name: "Remote only" }));
    expect(onChange).toHaveBeenCalledWith("remote", true);
  });

  it("calls onChange with salaryMin/salaryMax when salary bucket chip clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={onChange} />,
    );
    await user.click(screen.getByTestId("salary-bucket-50k-100k"));
    // Should call onChange for salaryMin
    expect(onChange).toHaveBeenCalledWith("salaryMin", 50000);
  });
});

describe("JobSearchFilterPanel — null facets", () => {
  it("renders without crashing when facets=null", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={null} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("filter-panel")).toBeInTheDocument();
  });

  it("shows zero message when location facets are empty", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel
        facets={{ ...baseFacets, location: [] }}
        filters={makeFilters()}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});

describe("JobSearchFilterPanel — accessibility", () => {
  it("passes axe check", async () => {
    const { container } = renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("filter panel has role=region via section+aria-label", () => {
    renderWithPortalProviders(
      <JobSearchFilterPanel facets={baseFacets} filters={makeFilters()} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("region", { name: "Filters" })).toBeInTheDocument();
  });
});

describe("JobSearchFilterPanelSkeleton", () => {
  it("renders with data-testid=filter-panel-skeleton", () => {
    renderWithPortalProviders(<JobSearchFilterPanelSkeleton />);
    expect(screen.getByTestId("filter-panel-skeleton")).toBeInTheDocument();
  });
});
