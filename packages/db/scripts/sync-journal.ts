#!/usr/bin/env node
// @vitest-environment node

/**
 * sync-journal.ts — Auto-idx journal sync for @igbo/db migrations
 *
 * Scans packages/db/src/migrations/*.sql, sorts per the Sorting Rules,
 * and regenerates _journal.json with valid sequential idx entries.
 *
 * Sorting Rules:
 *   1. Numbered migrations (^\d{4}_) by numeric prefix (0000, 0001, ...)
 *   2. Timestamp migrations (^\d{14}_) by timestamp string (chronological)
 *   3. Numbered always before timestamp
 *   4. Duplicate timestamps: stable alphabetical tiebreak on full filename
 *   5. Unrecognized filenames: throw error — do NOT silently skip
 *
 * Usage:
 *   npx tsx scripts/sync-journal.ts          # write journal
 *   npx tsx scripts/sync-journal.ts --check  # check only, exit 1 if mismatch
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const NUMBERED_PATTERN = /^\d{4}_/;
const TIMESTAMP_PATTERN = /^\d{14}_/;

interface JournalEntry {
  idx: number;
  version: "7";
  when: number;
  tag: string;
  breakpoints: true;
}

interface MigrationJournal {
  version: "7";
  dialect: "postgresql";
  entries: JournalEntry[];
}

function parseTimestampToMs(filename: string): number {
  // filename: YYYYMMDDHHMMSS_description.sql
  const raw = filename.slice(0, 14);
  const year = parseInt(raw.slice(0, 4), 10);
  const month = parseInt(raw.slice(4, 6), 10) - 1; // 0-indexed
  const day = parseInt(raw.slice(6, 8), 10);
  const hours = parseInt(raw.slice(8, 10), 10);
  const minutes = parseInt(raw.slice(10, 12), 10);
  const seconds = parseInt(raw.slice(12, 14), 10);
  return Date.UTC(year, month, day, hours, minutes, seconds);
}

export function classifyMigration(filename: string): "numbered" | "timestamp" | "unknown" {
  if (NUMBERED_PATTERN.test(filename)) return "numbered";
  if (TIMESTAMP_PATTERN.test(filename)) return "timestamp";
  return "unknown";
}

export function sortMigrations(filenames: string[]): string[] {
  const numbered: string[] = [];
  const timestamp: string[] = [];

  for (const f of filenames) {
    const kind = classifyMigration(f);
    if (kind === "unknown") {
      throw new Error(
        `Unrecognized migration filename: "${f}". ` +
          `Filenames must match /^\\d{4}_/ (numbered) or /^\\d{14}_/ (timestamp). ` +
          `Run "pnpm --filter @igbo/db db:journal-sync" after renaming the file.`,
      );
    }
    if (kind === "numbered") {
      numbered.push(f);
    } else {
      timestamp.push(f);
    }
  }

  // Sort numbered by numeric prefix
  numbered.sort((a, b) => {
    const na = parseInt(a.slice(0, 4), 10);
    const nb = parseInt(b.slice(0, 4), 10);
    return na - nb;
  });

  // Sort timestamp by YYYYMMDDHHMMSS prefix, then stable alpha tiebreak
  timestamp.sort((a, b) => {
    const ta = a.slice(0, 14);
    const tb = b.slice(0, 14);
    if (ta !== tb) return ta.localeCompare(tb);
    // Same timestamp — stable alphabetical tiebreak on full filename
    return a.localeCompare(b);
  });

  return [...numbered, ...timestamp];
}

export function buildJournal(sortedFilenames: string[]): MigrationJournal {
  const entries: JournalEntry[] = sortedFilenames.map((filename, idx) => {
    const tag = filename.replace(/\.sql$/, "");
    const kind = classifyMigration(filename);

    let when: number;
    if (kind === "numbered") {
      // Preserve existing pattern: 1708000000000 + (idx * 1000)
      when = 1708000000000 + idx * 1000;
    } else {
      // Parse YYYYMMDDHHMMSS from filename to Unix milliseconds
      when = parseTimestampToMs(filename);
    }

    return { idx, version: "7", when, tag, breakpoints: true };
  });

  return { version: "7", dialect: "postgresql", entries };
}

export function formatDiff(current: MigrationJournal, generated: MigrationJournal): string {
  const lines: string[] = [];

  const currentEntries = current.entries;
  const generatedEntries = generated.entries;

  const maxLen = Math.max(currentEntries.length, generatedEntries.length);

  let hasDiff = false;

  for (let i = 0; i < maxLen; i++) {
    const curr = currentEntries[i];
    const gen = generatedEntries[i];

    if (!curr) {
      hasDiff = true;
      lines.push(`  + [idx=${gen.idx}] "${gen.tag}" (missing from journal)`);
    } else if (!gen) {
      hasDiff = true;
      lines.push(`  - [idx=${curr.idx}] "${curr.tag}" (extra in journal, no .sql file)`);
    } else if (curr.tag !== gen.tag || curr.idx !== gen.idx || curr.when !== gen.when) {
      hasDiff = true;
      lines.push(
        `  ~ [idx=${i}] journal has "${curr.tag}" (when=${curr.when}), expected "${gen.tag}" (when=${gen.when})`,
      );
    }
  }

  if (!hasDiff) return "";
  return lines.join("\n");
}

function main(): void {
  const isCheck = process.argv.includes("--check");

  // Resolve paths relative to this script's location (packages/db/scripts/)
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(scriptsDir, "../src/migrations");
  const journalPath = join(migrationsDir, "meta/_journal.json");

  // Read all .sql files
  let allFiles: string[];
  try {
    allFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error reading migrations directory at ${migrationsDir}: ${msg}`);
    process.exit(1);
  }

  if (allFiles.length === 0) {
    console.warn("No .sql files found in migrations directory.");
  }

  // Sort and validate (throws on unrecognized filenames)
  let sorted: string[];
  try {
    sorted = sortMigrations(allFiles);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Migration filename error: ${msg}`);
    process.exit(1);
  }

  const generated = buildJournal(sorted);

  if (isCheck) {
    // Read current journal
    let current: MigrationJournal;
    try {
      const raw = readFileSync(journalPath, "utf8");
      current = JSON.parse(raw) as MigrationJournal;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error reading journal at ${journalPath}: ${msg}`);
      process.exit(1);
    }

    const generatedStr = JSON.stringify(generated, null, 2) + "\n";
    const currentStr = JSON.stringify(current, null, 2) + "\n";

    if (generatedStr === currentStr) {
      console.log("✅ Migration journal is up to date.");
      process.exit(0);
    } else {
      const diff = formatDiff(current, generated);
      console.error("❌ Migration journal out of sync.");
      console.error("\nDifferences:");
      console.error(diff || "  (structural difference — run sync to see full diff)");
      console.error(
        "\n💡 Fix: run `pnpm --filter @igbo/db db:journal-sync` to regenerate the journal.",
      );
      process.exit(1);
    }
  } else {
    // Write mode
    const output = JSON.stringify(generated, null, 2) + "\n";
    writeFileSync(journalPath, output, "utf8");
    console.log(`✅ Journal written: ${sorted.length} migrations indexed.`);
    console.log(`   Path: ${journalPath}`);
  }
}

// Only run when executed directly (not when imported in tests)
const isDirectRun =
  typeof import.meta.url === "string" &&
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main();
}
