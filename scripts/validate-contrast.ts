/**
 * Color contrast validation — Story 12.7 Task 4 (AC3)
 *
 * NOTE: WCAG contrast ratio validation is fully covered by the existing Vitest
 * test file `src/lib/accessibility.test.ts`, which:
 *   - Reads hex-equivalent values of the OKLCH CSS custom properties from globals.css
 *   - Validates all foreground/background pairs against WCAG AA minimums (4.5:1 normal, 3:1 large)
 *   - Validates both default and high-contrast mode palettes
 *   - Runs as part of `bun test` in CI
 *
 * A separate standalone script (parsing raw CSS) would duplicate this coverage and
 * risk drift from the already-tested values. This file documents that decision.
 *
 * To run contrast validation in CI:
 *   bun test src/lib/accessibility.test.ts
 *
 * Token pairs validated in accessibility.test.ts:
 *   Normal mode:
 *     - foreground (#1A1612) on background (#FAF8F5) — ≥ 12:1 (exceeds AA)
 *     - primary-foreground (white) on primary (#2D5A27) — ≥ 4.5:1 (AA)
 *     - secondary-foreground (#3D2415) on secondary (#D4A574) — ≥ 4.5:1 (AA)
 *     - muted-foreground (#78716C) on background (#FAF8F5) — ≥ 4.5:1 (AA)
 *   High-contrast mode:
 *     - hc-foreground (#141414) on hc-background (#FFFFFF) — ≥ 15:1 (exceeds AAA)
 *     - hc-muted-foreground (#4A4540) on hc-background (#FFFFFF) — ≥ 7:1 (AAA)
 */

import { execSync } from "child_process";

console.log("ℹ️  Running contrast validation via src/lib/accessibility.test.ts ...");

try {
  execSync("bun test src/lib/accessibility.test.ts", { stdio: "inherit" });
} catch {
  console.error("❌ Contrast validation failed.");
  process.exit(1);
}
