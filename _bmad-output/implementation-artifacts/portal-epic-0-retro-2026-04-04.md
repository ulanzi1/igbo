# Portal Epic 0 Retrospective — Monorepo Migration & Portal Foundation

**Date:** 2026-04-04
**Facilitator:** Bob (Scrum Master)
**Participants:** Bob (SM), Alice (PO), Winston (Architect), Charlie (Senior Dev), Dana (QA), Elena (Junior Dev), Dev (Project Lead)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories Completed | 9/9 (P-0.1 through P-0.6, including sub-stories) |
| Tests at Epic Start | 4,795 passing + 10 skipped |
| Tests at Epic End | 5,203 passing + ~17 skipped |
| Net New Tests | +408 (P-0.1: 61, P-0.2A: 28, P-0.2B: 29, P-0.3A: 32, P-0.3B: 59, P-0.3C: 36, P-0.4: 36, P-0.5: 35, P-0.6: 114) |
| Review Findings | ~33 across 6 reviewed stories (all fixed) |
| New DB Tables | 0 (infrastructure epic — portal schema comes in Epic 1) |
| Migrations | 2 (0049_portal_roles enum extension, 0050_seed_portal_roles auth_roles rows) |
| New Shared Packages | 3 (@igbo/config, @igbo/db, @igbo/auth) |
| New Apps | 1 (apps/portal — fully scaffolded) |
| Agent Model | claude-sonnet-4-6 for all stories |
| Production Incidents | 0 (not yet deployed) |
| Epic Status | **Complete. Deployment blocked by Docker build issue (CP-1).** |

### Stories Delivered

- **P-0.1 — Monorepo Structure & @igbo/config** — Turborepo + pnpm workspaces, community app moved to `apps/community/`, @igbo/config extracted (env schemas, constants, Redis key utility). 5 review findings. +61 tests (22 config + 39 community).
- **P-0.2A — @igbo/db Extraction (Read Layer)** — 37 schema files + 40 query files extracted to `packages/db/`. Proxy singleton + factory pattern for db connection. 229 source files + 183 test files updated via codemod. tsc --build for 80+ entry points. +28 tests.
- **P-0.2B — Migration System & Journal** — 49 SQL migrations moved to @igbo/db. Timestamp-based naming for new migrations. Auto-idx `sync-journal.ts` script with `--check` CI gate. 4 review findings. +29 tests.
- **P-0.3A — @igbo/auth Extraction** — Auth.js config, session cache, admin-auth, permissions extracted. Injection pattern: `initAuthRedis()`, `setPermissionDeniedHandler()`. Portal roles migration (JOB_SEEKER, EMPLOYER, JOB_ADMIN). 7 review findings. +32 tests.
- **P-0.3B — Cross-Subdomain SSO** — Apex-domain cookie (`COOKIE_DOMAIN`), CSRF allow-list (`ALLOWED_ORIGINS`), portal-role implementation with `activePortalRole` in JWT/session. Portal auth route + instrumentation. 5 review findings. +59 tests.
- **P-0.3C — Safari ITP Compatibility** — `verify-session` redirect endpoint, portal middleware ITP refresh with `_itp_refresh` loop prevention, `SESSION_UPDATE_AGE_SECONDS` (1h default) for frequent cookie refresh. 6 review findings (2 critical). +36 tests.
- **P-0.4 — Portal App Scaffold & Navigation** — Tailwind v4 CSS-first, shadcn/ui (new-york, copied), next-intl `Portal.*` namespace, role-aware top/bottom nav, `use-active-portal-role` hook, bidirectional navigation (community ↔ portal). 6 review findings. +36 tests.
- **P-0.5 — CI Pipeline & Cross-App Test Gates** — Selective `--affected` testing for PRs, full suite on main push, broad-impact file override, quality-gate fail-fast job, stale import scanner, per-app build artifacts. 4 review findings. +35 tests.
- **P-0.6 — Redis & Event Bus Foundation** — Shared event types in @igbo/config/events (`BaseEvent` with eventId/version/timestamp), portal Redis client (3 instances), portal EventBus with lazy injection, portal event-bridge for cross-app events, `/portal` Socket.IO namespace, CORS multi-origin, REALTIME_PORT 3001→3002. 5 review findings. +114 tests.

---

## Epic 12 Action Items — Follow-Through

Portal Epic 0 is the first portal epic. The most recent community retro was Epic 12 (2026-03-27), which established 4 Structural Non-Negotiables (SN-1 through SN-4).

| # | Item | Status | Evidence |
|---|------|--------|----------|
| SN-1 | Done = Flow Verified | **Partial** | Validation scenarios added to all P-0 story specs (improvement). But proof-of-execution not enforced as gate — verification evidence was mostly "test output" and "grep showing zero hits," not flow demonstrations. |
| SN-2 | Executable Validation Scenarios | **Applied** | All 9 stories had validation scenarios sections. Improvement from Epic 12 where these were absent. |
| SN-3 | Integration Layer Testing (Missing Middle) | **Partial** | `packages/integration-tests/` created with SSO flow tests and cross-app smoke tests (17 tests). Gap: most integration tests require live servers and are skipped in CI. |
| SN-4 | Flow Ownership | **Applied** | Each story had a Flow Owner section. Solo developer context means ownership is implicit. |

**Result: 0/4 fully completed. 2 partially applied. 2 applied in spirit.**

**Root cause:** SN-1 and SN-3 require real environment verification, which is blocked by Docker deployment issue. SN-2 and SN-4 were adopted as spec conventions. The structural enforcement gap (making these gates, not guidelines) persists.

---

## What Went Well

1. **9/9 stories delivered with zero regressions.** Full monorepo migration — 3 shared packages extracted, portal scaffolded, SSO working, CI pipeline operational — and the community platform never broke. 408 net new tests added.

2. **Repeatable extraction pattern established.** Config → DB → Auth extraction followed a consistent sequence: codemod imports, update Vitest aliases, run full suite, grep for stragglers. By P-0.3A, the pattern was second nature.

3. **Codemod approach scaled to massive blast radius.** P-0.2A migrated 229 source files + 183 test files via bash script. P-0.3A updated ~165 test mock files. The pattern (script → run → grep → fix outliers → verify) proved reliable.

4. **Cross-subdomain SSO solved including Safari ITP.** A genuinely hard problem — cookie domain sharing, CSRF cross-origin, Safari's 7-day ITP cookie cap — solved with redirect-based refresh and loop prevention.

5. **CI pipeline with selective testing saves compute.** `--affected` flag skips unchanged app tests on PRs. Broad-impact file detection overrides for safety. Quality-gate fail-fast prevents wasted build time.

6. **Test discipline maintained throughout.** Zero pre-existing failures throughout all 9 stories. Each package has its own vitest config, test suite, and alias strategy. Vitest regex alias pattern for @igbo/db's 80+ subpaths was a key innovation.

7. **Shared event type contracts established.** `@igbo/config/events` defines `BaseEvent` envelope (eventId, version, timestamp) and portal event map. Cross-app event contracts are typed and versioned from day one.

---

## Challenges

1. **~33 review fixes across 6 stories — consistent systemic signal.** Average ~5.5 fixes per reviewed story. Repeating categories: stale imports missed by codemod, missing env var guards, type safety gaps, test coverage blind spots, wiring not implemented despite spec describing it. Review is catching issues that should be prevented.

2. **Patterns discovered during execution, not predefined.** Injection pattern (initAuthRedis, setPermissionDeniedHandler, setPublisher) reinvented 3 times with slight API variations. Vitest alias strategy, server-only handling, test mock conventions — all emerged organically. Works with strong engineers and tight feedback loops; won't scale.

3. **P-0.3C Safari ITP had critical review finding.** The ITP redirect logic wasn't actually implemented in the first pass despite the story being marked as complete and tests passing. Core mechanism was missing. This is the most severe instance of the spec-implementation gap.

4. **"Done = Flow Verified" partially adopted.** Validation scenarios exist in specs (improvement from Epic 12). But proof-of-execution is not enforced — most verification evidence is test output, not demonstrated flows. The gap between "defined what to verify" and "enforced verification" remains open.

5. **Docker deployment blocked.** CI is green, all tests pass, but `docker compose build` fails due to pnpm workspace resolution in the multi-stage build. Application logic is solid; build pipeline has a gap. Connects to Epic 12 lesson: "tested as code artifact" ≠ "actually works."

6. **Silent divergence accumulating.** Copied shadcn/ui components (no @igbo/ui), 17 skipped tests (some since Epic 8), slight pattern variations between packages — each individually acceptable, but collectively trending toward drift without explicit decision triggers.

---

## Key Lessons Learned

### Lesson 1 — We're converging on solutions, not struggling randomly

The injection pattern, codemod approach, stale import scanner, test mock conventions — these aren't isolated tricks. They're our system naturally converging toward a framework for working in a monorepo at scale. The signal is strong: the system is ready to solidify into standards.

### Lesson 2 — Discover → Standardize → Enforce → Reuse

We're currently stuck at "Discover → Use → Move On." Patterns are used but not promoted to first-class concepts. They live in dev notes and memory, discoverable only after mistakes. The lifecycle gap: standardization and enforcement are missing steps.

### Lesson 3 — Three pattern tiers

- **Architectural Patterns** (Winston's area): Injection via setter, package boundaries, event contracts. Documented once, treated as default unless justified otherwise.
- **Operational Patterns** (Charlie's area): Codemod → grep → edge-case sweep → full test. Checklists, not docs. Execution recipes.
- **Enforcement Patterns** (system-level): Stale import scanner, future lint rules (env, server-only, mocks). Automated and unavoidable.

### Lesson 4 — "Temporary" needs a decision trigger

Velocity-debt (acceptable, time-bound) vs structural-debt (dangerous, compounding) must be distinguished. Every temporary decision needs: what we're doing now, and when exactly we revisit. Without triggers, "temporary" becomes default without anyone noticing.

### Lesson 5 — "Second time = standardize"

If we implement a pattern twice, it must be frozen and named. This single rule would have: frozen the injection pattern after P-0.3A, unified test mocks after the second package extraction, and avoided drift across packages.

### Lesson 6 — Review fixes are a signal to eliminate failure modes, not catch them faster

The 33 review fixes aren't a review problem — they're a development system problem. The job is to convert repeatable review findings into automated checks (CI enforcement), checklists (operational patterns), and reference files (test conventions).

---

## Technical Debt

### Velocity-Debt (acceptable, time-bound)

| Item | Decision Trigger |
|------|-----------------|
| **VD-1: Copied shadcn/ui in portal** (no @igbo/ui) | Trigger: 3+ components duplicated across apps → create shared package |
| **VD-2: Portal event types are stubs** (IDs only) | Trigger: P-1.1A schema exists → enrich event payloads |
| **VD-3: Community eventbus-bridge portal handlers are placeholders** | Trigger: First portal event actually emitted in production |
| **VD-4: Community Redis keys not migrated to createRedisKey()** | Trigger: Second app (portal) reads community Redis keys directly |

### Structural-Debt (must fix before scale)

| Item | Status |
|------|--------|
| **SD-1: Inconsistent injection patterns** (3 variations) | Must standardize in Playbook before Epic 1 |
| **SD-2: Test mock conventions vary per package** | Must standardize via reference files before Epic 1 |
| **SD-3: No CI enforcement for env guards, server-only usage** | Must add before Epic 1 (AI-3) |
| **SD-4: 17 skipped tests carried across multiple epics** | Must resolve or delete (AI-5) |
| **SD-5: Docker build broken** (pnpm workspace in container) | BLOCKER — must fix immediately (CP-1) |

---

## Action Items

### Process Improvements

**AI-1: Create Monorepo Playbook v1**
- Owner: Winston (Architect) + Charlie (Senior Dev)
- Scope: 2-3 pages — injection pattern (frozen API), test mocking per package, server-only rules, migration checklist, "second time = standardize" rule, decision triggers template
- Success criteria: New developer can follow it without reading story dev notes
- Validation: Elena does blind walkthrough of at least one section before Epic 1 starts

**AI-2: Standardize test patterns — one reference file per package**
- Owner: Dana (QA Engineer)
- Scope: `_example.test.ts` in @igbo/db/queries, @igbo/auth, apps/portal, apps/community (4 files). Each demonstrates correct mock pattern, alias usage, server-only handling.
- Success criteria: Copying reference file and renaming produces a passing test skeleton

**AI-3: Convert top 3 repeat review issues into CI enforcement**
- Owner: Charlie (Senior Dev)
- Scope: (1) Extend stale import scanner, (2) env validation guard check, (3) server-only usage audit
- Success criteria: CI fails on same issues review currently catches manually

**AI-4: Introduce velocity-debt vs structural-debt labeling**
- Owner: Bob (Scrum Master)
- Scope: Label all existing debt items (see Technical Debt section). Add to Playbook: every new debt item must be labeled with type and decision trigger.
- Success criteria: No unlabeled "TODO" or "deferred" in new code

**AI-5: Resolve or delete long-carried skipped tests**
- Owner: Dana (QA Engineer)
- Scope: 10 skipped Lua integration tests (since Epic 8) + 7 skipped integration tests requiring live servers
- Rule applied: "Cannot carry skipped tests across 2 epics"

**AI-6: Audit Tiptap community dependencies before P-1.3A**
- Owner: Charlie (Senior Dev)
- Scope: Map file upload hooks, sanitization pipeline, i18n, image handling. Produce "what to copy, what to rewire" checklist.
- Success criteria: P-1.3A story spec includes explicit dependency map

### Epic 1 Preparation Tasks

**PREP-1: Migration runbook**
- Owner: Charlie (Senior Dev)
- Scope: First timestamp migration procedure — create SQL, run sync-journal, verify schema, rollback test
- Gate: Must exist before P-1.1A starts

**PREP-2: DensityContext definition**
- Owner: Winston (Architect)
- Scope: 5-6 lines — what it is, three levels (Comfortable/Compact/Dense), default per role, React context API, how UI consumes it
- Gate: Must exist before P-1.1A UI scaffolding

**PREP-3: "First implementation defines the standard" rule**
- Owner: Bob (Scrum Master)
- Scope: Mark P-1.1A (schema), P-1.1B (role switcher), P-1.3A (Tiptap) as pattern-establishing in story specs
- Gate: Applied to first 3 story specs

**PREP-4: Portal test infrastructure validation**
- Owner: Dana (QA Engineer)
- Scope: Verify Vitest config, all shared package aliases, reference test file in place
- Gate: Must be done before any P-1 story writes tests

**PREP-5: Playbook sanity check (Elena blind walkthrough)**
- Owner: Elena (Junior Dev)
- Scope: Pick one Playbook section, follow it without help. If stuck → Playbook is incomplete.
- Success criteria: "A new dev can execute without asking questions"

### Critical Path

| Priority | Item | Owner | Blocker? |
|----------|------|-------|----------|
| 1 | **CP-1: Fix Docker build** (pnpm workspace) | Dev | YES — nothing deployable |
| 2 | **Monorepo Playbook v1** | Winston + Charlie | Gate for P-1.1A |
| 3 | **Test reference files** | Dana | Gate for any P-1 test |
| 4 | **Migration runbook** | Charlie | Gate for P-1.1A schema |
| 5 | **DensityContext spec** | Winston | Gate for P-1.1A UI |
| 6 | **Playbook sanity check** | Elena | Gate for P-1.1A start |

---

## Story Sequencing for Epic 1

**Do NOT parallelize immediately.** First 3 stories are pattern-establishing:

1. **P-1.1A** (Schema Foundation + Role Model) — First real timestamp migration, portal DB namespace. Establishes schema and migration patterns.
2. **P-1.1B** (Role Switcher + Portal Navigation) — UX foundation. Alice validates before proceeding.
3. **P-1.3A** (Job Posting Creation with Rich Text) — First complex component port (Tiptap). Tiptap audit (AI-6) informs this.

After these 3 are solid, remaining stories (P-1.2, P-1.3B, P-1.4, P-1.5, P-1.6, P-1.7) can parallelize.

---

## Next Steps

1. **Fix Docker build (CP-1)** — Immediate, blocker
2. **Execute P-1 Zero Step** — Playbook + test refs + migration runbook + DensityContext + Elena walkthrough
3. **Begin P-1.1A** as first pattern-establishing story
4. **Sequence P-1.1A → P-1.1B → P-1.3A** before parallelizing

---

## Retrospective Meta-Observation

This retrospective surfaced a key insight: **Portal Epic 0 succeeded through strong engineering and tight feedback loops, but the method of success doesn't scale.** The patterns discovered during execution must be promoted from tribal knowledge to enforced standards before Epic 1. The "P-1 Zero Step" — a short preparation period focused on standardization, not feature delivery — is the mechanism to close this gap.

The team's engineering capability is not in question. The question is whether the *system* can reproduce what the *engineers* discovered. That's what the Playbook, reference files, CI enforcement, and decision triggers are designed to ensure.
