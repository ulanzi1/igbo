# Story 5.4: Group Leadership & Moderation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a group creator,
I want to assign group leaders and give them moderation capabilities,
so that groups can be managed collaboratively without relying on a single person.

## Acceptance Criteria

1. **Given** a group creator wants to assign a leader
   **When** they select a Professional or Top-tier group member and assign the "Leader" role
   **Then** the member is promoted to group leader (FR43)
   **And** they receive a notification of their new role
   **And** their name appears with a "Leader" badge in the group member list

2. **Given** a group leader has moderation capabilities
   **When** they moderate group content
   **Then** they can: remove posts and comments, mute members within the group, ban members from the group, approve join requests for private groups, and create/manage group channels (FR43)
   **And** all moderation actions are logged with timestamp and moderator ID

3. **Given** a group member is muted or banned by a leader
   **When** the action is taken
   **Then** a muted member can still read content but cannot post or comment (temporary)
   **And** the banned member is removed from the group and cannot rejoin without leader approval
   **And** the affected member receives a notification explaining the action

4. **Given** a group creator's account is deleted, suspended, or permanently banned
   **When** the account status change is processed
   **Then** group ownership automatically transfers to the senior-most group leader
   **And** if no leaders exist, ownership transfers to the longest-tenured active group member and they are promoted to leader
   **And** if no active members remain, the group is archived (read-only)
   **And** transfer is logged and the new owner is notified

5. **Given** a group leader approves a join request for a private group
   **When** the approval is processed
   **Then** the system enforces the 40-group membership limit on the requesting member
   **And** if the member is already at 40 groups, approval is blocked with a leader-facing error message

6. **Given** a group is soft-deleted (`deleted_at`) by its creator or an admin
   **When** the deletion is processed
   **Then** the group transitions to archived read-only behavior (no new posts/messages/membership changes)
   **And** linked group channel conversations are frozen (`chat_conversations.deleted_at` set)
   **And** members are notified, group no longer counts toward the 40-group limit, and `group.archived` event is emitted

## Tasks / Subtasks

- [x] Task 1: Leader assignment API + service (AC: #1)
  - [x] Add service function in `src/services/group-service.ts`: `assignGroupLeader(actorId, groupId, targetUserId)`
  - [x] Enforce actor is `creator` only (not leader)
  - [x] Enforce target membership is `active` and current role is `member`
  - [x] Enforce target tier is `PROFESSIONAL` or `TOP_TIER` (reuse auth permission query pattern)
  - [x] Persist role update in `community_group_members.role = 'leader'`
  - [x] Emit EventBus event `group.leader_assigned` (add `GroupLeaderAssignedEvent` to `src/types/events.ts` with `groupId, userId, assignedBy` fields, add `"group.leader_assigned"` to `EventName` union)

- [x] Task 2: Leader assignment route + rate limits (AC: #1)
  - [x] Add route: `POST /api/v1/groups/[groupId]/members/[userId]/promote/route.ts`
  - [x] Implement with `withApiHandler()` + `requireAuthenticatedSession()` + RFC7807 errors
  - [x] Reuse existing `GROUP_MANAGE` preset (20/min) — do NOT create a new preset
  - [x] Add route tests for 201/403/404/422 cases

- [x] Task 3: Group-scoped moderation action model + audit trail (AC: #2)
  - [x] Migration `0025`: add `community_group_moderation_logs` table and `muted_until TIMESTAMPTZ` column to `community_group_members`
  - [x] Add schema in `src/db/schema/group-moderation-logs.ts`, register in `src/db/index.ts`
  - [x] Add query helper `src/db/queries/group-moderation.ts` for write logs
  - [x] Add separate `logGroupModerationAction()` in `src/services/audit-logger.ts`
  - [x] Ensure every moderation command writes both domain record and audit entry

- [x] Task 4: Group member mute/ban domain (AC: #2, #3)
  - [x] `status='banned'` for bans; `muted_until` nullable column for mutes
  - [x] `muteGroupMember`, `unmuteGroupMember`, `banGroupMember`, `unbanGroupMember` in `group-membership-service.ts`
  - [x] Emit events: `group.member_muted`, `group.member_unmuted`, `group.member_banned`, `group.member_unbanned`

- [x] Task 5: Enforce muted restrictions in posting/commenting paths (AC: #3)
  - [x] `createGroupPost` rejects muted/banned members
  - [x] `addComment` enforces mute/ban guard for group posts via `getPostGroupId` + `getGroupMemberFull`
  - [x] i18n keys added to `messages/en.json` and `messages/ig.json`

- [x] Task 6: Leader moderation of posts and comments (AC: #2)
  - [x] `softDeleteGroupPost` and `softDeleteGroupComment` (moderator version) in query modules
  - [x] `DELETE /api/v1/groups/[groupId]/posts/[postId]`
  - [x] `DELETE /api/v1/groups/[groupId]/posts/[postId]/comments/[commentId]`

- [x] Task 7: Membership approval limit hardening (AC: #5)
  - [x] Updated `approveJoinRequest` error message to product wording
  - [x] Re-check at approval time preserved

- [x] Task 8: Creator ownership transfer workflow (AC: #4)
  - [x] `transferGroupOwnership(groupId, previousOwnerId)` in `group-service.ts`
  - [x] EventBus subscriber in `notification-service.ts` for `account.status_changed`
  - [x] `account.status_changed` event added to `types/events.ts`, emitted from `gdpr-service.ts`
  - [x] Emit `group.ownership_transferred` + notifications

- [x] Task 9: Group archival behavior completion (AC: #6)
  - [x] `archiveGroup(actorId, groupId)` sets `deleted_at`, freezes channel conversations
  - [x] Emit `group.archived`, notify active members
  - [x] `DELETE /api/v1/groups/[groupId]/archive` route
  - [x] Archived group banner in GroupDetail UI

- [x] Task 10: UI updates for leadership and moderation controls (AC: #1, #2, #3, #6)
  - [x] `GroupMembersTab` shows promote/mute/ban/unban controls by role
  - [x] Archived group banner in `GroupDetail.tsx`, read-only tabs for archived groups
  - [x] i18n-only strings in UI components

- [x] Task 11: Notifications and realtime sync (AC: #1, #3, #4, #6)
  - [x] Notification handlers for leader assigned, member muted/banned, ownership transferred, group archived

- [x] Task 12: Test coverage and regression protection (AC: #1-#6)
  - [x] Service tests: leader assignment, mute/ban lifecycle, ownership transfer, archival
  - [x] Route tests: promote, archive, post/comment delete
  - [x] UI tests: archived banner, tab visibility for archived groups
  - [x] All pre-existing 15 failures unchanged (suggestion-service/FileUpload/use-file-attachment)

## Dev Notes

### Developer Context (Most Important)

- Story 5.3 already established core group infrastructure (group channels, member enrollment in channel conversations, leader/creator checks for channel management).
- Current code already supports:
  - leader/creator approval/rejection of join requests in `group-membership-service`
  - role badges display in `GroupMembersTab`
  - group-level post creation permissions (`leaders_only`) in `post-service`
- Current code does **not** yet provide end-to-end group moderation primitives required by Story 5.4:
  - no leader assignment endpoint
  - no group-scoped mute/ban lifecycle
  - no group leader post/comment removal endpoints
  - no ownership transfer automation on creator removal
  - no fully implemented archival lifecycle enforcement contract

### Technical Requirements

- Maintain existing route and error contract:
  - Wrap routes with `withApiHandler()`
  - Use `requireAuthenticatedSession()`
  - Throw `ApiError` from `@/lib/api-error` for RFC7807 payloads
  - **`successResponse(data, meta?, status=200)`** — status is 3rd arg! Use `successResponse({ x }, undefined, 201)` for non-200 responses.
- Keep all business logic in services, all SQL in query modules.
- Reuse `community_group_members.role/status` as source of truth for authorization decisions.
- Implement moderation actions as explicit domain records + audit trail entries (timestamp + moderator id mandatory).
- Avoid leaking hidden/deleted group existence in error responses.
- Service boundaries: API route → service → query. Service side effects via EventBus events (typed). No direct cross-feature coupling.
- Preserve existing Socket.IO room contract (`conversation:{conversationId}`) when banning/leaving/archiving.
- Next migration number: **`0025`** (after `0024_group_channels.sql`). Hand-write SQL — `drizzle-kit generate` fails with `server-only` error.

### Library / Framework Requirements

- Import Zod from `"zod/v4"` (NOT `"zod"`), use `parsed.error.issues[0]` for validation errors
- Drizzle hand-written SQL migrations, Next.js App Router route handlers, Vitest for tests
- No story-specific library migration required; stay on existing project versions

### File Structure Requirements

Create/modify only in aligned locations:

- New schema: `src/db/schema/group-moderation-logs.ts` (register in `src/db/index.ts` with `import * as groupModerationLogsSchema`)
- New migration: `src/db/migrations/0025_group_moderation.sql`
- New queries: `src/db/queries/group-moderation.ts`
- New/updated services:
  - `src/services/group-service.ts`
  - `src/services/group-membership-service.ts`
  - `src/services/post-service.ts`
  - `src/services/post-interaction-service.ts`
  - `src/services/notification-service.ts`
  - `src/services/audit-logger.ts`
- New routes under groups namespace (not global posts routes) for group moderation actions.
- Schema/migration updates in `src/db/schema/*` and `src/db/migrations/*` with hand-written SQL.

### Testing Requirements

- Service-level tests must verify role/tier restrictions and race-condition edges.
- Route tests must verify:
  - creator-only leader assignment
  - leader/creator moderation rights
  - member denial paths (403)
  - not-found and wrong-group resource protection (404)
- Add regression tests ensuring archived groups reject writes but allow read access where intended.
- Preserve and do not worsen known unrelated pre-existing failures (15 in suggestion-service/FileUpload/use-file-attachment).
- **Test patterns (critical)**:
  - Use `mockReset()` in `beforeEach`, NOT `clearAllMocks()` — the latter doesn't clear queued `mockResolvedValueOnce` values.
  - Use explicit factory mocks for DB query files: `vi.mock("@/db/queries/groups", () => ({ fn: vi.fn() }))` — never bare `vi.mock()`.
  - CSRF headers required in all mutating route tests: `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`.
  - Mock `@/db/queries/group-channels` in `eventbus-bridge.test.ts` and `notification-flow.test.ts` (from 5.3).
  - Route test setup: mock `@/lib/rate-limiter` (`checkRateLimit → {allowed:true}`, `buildRateLimitHeaders → {}`) and `@/lib/request-context` (`runWithContext: (_ctx, fn) => fn()`). Do NOT mock `withApiHandler` as passthrough.
  - Use `@vitest-environment node` pragma for all server-side test files.

### Previous Story Intelligence (from 5.3)

- Reuse established patterns instead of rebuilding:
  - role checks via `getGroupMember`
  - system messages through `messageService.sendSystemMessage`
  - channel membership synchronization via EventBus bridge
- Keep route param extraction style consistent (`pathname.split("/")`).
- Keep group scoped behaviors separate from global admin behaviors (same principle as group pin vs global pin).

### Git Intelligence Summary

Recent commit sequence indicates active stabilization of group membership/channel enrollment flows:

- `e1ab20d` fixed channel enrollment and channel header behavior after Story 5.3
- `dbe951e` landed Story 5.2 group discovery/membership
- `4eb7e67` landed Story 5.1 group creation/configuration

Implication: Story 5.4 should build incrementally on these services/routes and avoid broad refactors that destabilize working Story 5.x flows.

### Existing Codebase Reference (Key Functions)

- `getGroupMember(groupId, userId)` in `src/db/queries/groups.ts` — use for role/status checks
- `listGroupLeaders(groupId)` in `src/db/queries/groups.ts` — returns leader userIds
- `countActiveGroupsForUser(userId)` in `src/db/queries/groups.ts` — for 40-group limit check
- `softDeleteChannelConversation()` in `src/db/queries/group-channels.ts` — reuse for channel freezing on archive
- `listAllChannelConversationIds(groupId)` in `src/db/queries/group-channels.ts` — get all conversation IDs for a group
- `sendSystemMessage()` in `MessageService` — for system messages in group channels
- `getDisplayName()` in `src/services/group-membership-service.ts` — helper for notification text
- `getPlatformSetting(key, fallback)` in `src/db/queries/groups.ts` — for admin-configurable limits

### References

- Story source: `_bmad-output/planning-artifacts/epics.md` (Epic 5, Story 5.4)
- Previous story: `_bmad-output/implementation-artifacts/5-3-group-channels-feed-content.md`
- Group schema: `src/db/schema/community-groups.ts`
- Group APIs:
  - `src/app/api/v1/groups/[groupId]/route.ts`
  - `src/app/api/v1/groups/[groupId]/requests/[userId]/approve/route.ts`
  - `src/app/api/v1/groups/[groupId]/requests/[userId]/reject/route.ts`
  - `src/app/api/v1/groups/[groupId]/members/route.ts`
- Existing services:
  - `src/services/group-membership-service.ts`
  - `src/services/group-service.ts`
  - `src/services/group-channel-service.ts`
  - `src/services/post-service.ts`
  - `src/services/post-interaction-service.ts`
  - `src/services/notification-service.ts`
- Event typing and bridge:
  - `src/types/events.ts`
  - `src/server/realtime/subscribers/eventbus-bridge.ts`
- Audit logging baseline: `src/services/audit-logger.ts`, `src/db/schema/audit-logs.ts`
- Platform context: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Sprint status story discovery completed from `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Artifact analysis: epics, PRD, architecture, UX, project-context, Story 5.3
- Recent git commit intelligence analyzed (`git log -n 5`)

### Completion Notes List

- Implemented all 12 tasks: leader assignment, mute/ban lifecycle, post/comment moderation, ownership transfer, archival, UI updates, notifications, tests.
- **`getUserPlatformRole`** added to `@/db/queries/groups` to enable testable admin check in `archiveGroup` (replaces untestable dynamic imports).
- **`getGroupMemberFull`** added to return `mutedUntil` alongside role/status for mute enforcement in `createGroupPost` and `addComment`.
- **`t("members", ...)` renamed to `t("memberCount", ...)`** in `GroupCard` and `GroupHeader` to avoid clash with the new `Groups.members.*` i18n namespace; tests updated to match `/memberCount/`.
- **`post-service.test.ts`** and **`post-interaction-service.test.ts`** updated to mock `getGroupMemberFull` / `getPostGroupId` added in Task 5.
- 2703 tests passing (was 2635 after Story 5.3), +68 new tests. 15 pre-existing failures unchanged.
- Migration `0025_group_moderation.sql`: adds `muted_until TIMESTAMPTZ` column + `community_group_moderation_logs` table.

### File List

- `_bmad-output/implementation-artifacts/5-4-group-leadership-moderation.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/types/events.ts`
- `src/db/schema/community-groups.ts`
- `src/db/schema/group-moderation-logs.ts` (NEW)
- `src/db/migrations/0025_group_moderation.sql` (NEW)
- `src/db/index.ts`
- `src/db/queries/groups.ts`
- `src/db/queries/group-moderation.ts` (NEW)
- `src/db/queries/posts.ts`
- `src/db/queries/post-interactions.ts`
- `src/services/group-service.ts`
- `src/services/group-membership-service.ts`
- `src/services/post-service.ts`
- `src/services/post-interaction-service.ts`
- `src/services/audit-logger.ts`
- `src/services/notification-service.ts`
- `src/services/notification-service.test.ts`
- `src/services/gdpr-service.ts`
- `src/services/rate-limiter.ts`
- `src/app/api/v1/groups/[groupId]/members/[userId]/promote/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/members/[userId]/mute/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/members/[userId]/unmute/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/members/[userId]/ban/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/members/[userId]/unban/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/archive/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/posts/[postId]/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/posts/[postId]/comments/[commentId]/route.ts` (NEW)
- `src/app/[locale]/(app)/groups/[groupId]/page.tsx`
- `src/features/feed/components/FeedItem.tsx`
- `src/features/groups/components/GroupDetail.tsx`
- `src/features/groups/components/GroupMembersTab.tsx`
- `src/features/groups/components/GroupCard.tsx`
- `src/features/groups/components/GroupHeader.tsx`
- `messages/en.json`
- `messages/ig.json`
- `src/services/group-service.test.ts`
- `src/services/group-membership-service.test.ts`
- `src/services/post-service.test.ts`
- `src/services/post-interaction-service.test.ts`
- `src/features/groups/components/GroupDetail.test.tsx`
- `src/features/groups/components/GroupCard.test.tsx`
- `src/features/groups/components/GroupHeader.test.tsx`
- `src/app/api/v1/groups/[groupId]/members/[userId]/promote/route.test.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/archive/route.test.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/posts/[postId]/route.test.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/posts/[postId]/comments/[commentId]/route.test.ts` (NEW)

### Senior Developer Review (AI)

**Reviewer:** Dev on 2026-03-04
**Outcome:** Approved with fixes applied

**Issues Found:** 2 High, 4 Medium, 2 Low

**Fixes Applied (6):**

1. **[H1] Ban bypass in joinOpenGroup/requestToJoinGroup** — Both functions did not check for `status === "banned"`. A banned member calling `joinOpenGroup()` would get a false `{ role: "member", status: "active" }` response (the `onConflictDoNothing` INSERT silently failed but the function returned success). Added banned status checks throwing 403 in both functions. (+2 regression tests)

2. **[H2] Missing mute/ban enforcement tests** — `createGroupPost` and `addComment` mute enforcement paths (AC #3) had zero test coverage. Added 5 new tests: muted member rejected from posting, banned member rejected from posting, muted member rejected from commenting, banned member rejected from commenting, non-group post skips membership check.

3. **[M1] ErrorCode inconsistency** — `addComment` used `"INTERNAL_ERROR"` for mute/ban denials (semantically wrong — it means "something crashed"). Added `"GROUP_MODERATION"` to `AddCommentError` union type and updated both ban and mute denials to use it.

4. **[M2] Inconsistent ban error messages** — `createGroupPost` used a hardcoded English string `"Not an active group member"` while `addComment` used an i18n key. Changed to `"Groups.moderation.bannedCannotPost"` and added the i18n key to both `en.json` and `ig.json`.

5. **[M3] File List incomplete** — Added 4 missing files that were changed by Story 5.4 but not documented: `page.tsx`, `FeedItem.tsx`, `rate-limiter.ts`, `notification-service.test.ts`.

**Unfixed (2 Low — accepted):**

- **[L1]** `GroupLeaderRemovedEvent` defined but never emitted — forward declaration for future demotion feature, harmless
- **[L2]** `AccountStatusChangedEvent.previousStatus` never populated — nice-to-have audit improvement, not blocking

### Change Log

- 2026-03-04: Senior developer review — fixed ban bypass (H1), added 7 missing tests (H2), standardized error codes (M1/M2), updated File List (M3/M4). +8 tests from review fixes.
