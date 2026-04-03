// @vitest-environment node
/**
 * Sentry configuration existence tests (Task 9.5)
 * Validates that all Sentry config files are created.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../");

describe("Sentry configuration files (Task 9.5)", () => {
  it("sentry.client.config.ts exists", () => {
    expect(existsSync(resolve(ROOT, "sentry.client.config.ts"))).toBe(true);
  });

  it("sentry.server.config.ts exists", () => {
    expect(existsSync(resolve(ROOT, "sentry.server.config.ts"))).toBe(true);
  });

  it("sentry.edge.config.ts exists", () => {
    expect(existsSync(resolve(ROOT, "sentry.edge.config.ts"))).toBe(true);
  });

  it("instrumentation.ts exists (root — merged from src/instrumentation.ts in P-0.3B)", () => {
    // P-0.3B merged src/instrumentation.ts into the root instrumentation.ts
    expect(existsSync(resolve(ROOT, "instrumentation.ts"))).toBe(true);
  });

  it("src/app/global-error.tsx exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/global-error.tsx"))).toBe(true);
  });

  it("instrumentation.ts imports sentry.server.config", () => {
    // Root instrumentation.ts (merged P-0.3B)
    const content = readFileSync(resolve(ROOT, "instrumentation.ts"), "utf-8");
    expect(content).toContain("sentry.server.config");
  });

  it("instrumentation.ts imports sentry.edge.config", () => {
    // Root instrumentation.ts (merged P-0.3B)
    const content = readFileSync(resolve(ROOT, "instrumentation.ts"), "utf-8");
    expect(content).toContain("sentry.edge.config");
  });
});
