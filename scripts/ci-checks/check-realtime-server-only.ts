import { readFileSync, existsSync } from "fs";
import { resolve, dirname, relative } from "path";
import type { CheckResult } from "./types";

/**
 * Regex to match import/require specifiers (both static and dynamic).
 * Captures the module specifier from:
 *   import ... from "specifier"
 *   import "specifier"
 *   require("specifier")
 *   export ... from "specifier"
 *
 * Excludes `import type` (type-only imports have no runtime effect).
 */
const IMPORT_REGEX =
  /(?:import\s+type\s+)|(?:(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'])|(?:require\s*\(\s*["']([^"']+)["']\s*\))/g;

const SERVER_ONLY_REGEX = /import\s+["']server-only["']/;

/** Known entry point for the realtime server (relative to repo root). */
const REALTIME_ENTRY = "apps/community/src/server/realtime/index.ts";

/**
 * Files that are excluded from traversal (not from detection).
 *
 * The @igbo/db barrel (packages/db/src/index.ts) imports ALL Drizzle schemas
 * via `import * as`. This is a Drizzle ORM requirement — all schemas must be
 * registered to create the typed `db` instance. Many portal schema files include
 * `import "server-only"` to prevent client-side imports in Next.js.
 *
 * At runtime, the realtime server uses `tsx` (not Next.js bundler), so
 * `server-only` resolves to the empty `react-server` export condition and
 * does NOT throw. The barrel import is therefore safe. However, we still want
 * to catch NEW direct imports of server-only-guarded files (e.g., someone
 * importing a portal query file directly into a realtime handler).
 *
 * The exclusion only prevents TRAVERSAL into the barrel — it does NOT prevent
 * detecting `import "server-only"` if the barrel itself contained it.
 */
const TRAVERSAL_EXCLUDED_FILES = new Set(["packages/db/src/index.ts"]);

interface ImportGraphViolation {
  /** File that contains `import "server-only"` */
  file: string;
  /** Import chain from entry point to the violating file */
  chain: string[];
}

/**
 * Resolve a module specifier to a file path on disk.
 * Returns null if the specifier cannot be resolved (external npm package, node built-in, etc.).
 */
function resolveSpecifier(specifier: string, importerPath: string, rootDir: string): string | null {
  // Skip node built-ins
  if (specifier.startsWith("node:")) return null;

  // Relative import
  if (specifier.startsWith(".")) {
    const base = resolve(dirname(importerPath), specifier);
    return resolveToFile(base);
  }

  // @igbo/* workspace package imports
  // @igbo/db → packages/db/src/index.ts
  // @igbo/db/queries/foo → packages/db/src/queries/foo.ts
  // @igbo/config/realtime → packages/config/src/realtime.ts (or realtime/index.ts)
  const igboMatch = specifier.match(/^@igbo\/([^/]+)(?:\/(.+))?$/);
  if (igboMatch) {
    const pkgName = igboMatch[1]!;
    const subpath = igboMatch[2];
    const pkgSrcDir = resolve(rootDir, "packages", pkgName, "src");
    if (subpath) {
      return resolveToFile(resolve(pkgSrcDir, subpath));
    }
    return resolveToFile(resolve(pkgSrcDir, "index"));
  }

  // @/ path alias (community app)
  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    const base = resolve(rootDir, "apps/community/src", rest);
    return resolveToFile(base);
  }

  // External npm package — skip
  return null;
}

/**
 * Try common TypeScript file extensions for a base path.
 * Returns the first existing file, or null.
 */
function resolveToFile(base: string): string | null {
  // Exact match (already has extension)
  if (/\.\w+$/.test(base) && existsSync(base)) return base;

  // Try extensions
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  // Try without assuming — maybe base itself is a file
  if (existsSync(base)) return base;

  return null;
}

/**
 * Extract import specifiers from a TypeScript source file.
 * Skips `import type` (type-only imports have no runtime effect).
 */
function extractImports(content: string): string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  IMPORT_REGEX.lastIndex = 0;

  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    // First capture group: full match starts with `import type` → skip
    if (match[0].startsWith("import type")) continue;

    const specifier = match[1] ?? match[2];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Walk the import graph from a given entry point and find any file that
 * contains `import "server-only"`.
 *
 * Uses BFS to find the shortest import chain to each violation.
 */
function walkImportGraph(entryPath: string, rootDir: string): ImportGraphViolation[] {
  const violations: ImportGraphViolation[] = [];
  const visited = new Set<string>();

  // BFS queue: [absoluteFilePath, importChain]
  const queue: Array<[string, string[]]> = [[entryPath, []]];

  while (queue.length > 0) {
    const [filePath, parentChain] = queue.shift()!;

    if (visited.has(filePath)) continue;
    visited.add(filePath);

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");
    const chain = [...parentChain, relPath];

    // Check if this file imports server-only
    if (SERVER_ONLY_REGEX.test(content)) {
      violations.push({ file: relPath, chain });
      // Don't traverse further from this file — we already know it's bad
      continue;
    }

    // Skip traversal for excluded files (still checked for server-only above)
    if (TRAVERSAL_EXCLUDED_FILES.has(relPath)) continue;

    // Extract imports and enqueue resolved files
    const specifiers = extractImports(content);
    for (const specifier of specifiers) {
      const resolved = resolveSpecifier(specifier, filePath, rootDir);
      if (resolved && !visited.has(resolved)) {
        queue.push([resolved, chain]);
      }
    }
  }

  return violations;
}

/**
 * Scans the realtime server import graph for any transitive dependency
 * on `server-only`.
 *
 * The realtime server runs as a standalone Node.js process (not inside Next.js),
 * so any import of `server-only` in its dependency graph would be problematic.
 * This scanner statically walks the import graph from the entry point and
 * flags files that contain `import "server-only"`.
 *
 * Returns CheckResult[] with violations including the import chain for debugging.
 */
export function scanRealtimeServerOnly(rootDir: string): CheckResult[] {
  const entryPath = resolve(rootDir, REALTIME_ENTRY);

  if (!existsSync(entryPath)) {
    // Entry point doesn't exist — nothing to check (e.g., test tmpdir without it)
    return [];
  }

  const violations = walkImportGraph(entryPath, rootDir);

  return violations.map((v) => ({
    file: v.file,
    line: 1,
    match: `imports "server-only" — reachable from realtime server via: ${v.chain.join(" → ")}`,
    check: "realtime-server-only",
  }));
}
