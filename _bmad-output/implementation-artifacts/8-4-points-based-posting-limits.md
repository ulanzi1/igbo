# Story 8.4: Points-Based Posting Limits

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want the system to increase members' article publishing limits as their points accumulate,
So that engaged members are rewarded with more publishing capacity.

## Acceptance Criteria

1. **Points-based article limit table** — Migration `0037_posting_limits.sql` creates the `platform_posting_limits` table with: `id` (UUID PK), `tier` (VARCHAR 20 NOT NULL), `base_limit` (INT NOT NULL), `points_threshold` (INT NOT NULL), `bonus_limit` (INT NOT NULL). Tier values use UPPERCASE to match the `membership_tier` pgEnum (`PROFESSIONAL`, `TOP_TIER`). Migration also seeds the table with the 9 default rows defined below. Journal entry idx:37 added.

2. **Default seeded values** (launch defaults; admin-editable with no code changes):

   | Tier         | Base Limit | Points Threshold | Bonus | Effective |
   | ------------ | ---------- | ---------------- | ----- | --------- |
   | PROFESSIONAL | 1          | 0                | 0     | 1         |
   | PROFESSIONAL | 1          | 500              | 1     | 2         |
   | PROFESSIONAL | 1          | 2000             | 2     | 3         |
   | TOP_TIER     | 2          | 0                | 0     | 2         |
   | TOP_TIER     | 2          | 1000             | 1     | 3         |
   | TOP_TIER     | 2          | 3000             | 2     | 4         |
   | TOP_TIER     | 2          | 7500             | 3     | 5         |
   | TOP_TIER     | 2          | 15000            | 4     | 6         |
   | TOP_TIER     | 2          | 30000            | 5     | 7         |

3. **`getEffectiveArticleLimit(userId, tier)` query** — New function in `src/db/queries/points.ts`. Looks up the member's total points balance (via `getUserPointsTotal`), then queries `platform_posting_limits` for all rows matching their tier, ordered by `points_threshold DESC`, picks the first row where `total >= points_threshold`, and returns `base_limit + bonus_limit`. Returns tier baseline (1 for Professional, 2 for Top-tier) if no threshold rows match.

4. **`canPublishArticle` updated** — In `src/services/permissions.ts`, replace the static `PERMISSION_MATRIX[tier].maxArticlesPerWeek` lookup with `getEffectiveArticleLimit(userId, tier)`. The dynamic limit is used to evaluate whether `weeklyCount >= effectiveLimit`.

5. **Dashboard progress display** — A new `ArticleLimitProgress` Client Component shows: "You can publish X articles this week. Earn Y more points to unlock X+1." Displayed on the points history page (`/points`) alongside the existing `PointsSummaryCard`. The component fetches from the new `GET /api/v1/user/article-limit` route which returns `{ effectiveLimit, weeklyUsed, currentPoints, nextThreshold, nextBonusLimit }`.

6. **API route** — `GET /api/v1/user/article-limit` returns the data for AC #5. Uses `requireAuthenticatedSession`. Returns 200 with the limit data. BASIC tier members receive `{ effectiveLimit: 0, weeklyUsed: 0, currentPoints, nextThreshold: null, nextBonusLimit: null }`.

7. **i18n** — All new user-facing strings use `useTranslations()`. Keys added under `Points.articleLimit.*` namespace to both `messages/en.json` and `messages/ig.json`.

## Tasks / Subtasks

- [x] **Task 1: DB Schema, Migration & Seed** (AC: #1, #2)
  - [x] Create `src/db/schema/platform-posting-limits.ts` — `platformPostingLimits` pgTable with: `id` uuid PK defaultRandom, `tier` varchar(20) NOT NULL, `baseLimit` integer NOT NULL, `pointsThreshold` integer NOT NULL, `bonusLimit` integer NOT NULL
  - [x] Import `* as postingLimitsSchema` in `src/db/index.ts` (follow `import * as xSchema` pattern — no barrel index.ts in schema/)
  - [x] Write `src/db/migrations/0037_posting_limits.sql` — CREATE TABLE `platform_posting_limits`; INSERT the 9 seed rows
  - [x] Add journal entry to `src/db/migrations/meta/_journal.json`: `{ "idx": 37, "version": "7", "when": 1708000037000, "tag": "0037_posting_limits", "breakpoints": true }`
  - [x] Add i18n keys for `Points.articleLimit.*` to `messages/en.json` and `messages/ig.json` (do this in Task 1 so later tasks can reference them)

- [x] **Task 2: `getEffectiveArticleLimit` Query** (AC: #3)
  - [x] Add `getEffectiveArticleLimit(userId: string, tier: MembershipTier): Promise<number>` to `src/db/queries/points.ts`
    - Calls `getUserPointsTotal(userId)` to get total points
    - Queries `platform_posting_limits` WHERE tier = tierStr ORDER BY points_threshold DESC
    - Finds first row where totalPoints >= pointsThreshold → returns baseLimit + bonusLimit
    - Falls back to PERMISSION_MATRIX tier baseline if no row matches
  - [x] Write tests in `src/db/queries/points.test.ts` — add ~6 tests: Professional/0pts→1, Professional/500pts→2, Professional/2000pts→3, Top-tier/0pts→2, Top-tier/1000pts→3, Top-tier/30000pts→7

- [x] **Task 3: Update `canPublishArticle` in PermissionService** (AC: #4)
  - [x] In `src/services/permissions.ts`, update `canPublishArticle(userId)` to call `getEffectiveArticleLimit(userId, tier)` instead of `PERMISSION_MATRIX[tier].maxArticlesPerWeek`. DO NOT change the function signature — `tier` is already fetched internally via `getUserMembershipTier(userId)` on line ~89; reuse it.
  - [x] Import `getEffectiveArticleLimit` via dynamic import: `const { getEffectiveArticleLimit } = await import("@/db/queries/points")` — consistent with the existing `countWeeklyArticleSubmissions` dynamic import pattern on line ~99
  - [x] Write/update tests in permissions service test file — add ~4 tests covering: BASIC blocked, Professional within limit, Professional at dynamic limit, dynamic limit respected

- [x] **Task 4: `GET /api/v1/user/article-limit` Route** (AC: #6)
  - [x] Create `src/app/api/v1/user/article-limit/route.ts`
    - `requireAuthenticatedSession(request)` → userId, tier
    - For BASIC tier: return `{ effectiveLimit: 0, weeklyUsed: 0, currentPoints, nextThreshold: null, nextBonusLimit: null }`
    - For Professional/Top-tier: call `getEffectiveArticleLimit`, `getUserPointsTotal`, `countWeeklyArticleSubmissions`, query next threshold row
    - Return `successResponse({ effectiveLimit, weeklyUsed, currentPoints, nextThreshold, nextBonusLimit })`
    - Wrap with `withApiHandler()` — no rateLimit option (BROWSE preset does NOT exist; `/api/v1/user/points` omits it too)
    - Route test must mock `@/db/queries/articles` (`countWeeklyArticleSubmissions`) and `@/db/queries/points` (`getUserPointsTotal`, `getEffectiveArticleLimit`)
  - [x] Write `route.test.ts` — ~6 tests: BASIC returns zeros, Professional at baseline, at threshold, Top-tier at max

- [x] **Task 5: `ArticleLimitProgress` Component** (AC: #5, #7)
  - [x] Create `src/features/dashboard/components/ArticleLimitProgress.tsx` — Client Component
    - Fetches `GET /api/v1/user/article-limit`
    - Shows: "You can publish {effectiveLimit} articles this week. Earn {nextThreshold - currentPoints} more points to unlock {effectiveLimit + 1}."
    - When at max (effectiveLimit === 7 OR nextThreshold null): "You have reached the maximum publishing limit."
    - Show skeleton while loading
    - Use `useTranslations("Points")` for all strings
  - [x] Add `<ArticleLimitProgress />` to `src/app/[locale]/(app)/points/page.tsx` — insert between the `PointsSummaryCard` wrapper div (lines 108-114) and the zero-state message (line 116)
  - [x] Write `ArticleLimitProgress.test.tsx` — ~5 tests: skeleton loading, at baseline, at bonus threshold, at max, BASIC tier (effectiveLimit=0 shows no component or "not eligible")

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` (no new imports added to eventbus-bridge.ts in this story)
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` (only 200 responses in this story)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps (no new statuses/roles introduced)
- [x] Journal entry idx:37 added to `_journal.json` (without this, migration never runs)
- [x] `getEffectiveArticleLimit` falls back to tier baseline (not 0) when no threshold rows match
- [x] `canPublishArticle` tests verify the dynamic limit path, not just the static PERMISSION_MATRIX path
- [x] No BROWSE rate limit preset used (it does NOT exist — omit rateLimit for public GET routes; this route is authenticated so use no preset or AUTH preset)
- [x] BASIC tier members handled gracefully in the article-limit route (returns 0s, no error)

## Dev Notes

### Key Architecture Patterns

**Pattern: DB schema → index import**

- Import in `src/db/index.ts` as `import * as postingLimitsSchema from "@/db/schema/platform-posting-limits"` and spread into schema object.
- No `src/db/schema/index.ts` barrel exists — schemas are imported directly in `src/db/index.ts`.

**Pattern: Migration file + journal entry (BOTH required)**

- Hand-write SQL — drizzle-kit generate fails with `server-only` error.
- After writing `0037_posting_limits.sql`, MUST also add to `src/db/migrations/meta/_journal.json`:
  ```json
  {
    "idx": 37,
    "version": "7",
    "when": 1708000037000,
    "tag": "0037_posting_limits",
    "breakpoints": true
  }
  ```
- Without the journal entry, drizzle-kit never applies the SQL file.

**Pattern: `canPublishArticle` existing flow**

- In `src/services/permissions.ts:88-111`, `canPublishArticle` already:
  1. Checks `PERMISSION_MATRIX[tier].canPublishArticle` (gate for BASIC)
  2. Dynamic-imports `countWeeklyArticleSubmissions` from `@/db/queries/articles`
  3. Compares `weeklyCount >= maxPerWeek`
- Step 3 currently uses `PERMISSION_MATRIX[tier].maxArticlesPerWeek` (static: 1 for Professional, 2 for Top-tier).
- Replace step 3's `maxPerWeek` with `await getEffectiveArticleLimit(userId, tier)` from `@/db/queries/points`.
- To avoid potential circular ref issues, use a dynamic import: `const { getEffectiveArticleLimit } = await import("@/db/queries/points")` consistent with the existing `countWeeklyArticleSubmissions` pattern.
- `PERMISSION_MATRIX[tier].maxArticlesPerWeek` in the matrix itself does NOT need to change — it's the fallback inside `getEffectiveArticleLimit`.
- **DO NOT change the `canPublishArticle(userId)` function signature.** The `tier` variable is already available internally (line ~89: `const tier = await getUserMembershipTier(userId)`). Just pass it to `getEffectiveArticleLimit(userId, tier)`.

**Pattern: `getUserPointsTotal` already exists**

- `getUserPointsTotal(userId)` is in `src/db/queries/points.ts:49-55` — returns `number`. Use directly in `getEffectiveArticleLimit`.

**Pattern: Tier string values are UPPERCASE**

- The `membership_tier` pgEnum in `src/db/schema/auth-permissions.ts:13` uses `["BASIC", "PROFESSIONAL", "TOP_TIER"]`. Migration seed values MUST use `'PROFESSIONAL'` and `'TOP_TIER'` (uppercase) to match. The `getEffectiveArticleLimit` query compares `tier` column directly against the user's `membershipTier` value — casing must match exactly.

**Pattern: No BROWSE rate limit preset**

- `BROWSE` preset does NOT exist in `src/services/rate-limiter.ts`. For authenticated GET routes, omit the `rateLimit` option in `withApiHandler()`, or look up what preset is used for similar user GET routes (e.g., `/api/v1/user/points` route).

**Pattern: Existing `canPublishArticle` test file**

- Find existing permissions service tests before adding new ones — avoid creating duplicate test files.

**Pattern: Zod imports**

- Always import from `"zod/v4"` (NOT `"zod"`).

**Pattern: `requireAuthenticatedSession`**

- Import from `@/services/permissions` — returns `{ userId: string, tier: MembershipTier, ... }` or throws 401.

**Pattern: `successResponse` / `errorResponse`**

- RFC 7807 via `successResponse(data)` / `errorResponse(status, title, detail)` from `@/lib/api-response`.
- Non-200 success: `successResponse(data, undefined, 201)` (3rd arg).

**Pattern: Pre-existing test baseline**

- Baseline: 3382 passing + 10 skipped (Lua integration tests) after Story 8.2; Story 8.3 added ~35 tests → current baseline ~3417+ passing + 10 skipped.
- 2 pre-existing failures in `points-lua-runner.test.ts` exist on main — do NOT investigate.
- Target for this story: baseline + ~21+ new tests (6 query + 4 permissions + 6 route + 5 component).

### Project Structure Notes

**Files to create:**

- `src/db/schema/platform-posting-limits.ts` — new Drizzle schema table
- `src/db/migrations/0037_posting_limits.sql` — migration + seed
- `src/features/dashboard/components/ArticleLimitProgress.tsx` — new Client Component
- `src/features/dashboard/components/ArticleLimitProgress.test.tsx` — component tests
- `src/app/api/v1/user/article-limit/route.ts` — new API route
- `src/app/api/v1/user/article-limit/route.test.ts` — route tests

**Files to modify:**

- `src/db/index.ts` — add `import * as postingLimitsSchema from "@/db/schema/platform-posting-limits"`
- `src/db/migrations/meta/_journal.json` — add idx:37 journal entry
- `src/db/queries/points.ts` — add `getEffectiveArticleLimit` function
- `src/db/queries/points.test.ts` — add ~6 new tests for `getEffectiveArticleLimit`
- `src/services/permissions.ts` — update `canPublishArticle` to use dynamic limit
- `src/services/permissions.test.ts` (or equivalent) — add/update tests for dynamic limit
- `src/app/[locale]/(app)/points/page.tsx` — add `<ArticleLimitProgress />` component
- `messages/en.json` — add `Points.articleLimit.*` keys
- `messages/ig.json` — add `Points.articleLimit.*` keys

**DB Schema State (after this story):**

- `platformPostingLimits`: id (UUID PK), tier (VARCHAR 20 NOT NULL), baseLimit (INT NOT NULL), pointsThreshold (INT NOT NULL), bonusLimit (INT NOT NULL) — 9 rows seeded at migration time

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.4] — AC definitions, table schema, default seed values, progression curve
- [Source: _bmad-output/planning-artifacts/epics.md#FR25] — Points-based posting limits functional requirement
- [Source: src/services/permissions.ts#canPublishArticle] — Existing function to update (lines 88-111)
- [Source: src/db/queries/points.ts#getUserPointsTotal] — Existing points query to reuse (lines 49-55)
- [Source: src/db/schema/platform-points.ts] — Points schema pattern to follow for new schema
- [Source: src/db/migrations/0036_verification_badges.sql + meta/_journal.json] — Migration + journal pattern (next idx=37)
- [Source: src/app/api/v1/user/points/route.ts] — Pattern for user GET routes with `requireAuthenticatedSession`
- [Source: src/features/dashboard/components/PointsWidget.tsx] — Dashboard component pattern
- [Source: MEMORY.md] — Critical patterns: Zod v4, journal required, `result.error.issues[0]`, no BROWSE preset, withApiHandler, server-only migration

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without blockers.

### Completion Notes List

- Task 1: Created `platformPostingLimits` schema, migration 0037 with 9 seed rows (PROFESSIONAL: 3 tiers, TOP_TIER: 6 tiers), journal entry idx:37, i18n keys under `Points.articleLimit.*` in both en.json and ig.json.
- Task 2: Added `getEffectiveArticleLimit(userId, tier)` to points.ts. Uses local `TIER_ARTICLE_BASELINE` map instead of importing PERMISSION_MATRIX to avoid circular dependency. Added 7 tests (6 tier scenarios + 1 fallback).
- Task 3: Updated `canPublishArticle` to use dynamic import of `getEffectiveArticleLimit`. Added mock for `@/db/queries/points` in permissions.test.ts. Added 4 tests covering dynamic limit paths.
- Task 4: Created `GET /api/v1/user/article-limit` route. Fetches tier via `getUserMembershipTier` (since `requireAuthenticatedSession` only returns userId/role). BASIC returns zeroed response immediately. Others query next threshold row with array `.find()`. 6 route tests.
- Task 5: `ArticleLimitProgress` Client Component with skeleton, canPublish, earnMore, atMax, notEligible states. Added to points page between PointsSummaryCard and zero-state. 6 component tests.
- Test count: 3445 passing + 10 skipped (pre-existing Lua integration). 2 pre-existing failures in points-lua-runner.test.ts (not caused by this story, documented in MEMORY.md).

### File List

**New files:**

- `src/db/schema/platform-posting-limits.ts`
- `src/db/migrations/0037_posting_limits.sql`
- `src/app/api/v1/user/article-limit/route.ts`
- `src/app/api/v1/user/article-limit/route.test.ts`
- `src/features/dashboard/components/ArticleLimitProgress.tsx`
- `src/features/dashboard/components/ArticleLimitProgress.test.tsx`

**Modified files:**

- `src/db/index.ts`
- `src/db/migrations/meta/_journal.json`
- `src/db/queries/points.ts`
- `src/db/queries/points.test.ts`
- `src/services/permissions.ts`
- `src/services/permissions.test.ts`
- `src/app/[locale]/(app)/points/page.tsx`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-03-07: Story 8.4 implemented — points-based posting limits. Created platformPostingLimits table (migration 0037), getEffectiveArticleLimit query, updated canPublishArticle to use dynamic limit, added GET /api/v1/user/article-limit route, ArticleLimitProgress component on points dashboard. +28 new tests.
- 2026-03-07: Senior dev review — 3 fixes applied: (F1/F3) Added optional `preloadedPoints` param to `getEffectiveArticleLimit` to eliminate redundant `getUserPointsTotal` DB call from route; (F2) Added drift-warning comment to `TIER_ARTICLE_BASELINE`; (F4) Renamed `nextBonusLimit` → `nextEffectiveLimit` in route response + component for clarity. +1 new test (preloadedPoints skip). Total: 29 new tests.
