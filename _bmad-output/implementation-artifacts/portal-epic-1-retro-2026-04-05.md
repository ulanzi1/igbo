# Portal Epic 1 Retrospective — Job Posting & Company Profiles

**Date:** 2026-04-05
**Facilitator:** Bob (Scrum Master)
**Participants:** Bob (SM), Alice (PO), Winston (Architect), Charlie (Senior Dev), Dana (QA), Elena (Junior Dev), Dev (Project Lead)

---

## Epic Summary

| Metric | Value |
|--------|-------|
| Stories Completed | 9/9 (P-1.1A through P-1.7, including sub-stories) |
| Tests at Epic Start | 5,334 total (~56 portal) |
| Tests at Epic End | 5,954 total (709 portal + 729 @igbo/db + 62 @igbo/config) |
| Net New Portal Tests | +653 (56→709) |
| Review Findings | ~66 across 9 stories (~7.3 avg per story) |
| New DB Tables | 3 (portal_company_profiles, portal_job_postings, portal_applications) |
| New Enums | 3 (employment_type, job_status, application_status) |
| Migrations | 0051–0055 (schema + archived_at + onboarding_completed_at + job_analytics) |
| Technical Debt | 1 new (VD-5: duplicated sanitize.ts), 1 resolved (VD-2: event types enriched) |
| Agent Model | claude-sonnet-4-6 for all stories |
| Production Incidents | 0 (not yet deployed — launch target post-Epic 2 + Epic 3 min viable) |
| Epic Status | **Complete. Codebase stable, clean, patterns held throughout.** |

### Stories Delivered

- **P-1.1A — Portal Schema Foundation & Role Model** — Migration 0051 with 3 portal tables, 3 enums, Drizzle schemas + queries, PORTAL_ERRORS namespace, cross-app trust signal queries, enriched portal event types. 9 review findings. +125 portal tests.
- **P-1.1B — Role Switcher & Portal Navigation** — `useActivePortalRole` hook, RoleSwitcher with DropdownMenuRadioGroup, JWT callback for activePortalRole updates, role-aware top/bottom nav, JOB_ADMIN navigation. 6 review findings. +23 portal tests, +20 auth tests.
- **P-1.2 — Company Profile Creation & Management** — Portal API middleware (`withApiHandler`, `successResponse`/`errorResponse`), logo upload route (S3 + platformFileUploads), company profile CRUD, TrustBadge component, `requireCompanyProfile` gate. 10 review findings. +80 portal tests, +5 db tests.
- **P-1.3A — Job Posting Creation with Rich Text** — Tiptap editor integration, HTML sanitization server-side, salary display with Naira formatting, JobPostingForm with salary toggle, JobPostingCard with status badges, my-jobs dashboard. 10 review findings. +92 portal tests.
- **P-1.3B — Igbo Cultural Context & Bilingual Descriptions** — Cultural context toggles (3 boolean JSONB flags), WAI-ARIA language toggle, locale-aware description display, CulturalContextBadges, cultural context filtering. 6 review findings. +63 portal tests.
- **P-1.4 — Job Posting Lifecycle Management** — Status transition state machine (7 statuses), optimistic locking via updatedAt, active posting limit (5 max), edit with re-review, rejection feedback display, dashboard filter tabs, ClosePostingModal with outcome tracking. 7 review findings. +203 portal tests, +10 db tests.
- **P-1.5 — Job Posting Expiry, Auto-Archive & Templates** — Migration 0053 (archived_at), internal cron routes (expire + archive), Redis-backed expiry warnings, renew flow, 5 hardcoded job templates, TemplateSelector, ExtendPostingModal, expired/archived tabs. 8 review findings. +72 portal tests, +14 db tests.
- **P-1.6 — Employer Onboarding & DensityContext** — 3-step onboarding flow, DensityContext provider with localStorage + SSR guard, role-based density defaults, onboarding step indicator (WAI-ARIA), onboarding_completed_at column. 7 review findings. +58 portal tests, +7 db tests.
- **P-1.7 — Application Analytics & Community Feed Sharing** — Redis-backed view deduplication (24h), analytics dashboard card (views/applications/conversion), community feed sharing with idempotency, employer + public job detail pages, ViewTracker component, share state management. 8 review findings. +88 portal tests.

---

## Portal Epic 0 Action Items — Follow-Through

| # | Item | Status | Evidence |
|---|------|--------|----------|
| AI-1 | Monorepo Playbook v1 | ✅ Completed | `docs/monorepo-playbook.md` — referenced throughout P-1 |
| AI-2 | Test reference files per package | ✅ Completed | `_example.test.ts` in 4 packages |
| AI-3 | Top 3 review issues → CI enforcement | ✅ Completed | Composable CI scanners (stale imports, process.env, server-only) |
| AI-4 | Velocity-debt vs structural-debt labeling | ✅ Completed | All debt labeled in sprint-status with triggers |
| AI-5 | Resolve skipped tests | ✅ Completed | Redis in CI verified; 11 tests now execute |
| AI-6 | Tiptap community dependencies audit | ✅ Completed | Resolved inline during P-1.3A; community TiptapEditor link import bug fixed |
| PREP-1 | Migration runbook | ✅ Completed | `docs/migration-runbook.md` |
| PREP-2 | DensityContext definition | ✅ Completed | `docs/decisions/density-context.md` |
| PREP-3 | "First implementation = standard" rule | ✅ Applied | P-1.1A, P-1.1B, P-1.3A were pattern-establishing |
| PREP-4 | Portal test infrastructure validation | ✅ Completed | Vitest config, aliases, reference files all working |
| PREP-5 | Playbook sanity check (Elena) | ✅ Completed | Elena walkthrough done |
| CP-1 | Fix Docker build | ✅ Completed | pnpm workspace fix |

**Result: 11/11 completed. First time all retro commitments fully executed.**

### P-0 Lesson Application

| Lesson | Applied in P-1? | Evidence |
|--------|-----------------|----------|
| L1: Converging on solutions → standardize | ✅ | Portal API middleware, permissions, error codes standardized from P-1.1A |
| L2: Discover → Standardize → Enforce → Reuse | ⏳ Partial | Standardized: yes. Enforce: CI exists but review still catches ~7 issues/story |
| L3: Three pattern tiers | ✅ | Architectural (injection), operational (codemod), enforcement (CI) all used |
| L4: "Temporary" needs decision trigger | ✅ | VD-5 has explicit trigger documented |
| L5: "Second time = standardize" | ✅ | Tiptap mock, PORTAL_ERRORS namespace both frozen after first use |
| L6: Review fixes → eliminate failure modes | ⏳ Partial | CI catches stale imports, env guards. i18n/a11y/XSS still review-only |

**Gap identified:** We completed the "Standardize" step but didn't close the "Enforce" loop for implicit requirements (i18n, sanitization, accessibility, component availability).

---

## What Went Well

1. **9/9 stories delivered with zero regressions.** Complete employer journey — company creation through analytics and community sharing — with 709 portal tests and clean suite throughout.

2. **P-0 prep sprint fully converted to execution speed.** All 11 action items completed. Monorepo Playbook, test reference files, CI enforcement, migration runbook — all in place before P-1.1A. Elena confirmed Playbook saved real time on P-1.3B (JSONB type pattern found in 30 seconds).

3. **"First Implementation = Standard" rule worked.** P-1.1A (schema), P-1.1B (components), P-1.3A (Tiptap) established patterns that held unchanged through P-1.7. No pattern drift across 9 stories.

4. **Architecture boundaries respected.** Cross-app data flows through `@igbo/db` query functions — no direct schema imports, no cross-origin fetches. Community feed sharing (P-1.7) proved the write path. CI stale import scanner enforces boundaries automatically.

5. **Testing as first-class citizen.** 56→709 portal tests (12x growth). axe-core accessibility assertions in every component test. Three-layer testing (unit/component/integration) consistent across stories. Zero pre-existing failures carried.

6. **Status state machine proved extensible.** Designed in P-1.4 with explicit transitions and optimistic locking. P-1.5 extended it for expiry/archive. P-1.7 used it for share gating. Clean extension without modification — good foundation for P-2.4 application state machine.

7. **Complete P-0 retro follow-through.** 11/11 items done. First time in project history. Validates prep sprint approach as a repeatable practice.

---

## Challenges

1. **Implicit requirements not encoded in the system (4 categories, 1 root cause).** i18n hardcoded strings (4/9 stories), XSS sanitization missed on display (3/9 stories), accessibility issues caught in review (5/9 stories), missing shadcn/ui components mid-implementation (2/9 stories). All are the same class of problem: rules exist in memory and retro documents but not in gates or enforcement.

2. **~66 review findings across 9 stories (~7.3 avg).** Per-story rate similar to P-0 (~5.5/story). Review is consistently catching a predictable volume. Approximately half are implicit requirement gaps (hardcoded strings, missing sanitize, a11y); the other half are genuine design judgment (API patterns, error handling, UX). The first half should be automated; the second half is appropriate review work.

3. **TypeScript sharp edges in 4 stories.** Zod v4 import path (`"zod/v4"` not `"zod"`), JSONB type mismatches (`.$type<>()`), Tiptap mock type casting, `useSession()` hook destructuring (`update` is on hook result, not session data). These are tooling gotchas, not systemic issues — addressed by Playbook documentation.

4. **"Standardize → Enforce" gap persists.** P-0 Lesson 2 identified the lifecycle: Discover → Standardize → Enforce → Reuse. P-1 proved we're strong at Discover and Standardize. The gap is still Enforce — converting known rules into automated gates. This is the same gap from P-0, now with more evidence and a concrete fix.

5. **Role selection gap discovered.** No self-service path for community members to become employers or seekers. Onboarding (P-1.6) assumes the role already exists. Requires direct DB intervention today. Addressed by PREP-D.

6. **End-to-end validation limited.** Employer create+post verified manually. But posting lifecycle beyond `pending_review` couldn't be tested without admin approval (Epic 3 dependency). Public job detail pages, view tracking, community sharing — untested end-to-end. Structurally addressed by PREP-C (Epic 3 stories) and PREP-D (role selection).

---

## Key Lessons Learned

### Lesson 1 — Implicit requirements are a single class of problem requiring a bundled fix

i18n gaps, XSS sanitization misses, accessibility issues, and missing UI components all fall under "requirements that are assumed but not encoded." Solving them individually creates four checklists nobody remembers. Solving them as a class creates two gates (Story Readiness + Dev Completion) and CI enforcement. The bundled fix is: Story Readiness Checklist (Gate 1, SM-enforced) + Dev Completion Checklist (Gate 2, dev-enforced) + CI rules (automated).

### Lesson 2 — "If CI hasn't failed yet, it's not real enforcement"

Writing a CI rule is necessary but not sufficient. The rule must demonstrably catch a real violation before it's considered active. This prevents phantom enforcement — rules that exist in config but never actually block anything.

### Lesson 3 — Prep sprint discipline is a repeatable practice, not a one-time event

P-0 prep → P-1 success is now a proven pattern. The same discipline applied to P-2 prep (AI-7, PREP-A through PREP-D, spikes) will yield the same result. The evidence base is: 11/11 P-0 items completed → 9/9 P-1 stories with zero regressions.

### Lesson 4 — State machine complexity is multiplicative, not additive

One state machine (job postings) is self-contained. Two interacting state machines (postings + applications) create cross-state dependencies that must be explicitly mapped. Terminal vs non-terminal state policy and a state interaction matrix are prerequisites, not nice-to-haves.

### Lesson 5 — Async systems require idempotency as an invariant, not a pattern

"Can this run twice safely?" must be answered YES for every async handler. This is a requirement, not a best practice. Dedup keys must be named, duplicate invocation must be tested, and the Playbook section is titled "Async Safety Requirements" not "Async Safety Patterns." Language matters.

### Lesson 6 — "Build it right" → "Keep it right at scale" is the next capability milestone

Epic 1 proved the team can build a complex, multi-surface system with zero regressions, stable architecture, and high test confidence. Epic 2 will prove whether the system of working scales to dual state machines, async flows, and parallel epic tracks. The prep sprint is the bridge.

---

## Technical Debt

### Velocity-Debt (acceptable, time-bound)

| Item | Decision Trigger |
|------|-----------------|
| **VD-1: Copied shadcn/ui in portal** (no @igbo/ui) | Trigger: 3+ components duplicated across apps |
| **VD-5: Duplicated sanitize.ts** (community + portal) | Trigger: 3rd app needs sanitization |

### Resolved

| Item | Resolution |
|------|-----------|
| **VD-2: Portal event types stubs** | Resolved in P-1.1A — enriched payloads with typed events |

### Structural Debt

No new structural debt added in Epic 1. Clean epic.

---

## Action Items

### Process Improvements

**AI-7: Bundled Implicit Requirements Fix (Story Readiness + Completion Gates + CI)**
- Owner: Bob (SM) — Gate 1 enforcement; Alice (PO) — i18n content; Charlie — Playbook section; Dana — CI rules
- Scope:
  1. Story template updated with mandatory Readiness Checklist (i18n inventory, sanitization points, a11y patterns, component dependencies)
  2. Playbook "Frontend Safety & Readiness" section (Winston sign-off required)
  3. Dev Completion Checklist in PR workflow
  4. CI rules for hardcoded strings in JSX + unsanitized `dangerouslySetInnerHTML`
- Success criteria:
  1. Story template updated AND used in at least 1 real story draft (P-2.1)
  2. Playbook section written AND reviewed (Winston sign-off)
  3. CI rule active AND has failed at least once (locally or in PR) — if it hasn't failed, it's not real enforcement
- Gate: **Blocks Epic 2 start**

**AI-8: TypeScript Gotchas Playbook Section**
- Owner: Charlie (Senior Dev)
- Scope: Zod v4 import (`"zod/v4"`), JSONB `.$type<>()`, Tiptap mock pattern, `useSession()` hook destructuring
- Success criteria: New dev hitting any of these issues finds answer in Playbook within 30 seconds

### Epic 2 Preparation Tasks

**PREP-A: State Interaction Matrix + Terminal State Policy**
- Owner: Winston (Architect), stress-tested by Charlie
- Scope: Cross-state invariant table (job posting status × application status), `TERMINAL_STATES` formal set (`hired`, `rejected`, `withdrawn`), "no external event touches terminal applications" invariant, ownership boundaries between machines
- Gate: Must exist before P-2.4 story spec

**PREP-B: Async Safety Requirements in Playbook**
- Owner: Charlie (Senior Dev), validated by Dana
- Scope: Idempotency as **requirement** (not pattern), dedup key naming convention, three mandatory test cases per async handler (happy path / failure-retry / duplicate invocation), email failure graceful degradation, upload pipeline error states, observability standards
- Gate: Must exist before P-2.5A

**PREP-C: Create Epic 3 Min Viable Stories (P-3.1, P-3.2, P-3.3)**
- Owner: Bob (SM) + Alice (PO)
- Scope: Admin review queue dashboard, approve/reject workflow, rule-based content screening MVP — created and scheduled for parallel track alongside P-2.1–P-2.4
- Gate: Must exist before P-2.5A

**PREP-D: Portal Role Selection — "Choose Your Path"**
- Owner: Charlie (Senior Dev)
- Scope: "Choose Your Path" page (Employer / Seeker) shown when user has no portal roles, `POST /api/v1/portal/role/select` route, auto-approve for employer (default, `platformSettings` key for future admin toggle), middleware/layout gate redirecting no-role users, full test coverage
- Success criteria: Community member can self-service into employer role and enter onboarding without DB intervention
- Gate: **Blocks P-2.1**

### Spikes (Timeboxed 1–2 days each, "thin but concrete")

**SPIKE-1: CV Upload (PDF/DOCX through pipeline)**
- Owner: Elena (Junior Dev)
- Scope: Upload one PDF + one DOCX through pipeline, MIME validation, file stored, basic error handling. Output: Decision + Constraints + Test Strategy
- Gate: Recommended before P-2.2

**SPIKE-2: ATS Drag-and-Drop (interaction + a11y + testability)**
- Owner: Charlie (Senior Dev)
- Scope: Basic kanban with 2–3 columns, drag between columns, keyboard interaction baseline, confirm test strategy (can we simulate drag in Vitest?). Output: Decision + Constraints + Test Strategy
- Gate: Recommended before P-2.9

### Critical Path

| Priority | Item | Owner | Blocker? |
|----------|------|-------|----------|
| 1 | **AI-7: Bundled implicit requirements fix** | Bob/Alice/Charlie/Dana | Blocks P-2.1 |
| 2 | **PREP-D: Portal Role Selection** | Charlie | Blocks P-2.1 |
| 3 | **PREP-A: State interaction matrix** | Winston + Charlie | Blocks P-2.4 |
| 4 | **PREP-B: Async safety requirements** | Charlie + Dana | Blocks P-2.5A |
| 5 | **PREP-C: Epic 3 stories created** | Bob + Alice | Blocks P-2.5A |
| 6 | **SPIKE-1: CV upload** | Elena | Recommended before P-2.2 |
| 7 | **SPIKE-2: ATS DnD** | Charlie | Recommended before P-2.9 |

### Team Agreements

- "If the readiness checklist is incomplete → story cannot be picked up" (Gate 1 rule)
- "Can this run twice safely? → must be YES" (idempotency invariant for all async handlers)
- "Terminal states are immutable by external events" (state machine invariant)
- "If CI hasn't failed yet, it's not real enforcement" (CI validation rule)

---

## Story Sequencing for Epic 2

**Parallel track approach (recommended by Dev):**

```
PREP SPRINT:  AI-7 + PREP-D (block P-2.1)
              PREP-A (block P-2.4)
              PREP-B + PREP-C (block P-2.5A)
              SPIKE-1 (before P-2.2), SPIKE-2 (before P-2.9)

TRACK A:      P-2.1 → P-2.2 → P-2.3 → P-2.4
TRACK B:      P-3.1 → P-3.2 → P-3.3
                         ↘         ↙
                    CONVERGE → P-2.5A → P-2.5B → P-2.6 → P-2.7 → P-2.8
                                                                      ↓
                                                              P-2.9 → P-2.10 → P-2.11
```

**Pattern-establishing stories:** P-2.1 (seeker profile — mirrors P-1.2 company profile), P-2.4 (application state machine — extends P-1.4 pattern)

---

## Deployment Plan

- **Launch target:** Post-Epic 2 + Epic 3 min viable completion
- **Rationale:** Minimum viable marketplace requires: employers post → admin approves → seekers find → seekers apply
- **Technical readiness:** Docker build fixed (CP-1), CI pipeline operational, zero known blockers
- **Decision:** Accumulate portal features until marketplace loop is complete

---

## Retrospective Meta-Observation

Portal Epic 1 proved a capability milestone: a complex, multi-surface system built with zero regressions, stable architecture, high test confidence, and aligned team execution. The prep sprint approach (P-0 → P-1) is now validated with evidence — 11/11 items completed, directly converting to execution quality.

The single systemic gap remaining — implicit requirements not encoded as enforcement — has a concrete bundled fix with ownership and success criteria. The forward-looking risks (dual state machines, async complexity) have mitigation plans with gates.

Epic 1 proved the team can build it right. Epic 2 will prove they can keep it right at scale. The prep sprint is the bridge.
