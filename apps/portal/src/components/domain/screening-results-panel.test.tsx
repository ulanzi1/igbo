import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ScreeningResultsPanel } from "./screening-results-panel";
import type { ScreeningResult } from "@igbo/db/schema/portal-job-postings";

expect.extend(toHaveNoViolations);

const BASE_RESULT: ScreeningResult = {
  status: "pass",
  flags: [],
  checked_at: "2026-04-01T10:00:00Z",
  rule_version: 5,
};

describe("ScreeningResultsPanel", () => {
  it("renders placeholder when screeningResult is null", () => {
    renderWithPortalProviders(<ScreeningResultsPanel screeningResult={null} />);
    expect(screen.getByTestId("screening-not-screened")).toBeInTheDocument();
  });

  it("renders panel with pass status", () => {
    renderWithPortalProviders(<ScreeningResultsPanel screeningResult={BASE_RESULT} />);
    expect(screen.getByTestId("screening-results-panel")).toBeInTheDocument();
    expect(screen.getByTestId("screening-status-label")).toBeInTheDocument();
  });

  it("renders 'no flags' message when flags array is empty", () => {
    renderWithPortalProviders(<ScreeningResultsPanel screeningResult={BASE_RESULT} />);
    expect(screen.getByTestId("screening-no-flags")).toBeInTheDocument();
  });

  it("renders flags table when flags are present", () => {
    const result: ScreeningResult = {
      ...BASE_RESULT,
      status: "fail",
      flags: [
        {
          rule_id: "required_fields",
          message: "Missing employment type",
          severity: "high",
          field: "employmentType",
        },
        {
          rule_id: "blocklist",
          message: "Blocked phrase detected",
          severity: "high",
          field: "title",
          match: "discriminatory phrase",
        },
      ],
    };
    renderWithPortalProviders(<ScreeningResultsPanel screeningResult={result} />);
    expect(screen.getByTestId("screening-flags-table")).toBeInTheDocument();
    expect(screen.getByTestId("flag-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("flag-row-1")).toBeInTheDocument();
  });

  it("renders severity badges for each flag", () => {
    const result: ScreeningResult = {
      ...BASE_RESULT,
      status: "warning",
      flags: [{ rule_id: "description_quality", message: "Short description", severity: "medium" }],
    };
    renderWithPortalProviders(<ScreeningResultsPanel screeningResult={result} />);
    expect(screen.getByTestId("flag-severity-0")).toBeInTheDocument();
  });

  it("renders checked_at timestamp", () => {
    renderWithPortalProviders(<ScreeningResultsPanel screeningResult={BASE_RESULT} />);
    expect(screen.getByTestId("screening-checked-at")).toBeInTheDocument();
  });

  it("has no accessibility violations (null)", async () => {
    const { container } = renderWithPortalProviders(
      <ScreeningResultsPanel screeningResult={null} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations (with flags)", async () => {
    const result: ScreeningResult = {
      ...BASE_RESULT,
      status: "fail",
      flags: [
        { rule_id: "required_fields", message: "Missing title", severity: "high", field: "title" },
      ],
    };
    const { container } = renderWithPortalProviders(
      <ScreeningResultsPanel screeningResult={result} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
