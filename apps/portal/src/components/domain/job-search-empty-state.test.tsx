// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { JobSearchEmptyState } from "./job-search-empty-state";

expect.extend(toHaveNoViolations);

describe("JobSearchEmptyState — filtered variant", () => {
  it("renders with data-testid=empty-state-filtered", () => {
    renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    expect(screen.getByTestId("empty-state-filtered")).toBeInTheDocument();
  });

  it("renders the filtered title", () => {
    renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    expect(screen.getByText(/No exact matches/i)).toBeInTheDocument();
  });

  it("renders the filtered body copy", () => {
    renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    expect(screen.getByText(/Remove a filter/i)).toBeInTheDocument();
  });

  it("renders clear-filters CTA when onClearFilters provided", () => {
    const fn = () => {};
    renderWithPortalProviders(<JobSearchEmptyState variant="filtered" onClearFilters={fn} />);
    expect(screen.getByTestId("clear-filters-cta")).toBeInTheDocument();
  });

  it("does NOT render clear-filters CTA when onClearFilters=undefined", () => {
    renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    expect(screen.queryByTestId("clear-filters-cta")).not.toBeInTheDocument();
  });

  it("renders browse-all link", () => {
    renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    expect(screen.getByTestId("browse-all-cta")).toBeInTheDocument();
  });

  it("has role=status on the section", () => {
    renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("passes axe accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <JobSearchEmptyState variant="filtered" onClearFilters={undefined} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("JobSearchEmptyState — cold-start variant", () => {
  it("renders with data-testid=empty-state-cold-start", () => {
    renderWithPortalProviders(<JobSearchEmptyState variant="cold-start" />);
    expect(screen.getByTestId("empty-state-cold-start")).toBeInTheDocument();
  });

  it("renders the cold-start title", () => {
    renderWithPortalProviders(<JobSearchEmptyState variant="cold-start" />);
    expect(screen.getByText(/New opportunities are being added daily/i)).toBeInTheDocument();
  });

  it("renders the cold-start body copy", () => {
    renderWithPortalProviders(<JobSearchEmptyState variant="cold-start" />);
    expect(screen.getByText(/Check back soon/i)).toBeInTheDocument();
  });

  it("does NOT render filtered-state elements", () => {
    renderWithPortalProviders(<JobSearchEmptyState variant="cold-start" />);
    expect(screen.queryByTestId("empty-state-filtered")).not.toBeInTheDocument();
    expect(screen.queryByTestId("clear-filters-cta")).not.toBeInTheDocument();
  });

  it("passes axe accessibility check", async () => {
    const { container } = renderWithPortalProviders(<JobSearchEmptyState variant="cold-start" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("tone differs: cold-start title is NOT the filtered title", () => {
    const { rerender } = renderWithPortalProviders(<JobSearchEmptyState variant="cold-start" />);
    const coldTitle = screen.getByRole("heading").textContent;

    rerender(<JobSearchEmptyState variant="filtered" onClearFilters={undefined} />);
    const filteredTitle = screen.getByRole("heading").textContent;

    expect(coldTitle).not.toBe(filteredTitle);
  });
});
