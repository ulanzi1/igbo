// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { classifyMigration, sortMigrations, buildJournal, formatDiff } from "./sync-journal.js";

// ─── Unit tests for classification ───────────────────────────────────────────

describe("classifyMigration", () => {
  it("classifies 4-digit numbered migration", () => {
    expect(classifyMigration("0000_extensions.sql")).toBe("numbered");
    expect(classifyMigration("0048_seed_governance_documents.sql")).toBe("numbered");
  });

  it("classifies 14-digit timestamp migration", () => {
    expect(classifyMigration("20260401120000_portal_job_postings.sql")).toBe("timestamp");
  });

  it("classifies unknown filenames", () => {
    expect(classifyMigration("migration.sql")).toBe("unknown");
    expect(classifyMigration("abc_foo.sql")).toBe("unknown");
    expect(classifyMigration("123_short.sql")).toBe("unknown"); // only 3 digits
  });
});

// ─── Unit tests for sorting ───────────────────────────────────────────────────

describe("sortMigrations", () => {
  it("sorts numbered migrations by numeric prefix", () => {
    const input = [
      "0010_file_uploads.sql",
      "0000_extensions.sql",
      "0048_seed_governance_documents.sql",
      "0001_platform_settings.sql",
    ];
    const result = sortMigrations(input);
    expect(result[0]).toBe("0000_extensions.sql");
    expect(result[1]).toBe("0001_platform_settings.sql");
    expect(result[2]).toBe("0010_file_uploads.sql");
    expect(result[3]).toBe("0048_seed_governance_documents.sql");
  });

  it("sorts timestamp migrations chronologically", () => {
    const input = [
      "20260410150000_portal_search.sql",
      "20260401120000_portal_job_postings.sql",
      "20260405080000_portal_schema.sql",
    ];
    const result = sortMigrations(input);
    expect(result[0]).toBe("20260401120000_portal_job_postings.sql");
    expect(result[1]).toBe("20260405080000_portal_schema.sql");
    expect(result[2]).toBe("20260410150000_portal_search.sql");
  });

  it("places all numbered migrations before timestamp migrations", () => {
    const input = [
      "20260401120000_portal_job_postings.sql",
      "0001_platform_settings.sql",
      "0000_extensions.sql",
      "20260410150000_portal_search.sql",
    ];
    const result = sortMigrations(input);
    expect(result[0]).toBe("0000_extensions.sql");
    expect(result[1]).toBe("0001_platform_settings.sql");
    expect(result[2]).toBe("20260401120000_portal_job_postings.sql");
    expect(result[3]).toBe("20260410150000_portal_search.sql");
  });

  it("handles only numbered migrations", () => {
    const input = ["0002_auth_users.sql", "0001_platform_settings.sql", "0000_extensions.sql"];
    const result = sortMigrations(input);
    expect(result).toEqual([
      "0000_extensions.sql",
      "0001_platform_settings.sql",
      "0002_auth_users.sql",
    ]);
  });

  it("handles only timestamp migrations", () => {
    const input = ["20260410150000_portal_search.sql", "20260401120000_portal_job_postings.sql"];
    const result = sortMigrations(input);
    expect(result[0]).toBe("20260401120000_portal_job_postings.sql");
    expect(result[1]).toBe("20260410150000_portal_search.sql");
  });

  it("handles empty array", () => {
    expect(sortMigrations([])).toEqual([]);
  });

  it("throws on unrecognized filename", () => {
    const input = ["0000_extensions.sql", "bad_filename.sql"];
    expect(() => sortMigrations(input)).toThrow(
      'Unrecognized migration filename: "bad_filename.sql"',
    );
  });

  it("throws on unrecognized filename even if only one in list", () => {
    expect(() => sortMigrations(["random_name.sql"])).toThrow(
      'Unrecognized migration filename: "random_name.sql"',
    );
  });

  it("handles duplicate timestamps with stable alphabetical tiebreak", () => {
    // Same timestamp prefix — tiebreak on full filename (alpha order)
    const input = [
      "20260401120000_zebra_table.sql",
      "20260401120000_apple_table.sql",
      "20260401120000_mango_table.sql",
    ];
    const result = sortMigrations(input);
    expect(result[0]).toBe("20260401120000_apple_table.sql");
    expect(result[1]).toBe("20260401120000_mango_table.sql");
    expect(result[2]).toBe("20260401120000_zebra_table.sql");
  });
});

// ─── Unit tests for journal generation ───────────────────────────────────────

describe("buildJournal", () => {
  it("generates correct structure", () => {
    const result = buildJournal(["0000_extensions.sql"]);
    expect(result.version).toBe("7");
    expect(result.dialect).toBe("postgresql");
    expect(result.entries).toHaveLength(1);
  });

  it("uses 1708000000000 + idx*1000 for numbered migrations", () => {
    const result = buildJournal(["0000_extensions.sql", "0001_platform_settings.sql"]);
    expect(result.entries[0].when).toBe(1708000000000);
    expect(result.entries[1].when).toBe(1708000001000);
  });

  it("parses timestamp migration to Unix ms", () => {
    const result = buildJournal(["20260401120000_portal_job_postings.sql"]);
    const entry = result.entries[0];
    // 2026-04-01T12:00:00Z in ms
    expect(entry.when).toBe(Date.UTC(2026, 3, 1, 12, 0, 0));
  });

  it("assigns sequential idx starting from 0", () => {
    const result = buildJournal([
      "0000_extensions.sql",
      "0001_platform_settings.sql",
      "0002_auth_users.sql",
    ]);
    expect(result.entries[0].idx).toBe(0);
    expect(result.entries[1].idx).toBe(1);
    expect(result.entries[2].idx).toBe(2);
  });

  it("uses filename without .sql extension as tag", () => {
    const result = buildJournal(["0000_extensions.sql", "20260401120000_portal_job_postings.sql"]);
    expect(result.entries[0].tag).toBe("0000_extensions");
    expect(result.entries[1].tag).toBe("20260401120000_portal_job_postings");
  });

  it("always sets breakpoints: true and version: '7'", () => {
    const result = buildJournal(["0000_extensions.sql"]);
    const entry = result.entries[0];
    expect(entry.breakpoints).toBe(true);
    expect(entry.version).toBe("7");
  });

  it("handles mixed numbered + timestamp migrations with correct idx continuity", () => {
    const result = buildJournal([
      "0000_extensions.sql",
      "0001_platform_settings.sql",
      "20260401120000_portal_job_postings.sql",
    ]);
    expect(result.entries[0].idx).toBe(0);
    expect(result.entries[1].idx).toBe(1);
    expect(result.entries[2].idx).toBe(2);
    // Numbered use calculated when; timestamp uses real date
    expect(result.entries[0].when).toBe(1708000000000);
    expect(result.entries[2].when).toBe(Date.UTC(2026, 3, 1, 12, 0, 0));
  });

  it("handles empty input", () => {
    const result = buildJournal([]);
    expect(result.entries).toHaveLength(0);
  });
});

// ─── Unit tests for formatDiff ────────────────────────────────────────────────

describe("formatDiff", () => {
  const base = buildJournal(["0000_extensions.sql", "0001_platform_settings.sql"]);

  it("returns empty string when journals are identical", () => {
    const copy = JSON.parse(JSON.stringify(base));
    expect(formatDiff(base, copy)).toBe("");
  });

  it("shows missing entry in journal (+ line)", () => {
    const larger = buildJournal([
      "0000_extensions.sql",
      "0001_platform_settings.sql",
      "0002_auth_users.sql",
    ]);
    const diff = formatDiff(base, larger);
    expect(diff).toContain("0002_auth_users");
    expect(diff).toContain("missing from journal");
  });

  it("shows extra entry in journal (- line)", () => {
    const smaller = buildJournal(["0000_extensions.sql"]);
    const diff = formatDiff(base, smaller);
    expect(diff).toContain("0001_platform_settings");
    expect(diff).toContain("extra in journal");
  });

  it("shows changed entry (~ line)", () => {
    const modified = JSON.parse(JSON.stringify(base));
    modified.entries[1].tag = "0001_something_else";
    const diff = formatDiff(base, modified);
    expect(diff).toContain("~");
    expect(diff).toContain("0001_platform_settings");
    expect(diff).toContain("0001_something_else");
  });
});

// ─── Integration tests with real temp directories ─────────────────────────────

describe("integration: sortMigrations + buildJournal idempotency", () => {
  it("produces identical journal on second run (idempotency)", () => {
    const files = [
      "0000_extensions.sql",
      "0001_platform_settings.sql",
      "0048_seed_governance_documents.sql",
      "20260401120000_portal_job_postings.sql",
    ];

    const sorted1 = sortMigrations(files);
    const journal1 = buildJournal(sorted1);
    const output1 = JSON.stringify(journal1, null, 2) + "\n";

    // Simulate second run
    const sorted2 = sortMigrations(files);
    const journal2 = buildJournal(sorted2);
    const output2 = JSON.stringify(journal2, null, 2) + "\n";

    expect(output1).toBe(output2);
  });

  it("handles the full 49 existing numbered migrations correctly", () => {
    // Simulate all 49 existing numbered migrations
    const files: string[] = [];
    for (let i = 0; i < 49; i++) {
      files.push(`${String(i).padStart(4, "0")}_migration_${i}.sql`);
    }
    // Shuffle to verify sort is deterministic
    const shuffled = [...files].sort(() => Math.random() - 0.5);

    const sorted = sortMigrations(shuffled);
    const journal = buildJournal(sorted);

    expect(journal.entries).toHaveLength(49);
    expect(journal.entries[0].idx).toBe(0);
    expect(journal.entries[48].idx).toBe(48);
    expect(journal.entries[0].when).toBe(1708000000000);
    expect(journal.entries[48].when).toBe(1708000000000 + 48 * 1000);
  });
});

// ─── Integration tests: --check mode detects mismatches ──────────────────────

describe("integration: check mode and file operations", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sync-journal-test-"));
    mkdirSync(join(tmpDir, "meta"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects mismatch when new .sql file added without journal update", () => {
    // Create a journal with 2 entries
    const files = ["0000_extensions.sql", "0001_platform_settings.sql"];
    const sorted = sortMigrations(files);
    const journal = buildJournal(sorted);

    writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2) + "\n");

    // Now "add" a new migration without updating journal
    const filesWithNew = [...files, "0002_auth_users.sql"];
    const sortedNew = sortMigrations(filesWithNew);
    const newJournal = buildJournal(sortedNew);

    // formatDiff should show the mismatch
    const diff = formatDiff(journal, newJournal);
    expect(diff).toContain("0002_auth_users");
    expect(diff.length).toBeGreaterThan(0);
  });

  it("check passes when journal matches generated output", () => {
    const files = ["0000_extensions.sql", "0001_platform_settings.sql"];
    const sorted = sortMigrations(files);
    const journal = buildJournal(sorted);
    const output = JSON.stringify(journal, null, 2) + "\n";

    writeFileSync(join(tmpDir, "meta/_journal.json"), output);

    // Regenerate — should be identical
    const sorted2 = sortMigrations(files);
    const journal2 = buildJournal(sorted2);
    const output2 = JSON.stringify(journal2, null, 2) + "\n";

    expect(output).toBe(output2);
    expect(formatDiff(journal, journal2)).toBe("");
  });

  it("writes journal file correctly", () => {
    const journalPath = join(tmpDir, "meta/_journal.json");
    const files = ["0000_extensions.sql", "0001_platform_settings.sql"];
    const sorted = sortMigrations(files);
    const journal = buildJournal(sorted);
    const output = JSON.stringify(journal, null, 2) + "\n";
    writeFileSync(journalPath, output);

    const read = JSON.parse(readFileSync(journalPath, "utf8"));
    expect(read.version).toBe("7");
    expect(read.dialect).toBe("postgresql");
    expect(read.entries).toHaveLength(2);
  });
});
