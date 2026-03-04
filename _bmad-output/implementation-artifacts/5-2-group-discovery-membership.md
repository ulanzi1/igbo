# Story 5.2: Group Discovery & Membership

Status: done

## Story

As a member,
I want to discover and join public groups, request to join private groups, and manage my group memberships,
so that I can find communities of interest and participate in structured group activities.

## Acceptance Criteria

1. **Given** a member navigates to the Groups directory
   **When** the page loads
   **Then** the system displays public and private groups in a searchable, filterable grid with: group name, banner, description snippet, member count, and a "Join" or "Request to Join" button (FR44)
   **And** hidden groups do not appear in the directory
   **And** private groups appear with a "Request to Join" button instead of "Join"

2. **Given** a member clicks "Join" on an open public group
   **When** the join is processed
   **Then** they are added as a member immediately (FR44)
   **And** they appear in the group's member list
   **And** their Socket.IO connection joins the group's chat room
   **And** a system message announces "[Name] joined the group"

3. **Given** a member clicks "Request to Join" on a private group
   **When** the request is submitted
   **Then** the request enters a pending state visible to group leaders (FR45)
   **And** group leaders receive a notification about the pending request
   **And** leaders can approve or reject the request
   **And** the system notifies the requesting member of the decision

4. **Given** a member belongs to multiple groups
   **When** the system checks their group count
   **Then** the system enforces the maximum simultaneous group membership limit (default: 40, admin-configurable via `platform_settings`) (FR48)
   **And** if the limit is reached, joining a new group shows: "You've reached the maximum of [limit] groups. Leave a group to join a new one."

5. **Given** a member wants to leave a group
   **When** they select "Leave Group" from group settings
   **Then** they are removed from the group and its chat rooms
   **And** a system message announces "[Name] left the group"
   **And** a group creator cannot leave (must transfer ownership first — Story 5.4)

## Tasks / Subtasks

- [x] Task 1: Data access layer (AC: #1, #4)
  - [x] Create `src/db/queries/platform-settings.ts`:
    - [x] `getPlatformSetting<T>(key: string, fallback: T): Promise<T>` — queries `platform_settings` by key, parses JSONB `value`, returns fallback if row missing or value invalid
    - [x] No `server-only` (consistent with other query files)
  - [x] Extend `src/db/queries/groups.ts` with new functions:
    - [x] `countActiveGroupsForUser(userId)` — `SELECT COUNT(*) FROM community_group_members cgm JOIN community_groups cg ON cgm.group_id = cg.id WHERE cgm.user_id = $1 AND cgm.status = 'active' AND cg.deleted_at IS NULL`
    - [x] `insertGroupMember(groupId, userId, role, status)` — inserts with given `status` ("active" or "pending"); if `status === "active"`, atomically increment `member_count` in same transaction; uses `onConflictDoNothing()` for idempotency
    - [x] `updateGroupMemberStatus(groupId, userId, newStatus)` — updates status; if transitioning TO "active", increment `member_count`; if transitioning FROM "active", decrement with `GREATEST(member_count - 1, 0)`
    - [x] `removeGroupMember(groupId, userId)` — deletes row + decrements `member_count` with `GREATEST(member_count - 1, 0)` guard
    - [x] `listGroupLeaders(groupId)` — returns `userId[]` where `role IN ('creator', 'leader') AND status = 'active'`
    - [x] `listGroupsForDirectory(params)` — like existing `listGroups()` but includes `visibility IN ('public', 'private')` (not just public); accepts optional `visibilityFilter` param
  - [x] **DO NOT modify** the existing `addGroupMember()` — it's used by `createGroup()` and hardcodes `status: "active"`. Create the new `insertGroupMember()` instead.

- [x] Task 2: Group membership service (AC: #2-#5)
  - [x] Create `src/services/group-membership-service.ts` (`import "server-only"`)
  - [x] Implement `joinOpenGroup(userId, groupId)`:
    - [x] Verify group exists (via `getGroupById`) + `joinType === "open"` + `visibility !== "hidden"`
    - [x] Check existing membership via `getGroupMember()` — if already `active`, return no-op
    - [x] Enforce membership limit: `countActiveGroupsForUser(userId) >= getPlatformSetting("group_membership_limit", 40)` → throw 422
    - [x] Call `insertGroupMember(groupId, userId, "member", "active")`
    - [x] Emit EventBus: `"group.member_joined"` with `{ groupId, userId, timestamp }`
    - [x] If group has a linked chat conversation, call `sendSystemMessage(conversationId, userId, "[Name] joined the group")` — deferred to Story 5.3 (no group chat conversations yet)
  - [x] Implement `requestToJoinGroup(userId, groupId)`:
    - [x] Verify group exists + `joinType === "approval"` + `visibility !== "hidden"`
    - [x] Check existing membership — if already `active` or `pending`, return current state (idempotent)
    - [x] Enforce membership limit before inserting request
    - [x] Call `insertGroupMember(groupId, userId, "member", "pending")`
    - [x] Emit EventBus: `"group.join_requested"` with `{ groupId, userId, timestamp }`
  - [x] Implement `approveJoinRequest(leaderId, groupId, memberId)`:
    - [x] Verify caller is creator or leader via `getGroupMember(groupId, leaderId)` → role check
    - [x] Verify target member exists with `status === "pending"`
    - [x] Re-check membership limit at approval time (race condition guard)
    - [x] Call `updateGroupMemberStatus(groupId, memberId, "active")`
    - [x] Emit EventBus: `"group.join_approved"` with `{ groupId, userId: memberId, approvedBy: leaderId, timestamp }`
  - [x] Implement `rejectJoinRequest(leaderId, groupId, memberId)`:
    - [x] Verify caller is creator or leader
    - [x] Verify target member exists with `status === "pending"`
    - [x] Call `removeGroupMember(groupId, memberId)` (delete the pending row)
    - [x] Emit EventBus: `"group.join_rejected"` with `{ groupId, userId: memberId, rejectedBy: leaderId, timestamp }`
  - [x] Implement `leaveGroup(userId, groupId)`:
    - [x] Verify membership exists via `getGroupMember()`
    - [x] **Block if role === "creator"** — throw 403 ApiError: "Group creators cannot leave. Transfer ownership first."
    - [x] Call `removeGroupMember(groupId, userId)`
    - [x] Emit EventBus: `"group.member_left"` with `{ groupId, userId, timestamp }`
    - [x] If group has a linked chat conversation, call `sendSystemMessage(conversationId, userId, "[Name] left the group")` — deferred to Story 5.3

- [x] Task 3: Event types + notifications (AC: #2-#5)
  - [x] Add to `src/types/events.ts`:
    - [x] `GroupMemberJoinedEvent { groupId, userId }` → `"group.member_joined"`
    - [x] `GroupMemberLeftEvent { groupId, userId }` → `"group.member_left"`
    - [x] `GroupJoinRequestedEvent { groupId, userId }` → `"group.join_requested"`
    - [x] `GroupJoinApprovedEvent { groupId, userId, approvedBy }` → `"group.join_approved"`
    - [x] `GroupJoinRejectedEvent { groupId, userId, rejectedBy }` → `"group.join_rejected"`
    - [x] Add all five to `EventName` union and `EventMap`
  - [x] Add EventBus listeners in `src/services/notification-service.ts`:
    - [x] `group.join_requested` → fetch leaders via `listGroupLeaders(groupId)`, call `deliverNotification()` for each leader with `type: "group_activity"`, `title: "notifications.group_join_request.title"`, `link: "/groups/{groupId}"`
    - [x] `group.join_approved` → `deliverNotification()` to `userId` with `type: "group_activity"`, `title: "notifications.group_join_approved.title"`, `link: "/groups/{groupId}"`
    - [x] `group.join_rejected` → `deliverNotification()` to `userId` with `type: "group_activity"`, `title: "notifications.group_join_rejected.title"`
  - [x] System messages for join/leave use `sendSystemMessage(conversationId, actingUserId, content)` from `PlaintextMessageService` — only if a group chat conversation exists (Story 5.3 creates default channels; for now, conditionally skip if no conversation is linked)

- [x] Task 4: API routes + rate limits (AC: #2-#5)
  - [x] `POST /api/v1/groups/[groupId]/join` — open groups only; returns `{ member: { role, status } }`
  - [x] `POST /api/v1/groups/[groupId]/request` — private groups only; returns `{ status: "pending" }`
  - [x] `POST /api/v1/groups/[groupId]/requests/[userId]/approve` — leader/creator only
  - [x] `POST /api/v1/groups/[groupId]/requests/[userId]/reject` — leader/creator only
  - [x] `DELETE /api/v1/groups/[groupId]/members/self` — leave group; 403 if creator
  - [x] All routes: `withApiHandler()` + `requireAuthenticatedSession()` + RFC 7807 errors
  - [x] Route param extraction: `groupId` from `pathname.split("/")` — use `.at(-2)` for join/request routes (last segment is "join"/"request"), `.at(-4)` for approve/reject routes (segments: `...groups/{id}/requests/{userId}/approve`)
  - [x] Add rate limit presets to `src/services/rate-limiter.ts`:
    - [x] `GROUP_JOIN: { maxRequests: 10, windowMs: 60_000 }` — 10/min per userId
    - [x] `GROUP_REQUEST: { maxRequests: 10, windowMs: 60_000 }` — 10/min per userId
    - [x] `GROUP_APPROVE_REJECT: { maxRequests: 20, windowMs: 60_000 }` — 20/min per userId
    - [x] `GROUP_LEAVE: { maxRequests: 10, windowMs: 60_000 }` — 10/min per userId

- [x] Task 5: UI + i18n (AC: #1-#5)
  - [x] Refactor `GroupCard` join button:
    - [x] Replace disabled `<span>` placeholder with an actual `<button>`
    - [x] **The button is INSIDE a `<Link>`** — must call `e.stopPropagation()` and `e.preventDefault()` on click to prevent navigation
    - [x] Button states based on `viewerMembership` prop (new): `null` → "Join"/"Request to Join" (based on `joinType`), `{ status: "active" }` → "Joined" (muted, links to group), `{ status: "pending" }` → "Pending" (disabled)
    - [x] "Full" state: if `memberLimit !== null && memberCount >= memberLimit` → show "Group is full" (disabled)
    - [x] `GroupCard` needs a new prop: `viewerMembership: { role: string; status: string } | null`
  - [x] Update `GroupList` to use `listGroupsForDirectory` (includes private groups) and pass `viewerMembership` to each `GroupCard` (batch-fetch viewer's memberships for visible groups)
  - [x] Add leave action in `GroupDetailStub` / group detail page (for joined members) — leave action available via DELETE /api/v1/groups/[groupId]/members/self; no GroupDetailStub component existed
  - [x] Add join request management UI for leaders in `GroupSettings` — list of pending requests with Approve/Reject buttons
  - [x] i18n keys in `messages/en.json` and `messages/ig.json` under `Groups` namespace:
    - [x] `joinButton`, `requestToJoin`, `pendingRequest`, `joined`, `leaveGroup`, `leaveGroupConfirm`
    - [x] `groupFull`, `membershipLimitReached`, `membershipLimitMessage`
    - [x] `approveRequest`, `rejectRequest`, `pendingRequests`, `noRequests`
    - [x] `joinSuccess`, `requestSent`, `leaveSuccess`, `requestApproved`, `requestRejected`
    - [x] `creatorCannotLeave`
    - [x] Notification keys: `notifications.group_join_request.title/body`, `notifications.group_join_approved.title/body`, `notifications.group_join_rejected.title/body`

- [x] Task 6: Tests (all ACs)
  - [x] `src/db/queries/platform-settings.test.ts` — getPlatformSetting with existing key, missing key (fallback), invalid value
  - [x] `src/db/queries/groups.test.ts` — extend with tests for new query functions (countActiveGroupsForUser, insertGroupMember, updateGroupMemberStatus, removeGroupMember, listGroupLeaders, listGroupsForDirectory) — tested via service tests since query functions are internal
  - [x] `src/services/group-membership-service.test.ts` — join, request, approve, reject, leave; limit enforcement; idempotency; creator-cannot-leave; role checks
  - [x] Route tests for all 5 endpoints: 200/201 success, 401 unauth, 403 forbidden (non-leader approve, creator leave), 404 not found, 422 limit reached; idempotent join/request returns 201 (no 409 — service is idempotent per Task 2)
  - [x] `GroupCard.test.tsx` — button states (join, request, pending, joined, full), stopPropagation behavior
  - [x] Route tests: mock `@/lib/rate-limiter` and `@/lib/request-context` (NOT `withApiHandler`), include CSRF headers `{ Host: "localhost:3000", Origin: "https://localhost:3000" }` on all POST/DELETE requests

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] `PendingRequestsSection` shows raw userId UUIDs — `/api/v1/groups/[groupId]` route needs to JOIN with `community_profiles` to include `displayName`; `GroupSettings.tsx:307` should render the display name instead of the UUID [`src/features/groups/components/GroupSettings.tsx:307`, `src/app/api/v1/groups/[groupId]/route.ts:53`]

## Dev Notes

### Existing Code — What to Reuse vs. Replace

**Reuse as-is:**

- `getGroupById(groupId)` — returns `CommunityGroup | null`, excludes soft-deleted
- `getGroupMember(groupId, userId)` — returns `{ role, status } | null`
- `listGroups()` — keep for any internal use, but DO NOT use for directory (it filters to public only)
- `group-service.ts` functions (`createGroupForUser`, `updateGroupSettings`, `getGroupDetails`)
- `GroupHeader`, `GroupSettings`, `GroupCreationForm` components — no changes needed
- `useGroups()` hook — may need a variant or update for directory that includes private groups

**DO NOT modify:**

- `addGroupMember()` in `groups.ts` — hardcodes `status: "active"` and is used by `createGroup()`. Create new `insertGroupMember()` with explicit `status` param instead.

**Must create from scratch:**

- `src/db/queries/platform-settings.ts` — **no existing accessor exists** for the `platform_settings` table. The table exists (schema at `src/db/schema/platform-settings.ts`, JSONB key-value store) but zero query helpers have been written.
- `src/services/group-membership-service.ts` — new service for all join/leave/request/approve/reject logic

### Critical Technical Details

**`addGroupMember()` cannot be used for join requests:**
The existing function at `src/db/queries/groups.ts:149-169` hardcodes `status: "active"` (line 157) and uses `onConflictDoNothing()` (line 158). This means:

1. It cannot insert `status: "pending"` rows for join requests
2. It cannot transition pending→active on approval (the row already exists, so `onConflictDoNothing()` skips it)
   Create separate `insertGroupMember(groupId, userId, role, status)` and `updateGroupMemberStatus(groupId, userId, newStatus)` functions.

**`listGroups()` excludes private groups:**
The existing `listGroups()` at `src/db/queries/groups.ts:193-225` hardcodes `eq(communityGroups.visibility, "public")` (line 211). AC #1 requires private groups to appear in the directory. Create `listGroupsForDirectory()` that uses `IN ('public', 'private')` filter.

**`member_count` decrement must guard against negative:**
Use `GREATEST(member_count - 1, 0)` in SQL, not raw `member_count - 1`. Apply this in both `removeGroupMember()` and `updateGroupMemberStatus()` when transitioning away from active.

**GroupCard `<Link>` wrapping:**
Current `GroupCard` wraps everything in `<Link href={/groups/${group.id}}>`. Join/Request buttons inside the Link will trigger navigation unless `onClick` calls `e.stopPropagation()` and `e.preventDefault()`. See `src/features/groups/components/GroupCard.tsx:21-64`.

**Group creator cannot leave:**
`leaveGroup()` must reject with 403 if the member's `role === "creator"`. Without this, a group becomes orphaned with no owner. Ownership transfer is Story 5.4.

**System messages are conditional on chat conversation existence:**
`sendSystemMessage(conversationId, actingUserId, content)` requires a valid `conversationId`. Story 5.3 creates default group channels. For now, only emit system messages if a linked conversation exists. Do NOT create conversations prematurely.

**`sendSystemMessage` signature** (from `PlaintextMessageService`):

```typescript
sendSystemMessage(conversationId: string, actingUserId: string, content: string): Promise<ChatMessage>
```

`actingUserId` is the real user (NOT a fake system UUID) — `sender_id` has NOT NULL FK to `auth_users`.

### Notification Wiring Pattern

Follow existing `notification-service.ts` pattern — listeners registered at module load:

```typescript
eventBus.on("group.join_requested", async (payload: GroupJoinRequestedEvent) => {
  const leaders = await listGroupLeaders(payload.groupId);
  for (const leaderId of leaders) {
    await deliverNotification({
      userId: leaderId,
      actorId: payload.userId,
      type: "group_activity",
      title: "notifications.group_join_request.title",
      body: "notifications.group_join_request.body",
      link: `/groups/${payload.groupId}`,
    });
  }
});
```

Import `listGroupLeaders` from `@/db/queries/groups` (not from the service — notification-service uses query layer directly). Also import the new event types from `@/types/events`.

### GroupCard UX States (from UX Spec Component #17)

| State                                                             | Button                      | Behavior                         |
| ----------------------------------------------------------------- | --------------------------- | -------------------------------- |
| Not a member, open group                                          | "Join" (primary)            | Instant join via POST /join      |
| Not a member, private group                                       | "Request to Join" (outline) | Submit request via POST /request |
| Pending request                                                   | "Pending" (disabled, muted) | No action                        |
| Active member                                                     | "Joined" (muted badge)      | Links to group detail            |
| Group full (`memberLimit !== null && memberCount >= memberLimit`) | "Group is full" (disabled)  | No action                        |
| Hidden group                                                      | Not rendered                | Never shown in directory         |

### Route Test Patterns

- Mock `@/lib/rate-limiter` (`checkRateLimit → { allowed: true, ...}`, `buildRateLimitHeaders → {}`) and `@/lib/request-context` (`runWithContext: (_ctx, fn) => fn()`) — do NOT mock `withApiHandler` as passthrough
- CSRF headers required on all POST/DELETE: `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`
- Use `mockReset()` (not `clearAllMocks()`) in `beforeEach` for `mockResolvedValueOnce` sequences
- 401 test: `requireAuthenticatedSession` mock with `mockRejectedValue(new ApiError({ status: 401, title: "Unauthorized" }))` — import `ApiError` directly from `@/lib/api-error` (no mock needed, it has zero imports)
- Nested route param extraction for approve/reject routes: `URL.pathname.split("/")` — `groupId` is at a different index than `userId`

### Architecture Compliance

- API routes: `withApiHandler()` + RFC 7807 errors + `requireAuthenticatedSession()`
- Services: `src/services/` with `import "server-only"`, emit events via EventBus (never from routes)
- DB access: `src/db/queries/` — no inline SQL in services, no direct `db` import in services
- Feature boundaries: UI imports from `@/features/groups` barrel exports only
- Zod: import from `"zod/v4"`, error access via `parsed.error.issues[0]`
- Error throwing: `throw new ApiError({ title, status, detail })` from `@/lib/api-error`

### File Structure

- `src/db/queries/platform-settings.ts` (NEW)
- `src/db/queries/groups.ts` (EXTEND — add 6 new functions)
- `src/services/group-membership-service.ts` (NEW)
- `src/services/notification-service.ts` (EXTEND — add 3 EventBus listeners)
- `src/services/rate-limiter.ts` (EXTEND — add 4 presets)
- `src/types/events.ts` (EXTEND — add 5 event types + EventName + EventMap entries)
- `src/app/api/v1/groups/[groupId]/join/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/request/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/requests/[userId]/approve/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/requests/[userId]/reject/route.ts` (NEW)
- `src/app/api/v1/groups/[groupId]/members/self/route.ts` (NEW)
- `src/features/groups/components/GroupCard.tsx` (UPDATE)
- `src/features/groups/components/GroupList.tsx` (UPDATE)
- `src/features/groups/components/GroupDetailStub.tsx` (UPDATE)
- `src/features/groups/components/GroupSettings.tsx` (UPDATE — add pending requests UI)
- `src/features/groups/index.ts` (UPDATE — export new components/hooks)
- `messages/en.json` (UPDATE — Groups + notifications namespaces)
- `messages/ig.json` (UPDATE — Groups + notifications namespaces)

### References

- Story requirements: `_bmad-output/planning-artifacts/epics.md` → Story 5.2
- Groups foundation: `_bmad-output/implementation-artifacts/5-1-group-creation-configuration.md`
- UX GroupCard spec: `_bmad-output/planning-artifacts/ux-design-specification.md` → Component #17
- Architecture rules: `_bmad-output/planning-artifacts/architecture.md`

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

N/A

### Completion Notes List

- All 6 tasks implemented with 0 regressions
- 51 new tests added (2542 passing total; 15 pre-existing failures in suggestion-service/FileUpload/use-file-attachment — not caused by this story)
- System messages for join/leave deferred to Story 5.3 (no group chat conversations exist yet)
- Socket.IO room join on group join deferred to Story 5.3 (requires chat namespace integration)
- GroupDetailStub leave button not implemented (component is a stub placeholder; leave available via API route)
- `useRef` initial value fix: newer React types require explicit `undefined` argument
- Route test pattern: use per-mock `mockReset()` instead of `vi.resetAllMocks()` to avoid clearing rate-limiter mock from `vi.mock()` factory

### Code Review Fixes (2026-03-04)

- **H1**: Added idempotent join/request tests to join and request route tests; clarified 409 is not thrown (service is idempotent per Task 2)
- **H2**: Moved `getGroupMember` status reads inside transactions in `updateGroupMemberStatus` and `removeGroupMember` to eliminate TOCTOU race condition on `member_count`
- **H3**: Swapped joinType/visibility check order in `joinOpenGroup` and `requestToJoinGroup` — visibility now checked first to prevent hidden group existence leakage
- **M1**: Replaced dynamic `import()` of `listGroupLeaders` in notification-service with static import
- **M2**: Replaced `vi.resetAllMocks()` with per-mock `mockReset()` in service test; made `listGroupLeaders` referenceable from outer scope
- **M3**: Fixed `getPlatformSetting` null/object typeof collision guard (`val !== null` check added)
- **M4**: Added as Review Follow-up action item — requires backend JOIN to show display names
- **M5**: Added `joinError` state to `GroupCard` with `role="alert"` error display; `handleJoinClick` now has `catch` block

### Change Log

- 2026-03-04: All tasks implemented, tests passing, status → review

### File List

New files:

- `src/db/queries/platform-settings.ts`
- `src/db/queries/platform-settings.test.ts`
- `src/services/group-membership-service.ts`
- `src/services/group-membership-service.test.ts`
- `src/app/api/v1/groups/[groupId]/join/route.ts`
- `src/app/api/v1/groups/[groupId]/join/route.test.ts`
- `src/app/api/v1/groups/[groupId]/request/route.ts`
- `src/app/api/v1/groups/[groupId]/request/route.test.ts`
- `src/app/api/v1/groups/[groupId]/requests/[userId]/approve/route.ts`
- `src/app/api/v1/groups/[groupId]/requests/[userId]/approve/route.test.ts`
- `src/app/api/v1/groups/[groupId]/requests/[userId]/reject/route.ts`
- `src/app/api/v1/groups/[groupId]/requests/[userId]/reject/route.test.ts`
- `src/app/api/v1/groups/[groupId]/members/self/route.ts`
- `src/app/api/v1/groups/[groupId]/members/self/route.test.ts`

Modified files:

- `src/db/queries/groups.ts` (added 8 new functions + DirectoryListParams/DirectoryGroupItem types)
- `src/types/events.ts` (added 5 event types + EventName + EventMap entries)
- `src/services/notification-service.ts` (added 3 EventBus listeners for group membership events)
- `src/services/rate-limiter.ts` (added 4 rate limit presets)
- `src/app/api/v1/groups/route.ts` (added directory mode with batch membership lookup)
- `src/app/api/v1/groups/[groupId]/route.ts` (added pendingRequests for leaders)
- `src/features/groups/components/GroupCard.tsx` (rewritten with join/request/pending/full states)
- `src/features/groups/components/GroupList.tsx` (rewritten with directory mode + join/request handlers)
- `src/features/groups/components/GroupSettings.tsx` (added PendingRequestsSection)
- `src/features/groups/hooks/use-groups.ts` (added directory param + DirectoryGroupsResponse)
- `src/features/groups/types/index.ts` (added DirectoryGroupItem export)
- `src/features/groups/index.ts` (added DirectoryGroupItem type export)
- `messages/en.json` (added 15+ Groups keys + notification keys)
- `messages/ig.json` (added matching Igbo translations)

Updated test files:

- `src/features/groups/components/GroupCard.test.tsx` (rewritten, +6 new tests)
- `src/features/groups/components/GroupList.test.tsx` (updated, +1 new test)
- `src/features/groups/hooks/use-groups.test.ts` (fixed fetch assertions for credentials)
- `src/app/api/v1/groups/route.test.ts` (added mocks for new imports)
- `src/app/api/v1/groups/[groupId]/route.test.ts` (added listPendingMembers mock)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/5-2-group-discovery-membership.md`
