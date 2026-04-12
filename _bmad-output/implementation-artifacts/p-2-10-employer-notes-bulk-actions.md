# Story P-2.10: Employer Notes & Bulk Actions

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an employer,
I want to add private notes to applications and perform bulk actions on multiple candidates,
so that I can keep track of my evaluation and efficiently manage large applicant pools.

## Acceptance Criteria

1. **Add private note to application** — Given an employer is viewing a candidate's application (in pipeline side panel or detail view), when they click "Add Note", then a text input appears where they can write a private note (max 2000 chars). Notes are saved to a `portal_application_notes` table with: id, application_id (FK), author_user_id (FK), content, created_at. Notes are only visible to the employer (and other employer team members in future) — never to the seeker. Multiple notes can be added to the same application (chronological list).

2. **Bulk action toolbar with checkboxes** — Given an employer wants to perform bulk actions, when they select multiple candidate cards (via checkboxes in the pipeline view), then a bulk action toolbar appears with options: "Advance" (move all to next valid stage), "Reject" (move all to rejected), "Message" (compose message to all selected — placeholder for Epic 5). Bulk advance only proceeds for candidates whose current stage has a valid "next" transition; others are skipped with a notification. Bulk reject prompts for an optional reason that is applied to all selected candidates.

3. **Bulk reject via state machine** — Given the employer performs a bulk reject, when the action completes, then each application is transitioned via the state machine individually (not a raw SQL update). Each transition emits the `application.status_changed` event (with `toStatus: "rejected"`) via the state machine's post-commit EventBus — there is no separate `portal.application.rejected` event type. A summary shows: "X candidates rejected, Y skipped (already in terminal state)".

4. **Notes chronological display** — Given an employer views the notes for an application, when the notes section loads, then notes are displayed in chronological order (newest last). Each note shows the author name, timestamp, and content. Notes cannot be edited or deleted after creation (audit integrity).

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` -> Section 7 Frontend Safety & Readiness

### i18n Key Inventory

- [x] Every user-facing string in the UI mocks / ACs maps to a key below
- [x] English copy filled in for every row
- [x] Keys reserved in `apps/portal/messages/en.json` (Igbo copy at Dev Completion)

Keys (under `Portal.ats.notes.*` and `Portal.ats.bulk.*`):

**Notes section (side panel):**
- `Portal.ats.notes.heading` — "Notes"
- `Portal.ats.notes.addNote` — "Add Note"
- `Portal.ats.notes.placeholder` — "Write a private note about this candidate..."
- `Portal.ats.notes.submit` — "Save Note"
- `Portal.ats.notes.saving` — "Saving..."
- `Portal.ats.notes.empty` — "No notes yet"
- `Portal.ats.notes.emptyDescription` — "Add private notes to track your evaluation of this candidate."
- `Portal.ats.notes.maxLength` — "{count}/2000"
- `Portal.ats.notes.saveSuccess` — "Note saved"
- `Portal.ats.notes.saveError` — "Failed to save note"
- `Portal.ats.notes.loadError` — "Failed to load notes"
- `Portal.ats.notes.by` — "by {author}"
- `Portal.ats.notes.ariaSection` — "Private employer notes"
- `Portal.ats.notes.ariaForm` — "Add a new note"

**Bulk actions toolbar:**
- `Portal.ats.bulk.selected` — "{count} selected"
- `Portal.ats.bulk.clearSelection` — "Clear selection"
- `Portal.ats.bulk.advance` — "Advance"
- `Portal.ats.bulk.reject` — "Reject"
- `Portal.ats.bulk.message` — "Message"
- `Portal.ats.bulk.messageDisabled` — "Messaging coming soon"
- `Portal.ats.bulk.confirmReject` — "Reject {count} candidates?"
- `Portal.ats.bulk.rejectReasonPlaceholder` — "Optional reason for rejection..."
- `Portal.ats.bulk.rejectReasonLabel` — "Reason (optional)"
- `Portal.ats.bulk.cancel` — "Cancel"
- `Portal.ats.bulk.confirmAction` — "Confirm"
- `Portal.ats.bulk.processing` — "Processing..."
- `Portal.ats.bulk.advanceSummary` — "{advanced} advanced, {skipped} skipped"
- `Portal.ats.bulk.rejectSummary` — "{rejected} rejected, {skipped} skipped"
- `Portal.ats.bulk.error` — "Bulk action failed"
- `Portal.ats.bulk.ariaToolbar` — "Bulk actions for selected candidates"
- `Portal.ats.bulk.ariaCheckbox` — "Select {name}"
- `Portal.ats.bulk.ariaSelectAll` — "Select all candidates in {column}"

### Sanitization Points

- [x] **[N/A]** — This story renders no HTML from user-input strings via `dangerouslySetInnerHTML`. Note content is rendered as plain text via `<p>` elements with `whitespace-pre-wrap`. No `dangerouslySetInnerHTML` introduced.

### Accessibility Patterns

- [x] Keyboard interaction pattern documented for every new interactive element
- [x] ARIA roles/labels listed for every semantically meaningful element
- [x] **Focus management plan documented for every modal / dropdown / route transition in this story**
- [x] axe-core assertions planned in component tests

Elements:

- **NotesSection** (inside CandidateSidePanel): `aria-labelledby="csp-notes-heading"`. Notes list: `role="list"`. Individual notes: `role="listitem"`. "Add Note" form: `role="form"`, `aria-label={t("notes.ariaForm")}`. Textarea: `aria-label={t("notes.placeholder")}`, `maxLength=2000`. Submit button: disabled when empty or saving, with loading text swap. Keyboard: Tab to textarea, Enter/Cmd+Enter to submit (configurable), Tab to save button.
- **BulkActionToolbar**: `role="toolbar"`, `aria-label={t("bulk.ariaToolbar")}`. Appears above the kanban board when `selectedIds.size > 0`. Contains: selected count label, "Advance" button, "Reject" button, "Message" button (disabled), "Clear" button. Keyboard: Tab through toolbar buttons. ESC clears selection (keyboard shortcut). Buttons are disabled during processing.
- **Candidate card checkboxes**: Each card gets a `<Checkbox>` (shadcn/ui) with `aria-label={t("bulk.ariaCheckbox", { name: seekerName })}`. Checkbox is visually positioned top-left of card. Click on checkbox does NOT open side panel (event stops propagation). Shift+Click selects range (standard multi-select pattern). Column headers get "Select all in column" checkbox: `aria-label={t("bulk.ariaSelectAll", { column: columnName })}`.
- **BulkRejectModal**: Uses `AlertDialog` from shadcn/ui. `role="alertdialog"`. **Focus management**: Focus moves to the textarea (optional reason) on open. Focus traps inside dialog. Focus returns to the "Reject" toolbar button on close (Radix handles automatically). ESC cancels. Contains: warning text, optional reason textarea (max 500 chars), Cancel + Confirm buttons.
- **axe assertions**: Planned for: (a) notes section with notes, (b) notes section empty state, (c) bulk toolbar visible with selection, (d) bulk reject modal open, (e) card with checkbox.

### Component Dependencies

- [x] Every shadcn/ui component this story needs is listed below
- [x] Verified present in `apps/portal/src/components/ui/` OR added as Task 0 subtask

Components:

- `Checkbox` — **CONFIRMED MISSING** — must add as Task 0 subtask: `cd apps/portal && npx shadcn@latest add checkbox`
- `Textarea` — existing (`apps/portal/src/components/ui/textarea.tsx`)
- `AlertDialog` + `AlertDialogContent` + `AlertDialogHeader` + `AlertDialogTitle` + `AlertDialogDescription` + `AlertDialogFooter` + `AlertDialogCancel` + `AlertDialogAction` — existing (`apps/portal/src/components/ui/alert-dialog.tsx`)
- `Button` — existing
- `Badge` — existing
- `Card` — existing
- `Sheet` — existing (used by CandidateSidePanel)
- `ScrollArea` — existing (installed in P-2.9)
- Toast/Sonner — existing

## Validation Scenarios (SN-2 — REQUIRED)

1. **Add a note to an application** — Employer opens side panel for a candidate, scrolls to Notes section, types "Strong candidate — schedule interview", clicks "Save Note". Note appears in the list with author name and timestamp.
   - Expected outcome: Note persisted in DB, displayed in chronological list, textarea cleared
   - Evidence required: Component test + API route test

2. **Notes persist across panel close/reopen** — Employer adds 2 notes, closes side panel, reopens it. Both notes are still there in chronological order.
   - Expected outcome: Notes fetched from API on panel open, display matches order
   - Evidence required: Component test with mocked fetch

3. **Notes are immutable** — No edit or delete buttons are shown on notes. No API endpoint exists for editing or deleting notes.
   - Expected outcome: Notes render read-only; no mutation endpoints exist
   - Evidence required: Component test (no edit/delete buttons), API route test (only POST and GET)

4. **Bulk select candidates with checkboxes** — Employer clicks checkboxes on 3 candidate cards. Toolbar appears showing "3 selected" with Advance, Reject, Message buttons.
   - Expected outcome: Toolbar renders with correct count, all 3 cards show checked state
   - Evidence required: Component test

5. **Bulk advance** — 3 candidates selected: 2 in "submitted" status, 1 in "interview". Employer clicks "Advance". Result: 2 moved to "under_review", 1 moved to "offered". Toast: "3 advanced, 0 skipped".
   - Expected outcome: Each transition through state machine individually, events emitted
   - Evidence required: API route test + service test

6. **Bulk advance with skips** — 3 candidates selected: 2 in "submitted", 1 in "hired" (terminal). Employer clicks "Advance". Result: 2 advanced, 1 skipped. Toast: "2 advanced, 1 skipped".
   - Expected outcome: Terminal state candidates skipped gracefully, summary accurate
   - Evidence required: API route test

7. **Bulk reject with reason** — Employer selects 4 candidates, clicks "Reject". Modal appears with optional reason textarea. Employer types "Position filled", clicks Confirm. All 4 transitioned to rejected with reason.
   - Expected outcome: Each transitioned via state machine with reason, events emitted, summary shown
   - Evidence required: API route test + modal component test

8. **Bulk reject skips terminal states** — 3 selected: 2 active, 1 already withdrawn. After reject: "2 rejected, 1 skipped (already in terminal state)".
   - Expected outcome: Withdrawn candidate skipped, summary accurate
   - Evidence required: API route test

9. **Notes only visible to employer** — Notes have no API endpoint accessible by seekers. The detail route for seekers (`GET /api/v1/applications/[id]`) does not return notes.
   - Expected outcome: Notes isolated to employer-only endpoints
   - Evidence required: Verify seeker detail route does not include notes field

10. **Employer ownership check for notes** — Employer A tries to add a note to Employer B's candidate. Returns 404.
    - Expected outcome: 404, no data leakage
    - Evidence required: API route test

## Flow Owner (SN-4)

**Owner:** Dev (full stack — new DB table + migration, 3 new API routes, notes section in side panel, bulk action toolbar + modal, kanban board multi-select state, with manual verification on seeded employer dashboard)

## Tasks / Subtasks

- [ ] Task 0: Component dependency verification & reference patterns (AC: all)
  - [ ] 0.1 Install `Checkbox` (confirmed missing): `cd apps/portal && npx shadcn@latest add checkbox`
  - [ ] 0.2 `Textarea` — confirmed present at `apps/portal/src/components/ui/textarea.tsx` — no install needed
  - [ ] 0.3 `AlertDialog` — confirmed present at `apps/portal/src/components/ui/alert-dialog.tsx` — no install needed
  - [ ] 0.4 Read `apps/portal/src/components/domain/candidate-side-panel.tsx` — understand `PanelContent` rendering structure. The panel currently has **6 sections**: Profile, Community Trust, Cover Letter, Resume, Portfolio, Timeline. Notes section inserts AFTER Timeline section (last section in current layout), making it the **7th** section. The `CandidateDetailResponse` interface must be extended with `notes: ApplicationNote[]`.
  - [ ] 0.5 Read `apps/portal/src/components/domain/ats-kanban-board.tsx` — understand the current board props and state. Multi-select checkboxes and toolbar must integrate with existing `DndContext` without conflicting. Checkbox clicks must NOT trigger drag operations.
  - [ ] 0.6 Read `apps/portal/src/components/flow/ats-pipeline-view.tsx` — understand the flow wrapper. Bulk action state (selectedIds) should be managed here and passed down to the board. Toolbar renders between title and board.
  - [ ] 0.7 Read `apps/portal/src/services/application-state-machine.ts` — confirm `transition()` signature: `(applicationId, toStatus, actorUserId, actorRole, reason?)`. Bulk actions call this N times (not batch SQL).
  - [ ] 0.8 Read `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts` — this route must be extended to also return notes.
  - [ ] 0.9 Read `apps/portal/src/app/api/v1/applications/[applicationId]/status/route.ts` — reference for status transition pattern (used by bulk advance/reject).
  - [ ] 0.10 Read `packages/db/src/schema/portal-applications.ts` — existing schema for FK references. Note the `portalApplicationStatusEnum` values for validation.

- [ ] Task 1: DB migration + schema — portal_application_notes table (AC: 1, 4)
  - [ ] 1.1 Create migration file `packages/db/src/migrations/0065_employer_application_notes.sql`:
    ```sql
    CREATE TABLE IF NOT EXISTS "portal_application_notes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "application_id" uuid NOT NULL REFERENCES "portal_applications"("id") ON DELETE CASCADE,
      "author_user_id" uuid NOT NULL REFERENCES "auth_users"("id") ON DELETE RESTRICT,
      "content" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "portal_application_notes_app_id_created_idx"
      ON "portal_application_notes" ("application_id", "created_at" ASC);
    ```
  - [ ] 1.2 Add journal entry to `packages/db/src/migrations/meta/_journal.json`: `{ "idx": 65, "version": "7", "when": 1708000065000, "tag": "0065_employer_application_notes", "breakpoints": true }`
  - [ ] 1.3 Create Drizzle schema in `packages/db/src/schema/portal-application-notes.ts`:
    - `portalApplicationNotes` table with columns: id (uuid PK), applicationId (FK → portalApplications, CASCADE), authorUserId (FK → authUsers, RESTRICT), content (text NOT NULL), createdAt (timestamp DEFAULT now)
    - Export types: `PortalApplicationNote`, `NewPortalApplicationNote`
    - Index on (applicationId, createdAt ASC)
  - [ ] 1.4 Register schema in `packages/db/src/index.ts`: add `import * as portalApplicationNotesSchema from "./schema/portal-application-notes"` and spread into `createDrizzleClient` call (follow existing pattern)
  - [ ] 1.5 Tests: Schema test verifying table columns and types exist

- [ ] Task 2: DB queries — notes CRUD + bulk ownership (AC: 1, 4)
  - [ ] 2.1 Create `packages/db/src/queries/portal-application-notes.ts`:
    - `createApplicationNote(data: { applicationId: string; authorUserId: string; content: string })` — INSERT + RETURNING
    - `getNotesByApplicationId(applicationId: string)` — SELECT with LEFT JOIN authUsers for author name, ordered by createdAt ASC (oldest first = "newest last" when displayed bottom-to-top). Return `{ id, applicationId, authorUserId, authorName, content, createdAt }[]`
    - Export type `ApplicationNote = { id: string; applicationId: string; authorUserId: string; authorName: string | null; content: string; createdAt: Date }` — export this from the file so portal can import from `@igbo/db`
  - [ ] 2.2 Add `getApplicationsByIds(ids: string[], companyId: string)` to `packages/db/src/queries/portal-applications.ts` — batch query using Drizzle `inArray(portalApplications.id, ids)` with an inner join to `portalJobPostings` filtering `portalJobPostings.companyId = companyId`. Returns all matching applications with their current status. This is the **required** efficient ownership verification for the bulk route (avoids N individual queries for up to 50 IDs). Used only by the bulk status route.
  - [ ] 2.3 Export all new query functions and the `ApplicationNote` type from `packages/db/src/index.ts` (add to existing exports)
  - [ ] 2.4 Tests: `portal-application-notes.test.ts` — create note returns data, get notes returns chronological order with author name, get notes for nonexistent application returns empty array
  - [ ] 2.5 Tests: `getApplicationsByIds` — returns only applications matching both ids AND companyId, returns empty array when no match, handles single-element array

- [ ] Task 3: Notes API routes (AC: 1, 4)
  - [ ] 3.1 Create `apps/portal/src/app/api/v1/applications/[applicationId]/notes/route.ts`:
    - **Zod import**: `import { z } from "zod/v4"` — NOT `"zod"` (established project pattern; wrong import compiles but breaks schema at runtime)
    - **`requireEmployerRole()` import**: check `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts` for the exact import path and use the same one consistently
    - `POST` handler: `withApiHandler`, `requireEmployerRole()`. Extract applicationId from URL (`new URL(req.url).pathname.split("/").at(-2)` — notes is the last segment, applicationId is second-to-last). Validate body: `z.object({ content: z.string().min(1).max(2000) })`. Verify ownership (get application → get job posting → verify companyId matches employer's company). Call `createApplicationNote({ applicationId, authorUserId: session.user.id, content })`. Return `successResponse(note, 201)`.
    - `GET` handler: `withApiHandler`, `requireEmployerRole()`. Extract applicationId. Verify ownership. Call `getNotesByApplicationId(applicationId)`. Return `successResponse({ notes })`. **Note:** The primary UI flow uses `initialNotes` from the detail route + optimistic append after POST. This GET route exists for future pull-to-refresh scenarios — it is not called by the current `NotesSection` component directly.
  - [ ] 3.2 Extend `GET /api/v1/applications/[applicationId]/detail` route to include notes: after fetching trust signals and transitions, also fetch `getNotesByApplicationId(applicationId)` and include in response as `notes`.
  - [ ] 3.3 Tests: `notes/route.test.ts` — POST: 401 (no session), 403 (non-employer), 400 (empty content), 400 (content > 2000 chars), 404 (application not owned), 201 (success). GET: 401, 403, 404 (not owned), 200 with notes array.
  - [ ] 3.4 Tests: Update `detail/route.test.ts` — verify `notes` field is now included in 200 response.

- [ ] Task 4: Bulk actions API route (AC: 2, 3)
  - [ ] 4.1 Create `apps/portal/src/app/api/v1/applications/bulk/status/route.ts`:
    - **Zod import**: `import { z } from "zod/v4"` — NOT `"zod"`
    - `PATCH` handler: `withApiHandler`, `requireEmployerRole()`. Validate body:
      ```typescript
      z.object({
        applicationIds: z.array(z.string().uuid()).min(1).max(50),
        action: z.enum(["advance", "reject"]),
        reason: z.string().max(500).optional(),
      })
      ```
    - **Ownership verification**: Use `getApplicationsByIds(applicationIds, companyId)` (new batch query from Task 2.2) — single DB call. If the returned array length doesn't match `applicationIds.length`, some IDs don't belong to this employer → return 404 for the whole request (fail-closed). Do NOT use N individual `getApplicationWithCurrentStatus()` calls.
    - For "reject" action: Call `transition(applicationId, "rejected", session.user.id, "employer", reason)` for each. Catch errors from terminal states → count as skipped.
    - For "advance" action: For each application, call `getNextAdvanceStatus(currentStatus)`. If null → skip. Otherwise call `transition(applicationId, nextStatus, session.user.id, "employer")`. Catch DB/validation errors → count as skipped.
    - Return `successResponse({ processed: N, skipped: M, results: [{ applicationId, status, error? }] })`.
  - [ ] 4.2 Create helper `getNextAdvanceStatus(currentStatus: PortalApplicationStatus): PortalApplicationStatus | null` as a **private function at the top of the bulk route file** (not exported, not in `application-state-machine.ts` — it's route-specific advance logic). It reads from `VALID_TRANSITIONS` (imported from `application-state-machine.ts`) and returns the first transition where `allowedActors.includes("employer")` and `toStatus !== "rejected"`. Returns `null` for terminal states or when no valid forward transition exists. Do NOT import `EMPLOYER_TRANSITIONS` from client code — `VALID_TRANSITIONS` is the server-authoritative source.
  - [ ] 4.3 Tests: `bulk/status/route.test.ts` — 401, 403, 400 (empty array), 400 (> 50 ids), 404 (application not owned), 200 bulk reject (all succeed), 200 bulk reject (some skipped — terminal states), 200 bulk advance (all succeed), 200 bulk advance (some skipped — no valid next stage), reason applied to all rejected applications.

- [ ] Task 5: NotesSection component (AC: 1, 4)
  - [ ] 5.1 Create `apps/portal/src/components/domain/notes-section.tsx` (`"use client"`). Props: `{ applicationId: string; initialNotes: ApplicationNote[] }`. Import `ApplicationNote` from `@igbo/db` (exported in Task 2.3 — do NOT redefine it inline in the portal).
  - [ ] 5.2 Notes list: Render `initialNotes` in chronological order. Each note shows: author name (bold), timestamp (formatted via `useFormatter()`), content (plain text with `whitespace-pre-wrap`). If no notes: empty state message. Use `useDensity()` for density-aware padding/gaps consistent with the rest of the panel.
  - [ ] 5.3 "Add Note" form: Textarea (max 2000 chars) + character counter + "Save Note" button. Submit calls `POST /api/v1/applications/[id]/notes`. On success: append note to local list (optimistic append to component state — no re-fetch needed; the detail route provides `initialNotes` on panel open), clear textarea, show success toast. On error: show error toast.
  - [ ] 5.4 Notes are read-only after creation — no edit/delete UI.
  - [ ] 5.5 Tests: `notes-section.test.tsx` — renders notes list, empty state, add note form, submit success (optimistic append), submit error (toast), character counter, max length validation, axe assertion.

- [ ] Task 6: Integrate NotesSection into CandidateSidePanel (AC: 1, 4)
  - [ ] 6.1 Extend `CandidateDetailResponse` interface in `candidate-side-panel.tsx` to add `notes: ApplicationNote[]`. Import `ApplicationNote` from `@igbo/db` — do NOT redefine the type locally. The type was exported from `packages/db/src/queries/portal-application-notes.ts` and re-exported via `packages/db/src/index.ts` in Task 2.3.
  - [ ] 6.2 Add notes section after Timeline section in `PanelContent`:
    ```tsx
    <NotesSection applicationId={application.id} initialNotes={notes} />
    ```
  - [ ] 6.3 Update `candidate-side-panel.test.tsx` — add `notes` to mock response data, verify NotesSection renders.

- [ ] Task 7: Multi-select state in AtsKanbanBoard (AC: 2)
  - [ ] 7.1 Add `selectedIds` state management to `ats-pipeline-view.tsx` (the flow wrapper): `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`. Pass `selectedIds` and selection handlers to `AtsKanbanBoard`.
  - [ ] 7.2 Extend `AtsKanbanBoardProps` with: `selectedIds?: Set<string>`, `onSelectionChange?: (ids: Set<string>) => void`. When `selectedIds` prop is present, render checkboxes on each card.
  - [ ] 7.3 In `SortableCandidateCard` wrapper: Add `<Checkbox>` positioned top-left. On checkbox click: `event.stopPropagation()` (prevent opening side panel + drag). Toggle the card's id in `selectedIds`. Checkbox `checked` state derived from `selectedIds.has(applicationId)`.
  - [ ] 7.4 Add "Select all" checkbox in each column header. Toggles all cards in that column.
  - [ ] 7.5 Clear selection when a drag operation starts (prevent confusion between selection and drag).
  - [ ] 7.6 **Shift+Click range selection is explicitly deferred** — implementing ordered card-index tracking across columns adds significant complexity. The story's accessibility section mentions it, but it is NOT required for this story. Implement plain checkbox toggle only. Leave a `// TODO: Shift+Click range selection` comment at the handler.
  - [ ] 7.7 Update `ats-kanban-board.test.tsx` — tests for: checkbox renders, checkbox click toggles selection, checkbox doesn't open side panel, select-all toggles column, drag clears selection.

- [ ] Task 8: BulkActionToolbar component (AC: 2, 3)
  - [ ] 8.1 Create `apps/portal/src/components/domain/bulk-action-toolbar.tsx` (`"use client"`). Props: `{ selectedIds: Set<string>; applications: KanbanApplication[]; onClearSelection: () => void; onBulkComplete: () => void }`. Use `useDensity()` for density-aware padding/gap on the toolbar div (consistent with the kanban board).
  - [ ] 8.2 Toolbar layout: `role="toolbar"`, `aria-label={t("bulk.ariaToolbar")}`. Shows "{count} selected" badge, "Advance" button (primary), "Reject" button (destructive), "Message" button (disabled) wrapped in a `<Tooltip>` showing `t("bulk.messageDisabled")` — the Tooltip is required because disabled buttons don't fire mouse events, so users need the tooltip to understand WHY it's disabled. "Clear" button (ghost). Subtle slide-in animation on the toolbar wrapper (CSS `transition: opacity 150ms ease, transform 150ms ease` from opacity 0 + translate-y-2 → opacity 1 + translate-y-0) — or leave to dev discretion if time-boxed.
  - [ ] 8.3 "Advance" click: Call `PATCH /api/v1/applications/bulk/status` with `{ applicationIds: [...selectedIds], action: "advance" }`. Show summary toast. Clear selection. Call `onBulkComplete()` to trigger data refresh.
  - [ ] 8.4 "Reject" click: Open `BulkRejectModal`. On confirm: call bulk API with `{ applicationIds, action: "reject", reason }`. Show summary toast. Clear selection.
  - [ ] 8.5 `BulkRejectModal` (inline in `bulk-action-toolbar.tsx`): `AlertDialog` with warning text, optional reason textarea (max 500 chars), Cancel + Confirm buttons. Confirm button shows "Processing..." during API call.
  - [ ] 8.6 **Radix AlertDialog jsdom polyfills** — The portal vitest config (`apps/portal/vitest.config.ts`) has NO global polyfill setup file. Add the following at the top of `bulk-action-toolbar.test.tsx` (required for Radix AlertDialog to render in jsdom):
    ```ts
    beforeEach(() => {
      Object.assign(Element.prototype, {
        hasPointerCapture: () => false,
        setPointerCapture: () => undefined,
        releasePointerCapture: () => undefined,
        scrollIntoView: () => undefined,
      });
      global.ResizeObserver = class ResizeObserver {
        observe() {} unobserve() {} disconnect() {}
      } as unknown as typeof ResizeObserver;
    });
    ```
  - [ ] 8.7 Tests: `bulk-action-toolbar.test.tsx` — renders with count, advance calls API, reject opens modal, modal submit calls API with reason, clear selection, message button disabled (tooltip visible), processing state, summary toast, axe assertion.

- [ ] Task 9: Integrate bulk actions into AtsPipelineView (AC: 2, 3)
  - [ ] 9.1 In `ats-pipeline-view.tsx`: Add `selectedIds` state. Render `<BulkActionToolbar>` between the title/breadcrumb area and the kanban board when `selectedIds.size > 0`.
  - [ ] 9.2 Wire `onBulkComplete`: After bulk action, re-fetch application data (either via router.refresh() if server component, or refetch via API). Clear selectedIds.
  - [ ] 9.3 Pass `selectedIds` and `onSelectionChange` to `AtsKanbanBoard`.
  - [ ] 9.4 Tests: `ats-pipeline-view.test.tsx` — toolbar appears when cards selected, toolbar hidden when no selection, bulk action clears selection.

- [ ] Task 10: i18n keys (AC: all)
  - [ ] 10.1 Add ~30 `Portal.ats.notes.*` and `Portal.ats.bulk.*` keys to `apps/portal/messages/en.json` (see i18n inventory above)
  - [ ] 10.2 Add Igbo translations to `apps/portal/messages/ig.json` (Dev Completion obligation per SN-1)

- [ ] Task 11: Final verification (AC: all)
  - [ ] 11.1 After Task 1.4 (registering new schema in db/src/index.ts), immediately run `pnpm --filter @igbo/db typecheck` — the PgTransaction generic widens on each new schema addition. Fix any `db.transaction` mock type errors in existing test files by typing the callback param as `any` (see anti-pattern #14)
  - [ ] 11.2 Run `pnpm --filter @igbo/portal test` — all portal tests green
  - [ ] 11.3 Run `pnpm --filter @igbo/db test` — all db tests green
  - [ ] 11.4 Run `pnpm --filter @igbo/portal typecheck` and `pnpm --filter @igbo/portal lint` — no errors
  - [ ] 11.5 Run `pnpm ci-checks` — all CI checks passed
  - [ ] 11.6 Rebuild `@igbo/db` — ensure new schema/query exports visible to portal (`pnpm --filter @igbo/db build`)

## Dev Notes

### Architecture Patterns & Constraints

**This story adds two features to the existing ATS pipeline (P-2.9): private employer notes and bulk candidate actions. The kanban board, side panel, and API patterns from P-2.9 are the foundation.**

#### Existing Building Blocks (MUST reuse)

1. **`candidate-side-panel.tsx`** — The Sheet component where notes will be added as a new section after Timeline. Already fetches `/api/v1/applications/[id]/detail` — extend the response to include notes. The `PanelContent` function currently has **6 sections** (Profile, Community Trust, Cover Letter, Resume, Portfolio, Timeline); notes becomes the **7th**.

2. **`ats-kanban-board.tsx`** — The @dnd-kit kanban board from P-2.9. Must be extended with checkbox overlays for multi-select. **CRITICAL**: Checkbox clicks must NOT interfere with drag operations. Use `event.stopPropagation()` on checkbox `onClick` and ensure `PointerSensor` has distance threshold (already set to 5px in P-2.9) to prevent accidental drag on checkbox area.

3. **`ats-pipeline-view.tsx`** — The flow wrapper managing board + closed section + side panel state. Bulk selection state (`selectedIds`) should live here and be passed down. Toolbar renders conditionally based on selection.

4. **`application-state-machine.ts`** — Server-side transition logic. Bulk actions call `transition()` per-application (N separate calls in a loop). Do NOT batch raw SQL updates. The state machine handles: validation, DB transaction, audit trail insertion, event emission.

5. **`EMPLOYER_TRANSITIONS` (client-side) in `ats-kanban-board.tsx`** — Mirrors valid employer transitions for instant UI feedback. For bulk advance: use this map to determine the "next forward stage" (first non-"rejected" valid transition).

6. **Sonner toast** — Use for success/error feedback on note save and bulk action results.

#### New `portal_application_notes` Table Design

```
portal_application_notes
├── id: UUID PK (gen_random_uuid)
├── application_id: UUID FK → portal_applications (CASCADE)
├── author_user_id: UUID FK → auth_users (RESTRICT — don't delete users with notes)
├── content: TEXT NOT NULL
└── created_at: TIMESTAMPTZ DEFAULT now()

Index: (application_id, created_at ASC) — for efficient chronological retrieval
```

**Design decisions:**
- **ON DELETE CASCADE for application_id**: When an application is deleted, its notes go too.
- **ON DELETE RESTRICT for author_user_id**: Prevent user deletion if they have notes. This is intentional — employer notes are audit artifacts. If user deletion becomes required, a separate migration can anonymize notes.
- **No `updated_at`**: Notes are immutable per AC-4 (cannot be edited or deleted after creation).
- **No `deleted_at`**: Notes are never soft-deleted per AC-4.

#### Bulk Actions — Server-Side "Advance" Logic

The "Advance" action needs to determine the next valid forward stage for each application. The state machine's `VALID_TRANSITIONS` maps each status to `{ toStatus, allowedActors }[]`. For advance:

```
submitted → under_review (first non-rejected employer transition)
under_review → shortlisted
shortlisted → interview
interview → offered
offered → hired
Terminal states → skip (no valid transitions)
```

Create `getNextAdvanceStatus(currentStatus)` as a **private function in the bulk route file** (not exported). This reads from `VALID_TRANSITIONS` (imported from `application-state-machine.ts`) and picks the first entry where `allowedActors.includes("employer")` and `toStatus !== "rejected"`. Returns `null` for terminal states. Do NOT put this in `application-state-machine.ts` — it's route-specific advance logic.

#### Bulk Actions — Request Size Limit

Cap at 50 applications per bulk request (Zod `z.array().max(50)`). This prevents:
- Timeout from too many sequential state machine calls
- Excessive event emission flooding
- Memory pressure from large transaction batches

#### Ownership Verification for Bulk Actions

All applicationIds in a bulk request must belong to jobs owned by the employer's company. Strategy:
1. Call `getApplicationsByIds(applicationIds, companyId)` — single batch query using `inArray()` (Task 2.2)
2. If returned count < requested count → some IDs don't belong to this employer → 404 for the entire request (fail-closed)
3. Use the returned applications (already ownership-verified) to get current status for each ID

**Required**: use `getApplicationsByIds(ids: string[], companyId: string)` batch query (Task 2.2) using Drizzle's `inArray()`. This is a single DB call that both fetches and verifies ownership simultaneously — critical for the 50-application cap to not produce 50 sequential queries.

#### Multi-Select UX Constraints

- **Checkbox area vs drag area**: The `PointerSensor` with 5px distance already prevents accidental drags. Additionally, `event.stopPropagation()` on checkbox prevents @dnd-kit from receiving the pointer event.
- **Selection clears on drag start**: When a drag operation begins, clear all selected IDs to prevent confusing mixed state.
- **Selection persists across columns**: Selected IDs are a flat set — cards can be selected across different columns.
- **Terminal states not selectable**: Cards in the closed section (hired/rejected/withdrawn) should NOT have checkboxes. They can't be transitioned.

### Previous Story Intelligence (P-2.9)

Key patterns from P-2.9 (immediate predecessor):

- **SPIKE-2 evolution pattern**: P-2.9 evolved the kanban PoC rather than rewriting. Same approach for P-2.10: extend the board with checkboxes, don't restructure.
- **`forwardRef` pattern for CandidateCard**: Card uses `React.forwardRef<HTMLDivElement>` — checkbox must be added inside the existing card structure without breaking the ref chain.
- **isSafeUrl validation**: Portfolio links filter with `isSafeUrl()`. No similar concern for notes (plain text only).
- **Mock object update burden**: P-2.9 updated all 29 mock `KanbanApplication` objects. P-2.10 doesn't change the interface shape (checkboxes are UI-only, not data model changes). But test files for the board will need `selectedIds` prop handling.
- **`withApiHandler` + URL param extraction**: Dynamic route params extracted via `segments.at(-N)`. The bulk route uses a fixed path (`/api/v1/applications/bulk/status`) with no dynamic segments — simpler.
- **DensityContext**: Board and cards use `useDensity()`. New checkbox and toolbar should also respect density for spacing.
- **jsdom + Radix limitations**: Radix `AlertDialog` in jsdom needs the same pointer polyfills from P-2.2 memory. Verify test setup has `setPointerCapture`/`releasePointerCapture` polyfills.

### Integration Tests (SN-3 — Missing Middle)

- **Notes create → fetch round trip**: `POST /api/v1/applications/[id]/notes` then `GET /api/v1/applications/[id]/notes` — verify the created note appears in the list with correct author name and timestamp.
- **Notes in detail response**: `POST` a note, then `GET /api/v1/applications/[id]/detail` — verify `notes` array includes the new note.
- **Bulk reject state machine chain**: `PATCH /api/v1/applications/bulk/status` with `action: "reject"` and 3 applicationIds (2 active + 1 terminal). Verify: 2 transitions created, 1 skipped, each transition went through `transition()` function, events emitted for each.
- **Bulk advance forward progression**: `PATCH /api/v1/applications/bulk/status` with `action: "advance"` and applications at different stages. Verify each advanced to correct next stage per `VALID_TRANSITIONS`.
- **Ownership isolation**: Employer A bulk-operates on a mix of own applications + Employer B's application → 404 for entire request.

### Project Structure Notes

**New files:**
- `packages/db/src/migrations/0065_employer_application_notes.sql`
- `packages/db/src/schema/portal-application-notes.ts`
- `packages/db/src/queries/portal-application-notes.ts` + `.test.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/notes/route.ts` + `.test.ts`
- `apps/portal/src/app/api/v1/applications/bulk/status/route.ts` + `.test.ts`
- `apps/portal/src/components/domain/notes-section.tsx` + `.test.tsx`
- `apps/portal/src/components/domain/bulk-action-toolbar.tsx` + `.test.tsx`
- `apps/portal/src/components/ui/checkbox.tsx` (shadcn add — confirmed missing)

**Modified files:**
- `packages/db/src/index.ts` — register new schema + query exports (including `ApplicationNote` type and `getApplicationsByIds`)
- `packages/db/src/queries/portal-applications.ts` — add `getApplicationsByIds(ids, companyId)` batch query
- `packages/db/src/migrations/meta/_journal.json` — add migration 0065
- `apps/portal/src/components/domain/candidate-side-panel.tsx` — extend `CandidateDetailResponse` with notes, add NotesSection
- `apps/portal/src/components/domain/candidate-side-panel.test.tsx` — update mock data with notes
- `apps/portal/src/components/domain/ats-kanban-board.tsx` — add checkbox overlay for multi-select
- `apps/portal/src/components/domain/ats-kanban-board.test.tsx` — tests for checkbox selection
- `apps/portal/src/components/flow/ats-pipeline-view.tsx` — add selectedIds state, toolbar, bulk action handlers
- `apps/portal/src/components/flow/ats-pipeline-view.test.tsx` — tests for toolbar + bulk actions
- `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts` — extend to return notes
- `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.test.ts` — update mock for notes
- `apps/portal/messages/en.json` — ~30 new keys
- `apps/portal/messages/ig.json` — Igbo translations

**Files NOT touched (reference only):**
- `apps/portal/src/services/application-state-machine.ts` — called by bulk route, not modified
- `apps/portal/src/components/domain/candidate-card.tsx` — checkbox is added in the `SortableCandidateCard` wrapper, not in `CandidateCard` itself
- `apps/portal/src/components/domain/application-timeline.tsx` — reused, not modified
- `apps/portal/src/app/api/v1/applications/[applicationId]/status/route.ts` — individual transitions unchanged

### Critical Anti-Patterns to Avoid

1. **Do NOT bypass the state machine for bulk actions** — Each application must go through `transition()` individually. Do NOT do `UPDATE portal_applications SET status = 'rejected' WHERE id IN (...)`. The state machine handles validation, audit trail, and event emission.
2. **Do NOT allow notes to be edited or deleted** — AC-4 explicitly states notes are immutable for audit integrity. No PATCH/DELETE endpoints for notes.
3. **Do NOT expose notes to seekers** — Notes are employer-private. The seeker detail route (`GET /api/v1/applications/[id]` from P-2.6) must NOT return notes.
4. **Do NOT add checkboxes to closed section cards** — Terminal state cards (hired/rejected/withdrawn) cannot be transitioned, so bulk actions don't apply.
5. **Do NOT use `useSortable()` for the checkbox** — The checkbox is a separate interactive element that should NOT participate in drag-and-drop. Use `event.stopPropagation()` to isolate checkbox clicks from @dnd-kit.
6. **Do NOT batch raw SQL for bulk status changes** — Each transition must go through the state machine for validation + event emission + audit trail.
7. **Do NOT allow bulk actions > 50 applications** — Cap at 50 to prevent timeouts and event flooding.
8. **Do NOT forget to clear selection on drag start** — Mixed drag + bulk-select state is confusing.
9. **Do NOT hardcode English strings** — All text via `useTranslations("Portal.ats")`.
10. **Do NOT use 403 for ownership failures** — Return 404 to prevent information leakage (established pattern).
11. **Do NOT forget to update `detail/route.ts`** — The detail endpoint must return notes alongside existing data.
12. **Do NOT create edit/delete API routes for notes** — They don't exist per AC-4. This keeps the implementation simpler.
13. **Do NOT import from `"zod"` in route files** — Always `import { z } from "zod/v4"`. The wrong import compiles without errors but produces subtle schema behavior differences at runtime.
14. **Do NOT ignore the `db.transaction` mock typecheck issue** — Adding `portalApplicationNotes` schema to `packages/db/src/index.ts` widens the `PgTransaction` generic. Any existing test file that mocks `db.transaction` with `cb: (tx: unknown) => Promise<unknown>` will fail typecheck after Task 1.4. Fix by typing the callback param as `any`: `vi.mocked(db.transaction).mockImplementation(async (cb: any) => ...)`. Check `application-state-machine.test.ts` and any other test that mocks `db.transaction` immediately after completing Task 1.4.
15. **Do NOT redefine `ApplicationNote` type in the portal** — Import it from `@igbo/db` (exported in Task 2.3). Defining it inline in `candidate-side-panel.tsx` creates a duplicate that will drift from the DB layer type.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md:1114-1145`] — Story 2.10 Employer Notes & Bulk Actions acceptance criteria
- [Source: `_bmad-output/planning-artifacts/prd-v2.md:969-973`] — FR35-FR39 (employer ATS requirements)
- [Source: `_bmad-output/planning-artifacts/prd-v2.md:1108`] — DEFERRED-1 (bulk actions — promoted to Epic 2 Story 2.10)
- [Source: `apps/portal/src/components/domain/candidate-side-panel.tsx`] — Side panel where notes section integrates
- [Source: `apps/portal/src/components/domain/ats-kanban-board.tsx`] — Kanban board to extend with multi-select
- [Source: `apps/portal/src/components/flow/ats-pipeline-view.tsx`] — Flow wrapper for bulk action state
- [Source: `apps/portal/src/services/application-state-machine.ts`] — State machine: VALID_TRANSITIONS, transition()
- [Source: `packages/db/src/schema/portal-applications.ts`] — Application schema (FK reference for notes table)
- [Source: `packages/db/src/queries/portal-applications.ts`] — Existing queries pattern
- [Source: `apps/portal/src/app/api/v1/applications/[applicationId]/status/route.ts`] — Individual transition API pattern
- [Source: `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts`] — Detail route to extend with notes
- [Source: `_bmad-output/implementation-artifacts/p-2-9-ats-pipeline-view-stage-management.md`] — Predecessor story (P-2.9) learnings
- [Source: `docs/monorepo-playbook.md` Section 7] — Frontend Safety & Readiness checklist
- [Source: `docs/monorepo-playbook.md` Section 8] — Async safety requirements

## Definition of Done (SN-1)

- [ ] All acceptance criteria met (AC 1-4)
- [ ] All validation scenarios demonstrated with evidence
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing (SN-3: notes round trip, notes in detail, bulk reject chain, bulk advance chain, ownership isolation)
- [ ] Flow owner has verified the complete end-to-end chain
- [ ] No pre-existing test regressions introduced
- [ ] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [ ] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory**
- [ ] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [ ] Dev Completion: all a11y patterns listed in Readiness (keyboard interaction, focus management on AlertDialog, aria roles on toolbar/checkboxes/notes) have passing axe-core assertions
- [ ] Dev Completion: all component dependencies in Readiness are imported and rendering (Checkbox, Textarea, AlertDialog, existing components)
- [ ] P-2.9 tests: all existing kanban board + side panel tests still pass (no regressions)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Validation Evidence

- Portal tests: **1765/1765 passing** across 159 test files (pnpm exec vitest run) — +78 net new tests.
- @igbo/db tests: **917/917 passing** across 63 test files (+10 new tests for portal-application-notes queries + portal-applications getApplicationsByIds).
- Portal typecheck: `pnpm exec tsc --noEmit` clean.
- Portal lint: `pnpm exec eslint src --max-warnings=0` clean.
- Community typecheck: clean (no downstream breakage from new @igbo/db schema/queries).
- Stale-import CI scanner: `pnpm exec tsx scripts/ci-checks/check-stale-imports.ts` clean.
- JSON validation: en.json + ig.json both parse cleanly.

### Debug Log References

- `successResponse(data, meta?, status?)` — 3-arg form; passing status as 2nd arg is silently ignored. Fix for notes POST: `successResponse(note, undefined, 201)`.
- Zod v4 strict UUIDs require valid v4 format (pos 14 = `4`, pos 19 ∈ `[89ab]`). Test fixtures updated from `a1111111-1111-1111-1111-111111111111` to `a1111111-1111-4111-a111-111111111111`.
- Exported `VALID_TRANSITIONS` and `TransitionRule` from `application-state-machine.ts` so P-2.10 bulk route can call `getNextAdvanceStatus()` without duplicating transition rules (server-authoritative source).
- `router.refresh()` mock in ats-pipeline-view.test.tsx via `vi.mock("next/navigation")` — needed because `AtsPipelineView` now calls `useRouter().refresh()` after bulk completion.

### Completion Notes List

1. Migration 0065 adds `portal_application_notes` table with partial index on `(application_id, created_at ASC)`; journal entry idx:65 appended to `_journal.json`.
2. Notes DB layer (`createApplicationNote`, `getNotesByApplicationId`) joins `auth_users` for `authorName`. Exported `ApplicationNote` type — imported across portal routes + components.
3. Bulk ownership: `getApplicationsByIds(ids, companyId)` performs an inner-join on `portal_job_postings` scoped by company — single-query batch ownership check. Fail-closed 404 if any id is not owned.
4. Notes routes: `POST|GET /api/v1/applications/[applicationId]/notes`. Ownership verified via `getApplicationDetailForEmployer` wrapped in `verifyOwnership()`. `detail/route.ts` extended to include `notes` in parallel response.
5. Bulk status route: `PATCH /api/v1/applications/bulk/status`. Each application transitioned individually through `transition()` (not a batch SQL update) so each emits `application.status_changed` event + writes its own audit row. Terminal-state candidates skipped via try/catch with structured `{ processed, skipped, results }` response.
6. UI: `NotesSection` component wired into `CandidateSidePanel` (7th section after Timeline). Optimistic append on POST success, toast feedback, character counter, 2000-char maxLength.
7. Multi-select: `AtsKanbanBoard` accepts `selectedIds` + `onToggleSelect` + `onToggleColumnSelect` props; `CandidateCard` renders a Checkbox (with `onPointerDown/onClick` stopPropagation) only when `onToggleSelect` is provided. Select-all checkbox per column. Drag start clears selection via `onClearSelection`.
8. `BulkActionToolbar` + `BulkRejectModal` live in a single file. Toolbar shows `{count} selected`, Advance/Reject/Message (disabled) + Clear. Reject opens a Dialog that takes an optional reason and calls back to the toolbar for the PATCH. `router.refresh()` fires on bulk completion to re-fetch from the server component parent.
9. `AtsPipelineView` now owns the `selectedIds: Set<string>` state (lifted from the board) so the toolbar can live above the board. Conditional render: toolbar only shows when `selectedIds.size > 0`.
10. i18n: 10 `Portal.ats.notes.*` + 17 `Portal.ats.bulk.*` keys added to both en.json and ig.json (including `bulk.rejectModal.*` subsection).

### File List

**New files:**
- `packages/db/src/migrations/0065_employer_application_notes.sql`
- `packages/db/src/schema/portal-application-notes.ts`
- `packages/db/src/schema/portal-application-notes.test.ts`
- `packages/db/src/queries/portal-application-notes.ts`
- `packages/db/src/queries/portal-application-notes.test.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/notes/route.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/notes/route.test.ts`
- `apps/portal/src/app/api/v1/applications/bulk/status/route.ts`
- `apps/portal/src/app/api/v1/applications/bulk/status/route.test.ts`
- `apps/portal/src/components/ui/checkbox.tsx` (shadcn)
- `apps/portal/src/components/domain/notes-section.tsx`
- `apps/portal/src/components/domain/notes-section.test.tsx`
- `apps/portal/src/components/domain/bulk-action-toolbar.tsx`
- `apps/portal/src/components/domain/bulk-action-toolbar.test.tsx`

**Modified:**
- `packages/db/src/migrations/meta/_journal.json`
- `packages/db/src/index.ts`
- `packages/db/src/queries/portal-applications.ts`
- `packages/db/src/queries/portal-applications.test.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts`
- `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.test.ts`
- `apps/portal/src/services/application-state-machine.ts` (export `VALID_TRANSITIONS` + `TransitionRule`)
- `apps/portal/src/components/domain/candidate-card.tsx` (selection checkbox)
- `apps/portal/src/components/domain/ats-kanban-board.tsx` (multi-select props + select-all per column)
- `apps/portal/src/components/domain/ats-kanban-board.test.tsx` (+9 multi-select tests)
- `apps/portal/src/components/domain/candidate-side-panel.tsx` (NotesSection integration + type extension)
- `apps/portal/src/components/domain/candidate-side-panel.test.tsx` (+1 notes render test + `notes: []` fixture)
- `apps/portal/src/components/flow/ats-pipeline-view.tsx` (selection state + router.refresh + BulkActionToolbar mount)
- `apps/portal/src/components/flow/ats-pipeline-view.test.tsx` (router mock + 6 bulk-selection tests)
- `apps/portal/messages/en.json`
- `apps/portal/messages/ig.json`
- `pnpm-lock.yaml` (updated by `shadcn add checkbox`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] `BulkRejectModal` used `Dialog` instead of `AlertDialog` — missing `role="alertdialog"` for destructive confirmation. Fixed: replaced Dialog imports with AlertDialog + AlertDialogAction + AlertDialogCancel. [bulk-action-toolbar.tsx:173]
- [x] [AI-Review][MEDIUM] Checkbox `aria-label` missing candidate name — used generic "Select candidate" instead of "Select {name}". Fixed: added `Portal.ats.bulk.ariaCheckbox` key to en.json + ig.json; updated candidate-card.tsx to pass `{ name: seekerName }`. [candidate-card.tsx:123]
- [x] [AI-Review][MEDIUM] `autoFocus` on Cancel button in BulkRejectModal instead of textarea. Story accessibility spec: "Focus moves to the textarea (optional reason) on open." Fixed: moved `autoFocus` to Textarea, removed from Cancel button. [bulk-action-toolbar.tsx:199]
- [x] [AI-Review][MEDIUM] `pnpm-lock.yaml` modified by `shadcn add checkbox` but absent from story File List. Fixed: added to Modified files list.
- [x] [AI-Review][LOW] Character counter in NotesSection used hardcoded `{charCount}/2000` format instead of i18n key. Story inventory defined `Portal.ats.notes.maxLength`. Fixed: added key to en.json + ig.json; updated notes-section.tsx to use `t("maxLength", { count: charCount })`. [notes-section.tsx:126]
- [x] [AI-Review][LOW] Duplicate UUIDs in bulk `applicationIds` caused false 404 (returned count < requested count). Fixed: deduplicate with `[...new Set(parsed.data.applicationIds)]` before ownership check. [bulk/status/route.ts:68]

## Change Log

| Date       | Version | Description                                                              | Author        |
| ---------- | ------- | ------------------------------------------------------------------------ | ------------- |
| 2026-04-11 | 0.1     | Story drafted — Employer Notes & Bulk Actions                            | Scrum Master  |
| 2026-04-11 | 0.2     | Quality review applied: fixed AC-3 event name, db.transaction mock warning, Zod import, section count, batch query task, AlertDialog polyfill snippet, ApplicationNote type source, Shift+Click deferral, requireEmployerRole import guidance, Tooltip for disabled Message button | Validator |
| 2026-04-12 | 1.0     | Implementation complete — all 11 tasks delivered, 1765/1765 portal tests + 917/917 @igbo/db tests passing, typecheck + lint + CI scanner clean. Status → review. | Dev Agent |
