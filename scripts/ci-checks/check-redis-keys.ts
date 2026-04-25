import { readFileSync } from "fs";
import { relative } from "path";
import { collectTsFiles, type CheckResult } from "./types";

/**
 * Detection patterns for raw Redis key construction.
 *
 * Strategy: detect template literals/strings that are clearly Redis keys
 * (passed to Redis methods, assigned to key-named variables, or look like
 * namespaced keys with multiple colon segments). Minimize false positives
 * by exempting rate-limit bucket names, URLs, error messages, etc.
 */

/**
 * Pattern 1: Redis method called with an inline template literal or string containing `:`
 * e.g., redis.set(`dedup:portal:${id}`, ...) or redis.get("prefix:key")
 * Also matches pipeline methods: pipeline.incr(`key:${id}`)
 */
const REDIS_CALL_WITH_INLINE_KEY =
  /(?:redis|pipeline)\.\w+\s*\(\s*(?:`[a-z][a-z0-9_-]*:[^`]*`|["'][a-z][a-z0-9_-]*:[^"']+["'])/i;

/**
 * Pattern 2: Variable named *Key or *KEY assigned a template literal with `:` separators
 * e.g., const dedupKey = `dedup:portal:${id}`
 *        const redisKey = `prefix:${val}`
 *        const REDIS_KEYWORDS_KEY = "moderation:keywords:active"
 */
const KEY_VAR_ASSIGNMENT =
  /(?:const|let|var)\s+\w*[Kk][Ee][Yy]\w*\s*=\s*(?:`[a-z][a-z0-9_-]*:[^`]*`|["'][a-z][a-z0-9_-]*:[^"']+["'])/;

/**
 * Pattern 3: Template literal with `:` separator assigned or passed where the prefix
 * matches known Redis key domain prefixes (dedup, throttle, lockout, dnd, session, cache,
 * delivered, points, gdpr, moderation, recommendations, suggestions)
 */
const KNOWN_REDIS_PREFIX =
  /(?:`|["'])(?:dedup|throttle|lockout|dnd|session|cache|delivered|points|gdpr|moderation|recommendations|suggestions|social_link_state|social_link_pkce|email_otp|login_attempts|mfa_attempts|password_reset|pending_session_device|ratelimit|rl|platform|challenge|resend-verify):/;

/** Lines containing these markers are exempt from detection. */
const EXEMPT_MARKERS = ["createRedisKey(", "// ci-allow-redis-key"];

/** Files that are structurally exempt (implementation file, config helpers, etc.) */
const EXEMPT_FILE_PATTERNS = [
  "packages/config/src/redis.ts",
  "packages/config/src/redis.test.ts",
];

// ---------------------------------------------------------------------------
// Allowlist ratchet
// ---------------------------------------------------------------------------
//
// MAX_ALLOWLISTED is the maximum number of `// ci-allow-redis-key` markers
// permitted in non-test, non-exempt source files. This is a ratchet (not a
// lock): as files are migrated to createRedisKey() and their markers removed,
// the effective count decreases and CI stays green without updating this constant.
// Only when a NEW marker is added does the count risk exceeding this baseline.
//
// MIGRATION NOTE:
//   To graduate a file from the allowlist to typed createRedisKey() calls:
//   1. Open the file and replace the raw Redis key string with createRedisKey().
//   2. Remove the `// ci-allow-redis-key` marker comment.
//   3. Run `pnpm ci-checks` locally — the allowlist count decreases by 1.
//   4. The ratchet auto-tightens: no change to MAX_ALLOWLISTED needed.
//   5. Update REDIS_DOMAIN union in packages/config/src/redis.ts if the file
//      uses a domain not yet in the union type.
//
// Baseline established at AI-26 merge (2026-04-25).
// ---------------------------------------------------------------------------
const MAX_ALLOWLISTED = 62;

function isTestFile(relPath: string): boolean {
  return relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx");
}

function isCacheRegistry(relPath: string): boolean {
  return relPath.endsWith("cache-registry.ts");
}

function isExemptByContext(line: string): boolean {
  // registerCacheNamespace SCAN patterns
  if (/registerCacheNamespace/.test(line)) return true;

  // Pub/sub channel patterns (e.g., .publish(`eventbus:${event}`, ...) or .publish("eventbus:...", ...))
  if (/\.publish\s*\(\s*[`"']eventbus:/.test(line)) return true;

  return false;
}

/**
 * Scans for raw Redis key strings in apps/ and packages/ source files.
 *
 * Returns CheckResult[] for each detected violation. Files using `createRedisKey()`
 * or marked with `// ci-allow-redis-key` are exempt.
 *
 * Also enforces the allowlist ratchet: if the count of `// ci-allow-redis-key`
 * markers in scanned files exceeds MAX_ALLOWLISTED, a violation is pushed.
 */
export function scanForRawRedisKeys(rootDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  let allowlistedCount = 0;

  const files = [
    ...collectTsFiles(`${rootDir}/apps`),
    ...collectTsFiles(`${rootDir}/packages`),
  ];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath).replace(/\\/g, "/");

    if (isTestFile(relPath)) continue;
    if (EXEMPT_FILE_PATTERNS.some((pattern) => relPath.endsWith(pattern))) continue;
    if (isCacheRegistry(relPath)) continue;

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";

      // Count allowlist markers for ratchet tracking (only raw keys, not migrated lines)
      if (line.includes("// ci-allow-redis-key") && !line.includes("createRedisKey(")) {
        allowlistedCount++;
      }

      if (EXEMPT_MARKERS.some((marker) => line.includes(marker))) continue;
      if (isExemptByContext(line)) continue;

      const isViolation =
        REDIS_CALL_WITH_INLINE_KEY.test(line) ||
        KEY_VAR_ASSIGNMENT.test(line) ||
        KNOWN_REDIS_PREFIX.test(line);

      if (isViolation) {
        results.push({
          file: relPath,
          line: i + 1,
          match: line.trim(),
          check: "redis-key",
        });
      }
    }
  }

  // Ratchet check: fail if allowlist has grown beyond the established baseline
  if (allowlistedCount > MAX_ALLOWLISTED) {
    results.push({
      file: "scripts/ci-checks/check-redis-keys.ts",
      line: 1,
      match: `Allowlist has grown beyond baseline of ${MAX_ALLOWLISTED} (current: ${allowlistedCount}). Migrate a community file to createRedisKey() and remove the marker.`,
      check: "redis-key",
    });
  }

  return results;
}
