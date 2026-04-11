# SPIKE-2: ATS Drag-and-Drop — Decision + Constraints + Test Strategy

**Date:** 2026-04-09
**Owner:** Charlie (Senior Dev)
**Status:** Complete
**Gate:** Recommended before P-2.9

---

## 1. Decision: Library Choice

**Selected: `@dnd-kit` (v6.3.1 core + v10.0.0 sortable)**

| Criterion             | @dnd-kit             |          react-beautiful-dnd |       react-dnd |
| --------------------- | -------------------- | ---------------------------: | --------------: |
| Active maintenance    | Yes                  | Maintenance mode (Atlassian) |    Low activity |
| React 19 support      | Yes                  |                      Partial |         Partial |
| Keyboard DnD built-in | Yes (KeyboardSensor) |                          Yes |          Manual |
| Tree-shaking          | Yes (modular)        |                           No |             Yes |
| TypeScript            | Native               |              DefinitelyTyped | DefinitelyTyped |
| Bundle size (core)    | ~13 KB gzipped       |               ~30 KB gzipped |  ~20 KB gzipped |
| Accessibility         | WAI-ARIA built-in    |            WAI-ARIA built-in |          Manual |
| SSR / Next.js         | Compatible           |                   Compatible |      Compatible |

**Rationale:** @dnd-kit is the modern standard for React DnD. Actively maintained, modular architecture, native TypeScript, built-in keyboard/screen-reader support, and proven React 19 compatibility. The sortable preset provides column-to-column drag out of the box.

**Packages installed:**

- `@dnd-kit/core` — DndContext, sensors, collision detection
- `@dnd-kit/sortable` — useSortable, SortableContext
- `@dnd-kit/utilities` — CSS.Transform helper

---

## 2. Architecture: Kanban Board Design

### Column Mapping

The ATS kanban shows the 5 non-terminal employer pipeline stages:

```
submitted → under_review → shortlisted → interview → offered
```

Terminal states (`hired`, `rejected`, `withdrawn`) are **excluded from the board**. They appear in a separate read-only section (list view, not columns). This prevents accidental drag-out and enforces the state interaction matrix invariant.

### Transition Enforcement

The board implements a client-side `EMPLOYER_TRANSITIONS` map derived from the server-side `VALID_TRANSITIONS` in `application-state-machine.ts`. Invalid drops are silently rejected — the card snaps back. Visual feedback during drag highlights valid (green border) and invalid (red border) target columns.

**Important:** Client-side enforcement is optimistic. Server-side `transition()` is the source of truth. The board calls `onStatusChange(applicationId, from, to)` which the parent page must wire to an API call that invokes the server-side state machine.

### Sensors

- **PointerSensor** — 5px activation distance to prevent accidental drags on click
- **KeyboardSensor** — Tab to focus card, Enter/Space to pick up, Arrow keys to navigate, Enter/Space to drop

---

## 3. Constraints

### C-1: jsdom Cannot Simulate Full DnD Gesture

@dnd-kit's PointerSensor relies on `getBoundingClientRect()` and layout calculations. jsdom returns `{x:0, y:0, width:0, height:0}` for all elements, making pointer-based drag simulation impossible.

The KeyboardSensor also depends on DOM measurements for collision detection between sortable containers, so keyboard-based column-to-column movement cannot be triggered in jsdom either.

**Impact:** DnD interactions (drag card from column A to column B) **cannot be end-to-end tested in Vitest/jsdom**. This is a fundamental limitation of the jsdom environment, not a @dnd-kit issue.

### C-2: Optimistic Updates Require Rollback

The board performs optimistic state updates on drop. If the API call fails, the card must snap back to its original column. This requires either:

- A) Re-fetch from server on error
- B) Maintain previous state and restore on failure

Recommend (B) for immediate UX, with (A) as fallback for stale data.

### C-3: Concurrent Drag Protection

Two employers viewing the same job's applications could drag the same card simultaneously. The server-side `transition()` with optimistic locking (via `updatedAt` check) handles this. The board should display a toast on 409 conflict and re-fetch.

### C-4: Mobile Touch Support

@dnd-kit's PointerSensor works with touch events natively. No additional sensor needed. However, touch DnD on narrow screens conflicts with horizontal scroll of the kanban. For mobile, consider a tap-to-select + move-to-column UX instead of drag.

---

## 4. Test Strategy

### Layer 1: Unit Tests in Vitest/jsdom (VALIDATED — 17 tests passing)

What we **can** test:

- Rendering: columns, cards, correct distribution, empty states
- ARIA attributes: `role="list"`, `role="listitem"`, `aria-roledescription`, `aria-labelledby`, `tabindex`
- Terminal state exclusion: hired/rejected/withdrawn cards don't appear on board
- Callback wiring: `onStatusChange` prop is passed and not called without interaction
- Pointer activation: simple click does NOT trigger drag (distance constraint)
- Keyboard focusability: cards receive `tabindex="0"`
- Accessibility audit: axe-core returns no violations

What we **cannot** test:

- Full drag gesture (pointer down → move → pointer up on target column)
- Keyboard DnD flow (Enter to pick up → Arrow → Enter to drop)
- Visual drop feedback (column highlighting during drag)
- DragOverlay rendering during active drag

### Layer 2: Integration Tests via Playwright (RECOMMENDED for P-2.9)

```typescript
// Example Playwright test for drag-and-drop
test("employer can drag application from submitted to under_review", async ({ page }) => {
  await page.goto("/en/my-jobs/job-123/applications");

  const card = page.getByTestId("kanban-card-app-1");
  const targetColumn = page.getByTestId("kanban-column-under_review");

  await card.dragTo(targetColumn);

  // Card should now be in under_review column
  await expect(targetColumn.getByText("Ada Okafor")).toBeVisible();
});

test("keyboard DnD: pick up with Enter, move with Arrow, drop with Enter", async ({ page }) => {
  await page.goto("/en/my-jobs/job-123/applications");

  const card = page.getByTestId("kanban-card-app-1");
  await card.focus();
  await page.keyboard.press("Enter"); // pick up
  await page.keyboard.press("ArrowRight"); // move to next column
  await page.keyboard.press("Enter"); // drop

  const targetColumn = page.getByTestId("kanban-column-under_review");
  await expect(targetColumn.getByText("Ada Okafor")).toBeVisible();
});
```

### Layer 3: Manual Testing Checklist

- [ ] Drag card between all valid transition pairs
- [ ] Verify card snaps back on invalid drop
- [ ] Verify terminal state cards not draggable
- [ ] Test keyboard flow: Tab → Enter → Arrow → Enter
- [ ] Screen reader announces: "Picked up [name]. Over [column]. Dropped in [column]."
- [ ] Touch drag works on tablet
- [ ] Horizontal scroll doesn't conflict with drag on mobile
- [ ] Two browser tabs: drag same card simultaneously → one gets 409 toast

---

## 5. Accessibility Approach

### Built-in @dnd-kit Accessibility

- `aria-roledescription="draggable application card"` on each card
- `role="list"` / `role="listitem"` for column/card structure
- `aria-labelledby` connecting list to column header
- `tabindex="0"` on all cards (via useSortable attributes)
- DragOverlay provides visual feedback during drag

### Screen Reader Announcements

@dnd-kit supports custom `announcements` via the `<DndContext accessibility={{ announcements }}>` prop. For production (P-2.9), implement:

```typescript
const announcements = {
  onDragStart: ({ active }) => `Picked up ${active.data.current.seekerName}`,
  onDragOver: ({ over }) => `Over ${over?.data.current.columnName} column`,
  onDragEnd: ({ active, over }) =>
    `Dropped ${active.data.current.seekerName} in ${over?.data.current.columnName}`,
  onDragCancel: ({ active }) => `Cancelled dragging ${active.data.current.seekerName}`,
};
```

### WCAG Compliance Notes

- **2.1.1 Keyboard:** KeyboardSensor provides full keyboard alternative
- **2.4.7 Focus Visible:** Cards show focus ring (Tailwind `focus-visible:ring-2`)
- **4.1.2 Name, Role, Value:** ARIA roles and labels on all interactive elements
- **1.3.1 Info and Relationships:** Column headers linked to lists via `aria-labelledby`

The axe audit (in Vitest tests) confirmed zero violations for the PoC.

---

## 6. Production Recommendations for P-2.9

1. **Wire `onStatusChange` to API** — `PATCH /api/v1/applications/[id]/status` calling server-side `transition()`. `onStatusChange` returns `Promise<void>` so the board can rollback on failure.
2. **Add DragOverlay with proper card clone** — already scaffolded in PoC (separate `DragOverlayCard` component, `aria-hidden`)
3. **Implement screen reader announcements** — use `DndContext accessibility` prop
4. ~~**Add optimistic rollback**~~ — **DONE in PoC.** Board captures `previousApps` and restores on `.catch()`.
5. **Add loading states** — skeleton columns while fetching applications
6. **Mobile fallback** — tap-to-select UX below 768px breakpoint
7. **Playwright E2E tests** — required for DnD gesture coverage (see Layer 2 above)
8. ~~**i18n**~~ — **DONE in PoC.** Board label, card role description, column labels all via `useTranslations`. Add announcement translations for screen reader events.
9. **Batch operations** — consider multi-select drag for bulk status changes
10. **Real-time sync** — EventBus listener to update board when another user transitions an application
11. **Authorization scoping** — ensure the API endpoint supplying `applications` data enforces employer ownership of the job posting
12. **Column label namespace** — currently reuses `Portal.applications.status.*` (seeker-facing). Consider employer-specific labels if column names diverge from status names (e.g., "New Applications" instead of "Submitted").

---

## 7. Files Produced

| File                                                          | Purpose                                                                                                                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/portal/src/components/domain/ats-kanban-board.tsx`      | PoC component (spike artifact)                                                                                                                                          |
| `apps/portal/src/components/domain/ats-kanban-board.test.tsx` | 29 tests validating testability (12 isValidDrop + 2 drift guard + 8 rendering + 4 a11y keyboard + 1 terminal exclusion + 1 pointer + 2 axe = 29 net after review fixes) |
| `docs/decisions/spike-2-ats-dnd.md`                           | This document                                                                                                                                                           |

---

## 8. Summary

| Question                       | Answer                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Which DnD library?             | **@dnd-kit** (v6 core, v10 sortable)                                                                    |
| Can we simulate DnD in Vitest? | **No.** jsdom lacks layout. Unit tests cover rendering + a11y. Playwright required for gesture testing. |
| Is keyboard DnD feasible?      | **Yes.** @dnd-kit KeyboardSensor works in real browsers. Testable via Playwright.                       |
| Is the a11y story solid?       | **Yes.** Built-in ARIA, custom announcements, axe-clean.                                                |
| Major risk for P-2.9?          | **Concurrent drag conflict (409 handling) + mobile touch UX.** Rollback already implemented in PoC.     |
