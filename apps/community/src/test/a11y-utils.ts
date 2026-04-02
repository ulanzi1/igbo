import { axe } from "vitest-axe";
import { expect } from "vitest";

/**
 * Asserts that a rendered HTML container has no critical or serious axe-core
 * accessibility violations. Disables the `region` rule since isolated
 * component renders lack the <main> landmark that belongs in the layout.
 *
 * Only fails on "critical" or "serious" impact violations (AC1 requirement).
 * Moderate and minor violations are logged but do not fail the test,
 * consistent with the Playwright E2E approach in e2e/accessibility.spec.ts.
 */
export async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe(container, {
    rules: {
      // Disable region rule for isolated component renders (the landmark
      // is provided by the layout, not individual components).
      region: { enabled: false },
    },
  });
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(serious).toEqual([]);
}
