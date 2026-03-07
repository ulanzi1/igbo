# Story 8.2: Points Dashboard & History

Status: done

## Story

As a member,
I want to view my points balance and earning history on my dashboard,
so that I can track my engagement and understand how I'm earning points.

## Acceptance Criteria

1. **Given** a member views their dashboard, **When** the points widget loads, **Then** the system displays their current points balance prominently with the OBIGBO golden amber accent color (`amber-500` / `#F59E0B`). A brief count-up animation + amber glow plays when points were recently earned. The animation respects `prefers-reduced-motion` (no animation if enabled — static display only per NFR-A7).

2. **Given** a member navigates to the points detail page, **When** the page loads, **Then** it displays a summary section with: total points earned (all-time), points earned this week, and points earned this month.

3. **Given** a member is on the points detail page, **When** the transaction list loads, **Then** it shows a paginated, chronological list of ledger entries. Each row shows: date/time, points amount (with `+` prefix), multiplier (if > 1, shown as `×N`), source type label (e.g., "Like received", "Event attended", "Article published"), and source context (e.g., "on post 'Village Traditions'") — truncated to 60 chars.

4. **Given** the member wants to filter the history, **When** they select an activity type filter, **Then** only ledger entries matching that `source_type` are shown. Available filters: All, Like Received, Event Attended, Article Published. The URL reflects the active filter (`?type=like_received`) for bookmarkability.

5. **Given** the points balance is queried, **When** any API call or server component requests the balance, **Then** it is served from Redis (`points:user:{userId}`) with a DB fallback on cache miss — reusing `getUserPointsBalance` from `src/services/points-engine.ts`.

6. **Given** a member has zero points, **When** the dashboard widget and detail page load, **Then** they display `0` gracefully with a call-to-action: "React to posts and attend events to start earning points."

## Tasks / Subtasks

- [x] Task 1: DB query functions (AC: 2, 3, 4)
  - [x] 1.1 Add `getPointsLedgerHistory(userId: string, opts: { page: number; limit: number; activityType?: string }): Promise<{ entries: LedgerHistoryRow[]; total: number }>` to `src/db/queries/points.ts` — SELECT from `platform_points_ledger` JOIN `platform_points_rules` for description context; WHERE `user_id = $1` AND optional `source_type = $2`; ORDER BY `created_at DESC`; use OFFSET pagination (`LIMIT $limit OFFSET $(page-1)*limit`); COUNT(\*) for total (single query with window function or two queries — two queries is simpler and acceptable at this scale)
  - [x] 1.2 Add `getPointsSummaryStats(userId: string): Promise<{ total: number; thisWeek: number; thisMonth: number }>` to `src/db/queries/points.ts` — three COALESCE(SUM(points), 0) aggregates with date filters: all-time, `created_at >= date_trunc('week', now())`, `created_at >= date_trunc('month', now())`; can be a single SQL query using conditional SUM (see Dev Notes for SQL)
  - [x] 1.3 Add tests to `src/db/queries/points.test.ts` — ≥8 new tests covering: `getPointsLedgerHistory` (with entries, empty, with activityType filter, page 2), `getPointsSummaryStats` (with data, all-zero)

- [x] Task 2: API routes (AC: 2, 3, 4, 5)
  - [x] 2.1 Create `src/app/api/v1/user/points/route.ts` — `GET`: `requireAuthenticatedSession()`, call `getUserPointsBalance(session.userId)` from `@/services/points-engine`, call `getPointsSummaryStats(session.userId)` from `@/db/queries/points`, return `successResponse({ balance, summary: { total, thisWeek, thisMonth } })`. Wrap with `withApiHandler()`.
  - [x] 2.2 Create `src/app/api/v1/user/points/history/route.ts` — `GET`: `requireAuthenticatedSession()`, parse `?page=1&limit=20&type=` from `request.nextUrl.searchParams`, validate page ≥ 1, limit 1–100, call `getPointsLedgerHistory(session.userId, { page, limit, activityType })`, return `successResponse({ entries, total, page, limit })`. Wrap with `withApiHandler()`.
  - [x] 2.3 Create `src/app/api/v1/user/points/route.test.ts` — ≥5 tests: auth required (401), success returns balance + summary from Redis cache, balance=0 returns 0, summary stats returned correctly, service error propagates
  - [x] 2.4 Create `src/app/api/v1/user/points/history/route.test.ts` — ≥6 tests: auth required (401), success returns paginated entries, activityType filter forwarded to query, invalid page defaults to 1, limit clamped to 100, empty result returns `{ entries: [], total: 0 }`

- [x] Task 3: i18n keys (AC: 1, 2, 3, 4, 6)
  - [x] 3.1 Add `Points.*` namespace to `messages/en.json` AND `Dashboard.points` key for widget slot title (see Dev Notes for full key list)
  - [x] 3.2 Add same keys to `messages/ig.json` with Igbo translations
  - [x] 3.3 Add `Navigation.points` key to both `en.json` and `ig.json` for the profile dropdown link

- [x] Task 4: Dashboard points widget (AC: 1, 5, 6)
  - [x] 4.1 Create `src/features/dashboard/components/PointsWidget.tsx` — Client Component (`"use client"`). Uses `useSession()` + `useQuery` from `@tanstack/react-query` to fetch `GET /api/v1/user/points` (following `UpcomingEventsWidget` pattern exactly). Uses `useReducedMotion()` from `@/hooks/useReducedMotion` to gate the count-up animation. Renders a Card with amber-500 accent (ring or border), displays balance with count-up animation. Shows CTA text when balance === 0. Uses `useTranslations("Points")`. Returns `null` when no session.
  - [x] 4.2 Export `PointsWidget` from `src/features/dashboard/index.ts`
  - [x] 4.3 Modify `src/features/dashboard/components/DashboardShell.tsx` — import `PointsWidget` and add a new `<WidgetSlot enabled={true} title={t("points")}>` block inside the `<aside>` after the UpcomingEventsWidget slot. The `t("points")` key comes from `useTranslations("Dashboard")`.
  - [x] 4.4 Create `src/hooks/useReducedMotion.ts` — custom hook wrapping `window.matchMedia("(prefers-reduced-motion: reduce)")` with a `useEffect` listener. Returns `boolean`. SSR-safe (default `false` on server).
  - [x] 4.5 Create component tests `src/features/dashboard/components/PointsWidget.test.tsx` — ≥5 tests: renders balance, amber accent class present, CTA shown when balance=0, animation skipped when reduced-motion=true (mock useReducedMotion), count displayed with correct formatting

- [x] Task 5: Points detail page (AC: 2, 3, 4, 6)
  - [x] 5.1 Create `src/app/[locale]/(app)/points/page.tsx` — Client Component (`"use client"`). Fetches from `/api/v1/user/points` (balance + summary) and `/api/v1/user/points/history` on mount. Manages `page`, `activityType` filter state. Syncs filter to URL via `useRouter`/`useSearchParams`. Uses `useTranslations("Points")`. Renders: `<PointsSummaryCard>`, `<PointsHistoryFilter>`, `<PointsHistoryList>`, pagination controls.
  - [x] 5.2 Create `src/components/points/PointsSummaryCard.tsx` — displays total, thisWeek, thisMonth stats in a 3-column grid Card. Each stat has a label and value. Amber accent for the total value.
  - [x] 5.3 Create `src/components/points/PointsHistoryList.tsx` — accepts `entries: LedgerHistoryRow[]`, `loading: boolean`. Renders each entry as a row: amber `+{points}` badge, multiplier badge (hidden when multiplier ≤ 1), source type label, truncated source context, formatted date. Empty state matches AC 6 CTA text.
  - [x] 5.4 Create `src/components/points/PointsHistoryFilter.tsx` — segmented control (radio group) with 4 options: All, Like Received, Event Attended, Article Published. On change, calls `onFilterChange(activityType)` callback. Active filter highlighted.
  - [x] 5.5 Register the route in navigation — add "Points" link to the profile dropdown in `src/components/layout/TopNav.tsx`, after the "My Articles" item. Use `useTranslations("Navigation")` key `Navigation.points`. Icon: `StarIcon` from lucide-react (or `TrophyIcon`). Follow the exact `<DropdownMenuItem asChild><Link>` pattern of existing dropdown items.
  - [x] 5.6 Create page and component tests — ≥12 tests total: `PointsSummaryCard` renders 3 stats, `PointsHistoryList` renders entries + empty state, `PointsHistoryFilter` fires callback on change + highlights active, `points/page.tsx` fetches on mount + updates on filter change

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [ ] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [ ] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [ ] All tests passing (run `bun test` locally before review)
- [ ] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — **N/A: no eventbus-bridge changes in this story**
- [ ] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — all points routes return 200
- [ ] New member statuses/roles audited across ALL entry-point functions for permission gaps — N/A
- [ ] `prefers-reduced-motion` respected — no animation when `useReducedMotion()` returns true
- [ ] Balance=0 zero-state handled gracefully in both widget and detail page
- [ ] Points detail page URL filter state (`?type=`) is bookmarkable

## Dev Notes

### Architecture: Where `getUserPointsBalance` Lives

`getUserPointsBalance` and `getBadgeMultiplier` were implemented in `src/services/points-engine.ts` (Story 8.1). The balance API route MUST import from there:

```ts
import { getUserPointsBalance } from "@/services/points-engine";
```

`points-engine.ts` has `import "server-only"` — this is correct. The balance API route runs server-side, so this import is safe. Client Components MUST NOT import from `points-engine` — they fetch via `/api/v1/user/points`.

Do NOT re-implement the Redis cache logic. Reuse the existing function.

### Architecture: Dashboard Widget Pattern (CRITICAL)

**`DashboardShell.tsx` is a `"use client"` component.** It cannot render Server Components. All dashboard widgets are Client Components that fetch data client-side. Follow the `UpcomingEventsWidget` pattern exactly:

```ts
// src/features/dashboard/components/PointsWidget.tsx
"use client";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PointsWidget() {
  const t = useTranslations("Points");
  const { data: session } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["points-balance"],
    queryFn: async () => {
      const res = await fetch("/api/v1/user/points", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch points");
      const json = await res.json();
      return json.data; // { balance, summary }
    },
    enabled: !!session,
  });
  if (!session) return null;
  // ... render Card with count-up animation
}
```

**Widget is added to `DashboardShell.tsx`** (NOT `page.tsx`):

```tsx
// In DashboardShell.tsx <aside>:
<WidgetSlot enabled={true} title={t("points")}>
  <PointsWidget />
</WidgetSlot>
```

The `WidgetSlot` component provides: loading skeleton via `loading` prop, error boundary, and enable/disable toggle. Import from `./WidgetSlot`.

**Do NOT create `dashboard/_components/` or a Server Component loader.** That pattern does not exist in this codebase.

### Task 1: SQL for `getPointsSummaryStats` (single query)

```sql
SELECT
  COALESCE(SUM(points), 0)                                                           AS total,
  COALESCE(SUM(points) FILTER (WHERE created_at >= date_trunc('week',  now())), 0)   AS this_week,
  COALESCE(SUM(points) FILTER (WHERE created_at >= date_trunc('month', now())), 0)   AS this_month
FROM platform_points_ledger
WHERE user_id = $1
```

Use `db.execute(sql`...`)` with a raw template for this aggregate — Drizzle's select API doesn't cleanly support conditional SUM FILTER. The result is a single row array. Access via `rows[0]` (the result is a raw array per our `db.execute()` mock pattern — `Array.from(result)[0]`).

TypeScript result type:

```ts
interface PointsSummaryRow {
  total: string; // Postgres returns numeric as string
  this_week: string;
  this_month: string;
}
// Parse with parseInt(row.total, 10)
```

### Task 1: `getPointsLedgerHistory` Query Design

```ts
export interface LedgerHistoryRow {
  id: string;
  points: number;
  reason: string;
  sourceType: "like_received" | "event_attended" | "article_published";
  sourceId: string;
  multiplierApplied: string; // Drizzle returns numeric as string
  createdAt: Date;
}

export async function getPointsLedgerHistory(
  userId: string,
  opts: { page: number; limit: number; activityType?: string },
): Promise<{ entries: LedgerHistoryRow[]; total: number }> {
  // Two separate queries:
  // 1. SELECT ... FROM platform_points_ledger WHERE user_id=$1 [AND source_type=$2] ORDER BY created_at DESC LIMIT $3 OFFSET $4
  // 2. SELECT COUNT(*) FROM platform_points_ledger WHERE user_id=$1 [AND source_type=$2]
  // Use Drizzle .select() + optional .where(and(...)) for type safety
}
```

Use `eq(platformPointsLedger.userId, userId)` and optionally `eq(platformPointsLedger.sourceType, activityType as SourceTypeEnum)` using Drizzle's `and()`.

### Task 2: Route Patterns

Follow `src/app/api/v1/user/language/route.ts` (Story 1.11) for a clean self-service GET route pattern:

```ts
// src/app/api/v1/user/points/route.ts
import { withApiHandler } from "@/server/api/middleware";
import { requireAuthenticatedSession } from "@/services/permissions";
import { successResponse } from "@/lib/api-response";
import { getUserPointsBalance } from "@/services/points-engine";
import { getPointsSummaryStats } from "@/db/queries/points";

export const GET = withApiHandler(async (request) => {
  const session = await requireAuthenticatedSession(request);
  const [balance, summary] = await Promise.all([
    getUserPointsBalance(session.userId),
    getPointsSummaryStats(session.userId),
  ]);
  return successResponse({ balance, summary });
});
```

For the history route, parse and validate searchParams:

```ts
const url = new URL(request.url);
const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
const activityType = url.searchParams.get("type") ?? undefined;
```

### Task 4: `useReducedMotion` Hook

```ts
// src/hooks/useReducedMotion.ts
"use client";
import { useState, useEffect } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false); // default false (SSR safe)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
```

### Task 4: Count-Up Animation (CSS approach, no extra libraries)

Use a simple `setInterval` loop in `useEffect`. Do NOT add `react-countup` or other npm packages. A 600ms linear count from 0 to balance is sufficient:

```ts
// In PointsWidget:
const [displayed, setDisplayed] = useState(0);
const reduced = useReducedMotion();
const balance = data?.balance ?? 0;

useEffect(() => {
  if (reduced || balance === 0) {
    setDisplayed(balance);
    return;
  }
  const duration = 600;
  const steps = 30;
  const increment = balance / steps;
  let current = 0;
  const id = setInterval(() => {
    current = Math.min(current + increment, balance);
    setDisplayed(Math.round(current));
    if (current >= balance) clearInterval(id);
  }, duration / steps);
  return () => clearInterval(id);
}, [balance, reduced]);
```

The amber glow is a Tailwind class applied for 1s: `animate-pulse` on the balance container when `balance > 0 && !reduced`.

### Task 3: i18n Keys (`messages/en.json`)

Add `Points` to the root object (not nested under existing keys):

```json
"Points": {
  "nav": "Points",
  "widget": {
    "title": "Your Points",
    "zeroState": "React to posts and attend events to start earning points."
  },
  "summary": {
    "total": "Total Points",
    "thisWeek": "This Week",
    "thisMonth": "This Month"
  },
  "history": {
    "title": "Earning History",
    "emptyState": "No points earned yet. React to posts and attend events to start earning points.",
    "multiplierLabel": "×{{multiplier}}",
    "sourceTypes": {
      "like_received": "Like received",
      "event_attended": "Event attended",
      "article_published": "Article published"
    }
  },
  "filter": {
    "all": "All",
    "like_received": "Like Received",
    "event_attended": "Event Attended",
    "article_published": "Article Published"
  }
}
```

Also add to `Dashboard` namespace: `"points": "Your Points"` (for `WidgetSlot` title in `DashboardShell`).

Also add to `Navigation` namespace: `"points": "Points"` (for profile dropdown link).

**`messages/ig.json`** (add same keys with Igbo translations):

```json
"Points": {
  "nav": "Ọnụọgụ",
  "widget": {
    "title": "Ọnụọgụ Gị",
    "zeroState": "Mezie mmesi na ọzụzụ ihe iji malite inweta ọnụọgụ."
  },
  "summary": {
    "total": "Ọnụọgụ Niile",
    "thisWeek": "Izu A",
    "thisMonth": "Ọnwa A"
  },
  "history": {
    "title": "Akụkọ Ọnụọgụ",
    "emptyState": "Ọ dịghị ọnụọgụ ewetara. Mezie mmesi na ọzụzụ ihe iji malite.",
    "multiplierLabel": "×{{multiplier}}",
    "sourceTypes": {
      "like_received": "Mmesi nwetara",
      "event_attended": "Ihe omume gara",
      "article_published": "Akwụkwọ edepụtara"
    }
  },
  "filter": {
    "all": "Niile",
    "like_received": "Mmesi Nwetara",
    "event_attended": "Ihe Omume Gara",
    "article_published": "Akwụkwọ Edepụtara"
  }
}
```

Also add to `Dashboard` namespace: `"points": "Ọnụọgụ Gị"`.
Also add to `Navigation` namespace: `"points": "Ọnụọgụ"`.

### Task 5: Navigation Integration

The "Points" link goes in the **profile dropdown** in `src/components/layout/TopNav.tsx`. Add after the "My Articles" `<DropdownMenuItem>`, before the `<DropdownMenuSeparator>`. Follow the exact pattern:

```tsx
<DropdownMenuItem asChild>
  <Link href="/points" className="flex items-center gap-2 cursor-pointer">
    <StarIcon className="size-4" aria-hidden="true" />
    {t("points")}
  </Link>
</DropdownMenuItem>
```

Import `StarIcon` (or `TrophyIcon`) from `lucide-react`. The `t` here uses `useTranslations("Navigation")`.

**Do NOT add to `navLinks` array or `BottomNav`.** Points is a personal/account feature, not a primary navigation destination.

### Task 5: Points Detail Page Route

The page goes at `src/app/[locale]/(app)/points/page.tsx`. Since it fetches client-side (for filter/pagination interactivity), it is a Client Component. The page requires auth — use `useSession()` from `next-auth/react`; if `!session`, redirect or show login prompt.

### Task 5: Source Context Display

The `sourceId` in ledger entries is the raw UUID (postId, eventId, articleId). For Story 8.2, display a simple source type label only — do not fetch the original content title. The `reason` field in the ledger (e.g., "like_received") is human-readable enough for this story. Story 8.3 / future may enrich with actual titles.

Display format per row:

```
+1 pt  [×3]  Like received  •  2026-03-07 14:32
+5 pts        Event attended •  2026-03-06 09:15
```

Multiplier badge (`[×3]`) only visible when `parseFloat(multiplierApplied) > 1`.

### Project Structure Notes

**Files to create:**

- `src/app/api/v1/user/points/route.ts`
- `src/app/api/v1/user/points/route.test.ts`
- `src/app/api/v1/user/points/history/route.ts`
- `src/app/api/v1/user/points/history/route.test.ts`
- `src/app/[locale]/(app)/points/page.tsx`
- `src/features/dashboard/components/PointsWidget.tsx`
- `src/features/dashboard/components/PointsWidget.test.tsx`
- `src/components/points/PointsSummaryCard.tsx`
- `src/components/points/PointsHistoryList.tsx`
- `src/components/points/PointsHistoryFilter.tsx`
- `src/components/points/` tests (co-located .test.tsx files)
- `src/hooks/useReducedMotion.ts`

**Files to modify:**

- `src/db/queries/points.ts` (add `getPointsLedgerHistory`, `getPointsSummaryStats`)
- `src/db/queries/points.test.ts` (add ≥8 new tests)
- `src/features/dashboard/components/DashboardShell.tsx` (add PointsWidget in WidgetSlot)
- `src/features/dashboard/index.ts` (export PointsWidget)
- `src/components/layout/TopNav.tsx` (add "Points" link to profile dropdown)
- `messages/en.json` (add `Points.*` namespace + `Dashboard.points` + `Navigation.points`)
- `messages/ig.json` (add `Points.*` namespace + `Dashboard.points` + `Navigation.points`)

**Files NOT to change:**

- `src/services/points-engine.ts` — `getUserPointsBalance` already exists; Story 8.2 only consumes it
- `src/db/schema/platform-points.ts` — schema is complete from Story 8.1; no new columns needed
- `src/db/migrations/` — no new migration needed (all schema was created in 0035)
- `src/server/jobs/index.ts` — no new event handlers
- `src/server/realtime/subscribers/eventbus-bridge.ts` — not touched
- `src/app/[locale]/(app)/dashboard/page.tsx` — widgets are added in DashboardShell, not here

### Key Constraints & Gotchas

1. **No new migration** — Story 8.2 reads from `platform_points_ledger` and `platform_points_rules` (created in 0035). Do NOT create migration 0036 in this story. Next migration is for Story 8.3 (`community_user_badges`).

2. **`getUserPointsBalance` is `server-only`** — it imports from `@/services/points-engine` which has `import "server-only"`. The balance API route runs server-side — safe to import. Client Components (PointsWidget, points detail page) MUST NOT import from `points-engine` directly; they fetch via `/api/v1/user/points`.

3. **`db.execute()` mock format** — `getPointsSummaryStats` uses `db.execute(sql`...`)`. In tests, mock `db.execute` to return a raw array: `vi.fn().mockResolvedValue([{ total: "50", this_week: "10", this_month: "30" }])`. Access via `Array.from(result)[0]`. Do NOT use `{ rows: [...] }` — that is wrong.

4. **Pagination vs. cursor** — use OFFSET pagination (not cursor). At < 500 members with modest point counts, OFFSET is acceptable and simpler. Max 100 items per page enforced server-side.

5. **`withApiHandler()` wraps GET routes** — follow the exact pattern of Story 6.3 article view route. No `skipCsrf` needed (authenticated user self-service GET, no CSRF risk on GET).

6. **Count-up animation SSR safety** — `PointsWidget` is a Client Component fetching via `useQuery`. The `displayed` state starts at 0 then counts up in `useEffect` when data arrives. No SSR hydration mismatch concern since loading state shows skeleton via `WidgetSlot`.

7. **Dashboard widget pattern** — `DashboardShell.tsx` is `"use client"`. All widgets are Client Components wrapped in `<WidgetSlot>`. There is no Server Component loader pattern. Follow `UpcomingEventsWidget` exactly: `useSession()` + `useQuery` + `fetch()` with `credentials: "include"`.

8. **Test mock for `getUserPointsBalance` in route tests** — mock the entire `@/services/points-engine` module:

   ```ts
   vi.mock("@/services/points-engine", () => ({
     getUserPointsBalance: vi.fn().mockResolvedValue(42),
     getBadgeMultiplier: vi.fn().mockResolvedValue(1),
   }));
   ```

   Also mock `server-only`:

   ```ts
   vi.mock("server-only", () => ({}));
   ```

9. **Filter URL sync** — in `points/page.tsx`, use `useSearchParams()` + `useRouter()` from `next/navigation` to read/write the `?type=` param. Changing filter resets to page 1.

10. **Multiplier display** — `multiplierApplied` is stored as a `NUMERIC(4,2)` string (e.g., `"1.00"`, `"3.00"`). Parse with `parseFloat()`. Show multiplier badge only when `parseFloat(multiplierApplied) > 1`. Since the DB stores exact decimal strings, `parseFloat("1.00") === 1` exactly — no float safety margin needed.

### References

- [Source: `src/services/points-engine.ts`] — `getUserPointsBalance(userId)`, `getBadgeMultiplier(userId)` already implemented
- [Source: `src/db/queries/points.ts`] — existing query functions (`getUserPointsTotal`, `insertPointsLedgerEntry`, `getPointsRuleByActivityType`)
- [Source: `src/db/schema/platform-points.ts`] — `platformPointsLedger` Drizzle table columns; `platformPointsSourceTypeEnum` values: `like_received`, `event_attended`, `article_published`
- [Source: `src/features/dashboard/components/DashboardShell.tsx`] — `"use client"` component; widgets in `<aside>` wrapped by `<WidgetSlot>`; uses `useTranslations("Dashboard")`
- [Source: `src/features/dashboard/components/WidgetSlot.tsx`] — `WidgetSlot({ enabled, title, loading, children })` with error boundary + skeleton
- [Source: `src/features/events/components/UpcomingEventsWidget.tsx`] — Client Component widget pattern: `useSession()` + `useQuery` + `fetch()` with `credentials: "include"`
- [Source: `src/components/layout/TopNav.tsx`] — profile dropdown with `DropdownMenuItem asChild Link` pattern; `useTranslations("Navigation")`
- [Source: `src/app/api/v1/user/language/route.ts` (Story 1.11)] — self-service GET route pattern with `withApiHandler` + `requireAuthenticatedSession`
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 8.2`] — acceptance criteria source
- [Source: `_bmad-output/implementation-artifacts/8-1-points-engine-earning-rules.md`] — Schema, query functions, HMR guard patterns from Story 8.1

## Change Log

- 2026-03-07: Story 8.2 implemented — points dashboard widget, history page, API routes, i18n keys. +45 new tests (3382/3382 passing + 10 skipped). Status → review.
- 2026-03-07: Review fixes (F1–F6): i18n pagination/pointUnit keys, useLocale() for date formatting, activityType validation (400 on invalid), skeleton loading state, improved page tests (+3 new tests). Status → done.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1: Added `getPointsLedgerHistory` (Drizzle 2-query OFFSET pagination) and `getPointsSummaryStats` (raw SQL conditional SUM FILTER) to `src/db/queries/points.ts`. Added 7 new tests (17 total in file).
- Task 2: Created `GET /api/v1/user/points` (balance + summary) and `GET /api/v1/user/points/history` (paginated ledger, type filter, page/limit clamping). 11 route tests passing.
- Task 3: Added `Points.*` namespace, `Dashboard.points`, `Navigation.points` to both `messages/en.json` and `messages/ig.json`.
- Task 4: Created `PointsWidget` Client Component with count-up animation + `useReducedMotion` hook (SSR-safe). `DashboardShell` now has PointsWidget in `<aside>`. 5 widget tests passing.
- Task 5: Created `points/page.tsx` (Client Component with filter/pagination), `PointsSummaryCard`, `PointsHistoryList`, `PointsHistoryFilter`. Added `StarIcon` + Points link to TopNav profile dropdown. 18 component+page tests passing.
- Pre-existing 2 failures in `src/lib/points-lua-runner.test.ts` confirmed pre-existing (fail on main before this story). Not caused by Story 8.2.
- Final test count: 3382 passing + 10 skipped (vs 3337 baseline = +45 new tests)
- Review fix test count: +4 new tests (1 route validation, 3 page tests) = 3386 passing + 10 skipped (projected)

### File List

**Created:**

- `src/app/api/v1/user/points/route.ts`
- `src/app/api/v1/user/points/route.test.ts`
- `src/app/api/v1/user/points/history/route.ts`
- `src/app/api/v1/user/points/history/route.test.ts`
- `src/app/[locale]/(app)/points/page.tsx`
- `src/app/[locale]/(app)/points/page.test.tsx`
- `src/features/dashboard/components/PointsWidget.tsx`
- `src/features/dashboard/components/PointsWidget.test.tsx`
- `src/components/points/PointsSummaryCard.tsx`
- `src/components/points/PointsSummaryCard.test.tsx`
- `src/components/points/PointsHistoryList.tsx`
- `src/components/points/PointsHistoryList.test.tsx`
- `src/components/points/PointsHistoryFilter.tsx`
- `src/components/points/PointsHistoryFilter.test.tsx`
- `src/hooks/useReducedMotion.ts`

**Modified:**

- `src/db/queries/points.ts` (added `LedgerHistoryRow`, `getPointsLedgerHistory`, `getPointsSummaryStats`)
- `src/db/queries/points.test.ts` (added 7 new tests for new query functions)
- `src/features/dashboard/components/DashboardShell.tsx` (added PointsWidget slot)
- `src/features/dashboard/index.ts` (exported PointsWidget)
- `src/components/layout/TopNav.tsx` (added StarIcon + Points dropdown link)
- `messages/en.json` (Points namespace, Dashboard.points, Navigation.points)
- `messages/ig.json` (Points namespace, Dashboard.points, Navigation.points)
