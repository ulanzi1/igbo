---
title: 'CI Enforcement & Skipped Test Resolution'
slug: 'ci-enforcement-skipped-tests'
created: '2026-04-04'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Node.js fs', 'Vitest', 'GitHub Actions', 'Redis 7']
files_to_modify:
  - 'scripts/check-stale-imports.ts → scripts/ci-checks/check-stale-imports.ts (move)'
  - 'scripts/ci-checks/check-process-env.ts (new)'
  - 'scripts/ci-checks/check-server-only.ts (new)'
  - 'scripts/ci-checks/index.ts (new — entry point)'
  - 'scripts/ci-checks/types.ts (new — shared CheckResult interface)'
  - 'apps/community/ci-checks.test.ts (new — replaces ci-stale-import-scanner.test.ts)'
  - 'apps/community/ci-stale-import-scanner.test.ts (delete)'
  - '.github/workflows/ci.yml (update scanner invocation)'
  - 'apps/portal/src/app/[locale]/page.tsx (suppress process.env — VD-6)'
  - 'apps/portal/src/services/event-bus.ts (suppress process.env + add ci-allow-no-server-only)'
  - 'apps/community/src/services/message-service.ts (add server-only)'
  - 'apps/community/src/services/video-service.ts (add server-only)'
  - 'apps/community/src/server/api/middleware.ts (fix process.env)'
  - 'apps/community/src/app/api/metrics/route.ts (fix process.env)'
  - 'packages/db/src/queries/posts.ts (fix process.env)'
code_patterns:
  - 'Scanner exports scan*() function returning CheckResult[]'
  - 'Two-tier allowlist: path-based + content-based + suppress comment'
  - 'collectTsFiles() recursive walker with SKIP_DIRS'
  - 'CLI entry point guarded by process.argv[1] check'
test_patterns:
  - 'Fixture-based: mkdtempSync + createFile() helper'
  - 'Tests cover: positive match, negative (clean), allowlist exemption, suppress comment, edge case'
  - 'Test file at apps/community/ci-checks.test.ts (community vitest picks up root-level tests)'
---

# Tech-Spec: CI Enforcement & Skipped Test Resolution

**Created:** 2026-04-04

## Overview

### Problem Statement

Two systemic gaps are undermining quality gates:

1. **Repeat review findings slip through CI.** Direct `process.env.X` usage (instead of typed `env.X` from `@/env`) and missing `import "server-only"` in server modules are the top two repeat offenders across 6+ reviewed stories (~33 total review fixes in Portal Epic 0). These are catchable programmatically but currently rely on human review.

2. **17+ skipped tests carried across multiple epics.** 10 Lua integration tests (since Epic 8) and 7 integration tests (since P-0.3B) are auto-skipped in CI because Redis isn't available. The retro rule "Cannot carry skipped tests across 2 epics" is being violated.

### Solution

1. Extend the existing CI scanner infrastructure with a composable architecture: one entry point (`scripts/ci-checks/index.ts`) running three check modules — stale imports (existing, migrated), direct `process.env` audit, and missing `server-only` audit.
2. Verify that the Redis service container added in P-0.6 is actually causing the 11 previously-skipped tests to execute in CI. Fix any wiring gaps.

### Scope

**In Scope:**
- New scanner: detect `process.env.X` usage outside allowed locations (two-tier allowlist + suppress comment)
- New scanner: detect missing `import "server-only"` in app-level server modules (directory-convention-based)
- Composable scanner architecture: migrate existing stale import scanner into unified entry point
- Verify Redis-dependent tests (Lua + eventbus) are running in CI — fix wiring if not
- Fix existing process.env violations and missing server-only imports found by the new scanners
- Scanner unit tests at `apps/community/ci-checks.test.ts`

**Out of Scope:**
- E2E tests requiring full running apps (accessibility, keyboard nav — needs deployed environment, different solution)
- SSO integration tests requiring both community + portal servers (staging pipeline concern)
- ESLint rule approach (scanner pattern for consistency with existing infrastructure)

## Context for Development

### Codebase Patterns

- **Existing scanner pattern:** `scripts/check-stale-imports.ts` exports `scanForStaleImports(rootDir)` returning `string[]` in format `"relPath:lineNum: matchedLine"`. CLI entry point at bottom guarded by `process.argv[1]?.endsWith(...)`. Tests at `apps/community/ci-stale-import-scanner.test.ts` using temp dir fixtures.
- **CI integration:** Scanner runs in lint job (line 75-76 of ci.yml) after `turbo lint`, before `prettier --check`. Invoked via `npx tsx scripts/check-stale-imports.ts`.
- **CI Redis already exists:** Test job (ci.yml lines 137-144) has `services: redis:7-alpine` with `REDIS_URL=redis://localhost:6379`. Added in P-0.6. The Lua and Redis eventbus tests _should_ already be running — needs verification.
- **Env access pattern:** App-level `src/env.ts` calls `createEnv()` from `@t3-oss/env-nextjs`. Direct `process.env` is legitimate in: env.ts, instrumentation.ts, next.config.*, *.config.*, scripts, test files, middleware.ts (Edge runtime), and files shared with standalone realtime server (redis.ts, event-bus.ts).
- **Server-only pattern:** ~55 files import `"server-only"`. Required in `apps/*/src/services/` and `apps/*/src/server/` (the high-confidence directories). `src/lib/` is mixed — some files are client-shared utilities. `packages/auth/src/` already has it in 4 files. `@igbo/db` has `server-only` as a dependency but does NOT use exports conditions.
- **NEXT_PUBLIC_* in client components:** `process.env.NEXT_PUBLIC_*` is legitimate in client components — Next.js inlines these at build time. Scanner must NOT flag these.

### Investigation Findings

#### process.env Audit (70 files total)

| Category | Count | Action |
|----------|-------|--------|
| Test files (*.test.*, *.spec.*) | 27 | Tier 1 allowlist — path-based |
| Config files (env.ts, *.config.*, instrumentation.ts) | 8 | Tier 1 allowlist — path-based |
| Scripts (scripts/*, seed-*.ts) | 3 | Tier 1 allowlist — path-based |
| E2E tests | 2 | Tier 1 allowlist — path-based |
| Sentry config | 3 | Tier 1 allowlist — path-based |
| Middleware.ts (Edge runtime) | 2 | Tier 1 allowlist — path-based |
| Standalone-shared (realtime/) | 4 | Tier 1 allowlist — path-based |
| NEXT_PUBLIC_* anywhere | ~7 | Tier 2 allowlist — content-based |
| NODE_ENV anywhere | ~5 | Tier 2 allowlist — content-based |
| Documented exceptions (redis.ts, event-bus.ts) | ~3 | Tier 3 — `// ci-allow-process-env` suppress comment |
| **Real violations to fix** | **~8** | **Must fix before enabling scanner** |
| **Suppress with comment** | **~4** | **Add `// ci-allow-process-env`** |

**Violations by action category:**

**FIX (clear violations — import `env` from `@/env` instead):**
- `apps/community/src/server/api/middleware.ts` — `process.env.ALLOWED_ORIGINS` → `env.ALLOWED_ORIGINS`, `process.env.SENTRY_DSN` → `env.SENTRY_DSN` (Node runtime, can import @/env). **Note:** `MAINTENANCE_MODE` is NOT in the env schema — add it to `apps/community/src/env.ts` serverEnvSchema first (optional string, default undefined), then replace.
- `apps/community/src/app/api/metrics/route.ts` — `process.env.METRICS_SECRET` → `env.METRICS_SECRET`. **Note:** verify `METRICS_SECRET` is in env schema; add if missing.
- `apps/community/src/services/message-service.ts` — missing `import "server-only"` (server-only fix)
- `apps/community/src/services/video-service.ts` — missing `import "server-only"` (server-only fix)

**NOT A SCANNER VIOLATION (Tier 2 auto-handles, but best-practice fix recommended):**
- `apps/community/src/services/notification-service.ts` — uses `process.env.NEXT_PUBLIC_APP_URL`. Tier 2 exempts `NEXT_PUBLIC_*` so the scanner won't flag this. However, using typed `env.NEXT_PUBLIC_APP_URL` is better practice. Fix if convenient, but not required for scanner to pass.

**FIX (resolved from INVESTIGATE):**
- `apps/community/src/app/api/auth/verify-session/route.ts` — API route (Node runtime, NOT Edge). Can and should import `@/env`.
- `apps/portal/src/app/[locale]/page.tsx` — Server Component (Node runtime). Add `COMMUNITY_URL` to portal env schema, then import from `@/env`.

**SUPPRESS (documented exceptions — add `// ci-allow-process-env`):**
- `apps/portal/src/lib/redis.ts` — standalone server shared (already documented in code comments)
- `apps/portal/src/services/event-bus.ts` — standalone server shared (already documented)
- `apps/community/src/lib/logger.ts` — shared by Next.js and standalone realtime server
- `apps/community/src/server/seed/admin-seed.ts` — seed script; `@/env` triggers full validation which fails outside Next.js
- `packages/db/src/queries/posts.ts` — `@igbo/db` package can't import app-level `@/env`; velocity-debt item for proper parameter injection

**AUTO-HANDLED (no action needed):**
- `apps/community/src/lib/service-health.ts` — uses `process.env.NEXT_PUBLIC_*` → Tier 2 content exemption handles automatically

#### server-only Audit

| Directory | Has import | Missing import | Notes |
|-----------|-----------|----------------|-------|
| `apps/community/src/services/` | 38 | 2 (message-service.ts, video-service.ts) | Must fix |
| `apps/community/src/server/` | 8 | 5 (seed, realtime, jobs, api/middleware) | realtime files intentionally shared; jobs/seed borderline |
| `apps/community/src/lib/` | 3 | 11 | Most are client-shared utils — scanner skips this dir |
| `packages/auth/src/` | 4 | 1 (types.ts — no runtime code) | Skip types-only files |

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `scripts/check-stale-imports.ts` | Existing scanner — migration source and pattern reference |
| `apps/community/ci-stale-import-scanner.test.ts` | Existing scanner tests — migration source |
| `.github/workflows/ci.yml` | CI workflow — update scanner invocation line 76 |
| `apps/community/src/lib/lua/award-points-lua.test.ts` | Lua integration tests (10) — verify running in CI |
| `packages/integration-tests/redis-eventbus.test.ts` | Redis namespace test (1) — verify running in CI |
| `packages/integration-tests/sso-flow.test.ts` | SSO tests (6) — OUT OF SCOPE, stays skipped |
| `apps/community/src/env.ts` | App-level env — reference for what process.env.X should migrate to |

### Technical Decisions

1. **Two-tier allowlist + suppress comment for `process.env` scanner.**

   **Tier 1 — Path-based (automatic, file-level):**
   - `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts` (test files)
   - `**/env.ts` (env definition files)
   - `**/instrumentation.ts` (startup hooks)
   - `**/*.config.*` (config files: next.config, vitest.config, sentry.*, drizzle.config, playwright.config)
   - `scripts/**` (build/CI scripts)
   - `**/middleware.ts` (Edge runtime — can't import server modules)
   - `**/realtime/**` (standalone server shared — documented exception)

   **Tier 2 — Content-based (per-line, pattern match):**
   - `process.env.NEXT_PUBLIC_*` → always allowed anywhere (Next.js inlines at build time)
   - `process.env.NODE_ENV` → always allowed anywhere (universal Node.js convention)

   **Tier 3 — Suppress comment (per-line, explicit opt-out):**
   - If the line contains `// ci-allow-process-env` → skip that specific line
   - Used for: redis.ts, event-bus.ts, logger.ts, and any future documented exceptions
   - Visible in code review — acts as a signal, not hidden config

2. **Directory-convention `server-only` scanner.** High-confidence directories only:
   - `apps/*/src/services/**/*.ts` — MUST have `import "server-only"` (excluding test files and `index.ts` barrel exports)
   - `apps/*/src/server/**/*.ts` — MUST have `import "server-only"` (excluding test files, `realtime/**` which are standalone-shared, and `seed/**` which run outside Next.js context)
   - `packages/auth/src/**/*.ts` — MUST have `import "server-only"` (excluding test files, `types.ts`, `index.ts`, `api-error.ts`, `redis.ts`, `session-cache.ts` — these intentionally omit server-only with documented `// NOTE:` comments)
   - NOT scanning `src/lib/` (too many legitimate client-shared files)

3. **Composable scanner architecture.** Directory structure:
   ```
   scripts/ci-checks/
   ├── index.ts          # CLI entry point — runs all checks, aggregated output
   ├── types.ts          # CheckResult interface, shared utilities (collectTsFiles)
   ├── check-stale-imports.ts   # Migrated from scripts/check-stale-imports.ts
   ├── check-process-env.ts     # New: process.env two-tier allowlist scanner
   └── check-server-only.ts     # New: server-only directory convention scanner
   ```
   Each module exports `scan*(rootDir: string): CheckResult[]`. Entry point runs all three, groups output by check name, exits 1 if any violations.

4. **Redis verification, not creation.** CI test job already has Redis service + REDIS_URL (added in P-0.6). Task is to verify the 11 tests actually execute (not show as skipped), and fix any wiring gaps.

5. **Fix existing violations before enabling scanner.** The scanner would fail CI immediately if existing violations aren't fixed first. Implementation order: fix violations → enable scanner.

6. **Edge vs Node middleware distinction.** `apps/*/src/middleware.ts` (Next.js Edge middleware) is path-allowlisted — Edge runtime can't import `@/env`. `apps/*/src/server/api/middleware.ts` (API route middleware) runs in Node.js and MUST use `@/env`.

## Implementation Plan

### Tasks

- [x] **Task 1: Verify Redis-dependent tests run in CI (AI-5)**
  - File: `.github/workflows/ci.yml` (read-only verification)
  - Action: Trigger a CI run on the current branch and verify:
    - The 10 Lua integration tests in `award-points-lua.test.ts` execute (not skipped)
    - The 1 Redis eventbus test in `redis-eventbus.test.ts` executes (not skipped)
    - Check turbo summary output for `@igbo/integration-tests` and `@igbo/community` test counts
  - **Local verification command:**
    ```bash
    REDIS_URL=redis://localhost:6379 pnpm --filter @igbo/community exec vitest run src/lib/lua/award-points-lua.test.ts
    REDIS_URL=redis://localhost:6379 pnpm --filter @igbo/integration-tests exec vitest run redis-eventbus.test.ts
    ```
    (Requires local Redis running on port 6379)
  - Notes: If tests are still skipped in CI, debug: check turbo task graph includes integration-tests package, check REDIS_URL propagation to child processes. If tests pass — AI-5 Redis portion is done, document in retro. This is a verification step — if local Redis isn't available, skip and verify via CI output instead.

- [x] **Task 2: Create shared scanner types and utilities**
  - File: `scripts/ci-checks/types.ts` (new)
  - Action: Create shared `CheckResult` interface and extract `collectTsFiles()` utility from existing scanner:
    ```typescript
    export interface CheckResult {
      file: string;    // relative path
      line: number;    // 1-indexed line number
      match: string;   // matched line content (trimmed)
      check: string;   // check name: 'stale-import' | 'process-env' | 'server-only'
    }
    ```
    Extract `collectTsFiles(dir, options?)` as shared utility:
    ```typescript
    interface CollectOptions {
      skipDirs?: Set<string>;      // directory names to skip (default: SKIP_DIRS)
      skipFileNames?: Set<string>; // exact filenames to skip (e.g., "ci-checks.test.ts")
    }
    export function collectTsFiles(dir: string, options?: CollectOptions): string[];
    ```
  - Notes: `skipDirs` defaults to `SKIP_DIRS` (node_modules, .next, etc). `skipFileNames` is per-scanner (stale-import scanner needs to skip test fixture file). Each scanner applies its own path-based and content-based filtering AFTER collecting files — `collectTsFiles` only handles directory traversal and filename skipping, not pattern-based exclusions like `realtime/**` or `*.test.*`.

- [x] **Task 3: Migrate stale import scanner to composable module**
  - File: `scripts/ci-checks/check-stale-imports.ts` (new, migrated from `scripts/check-stale-imports.ts`)
  - Action: Move `scanForStaleImports()` into new module. Change return type from `string[]` to `CheckResult[]`. Import `collectTsFiles` and `CheckResult` from `types.ts`. Remove CLI entry point (moved to index.ts).
  - File: `scripts/check-stale-imports.ts` (delete after migration)
  - Notes: Preserve exact regex patterns and allowedInPackage logic. The function signature changes from `scanForStaleImports(rootDir): string[]` to `scanForStaleImports(rootDir): CheckResult[]`. Update `SKIP_FILES` from `["ci-stale-import-scanner.test.ts"]` to `["ci-checks.test.ts"]` (replacement test file contains fixture strings like `from "@/db/..."`).

- [x] **Task 4: Create process.env scanner**
  - File: `scripts/ci-checks/check-process-env.ts` (new)
  - Action: Implement `scanDirectProcessEnv(rootDir: string): CheckResult[]` with the two-tier allowlist:
    - **Tier 1 path exemptions:** Check `relPath` against patterns: `*.test.*`, `*.spec.*`, `*/env.ts`, `*/instrumentation.ts`, `*.config.*`, `scripts/`, `*/middleware.ts`, `*/realtime/`
    - **Tier 2 content exemptions:** Skip lines matching `process\.env\.NEXT_PUBLIC_` or `process\.env\.NODE_ENV`
    - **Tier 3 suppress:** Skip lines containing `// ci-allow-process-env`
    - **Detection regex:** `/process\.env\.\w+/` (must have a property access, not bare `process.env`)
    - Return `CheckResult[]` with `check: 'process-env'` for each violation
  - Notes: Scan only `.ts` and `.tsx` files. Use `collectTsFiles()` from types.ts. One violation per line (not per file).

- [x] **Task 5: Create server-only scanner**
  - File: `scripts/ci-checks/check-server-only.ts` (new)
  - Action: Implement `scanMissingServerOnly(rootDir: string): CheckResult[]`:
    - Collect files matching directory conventions:
      - `apps/*/src/services/**/*.ts` (excluding `*.test.*`, `index.ts`)
      - `apps/*/src/server/**/*.ts` (excluding `*.test.*`, `realtime/**`, `seed/**`)
      - `packages/auth/src/**/*.ts` (excluding `*.test.*`, `types.ts`, `index.ts`, `api-error.ts`, `redis.ts`, `session-cache.ts`)
    - For each file, check if first 5 lines contain `import "server-only"` or `import 'server-only'`
    - **Suppress:** If any of the first 5 lines contains `// ci-allow-no-server-only`, skip the file (documented exception for standalone-shared files)
    - If missing (and not suppressed), report as `CheckResult` with `check: 'server-only'`, `line: 1`, `match: 'missing import "server-only"'`
  - Notes: Only check first 5 lines (the import should be at the top). This is a file-level check, not line-level. Portal's `event-bus.ts` is under `apps/portal/src/services/` and intentionally omits `server-only` (standalone-shared) — add `// ci-allow-no-server-only — shared with standalone server` to its first lines.

- [x] **Task 6: Create composable entry point**
  - File: `scripts/ci-checks/index.ts` (new)
  - Action: Create CLI entry point that:
    1. Imports all three `scan*()` functions
    2. Runs all three against `process.cwd()`
    3. Groups results by `check` field
    4. Prints grouped output with headers (e.g., `❌ process-env violations:`)
    5. Prints summary line (e.g., `3 stale-import, 0 process-env, 1 server-only`)
    6. Exits 1 if total violations > 0, exit 0 otherwise
    7. CLI guard: `if (process.argv[1]?.includes("ci-checks"))` (matches both `ci-checks/index.ts` and `ci-checks`)
  - Notes: Use `console.error` for violations (same as existing scanner). Use `console.log` for success.

- [x] **Task 7: Fix existing process.env violations**
  - **Depends on:** Tasks 2-6 (scanner must exist to verify fixes are complete)
  - **Approach:** Run `npx tsx scripts/ci-checks/index.ts` after each batch of fixes to confirm violation count drops. The scanner output is the source of truth — don't rely solely on the investigation list (code may have changed).
  - Files (FIX — import `env` from `@/env` instead):
    - `apps/community/src/services/notification-service.ts` — replace `process.env.NEXT_PUBLIC_APP_URL` → `env.NEXT_PUBLIC_APP_URL`
    - `apps/community/src/server/api/middleware.ts` — replace `process.env.ALLOWED_ORIGINS` → `env.ALLOWED_ORIGINS`, `process.env.MAINTENANCE_MODE` → `env.MAINTENANCE_MODE`, `process.env.SENTRY_DSN` → `env.SENTRY_DSN` (Node runtime, can import @/env)
    - `apps/community/src/app/api/metrics/route.ts` — replace `process.env.METRICS_SECRET` → `env.METRICS_SECRET`
    - `apps/community/src/app/api/auth/verify-session/route.ts` — API route (Node runtime), has ~10 `process.env` reads. Per-line triage:
      - `process.env.NODE_ENV` (x2) → Tier 2 auto-handled, no action needed
      - `process.env.COMMUNITY_URL`, `process.env.AUTH_URL`, `process.env.ALLOWED_ORIGINS`, `process.env.COOKIE_DOMAIN` → replace with `env.*` (verify each exists in env schema)
      - `process.env.AUTH_SECRET` (x2), `process.env.SESSION_TTL_SECONDS` → replace with `env.*` (used for JWT decode at call time, not module load — safe to import @/env)
      - If any env var is missing from schema, add it before replacing
    - `apps/portal/src/app/[locale]/page.tsx` — Server Component (Node runtime). Uses `process.env.COMMUNITY_URL` and `process.env.NEXTAUTH_URL`. **Portal has no `src/env.ts` — creating one is out of scope for this spec.** Add `// ci-allow-process-env — portal env.ts not yet created (VD-6)` suppress comment to both lines instead. Track portal env.ts creation as velocity-debt VD-6.
  - Files (SUPPRESS — add `// ci-allow-process-env` with reason on same line):
    - `apps/portal/src/lib/redis.ts` — `// ci-allow-process-env — shared with standalone server`
    - `apps/portal/src/services/event-bus.ts` — `// ci-allow-process-env — shared with standalone server`
    - `apps/community/src/lib/logger.ts` — add `// ci-allow-process-env — shared with standalone realtime server` to the `process.env.LOG_LEVEL` line only (line ~53). `process.env.NODE_ENV` (line ~54) is Tier 2 auto-exempt — no annotation needed.
    - `apps/community/src/server/seed/admin-seed.ts` — `// ci-allow-process-env — seed script, env validation fails outside Next.js`
    - `packages/db/src/queries/posts.ts` — `// ci-allow-process-env — @igbo/db can't import app-level @/env (VD: parameter injection)`
  - Notes: Check `apps/community/src/env.ts` and `apps/portal/src/env.ts` schemas before fixing — some env vars (`METRICS_SECRET`, `MAINTENANCE_MODE`) may need to be added to the schema first.

- [x] **Task 8: Fix existing server-only violations**
  - **Depends on:** Tasks 2-6 (scanner must exist to verify fixes are complete)
  - Files:
    - `apps/community/src/services/message-service.ts` — add `import "server-only";` as first import
    - `apps/community/src/services/video-service.ts` — add `import "server-only";` as first import
  - Notes: These are clear violations — both are server-only services that should have the import.

- [x] **Task 9: Write scanner unit tests**
  - **Depends on:** Tasks 2-8 (scanners built AND violations fixed — canary test requires clean codebase)
  - File: `apps/community/ci-checks.test.ts` (new)
  - Action: Create test suite using existing fixture pattern (mkdtempSync + createFile helper):

    **Stale import tests (migrated from ci-stale-import-scanner.test.ts, 8 existing tests):**
    - Update imports to point to `../../scripts/ci-checks/check-stale-imports`
    - Adapt assertions from `string[]` to `CheckResult[]`
    - Keep all 7 existing test cases

    **process.env scanner tests (6 new tests):**
    1. Flags `process.env.SECRET` in a service file → violation
    2. Allows `process.env.SECRET` in a test file → Tier 1 path exempt
    3. Allows `process.env.SECRET` in env.ts → Tier 1 path exempt
    4. Allows `process.env.NEXT_PUBLIC_FOO` in any file → Tier 2 content exempt
    5. Allows `process.env.NODE_ENV` in any file → Tier 2 content exempt
    6. Allows `process.env.SECRET // ci-allow-process-env` → Tier 3 suppress

    **server-only scanner tests (6 new tests):**
    1. Flags service file without `import "server-only"` → violation
    2. Passes service file with `import "server-only"` → clean
    3. Skips test files in service directory → exempt
    4. Skips files under `realtime/` → exempt
    5. Skips `index.ts` barrel exports → exempt
    6. Skips file with `// ci-allow-no-server-only` in first 5 lines → suppress

    **Integration canary (1 new test):**
    - Run all three scanners against the actual repo root (`resolve(__dirname, "../..")`)
    - Assert zero violations with descriptive failure message:
      ```typescript
      const results = [...scanForStaleImports(ROOT), ...scanDirectProcessEnv(ROOT), ...scanMissingServerOnly(ROOT)];
      expect(results, `CI checks found ${results.length} violation(s). Run: npx tsx scripts/ci-checks/index.ts`).toEqual([]);
      ```
    - Confirms codebase is clean after all fixes

  - Notes: Total ~21 tests (8 migrated + 6 new + 6 new + 1 canary). Fixture tests use `beforeEach`/`afterEach` tmpdir pattern. Canary uses real repo root.

- [x] **Task 10: Delete old scanner files**
  - File: `scripts/check-stale-imports.ts` (delete)
  - File: `apps/community/ci-stale-import-scanner.test.ts` (delete)
  - Notes: Only delete after Tasks 3 and 9 are complete and tests pass.

- [x] **Task 11: Update CI workflow**
  - File: `.github/workflows/ci.yml`
  - Action: Replace line 76 (`run: npx tsx scripts/check-stale-imports.ts`) with:
    ```yaml
    - name: Run CI checks (stale imports, process.env, server-only)
      run: npx tsx scripts/ci-checks/index.ts
    ```
  - Notes: Step name updated to reflect expanded scope. Same position in lint job (after turbo lint, before prettier).

- [x] **Task 12: Document remaining skipped tests**
  - File: No file changes — documentation-only
  - Action: Verify and document the following skipped test status:
    - **Lua integration tests (10):** Confirm running in CI with REDIS_URL. If running → remove from retro's "skipped" count.
    - **Redis eventbus test (1):** Confirm running in CI with REDIS_URL. If running → remove from retro's count.
    - **SSO integration tests (6):** Stays skipped — decision trigger: "when staging pipeline with both apps is available"
    - **E2E accessibility/keyboard tests (6):** Stays skipped — decision trigger: "when CI has seeded database + running app"
    - Update sprint-status.yaml with final skipped test count
  - Notes: Consider removing `--passWithNoTests` from `packages/integration-tests/package.json` if Redis tests are confirmed running (flag masks silent failures).

### Acceptance Criteria

- [x] **AC 1:** Given a `.ts` file under `apps/community/src/services/` containing `process.env.MY_SECRET` without a suppress comment, when the CI checks scanner runs, then it reports a `process-env` violation with file path, line number, and matched line.

- [x] **AC 2:** Given a `.test.ts` file containing `process.env.MY_SECRET`, when the CI checks scanner runs, then no violation is reported (Tier 1 path exempt).

- [x] **AC 3:** Given any `.ts` file containing `process.env.NEXT_PUBLIC_APP_URL`, when the CI checks scanner runs, then no violation is reported (Tier 2 content exempt).

- [x] **AC 4:** Given a `.ts` file containing `const url = process.env.REDIS_URL; // ci-allow-process-env`, when the CI checks scanner runs, then no violation is reported (Tier 3 suppress).

- [x] **AC 5:** Given a `.ts` file under `apps/community/src/services/` that does NOT contain `import "server-only"`, when the CI checks scanner runs, then it reports a `server-only` violation.

- [x] **AC 6:** Given a `.ts` file under `apps/community/src/services/` that contains `import "server-only"` in the first 5 lines, when the CI checks scanner runs, then no violation is reported.

- [x] **AC 7:** Given a `.ts` file under `apps/community/src/server/realtime/`, when the CI checks scanner runs, then the `server-only` check skips it (realtime exemption).

- [x] **AC 8:** Given the full codebase after all fixes in Tasks 7-8, when `npx tsx scripts/ci-checks/index.ts` runs, then it exits with code 0 and prints "✅ All CI checks passed."

- [x] **AC 9:** Given the CI test job runs with `REDIS_URL=redis://localhost:6379`, when the Lua integration tests execute, then all 10 tests pass (not skipped).

- [x] **AC 10:** Given the CI test job runs with `REDIS_URL=redis://localhost:6379`, when the Redis eventbus integration tests execute, then the live Redis namespace test passes (not skipped).

- [x] **AC 11:** Given a new stale import `from "@/db/queries"` in `apps/community/src/`, when the CI checks scanner runs, then it reports a `stale-import` violation (backward compatibility with migrated scanner).

- [x] **AC 12:** Given the CI lint job, when the CI checks step runs, then stale-import, process-env, and server-only checks all execute in a single invocation with grouped output.

## Additional Context

### Dependencies

- **No new npm packages required.** All scanners use Node.js built-in `fs`, `path` modules (same as existing scanner).
- **Existing CI infrastructure:** Redis service already in test job (P-0.6). No new CI services needed.
- **env.ts schema:** Some process.env fixes (Task 7) may require adding env vars to `apps/community/src/env.ts` or `packages/config/src/env.ts` if they aren't already in the schema (e.g., `METRICS_SECRET`, `MAINTENANCE_MODE`). Check schema before fixing.

### Testing Strategy

**Unit tests (apps/community/ci-checks.test.ts):**
- 7 migrated stale import tests (existing, adapted for CheckResult)
- 6 new process.env scanner tests (Tier 1/2/3 coverage)
- 5 new server-only scanner tests (service dir, test file skip, realtime skip, index skip)
- 1 integration canary (run all scanners against actual repo, assert 0 violations)
- **Total: ~21 tests**

**Manual verification:**
- Run `npx tsx scripts/ci-checks/index.ts` locally — expect 0 violations after fixes
- Trigger CI pipeline — confirm lint job passes with new scanner, test job runs Redis-dependent tests

**Regression:**
- All existing tests continue to pass (process.env fixes should not change runtime behavior — just import source)
- Stale import detection remains identical (migrated, not rewritten)

### Validation Scenarios (SN-2)

1. **Scanner catches new violation:** Temporarily add `process.env.TEST_SECRET` to a service file. Run scanner. Verify it's caught. Remove the line.
   - Evidence: Scanner output showing the violation with file:line format.

2. **Scanner respects suppress comment:** Add `process.env.TEST_SECRET; // ci-allow-process-env` to a file. Run scanner. Verify it passes.
   - Evidence: Scanner output showing 0 violations.

3. **CI pipeline green:** Push branch, verify lint job passes with new scanner step, test job runs Lua + Redis tests.
   - Evidence: CI run URL showing all jobs green, turbo summary showing test counts.

4. **Backward compatibility:** Temporarily add `from "@/db/queries"` import to a community source file. Run scanner. Verify stale-import check catches it.
   - Evidence: Scanner output showing stale-import violation.

### Execution Dependency Chain

```
Task 1 (verify Redis) ─── independent, do first
  │
Tasks 2→3→4→5→6 (build scanner infrastructure, sequential)
  │
  ├── Run scanner against codebase (get actual violation list)
  │
Tasks 7+8 (fix violations, informed by scanner output)
  │
Task 9 (write tests — scanner exists AND codebase is clean)
  │
Tasks 10→11 (cleanup old files, update CI)
  │
Task 12 (documentation)
```

### Velocity-Debt Items Created

| Item | Decision Trigger |
|------|-----------------|
| **VD-5: `posts.ts` accepts S3 URL via process.env** | Trigger: Second query file in @igbo/db needs env access → refactor to parameter injection |
| **VD-6: Portal `env.ts` not yet created** | Trigger: P-1.1A (portal schema foundation) — create `apps/portal/src/env.ts` with `@t3-oss/env-nextjs`, then convert portal suppress comments to proper env imports |

### Notes

- Structural debt items addressed: SD-3 (env guards, server-only CI enforcement) and SD-4 (skipped tests).
- Investigation revealed Redis already in CI (P-0.6) — AI-5 scope reduced to verification.
- All INVESTIGATE items resolved: 2 FIX (verify-session, portal/page.tsx), 1 SUPPRESS (admin-seed.ts), 1 auto-handled (service-health.ts Tier 2).
- `posts.ts` in @igbo/db suppressed — velocity-debt VD-5 for proper parameter injection.
- Consider removing `--passWithNoTests` from `packages/integration-tests/package.json` after verifying Redis tests run.
- **Risk:** `MAINTENANCE_MODE` is NOT in the env schema. Must add to `apps/community/src/env.ts` serverEnvSchema (optional string) before replacing in middleware.ts. `METRICS_SECRET` — verify in schema before replacing. Adding env vars to the schema is minor scope expansion, not a blocker.
- **Risk:** Canary test can fail if another branch introduces violations and merges first. This is desired behavior — the canary catches it. Descriptive failure message tells dev what to do.
