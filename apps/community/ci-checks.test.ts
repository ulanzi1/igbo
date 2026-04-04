// @vitest-environment node
/**
 * Unit tests for the composable CI checks scanners (scripts/ci-checks/).
 * Lives here (apps/community/*.test.ts) so vitest picks it up via the include glob.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { scanForStaleImports } from "../../scripts/ci-checks/check-stale-imports";
import { scanDirectProcessEnv } from "../../scripts/ci-checks/check-process-env";
import { scanMissingServerOnly } from "../../scripts/ci-checks/check-server-only";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ci-checks-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createFile(relPath: string, content: string) {
  const full = join(tmpDir, relPath);
  mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

// ─── Stale import scanner ─────────────────────────────────────────────────────

describe("scanForStaleImports", () => {
  it("finds stale @/db/ import in a source file under apps/", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@/db/index";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toContain("apps/community");
    expect(results[0].match).toContain("@/db/");
    expect(results[0].check).toBe("stale-import");
  });

  it("finds stale @/auth/ import in a test file under apps/", () => {
    createFile(
      "apps/community/src/auth.test.ts",
      `import { auth } from "@/auth/index";\nexport {};`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].match).toContain("@/auth/");
  });

  it("ignores @/db/ in packages/db/ (intra-package alias)", () => {
    createFile(
      "packages/db/src/queries/users.ts",
      `import { schema } from "@/db/schema";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("ignores @/auth/ in packages/auth/ (intra-package alias)", () => {
    createFile(
      "packages/auth/src/session.ts",
      `import { auth } from "@/auth/config";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("returns empty array when no stale imports found", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@igbo/db";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("detects stale vi.mock(@/db) patterns", () => {
    createFile("apps/community/src/my.test.ts", `vi.mock("@/db/index");\nexport {};`);
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].match).toContain('vi.mock("@/db');
  });

  it("skips ci-checks.test.ts (own test fixtures)", () => {
    createFile("apps/community/ci-checks.test.ts", `import { db } from "@/db/index";\nexport {};`);
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("does not flag @igbo/db imports (correct path)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@igbo/db/queries";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results).toHaveLength(0);
  });
});

// ─── process.env scanner ──────────────────────────────────────────────────────

describe("scanDirectProcessEnv", () => {
  it("flags process.env.SECRET in a service file", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nconst secret = process.env.SECRET;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].check).toBe("process-env");
    expect(results[0].match).toContain("process.env.SECRET");
  });

  it("allows process.env.SECRET in a test file (Tier 1 path exempt)", () => {
    createFile(
      "apps/community/src/services/my-service.test.ts",
      `const secret = process.env.SECRET;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.SECRET in env.ts (Tier 1 path exempt)", () => {
    createFile("apps/community/src/env.ts", `const secret = process.env.SECRET;\nexport {};`);
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.NEXT_PUBLIC_FOO in any file (Tier 2 content exempt)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nconst url = process.env.NEXT_PUBLIC_FOO;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.NODE_ENV in any file (Tier 2 content exempt)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nif (process.env.NODE_ENV === "production") {}\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env.SECRET with // ci-allow-process-env (Tier 3 suppress)", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nconst secret = process.env.SECRET; // ci-allow-process-env\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows all process.env in packages/ (Tier 1 path exempt)", () => {
    createFile("packages/db/src/index.ts", `const url = process.env.DATABASE_URL;\nexport {};`);
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("allows process.env in scripts/ directories (Tier 1 path exempt)", () => {
    createFile(
      "apps/community/scripts/seed.ts",
      `const url = process.env.DATABASE_URL;\nexport {};`,
    );
    const results = scanDirectProcessEnv(tmpDir);
    expect(results).toHaveLength(0);
  });
});

// ─── server-only scanner ──────────────────────────────────────────────────────

describe("scanMissingServerOnly", () => {
  it("flags service file without import 'server-only'", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@igbo/db";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].check).toBe("server-only");
    expect(results[0].match).toContain('missing import "server-only"');
  });

  it("passes service file with import 'server-only'", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import "server-only";\nimport { db } from "@igbo/db";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips test files in service directory", () => {
    createFile(
      "apps/community/src/services/my-service.test.ts",
      `import { db } from "@igbo/db";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips files under realtime/ in server directory", () => {
    createFile(
      "apps/community/src/server/realtime/socket.ts",
      `import { Server } from "socket.io";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips index.ts barrel exports in service directory", () => {
    createFile(
      "apps/community/src/services/index.ts",
      `export { myService } from "./my-service";\n`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips file with // ci-allow-no-server-only in first 5 lines", () => {
    createFile(
      "apps/community/src/services/event-bus.ts",
      `// ci-allow-no-server-only — shared with standalone\nimport { EventEmitter } from "events";\nexport {};`,
    );
    const results = scanMissingServerOnly(tmpDir);
    expect(results).toHaveLength(0);
  });
});

// ─── Integration canary ───────────────────────────────────────────────────────

describe("integration canary — real codebase", () => {
  const ROOT = resolve(__dirname, "../..");

  it("all three scanners report zero violations against current codebase", () => {
    const results = [
      ...scanForStaleImports(ROOT),
      ...scanDirectProcessEnv(ROOT),
      ...scanMissingServerOnly(ROOT),
    ];
    expect(
      results,
      `CI checks found ${results.length} violation(s). Run: npx tsx scripts/ci-checks/index.ts`,
    ).toEqual([]);
  });
});
