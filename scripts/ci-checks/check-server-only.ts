import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

/** Files in packages/auth/src/ that intentionally omit server-only */
const AUTH_EXEMPT_FILES = new Set([
  "types.ts",
  "index.ts",
  "api-error.ts",
  "redis.ts",
  "session-cache.ts",
]);

/**
 * Directory convention rules: which directories require `import "server-only"`.
 * Each rule defines the directory pattern and exclusion logic.
 */
interface DirectoryRule {
  /** Glob-like prefix to match (relative path starts with) */
  prefix: RegExp;
  /** Return true if this specific file should be skipped */
  isExempt: (relPath: string, fileName: string) => boolean;
}

const DIRECTORY_RULES: DirectoryRule[] = [
  {
    // apps/*/src/services/**/*.ts
    prefix: /^apps\/[^/]+\/src\/services\//,
    isExempt: (_relPath, fileName) => fileName === "index.ts",
  },
  {
    // apps/*/src/server/**/*.ts (excluding realtime/**, seed/**, jobs/**)
    prefix: /^apps\/[^/]+\/src\/server\//,
    isExempt: (relPath, fileName) =>
      fileName === "index.ts" ||
      relPath.includes("/realtime/") ||
      relPath.includes("/seed/") ||
      relPath.includes("/jobs/"),
  },
  {
    // packages/auth/src/**/*.ts (excluding test/**)
    prefix: /^packages\/auth\/src\//,
    isExempt: (relPath, fileName) =>
      AUTH_EXEMPT_FILES.has(fileName) || relPath.includes("/test/"),
  },
];

const SERVER_ONLY_REGEX = /import\s+["']server-only["']/;
const SUPPRESS_COMMENT = "// ci-allow-no-server-only";

/**
 * Scans for missing `import "server-only"` in server-side directories.
 *
 * Checks apps/services, apps/server, and packages/auth for the import.
 * Files can opt out with `// ci-allow-no-server-only` in the first 5 lines.
 */
export function scanMissingServerOnly(rootDir: string): CheckResult[] {
  const files = collectTsFiles(rootDir);
  const results: CheckResult[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");
    const fileName = relPath.split("/").pop() ?? "";

    // Skip test files
    if (/\.test\.\w+$/.test(fileName) || /\.spec\.\w+$/.test(fileName)) continue;

    // Check if file falls under any directory rule
    const rule = DIRECTORY_RULES.find((r) => r.prefix.test(relPath));
    if (!rule) continue;

    // Check rule-specific exemptions
    if (rule.isExempt(relPath, fileName)) continue;

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const firstLines = content.split("\n").slice(0, 10);

    // Check for suppress comment
    if (firstLines.some((line) => line.includes(SUPPRESS_COMMENT))) continue;

    // Check for server-only import in first 10 lines (allows for headers/directives)
    if (firstLines.some((line) => SERVER_ONLY_REGEX.test(line))) continue;

    results.push({
      file: relPath,
      line: 1,
      match: 'missing import "server-only"',
      check: "server-only",
    });
  }

  return results;
}
