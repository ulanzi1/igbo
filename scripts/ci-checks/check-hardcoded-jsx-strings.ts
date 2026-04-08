/**
 * CI Scanner: check-hardcoded-jsx-strings
 *
 * Detects hardcoded user-facing strings in JSX text nodes and known user-facing
 * HTML attributes in .tsx files under apps/ and packages/.
 *
 * Known limitations:
 * - Template-literal attribute values (placeholder={`${foo} bar`}) are NOT scanned.
 * - String constants in .ts service files passed to components are a separate concern (follow-up).
 * - A JSX element with both a literal text node AND a sibling {t(...)} call will be suppressed
 *   (acceptable false negative — rare and usually intentional).
 * - Comment stripping uses simple regex, not a full parser; strings containing // or /* may
 *   have edge cases, but these are extremely rare in JSX contexts.
 *
 * Allowlist comment: // ci-allow-literal-jsx
 *   Suppresses a match when placed on the same line or the immediately-preceding non-empty line.
 */

import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

// Skip test files, stories, and test-specific paths
const SKIP_FILE_REGEX = /\.(test|stories)\.(tsx?)$/;
const SKIP_PATH_REGEX = /\/(e2e|test-fixtures)\//;

// User-facing attribute names to check (label/htmlFor excluded to reduce false positives)
const ATTR_REGEX = /(title|alt|aria-label|placeholder)=(["'])([^"'\n]{2,})\2/g;

// i18n function call detection — word-boundary aware.
// Handles function-call forms (t(), useTranslations(), etc.) and JSX component form (<Trans />).
// NOTE: \bt\s*\( is separate to avoid merging with Trans in the alternation.
// intl\. matches intl.formatMessage() etc. without requiring open paren.
const I18N_CALL_REGEX =
  /\b(useTranslations|useFormatter|formatMessage)\s*\(|\bt\s*\(|\bTrans[\s/>]|intl\./;

const ALLOWLIST_LITERAL = "ci-allow-literal-jsx";

/**
 * Strips line comments (// ...), block comments (/* ... *\/) and JSX expression comments
 * ({/* ... *\/}) by replacing each non-newline character with a space. This preserves
 * line/column offsets for error reporting.
 */
function stripComments(source: string): string {
  // Replace block comments (includes JSX expression comments {/* ... */}): preserve newlines
  let result = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  // Replace line comments: replace with same-length spaces
  result = result.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return result;
}

/** Compute 1-indexed line number for a character position in the source. */
function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Check if a line has the allowlist comment (same line or immediately-preceding non-empty line). */
function hasLiteralAllowlist(lines: string[], lineNum: number): boolean {
  const lineIdx = lineNum - 1; // 0-indexed
  const sameLine = lines[lineIdx] ?? "";
  if (sameLine.includes(ALLOWLIST_LITERAL)) return true;
  // Check immediately-preceding non-empty line
  for (let i = lineIdx - 1; i >= 0 && i >= lineIdx - 3; i--) {
    const prev = lines[i] ?? "";
    if (prev.trim() === "") continue;
    if (prev.includes(ALLOWLIST_LITERAL)) return true;
    break;
  }
  return false;
}

/**
 * Scan backwards from `pos` to find the start of the nearest JSX opening tag.
 * Returns the index of `<` that opens the enclosing element.
 */
function findEnclosingTagStart(source: string, pos: number): number {
  let i = pos - 1;
  while (i >= 0) {
    if (source[i] === "<" && source[i + 1] !== "/") {
      return i;
    }
    i--;
  }
  return 0;
}

/**
 * Scans all .tsx files under rootDir/apps/ and rootDir/packages/ for hardcoded
 * user-facing strings in JSX text nodes and user-facing attributes.
 *
 * Returns an array of CheckResult for each violation found.
 *
 * Suppressed by:
 * - // ci-allow-literal-jsx comment on the same line or immediately-preceding non-empty line
 * - i18n function call (t, useTranslations, Trans, useFormatter, formatMessage, intl) in the
 *   same JSX element as the text node (element-scoped, not line-scoped)
 */
export function scanHardcodedJsxStrings(rootDir: string): CheckResult[] {
  const allFiles = collectTsFiles(rootDir);
  const files = allFiles.filter((f) => {
    const rel = relative(rootDir, f).replace(/\\/g, "/");
    return (
      f.endsWith(".tsx") &&
      (rel.startsWith("apps/") || rel.startsWith("packages/")) &&
      !SKIP_FILE_REGEX.test(f) &&
      !SKIP_PATH_REGEX.test(rel)
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

    // ── Text-node detection (multiline-aware, dotall) ──────────────────────
    const textNodeRegex = />([^<>{}]+)</gs;
    textNodeRegex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = textNodeRegex.exec(stripped)) !== null) {
      const raw = match[1] ?? "";
      const trimmed = raw.trim();

      // Basic rejection criteria
      if (!trimmed) continue;
      if (!/[A-Za-z]/.test(trimmed)) continue;
      if (/^\d/.test(trimmed)) continue;
      // Must have space or ≥ 12 chars to look like a user-facing label (per spec Decision 2)
      if (!/ /.test(trimmed) && trimmed.length < 12) continue;
      // Skip TypeScript code patterns: text starting with code tokens or containing TS operators.
      // These false positives arise from the regex matching between TypeScript generic `>` and JSX `<`.
      if (/^[&,);([={}[\]]/.test(trimmed)) continue; // starts with code-specific tokens
      if (/===|!==|&&|\|\||=>\s|;\s|\?\?/.test(trimmed)) continue; // contains TS operators
      // Skip single-word matches where the closing `<` is followed by a word char (TypeScript generic).
      // e.g. `void>\n  Promise<void>` — the `<` is from `Promise<`, not a JSX closing tag `</div>`.
      if (!/ /.test(trimmed)) {
        const afterClosingLt = stripped[match.index + match[0].length];
        if (afterClosingLt && /[A-Za-z_]/.test(afterClosingLt)) continue;
      }

      const lineNum = lineNumberAt(stripped, match.index);
      if (hasLiteralAllowlist(lines, lineNum)) continue;

      // i18n escape hatch: element-scoped word-boundary check
      const tagStart = findEnclosingTagStart(stripped, match.index);
      const elementRange = stripped.slice(tagStart, match.index + match[0].length - 1);
      if (I18N_CALL_REGEX.test(elementRange)) continue;

      results.push({
        file: relPath,
        line: lineNum,
        match: trimmed.slice(0, 120),
        check: "hardcoded-jsx-string",
      });
    }

    // ── Attribute detection ────────────────────────────────────────────────
    // Excluded attributes (never match): className, id, role, type, name, key, href, src,
    // htmlFor, data-*, aria-* (except aria-label), *-testid/*TestId. These are not in
    // the ATTR_REGEX alternation — if the regex is extended, verify they remain excluded.
    const attrRegex = /(title|alt|aria-label|placeholder)=(["'])([^"'\n]{2,})\2/g;
    attrRegex.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrRegex.exec(stripped)) !== null) {
      const value = attrMatch[3] ?? "";
      if (!value) continue;
      if (!/[A-Za-z]/.test(value)) continue;
      // Only flag if contains space or ≥ 12 chars (reduces noise from short labels)
      if (!/ /.test(value) && value.length < 12) continue;

      const lineNum = lineNumberAt(stripped, attrMatch.index);
      if (hasLiteralAllowlist(lines, lineNum)) continue;

      results.push({
        file: relPath,
        line: lineNum,
        match: attrMatch[0].trim().slice(0, 120),
        check: "hardcoded-jsx-string",
      });
    }
  }

  return results;
}
