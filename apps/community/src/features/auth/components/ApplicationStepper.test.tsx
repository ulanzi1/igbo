// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

import { ApplicationStepper } from "./ApplicationStepper";

describe("ApplicationStepper", () => {
  it("renders a nav element with aria-label", () => {
    render(<ApplicationStepper currentStep={1} />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
  });

  it("renders an ordered list with aria-label='Application progress'", () => {
    render(<ApplicationStepper currentStep={1} />);
    const list = screen.getByRole("list", { name: "Apply.progressAriaLabel" });
    expect(list).toBeInTheDocument();
  });

  it("renders 5 steps", () => {
    render(<ApplicationStepper currentStep={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });

  it("marks the current step with aria-current='step'", () => {
    render(<ApplicationStepper currentStep={2} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("does not set aria-current on non-current steps", () => {
    render(<ApplicationStepper currentStep={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).not.toHaveAttribute("aria-current");
    expect(items[2]).not.toHaveAttribute("aria-current");
  });

  it("each step has a descriptive aria-label", () => {
    render(<ApplicationStepper currentStep={3} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]?.getAttribute("aria-label")).toContain("Step 1 of 5");
    expect(items[0]?.getAttribute("aria-label")).toContain("completed");
    expect(items[2]?.getAttribute("aria-label")).toContain("Step 3 of 5");
    expect(items[2]?.getAttribute("aria-label")).toContain("current");
    expect(items[4]?.getAttribute("aria-label")).toContain("Step 5 of 5");
    expect(items[4]?.getAttribute("aria-label")).toContain("incomplete");
  });

  it("renders a live region with step progress text", () => {
    render(<ApplicationStepper currentStep={2} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });
});
