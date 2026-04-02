import { test, expect } from "@playwright/test";

/**
 * Keyboard-only navigation tests (Story 12.7 AC2).
 * Verifies NFR-A2: all interactive elements reachable and operable via keyboard.
 *
 * These tests run against the pre-built standalone server in CI (no DB required)
 * since they only test unauthenticated pages and static focus behaviour.
 */

test.describe("Keyboard navigation — landing page", () => {
  test("first Tab from page load focuses the skip link", async ({ page }) => {
    await page.goto("/en");

    // Press Tab once — first focusable element should be the "Skip to main content" link
    await page.keyboard.press("Tab");

    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute("href"));

    // Skip link is an <a> pointing to #main-content
    expect(focusedTag).toBe("A");
    expect(focusedHref).toBe("#main-content");
  });

  test("skip link Enter press moves focus to #main-content", async ({ page }) => {
    await page.goto("/en");

    // Tab to skip link
    await page.keyboard.press("Tab");

    // Activate skip link
    await page.keyboard.press("Enter");

    // Focus should now be on #main-content
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe("main-content");
  });

  test("all interactive elements on landing page receive focus in Tab order", async ({ page }) => {
    await page.goto("/en");

    // Collect focusable elements by tabbing through the page
    const focusedElements: string[] = [];
    const maxTabs = 40;

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? "");
      const role = await page.evaluate(() => document.activeElement?.getAttribute("role") ?? "");
      const href = await page.evaluate(() => document.activeElement?.getAttribute("href") ?? "");
      if (!tag) break;
      focusedElements.push(`${tag}${role ? `[role=${role}]` : ""}${href ? `[href=${href}]` : ""}`);

      // Stop once focus loops back to body or a known footer element
      const isBody = await page.evaluate(() => document.activeElement === document.body);
      if (isBody) break;
    }

    // At minimum, we must have focused at least one link and one interactive element
    expect(focusedElements.length).toBeGreaterThan(3);
    const interactiveTypes = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"];
    const hasInteractives = focusedElements.some((el) =>
      interactiveTypes.some((t) => el.startsWith(t)),
    );
    expect(hasInteractives).toBe(true);
  });

  test("focused elements have visible focus indicators (non-zero outline)", async ({ page }) => {
    await page.goto("/en");

    // Skip to first non-skip-link focusable element
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Check computed outline of the focused element
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "none";
      return getComputedStyle(el).outline;
    });

    // Must have a non-zero, non-"none" outline
    expect(outline).not.toMatch(/^0px|^none/);
  });
});

test.describe("Keyboard navigation — login form", () => {
  test("Tab through login form in logical order: email → password → submit", async ({ page }) => {
    await page.goto("/en/login");

    // Tab past skip link to first form field
    await page.keyboard.press("Tab");

    // Find and focus email field
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.focus();

    // Tab to password
    await page.keyboard.press("Tab");
    const focusedType = await page.evaluate(
      () => (document.activeElement as HTMLInputElement | null)?.type ?? "",
    );
    expect(focusedType).toBe("password");

    // Tab to submit button
    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    const focusedType2 = await page.evaluate(
      () => (document.activeElement as HTMLInputElement | null)?.type ?? "",
    );
    // Submit is either a <button> or <input type="submit">
    expect(["BUTTON", "INPUT"].includes(focusedTag ?? "")).toBe(true);
    if (focusedTag === "INPUT") {
      expect(focusedType2).toBe("submit");
    }
  });
});

test.describe("Keyboard navigation — dropdown/select patterns", () => {
  // Dropdown/select keyboard interaction tests (Task 3.3).
  // Radix UI Select/DropdownMenu handle these natively — tests verify it works end-to-end.
  // Requires a page with a Radix Select or DropdownMenu — using the landing page language switcher.
  test.skip(
    !!process.env.CI,
    "Dropdown keyboard tests require interactive components — run locally",
  );

  test("Arrow keys navigate dropdown options", async ({ page }) => {
    await page.goto("/en");

    // Find a dropdown trigger (e.g., language selector or any Radix Select/DropdownMenu)
    const trigger = page
      .locator('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]')
      .first();
    await trigger.focus();

    // Open dropdown with Enter
    await page.keyboard.press("Enter");

    // Listbox or menu should appear
    const listbox = page.locator('[role="listbox"], [role="menu"]').first();
    await expect(listbox).toBeVisible();

    // Arrow down should move focus within the dropdown
    await page.keyboard.press("ArrowDown");
    const focusedRole = await page.evaluate(
      () => document.activeElement?.getAttribute("role") ?? "",
    );
    expect(["option", "menuitem", "menuitemradio", "menuitemcheckbox"]).toContain(focusedRole);
  });

  test("Enter selects a dropdown option", async ({ page }) => {
    await page.goto("/en");

    const trigger = page
      .locator('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]')
      .first();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const listbox = page.locator('[role="listbox"], [role="menu"]').first();
    await expect(listbox).toBeVisible();

    // Navigate to an option and select it
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // Dropdown should close after selection
    await expect(listbox).not.toBeVisible({ timeout: 2000 });
  });

  test("Escape closes an open dropdown without selecting", async ({ page }) => {
    await page.goto("/en");

    const trigger = page
      .locator('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]')
      .first();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const listbox = page.locator('[role="listbox"], [role="menu"]').first();
    await expect(listbox).toBeVisible();

    // Escape should close without selecting
    await page.keyboard.press("Escape");
    await expect(listbox).not.toBeVisible({ timeout: 2000 });

    // Focus should return to the trigger
    const focusedHasPopup = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-haspopup") ?? "",
    );
    expect(["listbox", "menu"]).toContain(focusedHasPopup);
  });
});

test.describe("Keyboard navigation — focus traps in modals", () => {
  // Note: Modal/dialog keyboard trap tests require an authenticated page where
  // dialogs can be opened. These run locally only (require running database).
  test.skip(
    !!process.env.CI,
    "Modal keyboard trap tests require an authenticated page — run locally",
  );

  test("Escape key closes open modals and returns focus to trigger", async ({ page }) => {
    // Requires a page with a dialog trigger — e.g. the report dialog on a post
    await page.goto("/en/feed");

    // Find a dialog trigger button and open the dialog
    const triggerBtn = page.locator('[aria-haspopup="dialog"]').first();
    await triggerBtn.focus();
    await triggerBtn.press("Enter");

    // Dialog should now be open
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    // Press Escape to close
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Focus should return to the trigger element
    const focusedEl = await page.evaluate(() =>
      document.activeElement?.getAttribute("aria-haspopup"),
    );
    expect(focusedEl).toBe("dialog");
  });

  test("Tab key cycles within open modal (no keyboard trap to background)", async ({ page }) => {
    await page.goto("/en/feed");

    const triggerBtn = page.locator('[aria-haspopup="dialog"]').first();
    await triggerBtn.focus();
    await triggerBtn.press("Enter");

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    // Tab through all focusable elements in the dialog
    const maxTabs = 20;
    let stayedInDialog = true;

    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press("Tab");
      const isInDialog = await page.evaluate(() => {
        const active = document.activeElement;
        const dialogEl = document.querySelector('[role="dialog"]');
        return dialogEl?.contains(active) ?? false;
      });
      if (!isInDialog) {
        stayedInDialog = false;
        break;
      }
    }

    expect(stayedInDialog).toBe(true);
    await page.keyboard.press("Escape");
  });
});
