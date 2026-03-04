# Story 5.1: Group Creation & Configuration

Status: done

## Story

As a Top-tier member,
I want to create a group with a name, description, banner, and configurable settings,
so that I can build a structured community space for members with shared interests or geography.

## Acceptance Criteria

1. **Given** a Top-tier member navigates to group creation,
   **When** they fill out the creation form,
   **Then** they can set: group name (required, max 100 chars), description (optional, max 1000 chars), banner image (uploaded via presigned URL using the existing FileUpload component), and visibility (`public`, `private`, or `hidden`).
   **And** the system verifies the member's tier via `canCreateGroup(userId)` from `@/services/permissions` before allowing creation.
   **And** non-Top-tier members see the upgrade prompt instead of the creation form.

2. **Given** a group is created,
   **When** the creator configures settings,
   **Then** they can set: join_type (`open` or `approval`), posting_permission (`all_members`, `leaders_only`, `moderated`), commenting_permission (`open`, `members_only`, `disabled`), and member_limit (optional positive integer).
   **And** settings are saved and can be modified later by the group creator.

3. **Given** the database needs group support,
   **When** this story is implemented,
   **Then** migration `0023_community_groups.sql` creates:
   - `community_groups` table with: id (UUID PK), name, description, banner_url, visibility enum (`public`, `private`, `hidden`), join_type enum (`open`, `approval`), posting_permission enum (`all_members`, `leaders_only`, `moderated`), commenting_permission enum (`open`, `members_only`, `disabled`), member_limit (nullable integer), creator_id (FK CASCADE → auth_users.id), member_count (integer default 0), deleted_at (nullable TIMESTAMPTZ), created_at, updated_at
   - `community_group_members` table with: group_id (FK CASCADE → community_groups.id), user_id (FK CASCADE → auth_users.id), role enum (`member`, `leader`, `creator`), status enum (`active`, `pending`, `banned`), joined_at (TIMESTAMPTZ default now()) — composite PK (group_id, user_id)
   - FK constraint on `community_posts.group_id → community_groups.id` (deferred from Story 4.1 migration 0018)

4. **Given** a group is created successfully,
   **When** the server action completes,
   **Then** the creator is automatically added to `community_group_members` with role `creator` and status `active`.
   **And** the system emits a `group.created` EventBus event.
   **And** the creator is redirected to the new group's detail page.

5. **Given** the group creation UI,
   **When** a member navigates to `/[locale]/groups`,
   **Then** they see the groups directory page with a "Create Group" button (visible/enabled only for Top-tier members).
   **And** a `/[locale]/groups/new` page with the group creation form.
   **And** individual group settings can be updated by the creator via `PATCH /api/v1/groups/[groupId]`.

## Tasks / Subtasks

- [x] Task 1: Database migration (AC: #3)
  - [x] Write `src/db/migrations/0023_community_groups.sql` — creates `community_groups`, `community_group_members` tables + adds FK on `community_posts.group_id`
  - [x] Create enums in SQL: `community_group_visibility`, `community_group_join_type`, `community_group_posting_permission`, `community_group_commenting_permission`, `community_group_member_role`, `community_group_member_status`
  - [x] Add indexes: `idx_community_groups_creator_id`, `idx_community_groups_visibility` (partial: where deleted_at IS NULL), `idx_community_group_members_user_id`, `idx_community_group_members_group_id`

- [x] Task 2: Drizzle schema (AC: #3)
  - [x] Create `src/db/schema/community-groups.ts` with `communityGroups`, `communityGroupMembers` tables and all enums/types
  - [x] Update `groupId` in `community-posts.ts` to add FK reference: `groupId: uuid("group_id").references(() => communityGroups.id, { onDelete: "set null" })` (currently bare `uuid("group_id")` with no `.references()`)
  - [x] Register `* as communityGroupsSchema` in `src/db/index.ts`

- [x] Task 3: DB query functions (AC: #1, #2, #4)
  - [x] Create `src/db/queries/groups.ts` with: `createGroup()`, `getGroupById()`, `updateGroup()`, `addGroupMember()`, `getGroupMember()`, `listGroups()`
  - [x] No `server-only` in query files — consistent with `follows.ts` and `block-mute.ts` pattern

- [x] Task 4: EventBus event types + Group service (AC: #1, #2, #4)
  - [x] Update `src/types/events.ts`: add `GroupCreatedEvent` (`{ groupId: string; creatorId: string }`) and `GroupUpdatedEvent` (`{ groupId: string; updatedBy: string }`) interfaces extending `BaseEvent`; add `"group.created"` and `"group.updated"` to the `EventName` union and `EventMap` (only `"group.archived"` exists currently)
  - [x] Create `src/services/group-service.ts` with `import "server-only"`
  - [x] Implement `createGroupForUser(userId, input)`: permission check → validate → db.transaction → insert group + insert creator member row → emit EventBus `group.created`
  - [x] Implement `updateGroupSettings(userId, groupId, input)`: verify caller is creator or leader → update group → emit `group.updated`
  - [x] Implement `getGroupDetails(groupId)`: fetch group + member count (no N+1 — use member_count column, not subquery)

- [x] Task 5: Rate limiter presets (AC: #2)
  - [x] Add to `src/services/rate-limiter.ts` under Story 5.1 comment:
    ```
    GROUP_CREATE: { maxRequests: 5, windowMs: 3_600_000 }, // 5/hour per userId
    GROUP_UPDATE: { maxRequests: 20, windowMs: 60_000 },   // 20/min per userId
    GROUP_LIST: { maxRequests: 60, windowMs: 60_000 },     // 60/min per userId
    GROUP_DETAIL: { maxRequests: 120, windowMs: 60_000 },  // 120/min per userId
    ```

- [x] Task 6: Server action — create group (AC: #1, #2, #4)
  - [x] Create `src/features/groups/actions/create-group.ts` with `"use server"` directive
  - [x] Zod validation schema (name: string max 100, description: string max 1000 optional, visibility enum, join_type enum, posting_permission enum, commenting_permission enum, member_limit: number positive optional, banner_url: string optional)
  - [x] Returns `{ groupId: string }` on success (no `success` field — Shape B); `{ errorCode: "UNAUTHORIZED" | "PERMISSION_DENIED" | "VALIDATION_ERROR" | "RATE_LIMIT_EXCEEDED", reason: string }` on failure. Error detection: `"errorCode" in result`. See `docs/decisions/server-action-returns.md`.

- [x] Task 7: REST API routes (AC: #2, #5)
  - [x] `GET /api/v1/groups` — list public/visible groups (paginated, filterable by name) — uses `withApiHandler()` + `RATE_LIMIT_PRESETS.GROUP_LIST` + `requireAuthenticatedSession()`
  - [x] `GET /api/v1/groups/[groupId]` — group detail (name, description, banner, settings, member_count, viewer's membership status) — `GROUP_DETAIL` preset
  - [x] `PATCH /api/v1/groups/[groupId]` — update group settings (creator/leader only) — `GROUP_UPDATE` preset
  - [x] All routes use `withApiHandler()` from `@/server/api/middleware`, `requireAuthenticatedSession()` from `@/services/permissions`, RFC 7807 error format via `ApiError`

- [x] Task 8: i18n translations (AC: #1, #5)
  - [x] Add `"Groups"` namespace to `messages/en.json` with keys: `title`, `createGroup`, `createGroupCta`, `form.name`, `form.description`, `form.bannerImage`, `form.visibility`, `form.joinType`, `form.postingPermission`, `form.commentingPermission`, `form.memberLimit`, `form.submit`, `form.cancel`, `visibilityOptions.public`, `visibilityOptions.private`, `visibilityOptions.hidden`, `joinTypeOptions.open`, `joinTypeOptions.approval`, `postingPermOptions.allMembers`, `postingPermOptions.leadersOnly`, `postingPermOptions.moderated`, `commentingPermOptions.open`, `commentingPermOptions.membersOnly`, `commentingPermOptions.disabled`, `upgradePrompt`, `createSuccess`, `errors.nameTaken`, `errors.permissionDenied`
  - [x] Add matching `"Groups"` namespace to `messages/ig.json`

- [x] Task 9: UI components (AC: #1, #5)
  - [x] Create `src/features/groups/components/GroupCreationForm.tsx` — form with all fields, uses `FileUpload` for banner, calls `createGroup` server action, `useTranslations("Groups")`
  - [x] Create `src/features/groups/components/GroupCard.tsx` — card showing banner, name, member count, visibility badge, join button placeholder (Story 5.2); clickable → group detail
  - [x] Create `src/features/groups/components/GroupList.tsx` — grid of `GroupCard` items with empty state
  - [x] Create `src/features/groups/components/GroupHeader.tsx` — group banner + name + description + settings link (visible to creator)
  - [x] Create `src/features/groups/components/GroupSettings.tsx` — settings form (same fields as creation, pre-filled), calls PATCH route; visible only to creator/leader
  - [x] All components use `useTranslations("Groups")`

- [x] Task 10: Hooks (AC: #5)
  - [x] Create `src/features/groups/hooks/use-groups.ts` — TanStack Query hook: `useGroups(params)` fetches `GET /api/v1/groups`, returns paginated group list

- [x] Task 11: Pages and routes (AC: #5)
  - [x] Create `src/app/[locale]/(app)/groups/page.tsx` — SSR, shows `GroupList`, "Create Group" button (gated by `session.user.membershipTier === "TOP_TIER"`); uses `auth()` from `@/server/auth/config`; add `generateMetadata` with `getTranslations({ locale, namespace: "Groups" })` for SEO; consider `export const revalidate = 60` for ISR on public listing
  - [x] Create `src/app/[locale]/(app)/groups/new/page.tsx` — SSR, checks tier via `canCreateGroup(userId)`, shows `GroupCreationForm` or upgrade prompt
  - [x] Create `src/app/[locale]/(app)/groups/[groupId]/page.tsx` — SSR stub: `GroupHeader` + placeholder tabs for Feed/Chat/Members/Files (detailed content in Stories 5.2–5.4); redirects to groups list if group not found or deleted

- [x] Task 12: Feature barrel exports (AC: #5)
  - [x] Create `src/features/groups/index.ts` — re-export components, hooks, types
  - [x] Create `src/features/groups/types/index.ts` — export `Group`, `GroupMember`, `GroupVisibility`, `GroupJoinType`, etc. from schema inferred types

- [x] Task 13: Tests (all ACs)
  - [x] `src/db/schema/community-groups.test.ts` — schema shape validation (Drizzle infer types)
  - [x] `src/services/group-service.test.ts` — unit tests: createGroupForUser (success, permission denied, validation), updateGroupSettings (success, unauthorized)
  - [x] `src/features/groups/actions/create-group.test.ts` — server action tests: success, rate limit, permission denied, validation error
  - [x] `src/app/api/v1/groups/route.test.ts` — GET list (200 paginated, 401 unauthenticated)
  - [x] `src/app/api/v1/groups/[groupId]/route.test.ts` — GET detail (200, 404), PATCH settings (200 success, 403 non-owner, 422 invalid body, 401 unauthenticated)
  - [x] `src/features/groups/components/GroupCreationForm.test.tsx` — renders form, submit calls server action, shows upgrade prompt for non-Top-tier
  - [x] `src/features/groups/components/GroupCard.test.tsx` — renders name, member count, badge
  - [x] `src/features/groups/components/GroupList.test.tsx` — renders grid of GroupCard items, empty state, search input
  - [x] `src/features/groups/components/GroupHeader.test.tsx` — renders banner, name, settings button visible to creator only
  - [x] `src/features/groups/components/GroupSettings.test.tsx` — renders pre-filled settings form, submit calls PATCH route, hidden from non-creator
  - [x] `src/features/groups/hooks/use-groups.test.ts` — mocked fetch, returns groups

## Dev Notes

### Architecture Constraints

- **Hand-write migration SQL** — `drizzle-kit generate` fails with `server-only` error. Migration must be `0023_community_groups.sql`. The prior migration was `0022_post_bookmarks.sql` (Story 4.4).
- **`community_posts.group_id` FK** — This column exists in the `community_posts` Drizzle schema since Story 4.1 (see `community-posts.ts` line 45: `groupId: uuid("group_id"), // FK to community_groups added in Story 5.1`), but no FK constraint was added to the DB. Migration 0023 must add the FK via `ALTER TABLE community_posts ADD CONSTRAINT community_posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES community_groups(id) ON DELETE SET NULL;` (set null, not cascade — group deletion should not delete posts).
- **Drizzle schema file naming** — `src/db/schema/community-groups.ts`; registered in `src/db/index.ts` as `import * as communityGroupsSchema from "./schema/community-groups"`.
- **No `server-only` in query files** — `src/db/queries/groups.ts` consistent with `follows.ts` and `block-mute.ts`.
- **`group-service.ts` has `import "server-only"`** — consistent with `post-service.ts`, `follow-service.ts`.
- **`canCreateGroup()` is already implemented** in `src/services/permissions.ts` (line 71–83). Do NOT re-implement. Import and call directly.
- **EventBus events**: `group.created`, `group.updated`. Emit from service, never from route/action. Must first add `GroupCreatedEvent`/`GroupUpdatedEvent` interfaces and event names to `src/types/events.ts` (only `"group.archived"` exists currently).
- **Zod**: Import from `"zod/v4"`, use `parsed.error.issues[0]` (not `parsed.issues[0]`).
- **API routes**: Always wrap with `withApiHandler()` from `@/server/api/middleware`.
- **Auth in pages**: Use `import { auth } from "@/server/auth/config"` — NOT `@/auth`.
- **i18n**: All user-facing strings via `useTranslations("Groups")` — no hardcoded strings.
- **Error format**: RFC 7807 via `ApiError` from `@/lib/api-error`; `successResponse()`/`errorResponse()` from `@/lib/api-response`.
- **`requireAuthenticatedSession()`** from `@/services/permissions` for user self-service routes.
- **Rate limit `key` function in routes**: Must dynamically import `requireAuthenticatedSession` inside the `key` function (not use top-level import). Pattern: `key: async () => { const { requireAuthenticatedSession: getSession } = await import("@/services/permissions"); const { userId } = await getSession(); return \`group-list:\${userId}\`; }`
- **Server action return shapes**: See `docs/decisions/server-action-returns.md` — `createGroup` uses Shape B (`{ ...data }` vs `{ errorCode }`); asymmetric, no top-level `success` field for mutation-boolean pattern since it returns data (`groupId`).
- **TanStack Query**: `useGroups` uses `useQuery` (not `useInfiniteQuery` for Story 5.1 — basic pagination via `?cursor=` is sufficient).

### DB Schema Design

```
community_groups
  id                      UUID PK DEFAULT gen_random_uuid()
  name                    VARCHAR(100) NOT NULL
  description             TEXT
  banner_url              TEXT
  visibility              community_group_visibility NOT NULL DEFAULT 'public'
  join_type               community_group_join_type NOT NULL DEFAULT 'open'
  posting_permission      community_group_posting_permission NOT NULL DEFAULT 'all_members'
  commenting_permission   community_group_commenting_permission NOT NULL DEFAULT 'open'
  member_limit            INTEGER CHECK (member_limit > 0)
  creator_id              UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
  member_count            INTEGER NOT NULL DEFAULT 0
  deleted_at              TIMESTAMPTZ
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()

community_group_members
  group_id    UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE
  user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
  role        community_group_member_role NOT NULL DEFAULT 'member'
  status      community_group_member_status NOT NULL DEFAULT 'active'
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  PRIMARY KEY (group_id, user_id)
```

### Feature Module Structure

```
src/features/groups/
  actions/
    create-group.ts
    create-group.test.ts
    update-group.ts            (settings update — thin wrapper on PATCH route or direct service call)
    update-group.test.ts
  components/
    GroupCreationForm.tsx
    GroupCreationForm.test.tsx
    GroupCard.tsx
    GroupCard.test.tsx
    GroupList.tsx
    GroupList.test.tsx
    GroupHeader.tsx
    GroupHeader.test.tsx
    GroupSettings.tsx
    GroupSettings.test.tsx
  hooks/
    use-groups.ts
    use-groups.test.ts
  types/
    index.ts
  index.ts
```

### API Routes

```
src/app/api/v1/groups/
  route.ts          GET (list) — POST create deferred (server action is primary creation path)
  route.test.ts
  [groupId]/
    route.ts        GET (detail), PATCH (settings) — DELETE (soft-delete) deferred to Story 5.4
    route.test.ts
```

### Page Routes

```
src/app/[locale]/(app)/groups/
  page.tsx              Groups directory (public group listing + create button)
  new/
    page.tsx            Group creation page (tier-gated)
  [groupId]/
    page.tsx            Group detail (stub — full content in 5.2–5.4)
    settings/
      page.tsx          Group settings (creator/leader only — can be added in 5.4)
```

### UI / UX Notes

- UX Journey 7 (Journey 7: Group Creation & Management): Ngozi (45, London) creating "London Chapter". Three-step flow: (1) Basic info (name, description, banner), (2) Visibility selection (Public/Private/Hidden), (3) Configure settings. After creation, prompt "Invite your first members."
- Non-Top-tier members navigating to `/groups/new` see: "Group creation is available to Top-tier members. Here's how to reach Top-tier status." (key: `Groups.upgradePrompt`) — consistent with UX pattern from Story 3.4 (FollowButton tier upgrade messaging).
- Banner image upload: uses `FileUpload` from `@/components/shared/FileUpload` with `category="image"` (from `@/config/upload`). The `onUploadComplete` callback receives `(fileUploadId, objectKey, publicUrl)` — store `publicUrl` as `banner_url`. If upload fails, group creates without banner — "Add banner" prompt remains (per UX error recovery spec).
- **"Enable Group Chat Channels" toggle** (from UX Journey 7 flowchart K4) is intentionally deferred to Story 5.3 when channels are built. Do NOT add this field in Story 5.1.
- Group cards in listing: banner image, name, member count, visibility badge, "Join" button (Story 5.2) — Story 5.1 renders `GroupCard` with join button as placeholder (disabled/hidden until Story 5.2).
- `GroupList` shows search input and card grid. Empty state: "No groups found. Be the first to create one!" with "Create Group" CTA.

### Testing Patterns from Recent Stories

- **`mockReset()` not `clearAllMocks()`**: Service tests with `mockResolvedValueOnce` sequences MUST use `mockReset()` in `beforeEach`. (`clearAllMocks()` only clears call history, not queued Once values.)
- **Explicit factory mocks for DB query files**: `vi.mock("@/db/queries/groups", () => ({ createGroup: vi.fn(), ... }))` — NEVER bare `vi.mock("@/db/queries/groups")`.
- **`vi.hoisted()` for DB mock objects**: If `vi.mock("@/db", () => ({ db: mockDb }))` references `mockDb` declared after the `vi.mock()` call, use `vi.hoisted(() => ({ db: {...} }))` to avoid TDZ error.
- **Route test pattern** (from Story 4.3): Do NOT mock `withApiHandler` as passthrough — it strips error handling. Mock `@/lib/rate-limiter` (`checkRateLimit → {allowed:true}`, `buildRateLimitHeaders → {}`) and `@/lib/request-context` (`runWithContext: (_ctx, fn) => fn()`).
- **`@vitest-environment node`** annotation required on server-side test files.
- **Pre-existing test failure**: `ProfileStep.test.tsx` — 1 failure since Story 1.9, do not investigate.
- **DropdownMenu mock for jsdom**: Mock `@/components/ui/dropdown-menu` to always render content (no open/close) if used in any group components.
- **`useTranslations` mock pattern**: Mock `next-intl` with `{ useTranslations: () => (key: string) => key }`. Test assertions use the mock-key format (e.g., `{ name: /Groups.createGroup/i }`).

### Git Intelligence (Recent Commits)

Recent commits are all infrastructure bug fixes (S3 CORS, CSP headers, realtime health check) — no application feature patterns introduced. Last feature story was 4.4 (bookmarks/pinned posts).

Key files created/modified in Story 4.4 for reference:

- `src/db/migrations/0022_post_bookmarks.sql` — pattern for migration 0023
- `src/db/schema/bookmarks.ts` — pattern for `community-groups.ts` schema
- `src/features/feed/actions/toggle-bookmark.ts` — server action pattern (Shape B returns)
- `src/app/api/v1/user/bookmarks/route.ts` — route pattern with `withApiHandler` + rate limit
- `src/features/feed/components/BookmarkButton.tsx` — optimistic UI component pattern

### Story 4.4 Key Learnings Applicable to Story 5.1

- **Asymmetric server action returns (Shape B)**: `create-group.ts` should return `{ groupId: string }` on success (no `success: true` field) and `{ errorCode: string, reason: string }` on error. Error detection: `"errorCode" in result`.
- **`db.transaction()` mock pattern** for service tests: `mockDb.transaction.mockImplementation(async (cb) => { const tx = { insert: vi.fn()..., update: vi.fn()... }; return cb(tx); })`.
- **LEFT JOIN pattern for enriched queries** (from feed.ts): if Story 5.1 needs to return `viewerIsMember` flag with group detail, use `LEFT JOIN community_group_members ON ... AND user_id = $viewerId`.
- **ISR rendering strategy**: Group directory (`/groups`) can use ISR (60s revalidation) for public listing since it's read-heavy. Group detail page should also use ISR.

### References

- Epic 5 Story 5.1 AC: [Source: _bmad-output/planning-artifacts/epics.md#Story-5.1]
- UX Journey 7 (Group Creation): [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-7]
- Architecture: RBAC enforcement, permission service: [Source: _bmad-output/planning-artifacts/architecture.md#RBAC-Enforcement]
- Architecture: Feature-based module structure: [Source: _bmad-output/planning-artifacts/architecture.md#Component-Directory-Structure]
- Architecture: File upload pipeline (presigned URL for banner): [Source: _bmad-output/planning-artifacts/architecture.md#File-Upload-Pipeline]
- Architecture: DB schema file for groups: `src/db/schema/community-groups.ts` [Source: architecture.md#Data-Architecture]
- Architecture: Groups routes and pages: `src/app/[locale]/(app)/groups/` [Source: architecture.md#Frontend-Architecture]
- `canCreateGroup()` already implemented: [Source: src/services/permissions.ts#L71-83]
- `community_posts.group_id` deferred FK: [Source: src/db/schema/community-posts.ts#L45]
- Rate limiter presets pattern: [Source: src/services/rate-limiter.ts]
- Server action shape decision: [Source: docs/decisions/server-action-returns.md]
- Zod v4 import and error pattern: MEMORY.md (Critical Patterns)
- Migration hand-write requirement: MEMORY.md (Critical Patterns)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Drizzle schema introspection: `communityGroups._.columns` is undefined in this Drizzle version. Use `Object.keys(table)` for column list checks and direct `table.column.property` access (e.g., `communityGroups.id.primary`).
- PATCH route tests returned 403 instead of 422/401: `withApiHandler`'s `validateCsrf()` runs before body parsing and auth. All PATCH test requests must include `Host` and `Origin` headers matching the request URL (e.g., `{ Host: "example.com", Origin: "https://example.com" }`).

### Completion Notes List

- **104 new tests** added (11 test files), all passing. Baseline was 2396; Story 5.1 brings total to 2500.
- **15 pre-existing failures** (suggestion-service.test.ts ×10, FileUpload.test.tsx ×2, use-file-attachment.test.ts ×3) confirmed present on main branch before Story 5.1 — not caused by this work.
- **`update-group.ts` server action deferred**: The story module structure doc shows `update-group.ts` as a thin wrapper, but the existing `PATCH /api/v1/groups/[groupId]` route already handles settings updates directly via `updateGroupSettings()` service call. No separate server action needed.
- **`communityGroups` FK in `community-posts.ts`**: Changed from bare `uuid("group_id")` to `uuid("group_id").references(() => communityGroups.id, { onDelete: "setNull" })`. Drizzle uses `"setNull"` (camelCase) not `"set null"` for the `onDelete` option.
- **`settingsTitle` i18n key**: Used for settings link in `GroupHeader` (matches `GroupSettings.test.tsx` assertion for `screen.getByText("settingsTitle")`).

### File List

**New Files:**

- `src/db/migrations/0023_community_groups.sql`
- `src/db/schema/community-groups.ts`
- `src/db/schema/community-groups.test.ts`
- `src/db/queries/groups.ts`
- `src/services/group-service.ts`
- `src/services/group-service.test.ts`
- `src/features/groups/actions/create-group.ts`
- `src/features/groups/actions/create-group.test.ts`
- `src/features/groups/components/GroupCard.tsx`
- `src/features/groups/components/GroupCard.test.tsx`
- `src/features/groups/components/GroupList.tsx`
- `src/features/groups/components/GroupList.test.tsx`
- `src/features/groups/components/GroupCreationForm.tsx`
- `src/features/groups/components/GroupCreationForm.test.tsx`
- `src/features/groups/components/GroupHeader.tsx`
- `src/features/groups/components/GroupHeader.test.tsx`
- `src/features/groups/components/GroupSettings.tsx`
- `src/features/groups/components/GroupSettings.test.tsx`
- `src/features/groups/hooks/use-groups.ts`
- `src/features/groups/hooks/use-groups.test.ts`
- `src/features/groups/types/index.ts`
- `src/features/groups/index.ts`
- `src/app/[locale]/(app)/groups/page.tsx`
- `src/app/[locale]/(app)/groups/new/page.tsx`
- `src/app/[locale]/(app)/groups/[groupId]/page.tsx`
- `src/app/[locale]/(app)/groups/[groupId]/GroupDetailStub.tsx`
- `src/app/api/v1/groups/route.ts`
- `src/app/api/v1/groups/route.test.ts`
- `src/app/api/v1/groups/[groupId]/route.ts`
- `src/app/api/v1/groups/[groupId]/route.test.ts`

**Modified Files:**

- `src/db/schema/community-posts.ts` (added FK reference to communityGroups)
- `src/db/index.ts` (registered communityGroupsSchema)
- `src/types/events.ts` (added GroupCreatedEvent, GroupUpdatedEvent, event names/map)
- `src/services/rate-limiter.ts` (added GROUP_CREATE, GROUP_UPDATE, GROUP_LIST, GROUP_DETAIL presets)
- `messages/en.json` (added Groups namespace + joinButton, comingSoon keys)
- `messages/ig.json` (added Groups namespace + joinButton, comingSoon keys)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date       | Version | Description                                                                                                                                                                                                                                                                                    | Author            |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 2026-03-03 | 1.0     | Story implemented — all 13 tasks complete, 104 new tests, status → review                                                                                                                                                                                                                      | claude-sonnet-4-6 |
| 2026-03-03 | 1.1     | Code review fixes: H1 escape LIKE wildcards in listGroups, H3 fix debounce memory leak in GroupList, M1 i18n GroupCard join button, M2 i18n group detail stub, M3 GroupCard keyboard accessibility via Link, M4 addGroupMember increments member_count atomically. 105 tests passing (+1 new). | claude-opus-4-6   |
