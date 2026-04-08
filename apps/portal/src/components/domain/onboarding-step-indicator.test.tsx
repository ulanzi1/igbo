// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";

expect.extend(toHaveNoViolations);
import {
  OnboardingStepIndicator,
  OnboardingStepIndicatorSkeleton,
} from "./onboarding-step-indicator";

describe("OnboardingStepIndicator", () => {
  it("renders exactly 3 step listitems (no separator inflation)", () => {
    renderWithPortalProviders(<OnboardingStepIndicator currentStep={1} completedSteps={[]} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("marks current step with aria-current=step", () => {
    renderWithPortalProviders(<OnboardingStepIndicator currentStep={2} completedSteps={[1]} />);
    const currentItems = screen
      .getAllByRole("listitem")
      .filter((el) => el.getAttribute("aria-current") === "step");
    expect(currentItems).toHaveLength(1);
  });

  it("shows checkmark for completed steps", () => {
    renderWithPortalProviders(<OnboardingStepIndicator currentStep={2} completedSteps={[1]} />);
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("future steps have no aria-current", () => {
    renderWithPortalProviders(<OnboardingStepIndicator currentStep={1} completedSteps={[]} />);
    const listItems = screen.getAllByRole("listitem");
    // Steps 2 and 3 should not have aria-current
    const nonCurrentItems = listItems.filter((el) => !el.getAttribute("aria-current"));
    expect(nonCurrentItems).toHaveLength(2);
  });

  it("passes accessibility check", async () => {
    const { container } = renderWithPortalProviders(
      <OnboardingStepIndicator currentStep={1} completedSteps={[]} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("OnboardingStepIndicatorSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = renderWithPortalProviders(<OnboardingStepIndicatorSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });
});

// ─── P-2.3: stepTitles prop ───────────────────────────────────────────────────
describe("OnboardingStepIndicator — stepTitles prop", () => {
  it("renders with custom stepTitles (seeker use case)", () => {
    const stepTitles = ["Create your profile", "Preferences & CV", "You're ready!"];
    renderWithPortalProviders(
      <OnboardingStepIndicator currentStep={1} completedSteps={[]} stepTitles={stepTitles} />,
    );
    expect(screen.getByText("Create your profile")).toBeTruthy();
    expect(screen.getByText("Preferences & CV")).toBeTruthy();
    expect(screen.getByText("You're ready!")).toBeTruthy();
  });

  it("renders with default i18n keys when stepTitles not provided (employer use case)", () => {
    renderWithPortalProviders(<OnboardingStepIndicator currentStep={1} completedSteps={[]} />);
    // When no stepTitles provided, falls back to t(labelKey) — which in tests renders the key via i18n mock
    // The test just confirms it renders without crash (employer flow unchanged)
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });
});
