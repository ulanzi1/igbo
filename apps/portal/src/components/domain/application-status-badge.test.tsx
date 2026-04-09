import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { ApplicationStatusBadge } from "./application-status-badge";

expect.extend(toHaveNoViolations);

describe("ApplicationStatusBadge", () => {
  it("renders submitted status with info variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="submitted" />);
    const badge = screen.getByRole("status");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-variant", "info");
  });

  it("renders under_review status with warning variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="under_review" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "warning");
  });

  it("renders shortlisted status with success variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="shortlisted" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "success");
  });

  it("renders interview status with info variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="interview" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "info");
  });

  it("renders offered status with success variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="offered" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "success");
  });

  it("renders hired status with success variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="hired" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "success");
  });

  it("renders rejected status with destructive variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="rejected" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "destructive");
  });

  it("renders withdrawn status with secondary variant", () => {
    renderWithPortalProviders(<ApplicationStatusBadge status="withdrawn" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("data-variant", "secondary");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderWithPortalProviders(<ApplicationStatusBadge status="submitted" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
