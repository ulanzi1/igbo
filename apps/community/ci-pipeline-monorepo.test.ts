// @vitest-environment node
/**
 * CI Infrastructure tests for the monorepo CI pipeline (Story P-0.5).
 * Validates CI configuration is correct and self-consistent.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");
const CI_YML = resolve(ROOT, ".github/workflows/ci.yml");
const TURBO_JSON = resolve(ROOT, "turbo.json");
const ROOT_PKG = resolve(ROOT, "package.json");
const COMMUNITY_PKG = resolve(ROOT, "apps/community/package.json");
const PORTAL_PKG = resolve(ROOT, "apps/portal/package.json");

const ciContent = readFileSync(CI_YML, "utf-8");
const turboConfig = JSON.parse(readFileSync(TURBO_JSON, "utf-8"));
const rootPkg = JSON.parse(readFileSync(ROOT_PKG, "utf-8"));
const communityPkg = JSON.parse(readFileSync(COMMUNITY_PKG, "utf-8"));
const portalPkg = JSON.parse(readFileSync(PORTAL_PKG, "utf-8"));

// ─── CI workflow structure tests ─────────────────────────────────────────────

describe("CI workflow structure (Task 10.2–10.8)", () => {
  it("10.2 ci.yml exists at .github/workflows/ci.yml", () => {
    expect(existsSync(CI_YML)).toBe(true);
  });

  it("10.3 ci.yml has push: branches: [main] trigger (full suite on merge)", () => {
    expect(ciContent).toContain("push:");
    expect(ciContent).toContain("branches: [main]");
  });

  it("10.4 ci.yml has pull_request trigger", () => {
    expect(ciContent).toContain("pull_request:");
  });

  it("10.5 ci.yml has broad-impact override check step (pnpm-lock.yaml in detection pattern)", () => {
    expect(ciContent).toContain("pnpm-lock.yaml");
    expect(ciContent).toContain("broad-impact");
  });

  it("10.6 ci.yml has quality-gate job", () => {
    expect(ciContent).toContain("quality-gate:");
  });

  it("10.7 ci.yml test job has needs: containing quality-gate", () => {
    // Find the test job's needs block
    const testJobMatch = ciContent.match(
      /test:\s*\n\s+name: Unit Tests[\s\S]*?needs:\s*\[([^\]]+)\]/,
    );
    expect(testJobMatch).not.toBeNull();
    expect(testJobMatch![1]).toContain("quality-gate");
  });

  it("10.8 ci.yml build job has needs: containing quality-gate", () => {
    const buildJobMatch = ciContent.match(/build:\s*\n\s+name: Build[\s\S]*?needs:\s*\[([^\]]+)\]/);
    expect(buildJobMatch).not.toBeNull();
    expect(buildJobMatch![1]).toContain("quality-gate");
  });
});

// ─── Turborepo config tests ───────────────────────────────────────────────────

describe("Turborepo configuration (Task 10.9–10.13)", () => {
  it("10.9 ci.yml uses pnpm exec turbo (not bare turbo) for all turbo commands", () => {
    // All turbo run commands should be prefixed with pnpm exec
    const turboRuns = ciContent.match(/\bturbo run\b/g) ?? [];
    const pnpmExecTurboRuns = ciContent.match(/pnpm exec turbo run/g) ?? [];
    expect(turboRuns.length).toBe(pnpmExecTurboRuns.length);
    expect(pnpmExecTurboRuns.length).toBeGreaterThan(0);
  });

  it("10.10 ci.yml test/lint/typecheck jobs reference --affected flag (conditional)", () => {
    expect(ciContent).toContain("--affected");
  });

  it("10.11 ci.yml build job does NOT use --affected flag on its turbo run command", () => {
    // The build job's actual turbo command must not have --affected.
    // (Comments in the job may mention --affected to explain the decision; only the run: line matters.)
    const buildTurboRunLine = ciContent.match(/      - run: pnpm exec turbo run build\b.*/);
    expect(buildTurboRunLine).not.toBeNull();
    expect(buildTurboRunLine![0]).not.toContain("--affected");
  });

  it("10.12 turbo.json has test:integration task with dependsOn containing both app builds", () => {
    const integration = turboConfig.tasks["test:integration"];
    expect(integration).toBeDefined();
    expect(integration.dependsOn).toContain("@igbo/community#build");
    expect(integration.dependsOn).toContain("@igbo/portal#build");
  });

  it("10.13 turbo.json globalEnv includes portal env vars", () => {
    const globalEnv: string[] = turboConfig.globalEnv;
    expect(globalEnv).toContain("NEXT_PUBLIC_PORTAL_URL");
    expect(globalEnv).toContain("NEXT_PUBLIC_COMMUNITY_URL");
    expect(globalEnv).toContain("COMMUNITY_URL");
    expect(globalEnv).toContain("ALLOWED_ORIGINS");
    expect(globalEnv).toContain("SESSION_UPDATE_AGE_SECONDS");
    expect(globalEnv).toContain("AUTH_URL");
  });
});

// ─── Cache safety tests ───────────────────────────────────────────────────────

describe("Cache safety (Task 10.14–10.15)", () => {
  it("10.14 every env: key in ci.yml test/build jobs is present in turbo.json globalEnv (excluding builtins)", () => {
    const globalEnv: string[] = turboConfig.globalEnv;
    // Keys excluded from the check (GitHub Actions builtins and Node tooling)
    const excluded = new Set([
      "CI",
      "NODE_OPTIONS",
      "GITHUB_TOKEN",
      "GITHUB_SHA",
      "GITHUB_REF",
      "GITHUB_WORKFLOW",
    ]);

    // Extract env keys only from test and build job sections (not e2e/lighthouse)
    // Scope: from "test:" or "build:" job header to the next top-level job header
    const jobSectionRegex = /^  (?:test|build):\s*\n([\s\S]*?)(?=\n  \w+:|$)/gm;
    const jobEnvKeys = new Set<string>();
    let sectionMatch: RegExpExecArray | null;
    while ((sectionMatch = jobSectionRegex.exec(ciContent)) !== null) {
      const section = sectionMatch[1];
      const envLineRegex = /^\s+([A-Z_]+):\s/gm;
      let envMatch: RegExpExecArray | null;
      while ((envMatch = envLineRegex.exec(section)) !== null) {
        const key = envMatch[1];
        if (!excluded.has(key)) {
          jobEnvKeys.add(key);
        }
      }
    }

    // All extracted keys must be in turbo globalEnv
    for (const key of jobEnvKeys) {
      expect(globalEnv, `Expected "${key}" to be in turbo.json globalEnv`).toContain(key);
    }
  });

  it("10.15 GitHub Actions cache step includes node_modules/.cache/turbo path", () => {
    expect(ciContent).toContain("node_modules/.cache/turbo");
  });
});

// ─── Dependency graph sanity tests ───────────────────────────────────────────

describe("Workspace dependency graph (Task 10.16–10.18)", () => {
  it("10.16 portal package.json depends on @igbo/config, @igbo/db, @igbo/auth (all workspace:*)", () => {
    const deps = { ...portalPkg.dependencies, ...portalPkg.devDependencies };
    expect(deps["@igbo/config"]).toBe("workspace:*");
    expect(deps["@igbo/db"]).toBe("workspace:*");
    expect(deps["@igbo/auth"]).toBe("workspace:*");
  });

  it("10.17 community package.json depends on @igbo/config, @igbo/db, @igbo/auth (all workspace:*)", () => {
    const deps = { ...communityPkg.dependencies, ...communityPkg.devDependencies };
    expect(deps["@igbo/config"]).toBe("workspace:*");
    expect(deps["@igbo/db"]).toBe("workspace:*");
    expect(deps["@igbo/auth"]).toBe("workspace:*");
  });

  it("10.18 no workspace package.json has circular workspace:* dependencies", () => {
    // Build a dependency map of workspace packages
    const workspacePkgs = [
      { name: "@igbo/config", path: resolve(ROOT, "packages/config/package.json") },
      { name: "@igbo/db", path: resolve(ROOT, "packages/db/package.json") },
      { name: "@igbo/auth", path: resolve(ROOT, "packages/auth/package.json") },
      { name: "@igbo/community", path: COMMUNITY_PKG },
      { name: "@igbo/portal", path: PORTAL_PKG },
      {
        name: "@igbo/integration-tests",
        path: resolve(ROOT, "packages/integration-tests/package.json"),
      },
    ];

    const depGraph = new Map<string, string[]>();
    for (const { name, path } of workspacePkgs) {
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(readFileSync(path, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const workspaceDeps = Object.entries(allDeps)
        .filter(([, v]) => v === "workspace:*")
        .map(([k]) => k);
      depGraph.set(name, workspaceDeps);
    }

    // DFS cycle detection
    function hasCycle(node: string, visited: Set<string>, stack: Set<string>): boolean {
      visited.add(node);
      stack.add(node);
      for (const dep of depGraph.get(node) ?? []) {
        if (!visited.has(dep) && hasCycle(dep, visited, stack)) return true;
        if (stack.has(dep)) return true;
      }
      stack.delete(node); // eslint-disable-line drizzle/enforce-delete-with-where
      return false;
    }

    const visited = new Set<string>();
    for (const name of depGraph.keys()) {
      if (!visited.has(name)) {
        expect(
          hasCycle(name, visited, new Set()),
          `Circular dependency detected starting from ${name}`,
        ).toBe(false);
      }
    }
  });
});

// ─── Stale import and artifact tests ─────────────────────────────────────────

describe("Stale import scanner and artifacts (Task 10.19–10.22)", () => {
  it("10.19 stale import scanner script exists + scanner unit tests exist", () => {
    expect(existsSync(resolve(ROOT, "scripts/check-stale-imports.ts"))).toBe(true);
    expect(existsSync(resolve(ROOT, "apps/community/ci-stale-import-scanner.test.ts"))).toBe(true);
  });

  it("10.20 root package.json has check:stale-imports script", () => {
    expect(rootPkg.scripts["check:stale-imports"]).toBeDefined();
    expect(rootPkg.scripts["check:stale-imports"]).toContain("check-stale-imports");
  });

  it("10.21 ci.yml has stale import check step", () => {
    expect(ciContent).toContain("check-stale-imports");
  });

  it("10.22 ci.yml build job uploads both nextjs-build-community and nextjs-build-portal artifacts", () => {
    expect(ciContent).toContain("nextjs-build-community");
    expect(ciContent).toContain("nextjs-build-portal");
  });
});

// ─── Lint and workspace tests ─────────────────────────────────────────────────

describe("Lint and workspace scripts (Task 10.23–10.25)", () => {
  it("10.23 lint-staged config includes apps/portal/**/*.{ts,tsx,mts} pattern", () => {
    const lintStaged = rootPkg["lint-staged"];
    expect(lintStaged).toBeDefined();
    const portalPattern = Object.keys(lintStaged).find((k) => k.includes("apps/portal"));
    expect(portalPattern).toBeDefined();
  });

  it("10.24 portal package.json has lint, test, typecheck, build scripts", () => {
    expect(portalPkg.scripts.lint).toBeDefined();
    expect(portalPkg.scripts.test).toBeDefined();
    expect(portalPkg.scripts.typecheck).toBeDefined();
    expect(portalPkg.scripts.build).toBeDefined();
  });

  it("10.25 all workspace package.json files have test script", () => {
    const workspacePkgPaths = [
      resolve(ROOT, "apps/community/package.json"),
      resolve(ROOT, "apps/portal/package.json"),
      resolve(ROOT, "packages/config/package.json"),
      resolve(ROOT, "packages/db/package.json"),
      resolve(ROOT, "packages/auth/package.json"),
      resolve(ROOT, "packages/integration-tests/package.json"),
    ];

    for (const pkgPath of workspacePkgPaths) {
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      expect(pkg.scripts?.test, `Expected ${pkgPath} to have a "test" script`).toBeDefined();
    }
  });
});

// ─── Version pinning tests ─────────────────────────────────────────────────────

describe("Version pinning (Task 10.26)", () => {
  it("10.26 root package.json turbo version is exact (no ^ or ~ prefix)", () => {
    const turboVersion: string = rootPkg.devDependencies.turbo;
    expect(turboVersion).toBeDefined();
    expect(turboVersion).not.toMatch(/^[\^~]/);
    // Should be a plain semver string like "2.7.0"
    expect(turboVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
