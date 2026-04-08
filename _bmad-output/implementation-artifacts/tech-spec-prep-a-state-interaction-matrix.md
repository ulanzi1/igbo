---
title: 'PREP-A: State Interaction Matrix & Terminal State Policy'
slug: 'prep-a-state-interaction-matrix'
created: '2026-04-08'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
adversarialReviewApplied: 20
lastUpdated: '2026-04-08'
tech_stack: ['TypeScript 5 strict', '@igbo/db', 'Drizzle ORM 0.45', 'Vitest 4', 'Markdown docs']
files_to_modify:
  - 'docs/decisions/state-interaction-matrix.md (NEW)'
  - 'packages/db/src/schema/portal-job-postings.ts (extend — add terminal constants + guards)'
  - 'packages/db/src/schema/portal-applications.ts (extend — add terminal constants + guards + canAcceptApplications)'
  - 'packages/db/src/schema/portal-job-postings.test.ts (NEW — property tests for job terminal classification)'
  - 'packages/db/src/schema/portal-applications.test.ts (NEW — property tests for application classification + canAcceptApplications)'
code_patterns:
  - 'Schema module exports enum + type alias + (new) terminal constant arrays as const + type guards'
  - 'Decision docs use YAML frontmatter (title/description/author/date) + H1 + structured sections'
  - 'Package subpath exports via @igbo/db/schema/* (package.json exports field)'
  - 'server-only import at top of every schema file'
test_patterns:
  - 'Co-located *.test.ts next to schema files (e.g., chat-messages.test.ts)'
  - '// @vitest-environment node directive at top of schema tests'
  - 'Assertions over enumValues arrays and table column keys'
  - 'Property-style iteration: for every enumValue, assert classification membership'
---

# Tech-Spec: PREP-A: State Interaction Matrix & Terminal State Policy

**Created:** 2026-04-08

## Overview

### Problem Statement

Portal Epic 2 introduces a second state machine (`portal_applications`) that will interact
with the existing job posting state machine (`portal_job_postings`). Epic 1 retro (Lesson 4)
identified that *"state machine complexity is multiplicative, not additive"* — two interacting
machines create cross-state dependencies that must be explicitly mapped before P-2.4 is specced.

Today there is:
- No formal cross-state invariant table (job status × application status)
- No `TERMINAL_STATES` constant or importable invariant in `@igbo/db`
- No documented ownership boundary between the two machines
- No documented policy for what happens to open applications when a job posting transitions
  to a soft/hard terminal state (`expired`, `filled`, `rejected`, `paused`)

Without this, P-2.4 (Application State Machine) risks ad-hoc decisions at implementation
time, and the "no external event touches terminal applications" invariant cannot be
enforced or tested.

### Solution

Produce a two-part deliverable:

1. **Architecture decision doc** at `docs/decisions/state-interaction-matrix.md` — the
   authoritative source of truth for cross-state invariants, terminal state policy,
   ownership boundaries, and stress-test checklist. Winston-owned, Charlie stress-tested.
2. **Importable code constants + invariant helpers** in `@igbo/db` — `JOB_TERMINAL_STATES`,
   `APPLICATION_TERMINAL_STATES`, an `isTerminal*` type guard, and a small unit test suite
   asserting the sets match the doc. Gives P-2.4 something concrete to import and assert on
   without duplicating the policy in prose.

No state machine implementation, no migrations, no UI, no transition code. This is prep.

### Scope

**Canonical decision-doc section list (F9 — referenced by number throughout):**

1. Terminology
2. Ownership Boundaries
3. Terminal State Policy
4. Core Invariants
5. Cascade Policy
6. Application-Creation Preconditions
7. Application Status Classification
8. Job Posting Status × Application Status Invariant Table
9. Stress-Test Checklist
10. Open Questions for P-2.4

Task 1 and AC-1 reference these sections by number; any rename requires updating both in lockstep.

**In Scope:**

- `docs/decisions/state-interaction-matrix.md` containing:
  - **Terminology section** — disambiguates `JOB_REJECTED` (admin-rejected posting, owned by admin)
    vs `APPLICATION_REJECTED` (employer-rejected candidate, owned by employer). Enum values
    stay as-is; naming convention applies to constants and prose. Also documents:
    *`closedOutcome` is a UX hint on top of `filled` status, not a state discriminator —
    all three outcomes (`filled_via_portal`, `filled_internally`, `cancelled`) share the
    same terminal invariant.* Prevents future devs from branching logic on outcome as if
    it were a sub-state.
  - **Ownership boundary section** — who owns which machine, who can trigger which transitions
    - Job posting machine: employer + admin — admin owns `pending_review` → `active`,
      `pending_review` → `rejected`, **and `pending_review` → `draft`** (P-3.2 request-changes
      path per `ADMIN_ONLY_TRANSITIONS` in `job-posting-service.ts`) (F6)
    - Application machine: employer (`submitted` → `hired`/`rejected`) + seeker (`withdrawn` only)
  - **Job posting status × application status invariant table** — every cell explicit
    (allowed transitions / forbidden transitions / side effects)
  - **Terminal state policy** — formal sets for both machines, with **soft vs hard terminal**
    distinction:
    - Job posting *hard* terminal: `filled` only — immutable (see TD-1)
    - Job posting *soft* terminal: `expired` — renewable per P-1.5 renew flow
    - Non-terminal (despite colloquial "rejected" language in retro): `draft`,
      `pending_review`, `active`, `paused`, `rejected` — `rejected` loops back
      to `pending_review` via edit+resubmit
    - Application *hard* terminals: `hired`, `rejected`, `withdrawn` — all immutable
    - Rule: *soft terminals* may be touched only by explicit owner-initiated renew events;
      *hard terminals* cannot be touched by any event.
  - **Core invariant:** "No external event touches terminal applications" — statement,
    rationale, zero exceptions. Also: "No external event touches hard-terminal job postings."
  - **Cascade policy** — what happens to open applications when the parent job posting
    transitions to `paused`, `expired`, `filled`, `rejected`:
    - **Principle:** Application status is **never silently mutated** by job posting transitions.
      Zero writes to `portal_applications.status` from job posting state changes.
    - **Derived view:** A "parent closed" flag is computed at query time via JOIN on
      `portal_job_postings.status IN JOB_HARD_TERMINAL_STATES`. UI surfaces this as a banner
      or badge; state stays authoritative.
    - **Employer obligation (policy-only, implemented in P-2.4):** When employer initiates
      a hard-terminal job transition with non-terminal applications open, they must be
      prompted to batch-resolve (hire/reject) or acknowledge. Seeker may still withdraw
      independently at any time.
  - **Application-creation preconditions:** New applications are accepted **only** when
    `job.status === 'active'`. All other statuses (including `paused`, `pending_review`,
    `draft`, any terminal) reject creation. Encoded as `canAcceptApplications(jobStatus)`.
  - **Application status classification** — explicit notes for non-obvious values:
    - `offered` is **non-terminal**: legitimate paths `offered → hired` and `offered → rejected`
    - `under_review`, `shortlisted`, `interview` are non-terminal working states
    - `hired`, `rejected`, `withdrawn` are the only terminal values
  - **Stress-test checklist** — Charlie walks every `job_status × application_status` cell
    before the doc is marked final, records decisions inline.
  - **Open Questions for P-2.4** (surfaced, not decided here) — seeds P-2.4 story spec:
    - Timeout/expiry behaviour for `offered` applications if seeker never responds
    - Does `withdrawn` block re-application to the same posting?
    - **F20 — Schema gap:** `portal_applications` currently has **no unique constraint**
      on `(jobId, seekerUserId)`. Re-application semantics (block duplicates? allow after
      `withdrawn`? allow after `rejected`?) and the corresponding DB constraint are a
      P-2.4 decision. PREP-A notes the gap; does not decide it or add a migration.
    - Any additional questions surfaced during Charlie's stress-test walk
- Code constants + helpers in `@igbo/db` (mirror the doc):
  - `JOB_HARD_TERMINAL_STATES` — `readonly ['filled'] as const` (see TD-1)
  - `JOB_SOFT_TERMINAL_STATES` — `readonly ['expired'] as const`
  - `APPLICATION_TERMINAL_STATES` — `readonly ['hired', 'rejected', 'withdrawn'] as const`
  - `isHardTerminalJobStatus(status)` / `isSoftTerminalJobStatus(status)` type guards
  - `isTerminalApplicationStatus(status)` type guard
  - `canAcceptApplications(jobStatus)` precondition helper — returns `true` iff `status === 'active'`
  - Exported from package index alongside existing enum type exports
- **Property tests** asserting doc↔code parity (retro Lesson 2 — "if CI hasn't failed yet,
  it's not real enforcement"):
  - Iterate `portalJobStatusEnum.enumValues`, assert every value is classified as exactly
    one of: hard-terminal, soft-terminal, or non-terminal (exhaustive, no gaps, no overlap,
    union equals the enum). One-element sets are acceptable — cardinality isn't the point,
    classification exhaustiveness is.
  - Iterate `portalApplicationStatusEnum.enumValues`, assert every value is classified as
    exactly one of: terminal or non-terminal (exhaustive, no gaps)
  - Assert `canAcceptApplications` returns `true` for exactly one status (`active`)
  - These tests fail loudly if anyone adds a status to the enum without updating constants
- **Baseline schema sanity tests** (bounded — avoids scope creep):
  - Each new `*.test.ts` includes a narrow check that the `status` column exists on the
    table and references the expected enum. No other column assertions (P-2.4 and future
    stories will add broader schema tests as needed).

**Out of Scope:**

- P-2.4 state machine implementation (transition functions, guards, events)
- Any DB migration or schema change
- Any UI or API route
- CI lint rule enforcing the invariant (deferred until P-2.4 proves the shape — retro Lesson 2:
  "If CI hasn't failed yet, it's not real enforcement")
- Refactoring the existing job posting state machine (P-1.4)
- Application-side cascade *logic* (only the *policy* is defined here; implementation is P-2.4)

## Context for Development

### Technical Preferences & Constraints

- **Deliverable shape:** Decision doc as source of truth, code constants as importable
  mirror — answers P-2.4 needs to import something testable, but keeps policy prose in one place.
- **Terminal invariant scope:** Applies to *both* machines, but with the soft/hard distinction
  made explicit. Job posting `expired` is *soft terminal* (renewable per P-1.5); `filled` is
  the only *hard terminal* (TD-1: `rejected` is intentionally a revision loop, not a dead end).
  Application `hired`, `rejected`, `withdrawn` are all hard terminals. Soft terminals may only
  be touched by owner-initiated renew events; hard terminals cannot be touched by any event.
- **Cascade principle (non-negotiable):** Application status is never silently mutated by
  job posting transitions. Parent-closed state is a derived query-time view, not a write.
  Employer batch-resolve prompt is a P-2.4 UX concern — PREP-A only defines the policy.
- **Terminology discipline:** `JOB_REJECTED` vs `APPLICATION_REJECTED` — same enum string,
  different semantics, different owners. Doc must disambiguate; constants must be distinctly named.
- **Enforcement strategy:** Property tests over enum values, not CI lint rules. Tests fail
  when someone adds an enum value without updating the classification — aligned with retro
  Lesson 2 ("If CI hasn't failed yet, it's not real enforcement" → a unit test that *will*
  fail on drift is real enforcement).
- **Ownership boundary:**
  - Job posting machine — owned by employer (+ admin for `pending_review` → `active`,
    `pending_review` → `rejected`, and `pending_review` → `draft` request-changes) (F6)
  - Application machine — owned by employer acting on candidate (`submitted` → `hired`/`rejected`)
    plus seeker-initiated `withdrawn` transition only
- **Stress-test format:** Doc ends with a checklist Charlie runs — walk every job_status ×
  application_status cell, answer (allowed transitions / forbidden transitions / side effects).
- **Doc location convention:** Follows `docs/decisions/*.md` pattern used by density-context,
  feed-algorithm, moderation-architecture, etc.
- **Code location:** Constants/helpers live next to the enums they mirror —
  `packages/db/src/schema/portal-job-postings.ts` and `packages/db/src/schema/portal-applications.ts`.
  Re-exported via package index.

### Retro References

- `_bmad-output/implementation-artifacts/portal-epic-1-retro-2026-04-05.md` — PREP-A action item,
  Lesson 4 (state machine multiplicativity), Critical Path item #3
- Retro gate: **PREP-A must exist before P-2.4 story spec**

### Codebase Patterns (Step 2 Investigation)

**Schema file anatomy** (`packages/db/src/schema/portal-job-postings.ts`,
`portal-applications.ts`):
- `import "server-only";` at top — enforced across every schema file
- pgEnum declarations exported with `Enum` suffix (e.g., `portalJobStatusEnum`)
- Table declarations with Drizzle helpers
- Type exports: `$inferSelect`, `$inferInsert`, and a type alias for enum values
  (`PortalJobStatus = (typeof portalJobStatusEnum.enumValues)[number]`)
- New constants/helpers should follow the existing export convention and sit below
  the type alias exports to keep related material colocated

**Package exports** (`packages/db/package.json`):
- Subpath exports via `./schema/*` and `./queries/*` — consumers import from
  `@igbo/db/schema/portal-job-postings` directly (not barreled through index)
- Root `@igbo/db` export is the `db` proxy + `createDb` factory, not schema re-exports
- **Decision:** new terminal constants + guards export from the same schema file they
  classify (colocation), consumed via existing subpath import. No changes to `index.ts`.

**Test file anatomy** (`packages/db/src/schema/chat-messages.test.ts`):
- `// @vitest-environment node` directive on line 1
- Imports from the same-directory schema file (`./portal-job-postings`)
- `describe(<schema-name> "schema", ...)` wrapping, tests assert on enum values and
  table column keys
- No DB connection needed — pure static assertions on Drizzle exports

**Existing job posting state machine** (`apps/portal/src/services/job-posting-service.ts`, `VALID_TRANSITIONS` table):
- `VALID_TRANSITIONS: Record<PortalJobStatus, PortalJobStatus[]>` lives in the service layer,
  **not** in `@igbo/db`. PREP-A preserves this boundary — transition *tables* are service-layer
  concerns; terminal *classification* is a db-package concern (type-level invariant).
- Existing P-2.4 will mirror this: application transitions in a service file, application
  terminal classification in `@igbo/db`.

**Existing decision doc convention** (`docs/decisions/density-context.md`):
- YAML frontmatter: `title`, `description`, `author`, `date`
- H1 matches title, H2 sections for structural breakdown
- Concise, decision-oriented prose — not narrative. Tables for enumerable relationships.
- PREP-A doc will follow this exact shape.

### Technical Decisions (made during investigation)

**TD-1: `rejected` is NOT a hard terminal for job postings.**

Investigation found the `VALID_TRANSITIONS` table in `apps/portal/src/services/job-posting-service.ts`:
```typescript
const VALID_TRANSITIONS: Record<PortalJobStatus, PortalJobStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["active", "rejected", "draft"],
  active: ["paused", "pending_review", "filled"],
  paused: ["active", "filled"],
  filled: [],                                          // <-- only hard terminal
  expired: ["active", "pending_review", "filled"],     // soft terminal (renew)
  rejected: ["pending_review"],                        // NOT terminal — edit+resubmit
};
```

This contradicts both the retro language ("rejected" as a terminal) and the Step 1
party-mode proposal. Actual code shows:
- `filled` — the **only** hard terminal for job postings (outgoing = `[]`)
- `expired` — soft terminal, renewable (existing P-1.5 behaviour)
- `rejected` — **not terminal**, loops back to `pending_review` for resubmission after
  employer edits

**Revised classification (authoritative):**
- `JOB_HARD_TERMINAL_STATES = ['filled'] as const`
- `JOB_SOFT_TERMINAL_STATES = ['expired'] as const`
- Everything else (`draft`, `pending_review`, `active`, `paused`, `rejected`) is non-terminal.

The invariant *"no external event touches hard-terminal job postings"* therefore applies
only to `filled`. The admin-rejected path is intentionally a revision loop, not a dead end.
The PREP-A decision doc must state this explicitly — especially because it contradicts the
colloquial use of "rejected = terminal" in the retro.

**TD-2: Application terminal classification unchanged.**

`portal_applications.status` enum values: `submitted, under_review, shortlisted, interview,
offered, hired, rejected, withdrawn`. No service-layer transition table exists yet (P-2.4
owns that). Terminal set per retro: `{hired, rejected, withdrawn}` — all three are hard
terminals. No soft-terminal concept for applications.

**TD-3: `canAcceptApplications` precondition stays strict.**

Reviewed: `active` is the only job status where a non-admin action (applying) should be
accepted. `paused` is a reversible employer-initiated hold; permitting applications during
a pause would create ambiguity about whether the seeker should retry. Strict single-status
allowance keeps P-2.4's creation path trivially testable.

**TD-4: Constants colocated with enums, not in a new `terminals.ts` file.**

Investigation showed schema files already export both the enum and the derived type
alias (`PortalJobStatus`). Terminal constant arrays and type guards are derived from the
same enum and conceptually belong next to it. Avoids a new file and an extra import path.

**TD-5: No migration, no `@igbo/db` index changes.**

Subpath imports (`@igbo/db/schema/portal-job-postings`) already work for consumers.
Everything PREP-A adds is type-level/constant-level; no runtime schema impact, no
migration, no `schemaMap` change.

**TD-6: Property test placement — co-located `*.test.ts` files.**

Follows `chat-messages.test.ts` pattern. One test file per schema module being extended.
New files (no existing schema tests for `portal-job-postings` / `portal-applications`).

**TD-7: Cascade policy is derivation only — no code in PREP-A.**

The "parent closed" derived view is documented as a *query pattern* in the decision doc,
not implemented in PREP-A. P-2.4 owns the first implementation (and becomes the standard
per "First Implementation = Standard" rule).

**TD-8: One-element terminal set is intentional.**

`JOB_HARD_TERMINAL_STATES = ['filled'] as const` has cardinality 1. This is deliberate:
the set exists for (a) classification exhaustiveness in property tests, (b) extensibility
if future statuses join the hard-terminal tier, and (c) self-documenting consumer code
(`JOB_HARD_TERMINAL_STATES` reads better than `status === 'filled'`). A boolean guard
function would lose the exhaustiveness guarantee that is the main reason PREP-A has code
at all.

**TD-9: `closedOutcome` is advisory, not a state discriminator.**

The `portal_closed_outcome` enum (`filled_via_portal`, `filled_internally`, `cancelled`)
is metadata on top of `filled` status, populated when the posting closes. The decision
doc explicitly states: all three outcomes share the same terminal invariant; UI may read
`closedOutcome` for messaging but must not branch state logic on it. Prevents accidental
sub-state semantics in P-2.4 and beyond.

**TD-10: `offered` application status is non-terminal.**

`portal_application_status` value `offered` represents a candidate-pending state with
two legitimate forward transitions (`→ hired`, `→ rejected`). It is non-terminal and
belongs in the implicit non-terminal set (complement of `APPLICATION_TERMINAL_STATES`).
Timeout/expiry of unreplied offers is a P-2.4 concern, flagged in the doc's "Open
Questions for P-2.4" section.

**TD-11: "Open Questions for P-2.4" as a doc-level handoff mechanism.**

PREP-A is explicitly *prep* — when stress-testing surfaces questions that belong to the
application state machine implementation, they are logged in a dedicated doc section rather
than blocking PREP-A completion. This keeps PREP-A's scope bounded while ensuring P-2.4's
story spec inherits a complete, actionable question list. Seed questions:
(a) `offered` timeout behaviour, (b) re-application after `withdrawn`. Charlie may add more
during stress-test walk.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/db/src/schema/portal-job-postings.ts` | Source enum + target for terminal constants |
| `packages/db/src/schema/portal-applications.ts` | Source enum + target for terminal constants + `canAcceptApplications` |
| `packages/db/src/schema/chat-messages.test.ts` | Test file pattern to mirror |
| `packages/db/package.json` | Subpath exports confirmation (no change needed) |
| `apps/portal/src/services/job-posting-service.ts` (`VALID_TRANSITIONS`) | Existing job transition table — source of truth for TD-1 |
| `docs/decisions/density-context.md` | Decision doc format template |
| `docs/decisions/moderation-architecture.md` | Multi-section decision doc example |
| `_bmad-output/implementation-artifacts/portal-epic-1-retro-2026-04-05.md` | PREP-A scope + acceptance |
| `_bmad-output/project-context.md` | Project-wide TypeScript + testing rules |

## Implementation Plan

### Tasks

**Ordered by dependency: doc first (source of truth) → code constants → tests → stress-test walk.**

- [x] **Task 1: Create the state interaction decision doc (draft)**
  - File: `docs/decisions/state-interaction-matrix.md` (NEW)
  - Action: Create with YAML frontmatter matching `density-context.md` format
    (`title`, `description`, `author: Winston (Architect)`, `date: 2026-04-08`). Populate
    the following H2 sections in order:
    1. **Terminology** — `JOB_REJECTED` vs `APPLICATION_REJECTED`, `closedOutcome` advisory note
    2. **Ownership Boundaries** — two subsections, one per machine, listing actor → allowed
       transitions (reference the `VALID_TRANSITIONS` table in
       `apps/portal/src/services/job-posting-service.ts` verbatim for the job machine,
       including the `pending_review → draft` admin request-changes path per F6;
       P-2.4 will define application transitions — document the *ownership* rules only)
    3. **Terminal State Policy** — formal sets, hard vs soft distinction, TD-1 explanation
       (why `rejected` is non-terminal despite colloquial retro language)
    4. **Core Invariants** — (a) "No external event touches terminal applications"
       (b) "No external event touches hard-terminal job postings" (c) "Application status
       is never silently mutated by job posting transitions"
    5. **Cascade Policy** — derived "parent closed" view via JOIN, employer batch-resolve
       prompt as P-2.4 policy, seeker-initiated `withdrawn` stays independent
    6. **Application-Creation Preconditions** — single rule: `job.status === 'active'`
    7. **Application Status Classification** — table of all 8 statuses × terminal/non-terminal,
       with `offered` explicitly non-terminal
    8. **Job Posting Status × Application Status Invariant Table** — structured as
       **default + exceptions pattern** (W2): a compact 7-row table (one row per job
       status) showing the default behaviour for all 8 application statuses:
       (a) new-application acceptance (true only for `active`, false otherwise),
       (b) allowed application transitions by actor (default: employer full control on
       non-terminal, seeker may `withdraw` always), (c) side effects on parent job
       (default: none — cascade principle). Exceptions (if any surface during stress-test)
       are listed as explicit sub-rows beneath the relevant status.
    9. **Stress-Test Checklist** — Charlie walks the 7 rows, confirms the default row
       applies to all 8 application statuses for each, records any exceptions found.
       Time-boxed to a single ~15-minute walk session.
    10. **Open Questions for P-2.4** — seeded with (a) `offered` timeout behaviour,
        (b) re-application after `withdrawn`
  - **Constant naming frozen here (W1):** This task locks the exact exported symbol names
    used throughout the doc. Before Task 2 starts, confirm the doc uses (and only uses):
    `JOB_HARD_TERMINAL_STATES`, `JOB_SOFT_TERMINAL_STATES`, `APPLICATION_TERMINAL_STATES`,
    `isHardTerminalJobStatus`, `isSoftTerminalJobStatus`, `isTerminalApplicationStatus`,
    `canAcceptApplications`. Any rename downstream requires doc update in lockstep.
  - **Mini-checkpoint (B1):** After the draft is written, Winston reviews the Terminology
    and Terminal State Policy sections specifically to lock constant names *before* Task 2
    begins. Not a full review — a 5-minute naming lock to prevent Task 8-induced rework.
  - Notes: Draft is complete when all sections exist with content; final sign-off requires
    Task 8 (stress-test walk). Doc status in frontmatter: `status: draft` → `status: final`
    after Task 8.

- [x] **Task 2: Add terminal constants + guards to `portal-job-postings.ts`**
  - File: `packages/db/src/schema/portal-job-postings.ts`
  - Action: **Append at the end of the file** (F17 — anchor is EOF, not any specific
    prior export, so adding a new type export above doesn't shift the insertion point):
    ```typescript
    // State Interaction Matrix (see docs/decisions/state-interaction-matrix.md)
    // Names frozen in docs/decisions/state-interaction-matrix.md §1 Terminology (F10).
    // Hard terminal: no outgoing transitions, cannot be touched by any event.
    // Soft terminal: renewable via owner-initiated events only (P-1.5 renew flow).
    // TD-1: `rejected` is NOT terminal — it loops back to `pending_review` via
    //        edit+resubmit per the VALID_TRANSITIONS table in
    //        apps/portal/src/services/job-posting-service.ts.
    export const JOB_HARD_TERMINAL_STATES = ["filled"] as const satisfies readonly PortalJobStatus[];
    export const JOB_SOFT_TERMINAL_STATES = ["expired"] as const satisfies readonly PortalJobStatus[];

    export function isHardTerminalJobStatus(
      status: PortalJobStatus,
    ): status is (typeof JOB_HARD_TERMINAL_STATES)[number] {
      return (JOB_HARD_TERMINAL_STATES as readonly PortalJobStatus[]).includes(status);
    }

    export function isSoftTerminalJobStatus(
      status: PortalJobStatus,
    ): status is (typeof JOB_SOFT_TERMINAL_STATES)[number] {
      return (JOB_SOFT_TERMINAL_STATES as readonly PortalJobStatus[]).includes(status);
    }
    ```
  - Notes: Use `as const satisfies readonly PortalJobStatus[]` to get literal types *and*
    compile-time assurance that only valid enum values appear. The include check casts the
    readonly tuple to the wider array type purely for the `.includes()` signature; the type
    guard return keeps callers narrow. No other lines in the file change.

- [x] **Task 3: Add terminal constants + guards + precondition to `portal-applications.ts`**
  - File: `packages/db/src/schema/portal-applications.ts`
  - Action: (a) Add `import type { PortalJobStatus } from "./portal-job-postings";` to
    the top-of-file import block (A2 — project convention is all imports at top, including
    type-only). (b) **Append at the end of the file** (F17):
    ```typescript
    // State Interaction Matrix (see docs/decisions/state-interaction-matrix.md)
    // Names frozen in docs/decisions/state-interaction-matrix.md §1 Terminology (F10).
    // All three are hard terminals — no external event may touch them.
    // `offered` is intentionally NON-terminal (offered → hired | rejected).
    export const APPLICATION_TERMINAL_STATES = [
      "hired",
      "rejected",
      "withdrawn",
    ] as const satisfies readonly PortalApplicationStatus[];

    export function isTerminalApplicationStatus(
      status: PortalApplicationStatus,
    ): status is (typeof APPLICATION_TERMINAL_STATES)[number] {
      return (APPLICATION_TERMINAL_STATES as readonly PortalApplicationStatus[]).includes(status);
    }

    /**
     * Application-creation precondition (State Interaction Matrix §Application-Creation).
     * New applications are accepted ONLY when the parent job is `active`.
     * `paused`, `pending_review`, `draft`, and any terminal status reject creation.
     */
    export function canAcceptApplications(jobStatus: PortalJobStatus): boolean {
      return jobStatus === "active";
    }
    ```
  - Notes: The `import type` is type-only, no runtime dependency added. `server-only`
    import stays at line 1 unchanged.

- [x] **Task 4: Create property + sanity tests for `portal-job-postings.ts`**
  - File: `packages/db/src/schema/portal-job-postings.test.ts` (NEW)
  - Action: Create with the following single-block structure (A3 — consolidated; the
    redundant XOR exhaustiveness test from Round 3's earlier draft is removed in favour
    of the explicit-expected-non-terminal drift guard, which is strictly stronger (Q1)):
    ```typescript
    // @vitest-environment node
    import { describe, it, expect } from "vitest";
    import {
      portalJobPostings,
      portalJobStatusEnum,
      JOB_HARD_TERMINAL_STATES,
      JOB_SOFT_TERMINAL_STATES,
      isHardTerminalJobStatus,
      isSoftTerminalJobStatus,
      type PortalJobStatus,
    } from "./portal-job-postings";

    describe("portal-job-postings schema", () => {
      it("portalJobPostings table has status column", () => {
        expect(Object.keys(portalJobPostings)).toContain("status");
      });

      // F13: split — set equality guards classification exhaustiveness (order-free);
      // sequence equality guards Postgres enum compatibility (order matters to pg).
      it("portalJobStatusEnum set equals the 7 expected values (classification)", () => {
        expect([...portalJobStatusEnum.enumValues].sort()).toEqual(
          ["draft", "pending_review", "active", "paused", "filled", "expired", "rejected"].sort(),
        );
      });

      it("portalJobStatusEnum sequence is stable (Postgres enum order)", () => {
        expect(portalJobStatusEnum.enumValues).toEqual([
          "draft",
          "pending_review",
          "active",
          "paused",
          "filled",
          "expired",
          "rejected",
        ]);
      });
    });

    describe("portal-job-postings terminal classification (PREP-A)", () => {
      it("JOB_HARD_TERMINAL_STATES contains exactly ['filled']", () => {
        expect(JOB_HARD_TERMINAL_STATES).toEqual(["filled"]);
      });

      it("JOB_SOFT_TERMINAL_STATES contains exactly ['expired']", () => {
        expect(JOB_SOFT_TERMINAL_STATES).toEqual(["expired"]);
      });

      it("hard and soft terminal sets are disjoint", () => {
        const intersection = JOB_HARD_TERMINAL_STATES.filter((s) =>
          (JOB_SOFT_TERMINAL_STATES as readonly string[]).includes(s),
        );
        expect(intersection).toEqual([]);
      });

      // Drift guard — explicit expected non-terminal list. When a future dev adds
      // a new value to portalJobStatusEnum without updating the constants above,
      // this test fails with a clear diff. Retro Lesson 2 real enforcement.
      it("exhaustiveness: every enum value is classified terminal or non-terminal", () => {
        const classified = new Set<string>([
          ...JOB_HARD_TERMINAL_STATES,
          ...JOB_SOFT_TERMINAL_STATES,
        ]);
        // Sanity: all classified values actually exist in the enum.
        for (const s of classified) {
          expect(portalJobStatusEnum.enumValues as readonly string[]).toContain(s);
        }
        const expectedNonTerminal: PortalJobStatus[] = [
          "draft",
          "pending_review",
          "active",
          "paused",
          "rejected",
        ];
        const actualNonTerminal = portalJobStatusEnum.enumValues.filter(
          (s) => !classified.has(s),
        );
        expect([...actualNonTerminal].sort()).toEqual([...expectedNonTerminal].sort());
      });

      it("rejected is NOT terminal (TD-1: edit+resubmit loop)", () => {
        expect(isHardTerminalJobStatus("rejected")).toBe(false);
        expect(isSoftTerminalJobStatus("rejected")).toBe(false);
      });

      it("filled is hard terminal", () => {
        expect(isHardTerminalJobStatus("filled")).toBe(true);
      });

      it("expired is soft terminal", () => {
        expect(isSoftTerminalJobStatus("expired")).toBe(true);
      });
    });
    ```
  - Notes: One test block, one drift-guard approach. Typed as `PortalJobStatus[]` for
    consistency with Task 5 (Q2 — aligned typing across test files).

- [x] **Task 5: Create property + sanity tests for `portal-applications.ts`**
  - File: `packages/db/src/schema/portal-applications.test.ts` (NEW)
  - Action: Create with the following structure:
    ```typescript
    // @vitest-environment node
    import { describe, it, expect } from "vitest";
    import {
      portalApplications,
      portalApplicationStatusEnum,
      APPLICATION_TERMINAL_STATES,
      isTerminalApplicationStatus,
      canAcceptApplications,
      type PortalApplicationStatus,
    } from "./portal-applications";
    import { portalJobStatusEnum } from "./portal-job-postings";

    describe("portal-applications schema", () => {
      it("portalApplications table has status column", () => {
        expect(Object.keys(portalApplications)).toContain("status");
      });

      // F13: split classification-set equality from Postgres-order sequence equality.
      it("portalApplicationStatusEnum set equals the 8 expected values (classification)", () => {
        expect([...portalApplicationStatusEnum.enumValues].sort()).toEqual(
          [
            "submitted", "under_review", "shortlisted", "interview",
            "offered", "hired", "rejected", "withdrawn",
          ].sort(),
        );
      });

      it("portalApplicationStatusEnum sequence is stable (Postgres enum order)", () => {
        expect(portalApplicationStatusEnum.enumValues).toEqual([
          "submitted",
          "under_review",
          "shortlisted",
          "interview",
          "offered",
          "hired",
          "rejected",
          "withdrawn",
        ]);
      });
    });

    describe("portal-applications terminal classification (PREP-A)", () => {
      it("APPLICATION_TERMINAL_STATES contains exactly [hired, rejected, withdrawn]", () => {
        expect([...APPLICATION_TERMINAL_STATES].sort()).toEqual(
          ["hired", "rejected", "withdrawn"].sort(),
        );
      });

      it("every enum value is classified terminal or non-terminal (exhaustiveness)", () => {
        // Drift guard — explicit expected non-terminal set. Fails if enum drifts.
        // Typed as PortalApplicationStatus[] for consistency with Task 4 (Q2).
        const expectedNonTerminal: PortalApplicationStatus[] = [
          "submitted",
          "under_review",
          "shortlisted",
          "interview",
          "offered",
        ];
        const actualNonTerminal = portalApplicationStatusEnum.enumValues.filter(
          (s) => !isTerminalApplicationStatus(s),
        );
        expect([...actualNonTerminal].sort()).toEqual([...expectedNonTerminal].sort());
      });

      it("offered is NOT terminal (TD-10: offered → hired | rejected)", () => {
        expect(isTerminalApplicationStatus("offered")).toBe(false);
      });

      it("hired, rejected, withdrawn are all terminal", () => {
        expect(isTerminalApplicationStatus("hired")).toBe(true);
        expect(isTerminalApplicationStatus("rejected")).toBe(true);
        expect(isTerminalApplicationStatus("withdrawn")).toBe(true);
      });

      // F4: reverse-sanity loop — mirrors Task 4's "rejected is NOT terminal" assertion.
      // Every non-terminal application status must return false from the guard.
      it("every non-terminal application status returns false from isTerminalApplicationStatus", () => {
        const nonTerminal: PortalApplicationStatus[] = [
          "submitted", "under_review", "shortlisted", "interview", "offered",
        ];
        for (const s of nonTerminal) {
          expect(isTerminalApplicationStatus(s)).toBe(false);
        }
      });
    });

    describe("canAcceptApplications precondition (PREP-A)", () => {
      it("returns true for exactly one status ('active')", () => {
        const accepting = portalJobStatusEnum.enumValues.filter((s) =>
          canAcceptApplications(s),
        );
        expect(accepting).toEqual(["active"]);
      });

      // F16: derive the rejected list from the enum instead of hardcoding — stays honest
      // when new job statuses are added; exhaustiveness falls out automatically.
      it("rejects every job status except 'active'", () => {
        const rejected = portalJobStatusEnum.enumValues.filter((s) => s !== "active");
        for (const s of rejected) {
          expect(canAcceptApplications(s)).toBe(false);
        }
      });
    });
    ```
  - Notes: The `expectedNonTerminal` inline array is the drift-failure mechanism — when
    someone adds a new application status, this test fails until the classification is
    deliberately updated. Aligned with retro Lesson 2.

- [x] **Task 6: Build, test, and typecheck `@igbo/db` (F2 — build step required)**
  - File: N/A — command execution
  - Action: From repo root, run **in order**:
    1. `pnpm --filter @igbo/db build` — package `exports` field points at `./dist/*.js`
       (see `packages/db/package.json`); `@igbo/portal` does NOT use TS project
       `references` to compile `@igbo/db` transitively, so consumers resolve against
       pre-built output. Without this step Task 7 would test stale `dist/`.
    2. `pnpm --filter @igbo/db test` — runs the two new test files.
    3. `pnpm --filter @igbo/db typecheck` — `tsc --noEmit` over the package source.
  - Notes: All three must pass with zero warnings. If `as const satisfies` syntax raises
    a TS version issue, downgrade to `as const` and add a separate type-assertion line.
    No test failures, no type errors — this is the hard pass gate.

- [x] **Task 7: Verify subpath imports resolve from `@igbo/portal` (F1 — correct filter name)**
  - File: N/A — smoke check
  - Action: From repo root run `pnpm --filter @igbo/portal exec tsc --noEmit` after
    adding a throwaway test import line in a scratch file
    (`import { JOB_HARD_TERMINAL_STATES } from "@igbo/db/schema/portal-job-postings"`),
    confirm it resolves, then remove the scratch line. Alternatively grep for an existing
    consumer importing from `@igbo/db/schema/portal-job-postings` and verify the new
    exports are visible in IDE autocomplete.
  - Notes: Depends on Task 6 having rebuilt `dist/`. The filter name is `@igbo/portal`
    (from `apps/portal/package.json`), NOT `portal`.

- [x] **Task 8: Charlie stress-test walk of the decision doc**
  - File: `docs/decisions/state-interaction-matrix.md` (update)
  - Action: Walk the 7-row default-plus-exceptions table in §8 of the doc (W2). For
    each of the 7 job statuses, confirm the default row applies to all 8 application
    statuses: (a) new-application acceptance matches `canAcceptApplications`,
    (b) default actor-permitted application transitions hold, (c) no parent-job
    side effect on applications (cascade principle). Record any exception found as an
    explicit sub-row. Add any new questions discovered to §10 "Open Questions for P-2.4".
    After the walk completes, update the doc frontmatter `status: final` and add a
    `reviewers:` list naming Winston + Charlie.
  - Notes: This is the PREP-A "stress-tested by Charlie" gate from the retro. Time-box:
    ~15 minutes. If any row surfaces a real invariant violation that the code constants
    fail to express, return to Task 2/3 and iterate.

- [x] **Task 9: Update retro + sprint status to mark PREP-A complete (B2)**
  - File: `_bmad-output/implementation-artifacts/portal-epic-1-retro-2026-04-05.md`
    (or the current sprint-status tracking file, whichever the team uses)
  - Action: (a) Grep-verify the exact item in the retro before editing:
    `grep -n "PREP-A" _bmad-output/implementation-artifacts/portal-epic-1-retro-2026-04-05.md`
    — confirm the Critical Path table item #3 line number(s) match your edit target,
    so the retro update lands on the correct row (F14). (b) Mark PREP-A as ✅ completed
    in the Critical Path table (item #3) and in the "Epic 2 Preparation Tasks" section.
    Link to the merged commit / PR. No changes to other items.
  - Notes: Hygienic — keeps the retro a live document of what's actually shipped. Small
    scope, one-line edit in two places.

**Commit discipline (A4):** Ship Tasks 1–9 as a single logical commit (or tightly
coupled PR). Doc, constants, and tests must land together — the drift-guard invariant
is meaningless if the constants exist without the tests, or the tests exist without
the constants. Bob to enforce at review.

### Acceptance Criteria

- [x] **AC 1: Decision doc exists and is structurally complete (F9 — references canonical list)**
  - **Given** the PREP-A work is finished,
  - **When** I open `docs/decisions/state-interaction-matrix.md`,
  - **Then** all 10 H2 sections listed in the **Scope § Canonical decision-doc section
    list** appear in the same order and with the same names (§1 Terminology through
    §10 Open Questions for P-2.4), each is populated with content (no "TBD", no
    placeholders), the frontmatter shows `status: final`, and the reviewers list names
    Winston + Charlie.

- [x] **AC 2: TD-1 is documented unambiguously**
  - **Given** the decision doc,
  - **When** I read the Terminal State Policy section,
  - **Then** I find an explicit statement that `rejected` is non-terminal (with the reason:
    edit-and-resubmit loop to `pending_review`), and a reference to
    the `VALID_TRANSITIONS` table in `apps/portal/src/services/job-posting-service.ts` as the code-level source of truth.

- [x] **AC 3: Code constants exist with valid type guard signatures (F5 — softened)**
  - **Given** the `@igbo/db` package builds successfully,
  - **When** a consumer imports `JOB_HARD_TERMINAL_STATES`, `JOB_SOFT_TERMINAL_STATES`,
    `APPLICATION_TERMINAL_STATES`, `isHardTerminalJobStatus`, `isSoftTerminalJobStatus`,
    `isTerminalApplicationStatus`, and `canAcceptApplications` from
    `@igbo/db/schema/portal-job-postings` or `@igbo/db/schema/portal-applications`,
  - **Then** all symbols resolve, the arrays are typed as `readonly [...] as const`,
    and each type-guard function has a `status is (typeof X)[number]` return signature
    (verified structurally — narrowing *soundness* is asserted at runtime by the
    drift-guard tests, not claimed at the type level).

- [x] **AC 4: Hard-terminal job set is exactly `['filled']`**
  - **Given** the `portal-job-postings.ts` module,
  - **When** I inspect `JOB_HARD_TERMINAL_STATES`,
  - **Then** the array equals `["filled"]` — not `["filled", "rejected"]` — and the
    adjacent comment references TD-1.

- [x] **AC 5: Soft-terminal job set is exactly `['expired']`**
  - **Given** the `portal-job-postings.ts` module,
  - **When** I inspect `JOB_SOFT_TERMINAL_STATES`,
  - **Then** the array equals `["expired"]`, and the P-1.5 renew flow is referenced in
    the adjacent comment.

- [x] **AC 6: Application terminal set is exactly `['hired', 'rejected', 'withdrawn']`**
  - **Given** the `portal-applications.ts` module,
  - **When** I inspect `APPLICATION_TERMINAL_STATES`,
  - **Then** the array equals `["hired", "rejected", "withdrawn"]` and the adjacent
    comment notes that `offered` is intentionally excluded (TD-10).

- [x] **AC 7: `canAcceptApplications` accepts only `active`**
  - **Given** every value in `portalJobStatusEnum.enumValues`,
  - **When** I call `canAcceptApplications(status)`,
  - **Then** the function returns `true` exactly once (for `"active"`) and `false` for
    all other six statuses.

- [x] **AC 8: Drift-guard tests fail on enum changes**
  - **Given** a developer adds a new value to `portalJobStatusEnum` or
    `portalApplicationStatusEnum` without updating the terminal constants or the
    `expectedNonTerminal` array in the test,
  - **When** `pnpm --filter @igbo/db test` runs,
  - **Then** at least one test in the drift-guard suite fails with a clear diff between
    actual and expected non-terminal sets (retro Lesson 2 — real enforcement).

- [x] **AC 9: All new tests pass from a clean state**
  - **Given** a freshly checked-out branch with PREP-A applied,
  - **When** I run `pnpm --filter @igbo/db test`,
  - **Then** all tests in `portal-job-postings.test.ts` and `portal-applications.test.ts`
    pass, zero skipped, zero new warnings.

- [x] **AC 10: No schema drift — `pgTable`/`pgEnum` declarations unchanged (F3)**
  - **Given** the PREP-A commit,
  - **When** I run `git diff main -- packages/db/src/schema/portal-job-postings.ts
    packages/db/src/schema/portal-applications.ts` and grep the diff for any change to
    `pgTable(` or `pgEnum(` declaration lines, and also `git diff main -- packages/db/src/index.ts`,
  - **Then** zero `pgTable` / `pgEnum` declarations changed (additions are below the type
    aliases only), and `index.ts` is unmodified. No migration is required because no
    runtime schema change occurred.

- [x] **AC 11: Cascade invariant is documented but not implemented (W3 — scoped to commit diff)**
  - **Given** the PREP-A commit/PR,
  - **When** I inspect the PREP-A commit diff (not the wider codebase) for any write to
    `portal_applications.status` triggered by a `portal_job_postings.status` change,
  - **Then** no such code exists *in this commit's diff* (cascade policy is doc-only;
    implementation is P-2.4 and may legitimately add it later).

- [x] **AC 12: Stress-test walk is evidenced in the doc**
  - **Given** the completed decision doc,
  - **When** I read the §9 Stress-Test Checklist section,
  - **Then** all 7 rows of the job-status invariant table have been walked, each has a
    recorded decision (default-applies or exception-noted), and any questions surfaced
    are added to §10 Open Questions for P-2.4.

*(AC-13 was demoted back to VS-3 per F7 — cold-read clarity is a validation scenario,
not a binary pass/fail gate. The drift-guard tests and §9 stress-test walk are the hard
gates; litmus-question evidence lives in VS-3 below.)*

## Additional Context

### Dependencies

**Upstream (must exist before PREP-A starts):**
- `portal_job_postings` schema + `portalJobStatusEnum` — exists (P-1.1A)
- `portal_applications` schema + `portalApplicationStatusEnum` — exists (P-1.1A)
- `VALID_TRANSITIONS` job posting state machine — exists in
  `apps/portal/src/services/job-posting-service.ts` (P-1.4)
- `docs/decisions/*.md` convention + `density-context.md` exemplar — exists

**Downstream (PREP-A unblocks):**
- **P-2.4 story spec** — gated by PREP-A per retro Critical Path item #3
- Any P-2.x work that needs to reason about application terminality
- Any future CI lint rule that wants to enforce the cascade invariant statically
  (out of scope here, but the code constants make it trivially addable later)

**No external libraries added.** `import type` of `PortalJobStatus` into
`portal-applications.ts` is a type-only cross-schema reference; no runtime coupling
beyond what already exists via the `jobId` foreign key.

### Testing Strategy

**Unit tests (in `@igbo/db`):**
- Schema sanity — verify `status` column exists and enum values match expected lists
- Terminal classification — exact equality on constant arrays + type guard behaviour for
  representative values
- Exhaustiveness / drift guard — explicit expected non-terminal arrays so adding an enum
  value without updating constants fails a test loudly
- `canAcceptApplications` precondition — verify single-status acceptance across the full
  enum

**Integration tests:** None added. This is a type/constant layer; no DB writes, no
transactions, no runtime integration to exercise.

**Manual validation:**
- Visual walk-through of the decision doc against the retro ask (every retro bullet maps
  to a doc section)
- Charlie stress-test walk (Task 8) — the human-loop verification the retro explicitly calls for
- IDE autocomplete check from a portal consumer to confirm subpath re-export works

**Test execution commands:**
- `pnpm --filter @igbo/db test` — run all db package tests including the two new files
- `pnpm --filter @igbo/db typecheck` — type-level verification of `as const satisfies` and
  type guards
- `pnpm --filter @igbo/db db:journal-check` — confirm no accidental migration

### Validation Scenarios (SN-2)

**VS-1: Consumer imports and uses the terminal set (smoke)**
- Evidence: A scratch file in `apps/portal/src` imports `JOB_HARD_TERMINAL_STATES` and
  logs it. `pnpm --filter @igbo/portal exec tsc --noEmit` succeeds (F1 — correct filter
  name; requires Task 6 `@igbo/db build` to have run first per F2). Scratch file then removed.
- Confirms: Subpath export is live, types flow across package boundary.

**VS-2: Drift guard fails as expected (negative test) — Q3 resolution**
- Evidence: **Comment out one entry** (e.g., `"pending_review"`) in the
  `expectedNonTerminal` array in `portal-job-postings.test.ts`. Run
  `pnpm --filter @igbo/db test`. The exhaustiveness test fails with a clear diff showing
  the missing value. **Uncomment the entry** and confirm the test passes again. No
  source enum touched; test-file-only change; reversible in 30 seconds.
- **F15 — Evidence capture:** Paste the failing-test stdout (assertion diff block) into
  the PREP-A PR description under a `## VS-2 Drift Guard Demonstration` heading before
  requesting review. A PR without this evidence block is not ready for review.
- Confirms: Retro Lesson 2 — "If CI hasn't failed yet, it's not real enforcement." The
  test has demonstrably failed at least once on a real drift scenario.

**VS-3: Decision doc Terminology passes cold-read litmus (F7 — restored from AC-13)**
- Evidence: A second reader outside the PREP-A conversations (candidate: Bob or Elena)
  reads the decision doc cold and answers two litmus questions — "Is `rejected` terminal?"
  and "What does `closedOutcome: cancelled` mean for state logic?" — without asking
  clarifying questions mid-read. Correct answers: `rejected` is non-terminal (loops to
  `pending_review`); `cancelled` shares the `filled` terminal invariant (UI-only messaging,
  no state-level branching). Evidence captured as a **PR comment** with the reader's
  name, timestamp, and answers verbatim.
- Confirms: The doc is cold-read clear. Not a gate — a signal. If it fails, iterate the
  Terminology and Terminal State Policy sections.

**VS-4: Stress-test walk records a decision for every row (F8, F19 — reconciled with 7-row model)**
- Evidence: §9 Stress-Test Checklist in the doc has **7 walk entries** — one per job
  status row from §8. For each entry, Charlie records either
  **"default applies to all 8 application statuses"** (the expected outcome under the
  cascade principle) or **an explicit exception sub-row** naming the specific
  `(job_status, application_status)` pair and the invariant being broken. Charlie's
  sign-off (name + date) sits at the bottom of §9. The 56-cell framing from earlier
  drafts is retired — per the default-plus-exceptions pattern (W2), a single "default
  applies" acknowledgement per row covers all 8 application statuses for that job
  status. Total: 7 walk decisions, not 56.
- Confirms: The doc is actually stress-tested, not just drafted. Reconciles with Task 8
  and AC-12 which already use the 7-row framing.

### Notes

**High-risk items (pre-mortem):**

1. **Risk: TD-1 contradicts retro language — reviewer may push back.** The retro says
   "rejected" in a terminal-adjacent context; the code says otherwise. Mitigation:
   the decision doc explicitly cites the code line and explains the revision-loop
   semantics. If the team decides `rejected` *should* become terminal, that's a
   separate P-1.4 refactor, not PREP-A.

2. **Risk: Stress-test walk uncovers an invariant the code constants can't express.**
   If that happens, PREP-A code is not final — return to Task 2/3 and iterate. Explicit
   in Task 8 notes.

3. **Risk: Future dev adds enum value without updating classification.** This is the
   retro Lesson 2 failure mode. The drift-guard tests are the mitigation — *but* they
   must actually fail when triggered. VS-2 requires demonstrating this at least once.

4. **Risk: Scope creep into P-2.4.** Every time we touch application-side policy, there
   is pressure to "just implement the cascade". The "Out of Scope" list and TD-7 keep
   the line. Bob (SM) to enforce at review.

**Known limitations:**

- PREP-A defines policy and primitives, not enforcement at the service layer. P-2.4
  will consume these constants in transition functions; until then, the invariant
  is enforceable only via code review + property tests.
- The decision doc is not versioned; future changes to the invariant require updating
  the doc and the code constants together. The drift-guard tests enforce code-level
  consistency but cannot detect doc staleness. A lightweight `last-verified` date
  in the doc frontmatter is a reasonable future addition.

**Future considerations (out of scope but worth noting):**

- A CI lint rule could flag any direct write to `portal_applications.status` inside a
  file that also touches `portal_job_postings.status` — premature until P-2.4 ships
  the first real cascade consumer.
- `@igbo/db/invariants` as a dedicated sub-export if more cross-schema invariants
  accumulate — currently premature (one invariant set, colocated with its schemas).
- P-1.4 refactor: if "rejected" should become truly terminal (with a separate
  `draft_from_rejected` status for the resubmit loop), that's a design change in the
  job posting machine, not a PREP-A concern. PREP-A documents the current reality.
