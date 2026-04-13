/**
 * CI Scanner: check-next-link-import
 *
 * Detects `import Link from "next/link"` (and named/namespace variants) in
 * portal source files. Portal uses next-intl's `Link` from `@/i18n/navigation`
 * — importing directly from `next/link` bypasses locale-prefixed routing.
 *
 * Known limitations:
 * - Does not detect `require("next/link")` or `await import("next/link")`.
 *   These are extremely rare in a strict TypeScript Next.js codebase.
 * - `import type` skip is line-scoped: a multiline `import\ntype { ... }` split
 *   across lines would not be caught. Autoformatters prevent this in practice.
 *
 * Allowlist comment: // ci-allow-next-link-import
 *   Suppresses a match when placed on the same line or within the 3 preceding lines.
 */

import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

// Known violations — remove entries as they are fixed
export const KNOWN_VIOLATIONS: string[] = [
  "apps/portal/src/components/domain/posting-status-actions.tsx",
  "apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx",
  "apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/page.tsx",
  "apps/portal/src/components/flow/seeker-onboarding-flow.tsx",
  "apps/portal/src/app/[locale]/admin/jobs/[jobId]/review/page.tsx",
  "apps/portal/src/app/[locale]/(gated)/my-jobs/page.tsx",
  "apps/portal/src/app/[locale]/(gated)/jobs/new/page.tsx",
  "apps/portal/src/app/[locale]/(gated)/company-profile/page.tsx",
  "apps/portal/src/components/flow/onboarding-flow.tsx",
];

const ALLOWLIST_COMMENT = "ci-allow-next-link-import";

/**
 * Pattern matches:
 * - import Link from "next/link"
 * - import { default as Link } from "next/link"
 * - import { Link, ... } from "next/link"
 * - import * as NextLink from "next/link"
 */
const NEXT_LINK_IMPORT_REGEX =
  /import\s+(?:Link|{[^}]*\bLink\b[^}]*}|\*\s+as\s+\w+)\s+from\s+["']next\/link["']/;

/** Check if a line has the allowlist comment on the same line or the immediately-preceding non-empty line (within 3 lines). Matches `hasLiteralAllowlist` in check-hardcoded-jsx-strings.ts. */
function hasAllowlistComment(lines: string[], lineIdx: number): boolean {
  const sameLine = lines[lineIdx] ?? "";
  if (sameLine.includes(ALLOWLIST_COMMENT)) return true;
  for (let i = lineIdx - 1; i >= 0 && i >= lineIdx - 3; i--) {
    const prev = lines[i] ?? "";
    if (prev.trim() === "") continue;
    if (prev.includes(ALLOWLIST_COMMENT)) return true;
    break;
  }
  return false;
}

/**
 * Scans all .ts/.tsx files under apps/portal/src/ for `import ... from "next/link"`.
 * Returns CheckResult[] with check name "next-link-import".
 * Known-violation filtering happens in index.ts, not here.
 */
export function scanNextLinkImports(rootDir: string): CheckResult[] {
  const allFiles = collectTsFiles(rootDir);
  const results: CheckResult[] = [];

  for (const filePath of allFiles) {
    const rel = relative(rootDir, filePath).replace(/\\/g, "/");
    if (!rel.startsWith("apps/portal/src/")) continue;

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";

      // Skip import type (type-only imports don't create runtime Link components)
      if (/^\s*import\s+type\b/.test(line)) continue;

      if (NEXT_LINK_IMPORT_REGEX.test(line)) {
        if (hasAllowlistComment(lines, i)) continue;

        results.push({
          file: rel,
          line: i + 1, // 1-indexed
          match: line.trim(),
          check: "next-link-import",
        });
      }
    }
  }

  return results;
}
