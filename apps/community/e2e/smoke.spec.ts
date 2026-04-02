import { test, expect } from "@playwright/test";

/**
 * Smoke test — verifies the app is running and the landing page loads.
 * This is the baseline E2E test that must pass before the --passWithNoTests
 * flag can be removed from the CI playwright test command.
 */
test("landing page loads and returns HTTP 200", async ({ page }) => {
  const response = await page.goto("/en");
  expect(response?.status()).toBe(200);
});
