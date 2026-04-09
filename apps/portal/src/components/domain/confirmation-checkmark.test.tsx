import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { ConfirmationCheckmark } from "./confirmation-checkmark";

expect.extend(toHaveNoViolations);

describe("ConfirmationCheckmark", () => {
  it("renders SVG element", () => {
    const { container } = render(<ConfirmationCheckmark />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("is aria-hidden (decorative — meaning conveyed by sibling text)", () => {
    const { container } = render(<ConfirmationCheckmark />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("has data-testid for testing queries", () => {
    render(<ConfirmationCheckmark />);
    expect(screen.getByTestId("confirmation-checkmark")).toBeTruthy();
  });

  it("includes CSS animation keyframes", () => {
    const { container } = render(<ConfirmationCheckmark />);
    const style = container.querySelector("style");
    expect(style?.textContent).toContain("portal-checkmark-scale-in");
    expect(style?.textContent).toContain("portal-checkmark-path-draw");
  });

  it("circle has animation class", () => {
    const { container } = render(<ConfirmationCheckmark />);
    const circle = container.querySelector("circle");
    // SVG elements use getAttribute("class") — className is SVGAnimatedString in jsdom
    expect(circle?.getAttribute("class")).toContain("portal-checkmark-circle");
  });

  it("checkmark path has animation class", () => {
    const { container } = render(<ConfirmationCheckmark />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("class")).toContain("portal-checkmark-path");
  });

  it("passes axe accessibility check", async () => {
    const { container } = render(
      <div>
        <ConfirmationCheckmark />
        <span>Application Submitted</span>
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
