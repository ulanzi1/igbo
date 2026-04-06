/**
 * CI Scanner: check-unsanitized-html
 *
 * Detects dangerouslySetInnerHTML={{ __html: ... }} usage where the __html expression
 * does NOT start with sanitizeHtml( (strict leading-call compliance contract).
 *
 * Compliance rule: the __html: value expression must START WITH /^sanitizeHtml\s*\(/
 * This blocks common bypass patterns:
 *   - maybeSafe(x) || sanitizeHtml("")  ← starts with maybeSafe, not sanitizeHtml
 *   - cond ? sanitizeHtml(a) : raw      ← starts with cond, not sanitizeHtml
 *   - sanitizeHtml                       ← no call parens, fails the regex
 * Documented workaround for conditional: sanitizeHtml(cond ? a : b)
 *
 * Fail-closed behavior: if the __html: expression extractor encounters malformed syntax
 * (unbalanced braces, EOF before close), it emits check: "unsanitized-html-extraction-failed"
 * rather than silently skipping. Silent failures are exactly the Lesson 2 anti-pattern.
 *
 * Revisit trigger: if unsanitized-html-extraction-failed rate exceeds 3 across the repo
 * OR any confirmed bypass is discovered, migrate expression extractor to @babel/parser.
 *
 * Allowlist comment: // ci-allow-unsanitized-html
 *   Suppresses a match when present in the 3 lines IMMEDIATELY ABOVE the
 *   dangerouslySetInnerHTML occurrence (4+ lines above does NOT suppress).
 */

import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

// Skip test/story files (not e2e paths — the scanner targets app source)
const SKIP_FILE_REGEX = /\.(test|stories)\.(tsx?)$/;

const ALLOWLIST_UNSANITIZED = "ci-allow-unsanitized-html";

/**
 * Strips line comments (// ...) and block/JSX comments (/* ... *\/) replacing non-newline
 * characters with spaces to preserve line/column offsets.
 */
function stripComments(source: string): string {
  let result = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  result = result.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return result;
}

/**
 * Extract the __html: value expression from `source` starting at `startPos`
 * (the character immediately after the colon in `__html:`).
 *
 * Tracks brace/paren/bracket depth while respecting single-quote, double-quote,
 * and backtick string literals (including template literal interpolation ${...}).
 *
 * Returns { expr, failed: false } on success, { expr: "", failed: true } on malformed input.
 */
function extractHtmlExpression(
  source: string,
  startPos: number,
): { expr: string; failed: boolean } {
  let i = startPos;
  const len = source.length;

  // Skip leading whitespace
  while (i < len && /[ \t\n\r]/.test(source[i] ?? "")) i++;

  let expr = "";
  let depth = 0; // parens + brackets + extra braces beyond the outer object
  let inSingleStr = false;
  let inDoubleStr = false;
  let inTemplate = false;
  let templateDepth = 0; // nesting inside ${...} within template literals

  while (i < len) {
    const ch = source[i];

    // ── String escape sequences ──────────────────────────────────────────
    if ((inSingleStr || inDoubleStr) && ch === "\\") {
      expr += ch + (source[i + 1] ?? "");
      i += 2;
      continue;
    }

    // ── Exit single/double string ────────────────────────────────────────
    if (inSingleStr && ch === "'") {
      inSingleStr = false;
      expr += ch;
      i++;
      continue;
    }
    if (inDoubleStr && ch === '"') {
      inDoubleStr = false;
      expr += ch;
      i++;
      continue;
    }

    // ── Pass through inside single/double string ─────────────────────────
    if (inSingleStr || inDoubleStr) {
      expr += ch;
      i++;
      continue;
    }

    // ── Template literal handling ────────────────────────────────────────
    if (inTemplate) {
      if (ch === "`" && templateDepth === 0) {
        inTemplate = false;
        expr += ch;
        i++;
        continue;
      }
      if (ch === "$" && source[i + 1] === "{") {
        templateDepth++;
        expr += ch;
        i++;
        continue;
      }
      if (ch === "}" && templateDepth > 0) {
        templateDepth--;
        expr += ch;
        i++;
        continue;
      }
      if (ch === "\\" && templateDepth === 0) {
        expr += ch + (source[i + 1] ?? "");
        i += 2;
        continue;
      }
      expr += ch;
      i++;
      continue;
    }

    // ── Enter string modes ───────────────────────────────────────────────
    if (ch === "'") {
      inSingleStr = true;
      expr += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDoubleStr = true;
      expr += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      expr += ch;
      i++;
      continue;
    }

    // ── Depth tracking ───────────────────────────────────────────────────
    if (ch === "(" || ch === "[") {
      depth++;
      expr += ch;
      i++;
      continue;
    }
    if (ch === "{") {
      depth++;
      expr += ch;
      i++;
      continue;
    }
    if (ch === ")" || ch === "]") {
      if (depth <= 0) {
        // Unbalanced — fail closed
        return { expr: "", failed: true };
      }
      depth--;
      expr += ch;
      i++;
      continue;
    }
    if (ch === "}") {
      if (depth === 0) {
        // Closing brace of the outer JSX object literal — end of expression
        break;
      }
      depth--;
      expr += ch;
      i++;
      continue;
    }

    // ── Comma at depth 0 = end of object property ────────────────────────
    if (ch === "," && depth === 0) break;

    expr += ch;
    i++;
  }

  if (i >= len && depth > 0) {
    // EOF before balanced close — fail closed
    return { expr: "", failed: true };
  }

  return { expr: expr.trim(), failed: false };
}

/**
 * Returns true if `// ci-allow-unsanitized-html` appears in the 3 lines
 * IMMEDIATELY ABOVE lineNum (1-indexed). Line 4 above does NOT suppress.
 */
function hasUnsanitizedAllowlist(lines: string[], lineNum: number): boolean {
  for (let offset = 1; offset <= 3; offset++) {
    const idx = lineNum - 1 - offset; // convert to 0-indexed, then go up
    if (idx >= 0 && (lines[idx] ?? "").includes(ALLOWLIST_UNSANITIZED)) {
      return true;
    }
  }
  return false;
}

/**
 * Scans all .tsx files under rootDir/apps/ and rootDir/packages/ for
 * dangerouslySetInnerHTML={{ __html: ... }} occurrences where the __html:
 * expression does not start with sanitizeHtml(.
 *
 * Returns CheckResult[] with check: "unsanitized-html" or
 * check: "unsanitized-html-extraction-failed".
 */
export function scanUnsanitizedHtml(rootDir: string): CheckResult[] {
  const allFiles = collectTsFiles(rootDir);
  const files = allFiles.filter((f) => {
    const rel = relative(rootDir, f).replace(/\\/g, "/");
    return (
      f.endsWith(".tsx") &&
      (rel.startsWith("apps/") || rel.startsWith("packages/")) &&
      !SKIP_FILE_REGEX.test(f)
    );
  });

  const results: CheckResult[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const stripped = stripComments(source);
    const lines = source.split("\n");

    // Find all dangerouslySetInnerHTML={{ occurrences
    const outerRegex = /dangerouslySetInnerHTML=\{\{/g;
    outerRegex.lastIndex = 0;
    let outerMatch: RegExpExecArray | null;

    while ((outerMatch = outerRegex.exec(stripped)) !== null) {
      const lineNum = stripped.slice(0, outerMatch.index).split("\n").length;

      // Check allowlist (3 lines immediately above)
      if (hasUnsanitizedAllowlist(lines, lineNum)) continue;

      // Find __html: key after the {{
      const afterOuter = stripped.slice(outerMatch.index + outerMatch[0].length);
      const htmlKeyMatch = /\s*__html\s*:/.exec(afterOuter);

      if (!htmlKeyMatch) {
        // __html not found in the expression — unusual, skip
        continue;
      }

      // Position of the character AFTER the colon in the full stripped source
      const colonRelIdx = htmlKeyMatch.index + htmlKeyMatch[0].length - 1; // index of ':'
      const afterColonPos = outerMatch.index + outerMatch[0].length + colonRelIdx + 1;

      const { expr, failed } = extractHtmlExpression(stripped, afterColonPos);

      if (failed) {
        results.push({
          file: relPath,
          line: lineNum,
          match: stripped.slice(outerMatch.index, outerMatch.index + 80).trim(),
          check: "unsanitized-html-extraction-failed",
        });
        continue;
      }

      // Compliance: expression must START WITH sanitizeHtml(
      if (/^sanitizeHtml\s*\(/.test(expr)) continue;

      results.push({
        file: relPath,
        line: lineNum,
        match: `dangerouslySetInnerHTML={{ __html: ${expr.slice(0, 60)} }}`,
        check: "unsanitized-html",
      });
    }
  }

  return results;
}
