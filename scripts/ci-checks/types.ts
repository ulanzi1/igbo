import { readdirSync, existsSync } from "fs";
import { join } from "path";

export interface CheckResult {
  file: string; // relative path
  line: number; // 1-indexed line number
  match: string; // matched line content (trimmed)
  check: string; // check name: 'stale-import' | 'process-env' | 'server-only'
}

/** Directories to skip during recursive scan */
const DEFAULT_SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo"]);

interface CollectOptions {
  skipDirs?: Set<string>;
  skipFileNames?: Set<string>;
}

export function collectTsFiles(dir: string, options?: CollectOptions): string[] {
  const skipDirs = options?.skipDirs ?? DEFAULT_SKIP_DIRS;
  const skipFileNames = options?.skipFileNames;
  const files: string[] = [];

  function walk(d: string): void {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        (!skipFileNames || !skipFileNames.has(entry.name))
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}
