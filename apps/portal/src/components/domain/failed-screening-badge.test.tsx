import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { FailedScreeningBadge } from "./failed-screening-badge";
import type { ScreeningResult } from "@igbo/db/schema/portal-job-postings";

expect.extend(toHaveNoViolations);

const BASE_RESULT: ScreeningResult = {
  status: "pass",
  flags: [],
  checked_at: "2026-04-01T10:00:00Z",
  rule_version: 5,
};

describe("FailedScreeningBadge", () => {
  it("renders 'not screened' when screeningResult is null", () => {
    renderWithPortalProviders(<FailedScreeningBadge screeningResult={null} />);
    expect(screen.getByTestId("screening-badge-not-screened")).toBeInTheDocument();
  });

  it("renders pass badge when status is pass", () => {
    renderWithPortalProviders(<FailedScreeningBadge screeningResult={BASE_RESULT} />);
    expect(screen.getByTestId("screening-badge-pass")).toBeInTheDocument();
  });

  it("renders warning badge when status is warning", () => {
    const result: ScreeningResult = {
      ...BASE_RESULT,
      status: "warning",
      flags: [{ rule_id: "description_quality", message: "Short description", severity: "medium" }],
    };
    renderWithPortalProviders(<FailedScreeningBadge screeningResult={result} />);
    expect(screen.getByTestId("screening-badge-warning")).toBeInTheDocument();
  });

  it("renders fail badge when status is fail", () => {
    const result: ScreeningResult = {
      ...BASE_RESULT,
      status: "fail",
      flags: [{ rule_id: "required_fields", message: "Missing title", severity: "high" }],
    };
    renderWithPortalProviders(<FailedScreeningBadge screeningResult={result} />);
    expect(screen.getByTestId("screening-badge-fail")).toBeInTheDocument();
  });

  it("shows flag count in warning badge", () => {
    const result: ScreeningResult = {
      ...BASE_RESULT,
      status: "warning",
      flags: [
        { rule_id: "description_quality", message: "Short description", severity: "medium" },
        { rule_id: "contact_info_leak", message: "Email detected", severity: "medium" },
      ],
    };
    renderWithPortalProviders(<FailedScreeningBadge screeningResult={result} />);
    const badge = screen.getByTestId("screening-badge-warning");
    expect(badge.textContent).toMatch(/2/);
  });

  it("has no accessibility violations (not screened)", async () => {
    const { container } = renderWithPortalProviders(
      <FailedScreeningBadge screeningResult={null} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations (pass)", async () => {
    const { container } = renderWithPortalProviders(
      <FailedScreeningBadge screeningResult={BASE_RESULT} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
