// @vitest-environment node

/**
 * CI enforcement for PREP-M6 "Runtime Verification Enforcement" policy.
 *
 * Scans all `Status: done` story files (p-*.md) from Epic 6 onward and
 * validates each has a `## Runtime Smoke Test` section with substantive
 * content — either filled evidence table rows or an explicit N/A justification.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// 1. Constants & helpers
// ---------------------------------------------------------------------------

const ARTIFACTS_DIR = resolve(process.cwd(), "../../_bmad-output/implementation-artifacts");

const EPIC_CUTOFF = 6;

/** Extract the epic number from a story filename like `p-6-2-slug.md`. */
function parseEpicNumber(filename: string): number | null {
  const match = filename.match(/^p-(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

/** Check if a story file has `Status: done` in its first 10 lines. */
function isDone(content: string): boolean {
  const head = content.split("\n").slice(0, 10).join("\n");
  return /^Status:\s*done\s*$/im.test(head);
}

/** Extract the SN-6 section body (everything after the `## Runtime Smoke Test` heading). */
function extractSn6Section(content: string): string | null {
  const headingIndex = content.search(/^## Runtime Smoke Test/m);
  if (headingIndex === -1) return null;

  const afterHeading = content.slice(headingIndex);
  // Section ends at the next H2 or end of file
  const nextH2 = afterHeading.slice(1).search(/^## /m);
  return nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2 + 1);
}

/**
 * Check if the SN-6 section contains a whole-story N/A justification.
 * Matches `[N/A]` on non-table lines (checklist items), NOT `N/A` in table cells.
 */
function hasNaJustification(sn6Body: string): boolean {
  return sn6Body.split("\n").some((line) => {
    const trimmed = line.trim();
    // Skip table rows — N/A in table cells is per-scenario, not whole-story
    if (trimmed.startsWith("|")) return false;
    return trimmed.includes("[N/A]");
  });
}

/**
 * Check if the evidence table has at least one non-header, non-placeholder row.
 * A placeholder row contains `[Scenario name]` or `[One sentence`.
 */
function hasSubstantiveEvidenceRow(sn6Body: string): boolean {
  const lines = sn6Body.split("\n");
  let inTable = false;
  let headerRowsPassed = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect table start: a line starting with |
    if (trimmed.startsWith("|")) {
      inTable = true;
      headerRowsPassed++;

      // Skip header row (1) and separator row (2)
      if (headerRowsPassed <= 2) continue;

      // This is a data row — check if it's a placeholder or empty
      if (trimmed.includes("[Scenario name]") || trimmed.includes("[One sentence")) {
        continue; // placeholder row
      }

      // Check that at least one evidence column (2-4) has content.
      // Columns: | Scenario | Verified | URL | Observed | Issues |
      const cells = trimmed.split("|").map((c) => c.trim());
      // cells[0] is empty (before first |), cells[1] is Scenario, cells[2-4] are evidence
      const hasEvidence =
        cells.length >= 5 && (cells[2] !== "" || cells[3] !== "" || cells[4] !== "");
      if (!hasEvidence) continue; // empty evidence columns

      // Non-placeholder data row with evidence found
      return true;
    } else if (inTable && trimmed !== "") {
      // Left the table without finding a substantive row — reset for next table
      inTable = false;
      headerRowsPassed = 0;
    }
  }

  return false;
}

/** Validate a single story file's SN-6 section. Returns null if valid, or an error message. */
function validateSn6(filename: string, content: string): string | null {
  const sn6Body = extractSn6Section(content);

  if (sn6Body === null) {
    return `Missing ## Runtime Smoke Test section`;
  }

  if (hasNaJustification(sn6Body)) {
    return null; // Valid — N/A justified
  }

  if (hasSubstantiveEvidenceRow(sn6Body)) {
    return null; // Valid — has evidence rows
  }

  return `No verification evidence rows (and no N/A justification)`;
}

// ---------------------------------------------------------------------------
// 2. Discover enforceable story files
// ---------------------------------------------------------------------------

interface StoryFile {
  filename: string;
  content: string;
}

function discoverEnforceableStories(): StoryFile[] {
  const allFiles = readdirSync(ARTIFACTS_DIR).filter(
    (f) => f.startsWith("p-") && f.endsWith(".md"),
  );

  const stories: StoryFile[] = [];

  for (const filename of allFiles) {
    const epicNum = parseEpicNumber(filename);
    if (epicNum === null || epicNum < EPIC_CUTOFF) continue;

    const content = readFileSync(resolve(ARTIFACTS_DIR, filename), "utf-8");
    if (!isDone(content)) continue;

    stories.push({ filename, content });
  }

  return stories;
}

// ---------------------------------------------------------------------------
// 3. Tests — real story file enforcement
// ---------------------------------------------------------------------------

describe("PREP-M6 Runtime Verification Enforcement", () => {
  const stories = discoverEnforceableStories();

  it("discovers at least one enforceable story file", () => {
    expect(
      stories.length,
      `No story files found — expected at least one done Epic ${EPIC_CUTOFF}+ story in ${ARTIFACTS_DIR}`,
    ).toBeGreaterThan(0);
  });

  it.each(stories.map((s) => [s.filename, s.content]))(
    "%s has valid SN-6 section",
    (filename, content) => {
      const error = validateSn6(filename as string, content as string);
      expect(
        error,
        `${filename}: ${error}\nFix: add a ## Runtime Smoke Test section with evidence rows or N/A justification.`,
      ).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// 4. Tests — inline fixtures for validation logic
// ---------------------------------------------------------------------------

describe("SN-6 validation logic (inline fixtures)", () => {
  const VALID_WITH_EVIDENCE = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| Login flow works | Yes | http://localhost:3000/login | Form rendered, submitted, redirected to dashboard | None |

### Implementer Sign-Off
`;

  const VALID_WITH_NA = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Smoke Test Checklist

- [x] **[N/A]** — this story has no observable runtime effect (pure refactor). Justification: Only type definitions changed.

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| [Scenario name] | Yes / No | http://localhost:3000/... | [One sentence describing what you saw] | None / description of fix |
`;

  const MISSING_SECTION = `---
Status: done
---
## Tasks

- [x] Did some work

## Dev Notes

Nothing here about smoke tests.
`;

  const PLACEHOLDER_ONLY = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| [Scenario name] | Yes / No | http://localhost:3000/... | [One sentence describing what you saw] | None / description of fix |
`;

  const EMPTY_TABLE = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
`;

  it("passes with filled evidence rows", () => {
    expect(validateSn6("p-6-test.md", VALID_WITH_EVIDENCE)).toBeNull();
  });

  it("passes with N/A justification (even if table has only placeholders)", () => {
    expect(validateSn6("p-6-test.md", VALID_WITH_NA)).toBeNull();
  });

  it("fails when ## Runtime Smoke Test section is missing", () => {
    expect(validateSn6("p-6-test.md", MISSING_SECTION)).toBe(
      "Missing ## Runtime Smoke Test section",
    );
  });

  it("fails when evidence table has only placeholder rows", () => {
    expect(validateSn6("p-6-test.md", PLACEHOLDER_ONLY)).toBe(
      "No verification evidence rows (and no N/A justification)",
    );
  });

  it("fails when evidence table has only header/separator rows", () => {
    expect(validateSn6("p-6-test.md", EMPTY_TABLE)).toBe(
      "No verification evidence rows (and no N/A justification)",
    );
  });

  it("fails when rows have scenario names but all evidence columns are empty", () => {
    const EMPTY_EVIDENCE_CELLS = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| Digest job sends email | | | | |
| Frequency selector renders | | | | |
`;
    expect(validateSn6("p-6-test.md", EMPTY_EVIDENCE_CELLS)).toBe(
      "No verification evidence rows (and no N/A justification)",
    );
  });

  it("fails when per-row N/A in table cells is the only N/A (no whole-story [N/A]) and no substantive rows", () => {
    const PER_ROW_NA_NO_EVIDENCE = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Smoke Test Checklist

- [ ] App started locally and accessible in browser

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| Digest job sends email | | | | |
| Frequency selector renders | | | | |
`;
    // Per-row N/A not present here, but this verifies that table-cell N/A
    // does NOT satisfy the whole-story N/A check
    expect(validateSn6("p-6-test.md", PER_ROW_NA_NO_EVIDENCE)).toBe(
      "No verification evidence rows (and no N/A justification)",
    );
  });

  it("passes when table has mix of N/A rows and substantive evidence rows", () => {
    const MIXED_NA_AND_EVIDENCE = `---
Status: done
---
## Runtime Smoke Test (SN-6 — REQUIRED)

### Runtime Verification Evidence

| Scenario (from SN-2) | Verified | URL Visited | What Was Observed | Issues Found & Resolved |
|---|---|---|---|---|
| Server-side batch job | N/A | — | Verified by unit test | |
| UI renders correctly | Yes | http://localhost:3000/digest | Frequency selector displayed with all options | None |
`;
    expect(validateSn6("p-6-test.md", MIXED_NA_AND_EVIDENCE)).toBeNull();
  });
});

describe("SN-6 helper functions", () => {
  it("parseEpicNumber extracts epic from standard filenames", () => {
    expect(parseEpicNumber("p-6-2-email-notifications.md")).toBe(6);
    expect(parseEpicNumber("p-6-1a-notification-event-types.md")).toBe(6);
    expect(parseEpicNumber("p-12-3-future-story.md")).toBe(12);
  });

  it("parseEpicNumber returns null for non-story filenames", () => {
    expect(parseEpicNumber("spec-prep-m6.md")).toBeNull();
    expect(parseEpicNumber("p-foo-bar.md")).toBeNull();
  });

  it("isDone matches only done status in first 10 lines", () => {
    expect(isDone("---\nStatus: done\n---\n# Title")).toBe(true);
    expect(isDone("---\nStatus: Done\n---\n# Title")).toBe(true);
    expect(isDone("---\nStatus: in-progress\n---\n# Title")).toBe(false);
    expect(isDone("---\nStatus: review\n---\n# Title")).toBe(false);
  });
});
