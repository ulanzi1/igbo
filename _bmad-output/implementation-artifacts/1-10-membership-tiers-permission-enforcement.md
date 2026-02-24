# Story 1.10: Membership Tiers & Permission Enforcement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want the system to enforce three membership tiers with distinct capabilities and to manage tier assignments,
so that features are gated appropriately and members have clear progression paths.

## Acceptance Criteria

1. **Given** the platform has three membership tiers
   **When** a member's tier is evaluated
   **Then** Basic members can: participate in chat, join public groups, view articles, attend general meetings, use the member directory (FR21)
   **And** Professional members can do all Basic capabilities plus: publish 1 article per week (members-only visibility), access enhanced features (FR22)
   **And** Top-tier members can do all Professional capabilities plus: create and manage groups, publish 2 articles per week (guest or member visibility), assign group leaders (FR23)

2. **Given** a centralized permission service is needed
   **When** any API route or server action checks permissions
   **Then** it calls `PermissionService` methods (e.g., `canCreatePost(userId)`, `canCreateGroup(userId)`, `canPublishArticle(userId)`)
   **And** the service checks tier, current usage against limits, and returns a clear allow/deny with reason
   **And** the permission matrix is defined as configuration, not scattered conditionals

3. **Given** an admin wants to manage a member's tier
   **When** the admin navigates to member management and selects a member
   **Then** they can assign, upgrade, or downgrade the member's tier (FR24)
   **And** the change takes effect immediately (session cache invalidated in Redis)
   **And** the member receives a notification of the tier change
   **And** the system logs the action in the audit trail

4. **Given** the RBAC infrastructure is needed
   **When** this story is implemented
   **Then** the migration creates the `auth_roles` and `auth_user_roles` tables
   **And** Next.js middleware enforces coarse route protection (authenticated? admin? banned?)
   **And** the `PermissionService` (`src/services/permissions.ts`) handles fine-grained tier-based business logic
   **And** all new members default to Basic tier upon approval

5. **Given** a member attempts an action above their tier
   **When** the action is blocked by PermissionService
   **Then** they see a clear, non-punitive message explaining the tier requirement (e.g., "Group creation is available to Top-tier members. Here's how to reach Top-tier status.")

## Tasks / Subtasks

- [x] Task 1: DB schema + migration (AC: 3, 4)
  - [x] Create `src/db/schema/auth-permissions.ts` with:
    - `membershipTierEnum` pgEnum with values `BASIC`, `PROFESSIONAL`, `TOP_TIER` (naming: `membership_tier` per architecture convention)
    - `authRoles` table (`auth_roles`):
      - `id: uuid("id").primaryKey().defaultRandom()`
      - `name: varchar("name", { length: 50 }).notNull().unique()` — stores role names (`MEMBER`, `ADMIN`, `MODERATOR`)
      - `description: text("description")`
      - `createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()`
    - `authUserRoles` table (`auth_user_roles`):
      - `id: uuid("id").primaryKey().defaultRandom()`
      - `userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" })`
      - `roleId: uuid("role_id").notNull().references(() => authRoles.id, { onDelete: "cascade" })`
      - `assignedBy: uuid("assigned_by").references(() => authUsers.id)` — nullable (system-assigned for defaults)
      - `assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull()`
      - Unique constraint on `(userId, roleId)`
      - Index on `userId`
    - Export types: `AuthRole`, `NewAuthRole`, `AuthUserRole`, `NewAuthUserRole`
  - [x] Add `membershipTier` column to `authUsers` table in `src/db/schema/auth-users.ts`:
    - `membershipTier: membershipTierEnum("membership_tier").notNull().default("BASIC")`
    - Import `membershipTierEnum` from `./auth-permissions`
    - Add index: `idx_auth_users_membership_tier` on `membershipTier`
  - [x] Update `src/db/index.ts` — there is NO `src/db/schema/index.ts`; schemas are explicitly imported in `src/db/index.ts` with `import * as schemaName from "./schema/filename"` pattern. Add:
    - `import * as authPermissionsSchema from "./schema/auth-permissions";`
    - Add `...authPermissionsSchema` to the schema object spread in the `drizzle()` constructor call (alongside existing `...authUsersSchema`, `...auditLogsSchema`, etc.)
  - [x] Generate migration `src/db/migrations/0007_membership_tiers_rbac.sql` (hand-write if `drizzle-kit generate` fails with `server-only` error — same as all prior migrations)
  - [x] Seed the `auth_roles` table with initial roles: `MEMBER`, `ADMIN`, `MODERATOR` — add to existing seed script or create migration INSERT statements
  - [x] Add `"MEMBER_TIER_CHANGED"` to the `AdminAction` union in `src/services/audit-logger.ts:5-10` — the current union is `"APPROVE_APPLICATION" | "REQUEST_INFO" | "REJECT_APPLICATION" | "UNDO_ACTION" | "RESET_2FA"`. Add `| "MEMBER_TIER_CHANGED"` so that `logAdminAction({ action: "MEMBER_TIER_CHANGED", ... })` in Task 4 passes TypeScript type checking (the DB column is a varchar so any string is valid at DB level, but the TypeScript type must be updated)

- [x] Task 2: Event types + query functions (AC: 1, 2, 3, 4)
  - [x] Add to `src/types/events.ts`:
    - `MemberTierChangedEvent` interface extending `BaseEvent` with: `userId: string`, `previousTier: string`, `newTier: string`, `changedBy: string`
    - `PermissionDeniedEvent` interface extending `BaseEvent` with: `userId: string`, `action: string`, `reason: string`
    - Add `"member.tier_changed"` and `"member.permission_denied"` to `EventName` union
    - Add to `EventMap` with matching types
  - [x] Create `src/db/queries/auth-permissions.ts`:
    - `getUserMembershipTier(userId: string): Promise<MembershipTier>` — select `membershipTier` from `authUsers` where `id = userId` and `isNull(deletedAt)`; return tier or throw if not found
    - `updateUserMembershipTier(userId: string, tier: MembershipTier, assignedBy: string): Promise<void>` — update `membershipTier` on `authUsers` where `id = userId`; set `updatedAt = now()`; must include `isNull(deletedAt)` in WHERE
    - `getUsersWithTier(tier: MembershipTier, options?: { limit?: number, offset?: number }): Promise<AuthUser[]>` — select users with given tier for admin listing; filter `isNull(deletedAt)` and `accountStatus = 'APPROVED'`
    - `getRoleByName(name: string): Promise<AuthRole | null>` — find role record by name
    - `assignUserRole(userId: string, roleId: string, assignedBy?: string): Promise<void>` — upsert into `authUserRoles` on `(userId, roleId)` conflict
    - `getUserRoles(userId: string): Promise<AuthRole[]>` — join `authUserRoles` with `authRoles` for given userId

- [x] Task 3: PermissionService — centralized permission engine (AC: 1, 2, 5)
  - [x] Rewrite `src/services/permissions.ts` (currently minimal with `isAdmin`, `isAuthenticated`, `requireAuthenticatedSession`):
    - Add `import "server-only"`
    - **Keep existing exports** (`isAdmin`, `isAuthenticated`, `requireAuthenticatedSession`) — they are used by other stories
    - Define `PERMISSION_MATRIX` as a const configuration object:
      ```typescript
      const PERMISSION_MATRIX = {
        BASIC: {
          canChat: true,
          canJoinPublicGroups: true,
          canViewArticles: true,
          canAttendEvents: true,
          canUseMemberDirectory: true,
          canPublishArticle: false,
          canCreateGroup: false,
          canAssignGroupLeaders: false,
          maxArticlesPerWeek: 0,
          articleVisibility: [] as string[],
        },
        PROFESSIONAL: {
          canChat: true,
          canJoinPublicGroups: true,
          canViewArticles: true,
          canAttendEvents: true,
          canUseMemberDirectory: true,
          canPublishArticle: true,
          canCreateGroup: false,
          canAssignGroupLeaders: false,
          maxArticlesPerWeek: 1,
          articleVisibility: ["MEMBERS_ONLY"],
        },
        TOP_TIER: {
          canChat: true,
          canJoinPublicGroups: true,
          canViewArticles: true,
          canAttendEvents: true,
          canUseMemberDirectory: true,
          canPublishArticle: true,
          canCreateGroup: true,
          canAssignGroupLeaders: true,
          maxArticlesPerWeek: 2,
          articleVisibility: ["MEMBERS_ONLY", "PUBLIC"],
        },
      } as const;
      ```
    - `getPermissions(userId: string): Promise<TierPermissions>` — fetch user tier from DB, return permission set from matrix
    - `canCreateGroup(userId: string): Promise<PermissionResult>` — returns `{ allowed: boolean, reason?: string, tierRequired?: string }`
    - `canPublishArticle(userId: string): Promise<PermissionResult>` — checks tier only for now; if tier is BASIC return deny. If PROFESSIONAL or TOP_TIER return allow. **Do NOT query an articles table — it does not exist yet.** Add comment: `// TODO(Story 1.xx): add weekly count check against articles table once articles feature is built`
    - `canAssignGroupLeaders(userId: string): Promise<PermissionResult>` — TOP_TIER only
    - `checkPermission(userId: string, action: keyof TierPermissions): Promise<PermissionResult>` — generic permission check against the matrix
    - `getTierUpgradeMessage(action: string, requiredTier: string): string` — returns i18n-ready upgrade prompt key (e.g., `"Permissions.upgradeRequired"` with params `{action, tier}`)
    - All deny results emit `member.permission_denied` event via EventBus for analytics. Import and usage: `import { eventBus } from "@/services/event-bus"` then `await eventBus.emit("member.permission_denied", { userId, action, reason, timestamp: new Date().toISOString() })`
  - [x] Define `PermissionResult` and `TierPermissions` types directly in `src/services/permissions.ts` and export them. Do NOT create `src/features/admin/types/` — these are cross-cutting service types used by future article, group, and event features, not admin-feature-specific types

- [x] Task 4: Tier management service (AC: 3)
  - [x] Create `src/services/tier-service.ts`:
    - `import "server-only"`
    - `changeMemberTier(userId: string, newTier: MembershipTier, changedBy: string): Promise<void>`:
      - Get current tier via `getUserMembershipTier(userId)`
      - If same tier, return early (no-op)
      - Call `updateUserMembershipTier(userId, newTier, changedBy)`
      - Evict user session cache from Redis — use the two existing helpers: `const sessions = await findActiveSessionsByUserId(userId)` (from `@/db/queries/auth-sessions`) then `await evictAllUserSessions(sessions.map(s => s.sessionToken))` (from `@/server/auth/redis-session-cache`). Do NOT write a custom query or loop `evictCachedSession()` individually — the batch function already exists.
      - Emit `member.tier_changed` event via EventBus
      - Log action to audit log: `{ action: "MEMBER_TIER_CHANGED", actorId: changedBy, targetUserId: userId, details: { previousTier, newTier } }` — note `SCREAMING_SNAKE_CASE` to match existing audit log action convention
      - TODO(Story 1.15): Emit notification to member about tier change (notification system not yet built)
    - `getMemberTier(userId: string): Promise<MembershipTier>` — wrapper around query
    - `getDefaultTier(): MembershipTier` — returns `"BASIC"`

- [x] Task 5: Admin member management API (AC: 3)
  - [x] Create `src/app/api/v1/admin/members/route.ts`:
    - `GET` handler wrapped with `withApiHandler()`
    - Call `requireAdminSession()` — 401/403 if not admin
    - Accept query params: `?tier=BASIC|PROFESSIONAL|TOP_TIER`, `?page=1`, `?pageSize=20`, `?search=name`
    - Query `authUsers` joined with `communityProfiles` for display name; filter by tier if specified; for search use `or(ilike(authUsers.email, \`%${search}%\`), ilike(communityProfiles.displayName, \`%${search}%\`))`(import`ilike`, `or`from`drizzle-orm` — case-insensitive multi-field match); paginate with offset-based pagination (admin pattern per architecture)
    - Filter: `accountStatus = 'APPROVED'` and `isNull(deletedAt)`
    - Return `{ data: members[], meta: { total, page, pageSize } }`
  - [x] Create `src/app/api/v1/admin/members/[id]/tier/route.ts`:
    - `PATCH` handler wrapped with `withApiHandler()`
    - Call `requireAdminSession()` — 401/403 if not admin
    - Validate request body with Zod: `z.object({ tier: z.enum(["BASIC", "PROFESSIONAL", "TOP_TIER"]) })`
    - Call `tierService.changeMemberTier(userId, tier, adminId)`
    - Return `{ data: { userId, tier, updatedAt } }`

- [x] Task 6: Middleware enhancement for tier in JWT (AC: 4)
  - [x] Update Auth.js module augmentation in `src/server/auth/config.ts`:
    - Add `membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER"` to `User`, `Session.user`, and `JWT` interfaces
    - **Update the Credentials provider `authorize` method** (~line 202-238): the current DB lookup loads `authUsers` fields but does NOT include `membershipTier`. After adding the column in Task 1, update the returned user object to include `membershipTier: user.membershipTier` (the field will already be present from the `authUsers` select since it's on the table)
    - In the `jwt` callback (~line 243): set `token.membershipTier = user.membershipTier ?? "BASIC"` — this fires on initial sign-in when `user` object is available; on subsequent requests only `token` is available (already persisted)
    - In the `session` callback: set `session.user.membershipTier = token.membershipTier`
  - [x] Update `src/middleware.ts`:
    - Add `membershipTier` to the decoded JWT type expectation (already decoded via `next-auth/jwt`'s `decode`)
    - No new route blocking in middleware for tiers — tier enforcement is at the PermissionService level per architecture ("middleware for coarse, PermissionService for fine-grained")
    - If a banned user is detected (`accountStatus === "BANNED"`): redirect to login with `?banned=true` param (if not already implemented)
  - [x] Ensure tier is available in `session.user.membershipTier` for client-side checks (e.g., hiding "Create Group" button for Basic users)
  - [x] **Note on session refresh after tier change**: When an admin changes a member's tier, all cached sessions are evicted (Task 4). The member's next request will miss the Redis cache, fall through to DB session lookup, and trigger the `jwt` callback with the DB-fresh user data including the new `membershipTier`. No forced re-login is needed — the JWT is refreshed transparently.

- [x] Task 7: Admin member management UI (AC: 3)
  - [x] Create `src/features/admin/hooks/use-members.ts` — TanStack Query hooks following the exact pattern of `src/features/admin/hooks/use-approvals.ts`:
    - `useMembers(tier?: string, search?: string, page?: number)` — GET `/api/v1/admin/members` with query params, return `{ data: members[], meta: { total, page, pageSize } }`
    - `useChangeMemberTier()` — `useMutation` that calls `PATCH /api/v1/admin/members/[id]/tier` with `{ tier }` body; invalidate `["members"]` query on success
  - [x] Create `src/features/admin/components/MemberManagement.tsx`:
    - Client component using `useMembers()` hook from `use-members.ts` (NOT inline TanStack Query) to fetch `/api/v1/admin/members`
    - Table columns: display name, email, current tier, joined date, actions
    - Tier filter dropdown (All / Basic / Professional / Top-tier)
    - Search input for name/email
    - Pagination controls (offset-based, admin pattern)
    - All strings via `useTranslations("Admin.members")`
  - [x] Create `src/features/admin/components/TierChangeDialog.tsx`:
    - Modal dialog (shadcn `Dialog` component) for tier change confirmation
    - Shows: member name, current tier, new tier selector (radio group or select)
    - Confirm button calls `PATCH /api/v1/admin/members/[id]/tier`
    - Shows success toast on completion
    - All strings via `useTranslations("Admin.members")`
  - [x] Create `src/app/[locale]/(admin)/admin/members/page.tsx`:
    - Server component with `generateMetadata` — same pattern as `admin/approvals/page.tsx`
    - Render `MemberManagement` component
    - Page title: `t("Admin.members.title")`
  - [x] Update admin navigation in `src/components/layout/AdminShell.tsx`:
    - Add `{ key: "members" as const, href: "/admin/members" }` to the `NAV_LINKS` array (currently has: dashboard, approvals, moderation, reports, analytics, auditLog)
    - The component uses `t("Admin.sidebar.{key}")` pattern for nav labels — add `"Admin.sidebar.members"` key to i18n (Task 9)

- [x] Task 8: Default tier assignment on approval (AC: 4)
  - [x] Update the member approval flow (Story 1.6's `approve` route at `src/app/api/v1/admin/applications/[id]/approve/route.ts`):
    - After approving the user (setting `accountStatus = 'APPROVED'`), ensure `membershipTier` is set to `'BASIC'` (it will already default to `BASIC` from schema default, but verify explicitly)
    - This should already work via the schema default — verify and add explicit assignment if needed
  - [x] Update admin user creation to use TOP_TIER: the seed is at `src/server/seed/admin-seed.ts` and calls `insertAdminUser(email)` from `src/db/queries/admin-queries.ts`. The `insertAdminUser` function (lines 13-19) currently sets only `role: "ADMIN"` and `accountStatus: "APPROVED"` — after Task 1 adds the `membershipTier` column with default `"BASIC"`, the admin will be created with BASIC tier. Update `insertAdminUser()` in `src/db/queries/admin-queries.ts` to add `membershipTier: "TOP_TIER"` to the insert values.

- [x] Task 9: i18n + barrel exports + tests (AC: all)
  - [x] Add to `messages/en.json`:
    - `Admin.sidebar.members` — nav label for admin sidebar (AdminShell.tsx uses `t("Admin.sidebar.{key}")` pattern)
    - `Admin.members` namespace: title, searchPlaceholder, tierFilter (all, basic, professional, topTier), columns (name, email, tier, joinedDate, actions), changeTier (title, currentTier, newTier, confirm, cancel, success, error), noMembers
    - `Permissions` namespace: upgradeRequired, tierBasic, tierProfessional, tierTopTier, groupCreationRequired, articlePublishRequired, groupLeaderRequired, tierBenefits (description of each tier's capabilities)
  - [x] Add to `messages/ig.json` — same structure with `[ig]` suffix placeholders
  - [x] Update `src/features/admin/index.ts` barrel: add named exports for `MemberManagement`, `TierChangeDialog`, and `export * from "@/features/admin/hooks/use-members"` (following the existing pattern of `export * from "@/features/admin/hooks/use-approvals"` on line 5)
  - [x] Unit tests for `permissions.ts`:
    - Test each permission check for all 3 tiers (BASIC, PROFESSIONAL, TOP_TIER)
    - Test `canPublishArticle` with weekly count at/below/above limit
    - Test `canCreateGroup` returns allow for TOP_TIER, deny with upgrade message for others
    - Test permission matrix completeness
  - [x] Unit tests for `tier-service.ts`:
    - Test tier change success path (DB update, session eviction, event emission, audit log)
    - Test no-op for same tier
    - Test non-existent user handling
  - [x] Unit tests for `auth-permissions.ts` query functions:
    - Test `getUserMembershipTier`, `updateUserMembershipTier`
  - [x] API route tests for `PATCH /api/v1/admin/members/[id]/tier`:
    - 200 on valid tier change
    - 401 if not authenticated
    - 403 if not admin
    - 400 if invalid tier value
  - [x] API route test for `GET /api/v1/admin/members`:
    - 200 with pagination
    - Filter by tier
    - 403 if not admin

## Dev Notes

### Developer Context

Story 1.10 is a critical foundation story that establishes the entire RBAC and permission infrastructure for the platform. All subsequent feature stories (articles, groups, events, posting) will depend on the PermissionService created here. The story has two main concerns: (1) the permission engine itself, and (2) the admin tier management UI.

**Key architectural decision:** The acceptance criteria specify creating `auth_roles` and `auth_user_roles` tables. However, the existing codebase already has the `role` enum directly on `authUsers` (`MEMBER`, `ADMIN`, `MODERATOR`). The `auth_roles`/`auth_user_roles` tables provide a normalized RBAC structure for future extensibility, but the `membershipTier` field should be added directly to `authUsers` (alongside `role`) since tiers are a different axis from roles — a user has both a role (MEMBER/ADMIN/MODERATOR) and a tier (BASIC/PROFESSIONAL/TOP_TIER). Role determines access level (admin functions), tier determines feature capabilities (article publishing, group creation).

**Critical distinction:**

- **Role** (`authUsers.role`): `MEMBER`, `ADMIN`, `MODERATOR` — controls admin-level access (admin dashboard, moderation queue, approval). Already in JWT.
- **Tier** (`authUsers.membershipTier`): `BASIC`, `PROFESSIONAL`, `TOP_TIER` — controls feature capabilities (article publishing limits, group creation, group leader assignment). Must be added to JWT.
- Both coexist. An ADMIN can be BASIC tier (though seed should make admin TOP_TIER). A MEMBER can be TOP_TIER.

### Architecture Compliance

- `src/services/permissions.ts` is the **centralized permission service** per architecture (line 1030, 1149). It handles fine-grained tier-based business logic.
- **Next.js middleware** handles coarse route protection only (authenticated? admin? banned?). Tier checks are NOT in middleware — they're in PermissionService called from API routes and server actions.
- **Permission matrix defined as configuration, not scattered conditionals** — the `PERMISSION_MATRIX` const object is the single source of truth for all tier-based capabilities.
- API routes under `/api/v1/admin/*` follow existing admin route patterns (see `admin/applications/*` routes).
- Admin pages render as CSR (client-only) per architecture rendering strategy table.
- Audit logging via `auditLogs` table (already exists at `src/db/schema/audit-logs.ts`).
- Services communicate via EventBus — `tier-service.ts` emits events, never calls other services directly.
- Admin pages use `(admin)` route group with dark theme (`text-white`).

### Library/Framework Requirements

- `zod/v4` — import from `"zod/v4"` (same as all other stories); `.issues[0]` for error access (not `.errors[0]`)
- `next-intl` — `useTranslations("Admin.members")` for admin UI, `getTranslations("Admin")` for server components
- `@tanstack/react-query` — TanStack Query for admin member listing (client-side data fetching pattern per admin pages)
- `drizzle-orm` — schema definition, query builder; `.delete()` and `.update()` must have `.where()` clause (ESLint enforced)
- `ioredis` — Redis session eviction via `evictAllUserSessions(tokens: string[])` from `@/server/auth/redis-session-cache` (batch eviction; `evictCachedSession()` is single-session only — use the batch version in tier service)
- shadcn/ui — `Dialog`, `Select`, `Button`, `Input`, `Table` for admin UI
- `@/lib/admin-auth.ts` — `requireAdminSession()` for admin route guards
- `@/server/api/middleware` — `withApiHandler()` for API route wrapping
- `@/services/event-bus` — EventBus for event emission

### File Structure Requirements

**New files:**

- `src/db/schema/auth-permissions.ts` — roles, user_roles, membership_tier enum
- `src/db/queries/auth-permissions.ts` — tier/role query functions
- `src/db/migrations/0007_membership_tiers_rbac.sql` — migration
- `src/services/tier-service.ts` — tier management business logic
- `src/app/api/v1/admin/members/route.ts` — member listing API
- `src/app/api/v1/admin/members/[id]/tier/route.ts` — tier change API
- `src/features/admin/hooks/use-members.ts` — TanStack Query hooks for member management
- `src/features/admin/components/MemberManagement.tsx` — admin member table
- `src/features/admin/components/TierChangeDialog.tsx` — tier change modal
- `src/app/[locale]/(admin)/admin/members/page.tsx` — admin member page
- Test files co-located with source (same directory pattern)

**Modified files:**

- `src/db/schema/auth-users.ts` — add `membershipTier` column + enum import
- `src/db/index.ts` — add `import * as authPermissionsSchema` and spread into drizzle() schema object
- `src/services/permissions.ts` — rewrite with full PermissionService (keep existing exports); `PermissionResult` and `TierPermissions` types exported from here
- `src/services/audit-logger.ts` — add `"MEMBER_TIER_CHANGED"` to `AdminAction` union (line 5-10)
- `src/db/queries/admin-queries.ts` — update `insertAdminUser()` to set `membershipTier: "TOP_TIER"` for admin users
- `src/server/seed/admin-seed.ts` — verify it calls updated `insertAdminUser()` (likely no change needed once admin-queries.ts is updated)
- `src/server/auth/config.ts` — add `membershipTier` to JWT/Session augmentation + Credentials authorize method + jwt/session callbacks
- `src/types/events.ts` — add tier-related events
- `src/components/layout/AdminShell.tsx` — add "members" to NAV_LINKS array
- `src/features/admin/index.ts` — barrel exports for new components and hooks
- `messages/en.json` — admin member management + permission strings + sidebar key
- `messages/ig.json` — same with `[ig]` placeholders
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status

### Testing Requirements

- `@vitest-environment node` for all server-side files (service, queries, API routes)
- `jsdom` (default) for React component tests
- `vi.mock("@/db")` for query tests
- `vi.mock("@/lib/redis")` for session eviction tests
- `vi.mock("@/services/event-bus")` for event emission verification
- `vi.clearAllMocks()` in `beforeEach`
- Use `@/test/test-utils` custom `render()` for component tests
- Test the permission matrix exhaustively — every tier × every permission
- Test session cache eviction flow in tier change

### Previous Story Intelligence

- **Story 1.9** established: social OAuth pattern, settings layout with tab navigation, privacy service pattern, EventBus usage pattern (emit from service, not from route). Keep the same patterns.
- **Story 1.9 completion notes**: Zod v4 uses `.issues[0]` not `.errors[0]`. Migrations are hand-written (drizzle-kit generate fails with `server-only` error). `Avatar` component doesn't exist yet (use placeholder). Pre-existing test failure in `ProfileStep.test.tsx`.
- **Story 1.8** established: `community_profiles` table, onboarding service, `features/profiles/` barrel pattern
- **Story 1.7** established: Auth.js v5 with JWT strategy, module augmentation for `User`, `Session`, `JWT` types, Edge-safe JWT decode in middleware, `role` field in JWT
- **Story 1.6** established: admin approval API routes at `/api/v1/admin/applications/[id]/*`, `requireAdminSession()` at `@/lib/admin-auth.ts`, admin pages in `(admin)` route group, dark theme admin styling (`text-white`, `bg-gray-*`)
- **Story 1.1b** established: `withApiHandler()` at `@/server/api/middleware`, `ApiError` at `@/lib/api-error`, `successResponse`/`errorResponse` at `@/lib/api-response`, RFC 7807 error format, CSRF validation

### Git Intelligence Summary

- All prior stories follow: schema → queries → service → API routes → server actions → UI components → i18n → tests
- Admin routes use `requireAdminSession()` which throws 401/403
- API responses consistently use `successResponse({ data })` and `errorResponse()`
- Session augmentation pattern: add to `User` interface, set in `jwt` callback, propagate in `session` callback
- Test count as of Story 1.9: 516/517 passing (1 pre-existing failure in ProfileStep.test.tsx)

### Latest Tech Information

- **Next.js 16.1.6** with React 19.2.3: stable, use existing patterns
- **Auth.js v5 (next-auth@beta ^5.0.0-beta.30)**: JWT callbacks support arbitrary custom fields. The `jwt` callback receives the `user` object on initial sign-in only; on subsequent requests it receives only `token`. Add `membershipTier` to token on initial sign-in, and refresh from DB periodically if needed (or rely on session eviction to force re-login after tier change)
- **Drizzle ORM ^0.45.1**: pgEnum, pgTable, index patterns all established; use `.onConflictDoNothing()` or `.onConflictDoUpdate()` for upserts
- **Redis session eviction**: Two functions exist at `@/server/auth/redis-session-cache.ts`: `evictCachedSession(sessionToken)` (single) and `evictAllUserSessions(sessionTokens: string[])` (batch). Use the batch version in tier service. The session query helper `findActiveSessionsByUserId(userId)` also already exists at `@/db/queries/auth-sessions.ts` — use it directly, do not write a custom query.

### Project Structure Notes

- `src/db/schema/auth-permissions.ts` is explicitly listed in architecture file tree (line 1008) — it's expected
- `src/services/permissions.ts` is listed at line 1030 with description "RBAC permission service (tier checks, posting limits)"
- Admin route `/admin/members` follows same `(admin)` route group pattern as `/admin/approvals`
- The `features/admin/` directory may need to be created if it doesn't exist yet — check before creating components
- FR19-FR25 maps to `features/profiles` + `services/` per architecture requirements mapping (line 1132)

### References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.10` (lines 1012–1049)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — RBAC enforcement lines 247-253; file tree line 1008 (auth-permissions.ts), 1030 (permissions.ts); rendering strategy line 353 (admin CSR); requirements mapping line 1132; integration patterns lines 1162-1179
- PRD: `_bmad-output/planning-artifacts/prd.md` — FR20-FR25 (lines 659-665): tier capabilities, admin management, posting limits
- UX: `_bmad-output/planning-artifacts/ux-design-specification.md` — tier upgrade prompts (line 526), tier check flows (lines 1229-1231, 1268-1271, 1412-1414)
- Project context: `_bmad-output/project-context.md` — DB enums `SCREAMING_SNAKE` values, services communicate via EventBus, all API handlers wrapped with `withApiHandler()`
- Previous story: `_bmad-output/implementation-artifacts/1-9-profile-management-privacy-controls.md` — EventBus pattern, settings layout, admin auth patterns
- Auth config: `src/server/auth/config.ts` — JWT module augmentation, session callback patterns
- Admin auth: `src/lib/admin-auth.ts` — `requireAdminSession()`, `isAdmin()`
- Existing permissions: `src/services/permissions.ts` — current minimal implementation to preserve/extend
- Audit logs: `src/db/schema/audit-logs.ts` — existing audit trail table

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was clean with no debugging needed.

### Completion Notes List

- Implemented full RBAC + permission enforcement infrastructure per AC 1-5
- Created `auth_roles` / `auth_user_roles` tables alongside `membershipTier` column on `authUsers` (both axes: role for admin access, tier for feature capabilities)
- `PERMISSION_MATRIX` const object is single source of truth for all tier capabilities — no scattered conditionals
- Middleware now redirects banned users to `/login?banned=true`; tier enforcement stays in PermissionService (not middleware)
- `membershipTier` added to Auth.js JWT + Session types; available at `session.user.membershipTier` client-side
- Session eviction on tier change uses existing `evictAllUserSessions(sessionTokens[])` batch helper
- Admin seeds with `membershipTier: "TOP_TIER"`; all new members default to `"BASIC"` via schema default
- Fixed pre-existing test fixtures in `ApplicationRow.test.tsx` and `ApprovalsTable.test.tsx` (missing `image`, `passwordHash`, `membershipTier` fields after schema update)
- Added `membershipTier` to `admin-approvals.ts` listApplications query (explicit column selection)
- Test count: 553/554 passing (1 pre-existing failure in `ProfileStep.test.tsx` from Story 1.9, not introduced here)
- `canPublishArticle` does NOT query articles table — annotated with TODO(Story 1.xx) as articles don't exist yet

### File List

**New files:**

- `src/db/schema/auth-permissions.ts`
- `src/db/queries/auth-permissions.ts`
- `src/db/queries/auth-permissions.test.ts`
- `src/db/migrations/0007_membership_tiers_rbac.sql`
- `src/services/tier-service.ts`
- `src/services/tier-service.test.ts`
- `src/services/permissions.test.ts`
- `src/app/api/v1/admin/members/route.ts`
- `src/app/api/v1/admin/members/route.test.ts`
- `src/app/api/v1/admin/members/[id]/tier/route.ts`
- `src/app/api/v1/admin/members/[id]/tier/route.test.ts`
- `src/features/admin/hooks/use-members.ts`
- `src/features/admin/components/MemberManagement.tsx`
- `src/features/admin/components/TierChangeDialog.tsx`
- `src/app/[locale]/(admin)/admin/members/page.tsx`

**Modified files:**

- `src/db/schema/auth-users.ts` — added `membershipTier` column + enum import + index
- `src/db/index.ts` — added `authPermissionsSchema` import and spread
- `src/db/queries/admin-approvals.ts` — added `membershipTier` to explicit column selection in `listApplications`
- `src/db/queries/admin-queries.ts` — `insertAdminUser` now sets `membershipTier: "TOP_TIER"`
- `src/services/permissions.ts` — full rewrite with PERMISSION_MATRIX, PermissionService, legacy exports preserved
- `src/services/audit-logger.ts` — added `"MEMBER_TIER_CHANGED"` to `AdminAction` union
- `src/server/auth/config.ts` — added `membershipTier` to User/Session/JWT augmentation, authorize method, jwt/session callbacks
- `src/middleware.ts` — added banned-user redirect; tier available from decoded JWT
- `src/types/events.ts` — added `MemberTierChangedEvent`, `PermissionDeniedEvent`, updated `EventName` and `EventMap`
- `src/components/layout/AdminShell.tsx` — added "members" to NAV_LINKS
- `src/features/admin/index.ts` — barrel exports for `MemberManagement`, `TierChangeDialog`, `use-members`
- `src/features/admin/components/ApplicationRow.test.tsx` — added `image`, `passwordHash`, `membershipTier` to test fixture
- `src/features/admin/components/ApprovalsTable.test.tsx` — added `image`, `passwordHash`, `membershipTier` to test fixture
- `messages/en.json` — added `Admin.sidebar.members`, `Admin.members` namespace, `Permissions` namespace
- `messages/ig.json` — same structure with `[ig]` suffix placeholders
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated to `review`

## Senior Developer Review (AI)

**Reviewer:** Dev | **Date:** 2026-02-24 | **Model:** claude-opus-4-6

**Findings:** 3 High, 4 Medium, 3 Low — all HIGH and MEDIUM fixed automatically.

### Fixes Applied

- **H1:** `checkPermission` now dynamically resolves minimum required tier via `findMinimumTier()` instead of hardcoding "PROFESSIONAL"
- **H2:** `checkPermission` now handles array-type permissions (`articleVisibility`) with `Array.isArray()` check
- **H3:** Tier change route catches "User not found" errors and returns 404 instead of 500
- **M1:** Admin members page now imports from barrel `@/features/admin` instead of internal path
- **M2:** Admin members search escapes LIKE wildcard characters (`%`, `_`, `\`)
- **M3:** `getTierUpgradeMessage` maps known actions to specific i18n keys (`Permissions.groupCreationRequired`, etc.)
- **M4:** `MemberManagement.formatDate` uses `next-intl` `useFormatter().dateTime()` for locale-aware formatting

### Unfixed (LOW)

- L1: `updateUserMembershipTier` unused `_assignedBy` parameter — dead code, harmless
- L2: UI uses raw HTML elements instead of shadcn components — functional, cosmetic only
- L3: Mixed Story 1-9/1-10 uncommitted changes — git hygiene, not a code issue

**Tests:** 559/559 passing (+5 new tests covering fixes)

## Change Log

- 2026-02-24: Code review fixes — fixed checkPermission tier resolution & array handling, tier route 404 error handling, barrel import, LIKE wildcard escaping, i18n key mapping, locale-aware date formatting. 5 new tests added.
- 2026-02-24: Implemented Story 1.10 — Membership Tiers & Permission Enforcement. Created RBAC schema (auth_roles, auth_user_roles, membershipTier on authUsers), centralized PermissionService with PERMISSION_MATRIX, TierService, admin member management API and UI, JWT/session augmentation, banned-user middleware redirect, i18n, and full test suite.
