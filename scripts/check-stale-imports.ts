import { readdirSync, readFileSync, existsSync } from "fs";
import { join, relative } from "path";

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

/** Directories to skip during recursive scan */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo"]);

/** Files that contain stale import patterns as test fixtures — not actual stale imports */
const SKIP_FILES = new Set(["ci-stale-import-scanner.test.ts"]);

function collectTsFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !SKIP_FILES.has(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Scans all .ts and .tsx files under rootDir for stale @/db/, @/auth/, @/config/ import paths.
 *
 * Returns an array of descriptive strings in the format "relPath:lineNum: matchedLine"
 * for each stale import found.
 *
 * Exceptions: intra-package uses of @/db/ in packages/db/, @/auth/ in packages/auth/,
 * and @/config/ in packages/config/ are allowed (they are vitest resolver aliases, not stale).
 */
export function scanForStaleImports(rootDir: string): string[] {
  const files = collectTsFiles(rootDir);
  const results: string[] = [];

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
          results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
          break; // one report per pattern per file is sufficient
        }
      }
    }
  }

  return results;
}

// CLI entry point: only executes when run directly via `npx tsx scripts/check-stale-imports.ts`
if (process.argv[1]?.endsWith("check-stale-imports.ts")) {
  const rootDir = process.cwd();
  const stale = scanForStaleImports(rootDir);

  if (stale.length > 0) {
    console.error(
      "❌ Stale import paths found (migrate to @igbo/db, @igbo/auth, or @igbo/config):"
    );
    for (const s of stale) {
      console.error(`  ${s}`);
    }
    console.error(
      `\n${stale.length} stale import(s) detected. Please update to use the shared packages.`
    );
    process.exit(1);
  } else {
    console.log("✅ No stale import paths found.");
    process.exit(0);
  }
}
