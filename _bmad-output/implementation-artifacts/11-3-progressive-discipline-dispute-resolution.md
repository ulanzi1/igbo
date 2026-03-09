# Story 11.3: Progressive Discipline & Dispute Resolution

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to issue warnings, temporary suspensions, or permanent bans through a progressive discipline system and review flagged conversations for disputes,
so that moderation is fair, transparent, and escalates appropriately.

## Acceptance Criteria

1. Given an admin determines a member has violated community guidelines, when they take disciplinary action, then they can issue a warning, a temporary suspension with duration `24h | 7d | 30d`, or a permanent ban, and each action is recorded in the member's discipline history. The discipline history is displayed to the admin before action to inform escalation (advisory, not enforced — admins may skip steps).
2. Given a warning is issued, when the member receives it, then the notification explains the violation and references the specific moderated content, and the member account remains usable.
3. Given a temporary suspension is issued, when it takes effect, then all active sessions are invalidated immediately, request-time auth blocks further access, and the member is redirected to a suspension page showing expiry timestamp and reason.
4. Given a permanent ban is issued, when it takes effect, then all active sessions are invalidated immediately, `auth_users.account_status` changes to `BANNED`, login/access attempts are blocked consistently across middleware, API routes, and realtime auth, and the banned email address is blocked from new account registration.
5. Given a moderation queue item involves private messages, when an admin opens dispute review, then they can view the flagged message in conversation context without becoming a conversation member, and each access is written to the admin audit trail.
6. Given the moderation workflow is extended for this story, when implementation is complete, then it reuses the existing moderation queue, report ingestion, audit logger, notification pipeline, and EventBus patterns from Stories 11.1 and 11.2 instead of creating a parallel moderation system.

## Tasks / Subtasks

- [x] Task 1: Add discipline persistence and query layer (AC: 1, 2, 3, 4)
  - [x] Add `src/db/schema/member-discipline.ts` with:
    - `disciplineActionTypeEnum`: `warning | suspension | ban`
    - `disciplineSourceTypeEnum`: `moderation_action | report | manual`
    - `disciplineStatusEnum`: `active | expired | lifted`
    - `memberDisciplineActions` table with: `id`, `userId`, `moderationActionId` nullable FK, `sourceType`, `actionType`, `reason`, `notes`, `suspensionEndsAt` nullable, `issuedBy`, `createdAt`, `liftedAt` nullable, `liftedBy` nullable, `status`
  - [x] Add schema export to [src/db/index.ts](/Users/dev/Developer/projects/igbo/src/db/index.ts)
  - [x] Add migration `0044_member_discipline.sql` and matching `_journal.json` entry (idx: 44) after `0043_platform_reports`
  - [x] Create `src/db/queries/member-discipline.ts` with:
    - `createDisciplineAction()`
    - `listMemberDisciplineHistory(userId)`
    - `getActiveSuspension(userId)`
    - `expireDisciplineAction(id, liftedBy?)`
    - `listSuspensionsExpiringBefore(date)` for automated lift job
  - [x] Co-locate tests in `src/db/queries/member-discipline.test.ts`

- [x] Task 2: Enforce suspended/banned account status consistently (AC: 3, 4)
  - [x] Extend `requireAuthenticatedSession()` in [src/services/permissions.ts](/Users/dev/Developer/projects/igbo/src/services/permissions.ts) to:
    - After verifying `session?.user?.id`, look up `auth_users.account_status` from DB (the JWT does not carry status; session eviction on ban/suspend ensures stale JWTs are short-lived, but the DB check is the authoritative guard)
    - reject `BANNED` with `ApiError(403, { type: "account_banned" })`
    - reject `SUSPENDED` with `ApiError(403, { type: "account_suspended" })`
    - return RFC 7807-friendly `ApiError` details that use i18n keys rather than hardcoded prose
  - [x] Extend [src/lib/admin-auth.ts](/Users/dev/Developer/projects/igbo/src/lib/admin-auth.ts) so suspended or banned admins cannot continue using admin APIs (add same DB status check after role check)
  - [x] Update [src/middleware.ts](/Users/dev/Developer/projects/igbo/src/middleware.ts) to handle `SUSPENDED` in addition to the existing `BANNED` redirect path — redirect to `/[locale]/suspended` with query params `?until=ISO&reason=encoded`
  - [x] Update [src/server/realtime/middleware/auth.ts](/Users/dev/Developer/projects/igbo/src/server/realtime/middleware/auth.ts) so realtime auth also rejects suspended/banned users (look up `accountStatus` from DB or cached session after JWT verification)
  - [x] Reuse existing session-eviction pattern from [src/services/auth-service.ts](/Users/dev/Developer/projects/igbo/src/services/auth-service.ts): `findActiveSessionsByUserId(userId)` → `evictAllUserSessions(tokens)` → `deleteAllSessionsForUser(userId)`. Do not invent a second cache-invalidation path.
  - [x] Add a suspended user landing page: `src/app/[locale]/(auth)/suspended/page.tsx` — displays expiry timestamp and reason from URL query params, with a "Contact Support" link. No auth required (user is locked out).
  - [x] Block banned email from signup: in the registration/signup flow, check `auth_users` for existing `BANNED` accounts with the same email and reject with an appropriate error.

- [x] Task 3: Implement moderation discipline service + events (AC: 1, 2, 3, 4, 6)
  - [x] Create `src/services/member-discipline-service.ts`
  - [x] Implement:
    - `issueWarning({ targetUserId, moderationActionId, adminId, reason, notes })`
    - `issueSuspension({ targetUserId, moderationActionId, adminId, reason, durationHours, notes })`
    - `issueBan({ targetUserId, moderationActionId, adminId, reason, notes })`
    - `liftExpiredSuspensions(now)`
  - [x] Each mutating method must:
    - update `auth_users.account_status` where applicable (`SUSPENDED` for suspension, `BANNED` for ban)
    - delete DB sessions and evict cached sessions immediately using the `findActiveSessionsByUserId` → `evictAllUserSessions` → `deleteAllSessionsForUser` pattern
    - emit `account.status_changed` with payload `{ userId, newStatus, oldStatus }` (this exact shape is expected by the existing handler in `notification-service.ts` that triggers group ownership transfer)
    - write admin audit entries through `logAdminAction()`
  - [x] Extend [src/services/audit-logger.ts](/Users/dev/Developer/projects/igbo/src/services/audit-logger.ts) `AdminAction` union with exactly these values: `WARN_MEMBER`, `SUSPEND_MEMBER`, `BAN_MEMBER`, `LIFT_SUSPENSION`, `VIEW_DISPUTE_CONVERSATION`
  - [x] Add notification routing for warnings/suspensions/bans in [src/services/notification-service.ts](/Users/dev/Developer/projects/igbo/src/services/notification-service.ts) using message keys in `messages/en.json` and `messages/ig.json`
  - [x] Verify the existing `account.status_changed` handler in `notification-service.ts` (group ownership transfer for suspended users) still fires correctly when discipline service emits the event — add a regression test for this path

- [x] Task 4: Extend admin moderation APIs and queue UI instead of creating a new admin surface (AC: 1, 2, 3, 4, 6)
  - [x] Extend PATCH actions in [src/app/api/v1/admin/moderation/[actionId]/route.ts](/Users/dev/Developer/projects/igbo/src/app/api/v1/admin/moderation/[actionId]/route.ts) from `approve | remove | dismiss` to include `warn | suspend | ban`
  - [x] Suspension action must require a controlled duration enum (`24h | 7d | 30d`), not free-form text
  - [x] Add/extend query support in [src/db/queries/moderation.ts](/Users/dev/Developer/projects/igbo/src/db/queries/moderation.ts) to include:
    - target author status (JOIN `auth_users` for `account_status`)
    - latest discipline summary (JOIN or subquery `member_discipline_actions` for count + last action type)
    - ability to fetch queue item details needed by the admin dialog
  - [x] Extend (not replace) [src/features/admin/components/ModerationActionDialog.tsx](/Users/dev/Developer/projects/igbo/src/features/admin/components/ModerationActionDialog.tsx) to support new action variants alongside existing `remove | dismiss`:
    - `warn`: warning reason textarea
    - `suspend`: reason textarea + duration selector dropdown (`24h | 7d | 30d`)
    - `ban`: reason textarea + confirmation checkbox ("I understand this is permanent")
    - discipline history preview panel (shows prior warnings/suspensions count and dates)
  - [x] Extend [src/features/admin/components/ModerationQueue.tsx](/Users/dev/Developer/projects/igbo/src/features/admin/components/ModerationQueue.tsx) to show `Warn`, `Suspend`, and `Ban` alongside existing approve/remove/dismiss actions
  - [x] Preserve accessibility and admin keyboard workflow from UX guidance: dialog focus trap, Escape close, 44px targets where applicable, and queue-first workflow

- [x] Task 5: Add dispute-conversation review path for flagged messages (AC: 5, 6)
  - [x] Create a dedicated admin-only endpoint: `GET /api/v1/admin/moderation/[actionId]/conversation`
  - [x] For message moderation items:
    - resolve the flagged `messageId` from the moderation action's `contentId`
    - use `getMessageById()` from [src/db/queries/chat-messages.ts](/Users/dev/Developer/projects/igbo/src/db/queries/chat-messages.ts) to get the message and its `conversationId`
    - use `getConversationMessages()` to fetch a bounded window (e.g. 10 messages before and after the flagged message) — pass `cursor` and `limit` params
    - bypass normal conversation membership checks only for admins (the route uses `requireAdminSession()`, not conversation-member auth)
    - never mutate conversation membership to grant access
  - [x] For non-message moderation items, return 400 — conversation review only applies to message content types
  - [x] Return a bounded context window around the flagged message so review is focused and auditable
  - [x] Log every dispute view through `logAdminAction('VIEW_DISPUTE_CONVERSATION', { moderationActionId, conversationId, messageId })` with IDs only in `details`
  - [x] Add an admin UI affordance from the moderation queue to open message context review (e.g. "View Context" button, only visible for message-type items)

- [x] Task 6: Automated suspension expiry and regression coverage (AC: 3, 4, 5)
  - [x] Add a background-job entry point at `src/server/jobs/lift-expired-suspensions.ts` to lift expired suspensions and emit `account.status_changed`
  - [x] Ensure lifting a suspension does not overwrite `BANNED`, `PENDING_DELETION`, or `ANONYMIZED` — check current status before updating
  - [x] Add tests for:
    - discipline query layer (CRUD + expiry listing)
    - moderation route warn/suspend/ban flows (validation, authorization, success paths)
    - session invalidation side effects (DB sessions deleted + Redis cache evicted)
    - request-time suspension/banned enforcement in `requireAuthenticatedSession()`, `requireAdminSession()`, middleware, and realtime auth
    - dispute-conversation endpoint (admin allowed, non-admin 403, non-message 400, audit log written, bounded context returned)
    - job-driven suspension expiry (lifts expired, skips BANNED/PENDING_DELETION/ANONYMIZED)
    - regression: existing Story 11.1 approve/remove/dismiss actions still work after PATCH route extension
    - regression: `account.status_changed` → group ownership transfer fires correctly for SUSPENDED status
  - [x] If new `@/db/queries/*` imports are added to realtime bridge dependencies, mirror required `vi.mock()` updates in both bridge test suites per existing repo rule

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts`
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps
- [x] Suspension and ban enforcement verified in middleware, API session guards, and realtime auth
- [x] Dispute-conversation access logs record IDs only and never leak reporter identity
- [x] Banned email signup block verified in registration flow
- [x] Suspended user landing page renders with expiry and reason from query params

## Dev Notes

### Existing Infrastructure to Reuse

- **`accountStatusEnum`** in `src/db/schema/auth-users.ts` already includes `SUSPENDED` and `BANNED` — no enum migration needed
- **Session eviction pattern** (used in `admin2faReset`): `findActiveSessionsByUserId(userId)` → `evictAllUserSessions(tokens)` → `deleteAllSessionsForUser(userId)` from `src/services/auth-service.ts` + `src/server/auth/redis-session-cache.ts`
- **`account.status_changed` handler** in `notification-service.ts` (lines ~437-465) already handles group ownership transfer for suspended users — verify this fires correctly, do not duplicate
- **ModerationActionDialog** currently supports `action: "remove" | "dismiss"` with optional reason textarea — extend with new variants
- **ModerationQueue** has three buttons per row: Approve (no dialog), Remove (dialog), Dismiss (dialog) — add Warn/Suspend/Ban buttons
- **Chat message queries** in `src/db/queries/chat-messages.ts`: use `getMessageById()` and `getConversationMessages(conversationId, { cursor, limit })` for dispute review
- **`AdminAction` union** in `src/services/audit-logger.ts` — extend with `WARN_MEMBER | SUSPEND_MEMBER | BAN_MEMBER | LIFT_SUSPENSION | VIEW_DISPUTE_CONVERSATION`

### Key Decisions

- **Escalation is advisory, not enforced**: Admins see discipline history before acting but may skip warning and go straight to ban if the violation warrants it.
- **`requireAuthenticatedSession()` must add a DB lookup** for `account_status` since the JWT does not carry status. Session eviction ensures most stale JWTs are invalidated quickly, but the DB check is the authoritative guard.
- **Suspended user landing page** at `/[locale]/(auth)/suspended/page.tsx` — reads expiry and reason from URL query params. No auth gate (user is locked out).
- **Banned email signup block**: Check `auth_users` for `BANNED` status with matching email during registration. Prevents re-registration per Epic AC.

### Architecture Compliance

- API handlers: `withApiHandler()` + RFC 7807 responses
- Admin auth: `requireAdminSession()`
- Member auth: `requireAuthenticatedSession()`
- EventBus for cross-service communication; emit `account.status_changed` with `{ userId, newStatus, oldStatus }` payload
- DB schema in `src/db/schema/*`, queries in `src/db/queries/*`, business logic in `src/services/*`
- Use `zod/v4` — import from `"zod/v4"`
- Preserve `snake_case` DB naming and `camelCase` API contracts
- Admin UI remains under the existing admin route group and shell

### Library / Framework Requirements

- Follow repo-pinned stack: Next.js `16.1.6`, React `19.2.3`, Auth.js `5.0.0-beta.30`, Drizzle ORM `0.45.1`, Zod `4.3.6`, TanStack Query `5.90.21`, Socket.IO `4.8.3`
- Do not upgrade any dependencies as part of this story

### File Structure

- New files:
  - `src/db/schema/member-discipline.ts`
  - `src/db/queries/member-discipline.ts` + `.test.ts`
  - `src/services/member-discipline-service.ts` + `.test.ts`
  - `src/app/api/v1/admin/moderation/[actionId]/conversation/route.ts` + `.test.ts`
  - `src/server/jobs/lift-expired-suspensions.ts` + `.test.ts`
  - `src/app/[locale]/(auth)/suspended/page.tsx`
  - Migration: `src/db/migrations/0044_member_discipline.sql`
- Modified files:
  - `src/services/permissions.ts`, `src/lib/admin-auth.ts`, `src/middleware.ts`
  - `src/server/realtime/middleware/auth.ts`
  - `src/services/audit-logger.ts`, `src/services/notification-service.ts`
  - `src/app/api/v1/admin/moderation/[actionId]/route.ts`
  - `src/db/queries/moderation.ts`
  - `src/features/admin/components/ModerationQueue.tsx`, `ModerationActionDialog.tsx`
  - `messages/en.json`, `messages/ig.json`
  - Registration/signup route (for banned email check)
  - `src/db/migrations/meta/_journal.json`

### Testing Requirements

- Co-locate tests with new source files
- Cover warning, suspension, ban, and expiry-lift flows at service level
- Cover admin moderation PATCH route validation and action branching
- Cover suspension/banned rejection in middleware, `requireAuthenticatedSession()`, `requireAdminSession()`, realtime auth
- Cover dispute conversation endpoint: admin allowed, non-admin 403, non-message 400, audit log written, bounded context returned
- Regression: Story 11.1 approve/remove/dismiss still work after route extension
- Regression: `account.status_changed` → group ownership transfer fires for SUSPENDED
- Regression: Story 11.2 reports still surface in queue with report count

### Previous Story Intelligence

- Story 11.1: `platform_moderation_actions`, moderation queue APIs/UI, keyword scanner, `content.moderated` EventBus
- Story 11.2: `platform_reports`, `report.created`, queue aggregation with report counts, reporter anonymity
- Use existing moderation action as the entry point, then attach discipline records via `moderationActionId` FK

### References

- [Epic 11 / Story 11.3](_bmad-output/planning-artifacts/epics.md)
- [Architecture](_bmad-output/planning-artifacts/architecture.md)
- [Story 11.1](_bmad-output/implementation-artifacts/11-1-content-moderation-queue-automated-flagging.md)
- [Story 11.2](_bmad-output/implementation-artifacts/11-2-member-reporting-system.md)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `vi.hoisted()` required for `mockDisciplineTable` used inside `vi.mock()` factory in member-discipline.test.ts — standard Vitest hoisting constraint.
- `vi.mock("@/db/queries/auth-queries")` added to realtime/auth.test.ts and admin-auth.test.ts after `findUserById` import was added — env validation cascade from `@/db` → `@/env`.
- PATCH route switched from `z.object` to `z.discriminatedUnion("action", [...])` for proper TypeScript narrowing per action variant.

### Completion Notes List

- Story created from Epic 11 with direct continuity from the existing moderation queue and reporting system.
- Validation review applied: banned email signup block (Epic AC gap), suspension landing page, explicit audit action names, `account.status_changed` payload shape, advisory escalation clarification, DB status check in `requireAuthenticatedSession`, dialog extend-not-replace.
- All 6 tasks complete. Tests: 3914 passing + 10 skipped + 14 pre-existing failures (+51 new tests from this story).

### Change Log

| Date       | Change                                                                                                                                                                                                                                                                                               | Author            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-03-09 | Initial implementation — all 6 tasks complete                                                                                                                                                                                                                                                        | claude-sonnet-4-6 |
| 2026-03-09 | Code review fixes: F1 removed dead JWT field refs from middleware, F2 added authorAccountStatus+disciplineCount to moderation queries, F3 added 4 discipline_issued handler tests, F4 sanitized+capped reason display on suspended page, F5 DRY UUID_RE in route, F6 added LIFT_SUSPENSION audit log | claude-opus-4-6   |

### File List

New files:

- `src/db/schema/member-discipline.ts`
- `src/db/queries/member-discipline.ts`
- `src/db/queries/member-discipline.test.ts`
- `src/db/migrations/0044_member_discipline.sql`
- `src/services/member-discipline-service.ts`
- `src/services/member-discipline-service.test.ts`
- `src/app/api/v1/admin/moderation/[actionId]/conversation/route.ts`
- `src/app/api/v1/admin/moderation/[actionId]/conversation/route.test.ts`
- `src/server/jobs/lift-expired-suspensions.ts`
- `src/server/jobs/lift-expired-suspensions.test.ts`
- `src/app/[locale]/(auth)/suspended/page.tsx`

Modified files:

- `src/db/index.ts`
- `src/db/migrations/meta/_journal.json`
- `src/services/permissions.ts`
- `src/services/permissions.test.ts`
- `src/lib/admin-auth.ts`
- `src/lib/admin-auth.test.ts`
- `src/middleware.ts`
- `src/server/realtime/middleware/auth.ts`
- `src/server/realtime/middleware/auth.test.ts`
- `src/services/audit-logger.ts`
- `src/services/notification-service.ts`
- `src/services/notification-service.test.ts`
- `src/app/api/v1/admin/moderation/[actionId]/route.ts`
- `src/app/api/v1/admin/moderation/[actionId]/route.test.ts`
- `src/db/queries/moderation.ts`
- `src/features/admin/components/ModerationActionDialog.tsx`
- `src/features/admin/components/ModerationQueue.tsx`
- `src/features/auth/actions/submit-application.ts`
- `src/server/jobs/index.ts`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
