# Story 11.8: Member Points Investigation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to search for a member and see their full points profile — balance, badge, ledger history, summary stats, and throttle history — on a single page,
so that I can investigate engagement anomalies and make informed moderation decisions.

## Acceptance Criteria

1. Given an admin navigates to `/admin/members/points`, when the page loads, then a search bar allows finding members by display name or email; results appear as a dropdown with name + email.
2. Given an admin selects a member (or arrives via `?userId={id}` from the leaderboard), when the profile loads, then a summary card shows: display name, email, current badge (type + assigned date or "No badge"), total points, points this week, and points this month.
3. Given the member profile is loaded, when the ledger history section renders, then a paginated table shows all points ledger entries: date, points, reason, source type, source ID, multiplier. Supports activity type filter.
4. Given the member profile is loaded, when the throttle history section renders, then a table shows all `audit_logs` entries where `action = 'points_throttled'` and `target_user_id = userId`, displaying: date, throttle reason (from details JSONB), event type, and the actor who triggered it.
5. Given an admin views a member with no points history, when the page renders, then empty states show "No points earned yet" and "No throttle events" respectively.

## Tasks / Subtasks

- [x] Task 1: Add investigation-specific queries (AC: 1–5)
  - [x] 1.1 Add `getAdminUserPointsProfile(userId)` to `src/db/queries/points.ts`. Uses `db.execute(sql\`...\`)`: JOINs `auth_users`(email, createdAt) +`community_profiles`(displayName) + LEFT JOIN`community_user_badges`(badgeType, assignedAt). Returns`{ userId, displayName, email, memberSince, badgeType, badgeAssignedAt }`— do NOT add a`totalPoints`subquery here;`summary.total`from the separately-called`getPointsSummaryStats`already covers it and avoids duplicate computation. Filter`auth_users.deleted_at IS NULL` (soft-delete enforcement pattern from Story 11.7).
  - [x] 1.2 Add `getUserThrottleHistory(userId, { page, limit })` to `src/db/queries/points.ts`. Queries `audit_logs` WHERE `action = 'points_throttled'` AND `target_user_id = userId`. To get the actor's display name use `LEFT JOIN community_profiles cp ON cp.user_id = al.actor_id` and select `cp.display_name AS triggered_by` — do NOT use `auth_users.name` (that is the auth-level name field, not the community display name). Important: in `points_throttled` logs, `actor_id` is the reactor member (the user who liked the post that triggered the throttle), NOT an admin. Returns paginated `{ entries: Array<{ date, reason, eventType, eventId, triggeredBy }>, total }`. Ordered by `created_at` DESC. Use window function `COUNT(*) OVER()` for total (same pattern as `getThrottledUsersReport`).
  - [x] 1.3 Add `searchMembersForAdmin(query, limit)` to `src/db/queries/points.ts`. ILIKE search on `auth_users.email` OR `community_profiles.display_name`. Returns `Array<{ userId, displayName, email }>`. Limit default 10. Filter `auth_users.deleted_at IS NULL`. Escape ILIKE wildcards (same pattern as `searchMembersByName` in community-profiles.ts).
  - [x] 1.4 Write tests for all new queries (8–10 tests): empty results, single result, pagination, soft-deleted user exclusion, ILIKE escaping, throttle history ordering.

- [x] Task 2: Admin API routes (AC: 1–5)
  - [x] 2.1 Create `src/app/api/v1/admin/members/[userId]/points/route.ts` with `GET` handler: `withApiHandler()` + `requireAdminSession()`. Extract `userId` from URL path using `.pathname.split("/").at(-2)` (the `[userId]` segment in `/members/[userId]/points`). Validate UUID format with Zod (`z.string().uuid()`). Call `getAdminUserPointsProfile(userId)`, `getPointsSummaryStats(userId)`, `getPointsLedgerHistory(userId, opts)`, `getUserThrottleHistory(userId, opts)` in parallel via `Promise.all()`. Query params schema (all optional): `page` (default 1), `limit` (default 20, max 100), `activityType` (enum or omit), `throttlePage` (default 1), `throttleLimit` (default 20, max 100). Return `successResponse({ profile, summary, ledger, throttleHistory })`. Return 404 if `profile` is null (`getAdminUserPointsProfile` returns null only when the user doesn't exist or is soft-deleted). In the UI, `summary.total` is the source for "total points" in the profile card — `profile` itself does not carry a `totalPoints` field.
  - [x] 2.2 Create `src/app/api/v1/admin/members/search/route.ts` with `GET` handler: `withApiHandler()` + `requireAdminSession()`. Accept `q` query param. Validate min 2 chars. Call `searchMembersForAdmin(q, 10)`. Return `successResponse({ results })`.
  - [x] 2.3 Write route tests (8–10 tests): 401 unauthenticated, 403 non-admin, UUID validation error, 404 unknown user, success with all sections, search min-length validation, search success with results, search empty results.

- [x] Task 3: Admin UI page + component (AC: 1–5)
  - [x] 3.1 Create `src/features/admin/components/MemberPointsInvestigator.tsx` — "use client" component with:
    1. **Search bar**: Text input with debounced search (300ms). Fetch from `GET /api/v1/admin/members/search?q=...`. Dropdown shows matching members (name + email). Selecting a member updates URL search params (`?userId=...`).
    2. **Profile card**: Badge icon (reuse `VerificationBadge` from Story 8.3 if available), display name, email, member since date, total/week/month points.
    3. **Ledger history**: Paginated table with activity type filter dropdown (like_received, event_attended, article_published — all with i18n labels). Columns: date, points, reason, source type, source ID, multiplier. Use TanStack Query (`useQuery`) with `credentials: "include"`.
    4. **Throttle history**: Paginated table. Columns: date, reason, event type, triggered by. Same TanStack Query pattern. Use a separate `throttlePage` state variable — ledger pagination and throttle pagination are independent; do NOT share one page state between the two tables.
    5. **Empty states**: "No points earned yet" / "No throttle events" when sections have no data.
    6. **Loading/error states**: Skeleton loading, error message display (lesson from 11.7 review F3).
  - [x] 3.2 Create `src/app/[locale]/(admin)/admin/members/points/page.tsx` — Server component. Use `getTranslations("Admin")`. Render `AdminPageHeader` with breadcrumbs `[Dashboard → Members → Points Investigation]`. For the "Members" breadcrumb label use the existing `t("sidebar.members")` key — do NOT create a new key. For the page title use `t("memberPoints.title")`. Render `MemberPointsInvestigator`. Pattern: identical to `leaderboard/page.tsx`. Note: `/admin/members/page.tsx` already exists with full MemberManagement functionality — kept as-is (sidebar "Members" link already works, no 404 risk).
  - [x] 3.3 Add i18n keys under `Admin.memberPoints.*` in both `messages/en.json` AND `messages/ig.json`: title, searchPlaceholder, noResults, profileCard, totalPoints, thisWeek, thisMonth, badge, noBadge, memberSince, ledgerHistory, noPointsYet, throttleHistory, noThrottleEvents, date, points, reason, sourceType, sourceId, multiplier, eventType, triggeredBy, throttleReason, loading, error, likeReceived, eventAttended, articlePublished. Note: use `triggeredBy` (not `actorName`) for the throttle history column — the actor is the member who triggered the throttle, not an admin, so "Triggered By" is clearer to an admin reader. The "Members" breadcrumb reuses the existing `Admin.sidebar.members` key — no new key needed for it.
  - [x] 3.4 Write component tests (9–12 tests): search input triggers debounced search, member selection loads profile, renders all sections with data, handles empty states for both ledger and throttle, URL param `?userId=` pre-loads userId on mount, loading state, error state, activity type filter updates query, pagination controls. **Test setup notes**: (1) `useSearchParams` comes from `next/navigation` — mock it with `vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("userId=abc"), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/members/points" }))`. (2) `VerificationBadge` renders a shadcn/ui `<Tooltip>` — wrap the rendered component with `<TooltipProvider>` from `@/components/ui/tooltip` or tests will throw a React context error. (3) `useRouter` for `router.push` to update `?userId=` should be imported from `@/i18n/navigation` in the component itself (same pattern as `LeaderboardTable.tsx`) but tested via the `next/navigation` mock above.

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [ ] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [ ] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [ ] All tests passing (run `bun test` locally before review)
- [ ] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts`
- [ ] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)`
- [ ] New member statuses/roles audited across ALL entry-point functions for permission gaps
- [ ] All admin routes wrapped with `withApiHandler()` + `requireAdminSession()`, return RFC 7807 errors
- [ ] `userId` extracted from URL path using `.pathname.split("/")` pattern (not Next.js route params)
- [ ] Reuses existing queries (`getPointsSummaryStats`, `getPointsLedgerHistory`) — no duplication
- [ ] Throttle history reads from `audit_logs` where `action = 'points_throttled'`
- [ ] Search supports both display name and email (ILIKE) with wildcard escaping
- [ ] URL `?userId=` param works for navigation from leaderboard (Story 11.7 row click → `/admin/members/points?userId={id}`)
- [ ] No new migrations needed — all tables pre-exist
- [ ] Co-located tests for queries, routes, and components
- [ ] Activity type filter dropdown labels use i18n (lesson from 11.7 review F2)
- [ ] Error state displays distinct message from empty state (lesson from 11.7 review F3)
- [ ] Throttle history "Triggered By" column uses `triggeredBy` i18n key (not `actorName`); query returns `triggeredBy` field from `community_profiles.display_name` of the actor
- [ ] `/admin/members/page.tsx` redirect created so sidebar "Members" nav link doesn't 404
- [ ] `VerificationBadge` imported from `@/components/shared/VerificationBadge` (not from features/gamification)
- [ ] Component tests wrap render in `<TooltipProvider>` for `VerificationBadge` tooltip support

## Dev Notes

### Critical Project Patterns

- **`withApiHandler` dynamic params**: Extract from URL path — `new URL(req.url).pathname.split("/").at(-2)` for `[userId]` in `/members/[userId]/points`. `withApiHandler` does NOT pass Next.js route params.
- **Zod**: Import from `"zod/v4"`. Validation errors: `throw new ApiError({ title: "Validation error", detail: parsed.error.issues[0]?.message ?? "Invalid query params", status: 400 })`.
- **Admin routes**: `requireAdminSession()` from `@/lib/admin-auth.ts` — returns `{ adminId }`, throws 401/403.
- **API wrapping**: `withApiHandler()` from `@/server/api/middleware`.
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`.
- **Tests**: Co-located with source (e.g., `route.test.ts` next to `route.ts`). `@vitest-environment node` pragma for server files.
- **i18n**: All user-facing strings via `useTranslations()`. No hardcoded strings. Activity type labels MUST be localized.
- **`db.execute()` mock format**: Returns raw array (e.g., `[row1, row2]`), NOT `{ rows: [...] }`. Use `Array.from(rows)` and `rows.map()` directly on resolved value.
- **Raw SQL numeric columns**: Parse with `parseInt(row.field, 10)` (PostgreSQL returns numeric types as strings via `db.execute`).
- **Soft-delete enforcement**: INNER JOIN `auth_users` with `au.deleted_at IS NULL` to exclude soft-deleted/anonymized users (critical — established in Story 11.7).
- **TanStack Query**: Use `useQuery` with query keys including all filter/pagination params. Fetch calls include `credentials: "include"` for cookie-based admin auth.
- **`useSearchParams`**: Read `?userId=` via `useSearchParams()` from `next/navigation` (not from `@/i18n/navigation` — that package does not re-export `useSearchParams`). To update the URL param when a member is selected, call `router.push(\`/admin/members/points?userId=\${userId}\`)`using`useRouter`from`@/i18n/navigation`(same as`LeaderboardTable`).
- **`TooltipProvider` in tests**: `VerificationBadge` uses shadcn/ui `<Tooltip>` which requires a `<TooltipProvider>` ancestor. Wrap the root render in component tests with `<TooltipProvider>` from `@/components/ui/tooltip`, otherwise tests throw a React context error.
- **Admin page pattern**: Server component with `getTranslations("Admin")` + `AdminPageHeader` (title + breadcrumbs) + client component in `<div className="p-6">`.
- **`successResponse()` status arg**: 3rd arg for non-200: `successResponse(data, undefined, 201)`.

### Existing Code to Reuse

| Query/Component                        | File                                                 | Purpose                                                                                                    |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getPointsSummaryStats(userId)`        | `src/db/queries/points.ts`                           | `{ total, thisWeek, thisMonth }`                                                                           |
| `getPointsLedgerHistory(userId, opts)` | `src/db/queries/points.ts`                           | Paginated ledger with activityType filter                                                                  |
| `getUserBadge(userId)`                 | `src/db/queries/badges.ts`                           | `{ badgeType, assignedAt } \| null`                                                                        |
| `AdminPageHeader`                      | `src/components/layout/AdminShell.tsx`               | Page header + breadcrumbs                                                                                  |
| `VerificationBadge`                    | `src/components/shared/VerificationBadge.tsx`        | Badge icon display — import as `import { VerificationBadge } from "@/components/shared/VerificationBadge"` |
| `searchMembersByName` (reference)      | `src/db/queries/community-profiles.ts`               | ILIKE pattern with wildcard escaping                                                                       |
| `getThrottledUsersReport` (reference)  | `src/db/queries/points.ts`                           | Window function + audit_logs JOIN pattern                                                                  |
| `LeaderboardTable` (reference)         | `src/features/admin/components/LeaderboardTable.tsx` | TanStack Query + paginated table + filters pattern                                                         |

### Key Schema References

- **`platform_points_ledger`**: id, userId, points, reason, sourceType (like_received/event_attended/article_published), sourceId, multiplierApplied, createdAt
- **`community_user_badges`**: userId (PK), badgeType (blue/red/purple), assignedBy, assignedAt
- **`audit_logs`**: id, actorId, action, targetUserId, targetType, traceId, details (JSONB), ipAddress, createdAt
- **`auth_users`**: id, email, name, deletedAt (soft-delete)
- **`community_profiles`**: userId, displayName, photoUrl, deletedAt

### Project Structure Notes

- Admin pages: `src/app/[locale]/(admin)/admin/` — consistent pattern across all admin stories
- Admin components: `src/features/admin/components/` — "use client" with TanStack Query
- Admin API routes: `src/app/api/v1/admin/` — all use `withApiHandler()` + `requireAdminSession()`
- No new DB migration needed — all tables exist from previous stories
- No new eventbus-bridge imports needed — this is a read-only investigation page

### Story 11.7 Intelligence (Previous Story Learnings)

- **LeaderboardTable row click**: Already navigates to `/admin/members/points?userId={id}` — this story is the destination page.
- **Review F1 (ISO date validation)**: Use `z.string().date().optional()` for date params — don't accept arbitrary strings.
- **Review F2 (activity type i18n)**: All filter dropdown labels must use `t()` — raw enum values violate i18n policy.
- **Review F3 (error vs empty state)**: Display distinct messages for API errors vs. empty results — don't reuse "no results" for errors.
- **Raw SQL pattern**: `db.execute(sql\`...\`)`with`Array.from(rows)`— numeric columns need`parseInt()`.
- **Badge type cast**: `row.badge_type as BadgeType | null` from `@/db/schema/community-badges`.
- **Window function for pagination total**: `COUNT(*) OVER() AS total_count` — avoids separate COUNT query.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 8 retrospective identified Stories 11.6–11.8 as missing admin tooling]
- [Source: src/db/queries/points.ts — getUserPointsTotal, getPointsLedgerHistory, getPointsSummaryStats, getThrottledUsersReport, logPointsThrottle]
- [Source: src/db/queries/badges.ts — getUserBadge]
- [Source: src/db/queries/community-profiles.ts — searchMembersByName ILIKE pattern]
- [Source: src/db/queries/audit-logs.ts — listAuditLogs filter pattern]
- [Source: src/features/admin/components/LeaderboardTable.tsx — TanStack Query + paginated table + filter pattern]
- [Source: src/app/api/v1/admin/leaderboard/route.ts — Zod validation + admin route pattern]
- [Source: src/lib/admin-auth.ts — requireAdminSession()]
- [Source: src/components/layout/AdminShell.tsx — AdminPageHeader + breadcrumbs]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-03-09)

### Debug Log References

None — implementation proceeded without errors after UUID fix in route test (Zod v4 requires valid RFC 4122 UUID version bits; changed test UUID from `00000000-...` to `f47ac10b-58cc-4372-a567-0e02b2c3d479`).

### Completion Notes List

- Implemented all 3 Tasks (9 subtasks) satisfying all 5 ACs.
- `getAdminUserPointsProfile`: raw SQL JOIN auth_users + community_profiles + community_user_badges, soft-delete enforced.
- `getUserThrottleHistory`: paginated audit_logs query for points_throttled action, window function for total count, LEFT JOIN community_profiles for triggeredBy display name.
- `searchMembersForAdmin`: ILIKE search on email OR display_name with wildcard escaping, soft-delete enforced.
- Route `GET /api/v1/admin/members/[userId]/points`: parallel Promise.all of 4 queries, UUID validation, 404 on soft-deleted/missing user.
- Route `GET /api/v1/admin/members/search`: min-2-char q validation, returns top 10 results.
- `MemberPointsInvestigator.tsx`: debounced search (300ms), dropdown with member selection, profile card, independent ledger+throttle paginated tables, activity type filter (i18n labels), loading skeleton, distinct error state (separate from empty state per 11.7 review F3), URL `?userId=` param on mount.
- `/admin/members/points/page.tsx`: Server component with AdminPageHeader + breadcrumbs.
- Note: `/admin/members/page.tsx` already existed with MemberManagement functionality — kept as-is (sidebar link already works, no 404 risk).
- i18n keys added to both en.json and ig.json under `Admin.memberPoints.*` (32 keys).
- Test count: +50 new tests (10 query + 8 [userId]/points route + 7 search route + 12 component; 3 others from existing test reshuffling).
- All 4161 tests pass + 10 skipped + 19 pre-existing failures (unchanged from Story 11.7 baseline).

### File List

- `src/db/queries/points.ts` (extend — add getAdminUserPointsProfile, getUserThrottleHistory, searchMembersForAdmin)
- `src/db/queries/points.test.ts` (extend — add tests for new queries)
- `src/app/api/v1/admin/members/[userId]/points/route.ts` (new)
- `src/app/api/v1/admin/members/[userId]/points/route.test.ts` (new)
- `src/app/api/v1/admin/members/search/route.ts` (new)
- `src/app/api/v1/admin/members/search/route.test.ts` (new)
- `src/app/[locale]/(admin)/admin/members/page.tsx` (existing — kept as-is, renders MemberManagement)
- `src/app/[locale]/(admin)/admin/members/points/page.tsx` (new)
- `src/features/admin/components/MemberPointsInvestigator.tsx` (new)
- `src/features/admin/components/MemberPointsInvestigator.test.tsx` (new)
- `messages/en.json` (extend — add Admin.memberPoints.\* keys)
- `messages/ig.json` (extend — add Admin.memberPoints.\* keys)

## Senior Developer Review (AI)

**Reviewer:** Dev on 2026-03-09
**Model:** claude-opus-4-6
**Outcome:** Approved with fixes applied

### Findings (5 fixed, 1 low deferred)

- **F1 (HIGH — FIXED):** Ledger table rendered raw `entry.sourceType` enum values (`like_received`) instead of i18n-translated labels. Added `SOURCE_TYPE_I18N` mapping and `t()` call in table cell. Added regression test.
- **F2 (MEDIUM — FIXED):** File List falsely claimed `members/page.tsx` was "new — redirect to ./points" but it's the pre-existing MemberManagement page. Updated File List to "(existing — kept as-is)".
- **F3 (MEDIUM — FIXED):** `t("profileCard")` used as both section heading and sub-label, creating duplicate "Member Profile" text. Added new `name` i18n key for the sub-label in both en.json and ig.json.
- **F4 (MEDIUM — FIXED):** Search dropdown had no click-outside dismiss handler. Added `useRef` + `mousedown` event listener to close dropdown on outside click.
- **F5 (MEDIUM — FIXED):** No test for member selection action (clicking search result). Added test verifying `router.push` called with correct URL after clicking a result.
- **F6 (LOW — DEFERRED):** Date formatting uses `toLocaleString()`/`toLocaleDateString()` without explicit locale parameter. Acceptable for admin-only page.

### Review Fix Test Count: +2 tests (1 sourceType i18n regression, 1 member selection action)
