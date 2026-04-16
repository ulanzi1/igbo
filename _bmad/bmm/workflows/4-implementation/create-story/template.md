# Story {{epic_num}}.{{story_num}}: {{story_title}}

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a {{role}},
I want {{action}},
so that {{benefit}}.

## Acceptance Criteria

1. [Add acceptance criteria from epics/PRD]

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` → §7 Frontend Safety & Readiness

<!--
  GATE 1: Stories cannot enter development until every sub-section below
  is either fully checked OR explicitly marked [N/A] with a one-line
  justification. Faking checkmarks is a process violation — see the
  audit rules under each sub-section.
-->

### i18n Key Inventory

**Purpose:** Ensure every user-visible string ships with a translation key so bilingual launch (en + ig) is never blocked on copy archaeology.
**Owner:** SM (inventory + English copy) + Dev (implementation, Igbo copy at Dev Completion)
**Audit rule:** Every user-facing string present in the UI mocks, wireframes, OR AC copy MUST appear as an enumerated key below with English copy and key name. One string = one row. Missing rows = incomplete gate. **Igbo translations are NOT required at SN-5** — they are a Dev Completion obligation (see SN-1) so stories are not blocked on translator availability.

- [ ] Every user-facing string in the UI mocks / ACs maps to a key below
- [ ] English copy filled in for every row
- [ ] Keys reserved in `apps/<app>/messages/en.json` (Igbo copy at Dev Completion)
- [ ] **OR** \[N/A\] — this story has no user-facing strings. Justification: _______
- Keys:
  - `Namespace.keyName` — English copy — (Igbo copy added at Dev Completion)

### Sanitization Points

**Purpose:** Make every HTML-rendering surface explicit and sanitized, so XSS risk cannot hide in an unreviewed `dangerouslySetInnerHTML`.
**Owner:** SM (surface inventory) + Dev (sanitizeHtml call)
**Audit rule:** Every `dangerouslySetInnerHTML` introduced by this story must appear below with either a `sanitizeHtml()` call or an allowlist comment + justification. `pnpm ci-checks` is the backstop.

- [ ] Every HTML rendering surface in this story is listed below
- [ ] Each listed surface uses `sanitizeHtml()` OR has an explicit `// ci-allow-unsanitized-html` justification
- [ ] **OR** \[N/A\] — this story renders no HTML from strings. Justification: _______
- Surfaces: (file:line) — sanitize mechanism — justification

### Accessibility Patterns

**Purpose:** Prevent keyboard, screen-reader, and focus regressions by naming every accessibility obligation before code is written — not discovering gaps in review.
**Owner:** SM (pattern list) + Dev (axe assertions)
**Audit rule:** Every new interactive element (button, form field, dialog, menu, tab, etc.) must list its keyboard pattern AND ARIA markup AND planned axe assertion AND focus management plan.

- [ ] Keyboard interaction pattern documented for every new interactive element
- [ ] ARIA roles/labels listed for every semantically meaningful element
- [ ] **Focus management plan documented for every modal / dropdown / route transition in this story** (focus restore on close, initial focus target, focus trap for modals)
- [ ] axe-core assertions planned in component tests
- [ ] **OR** \[N/A\] — this story ships no new UI. Justification: _______
- Elements:

### Component Dependencies

**Purpose:** Catch missing shadcn/ui (or other vendored) components at story drafting time, not mid-implementation — preventing P-1 pattern where devs discovered missing components while building.
**Owner:** SM (inventory) + Dev (import verification)
**Audit rule:** Every shadcn/ui or vendored component referenced by this story must already exist in `apps/<app>/src/components/ui/`. If missing, add it as a Task 0 subtask so the dev agent does not discover the gap mid-implementation.

- [ ] Every shadcn/ui (or other vendored) component this story needs is listed below
- [ ] Verified present in `apps/<app>/src/components/ui/` OR added as a Task 0 subtask
- [ ] **OR** \[N/A\] — this story adds no new component dependencies. Justification: _______
- Components:

### Codebase Verification

**Purpose:** Prevent story specs from referencing fields, file paths, types, or API patterns that don't exist in the current codebase — eliminating "field doesn't exist" errors that consumed review/fix cycles in Portal Epic 2 (P-2.7 `posting?.createdByUserId`, P-2.9 wrong file path, P-2.10 `Dialog` instead of `AlertDialog`).
**Owner:** SM (verification at story creation time)
**Audit rule:** Every field name, file path, type/interface name, and API route referenced in Dev Notes or Tasks MUST be verified against the current codebase. Any reference that doesn't exist must be corrected or flagged as "to be created in this story" with the exact location.

- [ ] All referenced DB field names verified against current Drizzle schema
- [ ] All referenced file paths verified to exist (or explicitly marked as new files this story creates)
- [ ] All referenced TypeScript types/interfaces verified against current source
- [ ] All referenced API route paths verified against current route tree
- [ ] All referenced component names verified in `apps/<app>/src/components/`
- [ ] **OR** \[N/A\] — this story references no existing codebase artifacts. Justification: _______
- Verified references:
  - `field/path/type` — verified at `source-location` | OR: new, created in Task N

### Story Sizing Check

**Purpose:** Catch oversized stories at planning time — not mid-implementation. Stories touching 3+ system axes tend to be disproportionately large and should be split proactively.
**Owner:** SM (checks at story creation)
**Source:** `docs/monorepo-playbook.md` → §11.5 Story Sizing Guardrail
**Audit rule:** Count the system axes this story touches. If 3+, justify why the story should not be split.

System axes: (1) DB queries/schema, (2) Services, (3) API routes, (4) UI components, (5) Cross-feature integration

- [ ] System axes count: _____ (list which ones)
- [ ] If 3+ axes: justification for keeping as single story — _______________
- [ ] **OR** story split into: _______________

### Agent Model Selection

**Purpose:** Ensure model choice is a conscious story-level decision matching complexity to capability, preventing both over-spending (opus for simple CRUD) and under-powering (sonnet for complex multi-component UIs).
**Owner:** SM (selects with dev input)
**Source:** `docs/monorepo-playbook.md` → §11 Agent Model Selection
**Audit rule:** Every story must declare an agent model. Opus requires justification referencing at least one §11 complexity indicator.

- [ ] Agent model selected: `claude-sonnet-4-6` / `claude-opus-4-6`
- [ ] If opus: justification references §11 criteria — _______________
- [ ] **OR** \[N/A\] — this story is documentation/process only. Justification: _______

## Validation Scenarios (SN-2 — REQUIRED)

<!--
  GATE: Stories without validation scenarios cannot start development.
  Write from the end-user perspective. Each scenario describes a flow that
  must be demonstrated as working before the story can move to review.
  Evidence (screenshots, logs, or demonstrated flow) is required for each.
-->

1. **[Scenario name]** — [User-facing description of the flow to verify]
   - Expected outcome: [What the user should see/experience]
   - Evidence required: [Screenshot / log output / demonstrated flow]

## Flow Owner (SN-4)

<!-- Who is responsible for verifying the complete end-to-end flow works? -->

**Owner:** {{flow_owner}}

## Tasks / Subtasks

- [ ] Task 1 (AC: #)
  - [ ] Subtask 1.1
- [ ] Task 2 (AC: #)
  - [ ] Subtask 2.1

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Integration Tests (SN-3 — Missing Middle)

<!--
  Identify tests that verify real connections between components —
  not just unit tests with mocks, not full E2E. Examples:
  - "Service X calls real database query Y"
  - "WebSocket reconnection works against real server"
  - "API route returns correct response with real middleware chain"
-->

- [List integration test requirements for this story]

### Project Structure Notes

- Alignment with unified project structure (paths, modules, naming)
- Detected conflicts or variances (with rationale)

### References

- Cite all technical details with source paths and sections, e.g. [Source: docs/<file>.md#Section]

## Definition of Done (SN-1)

<!--
  GATE: A story is not done when tasks are complete and tests pass.
  A story is done when the feature works for a user in a real or realistic environment.
  All items must be checked before moving to review.
-->

- [ ] All acceptance criteria met
- [ ] All validation scenarios demonstrated with evidence
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing (SN-3)
- [ ] Flow owner has verified the complete end-to-end chain
- [ ] No pre-existing test regressions introduced
- [ ] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [ ] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory** (deferred from SN-5 per i18n gate split)
- [ ] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [ ] Dev Completion: all a11y patterns listed in Readiness (including focus management) have passing axe-core assertions
- [ ] Dev Completion: all component dependencies in Readiness are imported and rendering
- [ ] Dev Completion: all codebase references in Readiness verified at implementation time (no stale refs)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Validation Evidence

<!-- Attach or link evidence for each validation scenario before moving to review -->

### Debug Log References

### Completion Notes List

### File List
