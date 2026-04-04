import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

/** Detection regex: process.env with a property access (not bare process.env) */
const PROCESS_ENV_REGEX = /process\.env\.\w+/;

/** Tier 2 content exemptions — these are always allowed anywhere */
const TIER2_CONTENT_EXEMPTIONS = [/process\.env\.NEXT_PUBLIC_/, /process\.env\.NODE_ENV/];

/** Tier 1 path patterns — these file paths are always allowed */
const TIER1_PATH_PATTERNS: RegExp[] = [
  /\.test\.\w+$/, // test files
  /\.spec\.\w+$/, // spec files
  /\/env\.ts$/, // env definition files
  /\/instrumentation\.ts$/, // startup hooks
  /\.config\./, // config files (next.config, vitest.config, sentry.*, etc.)
  /(^|\/)scripts\//, // build/CI/seed scripts at any level
  /\/middleware\.ts$/, // Edge runtime
  /\/realtime\//, // standalone server shared
  /^packages\//, // shared packages (can't import app-level @/env)
  /\/seed\//, // seed scripts (run outside Next.js context)
];

/**
 * Scans for direct process.env.X usage outside allowed locations.
 *
 * Three-tier allowlist:
 * - Tier 1: Path-based (automatic, file-level)
 * - Tier 2: Content-based (per-line: NEXT_PUBLIC_*, NODE_ENV)
 * - Tier 3: Suppress comment (per-line: // ci-allow-process-env)
 */
export function scanDirectProcessEnv(rootDir: string): CheckResult[] {
  const files = collectTsFiles(rootDir);
  const results: CheckResult[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");

    // Tier 1: path-based exemption
    if (TIER1_PATH_PATTERNS.some((p) => p.test(relPath))) continue;

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PROCESS_ENV_REGEX.test(line)) continue;

      // Tier 3: suppress comment (whole line)
      if (line.includes("// ci-allow-process-env")) continue;

      // Tier 2: check each process.env.X match individually — a line with both
      // process.env.NODE_ENV (exempt) and process.env.SECRET (violation) is flagged
      const matches = line.match(/process\.env\.\w+/g) ?? [];
      const hasViolation = matches.some((m) => !TIER2_CONTENT_EXEMPTIONS.some((p) => p.test(m)));
      if (!hasViolation) continue;

      results.push({
        file: relPath,
        line: i + 1,
        match: line.trim(),
        check: "process-env",
      });
    }
  }

  return results;
}
