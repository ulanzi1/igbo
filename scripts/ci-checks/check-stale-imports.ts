import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

interface PatternRule {
  regex: RegExp;
  /** If the file path (relative to rootDir) contains this segment, the match is an intra-package alias — not stale. */
  allowedInPackage: string;
}

/** Stale import patterns and their intra-package exceptions */
const STALE_PATTERNS: PatternRule[] = [
  { regex: /from ['"]@\/db\//, allowedInPackage: "packages/db/" },
  { regex: /from ['"]@\/auth\//, allowedInPackage: "packages/auth/" },
  { regex: /from ['"]@\/config\//, allowedInPackage: "packages/config/" },
  { regex: /vi\.mock\(['"]@\/db/, allowedInPackage: "packages/db/" },
  { regex: /vi\.mock\(['"]@\/auth/, allowedInPackage: "packages/auth/" },
  { regex: /vi\.mock\(['"]@\/config/, allowedInPackage: "packages/config/" },
];

/**
 * Scans all .ts and .tsx files under rootDir for stale @/db/, @/auth/, @/config/ import paths.
 *
 * Returns an array of CheckResult for each stale import found.
 *
 * Exceptions: intra-package uses of @/db/ in packages/db/, @/auth/ in packages/auth/,
 * and @/config/ in packages/config/ are allowed (they are vitest resolver aliases, not stale).
 */
export function scanForStaleImports(rootDir: string): CheckResult[] {
  const files = collectTsFiles(rootDir, {
    skipFileNames: new Set(["ci-checks.test.ts"]),
  });
  const results: CheckResult[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (const { regex, allowedInPackage } of STALE_PATTERNS) {
      // Skip intra-package aliases (e.g. @/db/ used inside packages/db/ is OK)
      if (relPath.includes(allowedInPackage)) continue;

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({
            file: relPath,
            line: i + 1,
            match: lines[i].trim(),
            check: "stale-import",
          });
          break; // one report per pattern per file is sufficient
        }
      }
    }
  }

  return results;
}
