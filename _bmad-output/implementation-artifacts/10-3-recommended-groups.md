# Story 10.3: Recommended Groups

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to see recommended groups on my dashboard and in the group directory,
so that I discover relevant groups I might not have searched for directly.

## Acceptance Criteria

1. Given a member views their dashboard or the group directory, when the recommendations widget loads, then the system displays up to 5 recommended groups (FR81).
2. Given the recommendation algorithm processes, when recommendations are generated, then groups are ranked by: interest overlap with the member's profile, shared group membership with the member's connections, geographic relevance, and group activity level.
3. Given the recommendation algorithm processes, when results are generated, then groups the member already belongs to (active or pending) are excluded.
4. Given the recommendation algorithm processes, when results are generated, then hidden groups are excluded.
5. Given the recommendation algorithm processes, when results are generated, then private groups are included but shown with a "Request to Join" indicator.
6. Given recommendations are generated, when they are returned to the client, then they are cached per member in Redis with a 12-hour TTL — subsequent requests within the TTL are served from cache.
7. Given a member clicks a recommended group card, when they navigate, then they are taken to the group's detail page where they can join or request to join.
8. Given a member clicks "Dismiss" on a recommended group, when the dismissal is saved, then the dismissed group is removed from the recommendations list and will not reappear in future recommendations.

## Tasks / Subtasks

- [x] Task 1: DB migration — dismissed recommendations table (AC: 8)
  - [x] Write `src/db/migrations/0041_dismissed_group_recommendations.sql` — creates `platform_dismissed_group_recommendations (user_id UUID FK → auth_users CASCADE, group_id UUID FK → community_groups CASCADE, dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now())` with composite PK `(user_id, group_id)` and index on `user_id`.
  - [x] Add journal entry to `src/db/migrations/meta/_journal.json` (idx: 41, tag: `0041_dismissed_group_recommendations`, version: "7", when: 1708000041000, breakpoints: true).
  - [x] Create `src/db/schema/platform-dismissed-recommendations.ts` with Drizzle schema matching the migration.
  - [x] Add `import * as dismissedRecsSchema from "@/db/schema/platform-dismissed-recommendations"` to `src/db/index.ts` (follow existing `import * as xSchema` pattern — no `index.ts` in schema dir).
  - [x] Define `platformDismissedGroupRecommendations` table in the schema.

- [x] Task 2: DB queries — recommendation algorithm + dismiss operations (AC: 1–5, 8)
  - [x] Create `src/db/queries/recommendations.ts` (no `"server-only"` — consistent with `groups.ts` pattern). Cast raw result: `(rows as unknown as Array<RawRecommendedGroupRow>).map(r => ...)` (same pattern as `suggestion-service.ts`).
  - [x] Implement `getRecommendedGroups(userId: string, limit: number = 5): Promise<RecommendedGroupItem[]>` using a single scored SQL query:
    - Exclude groups the user belongs to: `NOT EXISTS (SELECT 1 FROM community_group_members WHERE group_id = g.id AND user_id = $userId AND status IN ('active', 'pending'))`.
    - Exclude hidden groups: `g.visibility != 'hidden'`.
    - Exclude soft-deleted groups: `g.deleted_at IS NULL`.
    - Score (additive, 0–4 scale, higher = better):
      - **Interest overlap** (+1): member has `interests` in their profile that overlap with group `name` or `description` keywords (`community_profiles.interests` is a text array). Use `EXISTS (SELECT 1 FROM community_profiles cp WHERE cp.user_id = $userId AND EXISTS (SELECT 1 FROM unnest(cp.interests) interest WHERE g.name ILIKE '%' || interest || '%' OR g.description ILIKE '%' || interest || '%'))`.
      - **Shared connections** (+1): at least one of the member's follows (following) is also a member of the group (`EXISTS (SELECT 1 FROM community_member_follows f JOIN community_group_members m ON m.user_id = f.following_id WHERE f.follower_id = $userId AND m.group_id = g.id AND m.status = 'active')`).
      - **Geographic relevance** (+1): group description or name contains the member's city/state/country (`EXISTS (SELECT 1 FROM community_profiles cp WHERE cp.user_id = $userId AND (cp.location_city IS NOT NULL AND g.description ILIKE '%' || cp.location_city || '%') OR (cp.location_country IS NOT NULL AND g.description ILIKE '%' || cp.location_country || '%'))`).
      - **Activity level** (+1): group `member_count >= 5` (active threshold).
    - Exclude dismissed groups: `NOT EXISTS (SELECT 1 FROM platform_dismissed_group_recommendations d WHERE d.user_id = $userId AND d.group_id = g.id)`.
    - ORDER BY score DESC, member_count DESC, g.created_at DESC (tie-break).
    - LIMIT $limit.
    - Return fields: `id`, `name`, `description`, `bannerUrl`, `visibility`, `joinType`, `memberCount`, `score`.
    - Use `db.execute(sql\`...\`)`with parameterized placeholders for $userId. Result is a raw array (NOT`{ rows: [...] }`) — use `Array.from(rows).map(...)`.
  - [x] Implement `dismissGroupRecommendation(userId: string, groupId: string): Promise<void>` — INSERT OR IGNORE into `platform_dismissed_group_recommendations`. Use `db.insert(...).values(...).onConflictDoNothing()`.
  - [x] Export `RecommendedGroupItem` interface: `{ id: string; name: string; description: string | null; bannerUrl: string | null; visibility: GroupVisibility; joinType: GroupJoinType; memberCount: number; score: number }`.

- [x] Task 3: Recommendation service with Redis cache (AC: 6)
  - [x] Create `src/services/recommendation-service.ts` (add `import "server-only"` at top — same as `suggestion-service.ts`).
  - [x] Implement `getRecommendedGroupsForUser(userId: string): Promise<RecommendedGroupItem[]>`:
    - Cache key: `recommendations:groups:${userId}`.
    - Try `redis.get(cacheKey)` → if hit, `JSON.parse()` and return as `RecommendedGroupItem[]`.
    - On miss: call `getRecommendedGroups(userId, 5)` from query layer.
    - Cache result: `redis.set(cacheKey, JSON.stringify(result), "EX", 43200)` (12 hours = 43200 seconds).
    - Wrap in try/catch — if Redis fails, fall back to direct DB query (no silent blackout).
  - [x] Implement `invalidateRecommendationCache(userId: string): Promise<void>` — `redis.del(\`recommendations:groups:\${userId}\`)`. Call this after a dismiss so the next request regenerates.
  - [x] Import `getRedisClient` from `@/lib/redis` — use the same pattern as other services that use Redis (check `src/server/auth/redis-session-cache.ts` for the correct client getter import pattern).

- [x] Task 4: API routes — GET recommendations + POST dismiss (AC: 6, 7, 8)
  - [x] Create `src/app/api/v1/groups/recommendations/route.ts`:
    - `GET /api/v1/groups/recommendations`
    - Wrap with `withApiHandler()` from `@/server/api/middleware`.
    - Call `requireAuthenticatedSession()` from `@/services/permissions`.
    - Call `getRecommendedGroupsForUser(session.userId)` from recommendation service.
    - Return `successResponse({ groups })`.
    - Rate limit: use `RATE_LIMIT_PRESETS.GROUP_LIST` (confirmed to exist in `src/services/rate-limiter.ts`: `{ maxRequests: 60, windowMs: 60_000 }`). Do NOT use `AUTHENTICATED` or `BROWSE` — they do not exist.
  - [x] Create `src/app/api/v1/groups/recommendations/[groupId]/dismiss/route.ts`:
    - `POST /api/v1/groups/recommendations/[groupId]/dismiss`
    - Wrap with `withApiHandler()`.
    - Call `requireAuthenticatedSession()`.
    - Extract `groupId` from URL: `new URL(req.url).pathname.split("/").at(-2)` (path is `.../[groupId]/dismiss`).
    - Validate `groupId` is a UUID — throw `new ApiError(400, "Invalid group ID")` if not.
    - Call `dismissGroupRecommendation(session.userId, groupId)` from query layer.
    - Call `invalidateRecommendationCache(session.userId)` to bust Redis cache.
    - Return `successResponse({ dismissed: true })`.
    - No CSRF skip needed (authenticated member action).

- [x] Task 5: RecommendedGroupsWidget component (AC: 1, 5, 7, 8)
  - [x] Create `src/features/groups/components/RecommendedGroupsWidget.tsx` as a `"use client"` component.
  - [x] Use `useQuery` (TanStack Query v5) with `queryKey: ["recommended-groups"]`, `enabled: !!session` (prevent fetch before auth), and `credentials: "include"` on the fetch call.
  - [x] Render a `Card` with `CardHeader` + `CardTitle` using `useTranslations("Groups")` key `recommendations.widgetTitle`.
  - [x] Display up to 5 group items. Each item:
    - Group name (link to `/groups/${group.id}` via `Link` from `@/i18n/navigation`).
    - Description snippet (2-line clamp, optional).
    - Member count (`t("memberCount", { count: ... })`).
    - Visibility/joinType indicator: if `visibility === "private"`, show `t("requestToJoin")` badge; if `visibility === "public" && joinType === "open"`, show `t("joinButton")` label (display only — actual join is on the group page).
    - "Dismiss" button (×): use inline `fetch` (with `credentials: "include"`) to call `POST /api/v1/groups/recommendations/[groupId]/dismiss`, then call `useQueryClient().invalidateQueries({ queryKey: ["recommended-groups"] })` to refresh. Use `useQueryClient` hook from `@tanstack/react-query`.
  - [x] Skeleton loading state: 3 skeleton lines while loading.
  - [x] Empty state: `t("recommendations.empty")` — shown if 0 recommendations returned.
  - [x] If `!session`, return null (same pattern as `UpcomingEventsWidget`).

- [x] Task 6: Wire widget into Dashboard and Group Directory (AC: 1)
  - [x] In `src/features/dashboard/components/DashboardShell.tsx` (NOT `src/features/dashboard/DashboardShell.tsx` — the file is inside `components/`), add `<WidgetSlot enabled={true} title={t("recommendedGroups")}><RecommendedGroupsWidget /></WidgetSlot>` in the `<aside>` column after the existing PointsWidget slot. Import from `@/features/groups`.
  - [x] In `src/app/[locale]/(app)/groups/page.tsx`, add `<RecommendedGroupsWidget />` as a full-width section above `<GroupList>` inside the existing `<main>`. The page currently has no sidebar — do NOT add a sidebar column; place the widget above the directory listing.

- [x] Task 7: i18n keys (AC: 1, 5, 7, 8)
  - [x] Add to `messages/en.json` under `Groups` namespace:
    ```json
    "recommendations": {
      "widgetTitle": "Recommended Groups",
      "empty": "No recommendations right now. Explore the group directory to find groups.",
      "dismiss": "Dismiss",
      "dismissAriaLabel": "Dismiss recommendation for {{name}}"
    }
    ```
  - [x] Add to `messages/en.json` under `Dashboard` namespace: `"recommendedGroups": "Recommended Groups"` (used by `WidgetSlot` title in `DashboardShell`).
  - [x] Add equivalent Igbo translations to `messages/ig.json` under both `Groups.recommendations` and `Dashboard.recommendedGroups`.

- [x] Task 8: Tests (AC: 1–8)
  - [x] Create `src/db/queries/recommendations.test.ts` (`@vitest-environment node`):
    - `getRecommendedGroups`: excludes already-joined groups, excludes hidden groups, excludes dismissed groups, respects soft-delete, returns up to 5 groups, score ordering (interest overlap first).
    - `dismissGroupRecommendation`: inserts row, idempotent on second call (no error).
    - Mock `db.execute` returning a raw array (NOT `{ rows: [...] }`).
  - [x] Create `src/services/recommendation-service.test.ts` (`@vitest-environment node`):
    - Cache hit → returns cached data without DB call.
    - Cache miss → calls DB query, sets cache.
    - Redis failure → falls back to DB query (no throw).
    - `invalidateRecommendationCache` → calls `redis.del`.
  - [x] Create `src/app/api/v1/groups/recommendations/route.test.ts` (`@vitest-environment node`):
    - Unauthenticated → 401.
    - Authenticated → calls service → 200 with `{ groups: [...] }`.
  - [x] Create `src/app/api/v1/groups/recommendations/[groupId]/dismiss/route.test.ts` (`@vitest-environment node`):
    - Unauthenticated → 401.
    - Invalid UUID groupId → 400.
    - Valid → calls `dismissGroupRecommendation` + `invalidateRecommendationCache` → 200.
  - [x] Create `src/features/groups/components/RecommendedGroupsWidget.test.tsx` (`// @vitest-environment jsdom`; import `render` from `@/test/test-utils`):
    - Mock `next-auth/react` (`useSession`), `@tanstack/react-query` (`useQuery`, `useQueryClient`), `next-intl` (`useTranslations`), `@/i18n/navigation` (`Link`), `@/components/ui/card`, `@/components/ui/skeleton` — same pattern as `UpcomingEventsWidget.test.tsx`.
    - Returns null when no session.
    - Loading state renders skeletons.
    - Empty state renders empty message.
    - Groups render with name, dismiss button.
    - Dismiss button calls dismiss API (mock `global.fetch`) and refetches.
    - Private group shows "Request to Join" badge.

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — N/A (recommendations.ts not imported in eventbus-bridge)
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — N/A (all 200 responses)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps — N/A (no new roles)
- [x] Journal entry added to `src/db/migrations/meta/_journal.json` for migration 0041

## Dev Notes

### Overview

Story 10.3 adds a group recommendation surface to the dashboard and group directory. The recommendation algorithm is purely SQL-based (no ML) with four additive scoring signals. Results are cached in Redis per member for 12 hours. Members can dismiss individual recommendations, which are persisted in a new DB table.

### Architecture Compliance

- **DB migration**: Hand-write SQL (do NOT use drizzle-kit generate — it fails with `server-only` error). This is migration `0041`. After writing the SQL file, you MUST add a journal entry to `src/db/migrations/meta/_journal.json` (idx: 41, version: "7", when: 1708000041000, tag: "0041_dismissed_group_recommendations", breakpoints: true).
- **DB schema**: No `src/db/schema/index.ts` — import the new schema directly in `src/db/index.ts` with `import * as dismissedRecsSchema from "@/db/schema/platform-dismissed-recommendations"`.
- **Queries**: All DB access in `src/db/queries/recommendations.ts`. Use `db.execute(sql\`...\`)`for the scored ranking query. Raw result is a flat array —`Array.from(rows).map(r => ...)`directly (NOT`result.rows`).
- **Service layer**: `src/services/recommendation-service.ts` — add `import "server-only"` (same as `suggestion-service.ts`). Redis cache wrapping DB queries. Try/catch Redis fallback is mandatory (Epic 9 retro pattern).
- **API routes**: Wrap with `withApiHandler()`. Use `requireAuthenticatedSession()` for both endpoints. Extract `groupId` from URL — `withApiHandler` does NOT pass Next.js route params (use `new URL(req.url).pathname.split("/").at(-2)` for the dismiss endpoint since the path is `.../[groupId]/dismiss`).
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()`. `throw new ApiError(...)` for validation errors.
- **Rate limiting**: Use `RATE_LIMIT_PRESETS.GROUP_LIST` for the GET recommendations route (confirmed: `{ maxRequests: 60, windowMs: 60_000 }`). Do NOT use `AUTHENTICATED` or `BROWSE` — they do not exist.
- **UI**: `"use client"` widget with TanStack Query `useQuery`. Pattern mirrors `UpcomingEventsWidget` — session guard, skeleton, empty state, Card wrapper.
- **i18n**: All strings via `useTranslations("Groups")` under `recommendations.*` sub-namespace.

### Recommendation Algorithm Details

The scoring is additive SQL, computed inline in the query. Each signal contributes +1 if true:

1. **Interest overlap** (+1): At least one of the viewer's profile interests appears (case-insensitive) in the group name or description. The `community_profiles.interests` column is a text array. Use `unnest(cp.interests)` to iterate.
2. **Shared connections** (+1): At least one person the viewer follows (`community_member_follows.following_id` where `follower_id = viewer`) is an active member of the group.
3. **Geographic relevance** (+1): The viewer's `location_city` or `location_country` (from `community_profiles`) appears in the group description.
4. **Activity level** (+1): `g.member_count >= 5`.

All four signals can be computed in a single `SELECT ... FROM community_groups g` query with correlated `EXISTS` subqueries. No joins needed for the main table scan — correlated subqueries keep it readable and safe.

**Exclusions** (applied as WHERE conditions):

- `g.visibility != 'hidden'`
- `g.deleted_at IS NULL`
- `NOT EXISTS (SELECT 1 FROM community_group_members WHERE group_id = g.id AND user_id = $1 AND status IN ('active', 'pending'))` — exclude current/pending members
- `NOT EXISTS (SELECT 1 FROM platform_dismissed_group_recommendations WHERE user_id = $1 AND group_id = g.id)` — exclude dismissed

**Sort**: `score DESC, member_count DESC, created_at DESC` — deterministic.

### Redis Cache Pattern

```ts
const CACHE_TTL_SECONDS = 12 * 60 * 60; // 43200
const cacheKey = `recommendations:groups:${userId}`;

// Read
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached) as RecommendedGroupItem[];

// Miss
const results = await getRecommendedGroups(userId, 5);
await redis.set(cacheKey, JSON.stringify(results), "EX", CACHE_TTL_SECONDS);
return results;
```

Always wrap Redis calls in try/catch. On Redis error, fall back to `getRecommendedGroups(userId, 5)` directly (same as Epic 9 retro AI-1 — graceful degradation pattern).

Import the Redis client using the same pattern as `src/server/auth/redis-session-cache.ts` — check how it gets the client instance from `@/lib/redis`.

### Dismiss Flow

`POST /api/v1/groups/recommendations/[groupId]/dismiss`:

- Requires authenticated session.
- Extract groupId from URL (`.at(-2)` since path ends in `.../dismiss`).
- Validate UUID format (use `z.string().uuid()` from `"zod/v4"`).
- Call `dismissGroupRecommendation(userId, groupId)` — idempotent (ON CONFLICT DO NOTHING).
- Call `invalidateRecommendationCache(userId)` to bust the Redis cache so next request regenerates.
- Return `successResponse({ dismissed: true })`.

On the client, after dismiss API succeeds: `queryClient.invalidateQueries({ queryKey: ["recommended-groups"] })` triggers a refetch.

### Widget Layout

**Dashboard** (`src/features/dashboard/components/DashboardShell.tsx`): Add `<WidgetSlot enabled={true} title={t("recommendedGroups")}><RecommendedGroupsWidget /></WidgetSlot>` in the `<aside className="lg:w-[35%] flex flex-col gap-4">` column, after the existing PointsWidget slot. Import `RecommendedGroupsWidget` from `@/features/groups`. The `t()` here uses `useTranslations("Dashboard")`, so the key `Dashboard.recommendedGroups` must exist in i18n.

**Group Directory** (`src/app/[locale]/(app)/groups/page.tsx`): Add `<RecommendedGroupsWidget />` as a full-width section above `<GroupList>` inside the existing `<main>`. The page is a flat layout with no sidebar — do NOT restructure it. Simply place the widget before the directory listing.

### File Structure

**New files:**

- `src/db/migrations/0041_dismissed_group_recommendations.sql`
- `src/db/schema/platform-dismissed-recommendations.ts`
- `src/db/queries/recommendations.ts`
- `src/db/queries/recommendations.test.ts`
- `src/services/recommendation-service.ts`
- `src/services/recommendation-service.test.ts`
- `src/app/api/v1/groups/recommendations/route.ts`
- `src/app/api/v1/groups/recommendations/route.test.ts`
- `src/app/api/v1/groups/recommendations/[groupId]/dismiss/route.ts`
- `src/app/api/v1/groups/recommendations/[groupId]/dismiss/route.test.ts`
- `src/features/groups/components/RecommendedGroupsWidget.tsx`
- `src/features/groups/components/RecommendedGroupsWidget.test.tsx`

**Extend:**

- `src/db/index.ts` — add import for new schema
- `src/db/migrations/meta/_journal.json` — add idx 41 entry
- `src/features/dashboard/components/DashboardShell.tsx` — add widget inside `<WidgetSlot>` in aside column
- `src/app/[locale]/(app)/groups/page.tsx` — add widget
- `messages/en.json` — add `Groups.recommendations.*` keys
- `messages/en.json` — also add `Dashboard.recommendedGroups` key for WidgetSlot title
- `messages/ig.json` — add `Groups.recommendations.*` + `Dashboard.recommendedGroups` Igbo keys

### Testing Requirements

- **`@vitest-environment node`** annotation required on all server-side test files (queries, service, routes).
- **`db.execute()` mock format**: Returns raw flat array `[row1, row2]` — NOT `{ rows: [...] }`. Mock: `vi.mocked(db.execute).mockResolvedValue([{ id: "...", name: "...", ... }] as any)`.
- **Recommendation service tests**: Mock both `db` (via `vi.mock("@/db")`) and `redis` client. Test cache hit (no DB call), cache miss (DB call + set), Redis error (fallback to DB, no throw).
- **Route tests**: Mock `requireAuthenticatedSession`, `getRecommendedGroupsForUser`, `dismissGroupRecommendation`, `invalidateRecommendationCache`. Follow existing route test patterns from Story 10.1/10.2.
- **Component tests**: Use `// @vitest-environment jsdom` annotation. Import `render` from `@/test/test-utils`. Mock `next-auth/react` (useSession), `@tanstack/react-query` (useQuery, useQueryClient), `next-intl` (useTranslations), `@/i18n/navigation` (Link), `@/components/ui/card`, `@/components/ui/skeleton`. Mock `global.fetch` for dismiss API call. Follow exact mock patterns from `UpcomingEventsWidget.test.tsx`.

### DB Schema Quick Reference

- `communityGroups`: id, name, description, bannerUrl, visibility (`public|private|hidden`), joinType (`open|approval`), memberCount, deletedAt, createdAt
- `communityGroupMembers`: groupId, userId, role, status (`active|pending|banned`), joinedAt
- `communityMemberFollows`: followerId, followingId, createdAt
- `communityProfiles`: userId, interests (text[]), locationCity, locationState, locationCountry
- New: `platform_dismissed_group_recommendations`: userId (FK → auth_users CASCADE), groupId (FK → community_groups CASCADE), dismissedAt; PK (userId, groupId)

### Previous Story Intelligence (10.2)

- Search queries use `db.execute(sql\`...\`)`with parameterized`$1`/$2 placeholders and raw array results — use same pattern for recommendation query.
- Cursor-based pagination in 10.2 is not needed here (fixed limit of 5).
- Widget pattern established in Epic 7 (`UpcomingEventsWidget`) and Epic 8 (`PointsWidget`) — `"use client"`, `useSession()` guard, `useQuery`, Card + Skeleton + empty state.
- `withApiHandler` dynamic params pattern re-confirmed in 9.5: extract from `new URL(req.url).pathname.split("/").at(-N)`.
- `GroupCard.tsx` already exists in `src/features/groups/components/GroupCard.tsx` — do NOT duplicate it. The `RecommendedGroupsWidget` should render a lighter inline item (name + description + member count + dismiss), NOT the full `GroupCard` (which includes a banner image and full card UI). The group name should be a `Link` to `/groups/${group.id}`.

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 10, Story 10.3 acceptance criteria)
- `_bmad-output/implementation-artifacts/10-2-filtered-search-results.md` (previous story patterns)
- `src/features/events/components/UpcomingEventsWidget.tsx` (widget pattern reference)
- `src/features/groups/components/GroupCard.tsx` (existing group card — do not duplicate)
- `src/services/recommendation-service.ts` (new file — modeled after suggestion-service)
- `src/lib/redis.ts` (Redis client)
- `src/server/auth/redis-session-cache.ts` (Redis usage pattern reference)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Implemented 4-signal SQL recommendation algorithm (interest overlap, shared connections, geographic, activity) with additive scoring.
- Redis caching (12-hour TTL) with try/catch fallback to direct DB query — follows Epic 9 retro graceful degradation pattern.
- GET route uses IP-based rate limit key (not user-session key) to avoid CSRF/auth cascade in key function.
- Dismiss flow: POST → DB insert (idempotent) → Redis invalidate → client refetches via queryClient.invalidateQueries.
- Widget pattern mirrors UpcomingEventsWidget: session guard, skeleton, empty state, Card wrapper.
- 24 new tests: 7 query, 5 service, 2 GET route, 3 dismiss route, 7 component.

### File List

- `src/db/migrations/0041_dismissed_group_recommendations.sql` (new)
- `src/db/migrations/meta/_journal.json` (modified)
- `src/db/schema/platform-dismissed-recommendations.ts` (new)
- `src/db/index.ts` (modified)
- `src/db/queries/recommendations.ts` (new)
- `src/db/queries/recommendations.test.ts` (new)
- `src/services/recommendation-service.ts` (new)
- `src/services/recommendation-service.test.ts` (new)
- `src/app/api/v1/groups/recommendations/route.ts` (new)
- `src/app/api/v1/groups/recommendations/route.test.ts` (new)
- `src/app/api/v1/groups/recommendations/[groupId]/dismiss/route.ts` (new)
- `src/app/api/v1/groups/recommendations/[groupId]/dismiss/route.test.ts` (new)
- `src/features/groups/components/RecommendedGroupsWidget.tsx` (new)
- `src/features/groups/components/RecommendedGroupsWidget.test.tsx` (new)
- `src/features/groups/index.ts` (modified — added barrel export)
- `src/features/dashboard/components/DashboardShell.tsx` (modified)
- `src/app/[locale]/(app)/groups/page.tsx` (modified)
- `messages/en.json` (modified)
- `messages/ig.json` (modified)

### Change Log

- 2026-03-08: Implemented Story 10.3 — Recommended Groups (DB migration, queries, service, API routes, widget, i18n). 24 new tests. No regressions.
- 2026-03-08: Code review fixes (5 issues). H1: Separated Redis try/catch from DB call to prevent double-failure. M1: Added barrel export + updated imports. M2: Dismiss handler checks res.ok before invalidating queries. M3: Escaped LIKE wildcards in scoring SQL. M4: Added dismiss error test. +2 new tests (26 total).
