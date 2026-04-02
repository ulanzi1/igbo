// @vitest-environment node
/**
 * Accessibility Infrastructure tests (Story 12.7, Task 7)
 * Validates all accessibility testing artifacts exist and have correct structure.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");
const APP_ROOT = resolve(__dirname, ".");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: recursively find files with a given extension
// Uses Node.js file reading — NOT execSync/grep (platform-specific, breaks on Windows)
// ─────────────────────────────────────────────────────────────────────────────

function findFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const full = resolve(dir, f);
    try {
      return statSync(full).isDirectory() ? findFiles(full, ext) : full.endsWith(ext) ? [full] : [];
    } catch {
      return [];
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.3 — vitest-axe integration
// ─────────────────────────────────────────────────────────────────────────────

describe("vitest-axe integration (Task 1)", () => {
  const pkgPath = resolve(APP_ROOT, "package.json");
  let pkg: { devDependencies?: Record<string, string> } = {};

  beforeAll(() => {
    if (existsSync(pkgPath)) {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        devDependencies?: Record<string, string>;
      };
    }
  });

  it("vitest-axe is in package.json devDependencies", () => {
    expect(pkg.devDependencies?.["vitest-axe"]).toBeDefined();
  });

  it("src/test/setup.ts contains vitest-axe/matchers import", () => {
    const setupPath = resolve(APP_ROOT, "src/test/setup.ts");
    expect(existsSync(setupPath)).toBe(true);
    const content = readFileSync(setupPath, "utf-8");
    expect(content).toContain("vitest-axe/matchers");
    expect(content).toContain("expect.extend");
  });

  it("src/test/a11y-utils.ts exists and exports expectNoA11yViolations", () => {
    const utilsPath = resolve(APP_ROOT, "src/test/a11y-utils.ts");
    expect(existsSync(utilsPath)).toBe(true);
    const content = readFileSync(utilsPath, "utf-8");
    expect(content).toContain("expectNoA11yViolations");
    expect(content).toContain("vitest-axe");
  });

  it("at least 10 component test files in src/ use the a11y test helper", () => {
    // Component test files call expectNoA11yViolations() from a11y-utils.ts
    // (which internally calls toHaveNoViolations on the axe results)
    const tsxFiles = findFiles(resolve(APP_ROOT, "src"), ".test.tsx");
    const tsFiles = findFiles(resolve(APP_ROOT, "src"), ".test.ts");
    const allFiles = [...tsxFiles, ...tsFiles];

    const a11yTestFiles = allFiles.filter((f) => {
      try {
        return readFileSync(f, "utf-8").includes("expectNoA11yViolations");
      } catch {
        return false;
      }
    });

    // Story spec Task 7.3 requires at least 8; current implementation has 10.
    expect(a11yTestFiles.length).toBeGreaterThanOrEqual(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.3 — Playwright accessibility E2E scans
// ─────────────────────────────────────────────────────────────────────────────

describe("Playwright accessibility scans (Task 2)", () => {
  const pkgPath = resolve(APP_ROOT, "package.json");
  let pkg: { devDependencies?: Record<string, string> } = {};

  beforeAll(() => {
    if (existsSync(pkgPath)) {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        devDependencies?: Record<string, string>;
      };
    }
  });

  it("@axe-core/playwright is in package.json devDependencies", () => {
    expect(pkg.devDependencies?.["@axe-core/playwright"]).toBeDefined();
  });

  it("e2e/accessibility.spec.ts exists and contains AxeBuilder", () => {
    const specPath = resolve(APP_ROOT, "e2e/accessibility.spec.ts");
    expect(existsSync(specPath)).toBe(true);
    const content = readFileSync(specPath, "utf-8");
    expect(content).toContain("AxeBuilder");
    expect(content).toContain("@axe-core/playwright");
  });

  it("e2e/accessibility.spec.ts scans at least 6 public flows", () => {
    const specPath = resolve(APP_ROOT, "e2e/accessibility.spec.ts");
    const content = readFileSync(specPath, "utf-8");
    // CRITICAL_FLOWS array with at least 6 entries
    const flowMatches = content.match(/path:\s*["']/g);
    expect((flowMatches ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("e2e/accessibility.spec.ts marks authenticated tests as CI-skipped", () => {
    const specPath = resolve(APP_ROOT, "e2e/accessibility.spec.ts");
    const content = readFileSync(specPath, "utf-8");
    expect(content).toContain("test.skip");
    expect(content).toContain("process.env.CI");
  });

  it("e2e/keyboard-navigation.spec.ts exists and contains keyboard-related assertions", () => {
    const specPath = resolve(APP_ROOT, "e2e/keyboard-navigation.spec.ts");
    expect(existsSync(specPath)).toBe(true);
    const content = readFileSync(specPath, "utf-8");
    // Must test keyboard interactions
    expect(content).toContain("keyboard.press");
    expect(content).toContain("Tab");
  });

  it("e2e/keyboard-navigation.spec.ts tests focus indicators", () => {
    const specPath = resolve(APP_ROOT, "e2e/keyboard-navigation.spec.ts");
    const content = readFileSync(specPath, "utf-8");
    // Should check outline computed style
    expect(content).toContain("outline");
    expect(content).toContain("getComputedStyle");
  });

  it("e2e/keyboard-navigation.spec.ts tests skip link", () => {
    const specPath = resolve(APP_ROOT, "e2e/keyboard-navigation.spec.ts");
    const content = readFileSync(specPath, "utf-8");
    expect(content).toContain("main-content");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.3 — Lighthouse CI accessibility coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("Lighthouse CI accessibility coverage (Task 6)", () => {
  const lhPath = resolve(APP_ROOT, "lighthouserc.js");
  let lhContent = "";

  beforeAll(() => {
    if (existsSync(lhPath)) {
      lhContent = readFileSync(lhPath, "utf-8");
    }
  });

  it("lighthouserc.js exists", () => {
    expect(existsSync(lhPath)).toBe(true);
  });

  it("lighthouserc.js contains at least 5 URLs in the url array", () => {
    // Count occurrences of "http://localhost:3000" in the url array section
    const urlMatches = lhContent.match(/http:\/\/localhost:3000\/en/g);
    expect((urlMatches ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("lighthouserc.js includes /en/articles (ISR page)", () => {
    expect(lhContent).toContain("/en/articles");
  });

  it("lighthouserc.js includes /en/events (ISR page)", () => {
    expect(lhContent).toContain("/en/events");
  });

  it("lighthouserc.js includes /en/about (ISR page)", () => {
    expect(lhContent).toContain("/en/about");
  });

  it("lighthouserc.js does NOT scan /en/members URL (DB-dependent at runtime)", () => {
    // /en/members queries DB at runtime — would cause 500 without DATABASE_URL.
    // Check that the actual URL string is not in the url array (comments don't count).
    expect(lhContent).not.toContain('"http://localhost:3000/en/members"');
    expect(lhContent).not.toContain("'http://localhost:3000/en/members'");
  });

  it("lighthouserc.js does NOT scan /en/groups URL (DB-dependent at runtime)", () => {
    expect(lhContent).not.toContain('"http://localhost:3000/en/groups"');
    expect(lhContent).not.toContain("'http://localhost:3000/en/groups'");
  });

  it("accessibility score assertion is >= 0.9 and level 'error'", () => {
    expect(lhContent).toContain("categories:accessibility");
    expect(lhContent).toContain("minScore: 0.9");
    expect(lhContent).toContain('"error"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.3 — Contrast validation coverage
// ─────────────────────────────────────────────────────────────────────────────

describe("Contrast validation coverage (Task 4)", () => {
  it("src/lib/accessibility.test.ts exists with contrast ratio tests (primary coverage)", () => {
    const testPath = resolve(APP_ROOT, "src/lib/accessibility.test.ts");
    expect(existsSync(testPath)).toBe(true);
    const content = readFileSync(testPath, "utf-8");
    // Validates WCAG contrast ratios
    expect(content).toContain("contrastRatio");
    expect(content).toContain("4.5");
  });

  it("scripts/validate-contrast.ts exists (documents coverage decision)", () => {
    const scriptPath = resolve(APP_ROOT, "scripts/validate-contrast.ts");
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("package.json has test:a11y:contrast script", () => {
    const pkgPath = resolve(APP_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["test:a11y:contrast"]).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.3 — Screen reader checklist
// ─────────────────────────────────────────────────────────────────────────────

describe("Screen reader testing checklist (Task 5)", () => {
  const checklistPath = resolve(ROOT, "docs/accessibility-testing-checklist.md");
  let content = "";

  beforeAll(() => {
    if (existsSync(checklistPath)) {
      content = readFileSync(checklistPath, "utf-8");
    }
  });

  it("docs/accessibility-testing-checklist.md exists", () => {
    expect(existsSync(checklistPath)).toBe(true);
  });

  it("checklist covers VoiceOver (macOS)", () => {
    expect(content).toContain("VoiceOver");
    expect(content).toContain("macOS");
  });

  it("checklist covers NVDA (Windows)", () => {
    expect(content).toContain("NVDA");
    expect(content).toContain("Windows");
  });

  it("checklist references all 9 NFR-A requirements (A1 through A9)", () => {
    for (let i = 1; i <= 9; i++) {
      expect(content).toContain(`NFR-A${i}`);
    }
  });

  it("checklist covers all 9 critical user flows", () => {
    // Each flow is documented with its own heading
    expect(content).toContain("Landing Page");
    expect(content).toContain("Login");
    expect(content).toContain("Onboarding");
    expect(content).toContain("Dashboard");
    expect(content).toContain("Chat");
    expect(content).toContain("Member Directory");
    expect(content).toContain("Article");
    expect(content).toContain("Event");
    expect(content).toContain("Admin");
  });

  it("checklist includes VoiceOver keyboard shortcut (Cmd+F5)", () => {
    expect(content).toContain("Cmd + F5");
  });

  it("checklist includes Known Limitations section", () => {
    expect(content).toContain("Known Limitations");
  });
});
