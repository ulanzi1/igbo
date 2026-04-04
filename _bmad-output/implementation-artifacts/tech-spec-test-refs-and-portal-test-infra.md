---
title: 'Test Reference Files & Portal Test Infra Validation'
slug: 'test-refs-and-portal-test-infra'
created: '2026-04-04'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [vitest ^4.1, typescript ^5, testing-library ^16, jsdom ^28, pnpm workspaces]
files_to_modify:
  - packages/auth/vitest.config.ts
  - packages/auth/src/test-utils/server-only.ts → packages/auth/src/test/mocks/server-only.ts
  - apps/portal/vitest.config.ts
  - apps/portal/package.json
  - packages/db/src/queries/_example.test.ts (NEW)
  - packages/auth/src/_example.test.ts (NEW)
  - apps/portal/src/_example.test.ts (NEW)
  - apps/community/src/_example.test.ts (NEW)
code_patterns:
  - '@igbo/auth uses regex aliases for @igbo/config and @igbo/db — gold standard'
  - 'Portal uses enumerated @igbo/config aliases (fragile, 3 subpaths only)'
  - '@igbo/db uses enumerated @igbo/config aliases (fragile, 9 subpaths)'
  - 'Community uses enumerated @igbo/config aliases (fragile, 9 subpaths)'
  - 'server-only mock: identical no-op export {} in all packages'
  - 'Auth mock path: src/test-utils/server-only.ts (inconsistent with others)'
test_patterns:
  - '@igbo/db: vi.mock("server-only"), vi.mock("../index" for db), vi.mock("../schema/*" for columns), vi.clearAllMocks in beforeEach'
  - '@igbo/auth: vi.mock("server-only"), vi.mock("./config" for auth/handlers/signIn/signOut), mockAuth fn wrapping, vi.clearAllMocks'
  - 'Portal: @vitest-environment node, mock @igbo/auth + @igbo/config/env, simple service test'
  - 'Community: vi.mock("@/env"), vi.mock("@igbo/db"), vi.mock("@/lib/redis"), dynamic await import("./route"), vi.clearAllMocks'
---

# Tech-Spec: Test Reference Files & Portal Test Infra Validation

**Created:** 2026-04-04

## Overview

### Problem Statement

No copyable test skeletons exist per package. Developers must reverse-engineer mock patterns, alias configurations, and `server-only` handling from scattered existing tests. Portal's Vitest config uses fragile enumerated aliases for `@igbo/config` (only 3 subpaths hardcoded), meaning new exports silently fail to resolve. The `server-only` mock lives at inconsistent paths (`test-utils/` in @igbo/auth vs `test/mocks/` everywhere else). Portal's `--passWithNoTests` flag can mask test regressions.

### Solution

1. Create one `_example.test.ts` per package (4 files) demonstrating correct mock setup, alias usage, and server-only handling — copyable to bootstrap any new test file.
2. Standardize `server-only` mock path to `test/mocks/server-only.ts` across all packages.
3. Switch portal Vitest aliases from enumerated to regex (matching @igbo/auth's proven pattern).
4. Remove `--passWithNoTests` from portal's test script.
5. Validate: all imports resolve, reference tests run, mocks work correctly.

### Scope

**In Scope:**
- AI-2: One `_example.test.ts` per package (@igbo/db, @igbo/auth, apps/portal, apps/community)
- PREP-4: Portal Vitest config hardening (regex aliases, remove --passWithNoTests)
- Standardize server-only mock path in @igbo/auth (move from `test-utils/` to `test/mocks/`)
- Validation that all reference tests pass and imports resolve

**Out of Scope:**
- Extending `vi-patterns.ts` content (separate concern)
- CI enforcement rules (AI-3 — separate action item)
- Resolving or deleting skipped tests (AI-5 — separate action item)
- Monorepo Playbook creation (AI-1 — separate action item)
- Integration test package changes
- Migrating @igbo/db and apps/community enumerated @igbo/config aliases to regex (same fragility exists but broader blast radius — separate spec if desired)

## Context for Development

### Codebase Patterns

**Vitest alias strategy (current state):**
- `@igbo/auth` vitest.config.ts uses **regex** for `@igbo/config`, `@igbo/db`, and self-reference — proven, auto-resolves new subpaths
- `apps/portal` vitest.config.ts uses **enumerated** aliases for `@igbo/config` (only `env`, `redis`, `events`) but **regex** for `@igbo/db` and `@igbo/auth`
- `packages/db` vitest.config.ts uses **enumerated** aliases for `@igbo/config` (9 subpaths) — no regex
- `apps/community` vitest.config.ts uses **enumerated** aliases for `@igbo/config` (9 subpaths) but **regex** for `@igbo/db` and `@igbo/auth`

**server-only mock (current state):**
- `packages/db/src/test/mocks/server-only.ts` — `export {};`
- `packages/auth/src/test-utils/server-only.ts` — `export {};` (INCONSISTENT path)
- `apps/community/src/test/mocks/server-only.ts` — `export {};`
- `apps/portal/src/test/mocks/server-only.ts` — `export {};`
- All files are identical content. Auth is the only outlier in path.

**Package default environments (as set in each vitest.config.ts):**
- `@igbo/db`: node (explicit)
- `@igbo/auth`: node (explicit)
- `apps/portal`: jsdom (explicit default), node per-file via `// @vitest-environment node`
- `apps/community`: jsdom (explicit default), node per-file via `// @vitest-environment node`

**Characteristic mock patterns per package:**

1. **@igbo/db queries**: Mock `server-only`, mock `../index` (db object with select/update/insert/delete), mock `../schema/*` (column name objects). Use `vi.clearAllMocks()` in `beforeEach`.
2. **@igbo/auth**: Mock `server-only`, mock `./config` (auth fn + handlers/signIn/signOut exports). Wrap auth in `mockAuth` fn for per-test control. Use `vi.clearAllMocks()`.
3. **apps/portal**: `// @vitest-environment node`, mock `@igbo/auth`, mock `@igbo/config/env`. Simple service/utility tests.
4. **apps/community**: `// @vitest-environment node`, mock `@/env`, mock `@igbo/db`, mock `@/lib/redis`. Dynamic `await import("./route")` for route tests.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/auth/vitest.config.ts` | Gold standard regex alias pattern to replicate |
| `packages/auth/src/test-utils/server-only.ts` | File to move → `src/test/mocks/server-only.ts` |
| `apps/portal/vitest.config.ts` | Needs enumerated→regex migration for @igbo/config |
| `apps/portal/package.json` | Remove `--passWithNoTests` from test script |
| `packages/db/src/queries/auth-queries.test.ts` | Canonical @igbo/db query test pattern |
| `packages/auth/src/portal-role.test.ts` | Canonical @igbo/auth injection test pattern |
| `apps/portal/src/services/event-bus.test.ts` | Canonical portal node test pattern |
| `apps/community/src/app/api/health/route.test.ts` | Canonical community route test pattern |

### Technical Decisions

1. **One `_example.test.ts` per package, `node` environment, single pattern.** No jsdom examples — jsdom tests have hundreds of existing examples in the codebase. The reference file solves server-side tests (80% of confusion).
2. **Regex aliases only for portal's @igbo/config.** @igbo/db and community have the same fragility but broader blast radius. Separate spec if desired.
3. **Auth mock directory rename**: `test-utils/` → `test/mocks/`. Only contains `server-only.ts`. No other files to migrate. Vitest alias update required in `packages/auth/vitest.config.ts`.
4. **Reference file structure**: `// @vitest-environment node` directive, 3-line JSDoc comment header (including negative guidance — "don't use this for X"), one describe block, one or two simple passing tests demonstrating the mock pattern.
5. **Remove `--passWithNoTests`**: Portal now has 99 tests. The flag masks regressions. After this spec adds `_example.test.ts`, portal will always have at least 1 test file.
6. **Convert bare `@igbo/config` alias to regex**: The bare alias must use `{ find: /^@igbo\/config$/, replacement: "..." }` (exact-match regex), NOT a string `find`. String aliases do prefix matching in Vite, which could intercept subpath imports before the regex fires. Using regex for both entries (subpath + bare) matches the proven auth config pattern exactly.
7. **Reference file principle — mock setup is real, test body is placeholder**: The mock/import boilerplate at the top of each reference file is the exact correct pattern (copy without changes). The `describe`/`it` blocks use placeholder names and assertions that the developer replaces with their actual code under test. This ensures mocks are correct on copy while making it obvious what to customize.

## Implementation Plan

### Tasks

#### Phase 1 — Infrastructure Fixes (no new tests, zero behavior change)

- [x] Task 1: Move @igbo/auth server-only mock to standardized path
  - File: `packages/auth/src/test-utils/server-only.ts` → `packages/auth/src/test/mocks/server-only.ts`
  - Action: Create full directory path `packages/auth/src/test/mocks/` (note: `src/test/` does not exist yet — create both levels). Copy `server-only.ts` into it (identical content: `export {};` with the existing 3-line comment). Delete `packages/auth/src/test-utils/server-only.ts`. Delete empty `packages/auth/src/test-utils/` directory. Verify the old directory is gone via `ls` or git status.
  - Notes: File content is identical to all other packages' `server-only.ts`. No source files import this directly — it's resolved via vitest alias only.

- [x] Task 2: Update @igbo/auth vitest.config.ts alias for new mock path
  - File: `packages/auth/vitest.config.ts`
  - Action: Change the `server-only` alias replacement from `path.resolve(__dirname, "src/test-utils/server-only.ts")` to `path.resolve(__dirname, "src/test/mocks/server-only.ts")`
  - Notes: This is the only reference to `test-utils/` in the auth package config.

- [x] Task 3: Replace portal enumerated @igbo/config aliases with regex
  - File: `apps/portal/vitest.config.ts`
  - Action: Replace all 4 `@igbo/config` alias entries (1 bare + 3 enumerated subpaths) with exactly 2 regex entries, in this order:
    1. `{ find: /^@igbo\/config\/(.+)$/, replacement: path.resolve(__dirname, "../../packages/config/src/$1") }` (subpath regex — MUST come first)
    2. `{ find: /^@igbo\/config$/, replacement: path.resolve(__dirname, "../../packages/config/src") }` (bare exact-match regex — MUST come second)
    The ordering is critical: Vite resolves aliases in array order. Subpath regex must fire before the bare regex. Both use regex `find` (not string) to prevent Vite's string prefix-matching from intercepting subpath imports. Convert the bare alias from string to regex `{ find: /^@igbo\/config$/ }` to match the auth config's proven pattern.
  - Notes: Matches the exact pattern from `packages/auth/vitest.config.ts` lines 22-28. After this change, any new `@igbo/config/*` export auto-resolves without config changes. Leave all `@igbo/db` and `@igbo/auth` regex aliases unchanged — they already use the correct pattern.

- [x] Task 4: Remove `--passWithNoTests` from portal test script
  - File: `apps/portal/package.json`
  - Action: Change `"test": "vitest run --passWithNoTests"` to `"test": "vitest run"`
  - Notes: Portal has 99 existing tests. The flag was added during scaffold phase when 0 tests existed. Removing it ensures Vitest fails if test discovery breaks.

- [x] Task 5: Run existing test suites — verify zero regressions
  - Action: Run `pnpm --filter @igbo/auth test` and `pnpm --filter @igbo/portal test` to confirm all existing tests still pass after Tasks 1–4.
  - Notes: Only auth and portal configs changed. @igbo/db and community are untouched in Phase 1.

#### Phase 2 — Reference Test Files (4 new files, additive only)

- [x] Task 6: Create `_example.test.ts` for @igbo/db
  - File: `packages/db/src/queries/_example.test.ts` (NEW)
  - Action: Create reference test demonstrating the canonical @igbo/db query test pattern:
    - `// @vitest-environment node`
    - JSDoc header: "Reference test for @igbo/db query tests. Demonstrates: server-only bypass, db mock via ../index, schema column mock. Copy and rename to start a new query test. Not for component/UI tests — those use jsdom."
    - `vi.mock("server-only", () => ({}));`
    - Mock `../index` with db object containing `select`/`update` as `vi.fn()`
    - Mock a placeholder schema `../schema/my-table` with generic column name object (`{ id: "id", name: "name", createdAt: "created_at" }`) — developer replaces with their actual schema import
    - One `describe("example: your feature under test", ...)` block with 2 `it` tests: one demonstrating `db.select` chain mock (`.from().where().limit()` returning `mockResolvedValue`), one demonstrating `db.update` chain mock (`.set().where()` returning `mockResolvedValue`). Test body is placeholder — developer replaces with their actual function under test.
    - `beforeEach(() => { vi.clearAllMocks(); });`
  - Notes: Pattern matches `auth-queries.test.ts`. Keep it under 60 lines.

- [x] Task 7: Create `_example.test.ts` for @igbo/auth
  - File: `packages/auth/src/_example.test.ts` (NEW)
  - Action: Create reference test demonstrating the canonical @igbo/auth injection test pattern:
    - `// @vitest-environment node`
    - JSDoc header: "Reference test for @igbo/auth tests. Demonstrates: server-only bypass, ./config mock (auth injection pattern), mockAuth function for per-test session control. Copy and rename to start a new auth test. IMPORTANT: This file must stay at the src/ root level — the ./config relative mock path breaks if moved to a subdirectory. Not for component/UI tests — those use jsdom."
    - `vi.mock("server-only", () => ({}));`
    - `const mockAuth = vi.fn();`
    - `vi.mock("./config", () => ({ auth: (...args: unknown[]) => mockAuth(...args), handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));`
    - One `describe("example: your feature under test", ...)` block with 2 `it` tests: one demonstrating `mockAuth.mockResolvedValue(session)` for authenticated user, one demonstrating `mockAuth.mockResolvedValue(null)` for unauthenticated. Test body is placeholder — developer replaces with their actual function under test.
    - `beforeEach(() => { vi.clearAllMocks(); });`
  - Notes: Mock setup is real (copy exactly), test body is placeholder (replace everything). Pattern matches `portal-role.test.ts`. Keep it under 50 lines.

- [x] Task 8: Create `_example.test.ts` for apps/portal
  - File: `apps/portal/src/_example.test.ts` (NEW)
  - Action: Create reference test demonstrating the canonical portal server-side test pattern:
    - `// @vitest-environment node`
    - JSDoc header: "Reference test for portal server-side tests. Demonstrates: @vitest-environment node override, @igbo/auth mock, @igbo/config/env import verification. Copy and rename to start a new portal test. Not for component/UI tests — those use the default jsdom environment without the directive."
    - `vi.mock("server-only", () => ({}));`
    - `vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));`
    - One `describe` block with 2 `it` tests: one demonstrating auth mock returns a session, one verifying `@igbo/config/notifications` resolves (dynamic `import("@igbo/config/notifications")` succeeds without error — this subpath was NOT in the old enumerated list, so it proves the regex alias works for new subpaths, validating AC 2)
    - `beforeEach(() => { vi.clearAllMocks(); });`
  - Notes: Deliberately simple — NOT the HMR singleton pattern. Tests the infra (alias resolution) as much as the mock pattern. Keep it under 40 lines.

- [x] Task 9: Create `_example.test.ts` for apps/community
  - File: `apps/community/src/_example.test.ts` (NEW)
  - Action: Create reference test demonstrating the canonical community server-side test pattern:
    - `// @vitest-environment node`
    - JSDoc header: "Reference test for community server-side tests. Demonstrates: @vitest-environment node override, @/env mock, @igbo/db mock, dynamic route import pattern. Copy and rename to start a new route/service test. Not for component/UI tests — those use the default jsdom environment without the directive."
    - `vi.mock("server-only", () => ({}));` (included for consistency with all other reference files — the vitest alias handles this but the explicit mock is belt-and-suspenders and makes the pattern self-documenting)
    - `vi.mock("@/env", () => ({ env: {} }));`
    - `vi.mock("@igbo/db", () => ({ db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() } }));`
    - `vi.mock("./my-module", () => ({ myFunction: vi.fn() }));` (placeholder for the module under test — developer replaces path and exports)
    - One `describe("example: your feature under test", ...)` block with 2 `it` tests: one demonstrating `@igbo/db` mock usage (db.select fluent chain `.from().where()` returning `mockResolvedValue`), one demonstrating dynamic route import (`const { myFunction } = await import("./my-module")` — the module is vi.mock'd above so the dynamic import resolves to the mock). Test body is placeholder — developer replaces with their actual function under test.
    - `beforeEach(() => { vi.clearAllMocks(); });`
  - Notes: Pattern matches `health/route.test.ts` but simplified. Keep it under 50 lines.

#### Phase 3 — Validation

- [x] Task 10: Run full monorepo test suite and verify all reference tests pass
  - Action: Run `pnpm -r test` (all packages). Verify:
    1. All 4 `_example.test.ts` files are discovered and pass
    2. All pre-existing tests still pass (zero regressions)
    3. Portal test count increased (no longer needs `--passWithNoTests`)
    4. Auth tests pass with new mock path
  - Notes: Expected baseline after this spec: current totals + 4 new reference tests (one per `_example.test.ts`, each with 2 `it` blocks = 8 new test cases total).

### Acceptance Criteria

- [ ] AC 1: Given the `@igbo/auth` package, when running `pnpm --filter @igbo/auth test`, then all existing tests pass AND the `server-only` mock resolves from `src/test/mocks/server-only.ts` (not `src/test-utils/`).
- [ ] AC 2: Given the `@igbo/portal` vitest config, when a new `@igbo/config` subpath export is added (e.g., `@igbo/config/newfeature`), then it resolves automatically without adding a new alias entry.
- [ ] AC 3: Given the portal test script, when no test files exist (hypothetically), then `pnpm --filter @igbo/portal test` fails (not silently passes).
- [ ] AC 4: Given `packages/db/src/queries/_example.test.ts`, when a developer copies it and renames to `my-query.test.ts`, then the test skeleton passes without modifications to vitest config or mock imports.
- [ ] AC 5: Given `packages/auth/src/_example.test.ts`, when a developer copies it and renames to `my-feature.test.ts`, then the test skeleton passes without modifications to vitest config or mock imports.
- [ ] AC 6: Given `apps/portal/src/_example.test.ts`, when a developer copies it and renames to `my-service.test.ts`, then the test skeleton passes without modifications to vitest config or mock imports.
- [ ] AC 7: Given `apps/community/src/_example.test.ts`, when a developer copies it and renames to `my-route.test.ts`, then the test skeleton passes without modifications to vitest config or mock imports.
- [ ] AC 8: Given all changes applied, when running `pnpm -r test`, then zero pre-existing tests regress across all packages.
- [ ] AC 9: Given each `_example.test.ts` file, when opened by a developer, then the JSDoc header explains: what patterns the file demonstrates, how to use it (copy + rename), and when NOT to use it (negative guidance).

## Additional Context

### Dependencies

- No external library additions required
- No migrations required
- No new packages required
- Depends on: current passing test suite across all packages (baseline: 5203 passing + ~17 skipped)

### Testing Strategy

- **No separate test files needed** — the 4 reference files ARE the tests. Each `_example.test.ts` both documents the pattern and validates the infrastructure.
- **Regression validation**: Full `pnpm -r test` run after all changes. Any failure = infra change broke something.
- **Portal alias validation**: Task 8's `_example.test.ts` includes a dynamic `import("@igbo/config/notifications")` test — a subpath NOT in the old enumerated list — that proves the regex alias resolves new subpaths correctly. This is a functional test of PREP-4 and directly validates AC 2.

### Validation Scenarios (SN-2)

1. **Auth mock path migration**: After Task 1+2, run `pnpm --filter @igbo/auth test`. Evidence: all 113 auth tests pass. Verify `packages/auth/src/test-utils/` directory no longer exists.
2. **Portal regex alias resolution**: Covered by Task 8's `_example.test.ts` which includes a dynamic `import("@igbo/config/notifications")` test — a subpath NOT in the old enumerated list — permanently validating the regex alias resolves new subpaths correctly. No manual verification needed.
3. **Portal --passWithNoTests removal**: After Task 4, verify `pnpm --filter @igbo/portal test` runs successfully (99+ tests discovered and pass).
4. **Reference file copy-rename**: After Phase 2, copy `apps/portal/src/_example.test.ts` to `apps/portal/src/_example-copy.test.ts`. Run `pnpm --filter @igbo/portal test`. The copy must pass without any changes. Delete the copy after verification.
5. **Full regression**: After Phase 3, run `pnpm -r test`. All packages pass. Total test count = previous baseline + 8 new test cases (4 files × 2 `it` blocks each).

### Notes

- `packages/auth/src/test-utils/` contains ONLY `server-only.ts` — confirmed safe to delete directory after move
- Portal event-bus.test.ts uses HMR singleton pattern (`vi.resetModules()` + dynamic import) — deliberately NOT used in reference file. Reference demonstrates the simple/common pattern.
- Community `vi-patterns.ts` (500+ lines) documents anti-patterns but is not a copyable skeleton — reference files fill this gap
- The `@igbo/db` and `apps/community` vitest configs also use enumerated `@igbo/config` aliases (same fragility as portal). Left out of scope — portal-first validates the regex approach, then a follow-up spec can migrate the others.
- Each reference file targets < 60 lines. If it's longer than that, it's doing too much.

## Review Notes
- Adversarial review completed
- Findings: 9 total, 2 fixed, 4 skipped (noise), 3 skipped (acceptable/by-design)
- Resolution approach: auto-fix
- F8 fixed: Removed `as never` cast from portal example, used properly shaped session mock
- F9 fixed: Added guiding comment to community example's empty env mock
