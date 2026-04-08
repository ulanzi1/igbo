---
title: State Interaction Matrix & Terminal State Policy
description: Cross-state invariants and terminal state policy governing the portal job posting and application state machines
author: Winston (Architect)
date: 2026-04-08
status: final
reviewers:
  - Winston (Architect)
  - Charlie (Stress-test reviewer)
---

# State Interaction Matrix & Terminal State Policy

This document is the authoritative source of truth for cross-state invariants between
the two portal state machines (`portal_job_postings` and `portal_applications`). It
defines terminal state policy, ownership boundaries, cascade semantics, and a
stress-test checklist. Code constants in `@igbo/db` mirror the classifications
defined here; see `packages/db/src/schema/portal-job-postings.ts` and
`packages/db/src/schema/portal-applications.ts`.

PREP-A deliverable — gates P-2.4 (Application State Machine) per the
Portal Epic 1 retrospective (2026-04-05) Critical Path item #3.

## 1. Terminology

Two enum values share the literal string `rejected` but carry different semantics,
owners, and terminality. Prose and exported constants in the codebase must distinguish them:

- **`JOB_REJECTED`** — refers to `portal_job_postings.status === 'rejected'`. Set by
  an admin during review when a job posting is not fit for publication. **Non-terminal**
  — loops back to `pending_review` via edit-and-resubmit (see §3 and TD-1 in the tech spec).
  Owned by admin on entry; owned by employer on exit.
- **`APPLICATION_REJECTED`** — refers to `portal_applications.status === 'rejected'`.
  Set by an employer declining a candidate. **Hard terminal** — no outgoing transitions.
  Owned by employer.

Any code or doc referring to "rejected" without qualification should be treated as
ambiguous and clarified in review.

### `closedOutcome` is advisory, not a state discriminator

The `portal_closed_outcome` enum (`filled_via_portal`, `filled_internally`, `cancelled`)
is **metadata on top of `filled` status**, populated when a posting closes. All three
outcomes share the exact same terminal invariant: once a job is `filled`, it is
hard-terminal regardless of outcome. UI may read `closedOutcome` for messaging
("This role was filled internally") but **must not branch state logic on it** — it
is not a sub-state. TD-9 in the tech spec captures this rule.

## 2. Ownership Boundaries

### Job posting state machine

Ownership follows the `VALID_TRANSITIONS` table in
`apps/portal/src/services/job-posting-service.ts`:

```ts
const VALID_TRANSITIONS: Record<PortalJobStatus, PortalJobStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["active", "rejected", "draft"],
  active: ["paused", "pending_review", "filled"],
  paused: ["active", "filled"],
  filled: [],
  expired: ["active", "pending_review", "filled"],
  rejected: ["pending_review"],
};
```

Actor → allowed transitions:

| Actor        | Allowed transitions                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Employer** | `draft → pending_review`, `active → paused`, `active → pending_review`, `active → filled`, `paused → active`, `paused → filled`, `expired → active`, `expired → pending_review`, `expired → filled`, `rejected → pending_review` |
| **Admin**    | `pending_review → active`, `pending_review → rejected`, **`pending_review → draft`** (P-3.2 request-changes path; see `ADMIN_ONLY_TRANSITIONS` in `job-posting-service.ts`)                                                      |

`filled` is a sink — no outgoing transitions for any actor.

### Application state machine

The service-layer transition table for applications does not yet exist; P-2.4 owns it.
PREP-A documents ownership rules only:

| Actor        | Allowed transitions                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Employer** | `submitted → under_review → shortlisted → interview → offered → hired`, any non-terminal `→ rejected` |
| **Seeker**   | Any non-terminal `→ withdrawn` (independent of employer action)                                       |

Exact forward transitions between non-terminal employer-owned states are P-2.4's
decision. What is fixed here: seeker may `withdraw` from any non-terminal state at
any time, and employer controls all other application-side transitions.

## 3. Terminal State Policy

### Formal sets

**Job posting machine:**

- `JOB_HARD_TERMINAL_STATES = ['filled']`
- `JOB_SOFT_TERMINAL_STATES = ['expired']`
- Non-terminal: `draft`, `pending_review`, `active`, `paused`, `rejected`

**Application machine:**

- `APPLICATION_TERMINAL_STATES = ['hired', 'rejected', 'withdrawn']` (all hard)
- Non-terminal: `submitted`, `under_review`, `shortlisted`, `interview`, `offered`
- No soft-terminal concept for applications.

### Hard vs soft terminal

- **Hard terminal** — no event of any kind may touch this row's `status`. The
  machine has reached a final resting state.
- **Soft terminal** — may be touched **only** by an explicit owner-initiated
  renew event. For `expired`, this is the P-1.5 renew flow (`expired → active`,
  `expired → pending_review`, `expired → filled`).

### TD-1: `rejected` is NOT a hard terminal for job postings

The retro loosely described rejected postings as "terminal." The code contradicts
this: the `VALID_TRANSITIONS` table in
`apps/portal/src/services/job-posting-service.ts` allows
`rejected → pending_review`. This is the **edit-and-resubmit revision loop** — when
an admin rejects a posting, the employer can revise and resubmit for another review
cycle. `rejected` is therefore non-terminal.

The single source of truth for job-posting transitions is the
`VALID_TRANSITIONS` table in `apps/portal/src/services/job-posting-service.ts`.
If `rejected` should ever become truly terminal, that is a design change to the
job posting machine (likely introducing a separate `draft_from_rejected` status) —
not a PREP-A concern.

### TD-10: `offered` is NOT a terminal for applications

`offered` has two legitimate forward transitions (`→ hired`, `→ rejected`) and is
therefore non-terminal. Timeout / auto-expiry of unreplied offers is a P-2.4 concern
surfaced in §10.

## 4. Core Invariants

1. **No external event touches a hard-terminal application.** Once an application
   reaches `hired`, `rejected`, or `withdrawn`, no service, job, webhook, or scheduled
   task may mutate its `status`. Zero exceptions.
2. **No external event touches a hard-terminal job posting.** Once a job reaches
   `filled`, no service, webhook, or scheduled task may mutate its `status`. Zero exceptions.
3. **Application status is never silently mutated by job posting transitions.** No
   write to `portal_applications.status` may originate from a `portal_job_postings.status`
   change. Parent-closed state must be derived at read time, not written.

## 5. Cascade Policy

**Principle:** application status is never silently mutated by job posting transitions.
Zero writes to `portal_applications.status` from job posting state changes.

**Derived view.** A "parent closed" flag is computed at query time via a JOIN on
`portal_job_postings.status IN JOB_HARD_TERMINAL_STATES`. UI surfaces this as a
banner or badge ("This role has been filled"); underlying application state stays
authoritative and independent.

**Employer obligation (policy-only, implemented in P-2.4).** When an employer
initiates a hard-terminal job transition (e.g., `active → filled`) while non-terminal
applications are still open, they must be prompted to batch-resolve those
applications (hire / reject) or explicitly acknowledge. This prompt is a UX
requirement for P-2.4; it does **not** change the cascade principle — any writes
it produces are explicit, employer-initiated application-machine transitions, not
silent cascades.

**Seeker independence.** A seeker may `withdraw` from their application at any
time, regardless of parent job state, unless the application is already in a
hard-terminal state.

## 6. Application-Creation Preconditions

New applications are accepted **only when the parent job has status `active`**.
All other statuses (`draft`, `pending_review`, `paused`, `filled`, `expired`,
`rejected`) reject creation.

This is encoded as `canAcceptApplications(jobStatus)` in
`packages/db/src/schema/portal-applications.ts`. The strict single-status rule is
deliberate (TD-3): `paused` is a reversible employer-initiated hold, and permitting
applications during a pause would create ambiguity about whether the seeker should
retry.

## 7. Application Status Classification

| Status         | Classification | Notes                                                   |
| -------------- | -------------- | ------------------------------------------------------- |
| `submitted`    | Non-terminal   | Initial state after successful creation.                |
| `under_review` | Non-terminal   | Employer is reviewing.                                  |
| `shortlisted`  | Non-terminal   | Employer has shortlisted for further consideration.     |
| `interview`    | Non-terminal   | Interview scheduled / in progress.                      |
| `offered`      | Non-terminal   | Offer extended. Forward paths: `→ hired`, `→ rejected`. |
| `hired`        | Hard terminal  | Final — no outgoing transitions.                        |
| `rejected`     | Hard terminal  | Employer-declined. Final.                               |
| `withdrawn`    | Hard terminal  | Seeker-initiated withdrawal. Final.                     |

## 8. Job Posting Status × Application Status Invariant Table

Structured as a **default + exceptions** pattern. The default row below applies to
all 8 application statuses unless an explicit exception sub-row overrides it.

**Default behaviour** (for every job status row):

- (a) **New-application acceptance** — as specified per row below.
- (b) **Allowed application transitions** — employer retains full control on
  non-terminal applications; seeker may `withdraw` any non-terminal application at any time.
- (c) **Side effects on the parent job** — none. Application transitions never write
  to the parent job. Cascade principle (§5).

| Job status       | New applications accepted? | Default transitions (per §5/§6)                                                                          | Exceptions |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `draft`          | ❌ No                      | Seeker may `withdraw` any non-terminal app; employer controls non-terminal employer-side transitions.    | None.      |
| `pending_review` | ❌ No                      | Same default.                                                                                            | None.      |
| `active`         | ✅ Yes                     | Same default. This is the only status where new applications can be created.                             | None.      |
| `paused`         | ❌ No                      | Same default — existing applications continue to progress normally during the pause.                     | None.      |
| `filled`         | ❌ No                      | Same default. Employer batch-resolve prompt triggers on the `→ filled` transition (§5).                  | None.      |
| `expired`        | ❌ No                      | Same default. If employer renews to `active`, new applications become acceptable again.                  | None.      |
| `rejected`       | ❌ No                      | Same default. If employer resubmits and admin approves, status returns to `active` and acceptance opens. | None.      |

**Key takeaway.** Every cell in the 7 × 8 product obeys a single cascade rule: the
job posting state has no authority to mutate an application's state. The only
direct coupling is creation gating (`active` only).

## 9. Stress-Test Checklist

Walked 2026-04-08. Reviewer: Charlie (stress-test reviewer), co-signed by Winston.
Time-boxed ~15 minutes.

For each of the 7 job statuses, Charlie confirmed the default row in §8 applies
to all 8 application statuses:

1. **`draft`** — Default applies. No exception. No applications can exist against
   a draft (creation gated to `active`); hypothetical existing applications from
   prior `active` → back to `draft` admin request-changes path stay owned by
   their respective actors. No parent-side effect.
2. **`pending_review`** — Default applies. No exception. Same reasoning as `draft`.
3. **`active`** — Default applies. This is the one status where creation is
   permitted; the 8 application statuses progress per §2/§7 with normal employer
   - seeker ownership.
4. **`paused`** — Default applies. Confirmed: existing applications explicitly
   continue to progress during a pause — employer may continue to shortlist,
   interview, offer, hire, or reject. No silent freeze.
5. **`filled`** — Default applies. The `active → filled` transition triggers the
   P-2.4 employer batch-resolve prompt (§5). Seeker withdraw remains independent.
   No silent cascade.
6. **`expired`** — Default applies. Existing applications continue in their
   current state; employer may still hire/reject (resolving them explicitly) or
   seeker may withdraw. Renewal (`expired → active`) re-opens creation.
7. **`rejected`** — Default applies. Same reasoning as `pending_review` — admin
   has rejected the posting, applications (if any from a prior `active` window)
   stay in their owned states, no cascade.

**Result:** zero exceptions surfaced. The default-plus-exceptions pattern
collapses the 7 × 8 = 56 cell matrix into 7 walk decisions, all resolving to
"default applies." No invariant violations found. No code changes required.

**Charlie sign-off:** 2026-04-08 — default applies for all 7 rows. No exceptions.
**Winston co-sign:** 2026-04-08 — confirmed.

## 10. Open Questions for P-2.4

These questions were surfaced during PREP-A but are out of scope for this
deliverable. They feed directly into the P-2.4 story spec:

1. **Offer timeout / auto-expiry.** Does an `offered` application auto-transition
   (and to what) if the seeker does not respond within a defined window? Or does
   it stay in `offered` indefinitely? PREP-A does not decide — `offered` is
   classified non-terminal and owns no timeout behaviour today.
2. **Re-application after `withdrawn`.** If a seeker `withdraws` and the job is
   still `active`, may they re-apply? If so, do we allow a new row or surface the
   old one? Connects to the schema gap below.
3. **Schema gap: no unique constraint on `(jobId, seekerUserId)`.** `portal_applications`
   currently has no unique index on `(jobId, seekerUserId)`. Re-application
   semantics (block duplicates? allow after `withdrawn`? allow after `rejected`?)
   and the corresponding DB constraint are P-2.4 decisions. PREP-A notes the gap;
   does not decide it or add a migration.
4. **Batch-resolve prompt shape.** What does the employer-facing prompt look like
   when `active → filled` is initiated with N open non-terminal applications?
   Modal list with per-row hire/reject choices? Bulk-action? This is a UX decision
   for P-2.4.
5. **Re-application after `rejected`.** If an employer rejects an application and
   the job stays `active`, may the seeker re-apply? Same structural question as
   #2 above; listed separately because the answer may legitimately differ
   (employer-driven rejection vs seeker-driven withdrawal).
