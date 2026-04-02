import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility E2E scans using axe-core.
 * Unauthenticated flows run in CI against the pre-built standalone server.
 * Authenticated flows are skipped in CI (no database in E2E job) — run locally.
 *
 * All scans check for WCAG 2.1 AA violations at "critical" or "serious" impact.
 * Covers Story 12.7 AC2, NFR-A1, NFR-A2.
 */

// ISR-safe pages — pre-rendered at build time, no DB query at runtime.
// Safe to run in CI against standalone server without DATABASE_URL.
const CRITICAL_FLOWS = [
  { name: "Guest landing page", path: "/en" },
  { name: "Login page", path: "/en/login" },
  { name: "Articles listing", path: "/en/articles" },
  { name: "Events listing", path: "/en/events" },
  { name: "About page", path: "/en/about" },
];

// DB-dependent pages — query the database at runtime and return 500 without DATABASE_URL.
// Skipped in CI (no database in E2E job). Run locally: bunx playwright test e2e/accessibility.spec.ts
const DB_DEPENDENT_FLOWS = [
  { name: "Member directory", path: "/en/members" },
  { name: "Groups listing", path: "/en/groups" },
];

for (const flow of CRITICAL_FLOWS) {
  test(`${flow.name} has no critical/serious a11y violations`, async ({ page }) => {
    await page.goto(flow.path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious).toEqual([]);
  });
}

test.describe("DB-dependent accessibility scans", () => {
  test.skip(!!process.env.CI, "Requires database — /en/members and /en/groups query DB at runtime");

  for (const flow of DB_DEPENDENT_FLOWS) {
    test(`${flow.name} has no critical/serious a11y violations`, async ({ page }) => {
      await page.goto(flow.path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(serious).toEqual([]);
    });
  }
});

// Authenticated flows — require a running database with seeded users.
// Run locally: bunx playwright test e2e/accessibility.spec.ts
// Skipped in CI (no database service in E2E job).
test.describe("Authenticated accessibility scans", () => {
  test.skip(!!process.env.CI, "Requires seeded database — run locally with: bunx playwright test");

  test("Dashboard has no critical/serious a11y violations", async ({ page }) => {
    // Log in first via the login form
    await page.goto("/en/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123!");
    await page.click('[type="submit"]');
    await page.waitForURL("/en/dashboard");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious).toEqual([]);
  });

  test("Onboarding wizard has no critical/serious a11y violations", async ({ page }) => {
    // Requires a user in PENDING state (approved but onboarding not complete).
    // Log in as a newly-approved test user first, then navigate to onboarding.
    await page.goto("/en/login");
    await page.fill('[name="email"]', "pending-user@example.com");
    await page.fill('[name="password"]', "Password123!");
    await page.click('[type="submit"]');
    await page.goto("/en/onboarding");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious).toEqual([]);
  });

  test("Chat page has no critical/serious a11y violations", async ({ page }) => {
    // Log in first, then navigate to chat
    await page.goto("/en/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "Password123!");
    await page.click('[type="submit"]');
    await page.waitForURL("/en/dashboard");
    await page.goto("/en/chat");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious).toEqual([]);
  });

  test("Admin dashboard has no critical/serious a11y violations", async ({ page }) => {
    // Requires admin credentials — log in as admin first
    await page.goto("/en/login");
    await page.fill('[name="email"]', "admin@example.com");
    await page.fill('[name="password"]', "AdminPass123!");
    await page.click('[type="submit"]');
    await page.waitForURL("/en/dashboard");
    await page.goto("/en/admin");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious).toEqual([]);
  });
});
