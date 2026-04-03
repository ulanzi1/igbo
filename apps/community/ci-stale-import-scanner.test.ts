// @vitest-environment node
/**
 * Unit tests for the stale import path scanner (scripts/check-stale-imports.ts).
 * Lives here (apps/community/*.test.ts) so vitest picks it up via the include glob.
 * The scanner script itself stays at scripts/check-stale-imports.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scanForStaleImports } from "../../scripts/check-stale-imports";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "stale-import-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createFile(relPath: string, content: string) {
  const full = join(tmpDir, relPath);
  mkdirSync(full.substring(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

describe("scanForStaleImports", () => {
  it("finds stale @/db/ import in a source file under apps/", () => {
    createFile(
      "apps/community/src/services/my-service.ts",
      `import { db } from "@/db/index";\nexport const x = 1;`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toContain("apps/community");
    expect(results[0]).toContain("@/db/");
  });

  it("finds stale @/auth/ import in a test file under apps/", () => {
    createFile(
      "apps/community/src/auth.test.ts",
      `import { auth } from "@/auth/index";\nexport {};`,
    );
    const results = scanForStaleImports(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toContain("@/auth/");
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
    expect(results[0]).toContain('vi.mock("@/db');
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
