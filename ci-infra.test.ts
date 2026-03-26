// @vitest-environment node
/**
 * CI Infrastructure tests (Task 8)
 * Validates configuration files and scripts used by the CI/CD pipeline.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, ".");

describe("lighthouserc.js (Task 8.1)", () => {
  const configPath = resolve(ROOT, "lighthouserc.js");

  it("config file exists", () => {
    expect(existsSync(configPath)).toBe(true);
  });

  it("is a valid JS module that can be loaded", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require(configPath);
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("has required ci.collect and ci.assert sections", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require(configPath);
    expect(config).toHaveProperty("ci.collect");
    expect(config).toHaveProperty("ci.assert");
    expect(config).toHaveProperty("ci.assert.assertions");
  });

  it("does not use deprecated FID assertion", () => {
    const content = readFileSync(configPath, "utf-8");
    expect(content).not.toContain("first-input-delay");
    expect(content).not.toContain('"max-fid"');
  });

  it("has LCP assertion with maxNumericValue configured", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ci } = require(configPath);
    const lcp = ci.assert.assertions["largest-contentful-paint"];
    expect(lcp).toBeDefined();
    const [, opts] = lcp;
    expect(opts.maxNumericValue).toBeGreaterThan(0);
  });

  it("has CLS assertion with maxNumericValue <= 0.1", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ci } = require(configPath);
    const cls = ci.assert.assertions["cumulative-layout-shift"];
    expect(cls).toBeDefined();
    const [, opts] = cls;
    expect(opts.maxNumericValue).toBeLessThanOrEqual(0.1);
  });

  it("uses error level for CLS and non-performance category assertions", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ci } = require(configPath);
    const assertions = ci.assert.assertions;
    expect(assertions["cumulative-layout-shift"][0]).toBe("error");
    expect(assertions["categories:accessibility"][0]).toBe("error");
    expect(assertions["categories:best-practices"][0]).toBe("error");
    expect(assertions["categories:seo"][0]).toBe("error");
  });

  it("includes /en and /en/login as scan targets", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ci } = require(configPath);
    const urls: string[] = ci.collect.url;
    expect(urls.some((u) => u.endsWith("/en"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/en/login"))).toBe(true);
  });
});

describe("scripts/deploy.sh (Task 8.2)", () => {
  const scriptPath = resolve(ROOT, "scripts/deploy.sh");

  it("script file exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("passes bash syntax check (bash -n)", () => {
    expect(() => execSync(`bash -n "${scriptPath}"`, { stdio: "pipe" })).not.toThrow();
  });

  it("is executable", () => {
    expect(() => execSync(`test -x "${scriptPath}"`, { stdio: "pipe" })).not.toThrow();
  });

  it("uses set -euo pipefail for safe scripting", () => {
    const content = readFileSync(scriptPath, "utf-8");
    expect(content).toContain("set -euo pipefail");
  });

  it("checks for 'healthy' status in response body (not just HTTP 200)", () => {
    const content = readFileSync(scriptPath, "utf-8");
    expect(content).toContain('"healthy"');
  });

  it("exports WEB_IMAGE and REALTIME_IMAGE for docker compose", () => {
    const content = readFileSync(scriptPath, "utf-8");
    expect(content).toContain("export WEB_IMAGE");
    expect(content).toContain("export REALTIME_IMAGE");
  });

  it("verifies health after rollback", () => {
    const content = readFileSync(scriptPath, "utf-8");
    // After rollback, script should run a health check to confirm restoration
    expect(content).toContain("check_health");
    // Should contain at least 2 calls to check_health (deploy + rollback)
    const matches = content.match(/check_health/g);
    expect(matches && matches.length >= 2).toBe(true);
  });
});

describe("playwright.config.ts (Task 8.3)", () => {
  const configPath = resolve(ROOT, "playwright.config.ts");

  it("config file exists", () => {
    expect(existsSync(configPath)).toBe(true);
  });

  it("uses process.env.CI to branch the webServer command", () => {
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("process.env.CI");
  });

  it("runs standalone server with explicit PORT=3000 in CI mode", () => {
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("PORT=3000 node .next/standalone/server.js");
  });

  it("runs npm run dev in non-CI mode", () => {
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("npm run dev");
  });

  it("sets reuseExistingServer to false in CI (always spawns fresh server)", () => {
    const content = readFileSync(configPath, "utf-8");
    // reuseExistingServer: !process.env.CI → false when CI=true
    expect(content).toContain("reuseExistingServer: !process.env.CI");
  });

  it("has forbidOnly enabled in CI", () => {
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("forbidOnly: !!process.env.CI");
  });
});
