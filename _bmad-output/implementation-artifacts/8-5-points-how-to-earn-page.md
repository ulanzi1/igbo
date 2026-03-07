# Story 8.5: /points/how-to-earn Page

Status: done

## Story

As a platform member,
I want a dedicated "How to Earn" page that shows earning rules, badge multipliers, and posting limit progression,
so that I can understand how the points and rewards system works and plan my participation accordingly.

## Acceptance Criteria

1. **Route exists** — `GET /[locale]/points/how-to-earn` renders a Server Component page with ISR `revalidate = 60`. No auth required (informational public-within-app page accessible to any authenticated member).

2. **Earning Rules section** — Queries `getActivePointsRules()` (already in `src/db/queries/points.ts`) and renders a table with columns: Activity, Base Points, Description. Inactive rules (isActive=false) are excluded automatically by the existing query. Activity type labels use the existing `Points.history.sourceTypes.*` i18n keys.

3. **Badge Multipliers section** — Reads `BADGE_MULTIPLIERS` constant from `src/config/points.ts` (`{ blue: 3, red: 6, purple: 10 }`) and renders a table showing badge color, display name, and multiplier (e.g., "Blue · ×3"). Each row includes a small visual badge indicator (matching the existing `VerificationBadge` component or an equivalent `<span>` with the badge color class). No DB query needed — multipliers are in code config.

4. **Article Publishing Limits section** — Calls a new query `getAllPostingLimits()` in `src/db/queries/points.ts` to fetch all rows from `platform_posting_limits` ordered by `tier ASC, points_threshold ASC`. Groups rows by tier and renders a table per tier (PROFESSIONAL and TOP_TIER) showing: Points Threshold, Weekly Limit columns. BASIC tier is implicitly excluded (no rows in `platform_posting_limits` for BASIC — it always gets 0 articles). Add a note: "BASIC members are not eligible to publish articles."

5. **Link from /points dashboard** — The existing `/points` page (`src/app/[locale]/(app)/points/page.tsx`) gets a "How to Earn" link (use next-intl `Link` from `@/i18n/navigation`) placed below the `<h1>` page title. i18n key: `Points.howToEarn.linkLabel`.

6. **i18n** — All new user-facing strings use server-side `getTranslations("Points")`. New keys added under `Points.howToEarn.*` namespace to both `messages/en.json` and `messages/ig.json`.

7. **Tests** — At minimum: 4 tests for `getAllPostingLimits()` in `src/db/queries/points.test.ts`, and ~8 tests for the page in `src/app/[locale]/(app)/points/how-to-earn/page.test.tsx` (Server Component testing pattern: call page as async function, render JSX result).

## Tasks / Subtasks

- [x] **Task 1: New query `getAllPostingLimits` + i18n keys** (AC: #4, #6)
  - [x] Add `getAllPostingLimits(): Promise<PlatformPostingLimit[]>` to `src/db/queries/points.ts`
    - `return db.select().from(platformPostingLimits).orderBy(asc(platformPostingLimits.tier), asc(platformPostingLimits.pointsThreshold))`
    - Import `asc` from `drizzle-orm` and `platformPostingLimits` from `@/db/schema/platform-posting-limits`
    - Re-export `PlatformPostingLimit` type (already defined in schema) from the query file for convenience
  - [x] Add tests to `src/db/queries/points.test.ts` — 4 tests:
    - returns all rows ordered by tier then threshold (mock returns mixed order, verify sorted correctly)
    - returns empty array when no rows
    - returns only professional rows when only those exist
    - returned objects have correct shape: `{ id, tier, baseLimit, pointsThreshold, bonusLimit }`
  - [x] Add `Points.howToEarn.*` i18n keys to `messages/en.json` — do this in Task 1 so later tasks can reference them. Keys needed:
    ```json
    "howToEarn": {
      "title": "How to Earn Points",
      "intro": "Earn points by engaging with the community. Points unlock higher publishing limits and recognition.",
      "linkLabel": "How to earn →",
      "earningRules": {
        "sectionTitle": "Earning Activities",
        "activityColumn": "Activity",
        "pointsColumn": "Base Points",
        "descriptionColumn": "Description",
        "noRules": "No earning activities configured."
      },
      "badges": {
        "sectionTitle": "Verification Badge Multipliers",
        "intro": "Verified members earn more points per activity. Badges are assigned by platform admins.",
        "badgeColumn": "Badge",
        "multiplierColumn": "Multiplier",
        "blue": "Blue",
        "red": "Red",
        "purple": "Purple",
        "multiplierValue": "×{value}"
      },
      "postingLimits": {
        "sectionTitle": "Article Publishing Limits",
        "intro": "Earn points to unlock higher weekly article publishing limits based on your membership tier.",
        "thresholdColumn": "Points Threshold",
        "limitColumn": "Weekly Articles",
        "basicNote": "BASIC members are not eligible to publish articles.",
        "professionalTitle": "Professional Members",
        "topTierTitle": "Top Tier Members",
        "atStart": "Starting (0 pts)"
      }
    }
    ```
  - [x] Mirror all keys in `messages/ig.json` (Igbo translations — match the tone of existing Igbo keys; use English as placeholder if Igbo translation unavailable, flag with TODO comment)

- [x] **Task 2: Server Component page** (AC: #1, #2, #3, #4)
  - [x] Create `src/app/[locale]/(app)/points/how-to-earn/page.tsx` as async Server Component
    - Accept `{ params }: { params: Promise<{ locale: string }> }` prop (Next.js 16.x App Router convention — all pages receive this)
    - `export const revalidate = 60;` (ISR — rules change infrequently via admin)
    - `const t = await getTranslations("Points");` — import `getTranslations` from `"next-intl/server"`
    - Fetch data in parallel: `const [rules, postingLimits] = await Promise.all([getActivePointsRules(), getAllPostingLimits()]);`
    - **Section 1 — Earning Rules**: render a `<table>` with columns Activity / Base Points / Description. Map `rules` array; use `t("history.sourceTypes." + rule.activityType)` for the activity label. Fall back gracefully if activityType key not in i18n (show raw activityType). If `rules` is empty, show `t("howToEarn.earningRules.noRules")`.
    - **Section 2 — Badge Multipliers**: import `BADGE_MULTIPLIERS` from `"@/config/points"`. `Object.entries(BADGE_MULTIPLIERS)` gives `[["blue", 3], ["red", 6], ["purple", 10]]`. Render a `<table>` with Badge / Multiplier columns. Badge cell: a small `<span>` with a CSS background-color class (`badge-blue` / `badge-red` / `badge-purple`) plus the i18n label `t("howToEarn.badges.blue")` etc. Multiplier cell: `t("howToEarn.badges.multiplierValue", { value: multiplier })`.
    - **Section 3 — Posting Limits**: filter `postingLimits` by tier. `const professional = postingLimits.filter(r => r.tier === "PROFESSIONAL"); const topTier = postingLimits.filter(r => r.tier === "TOP_TIER");`. Render two sub-sections (Professional, Top Tier), each with a `<table>` showing Points Threshold / Weekly Limit. For each row: threshold = `r.pointsThreshold === 0 ? t("howToEarn.postingLimits.atStart") : String(r.pointsThreshold)`, limit = `r.baseLimit + r.bonusLimit` (baseLimit is the base weekly cap at that threshold; bonusLimit is additional bonus — show only the sum as the total weekly limit). Add BASIC note `t("howToEarn.postingLimits.basicNote")` above the tables.
    - Wrap page in `<div className="container mx-auto px-4 py-8 max-w-2xl">` (matches existing points page layout)
    - No `auth()` call — this is an ISR Server Component; auth is handled by the app shell middleware
  - [x] Write `src/app/[locale]/(app)/points/how-to-earn/page.test.tsx`
    - Mark file `// @vitest-environment jsdom` at top (jsdom required — `render()` needs a DOM; `node` env will fail)
    - Mock `@/db/queries/points` (mock `getActivePointsRules` and `getAllPostingLimits`)
    - Mock `next-intl/server` (`getTranslations` → returns `(key: string) => key`)
    - Mock `@/i18n/navigation` (`Link` → passthrough `<a>` tag, in case future changes add links)
    - Mock `@/config/points` (`BADGE_MULTIPLIERS` → `{ blue: 3, red: 6, purple: 10 }`)
    - Call page with params: `const jsx = await HowToEarnPage({ params: Promise.resolve({ locale: "en" }) }); const { getByText, getAllByRole } = render(jsx);`
    - Write ~8 tests:
      1. renders page title (`howToEarn.title`)
      2. renders all active earning rule rows (mock 2 rules, assert 2 rows appear)
      3. renders base points for each rule
      4. shows noRules message when rules array is empty
      5. renders all 3 badge multiplier rows (blue/red/purple)
      6. renders Professional posting limits table rows (mock 3 professional rows)
      7. renders Top Tier posting limits table rows (mock 6 top-tier rows)
      8. renders BASIC ineligibility note

- [x] **Task 3: Add "How to Earn" link to /points page** (AC: #5)
  - [x] In `src/app/[locale]/(app)/points/page.tsx`, import `Link` from `"@/i18n/navigation"` (already used elsewhere in the app — check if already imported; if not, add import)
  - [x] Add link after the `<h1>` tag (existing line: `<h1 className="text-2xl font-bold mb-6">{t("history.title")}</h1>`):
    ```tsx
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold">{t("history.title")}</h1>
      <Link href="/points/how-to-earn" className="text-sm text-muted-foreground hover:underline">
        {t("howToEarn.linkLabel")}
      </Link>
    </div>
    ```
    (Remove the existing `mb-6` from `<h1>` since it moves to the wrapper div)
  - [x] Verify existing `src/app/[locale]/(app)/points/page.test.tsx` still passes after this change (or update test if it checks for the h1 directly by role). If adding `Link` from `@/i18n/navigation` to the page, ensure that module is mocked in the existing test file — add `vi.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: any) => <a {...props}>{children}</a> }))` if not already present.

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `getTranslations()` (server) — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` (no new imports to eventbus-bridge in this story — skip)
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` (no API routes in this story — skip)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps (no new statuses/roles — skip)
- [x] `revalidate = 60` export present on the Server Component page (ISR, not dynamic)
- [x] `auth()` NOT called in the Server Component page (would defeat ISR — see docs/decisions/isr-pattern.md)
- [x] `getAllPostingLimits` query uses `asc()` ordering from `drizzle-orm` — NOT raw SQL `ORDER BY` string
- [x] BASIC tier note displayed without rendering any table row for BASIC (no rows exist in `platform_posting_limits` for BASIC)
- [x] Badge multipliers come from `BADGE_MULTIPLIERS` in `src/config/points.ts` — NOT hardcoded in the component
- [x] Page test file uses `// @vitest-environment jsdom` directive and calls page as async function with `{ params: Promise.resolve({ locale: "en" }) }` (Server Component test pattern)

## Dev Notes

### Key Architecture Patterns

**Pattern: Server Component with ISR**

- Use `export const revalidate = 60;` at the top of `page.tsx` — not `export const dynamic = "force-dynamic"`. The earning rules and posting limits change only when an admin edits them, so 60-second ISR is appropriate.
- Import `getTranslations` from `"next-intl/server"` (not `useTranslations` from `"next-intl"` — that's for Client Components).
- Never call `auth()` from `next-auth` in this Server Component — it would opt the page into dynamic rendering and defeat ISR. The app shell's middleware (next-auth middleware config) handles auth for the `/points/*` route group.
- [Source: docs/decisions/isr-pattern.md] — established in Epic 5 retro AI-5

**Pattern: `getActivePointsRules` already exists**

- `getActivePointsRules(): Promise<PlatformPointsRule[]>` is already in `src/db/queries/points.ts` — import and use directly. It filters `WHERE is_active = true`.
- `PlatformPointsRule` shape: `{ id, activityType, basePoints, description, isActive, createdAt, updatedAt }`.

**Pattern: New `getAllPostingLimits` query**

- Import `platformPostingLimits` from `@/db/schema/platform-posting-limits` and `asc` from `drizzle-orm`.
- The query: `db.select().from(platformPostingLimits).orderBy(asc(platformPostingLimits.tier), asc(platformPostingLimits.pointsThreshold))`.
- Returns 9 rows (3 for PROFESSIONAL, 6 for TOP_TIER). No rows for BASIC.
- `PlatformPostingLimit` type is already exported from `src/db/schema/platform-posting-limits.ts` — re-export it from `points.ts` for callers or just import from schema directly in the page.

**Pattern: BADGE_MULTIPLIERS from config**

- `import { BADGE_MULTIPLIERS } from "@/config/points"` in the page — this is a `const` object `{ blue: 3, red: 6, purple: 10 }`. The comment in `points.ts` says: "single source of truth for points-engine and VerificationBadge tooltip".
- Keys are badge type strings matching `badgeTypeEnum` values from `src/db/schema/community-badges.ts` (`"blue" | "red" | "purple"`).
- `Object.entries(BADGE_MULTIPLIERS)` returns entries in insertion order: blue, red, purple. Display in this order.

**Pattern: Activity type i18n labels**

- Existing i18n key path: `Points.history.sourceTypes.like_received`, `Points.history.sourceTypes.event_attended`, `Points.history.sourceTypes.article_published`.
- Use `t(\`history.sourceTypes.${rule.activityType}\` as never)`or map the known values. Be defensive: if`activityType`is an unknown value (future admin-added rule), fall back to rendering`rule.activityType` directly (the DB description field can supplement).

**Pattern: Server Component testing**

- File must have `// @vitest-environment jsdom` at the top (needs DOM for `render()`; `node` env will throw).
- Import the page default export: `import HowToEarnPage from "./page";`
- Call it with params: `const jsx = await HowToEarnPage({ params: Promise.resolve({ locale: "en" }) });`
- Render: use `@testing-library/react`'s `render()` on the returned JSX.
- Mock `next-intl/server`: `vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }))`
- Mock `@/i18n/navigation`: `vi.mock("@/i18n/navigation", () => ({ Link: ({ children, ...props }: any) => <a {...props}>{children}</a> }))`
- Mock DB queries: `vi.mock("@/db/queries/points", () => ({ getActivePointsRules: vi.fn(), getAllPostingLimits: vi.fn() }))`
- See `src/app/[locale]/(guest)/articles/page.test.tsx` for the established Server Component test pattern.

**Pattern: `Link` component in Client Component (points page)**

- The points/page.tsx is a Client Component (`"use client"`). Import `Link` from `"@/i18n/navigation"` (the next-intl locale-aware Link). This is the standard Link throughout the app — check if it's already imported in the file; if not add it.
- The link is a simple `href="/points/how-to-earn"` — next-intl's Link automatically prepends the locale.

**Pattern: No new migration, no new schema**

- This story is purely read-only, using existing DB tables (`platform_points_rules`, `platform_posting_limits`) and code constants (`BADGE_MULTIPLIERS`).
- No migration file, no journal entry, no new schema file needed.

**Pattern: Tier display names**

- DB tier values are `"PROFESSIONAL"` and `"TOP_TIER"` (uppercase). Display as human-readable: use i18n keys `Points.howToEarn.postingLimits.professionalTitle` = "Professional Members" and `topTierTitle` = "Top Tier Members".
- Don't call `tier.replace(/_/g, " ").toLowerCase()` — always use i18n keys for user-facing tier names.

**Pattern: `db.execute()` mock format reminder**

- If any query in tests uses `db.execute()`, mock returns raw array (not `{ rows: [...] }`). However, `getAllPostingLimits` uses Drizzle's `db.select()` builder — mock the whole function, not `db.execute`.

### Project Structure Notes

**Files to create:**

- `src/app/[locale]/(app)/points/how-to-earn/page.tsx` — new Server Component page
- `src/app/[locale]/(app)/points/how-to-earn/page.test.tsx` — Server Component tests

**Files to modify:**

- `src/db/queries/points.ts` — add `getAllPostingLimits()` function
- `src/db/queries/points.test.ts` — add ~4 tests for `getAllPostingLimits`
- `src/app/[locale]/(app)/points/page.tsx` — add "How to Earn" link
- `messages/en.json` — add `Points.howToEarn.*` keys
- `messages/ig.json` — add `Points.howToEarn.*` keys

**Files NOT to modify:**

- `src/db/migrations/` — no new migration needed
- `src/db/schema/` — no new schema
- `src/config/points.ts` — read-only import, no change
- `eventbus-bridge.ts` — no new imports

**Existing route structure to be aware of:**

```
src/app/[locale]/(app)/points/
├── page.tsx          ← Client Component (modify: add "How to Earn" link)
├── page.test.tsx     ← Existing tests (verify still pass after link change)
└── how-to-earn/      ← NEW (create this directory)
    ├── page.tsx      ← NEW Server Component
    └── page.test.tsx ← NEW tests
```

**API routes — none new:**

No new `/api/v1/` routes. The how-to-earn page fetches data server-side (Server Component) and does not expose a public API endpoint for this data. This is intentional — the data is admin config and does not need a client-callable route.

### References

- [Source: src/db/queries/points.ts] — `getActivePointsRules` already exists; add `getAllPostingLimits` to same file
- [Source: src/db/schema/platform-posting-limits.ts] — `PlatformPostingLimit` type, table name `platformPostingLimits`
- [Source: src/db/schema/platform-points.ts] — `PlatformPointsRule` type used by `getActivePointsRules`
- [Source: src/config/points.ts] — `BADGE_MULTIPLIERS = { blue: 3, red: 6, purple: 10 }` — single source of truth for multipliers
- [Source: src/app/[locale]/(app)/points/page.tsx] — Client Component to add "How to Earn" link to; `Link` import from `@/i18n/navigation`
- [Source: messages/en.json#Points] — existing `Points` namespace structure to extend
- [Source: docs/decisions/isr-pattern.md] — never call `auth()` in ISR Server Components
- [Source: src/app/[locale]/(app)/articles/[articleId]/page.test.tsx] — Server Component test pattern (call page as async function, render result, mock `next-intl/server`)
- [Source: _bmad-output/implementation-artifacts/epic-8-retro-2026-03-07.md#Gap-1] — `/points/how-to-earn` scope definition: "displays earning rules, badge levels, posting limits (live from DB)"
- [Source: MEMORY.md] — Critical patterns: Zod v4, journal required only for migrations (not needed here), no hardcoded English in JSX, `getTranslations` for Server Components, `useTranslations` for Client Components

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was clean, no debugging required.

### Completion Notes List

- Added `getAllPostingLimits()` query to `src/db/queries/points.ts` using `asc()` ordering from drizzle-orm
- Re-exported `PlatformPostingLimit` type for callers
- Added 4 query tests covering: ordered rows, empty array, professional-only, correct shape
- Created `src/app/[locale]/(app)/points/how-to-earn/page.tsx` as ISR Server Component (`revalidate = 60`) with 3 sections: Earning Rules, Badge Multipliers, Article Publishing Limits
- Badge multipliers read from `BADGE_MULTIPLIERS` config constant — not hardcoded
- BASIC tier note displayed; no BASIC rows rendered (none exist in `platform_posting_limits`)
- Added 8 page tests covering all ACs
- Added "How to Earn →" link to `/points` page with next-intl `Link`, restructured h1 into flex row
- Added `vi.mock("@/i18n/navigation")` to existing `points/page.test.tsx` to handle new Link import
- Added `Points.howToEarn.*` i18n namespace to both `messages/en.json` and `messages/ig.json`
- Total new tests: 12 (4 query + 8 page). All passing. Pre-existing 2 failures in `points-lua-runner.test.ts` unchanged.

### File List

- `src/db/queries/points.ts` — added `getAllPostingLimits()`, `asc` import, `PlatformPostingLimit` re-export
- `src/db/queries/points.test.ts` — added `asc` mock, `getAllPostingLimits` import, 4 new tests
- `src/app/[locale]/(app)/points/how-to-earn/page.tsx` — NEW: Server Component page
- `src/app/[locale]/(app)/points/how-to-earn/page.test.tsx` — NEW: 8 page tests
- `src/app/[locale]/(app)/points/page.tsx` — added Link import + "How to Earn" link
- `src/app/[locale]/(app)/points/page.test.tsx` — added `@/i18n/navigation` mock
- `messages/en.json` — added `Points.howToEarn.*` keys
- `messages/ig.json` — added `Points.howToEarn.*` keys (Igbo translations)

### Change Log

- Added `getAllPostingLimits` DB query (2026-03-07)
- Created `/points/how-to-earn` Server Component page with ISR (2026-03-07)
- Added "How to Earn" link to `/points` dashboard (2026-03-07)
- Added `Points.howToEarn.*` i18n keys to EN + IG (2026-03-07)

### Senior Developer Review (AI) — 2026-03-07

**Reviewer:** Dev (claude-opus-4-6)
**Issues Found:** 2 High, 2 Medium, 2 Low — **ALL FIXED**

**Fixes applied:**

- **F1 (HIGH)**: `getAllPostingLimits` test now verifies `asc()` was called with correct columns (tier, points_threshold) — previously only checked output shape
- **F2 (HIGH)**: Added `ArticleLimitProgress` mock to `points/page.test.tsx` — prevents fragile transitive import failures
- **F3 (MEDIUM)**: Added test asserting "How to Earn" link renders with correct `href="/points/how-to-earn"` on `/points` page
- **F4 (MEDIUM)**: Fixed Igbo badge color translations: blue→"Anụnụ anụnụ", red→"Uhie", purple→"Ododo" (were incorrectly "Ọcha"/"Ọbara Ọbara"/"Ọdịdị Ọcha")
- **F5 (LOW)**: Replaced fragile `try/catch` i18n fallback with `t.has(key)` check (next-intl returns key path on miss, doesn't throw)
- **F6 (LOW)**: Replaced inline `style={{ backgroundColor }}` with Tailwind classes (`bg-blue-500`, `bg-red-500`, `bg-purple-500`); removed dead `badge-${color}` className

**Test count after review:** 44 passing (was 43; +1 new "How to Earn" link test)
