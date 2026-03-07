# Story 9.5: Notification System Bug Fixes & UX Polish

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a platform member,
I want the notification system to work reliably and the preferences page to be intuitive,
so that I actually receive notifications I've configured and can manage them without confusion.

## Acceptance Criteria

### Section A — Functional Bugs

**B1 — NotificationRouter graceful degradation (CRITICAL)**

1. `NotificationRouter.route()` wraps `getNotificationPreferences(userId)` in try/catch
2. On any DB error: logs `console.error` with structured JSON, falls back to `DEFAULT_PREFERENCES` for all channel decisions, and continues delivery uninterrupted
3. Router test: when `getNotificationPreferences` throws, route() still returns a valid `RouteResult` (not re-thrown), in-app delivery proceeds
4. Pattern documented in `src/test/vi-patterns.ts` under "notification critical path resilience"

**B2 — PushSubscriptionToggle fix + wiring into matrix as column gate (HIGH)** 5. `PushSubscriptionToggle` checkbox `onChange` correctly calls `subscribe()`/`unsubscribe()` from `usePushSubscription` hook — audit and fix any broken wiring (retro root cause: "checkbox onChange not properly wired to subscribe() fn") before embedding in matrix 6. Standalone "Push Notifications" section removed from `/settings/notifications` page 7. Push column header in `NotificationPreferencesMatrix` contains `PushSubscriptionToggle` (subscribe/unsubscribe control) 8. When push status is NOT subscribed: all Push column toggles are `disabled` and visually greyed-out; column header shows "Enable push to configure" prompt below the toggle 9. When push status IS subscribed: Push column toggles function normally (read/write per-type preference) 10. When push status is "unsupported" or "denied": Push column header shows the relevant status message (same as current PushSubscriptionToggle renders for these states), per-type toggles remain disabled 11. Matrix component tests cover: subscribed state (toggles active), unsubscribed state (toggles disabled + prompt visible), unsupported state (disabled + message)

**B3 — emailData wired for mention and group_activity handlers (HIGH)** 12. `message.mentioned` handler passes `emailData: { preview: contentPreview }` to `deliverNotification()` 13. All `group_activity` handlers (`group.join_requested`, `group.join_approved`, `group.join_rejected`, `group.leader_assigned`, `group.member_muted`, `group.member_banned`, `group.ownership_transferred`, `group.archived`) pass `emailData: {}` to `deliverNotification()` 14. `getEmailTemplateForType()` in `notification-service.ts` returns `"notification-mention"` for `"mention"` and `"notification-group-activity"` for `"group_activity"` 15. Two new bilingual email templates created: `notification-mention.ts` and `notification-group-activity.ts` (following `notification-event-reminder.ts` template pattern — a fully wired end-to-end template) 16. Both templates registered in `src/templates/email/index.ts` REGISTRY 17. `EMAIL_ELIGIBLE_TYPES` in `notification-router.ts` updated to include `"mention"` and `"group_activity"` 18. `post_interaction` is explicitly deferred (no handlers exist yet — documented in notification-service.ts comment); its email wiring is a task for whichever Epic 4/post-interaction story adds the handler. Additionally, `notification-new-follower` template exists but is orphaned — `member.followed` uses type `"system"` (not email-eligible) so the template is never invoked; add a deferral comment noting this alongside the `post_interaction` deferral 19. Tests: `notification-service.test.ts` verifies that `enqueueEmailJob` is called when `message.mentioned` fires and user has email enabled + not DnD; same for `group.join_approved`

### Section B — UX Polish

**U1 — Page padding** 20. `/settings/notifications` page content is wrapped in a `<main className="mx-auto max-w-2xl px-4 py-8">` container matching the canonical pattern from `settings/profile/page.tsx`

**U2 — Timezone auto-detect** 21. `QuietHoursForm` initializes timezone state from `Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `"UTC"` if the result is falsy or not in `COMMON_TIMEZONES` 22. Tests: `QuietHoursForm.test.tsx` mocks `Intl.DateTimeFormat` and verifies the detected timezone is pre-selected in the dropdown

**U3 — Quiet hours post-save summary state** 23. After a successful quiet hours save, `QuietHoursForm` transitions to a "saved summary" view showing: `"Active · {start} → {end} ({timezone}) · [Edit]"` 24. Clicking "Edit" returns the form to edit mode (the form fields re-appear, summary hides) 25. Summary uses i18n key `Notifications.quietHours.savedSummary` for the "Active" label and `Notifications.quietHours.editButton` for the edit link 26. Tests: `QuietHoursForm.test.tsx` — save → summary visible, "Edit" click → form re-appears

**U4+U5 — Push toggle merged into matrix (covered by B2 ACs 5–11 above)**

## Tasks / Subtasks

- [x] Task 1: B1 — Router graceful degradation (AC: B1 #1–4)
  - [x] 1.1 In `src/services/notification-router.ts`, wrap `getNotificationPreferences(userId)` call (line ~76) in try/catch; on catch, log with `console.error` structured JSON and use `DEFAULT_PREFERENCES` for all type lookups; continue routing normally
  - [x] 1.2 Add `src/test/vi-patterns.ts` entry: "notification critical path resilience — any service in the notification critical path calling external deps must have try/catch + fallback to defaults; never let a preferences DB error black out all notifications"
  - [x] 1.3 Add/update `notification-router.test.ts` — mock `getNotificationPreferences` to throw; assert route() resolves with inApp.suppressed=false (in-app proceeds), no thrown exception

- [x] Task 2: B3 — Email template creation (AC: B3 #14–16)
  - [x] 2.1 Create `src/templates/email/notification-mention.ts` — bilingual (en/ig), `subject` + `html` + `text`, data: `{ name, preview }`, unsubscribe URL `/settings/notifications`
  - [x] 2.2 Create `src/templates/email/notification-group-activity.ts` — bilingual (en/ig), `subject` + `html` + `text`, data: `{ name, title, body }`, unsubscribe URL `/settings/notifications`
  - [x] 2.3 Register both in `src/templates/email/index.ts` REGISTRY (`"notification-mention"` and `"notification-group-activity"`)
  - [x] 2.4 Update `EMAIL_ELIGIBLE_TYPES` Set in `src/services/notification-router.ts` to add `"mention"` and `"group_activity"`
  - [x] 2.5 Add template render tests in `src/templates/email/index.test.ts` for both new templates (en + ig)

- [x] Task 3: B3 — Wire emailData in notification-service.ts handlers (AC: B3 #11–13, 17–18)
  - [x] 3.1 `message.mentioned` handler: add `emailData: { preview: contentPreview }` to each `deliverNotification()` call in the loop
  - [x] 3.2 All `group_activity` handlers (`group.join_requested`, `group.join_approved`, `group.join_rejected`, `group.leader_assigned`, `group.member_muted`, `group.member_banned`, `group.ownership_transferred`, `group.archived`): add `emailData: {}` to each `deliverNotification()` call
  - [x] 3.3 Update `getEmailTemplateForType()` in `notification-service.ts`: add `case "mention": return "notification-mention"` and `case "group_activity": return "notification-group-activity"`
  - [x] 3.4 Add comment in notification-service.ts: `// post_interaction: no event handlers exist yet (deferred — Epic 4 post-interaction story will add emailData when post.reacted/post.commented handlers are implemented)`
  - [x] 3.5 Add/update `notification-service.test.ts` — test: `message.mentioned` fires → `enqueueEmailJob` called when user has `channelEmail: true` and router returns email not-suppressed; test: `group.join_approved` fires → `enqueueEmailJob` called

- [x] Task 4: B2 + U4+U5 — PushSubscriptionToggle fix + matrix integration (AC: B2 #5–11)
  - [x] 4.0 **Audit `PushSubscriptionToggle.tsx` onChange wiring**: Verified checkbox `onChange` correctly calls `subscribe()`/`unsubscribe()` — wiring was already correct (line 56: `onChange={isSubscribed ? () => void unsubscribe() : () => void subscribe()}`). No fix needed.
  - [x] 4.1 Remove the standalone "Push Notifications" `<section>` block from `src/app/[locale]/(app)/settings/notifications/page.tsx` (the section with `t("push.sectionTitle")` and `<PushSubscriptionToggle />`); keep QueryClientProvider wrapper
  - [x] 4.2 In `NotificationPreferencesMatrix.tsx`, import `usePushSubscription` from `@/hooks/use-push-subscription`
  - [x] 4.3 In the table `<thead>`, replace the plain Push column header (`{t("channels.push")}`) with a header that contains: the column label above, and below it the `<PushSubscriptionToggle />` component (inline, compact). When `status === "unsupported"` or `status === "denied"`, render the existing PushSubscriptionToggle states (they already show the appropriate message). When `status === "loading"`, show a small spinner.
  - [x] 4.4 Add `pushSubscribed` boolean derived from `status === "subscribed"` to gate per-row Push toggles: pass `disabled={!pushSubscribed}` to each Push column `<Toggle />` component; when disabled, add `title={t("push.enableToConfigurePush")}` tooltip
  - [x] 4.5 Add i18n key `Notifications.push.enableToConfigurePush` = `"Enable push notifications to configure"` (en) / `"Gbaa push notifications ka ị hazie"` (ig) to `messages/en.json` and `messages/ig.json`
  - [x] 4.6 Update `NotificationPreferencesMatrix.test.tsx` — 3 new test cases added (subscribed/unsubscribed/unsupported)
  - [x] 4.7 `PushSubscriptionToggle.tsx` onChange wiring confirmed correct — no variant prop added (not needed); `PushSubscriptionToggle` is mocked in matrix tests via stub

- [x] Task 5: U1 — Page padding (AC: U1 #19)
  - [x] 5.1 In `src/app/[locale]/(app)/settings/notifications/page.tsx`, changed outer div to `<main className="mx-auto max-w-2xl px-4 py-8">` wrapping a `<div className="space-y-8">` inside
  - [x] 5.2 Created `page.test.tsx` with 4 tests verifying the container element and absence of standalone push section

- [x] Task 6: U2 — Timezone auto-detect (AC: U2 #20–21)
  - [x] 6.1 In `QuietHoursForm.tsx`, changed `useState("UTC")` to lazy initializer with `Intl.DateTimeFormat().resolvedOptions().timeZone` + try/catch + COMMON_TIMEZONES membership check
  - [x] 6.2 Updated `QuietHoursForm.test.tsx` with 2 tests: detected timezone pre-selected, fallback to UTC for unknown timezone

- [x] Task 7: U3 — Quiet hours post-save summary (AC: U3 #22–25)
  - [x] 7.1 Added `saved` and `savedValues` state to `QuietHoursForm.tsx`
  - [x] 7.2 On successful save: `setSaved(true)` and `setSavedValues({ start, end, timezone })`
  - [x] 7.3 Summary state rendered when `saved === true` with `{t("savedSummary")} · start → end (timezone) · [Edit]`; form hidden in summary state
  - [x] 7.4 Added i18n keys `savedSummary` and `editButton` to both `messages/en.json` and `messages/ig.json`
  - [x] 7.5 Added 2 tests to `QuietHoursForm.test.tsx`: save→summary visible, Edit→form re-appears

- [x] Task 8: Final pass — sprint-status.yaml update and test run
  - [x] 8.1 Run full test suite: `bun run test` — 3614 passing + 10 skipped; 12 failures (2 pre-existing lua-runner + 10 pre-existing BottomNav — confirmed via git stash)
  - [x] 8.2 No regressions introduced — all failures are pre-existing

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [ ] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [ ] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [ ] All tests passing (run `bun test` locally before review)
- [ ] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts`
- [ ] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [ ] New member statuses/roles audited across ALL entry-point functions for permission gaps
- [ ] **B3 audit completed**: All `EMAIL_ELIGIBLE_TYPES` types have a handler that passes `emailData` OR have an explicit deferral comment. `post_interaction` must have the deferral comment in place.
- [ ] **Pipeline story DoD (Epic 9 retro AI-1)**: Verified at least one notification delivery path end-to-end in a real/dev environment (e.g., triggered a `member.followed` event and confirmed in-app bell notification appeared + email received if configured)

## Dev Notes

### B1 — Router fallback implementation

**File:** `src/services/notification-router.ts`

Current vulnerable code at line ~76:

```ts
const prefs = await getNotificationPreferences(userId);
```

Required fix — wrap in try/catch:

```ts
let prefs: Awaited<ReturnType<typeof getNotificationPreferences>>;
try {
  prefs = await getNotificationPreferences(userId);
} catch (err: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "notification_router.preferences_fetch_failed",
      userId,
      error: String(err),
    }),
  );
  prefs = {}; // DEFAULT_PREFERENCES will be used for every type fallback below
}
```

`DEFAULT_PREFERENCES` is already imported from `@/db/queries/notification-preferences`. The existing fallback logic `typePref?.channelInApp ?? defaults.inApp` already handles the case where `prefs[type]` is undefined — so an empty `prefs = {}` correctly falls back to defaults for all channels.

### B2 — Push column gate in matrix

**Files:** `src/components/notifications/NotificationPreferencesMatrix.tsx`, `src/app/[locale]/(app)/settings/notifications/page.tsx`

Design:

- The `<th>` for the Push column becomes a container with two elements: (1) column label `{t("channels.push")}`, (2) a compact `<PushSubscriptionToggle />` below the label
- `PushSubscriptionToggle` already handles unsupported/denied/loading/subscribed states — no new states needed
- Per-row Push `<Toggle>` components get `disabled={status !== "subscribed"}` prop
- When disabled, the Toggle component already handles `disabled` prop (renders with `disabled:opacity-50`)

**CAUTION**: `usePushSubscription` uses browser APIs (service worker, Notification permission). In tests, mock the hook: `vi.mock("@/hooks/use-push-subscription", () => ({ usePushSubscription: vi.fn() }))` — set return value per test case.

### B3 — Email handler audit result

**Types affected:**

| Type               | Handler(s)                                                                                                           | emailData fix                            | Template                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| `mention`          | `message.mentioned`                                                                                                  | `{ preview: contentPreview }`            | `notification-mention`        |
| `group_activity`   | 8 handlers (join_requested/approved/rejected, leader_assigned, member_muted/banned, ownership_transferred, archived) | `{}` (name added by deliverNotification) | `notification-group-activity` |
| `post_interaction` | None (handlers deferred to Epic 4)                                                                                   | N/A — add deferral comment               | N/A                           |

**Email template pattern** (follow `src/templates/email/notification-event-reminder.ts` — a fully wired end-to-end template; note: `notification-new-follower.ts` exists but is orphaned/never invoked):

- Import `renderBase`, `escHtml` from `"./base"`
- Bilingual `COPY` object with `subject`, `body(d)` HTML fn, `text(d)` plain text fn
- `UNSUBSCRIBE_URL = "/settings/notifications"`
- `export function render(data, locale)` → `EmailTemplateResult`

**notification-mention template data**: `{ name: string, preview: string }`
**notification-group-activity template data**: `{ name: string, title: string, body: string }` — use `title` + `body` from the notification call

**CRITICAL**: `getEmailTemplateForType()` in notification-service.ts is the only gating function. After adding the new cases, verify no existing case is accidentally shadowed.

**Required `getEmailTemplateForType()` code change** (lines ~60–71):

```ts
case "mention": return "notification-mention";
case "group_activity": return "notification-group-activity";
```

Add these two cases to the existing switch statement alongside the `event_reminder`, `admin_announcement`, and `message` cases.

### U2 — Timezone detection

```ts
const [timezone, setTimezone] = useState(() => {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return COMMON_TIMEZONES.includes(detected) ? detected : "UTC";
  } catch {
    return "UTC";
  }
});
```

Wrap in try/catch — `Intl.DateTimeFormat` can throw in very old environments or SSR contexts.

**Test mock pattern:**

```ts
vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
  resolvedOptions: () => ({ timeZone: "Europe/London" }),
} as Intl.DateTimeFormat);
```

### U3 — Post-save summary

The `enabled` checkbox and save form are hidden when `saved === true`. The `handleDisable` function should also reset `saved` to false. State flow:

- Mount: `saved=false`, form visible
- User enables checkbox, fills times, clicks Save → API call → `saved=true`, summary visible
- "Edit" button: `saved=false`, form re-visible with current values preserved
- Disable checkbox (while in saved state): calls `handleDisable`, sets `enabled=false`, sets `saved=false`

### B2 — PushSubscriptionToggle onChange audit

**File:** `src/components/notifications/PushSubscriptionToggle.tsx`

The retro identified "checkbox onChange not properly wired to subscribe() fn". Audit the `<input type="checkbox">` onChange handler — it must call `subscribe()` when checked and `unsubscribe()` when unchecked. The hook returns `{ status, subscribe, unsubscribe }` — there is NO `isSubscribed` boolean; consumers must compare `status === "subscribed"`.

Also verify VAPID guard: if `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is an empty string (dev default), `subscribe()` in `use-push-subscription.ts` should fail gracefully rather than silently swallowing the browser permission prompt.

### QuietHoursForm limitation (out of scope)

`QuietHoursForm` does not load existing quiet hours from the server on mount — it always starts with `enabled=false`. If a user has existing quiet hours set, revisiting the page shows them as disabled. The U3 post-save summary only persists within the current browser session. Server-side hydration of existing quiet hours state is out of scope for Story 9.5.

### Page structure comparison

Check `src/app/[locale]/(app)/settings/profile/page.tsx` (or similar settings page) for the canonical container pattern before adding the wrapper in Task 5. The container class must be consistent across settings pages.

### i18n Keys to Add

**messages/en.json** — under `Notifications`:

```json
"push": {
  ...existing...,
  "enableToConfigurePush": "Enable push notifications to configure"
},
"quietHours": {
  ...existing...,
  "savedSummary": "Active",
  "editButton": "Edit"
}
```

**messages/ig.json** — same structure with Igbo translations:

- `push.enableToConfigurePush` → `"Gbaa push notifications ka ị hazie"`
- `quietHours.savedSummary` → `"Ọ na-arụ ọrụ"`
- `quietHours.editButton` → `"Gbanwee"`

### Testing Patterns

**notification-router.test.ts — B1 test structure:**

```ts
it("falls back to DEFAULT_PREFERENCES when getNotificationPreferences throws", async () => {
  vi.mocked(getNotificationPreferences).mockRejectedValue(new Error("DB down"));
  vi.mocked(filterNotificationRecipients).mockResolvedValue(["user-1"]);
  vi.mocked(redis.exists).mockResolvedValue(0);
  const result = await notificationRouter.route({
    userId: "user-1",
    actorId: "actor-1",
    type: "message",
  });
  expect(result.inApp.suppressed).toBe(false); // DEFAULT_PREFERENCES.message.inApp = true
});
```

**NotificationPreferencesMatrix.test.tsx — B2 push gate tests:**

```ts
// Mock usePushSubscription with status: "unsubscribed"
// Render matrix, assert Push column toggles have aria-disabled or disabled attribute
// Assert prompt text "Enable push notifications to configure" is visible
```

**QuietHoursForm.test.tsx — U3 summary state:**

```ts
// Render, enable quiet hours, fill times, click Save
// Mock PUT to return 200
// Assert "Active" text visible, form inputs not visible
// Click "Edit" button
// Assert form inputs visible again
```

### Project Structure Notes

- Email templates: `src/templates/email/` — one file per template, `index.ts` as registry
- No `src/db/schema/index.ts` — schemas imported directly. No schema changes in this story.
- No migrations needed — B1/B2/B3/U1-U5 are all service/component/template changes only
- `withApiHandler` dynamic params pattern: no new routes in this story — no dynamic param extraction needed
- `vi-patterns.ts` location: `src/test/vi-patterns.ts` (verified)

### References

- Epic 9 Retrospective: `_bmad-output/implementation-artifacts/epic-9-retro-2026-03-07.md` — B1/B2/B3 root cause analysis + U1–U5 UX findings
- `src/services/notification-router.ts` — `route()` method, `EMAIL_ELIGIBLE_TYPES`, `getNotificationPreferences` call (line ~76)
- `src/services/notification-service.ts` — `deliverNotification()`, `getEmailTemplateForType()`, all EventBus handlers
- `src/components/notifications/NotificationPreferencesMatrix.tsx` — table structure, Push column Toggle
- `src/components/notifications/PushSubscriptionToggle.tsx` — existing states: unsupported/denied/loading/subscribed
- `src/components/notifications/QuietHoursForm.tsx` — state management, handleSave/handleDisable
- `src/app/[locale]/(app)/settings/notifications/page.tsx` — current page structure (standalone Push section to remove)
- `src/templates/email/notification-new-follower.ts` — reference template (bilingual pattern)
- `src/templates/email/index.ts` — REGISTRY (add new templates here)
- `src/test/vi-patterns.ts` — location to add B1 resilience pattern
- `src/hooks/use-push-subscription.ts` — hook to import in matrix; mock in tests

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all tasks implemented cleanly.

### Completion Notes List

- **B1 (Task 1)**: `NotificationRouter.route()` now wraps `getNotificationPreferences()` in try/catch. On DB error: logs structured JSON, falls back to `prefs = {}` so `DEFAULT_PREFERENCES` governs all channels. 3 new tests confirm graceful degradation. vi-patterns.ts updated with "notification critical path resilience" pattern.
- **B3 Templates (Task 2)**: Created `notification-mention.ts` and `notification-group-activity.ts` bilingual email templates. Both registered in REGISTRY. `EMAIL_ELIGIBLE_TYPES` extended to include `"mention"` and `"group_activity"`. 10 new template tests in index.test.ts.
- **B3 Handler wiring (Task 3)**: `message.mentioned` now passes `emailData: { preview: contentPreview }`. All 8 `group_activity` handlers pass `emailData: {}`. `getEmailTemplateForType()` handles `"mention"` and `"group_activity"` cases. Deferral comments for `post_interaction` and orphaned `notification-new-follower` template added. 2 new B3 tests in notification-service.test.ts.
- **B2/U4+U5 (Task 4)**: `PushSubscriptionToggle` onChange wiring was already correct — no fix needed. Standalone Push section removed from page. `NotificationPreferencesMatrix` imports `usePushSubscription` + `PushSubscriptionToggle`; Push column header contains the toggle; per-row Push toggles gated by `pushSubscribed`. 3 new B2 tests in matrix test file. `push.enableToConfigurePush` i18n key added.
- **U1 (Task 5)**: Page wrapped in `<main className="mx-auto max-w-2xl px-4 py-8">`. New `page.test.tsx` with 4 tests.
- **U2 (Task 6)**: `QuietHoursForm` timezone state uses lazy initializer with `Intl.DateTimeFormat().resolvedOptions().timeZone` + try/catch. 2 new tests.
- **U3 (Task 7)**: Post-save summary state added to `QuietHoursForm`. `saved`/`savedValues` state; summary renders on success, "Edit" button returns to form. `savedSummary`/`editButton` i18n keys added. 2 new tests.
- **Test results**: 3614 passing + 10 skipped + 12 pre-existing failures (2 lua-runner + 10 BottomNav). No new regressions.

### File List

- `src/services/notification-router.ts` — B1 try/catch + B3 EMAIL_ELIGIBLE_TYPES update
- `src/services/notification-router.test.ts` — +3 B1 graceful degradation tests (tests 20–22)
- `src/services/notification-service.ts` — B3 emailData wiring (message.mentioned + 8 group_activity handlers) + getEmailTemplateForType() + deferral comments
- `src/services/notification-service.test.ts` — +2 B3 tests (B3.1 mention email, B3.2 group.join_approved email); added getNotificationPreferences import
- `src/templates/email/notification-mention.ts` — NEW bilingual mention email template
- `src/templates/email/notification-group-activity.ts` — NEW bilingual group activity email template
- `src/templates/email/index.ts` — registered 2 new templates + imports
- `src/templates/email/index.test.ts` — added 2 templates to minData + 4 explicit tests + count updated 18→20
- `src/components/notifications/NotificationPreferencesMatrix.tsx` — B2: imports usePushSubscription + PushSubscriptionToggle; Push column header update; per-row push gate
- `src/components/notifications/NotificationPreferencesMatrix.test.tsx` — B2: mocks for usePushSubscription + PushSubscriptionToggle stub; +3 push gate tests; defaultBeforeEach includes pushStatus
- `src/components/notifications/QuietHoursForm.tsx` — U2: timezone auto-detect; U3: saved/savedValues state + summary view
- `src/components/notifications/QuietHoursForm.test.tsx` — U2: +2 timezone tests; U3: +2 summary state tests
- `src/app/[locale]/(app)/settings/notifications/page.tsx` — U1: main container + removed standalone Push section (B2/U4+U5)
- `src/app/[locale]/(app)/settings/notifications/page.test.tsx` — NEW: 4 page render tests
- `src/test/vi-patterns.ts` — B1: notification critical path resilience pattern
- `messages/en.json` — push.enableToConfigurePush, quietHours.savedSummary, quietHours.editButton
- `messages/ig.json` — push.enableToConfigurePush, quietHours.savedSummary, quietHours.editButton

## Change Log

- 2026-03-08: Story 9.5 implemented — B1 router fallback, B3 email templates + handler wiring, B2 push matrix integration, U1 page padding, U2 timezone auto-detect, U3 quiet hours save summary. +16 net new tests. (claude-sonnet-4-6)
- 2026-03-08: **Code review fixes (claude-opus-4-6)** — F1: fixed test name "18→20" in index.test.ts; F2+F3: all group_activity handlers now pass `link` in emailData, notification-group-activity template uses dynamic `d.link` with `/dashboard` fallback; F4: mention handler passes conversation link in emailData, notification-mention template uses dynamic `d.link` with `/chat` fallback; +4 new template tests (link assertions + fallback tests), +1 B3 test assertion (link in emailData). Total: 5 review fix tests.
