# Story 11.7: Leaderboard Admin View

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to view a leaderboard of top points earners with filters and a flagged-users report for gaming patterns,
so that I can monitor engagement health and investigate suspicious point accumulation.

## Acceptance Criteria

1. Given an admin navigates to `/admin/leaderboard`, when the page loads, then a sortable table displays the top points earners showing rank, display name, email, total points, current badge, and member since date; default sort is by total points descending.
2. Given an admin uses the filters, when they select a date range, then the leaderboard recalculates totals based on points earned within that range only; when they select an activity type filter, then only points from that source type are aggregated.
3. Given an admin views the leaderboard, when pagination controls are used, then results are paginated (default 25 per page) with total count displayed.
4. Given the gaming detection section exists, when the page loads, then a separate "Flagged Users" panel shows users who have been throttled (from `audit_logs` where `action = 'points_throttled'`), grouped by user, showing throttle count, most recent throttle date, and throttle reasons.
5. Given an admin clicks a user row, when the action fires, then the admin is navigated to the member points investigation page (`/admin/members/points?userId={id}`) from Story 11.8.

## Tasks / Subtasks

- [x] Task 1: Add leaderboard and throttle report queries (AC: #1, #2, #3, #4)
  - [x] 1.1: Add `getTopPointsEarners({ page, limit, dateFrom?, dateTo?, activityType? })` to `src/db/queries/points.ts`. Uses `db.execute(sql\`...\`)`with raw SQL following`getPointsSummaryStats`pattern: aggregates`SUM(points)`from`platform_points_ledger`grouped by`user_id`, JOINs `auth_users`(email, created_at) and`community_profiles`(display_name), LEFT JOINs`community_user_badges`(badge_type). **CRITICAL: Raw SQL bypasses Drizzle global filters — must include`WHERE au.deleted_at IS NULL`to exclude soft-deleted/anonymized users.** Applies optional`WHERE ppl.created_at >= ${dateFrom}::timestamptz AND ppl.created_at <= ${dateTo}::timestamptz`and`WHERE ppl.source_type = ${activityType}`filters. **Validate`dateFrom <= dateTo`in the query function — return empty results if invalid.** Returns`{ users: Array<{ userId, displayName, email, totalPoints, badgeType, memberSince }>, total: number }`. Use `COUNT(\*) OVER()`window function for total count without a second query. Parse integer strings with`parseInt(row.total_points, 10)`. **Badge type cast**: `badge_type`from raw SQL is`string | null`— cast to`BadgeType | null`(from`@/db/schema/community-badges`) when building the return object: `badgeType: row.badge_type as BadgeType | null`. Expected raw row shape from `db.execute()`: `{ user_id: string, display_name: string | null, email: string, total_points: string, badge_type: string | null, member_since: string, total_count: string }`.
  - [x] 1.2: Add `getThrottledUsersReport({ page, limit })` to `src/db/queries/points.ts`. Uses `db.execute(sql\`...\`)`with raw SQL: queries`audit*logs al`WHERE`al.action = 'points_throttled'`AND`al.target_user_id IS NOT NULL`(target_user_id is nullable — exclude NULL rows before GROUP BY), INNER JOINs`auth_users au ON au.id = al.target_user_id AND au.deleted_at IS NULL`(excludes soft-deleted/anonymized users — same requirement as`getTopPointsEarners`), LEFT JOINs `community_profiles cp ON cp.user_id = al.target_user_id`for display name. Groups by`al.target_user_id, cp.display_name`. Returns `userId`, `displayName`, `throttleCount` (`COUNT(*)`), `lastThrottledAt` (`MAX(al.created*at)`), `reasons`(use`array_to_json(array_agg(DISTINCT al.details->>'reason') FILTER (WHERE al.details->>'reason' IS NOT NULL))`— the FILTER clause prevents NULL entries in the array when details.reason is missing). Ordered by throttle count DESC. Paginated with`LIMIT`/`OFFSET`+`COUNT(*) OVER()`for total. The`pg`driver auto-parses`array_to_json()`output as a JS array — no`JSON.parse()`needed. Expected raw row shape:`{ user_id: string, display_name: string | null, throttle_count: string, last_throttled_at: string, reasons: string[], total_count: string }`.
  - [x] 1.3: Write tests for both queries (11–13 tests: empty results, single result, multiple results with pagination, date range filter, activity type filter, combined filters, **soft-deleted user excluded from leaderboard**, **soft-deleted user excluded from throttle report**, **throttle report excludes rows where target_user_id IS NULL**, throttle report grouping, throttle report pagination, **dateFrom > dateTo returns empty results**).

- [x] Task 2: Admin API route (AC: #1, #2, #3, #4)
  - [x] 2.1: Create `src/app/api/v1/admin/leaderboard/route.ts` with `GET` handler. Wrap with `withApiHandler()`. Call `requireAdminSession()`. Accept query params: `page` (default 1), `limit` (default 25, max 100), `dateFrom` (optional ISO string), `dateTo` (optional ISO string), `activityType` (optional, one of: `like_received`, `event_attended`, `article_published`), `view` (optional, `leaderboard` | `flagged`, default `leaderboard`). Validate with Zod (`import { z } from "zod/v4"`). **Validate `dateFrom <= dateTo` when both provided — throw `ApiError` with 400 if invalid.** When `view=leaderboard`, call `getTopPointsEarners()`. When `view=flagged`, call `getThrottledUsersReport()`. Return `successResponse({ data, pagination: { page, limit, total } })`.
  - [x] 2.2: Write route tests (7–9 tests): 401 unauthenticated, 403 non-admin, leaderboard success with default params, leaderboard with filters, flagged view success, invalid activityType validation, **dateFrom > dateTo returns 400**, pagination params forwarded.

- [x] Task 3: Admin UI page + component (AC: #1, #2, #3, #4, #5)
  - [x] 3.1: Create `src/features/admin/components/LeaderboardTable.tsx` — `"use client"` component with:
    1. **Tab toggle**: "Leaderboard" / "Flagged Users" tabs — use a `view` state variable toggling the query `view` param.
    2. **Leaderboard tab**: Filters bar (date input fields for dateFrom/dateTo, `<select>` for activityType with "All Types" default), sortable table (rank, display name, email, total points, badge, member since), pagination (page/limit with total count). **Badge column**: Reuse `VerificationBadge` component from `src/components/shared/VerificationBadge.tsx` — `import { VerificationBadge } from "@/components/shared/VerificationBadge"`. Pass `badgeType` prop typed as `BadgeType | null` (from `@/db/schema/community-badges`). Do NOT create a new badge renderer. **Row click UX**: Rows must have `cursor-pointer`, hover highlight (`hover:bg-muted`), and `role="link"` for accessibility. Clicking navigates to `/admin/members/points?userId={id}` using `useRouter()`. **Note: Story 11.8 page doesn't exist yet — 404 is expected until 11.8 ships. Just wire the navigation.**
    3. **Flagged Users tab**: Table showing user display name, throttle count, last throttled date, throttle reasons (comma-joined). Same row click UX (cursor-pointer, hover, role="link"). Clicking navigates to investigation page. **Empty state**: Show reassuring message like "No gaming patterns detected" (i18n key `Admin.leaderboard.noFlaggedUsers`).
    4. Use `useQuery` from `@tanstack/react-query` for data fetching. Query key includes all filter/pagination/view params. All `fetch` calls inside `queryFn` must include `credentials: "include"` (required for cookie-based admin auth — follow `GamificationRulesManager.tsx` pattern). Use `useTranslations("Admin.leaderboard")` in the component for leaderboard-specific strings (e.g., `t("noResults")`). The page.tsx server component uses `getTranslations("Admin")` and accesses `t("leaderboard.title")` / `t("sidebar.dashboard")` for the page header and breadcrumbs.
  - [x] 3.2: Create `src/app/[locale]/(admin)/admin/leaderboard/page.tsx` — server component following `gamification/page.tsx` pattern: `getTranslations("Admin")`, `AdminPageHeader` with breadcrumbs, renders `<LeaderboardTable />`.
  - [x] 3.3: Add i18n keys under `Admin.leaderboard.*` in both `messages/en.json` and `messages/ig.json`:
    - `title`, `leaderboardTab`, `flaggedUsersTab`
    - `rank`, `displayName`, `email`, `totalPoints`, `badge`, `memberSince`
    - `throttleCount`, `lastThrottled`, `reasons`
    - `noResults`, `noFlaggedUsers`, `filters`, `dateFrom`, `dateTo`, `activityType`, `allTypes`
    - `page`, `of`, `showing`, `perPage`
  - [x] 3.4: Write component tests (9–11 tests): renders leaderboard tab by default, displays user rows with correct data, **renders VerificationBadge for users with badges**, switches to flagged users tab, applies date range filter, applies activity type filter, handles empty leaderboard results, **handles empty flagged users with reassuring message**, **loading state renders skeleton/spinner**, pagination controls, row click navigates to investigation page with correct userId.

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — N/A (no eventbus-bridge changes; read-only story)
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — N/A (all 200 responses)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps — N/A (read-only story)
- [x] Admin route wrapped with `withApiHandler()` + `requireAdminSession()`, returns RFC 7807 errors
- [x] Leaderboard query aggregates from `platform_points_ledger` (DB source of truth), NOT Redis ZSET
- [x] Flagged users report reads from `audit_logs` where `action = 'points_throttled'`
- [x] Row clicks navigate to `/admin/members/points?userId={id}` (Story 11.8 page)
- [x] TanStack Query `useQuery` for data fetching (not raw `fetch` in `useEffect`)
- [x] No new migrations needed — all tables already exist
- [x] Co-located tests for queries, routes, and components

## Dev Notes

### Critical Project Patterns

- **Zod**: Import from `"zod/v4"`. Validation errors in routes must use `throw new ApiError(...)` (NOT `return errorResponse(string, 400)`).
- **Admin routes**: `requireAdminSession()` from `@/lib/admin-auth.ts`. Returns session with `session.userId`.
- **API wrapping**: `withApiHandler()` from `@/server/api/middleware`.
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`.
- **`successResponse` status**: 3rd arg — `successResponse(data, meta?, status)`.
- **Tests**: Co-located with source (not `__tests__` dir). `@vitest-environment node` pragma for server files.
- **i18n**: All user-facing strings via `useTranslations()`. No hardcoded strings.
- **`db.execute()` mock format**: Returns raw array (e.g. `[row1, row2]`), NOT `{ rows: [...] }`. Source uses `Array.from(rows)` and `rows.map()`.
- **Raw SQL pattern**: Follow `getPointsSummaryStats()` at `src/db/queries/points.ts:163` — `db.execute(sql\`...\`)`with`Array.from(rows)`and`parseInt()` for aggregated numeric columns.
- **No new migrations**: All tables exist — `platform_points_ledger` (0035), `audit_logs` (0042+0046), `community_user_badges` (8.3), `auth_users`, `community_profiles`.
- **No eventbus-bridge changes**: This story only reads data — no event handlers needed, no new query imports in bridge.
- **Admin page pattern**: Follow `src/app/[locale]/(admin)/admin/gamification/page.tsx` — `getTranslations("Admin")` + `AdminPageHeader` from `@/components/layout/AdminShell` + breadcrumbs.

### Existing Code References

| What                        | Where                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Points ledger schema        | `src/db/schema/platform-points.ts` — `platformPointsLedger`, `platformPointsSourceTypeEnum` (`like_received`, `event_attended`, `article_published`)                                                                                                                |
| Badge schema                | `src/db/schema/community-badges.ts` — `communityUserBadges` (PK: userId, cols: badgeType, assignedBy, assignedAt)                                                                                                                                                   |
| Points queries              | `src/db/queries/points.ts` — `getUserPointsTotal`, `getPointsLedgerHistory`, `getPointsSummaryStats` (raw SQL pattern), `logPointsThrottle`                                                                                                                         |
| Audit logs schema           | `src/db/schema/audit-logs.ts` — `auditLogs` (action, targetUserId, details JSONB)                                                                                                                                                                                   |
| Admin page pattern          | `src/app/[locale]/(admin)/admin/gamification/page.tsx`                                                                                                                                                                                                              |
| Admin component pattern     | `src/features/admin/components/GamificationRulesManager.tsx` (TanStack Query, useTranslations)                                                                                                                                                                      |
| AdminPageHeader             | `src/components/layout/AdminShell.tsx`                                                                                                                                                                                                                              |
| Source type enum values     | `like_received`, `event_attended`, `article_published` (hardcoded in DB enum, migration 0035)                                                                                                                                                                       |
| Throttle log format         | `logPointsThrottle()` writes `action: "points_throttled"`, `targetUserId`, `details: { reason, eventType, eventId }`                                                                                                                                                |
| VerificationBadge component | `src/components/shared/VerificationBadge.tsx` — `import { VerificationBadge } from "@/components/shared/VerificationBadge"`. Props: `badgeType: BadgeType \| null \| undefined`, `size?: "sm" \| "md"`. Self-wraps `TooltipProvider` — no external provider needed. |

### Previous Story Intelligence (11.6)

- 11.6 established TanStack Query pattern for admin gamification pages: `useQuery` for reads, `useMutation` for writes.
- Admin route pattern confirmed: `withApiHandler()` + `requireAdminSession()` + `logAdminAction()` for mutations.
- i18n keys structured as `Admin.gamification.*` — this story uses `Admin.leaderboard.*`.
- No mutations in this story (read-only), so no `logAdminAction` calls needed.
- Daily cap caching pattern in `points-engine.ts` is irrelevant here (different domain).

### Architecture Compliance

- **Data layer**: Raw SQL via `db.execute(sql\`...\`)`for aggregation queries (Drizzle doesn't cleanly handle`SUM/GROUP BY/window functions`). Follow established pattern from `getPointsSummaryStats`and`getRelatedArticles`.
- **Admin auth**: All admin routes require `requireAdminSession()` — standard RBAC enforcement.
- **No caching**: Leaderboard is read-on-demand (admin-only, low traffic). No Redis cache needed.
- **CRITICAL — Soft delete in raw SQL**: Raw `db.execute(sql\`...\`)`bypasses Drizzle's global filters. Both`getTopPointsEarners`and`getThrottledUsersReport`MUST INNER JOIN`auth_users`with`au.deleted_at IS NULL`to exclude soft-deleted/anonymized users.`getThrottledUsersReport`must additionally guard`WHERE al.target_user_id IS NOT NULL` before the GROUP BY (the column is nullable). Failing either check leaks deleted user data.

### Project Structure Notes

- Admin pages follow `src/app/[locale]/(admin)/admin/{feature}/page.tsx` convention.
- Admin feature components in `src/features/admin/components/`.
- API routes in `src/app/api/v1/admin/{feature}/route.ts`.
- All patterns match existing admin pages (gamification, analytics, audit-log, governance).
- **No sidebar nav entry needed**: `AdminShell.tsx` `NAV_LINKS` does not include gamification or governance pages either — those pages are accessed via direct URL. The leaderboard follows the same convention. Do NOT modify `AdminShell.tsx`.

### References

- [Source: `src/db/queries/points.ts` — getPointsSummaryStats raw SQL pattern (lines 163-180)]
- [Source: `src/db/queries/points.ts` — logPointsThrottle audit_logs format (lines 205-222)]
- [Source: `src/db/schema/platform-points.ts` — ledger + source type enum]
- [Source: `src/db/schema/community-badges.ts` — badge schema with userId PK]
- [Source: `src/app/[locale]/(admin)/admin/gamification/page.tsx` — admin page pattern]
- [Source: Story 11.6 dev notes — TanStack Query + admin route patterns]
- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 11 Story 11.7]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1 (Queries): Added `getTopPointsEarners` and `getThrottledUsersReport` to `src/db/queries/points.ts`. Both use `db.execute(sql\`...\`)`with raw SQL +`COUNT(\*) OVER()` window functions. Soft-delete guard (`au.deleted_at IS NULL`) enforced via INNER JOIN on both queries. `getTopPointsEarners`validates`dateFrom <= dateTo`and returns empty early if invalid.`getThrottledUsersReport`filters`al.target_user_id IS NOT NULL` before GROUP BY. Added 20 new tests (11 + 9), all passing.
- Task 2 (Route): Created `GET /api/v1/admin/leaderboard` — Zod query validation, `dateFrom > dateTo` → 400, `view` param dispatches to either `getTopPointsEarners` or `getThrottledUsersReport`. 9 tests, all passing.
- Task 3 (UI): Created `LeaderboardTable.tsx` ("use client") with tab toggle, leaderboard filters (dateFrom/dateTo/activityType), table with VerificationBadge reuse, flagged users panel with empty-state message, row click navigation. Created `leaderboard/page.tsx` server component following gamification pattern. Added 23 i18n keys in both en.json and ig.json. 11 component tests, all passing.
- Pre-existing failures: 19 unchanged (BottomNav ×10, lua-runner ×2, moderation ×5, AppShell/GuestShell/DashboardShell ×3 — all confirmed pre-existing).
- New test count: +40 tests (20 query + 9 route + 11 component). Total: ~4111 passing + 10 skipped + 19 pre-existing failures.

### File List

- `src/db/queries/points.ts` (extend — add `getTopPointsEarners`, `getThrottledUsersReport`)
- `src/db/queries/points.test.ts` (extend — add tests for new queries)
- `src/app/api/v1/admin/leaderboard/route.ts` (new)
- `src/app/api/v1/admin/leaderboard/route.test.ts` (new — 11 tests)
- `src/app/[locale]/(admin)/admin/leaderboard/page.tsx` (new)
- `src/features/admin/components/LeaderboardTable.tsx` (new)
- `src/features/admin/components/LeaderboardTable.test.tsx` (new — 12 tests)
- `messages/en.json` (add `Admin.leaderboard.*` keys)
- `messages/ig.json` (add `Admin.leaderboard.*` keys)

## Senior Developer Review (AI)

**Reviewer:** Dev on 2026-03-09
**Outcome:** Approved with fixes applied

### Findings Fixed (3)

1. **[HIGH] F1 — dateFrom/dateTo not validated as ISO date format**: Zod schema accepted any string; invalid values would cause PostgreSQL `::timestamptz` cast errors at runtime. **Fix:** Changed to `z.string().date().optional()` in route.ts. Added 2 route tests for invalid date format.

2. **[MEDIUM] F2 — Activity type dropdown showed raw enum values**: `<option>` labels displayed `like_received`, `event_attended`, `article_published` — raw DB enum values violating i18n policy. **Fix:** Added `likeReceived`, `eventAttended`, `articlePublished` i18n keys in both en.json and ig.json. Updated `<select>` options to use `t()`.

3. **[MEDIUM] F3 — Error state showed misleading "No results found"**: Both leaderboard and flagged tabs used `t("noResults")` for `isError` states, which is misleading when the API actually fails. **Fix:** Added `error` i18n key ("Failed to load data. Please try again.") in both locales. Updated both `isError` blocks to use `t("error")`. Added 1 component test verifying the error key.

### Findings Not Fixed (4 LOW)

- **F4:** Soft-delete/NULL-target exclusion query tests are indistinguishable from empty-results tests (mock-based limitation).
- **F5:** File List test count mismatch corrected above.
- **F6:** Unused i18n keys `showing` and `perPage` (deferred — may be used in future per-page selector).
- **F7:** `toLocaleDateString()`/`toLocaleString()` are browser-locale-sensitive (acceptable for admin-only page).

### Test Delta

- +3 new tests from review fixes (2 route date validation, 1 component error state)
- Total story tests: 80 (57 query + 11 route + 12 component)
