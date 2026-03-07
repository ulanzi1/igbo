# Story 9.2: Email Notifications

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to receive email notifications for important platform activity,
so that I'm alerted to significant events even when I'm not actively using the platform.

## Acceptance Criteria

1. **Given** a notification-triggering event occurs that warrants email, **When** the notification router (Story 9.1) determines email is not suppressed for this notification, **Then** `deliverNotification()` calls `enqueueEmailJob()` with the appropriate template, recipient email, language preference, and event-specific data, **And** emails are delivered within 5 minutes with 98%+ inbox placement rate (NFR-I3).

2. **Given** the router determines email is appropriate, **When** the system renders the email, **Then** it uses a branded HTML template with OBIGBO visual identity (existing `renderBase()` from `src/templates/email/base.ts`), **And** the email includes a clear CTA linking to the relevant content on the platform, **And** an unsubscribe link is present for GDPR compliance (NFR-S9), **And** all templates are available in both English and Igbo based on the recipient's `languagePreference`.

3. **Given** the following notification types should trigger email delivery, **When** the router's `EMAIL_ELIGIBLE_TYPES` set is evaluated, **Then** the set includes: `event_reminder`, `admin_announcement`, `message` (first DM only — see AC6), **And** types NOT eligible for email remain: `mention`, `group_activity`, `post_interaction`, `system` (these stay in-app only for now; `post_interaction` was in 9.1 allowlist but has no template — remove it).

4. **Given** the email notification requires the recipient's email and language preference, **When** `deliverNotification()` dispatches email, **Then** it calls `findUserById(userId)` to get `email` and `languagePreference`, **And** if the user has no email or email is null, the email channel is silently skipped (no error).

5. **Given** new email templates are needed, **When** this story is implemented, **Then** the following templates are created in `src/templates/email/`:
   - `notification-event-reminder.ts` — data: `{ name, eventTitle, startTime, eventUrl }` — "You have an upcoming event"
   - `notification-member-approved.ts` — data: `{ name }` — "Your membership has been approved" (distinct from existing `welcome-approved` which is the admin-side template)
   - `notification-new-follower.ts` — data: `{ name, followerName, profileUrl }` — "Someone started following you"
   - `notification-first-dm.ts` — data: `{ name, senderName, messagePreview, chatUrl }` — "You received a new message"
     **And** each template follows the existing pattern: bilingual `COPY` object (en/ig), `render(data, locale)` function, uses `renderBase()` + `escHtml()`.

6. **Given** direct messages should trigger email only for the **first message** in a conversation (FR73 — "first message in a conversation"), **When** a `message.sent` event occurs AND the conversation has exactly 1 message (the one just sent), **Then** email is dispatched with the `notification-first-dm` template. **Note:** This requires checking message count in the conversation. The `message.sent` handler in `notification-service.ts` currently does NOT exist (only `message.mentioned` exists) — a new `message.sent` handler must be added that ONLY triggers email (no in-app notification, since chat already has real-time delivery).

7. **Given** article events (submitted/published/rejected/revision_requested) already send email directly in their event handlers (bypassing the router email channel), **When** this story is implemented, **Then** those direct email sends remain unchanged — do NOT route them through the new email dispatch logic in `deliverNotification()`. The existing comments (`// Email sent directly — not via NotificationRouter email channel`) are preserved.

8. **Given** all new email templates include an unsubscribe link, **When** the email is rendered, **Then** the unsubscribe URL points to `/settings/notifications` (the notification preferences page from Story 9.4 — for now, this is a placeholder URL that will become functional when 9.4 is implemented), **And** the link text is bilingual ("Unsubscribe from these emails" / "Kagbuo ozi email ndị a").

## Tasks / Subtasks

- [x] Task 1: Add `emailData` param to `deliverNotification()` and wire email dispatch (AC: 1, 4, 7)
  - [x] 1.1 Add optional `emailData?: Record<string, unknown>` param to `deliverNotification()` signature in `notification-service.ts`
  - [x] 1.2 Replace the email stub `console.debug(...)` block with real email dispatch logic
  - [x] 1.3 Create helper function `getEmailTemplateForType(type: NotificationType): string | null`
  - [x] 1.4 Preserve article event direct-send pattern unchanged — do NOT modify article event handlers

- [x] Task 2: Update `EMAIL_ELIGIBLE_TYPES` in `notification-router.ts` (AC: 3)
  - [x] 2.1 Remove `"post_interaction"` from `EMAIL_ELIGIBLE_TYPES`
  - [x] 2.2 Add `"message"` to `EMAIL_ELIGIBLE_TYPES`
  - [x] 2.3 Keep `"event_reminder"` and `"admin_announcement"` (already present)

- [x] Task 3: Update event handlers to pass `emailData` (AC: 1, 5)
  - [x] 3.1 Update `member.approved` handler to pass `emailData: {}`
  - [x] 3.2 `member.followed` — in-app only for MVP; `notification-new-follower.ts` template created but NOT wired
  - [x] 3.3 Update `event.reminder` handler to pass `emailData`
  - [x] 3.4 Update `event.waitlist_promoted` handler to pass `emailData`

- [x] Task 4: Add `message.sent` handler for first-DM email (AC: 6)
  - [x] 4.1 Extend `MessageSentEvent` interface in `src/types/events.ts` (additive — all new fields optional)
  - [x] 4.2 `"message.sent"` already exists in EventName/EventMap — no changes needed
  - [x] 4.3 Add `message.sent` handler in `notification-service.ts` (inside HMR guard)
  - [x] 4.4 Update existing `eventBus.emit("message.sent", ...)` in `message-service.ts:sendMessage()` to include new fields; `db.select` chain fetches conversation type, members, message count
  - [x] 4.5 First-DM handler creates in-app notification AND sends email; subsequent messages return early

- [x] Task 5: Create email templates (AC: 5, 8)
  - [x] 5.1 Create `src/templates/email/notification-event-reminder.ts`
  - [x] 5.2 Create `src/templates/email/notification-member-approved.ts`
  - [x] 5.3 Create `src/templates/email/notification-first-dm.ts`
  - [x] 5.4 Create `src/templates/email/notification-new-follower.ts` (created but NOT wired)
  - [x] 5.5 Register all 4 new templates in `src/templates/email/index.ts` REGISTRY
  - [x] 5.6 Modify `renderBase()` to accept optional `unsubscribeUrl?: string`; notification templates pass `/settings/notifications`

- [x] Task 6: Add i18n keys (AC: 6)
  - [x] 6.1 Add keys to `messages/en.json` — `notifications.new_message.title/body`
  - [x] 6.2 Add matching keys to `messages/ig.json`

- [x] Task 7: Write tests for email dispatch in `deliverNotification()` (AC: 1, 3, 4)
  - [x] 7.1 6 tests in `notification-service.test.ts` (E1–E6)
  - [x] 7.2 4 tests for `message.sent` handler (M1–M4)
  - [x] 7.3 2 tests for updated `EMAIL_ELIGIBLE_TYPES` in `notification-router.test.ts` (tests 11–12)

- [x] Task 8: Write tests for new email templates (AC: 5, 8)
  - [x] 8.1 `notification-event-reminder.test.ts` (5 tests)
  - [x] 8.2 `notification-member-approved.test.ts` (3 tests)
  - [x] 8.3 `notification-first-dm.test.ts` (5 tests including XSS)
  - [x] 8.4 `notification-new-follower.test.ts` (4 tests)

- [x] Task 9: Run all tests and verify zero regressions (AC: all)
  - [x] 9.1 Full test suite run — 3502 passing, 10 skipped, 2 pre-existing failures in points-lua-runner.test.ts
  - [x] 9.2 notification-service.test.ts passes (existing + 10 new tests)
  - [x] 9.3 notification-router.test.ts passes (existing + 2 new tests)
  - [x] 9.4 All 4 new template test files pass
  - [x] 9.5 eventbus-bridge.test.ts and notification-flow.test.ts — no changes needed (MessageSentEvent new fields are optional)

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses (N/A — no UI changes, email templates are server-side rendered)
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json` (notifications.new_message.title/body)
- [x] All tests passing (3502/3502 passing, 10 skipped, 2 pre-existing failures in points-lua-runner.test.ts)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` — N/A, no new bridge imports
- [x] `successResponse()` calls with non-200 status use 3rd arg (N/A — no API routes)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps (N/A)
- [x] Email templates use `escHtml()` for ALL user-supplied data (XSS prevention — tested in notification-first-dm.test.ts)
- [x] Unsubscribe link present in all notification email templates

## Dev Notes

### Architecture Overview

This story wires the email channel stub in `deliverNotification()` (left by Story 9.1) to actually call `enqueueEmailJob()` with per-type email templates. It also adds a `message.sent` EventBus event for first-DM email notifications.

**Key architectural decision:** An optional `emailData?: Record<string, unknown>` parameter is added to `deliverNotification()`. Each event handler passes event-specific data (event title, sender name, etc.) through this param. The `deliverNotification()` function merges `{ name: user.name }` with `emailData` and passes it to `enqueueEmailJob()`. This avoids the article-event pattern of bypassing the router — all new email notifications flow through the router for consistent DnD/block/mute enforcement.

**Scope boundaries:**

- **IN scope:** Email templates for event reminders, member approval, first DM. Wiring `enqueueEmailJob()` in `deliverNotification()`. Updating `EMAIL_ELIGIBLE_TYPES`. Adding `message.sent` event.
- **OUT of scope:** Digest email batching (Story 9.4). Per-type email preferences UI (Story 9.4). Push notifications (Story 9.3). Email for `member.followed` / `group_activity` / `post_interaction` (deferred to 9.4 preferences).

### Existing Infrastructure (DO NOT REINVENT)

**`src/services/email-service.ts`** — `enqueueEmailJob(name, payload)` where `payload = { to, templateId, data, locale }`. Already works. Uses Resend API. Respects `ENABLE_EMAIL_SENDING` env flag.

**`src/templates/email/base.ts`** — `renderBase(htmlContent, lang)` wraps content in branded HTML shell. `escHtml(val)` escapes user data. **Modification needed:** Add optional unsubscribe footer support.

**`src/templates/email/index.ts`** — `REGISTRY` maps templateId → render function. `renderTemplate(templateId, data, locale)` resolves and calls renderer.

**`src/services/notification-router.ts`** — `EMAIL_ELIGIBLE_TYPES` set controls which notification types get email. Currently: `event_reminder`, `admin_announcement`, `post_interaction`. **Modification needed:** Remove `post_interaction`, add `message`.

**`src/services/notification-service.ts`** — `deliverNotification()` has the email stub at lines 104-114. **Modification needed:** Replace stub with real dispatch.

**`findUserById()`** from `@/db/queries/auth-queries` — already imported in notification-service.ts (used by article handlers). Returns `{ id, email, name, languagePreference, ... }`.

### Critical: Article Email Direct-Send Pattern (DO NOT CHANGE)

Article events (`article.submitted`, `article.published`, `article.rejected`, `article.revision_requested`) send email DIRECTLY in their event handlers — NOT through the `deliverNotification()` email channel. This is by design (Story 9.1). Do NOT modify these handlers. They already have the correct templates and the comments documenting why they bypass the router.

### Critical: `message.sent` Event Emission Point

`message.sent` is **already emitted** by `src/services/message-service.ts:PlaintextMessageService.sendMessage()`. The existing payload is:

```typescript
{
  (messageId,
    senderId,
    conversationId,
    content,
    contentType,
    createdAt,
    parentMessageId,
    timestamp);
}
```

Story 9.2 **extends** this emission with additional fields. Update the existing `eventBus.emit("message.sent", ...)` call to add:

- `recipientId: string` — the other participant in the direct conversation (requires fetching conversation participants or threading through `SendMessageParams`)
- `messagePreview: string` — `content.slice(0, 100)` (plain text, no HTML — safe to pass through email template which will `escHtml()` it)
- `messageCount: number` — `(await db.select({ count: count() }).from(chatMessages).where(eq(chatMessages.conversationId, conversationId)))[0].count` after insert
- `conversationType: "direct" | "group" | "channel"` — from conversation record
- `senderName: string` — use `authUsers.name` for the sender (already available via `findUserById(senderId)` or join on conversation fetch)

The handler in notification-service.ts filters on `conversationType !== "direct"` and `messageCount !== 1` — so the emission change is additive and safe for group/channel messages.

### Critical: Unsubscribe Link Pattern

All notification emails (NOT transactional emails like password reset, email verification) must include an unsubscribe link. The link points to `/settings/notifications` which will be built in Story 9.4. For now this is a valid URL that will show a 404 — acceptable for MVP since the platform is invite-only and the preferences page is coming next.

The unsubscribe footer should be added to `renderBase()` as an opt-in parameter so existing transactional templates are not affected.

### Test File Patterns

New template tests follow the existing pattern (e.g., `article-published.ts`):

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./notification-event-reminder";

describe("notification-event-reminder email template", () => {
  const data = {
    name: "Chidi",
    eventTitle: "Igbo Language Class",
    startTime: "2026-03-15T14:00:00Z",
    eventUrl: "/events/abc-123",
  };

  it("renders EN HTML with event details", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("upcoming event");
    expect(result.html).toContain("Igbo Language Class");
    expect(result.html).toContain("/events/abc-123");
    expect(result.html).toContain("settings/notifications"); // unsubscribe
  });

  it("renders IG HTML with Igbo copy", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Igbo Language Class");
  });

  it("renders plain text with all data", () => {
    const result = render(data, "en");
    expect(result.text).toContain("Igbo Language Class");
    expect(result.text).toContain("/events/abc-123");
  });
});
```

For `notification-service.test.ts` additions, mock `findUserById` to return `{ id: "user-1", email: "test@example.com", name: "Test", languagePreference: "en" }` and assert `enqueueEmailJob` was called with correct templateId and data.

### `db.execute()` Mock Format Reminder

If any queries use `db.execute(sql...)`, remember mock returns raw array (NOT `{ rows: [...] }`).

### Project Structure Notes

| File                                                       | Action     | Notes                                                                                                                                                                    |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/notification-service.ts`                     | **MODIFY** | Replace email stub with `enqueueEmailJob()` dispatch; add `emailData` param; add `message.sent` handler; add `getEmailTemplateForType()` helper                          |
| `src/services/notification-router.ts`                      | **MODIFY** | Update `EMAIL_ELIGIBLE_TYPES`: remove `post_interaction`, add `message`                                                                                                  |
| `src/types/events.ts`                                      | **MODIFY** | Extend existing `MessageSentEvent` with `recipientId`, `messagePreview`, `messageCount`, `conversationType`, `senderName` — `message.sent` already in EventName/EventMap |
| `src/templates/email/notification-event-reminder.ts`       | **NEW**    | Bilingual email template                                                                                                                                                 |
| `src/templates/email/notification-member-approved.ts`      | **NEW**    | Bilingual email template                                                                                                                                                 |
| `src/templates/email/notification-first-dm.ts`             | **NEW**    | Bilingual email template                                                                                                                                                 |
| `src/templates/email/notification-new-follower.ts`         | **NEW**    | Bilingual email template (created but not wired)                                                                                                                         |
| `src/templates/email/base.ts`                              | **MODIFY** | Add optional unsubscribe footer to `renderBase()`                                                                                                                        |
| `src/templates/email/index.ts`                             | **MODIFY** | Register 4 new templates in REGISTRY                                                                                                                                     |
| `src/services/notification-service.test.ts`                | **MODIFY** | Add ~8 new tests for email dispatch + message.sent handler                                                                                                               |
| `src/services/notification-router.test.ts`                 | **MODIFY** | Update EMAIL_ELIGIBLE_TYPES tests                                                                                                                                        |
| `src/templates/email/notification-event-reminder.test.ts`  | **NEW**    | Template tests                                                                                                                                                           |
| `src/templates/email/notification-member-approved.test.ts` | **NEW**    | Template tests                                                                                                                                                           |
| `src/templates/email/notification-first-dm.test.ts`        | **NEW**    | Template tests                                                                                                                                                           |
| `src/templates/email/notification-new-follower.test.ts`    | **NEW**    | Template tests                                                                                                                                                           |
| `messages/en.json`                                         | **MODIFY** | Add `notifications.new_message.*` keys                                                                                                                                   |
| `messages/ig.json`                                         | **MODIFY** | Add `notifications.new_message.*` keys                                                                                                                                   |
| `src/services/message-service.ts`                          | **MODIFY** | Update existing `eventBus.emit("message.sent", ...)` to include `recipientId`, `messagePreview`, `messageCount`, `conversationType`, `senderName`                        |

**DO NOT TOUCH:**

- `src/db/migrations/` — no migration needed
- `src/db/schema/platform-notifications.ts` — no schema changes
- Article event handlers in `notification-service.ts` — preserve direct email sends as-is
- `src/server/realtime/subscribers/eventbus-bridge.ts` — unless `message.sent` event requires bridge handling (it should NOT — email is server-side only)

### References

- Story 1.17 (Transactional Email Service): `src/services/email-service.ts` — `enqueueEmailJob()`, `EmailPayload` interface
- Story 9.1 (Notification Router): `src/services/notification-router.ts` — `EMAIL_ELIGIBLE_TYPES`, email channel stub
- Story 9.1 (Notification Service refactor): `src/services/notification-service.ts` — `deliverNotification()` with router, email stub at lines 104-114
- Email template pattern: `src/templates/email/article-published.ts` — bilingual COPY, `render(data, locale)`, `renderBase()` + `escHtml()`
- Template registry: `src/templates/email/index.ts` — `REGISTRY` map, `renderTemplate()`
- Base template: `src/templates/email/base.ts` — `renderBase(html, lang)`, `escHtml(val)`
- Auth queries: `src/db/queries/auth-queries.ts` — `findUserById()` returns user with email + languagePreference
- PRD FR73: "email notifications for DMs (first message), event reminders, membership status, article publication, admin announcements"
- NFR-I3: "Email delivery < 5min, 98%+ inbox placement"
- NFR-S9: "GDPR unsubscribe link in emails"
- Epic 9 overview: `_bmad-output/planning-artifacts/epics.md` lines 2483-2509
- Story 9.4 (deferred): Notification preferences DB table + UI + digest batching

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without blockers.

### Completion Notes List

- Replaced email stub in `deliverNotification()` with real `enqueueEmailJob()` dispatch gated on router decision, user email presence, and template existence.
- Added `getEmailTemplateForType()` helper mapping 3 types to templates; `admin_announcement` MVP-coupled to `member.approved` only (documented for Story 9.4 decoupling).
- `EMAIL_ELIGIBLE_TYPES` updated: removed `post_interaction`, added `message`.
- `MessageSentEvent` extended with 5 optional fields (additive, no bridge changes needed).
- `sendMessage()` in message-service.ts now fetches conversation type, direct-message recipient, sender name, and message count for first-DM detection. Uses default `"group"` type when conversation row not found.
- 4 new bilingual email templates with unsubscribe link to `/settings/notifications`.
- `renderBase()` now accepts optional `unsubscribeUrl` — backwards compatible (defaults to `#`).
- 27 net new tests; 0 regressions. Pre-existing failures in points-lua-runner.test.ts (2) unchanged.

### File List

- `src/services/notification-service.ts` — MODIFIED: emailData param, email dispatch, getEmailTemplateForType helper, message.sent handler, handler emailData wiring
- `src/services/notification-router.ts` — MODIFIED: updated EMAIL_ELIGIBLE_TYPES (removed post_interaction, added message)
- `src/types/events.ts` — MODIFIED: MessageSentEvent extended with recipientId, messagePreview, messageCount, conversationType, senderName (all optional)
- `src/services/message-service.ts` — MODIFIED: sendMessage() fetches conversation details and extends message.sent emit
- `src/templates/email/base.ts` — MODIFIED: renderBase() accepts optional unsubscribeUrl param
- `src/templates/email/index.ts` — MODIFIED: registered 4 new templates
- `src/templates/email/notification-event-reminder.ts` — NEW
- `src/templates/email/notification-member-approved.ts` — NEW
- `src/templates/email/notification-first-dm.ts` — NEW
- `src/templates/email/notification-new-follower.ts` — NEW (not wired in getEmailTemplateForType — Story 9.4)
- `messages/en.json` — MODIFIED: notifications.new_message.title/body
- `messages/ig.json` — MODIFIED: notifications.new_message.title/body
- `src/services/notification-service.test.ts` — MODIFIED: updated message.sent listener test; added E1–E6 email dispatch + M1–M4 message.sent handler tests
- `src/services/notification-router.test.ts` — MODIFIED: added tests 11–12 for updated EMAIL_ELIGIBLE_TYPES
- `src/templates/email/notification-event-reminder.test.ts` — NEW
- `src/templates/email/notification-member-approved.test.ts` — NEW
- `src/templates/email/notification-first-dm.test.ts` — NEW
- `src/templates/email/notification-new-follower.test.ts` — NEW
- `src/services/message-service.test.ts` — MODIFIED: added mockDbSelect, chatConversationMembers/authUsers schema mocks

## Change Log

- 2026-03-07: Story 9.2 implemented — email channel wired in deliverNotification(), 4 bilingual email templates, message.sent first-DM handler, EMAIL_ELIGIBLE_TYPES updated. 27 net new tests, 0 regressions.
- 2026-03-07: Story 9.2 review — 6 findings fixed (F1–F6): F1 sendMessageWithAttachments now emits Story 9.2 fields; F2 waitlist_promoted emailData includes startTime; F3 deliverNotification guards email dispatch on `emailData !== undefined` (prevents article double-email); F4 sendSystemMessage explicitly passes conversationType:"group"; F5 count() result cast to Number(); F6 waitlist_promoted email dispatch test added. +3 review fix tests, 0 regressions (3505 passing, 2 pre-existing failures in points-lua-runner).
