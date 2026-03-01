# Story 3.2: Geographic Fallback Discovery

Status: done

## Story

As a member,
I want the directory to gracefully expand from my city to state to country when few local members are found,
So that I never see a dead end and always discover my community at wider geographic levels.

## Acceptance Criteria

1. **Given** a member searches for members in a specific city
   **When** results are found at the city level (≥ 5 members)
   **Then** member cards display with a count label: "12 community members in Houston" (FR18)

2. **Given** a member searches for members in a city with no/few results
   **When** the city-level query returns fewer than 5 members
   **Then** the system automatically expands to state level with warm messaging: "Your city is still growing! Here's your community nearby..."
   **And** the expansion is visualized with animated concentric rings (city → state) — rings appear sequentially with 300ms stagger
   **And** state-level results display with count: "23 members in Texas"
   **And** a subtle prompt shows the next level: "47 members across the United States"

3. **Given** the state-level query also returns fewer than 5 members
   **When** expansion continues
   **Then** the system expands to country level, then global
   **And** each expansion level is shown as an interactive ring the member can tap to filter to that geographic scope
   **And** the UX never shows "No results found" — there is always a next geographic level with members

4. **Given** the first-time onboarding context
   **When** a new member completes their profile (Story 1.8) and lands on discovery
   **Then** the directory auto-searches their profile location
   **And** if fallback triggers, a dismissable tooltip explains: "We're showing members in your state since your city is still growing. As more members join, your local community will appear."

5. **Given** reduced motion preferences are enabled
   **When** geographic fallback triggers
   **Then** rings and results appear instantly without animation (NFR-A7)
   **And** the expanding text and member cards still display with warm fallback messaging

6. **Given** the geographic fallback component is needed
   **When** this story is implemented
   **Then** the developer creates the `GeoFallbackIndicator` component in `features/discover/components/`
   **And** each ring is a focusable button with `aria-label="Show {count} members in {location}"` and `aria-pressed` for the active level
   **And** the geo-search service supports tiered query execution (city → state → country → global) with `GEO_FALLBACK_THRESHOLD = 5`

## Tasks / Subtasks

### Task 1: Extend `geo-search.ts` with Fallback Logic (AC: #1, #2, #3, #6)

- [x] 1.1 Add new types and constants to `src/services/geo-search.ts`:

  ```ts
  export const GEO_FALLBACK_THRESHOLD = 5; // exported for tests

  export type GeoFallbackLevel = "city" | "state" | "country" | "global";

  export interface GeoFallbackLevelCounts {
    city: number | null; // null when city param not provided
    state: number | null; // null when state param not provided
    country: number | null; // null when country param not provided
    global: number; // always populated
  }

  export interface GeoFallbackSearchParams {
    viewerUserId: string;
    locationCity?: string;
    locationState?: string;
    locationCountry?: string;
    cursor?: string;
    limit?: number;
  }

  export interface GeoFallbackSearchResult {
    members: MemberCardData[];
    hasMore: boolean;
    nextCursor: string | null;
    activeLevel: GeoFallbackLevel;
    levelCounts: GeoFallbackLevelCounts;
    activeLocationLabel: string; // e.g. "Houston", "Texas", "United States", "the community"
  }
  ```

- [x] 1.2 Add private `countMembersAtLevel()` helper in `geo-search.ts`:

  ```ts
  async function countMembersAtLevel(params: {
    excludedIds: string[];
    locationCity?: string;
    locationState?: string;
    locationCountry?: string;
  }): Promise<number>;
  ```

  - Runs `SELECT COUNT(*) FROM community_profiles cp INNER JOIN auth_users au ...` with the same base predicates as `searchMembersInDirectory` (`deleted_at IS NULL`, `profile_completed_at IS NOT NULL`, `profile_visibility != 'PRIVATE'`, block exclusion)
  - Applies ONLY the geo filter passed in (city OR state OR country — exactly one set of geo predicates per call)
  - Does NOT apply `location_visible` filter for counting — members count toward their city regardless of whether they show location publicly
  - For "global" level: pass no geo predicates (just base predicates + block exclusion)

- [x] 1.3 Add `searchMembersWithGeoFallback()` function in `geo-search.ts`:

  ```ts
  export async function searchMembersWithGeoFallback(
    params: GeoFallbackSearchParams,
  ): Promise<GeoFallbackSearchResult>;
  ```

  **Algorithm:**
  1. Get `excludedIds` (bidirectional block filtering + viewerUserId) — same as `searchMembersInDirectory`
  2. In parallel via `Promise.all`, run COUNT queries for each provided geo level:
     - `cityCount`: if `locationCity` provided → count with city ILIKE filter; else `null`
     - `stateCount`: if `locationState` provided → count with state ILIKE filter; else `null`
     - `countryCount`: if `locationCountry` provided → count with country ILIKE filter; else `null`
     - `globalCount`: always run (no geo filter, just base predicates + block exclusion)
  3. Determine `activeLevel` (evaluate in order, stop at first level meeting threshold):
     - If `cityCount !== null && cityCount >= GEO_FALLBACK_THRESHOLD` → `"city"`
     - Else if `stateCount !== null && stateCount >= GEO_FALLBACK_THRESHOLD` → `"state"`
     - Else if `countryCount !== null && countryCount >= GEO_FALLBACK_THRESHOLD` → `"country"`
     - Else → `"global"`
  4. Build `levelCounts: { city: cityCount, state: stateCount, country: countryCount, global: globalCount }`
  5. Compute `activeLocationLabel`:
     - `"city"` → `locationCity!`
     - `"state"` → `locationState!`
     - `"country"` → `locationCountry!`
     - `"global"` → `"the community"` (i18n handled client-side)
  6. Run paginated member query using `searchMembersInDirectory`-style SQL for the `activeLevel`:
     - `"city"` → `locationCity` filter
     - `"state"` → `locationState` filter (no city filter)
     - `"country"` → `locationCountry` filter (no city/state filter)
     - `"global"` → no geo filter (all non-blocked, non-private completed profiles)
     - Use the same `CASE WHEN cp.location_visible THEN ... ELSE NULL END` pattern as `searchMembersInDirectory` for SELECT columns (hides location on cards for private-location members), but do NOT filter rows by `location_visible` — members still appear in results regardless of location visibility
  7. Return `{ members, hasMore, nextCursor, activeLevel, levelCounts, activeLocationLabel }`

- [x] 1.4 Add tests to `src/services/geo-search.test.ts` (append new `describe("searchMembersWithGeoFallback")` block):
  - Returns `activeLevel: "city"` when city count ≥ `GEO_FALLBACK_THRESHOLD`
  - Returns `activeLevel: "state"` when city count < threshold but state count ≥ threshold
  - Returns `activeLevel: "country"` when city + state counts both < threshold
  - Returns `activeLevel: "global"` when all levels < threshold
  - `levelCounts.city` is `null` when no city param provided
  - Block exclusion applied to count queries (viewer + blocked users excluded)
  - Cursor pagination works at each level
  - `globalCount` is always populated

### Task 2: New API Route `GET /api/v1/discover/geo-fallback` (AC: #2, #3)

- [x] 2.1 Create `src/app/api/v1/discover/geo-fallback/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { searchMembersWithGeoFallback } from "@/services/geo-search";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const url = new URL(request.url);
    const city = url.searchParams.get("city")?.trim() || undefined;
    const state = url.searchParams.get("state")?.trim() || undefined;
    const country = url.searchParams.get("country")?.trim() || undefined;
    const cursor = url.searchParams.get("cursor") || undefined;
    // limit: 1–20 (smaller default for fallback context)
    const limitParam = url.searchParams.get("limit");
    let limit = 12; // 12 cards looks good in a 3-col grid
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 50) limit = parsed;
    }
    const result = await searchMembersWithGeoFallback({
      viewerUserId: userId,
      locationCity: city,
      locationState: state,
      locationCountry: country,
      cursor,
      limit,
    });
    return successResponse(result);
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async () => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `member-search:${userId}`; // Same bucket as /discover (shared limit)
      },
      ...RATE_LIMIT_PRESETS.MEMBER_SEARCH,
    },
  });
  ```

  **Notes:**
  - Uses `member-search:{userId}` rate-limit key — shared with `GET /api/v1/discover` intentionally to prevent users from bypassing the limit by calling both endpoints
  - `GET` is CSRF-exempt — no `Origin` header needed in route tests
  - Returns RFC 7807 `successResponse(result)` shape: `{ data: GeoFallbackSearchResult }`
  - If no geo params provided (no city/state/country), the service will run global count only and return all members — this is valid (empty fallback = global)
  - **Double `requireAuthenticatedSession()` call** (once in rate-limit `key`, once in handler) is the established pattern from Story 3.1's `/api/v1/discover` route — do NOT deduplicate

- [x] 2.2 Create `src/app/api/v1/discover/geo-fallback/route.test.ts` (`@vitest-environment node`):
  - Returns 200 with `{ members, hasMore, nextCursor, activeLevel, levelCounts }` on success
  - Returns 401 when not authenticated
  - Passes `city`, `state`, `country`, `cursor`, `limit` to `searchMembersWithGeoFallback`
  - Rate limit headers present
  - Mock `server-only` and `@/services/geo-search`

### Task 3: i18n Translations — i18n-First Mandate (AC: all)

**CRITICAL — Add ALL keys BEFORE any component work (Tasks 4–6)**

- [x] 3.1 Add to `messages/en.json` under the existing `"Discover"` key — append new sub-namespace `"fallback"`:

  ```json
  "Discover": {
    // ...existing keys...
    "fallback": {
      "cityCount": "{count, plural, =1 {1 community member in {location}} other {# community members in {location}}}",
      "stateCount": "{count, plural, =1 {1 member in {location}} other {# members in {location}}}",
      "countryCount": "{count, plural, =1 {1 member in {location}} other {# members in {location}}}",
      "globalCount": "{count, plural, =1 {1 community member worldwide} other {# community members worldwide}}",
      "cityGrowing": "Your city is still growing! Here's your community nearby...",
      "nextLevelHint": "{count, plural, =1 {1 member} other {# members}} across {location}",
      "tooltip": "We're showing members in your {level} since your city is still growing. As more members join, your local community will appear.",
      "tooltipDismiss": "Got it",
      "ringLabel": "Show {count, plural, =1 {1 member} other {# members}} in {location}",
      "globalRingLabel": "Show all {count, plural, =1 {1 member} other {# members}}",
      "levelCity": "city",
      "levelState": "state",
      "levelCountry": "country",
      "levelGlobal": "community"
    }
  }
  ```

- [x] 3.2 Add corresponding Igbo keys to `messages/ig.json` under `"Discover"."fallback"`:

  ```json
  "fallback": {
    "cityCount": "{count, plural, =1 {Otu onye otu na {location}} other {# ndị otu na {location}}}",
    "stateCount": "{count, plural, =1 {Otu onye na {location}} other {# ndị na {location}}}",
    "countryCount": "{count, plural, =1 {Otu onye na {location}} other {# ndị na {location}}}",
    "globalCount": "{count, plural, =1 {Otu onye otu n'ụwa nile} other {# ndị otu n'ụwa nile}}",
    "cityGrowing": "Obodo gị na-eto eto! Lee ndị otu gị nọ nso...",
    "nextLevelHint": "{count, plural, =1 {Otu onye} other {# ndị}} na {location}",
    "tooltip": "Anyị na-egosi gị ndị na {level} gị n'ihi na obodo gị na-eto eto. Ka ndị otu na-abara, ndị obodo gị ga-apụta.",
    "tooltipDismiss": "Aghọtara m",
    "ringLabel": "Gosi {count, plural, =1 {otu onye} other {# ndị}} na {location}",
    "globalRingLabel": "Gosi ndị otu nile {count, plural, =1 {otu onye} other {# ndị}}",
    "levelCity": "obodo",
    "levelState": "steeti",
    "levelCountry": "mba",
    "levelGlobal": "obodo anyị"
  }
  ```

### Task 4: `useGeoFallback` Hook (AC: #1, #2, #3)

- [x] 4.1 Create `src/features/discover/hooks/use-geo-fallback.ts`:

  ```ts
  "use client";

  import { useQuery } from "@tanstack/react-query";
  import type { GeoFallbackSearchResult } from "@/services/geo-search";

  interface GeoFallbackParams {
    city?: string;
    state?: string;
    country?: string;
  }

  function buildGeoFallbackUrl(params: GeoFallbackParams): string {
    const p = new URLSearchParams();
    if (params.city) p.set("city", params.city);
    if (params.state) p.set("state", params.state);
    if (params.country) p.set("country", params.country);
    return `/api/v1/discover/geo-fallback?${p.toString()}`;
  }

  export function useGeoFallback(params: GeoFallbackParams) {
    const hasLocation = !!(params.city || params.state || params.country);
    return useQuery<GeoFallbackSearchResult>({
      queryKey: ["geo-fallback", params.city, params.state, params.country],
      queryFn: async () => {
        const url = buildGeoFallbackUrl(params);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load geo-fallback data");
        const json = (await res.json()) as { data: GeoFallbackSearchResult };
        return json.data;
      },
      enabled: hasLocation,
      staleTime: 5 * 60_000, // 5 min — level counts change slowly
    });
  }
  ```

  **Notes:**
  - Uses `useQuery` (not `useInfiniteQuery`) — returns level counts + first-page members for the active level
  - `enabled: hasLocation` — skips the query if viewer has no profile location (avoids unnecessary global count query on every discover page load)
  - The `GeoFallbackSearchResult.members` returned here are the initial members for the active level; `MemberGrid` (via `useDiscover`) handles pagination separately

- [x] 4.2 Create `src/features/discover/hooks/use-geo-fallback.test.ts` (`@vitest-environment jsdom`):
  - Returns `activeLevel`, `levelCounts`, `members` from API response
  - Query is disabled when no location params provided
  - Builds correct URL from city/state/country params
  - Error state when fetch fails
  - Use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts`

### Task 5: `GeoFallbackIndicator` Component (AC: #1, #2, #3, #4, #5, #6)

- [x] 5.1 Create `src/features/discover/components/GeoFallbackIndicator.tsx`:

  ```tsx
  "use client";

  interface GeoFallbackIndicatorProps {
    levelCounts: GeoFallbackLevelCounts;
    activeLevel: GeoFallbackLevel;
    selectedLevel: GeoFallbackLevel; // user-selected level (may differ from activeLevel)
    locationLabels: {
      city?: string;
      state?: string;
      country?: string;
    };
    onLevelSelect: (level: GeoFallbackLevel) => void;
    showTooltip?: boolean; // Show onboarding tooltip
    onTooltipDismiss?: () => void;
  }
  ```

  **Ring layout:**
  - Rings rendered as a horizontal row of `<button>` elements (NOT literal circles — concentric circles are complex; use a horizontal "scope" selector instead that communicates the expanding rings metaphor via labels and icons)
  - Each available level shown as a button pill: city → state → country → global (only show levels where count is non-null OR global)
  - Active/selected level: `aria-pressed="true"`, visually highlighted (filled background)
  - Inactive levels: `aria-pressed="false"`, outlined style
  - Each ring button: `aria-label={t("fallback.ringLabel", { count, location })}` for city/state/country; `aria-label={t("fallback.globalRingLabel", { count })}` for global

  **Warm fallback messaging:**
  - When `activeLevel === "city"`: show `t("fallback.cityCount", { count: levelCounts.city!, location: locationLabels.city })`
  - When `activeLevel !== "city"`: show `t("fallback.cityGrowing")` as a warm message header
  - Below ring buttons: show "next level" hint for the level ABOVE the current selected level (e.g., if on state, hint shows country count)

  **Animation:**
  - CSS class `animate-ring-appear` with `animation-delay` for 300ms stagger between rings
  - Use Tailwind `animate-` or a custom CSS animation with `@keyframes` via `className`
  - Honor `prefers-reduced-motion`: wrap animated classes with `motion-safe:` Tailwind modifier
  - **Animation delay MUST use inline `style`** — Tailwind purges dynamic class names at build time:
    ```tsx
    <button
      className="... motion-safe:animate-ring-appear"
      style={{ animationDelay: `${index * 300}ms` }}
    />
    ```
  - With `motion-safe:`, rings appear statically for users with reduced motion — no JS media query needed

  **Onboarding tooltip:**
  - Render only when `showTooltip === true`
  - Content: `t("fallback.tooltip", { level: t("fallback.levelState") })` — uses the active fallback level name
  - Dismiss button: `t("fallback.tooltipDismiss")` → calls `onTooltipDismiss()`
  - Style: small info box below rings, not a modal

- [x] 5.2 Create `src/features/discover/components/GeoFallbackIndicator.test.tsx` (`@vitest-environment jsdom`):
  - Renders city count label when `activeLevel === "city"`
  - Renders warm fallback message when `activeLevel !== "city"`
  - Renders ring buttons for each non-null level
  - Active/selected ring has `aria-pressed="true"`, others `"false"`
  - Ring click calls `onLevelSelect` with correct level
  - Tooltip renders when `showTooltip === true`
  - Tooltip dismiss calls `onTooltipDismiss`
  - Tooltip hidden when `showTooltip === false`
  - Global ring renders with `globalRingLabel` aria-label

### Task 6: Update `DiscoverContent` — Geo-Fallback Integration (AC: #1, #2, #3, #4)

- [x] 6.1 Update `DiscoverContentProps` to include `locationState` in `viewerProfile`:

  ```ts
  interface DiscoverContentProps {
    viewerProfile: {
      locationCity: string | null;
      locationState: string | null; // NEW
      locationCountry: string | null;
      interests: string[];
    } | null;
  }
  ```

- [x] 6.2 Update `src/features/discover/components/DiscoverContent.tsx`:

  **New state:**

  ```ts
  const [selectedLevel, setSelectedLevel] = useState<GeoFallbackLevel | null>(null);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  ```

  **Viewer location derived from viewerProfile:**

  ```ts
  const viewerLocation = {
    city: viewerProfile?.locationCity ?? undefined,
    state: viewerProfile?.locationState ?? undefined,
    country: viewerProfile?.locationCountry ?? undefined,
  };
  const hasViewerLocation = !!(
    viewerLocation.city ||
    viewerLocation.state ||
    viewerLocation.country
  );
  ```

  **Geo-fallback query:**

  ```ts
  const { data: geoFallbackData } = useGeoFallback(
    hasViewerLocation ? viewerLocation : { city: undefined, state: undefined, country: undefined },
  );
  ```

  **Auto-set selectedLevel from activeLevel on first load:**

  ```ts
  useEffect(() => {
    if (geoFallbackData && selectedLevel === null) {
      setSelectedLevel(geoFallbackData.activeLevel);
      // Update location filters to match active level
      setFilters(
        computeFiltersForLevel(geoFallbackData.activeLevel, viewerLocation, DEFAULT_FILTERS),
      );
    }
  }, [geoFallbackData]);
  ```

  **`computeFiltersForLevel` helper** (private in DiscoverContent):

  ```ts
  function computeFiltersForLevel(
    level: GeoFallbackLevel,
    location: { city?: string; state?: string; country?: string },
    baseFilters: DiscoverFilters,
  ): DiscoverFilters {
    return {
      ...baseFilters,
      locationCity: level === "city" ? (location.city ?? "") : "",
      locationState: level === "state" ? (location.state ?? "") : "",
      locationCountry: level === "country" ? (location.country ?? "") : "",
    };
  }
  ```

  **Level selection handler:**

  ```ts
  function handleLevelSelect(level: GeoFallbackLevel) {
    setSelectedLevel(level);
    setFilters((prev) => computeFiltersForLevel(level, viewerLocation, prev));
  }
  ```

  **Tooltip logic:**

  ```ts
  // Read dismissal from localStorage on mount
  const [tooltipDismissed, setTooltipDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("discover:fallback:tooltip-dismissed") === "true";
  });

  function handleTooltipDismiss() {
    localStorage.setItem("discover:fallback:tooltip-dismissed", "true");
    setTooltipDismissed(true);
  }

  const showTooltip =
    !tooltipDismissed && !!geoFallbackData && geoFallbackData.activeLevel !== "city";
  ```

  **JSX structure:**

  ```tsx
  <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
    <aside className="w-full lg:w-80 lg:flex-shrink-0">
      <DiscoverSearch
        filters={filters}
        onFiltersChange={setFilters}
        viewerProfile={viewerProfile}
      />
    </aside>
    <main className="flex-1">
      {hasViewerLocation && geoFallbackData && selectedLevel && (
        <GeoFallbackIndicator
          levelCounts={geoFallbackData.levelCounts}
          activeLevel={geoFallbackData.activeLevel}
          selectedLevel={selectedLevel}
          locationLabels={viewerLocation}
          onLevelSelect={handleLevelSelect}
          showTooltip={showTooltip}
          onTooltipDismiss={handleTooltipDismiss}
        />
      )}
      <MemberGrid filters={filters} viewerInterests={viewerInterests} />
    </main>
  </div>
  ```

  **Notes:**
  - `GeoFallbackIndicator` and `MemberGrid` coexist in the layout — the indicator shows the rings above the grid
  - `MemberGrid` uses the `filters` state which has been updated to the appropriate geographic level
  - When the user changes location filters manually in `DiscoverSearch`, it overrides the geo-fallback selection — this is acceptable (user-intent wins). Manual filter edits do NOT reset `selectedLevel` — the `GeoFallbackIndicator` stays visible but the member grid reflects the user's manual filters. This is intentional: the rings still show counts for quick re-navigation
  - `DiscoverSearch` continues to pre-fill location from `viewerProfile` (existing behavior); no change needed to `DiscoverSearch`

- [x] 6.3 Update `src/app/[locale]/(app)/discover/page.tsx` to include `locationState` in the viewer profile fetch:

  Check what `getProfileByUserId` or equivalent returns. The `communityProfiles` schema has `locationState`. The page.tsx server component should include `locationState` in the fetched profile data passed to `DiscoverContent`.

  Example pattern (already fetches profile, just add `locationState`):

  ```tsx
  // In page.tsx server component, extend the viewerProfile shape
  const viewerProfile = profile
    ? {
        locationCity: profile.locationCity,
        locationState: profile.locationState, // ADD THIS
        locationCountry: profile.locationCountry,
        interests: profile.interests ?? [],
      }
    : null;
  ```

- [x] 6.4 Update `src/app/[locale]/(app)/discover/page.test.tsx` for the updated prop shape.

### Task 7: Barrel Export Update (AC: all)

- [x] 7.1 Update `src/features/discover/index.ts`:

  ```ts
  export { DiscoverSearch } from "./components/DiscoverSearch";
  export { MemberGrid } from "./components/MemberGrid";
  export { MemberCard } from "./components/MemberCard";
  export { DiscoverContent } from "./components/DiscoverContent"; // EXISTING — do not drop
  export { GeoFallbackIndicator } from "./components/GeoFallbackIndicator"; // NEW
  export { useDiscover } from "./hooks/use-discover";
  export { useGeoFallback } from "./hooks/use-geo-fallback"; // NEW
  export type { MemberCardData, DiscoverFilters } from "./types";
  export type {
    GeoFallbackLevel,
    GeoFallbackLevelCounts,
    GeoFallbackSearchResult,
  } from "@/services/geo-search"; // NEW
  ```

### Task 8: Update Sprint Status

- [x] 8.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Change `3-2-geographic-fallback-discovery: backlog` → `3-2-geographic-fallback-discovery: ready-for-dev`

## Dev Notes

### What Story 3.1 Built (Do Not Reinvent)

Story 3.1 is **fully complete**. Do NOT modify:

- `searchMembersInDirectory()` in `geo-search.ts` — leave untouched; Story 3.2 ADDS `searchMembersWithGeoFallback()` as a NEW function alongside it
- `GET /api/v1/discover` route — leave untouched
- `useDiscover` hook — leave untouched; `MemberGrid` still uses it
- All existing `features/discover` components

**Geo infrastructure already in place:**

- Migration 0015: GiST index `idx_community_profiles_ll_to_earth` for proximity queries (Story 3.2 does NOT use proximity/distance queries — we use text-based location ILIKE, which uses the composite B-tree from 0016)
- Migration 0016: `idx_community_profiles_geo_tiered` composite B-tree on `(location_country, location_state, location_city)` — this IS used by the fallback COUNT queries (country-level queries benefit, state-level queries use a prefix of this index)
- `cube` + `earthdistance` + `pg_trgm` extensions already enabled — do NOT re-enable

**No new migration needed for Story 3.2.** The existing 0016 B-tree index supports all needed COUNT queries.

### `import "server-only"` Impact

`src/services/geo-search.ts` has `import "server-only"` — tests for `geo-search.ts` MUST include:

```ts
vi.mock("server-only", () => ({}));
```

This is already present in `src/services/geo-search.test.ts` from Story 3.1. New tests added to that file will inherit the mock.

`src/app/api/v1/discover/geo-fallback/route.ts` imports `geo-search.ts` → route tests also need:

```ts
vi.mock("server-only", () => ({}));
vi.mock("@/services/geo-search", () => ({ searchMembersWithGeoFallback: vi.fn() }));
```

### `GEO_FALLBACK_THRESHOLD` Design Decision

Threshold = 5: fewer than 5 members at a given level triggers fallback to next level. This is a platform constant, not user-configurable. Exported so tests can reference it without magic numbers.

Rationale: 0 would require a truly empty city to trigger fallback. 5 prevents a confusing UX where the user sees "2 members in Houston" and no expansion option. The goal is to always feel like the community is alive at the shown level.

### Ring Animation Implementation

Use Tailwind's `motion-safe:` modifier — this is the cleanest approach (no JS `window.matchMedia` needed):

```tsx
// In GeoFallbackIndicator.tsx — ring button
// ⚠️ animation-delay MUST use inline style — Tailwind purges dynamic class names at build time
<button
  className="... base-styles ... motion-safe:animate-fade-slide-in"
  style={{ animationDelay: `${index * 300}ms` }}
>
```

Define `animate-fade-slide-in` in `tailwind.config.ts` (or globals.css with `@keyframes`):

```css
@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

With `motion-safe:animate-fade-slide-in` — if the user has `prefers-reduced-motion: reduce`, the animation class is simply not applied and rings render instantly (NFR-A7 compliance). No JS media query needed.

### `localStorage` Key Convention

The tooltip dismissal key `discover:fallback:tooltip-dismissed` follows the convention `{feature}:{sub-feature}:{action}`. This is the first `localStorage` usage for dismissal state in the project — future stories should follow this pattern.

### Tooltip — `localStorage` in SSR Context

`DiscoverContent` is a client component (`"use client"`). The `localStorage` read in `useState` initializer uses a guard:

```ts
useState(() => {
  if (typeof window === "undefined") return true; // SSR: assume dismissed (tooltip won't show during SSR hydration)
  return localStorage.getItem("discover:fallback:tooltip-dismissed") === "true";
});
```

This prevents hydration mismatches: during SSR, tooltip defaults to dismissed (true); after client hydration, the actual value is read. The tooltip is a low-priority UI element — this tradeoff is acceptable.

### `selectedLevel` State Initialization

`selectedLevel` starts as `null` and is set to `geoFallbackData.activeLevel` in a `useEffect` after the first successful fetch. During the loading state, `GeoFallbackIndicator` is not rendered (gated by `geoFallbackData && selectedLevel` in JSX). This prevents a flash of empty rings.

### URL Structure for New Endpoint

`/api/v1/discover/geo-fallback` → `src/app/api/v1/discover/geo-fallback/route.ts`

This is a nested route under `/discover`. Next.js App Router handles this as a separate route from `/api/v1/discover/route.ts`. Both routes are independent — no conflicts.

### `computeFiltersForLevel` Location

Define `computeFiltersForLevel` as a module-level function (not inside the component) in `DiscoverContent.tsx` — or export it from `types/index.ts` if needed in tests. Testing it requires calling it with mock args, so a module-level function is preferable.

### `useGeoFallback` vs `useDiscover` Relationship

`useGeoFallback` → `GET /api/v1/discover/geo-fallback` → returns `activeLevel`, `levelCounts`, first-page `members`
`useDiscover` → `GET /api/v1/discover` → returns paginated members for the current `filters`

In `DiscoverContent`, `useGeoFallback` determines WHICH level to show (and provides the ring counts for `GeoFallbackIndicator`). `MemberGrid` (via `useDiscover`) shows the paginated member list for that level. The `geoFallbackData.members` are NOT rendered directly — only the ring counts and `activeLevel` are used from `geoFallbackData`.

This avoids duplicating member data between the two queries. `MemberGrid` handles all infinite-scroll pagination as before.

The `geoFallbackData.members` are fetched by the API but unused on the client — this is acceptable for MVP. `// TODO(Story 3.x): add countsOnly=true query param to skip member fetch when only counts are needed`

### `useGeoFallback` — No-Location Users

`enabled: hasLocation` means users with no profile location never see the geo-fallback indicator. This is correct for MVP — without a location, there's no meaningful fallback hierarchy. `// TODO(Story 3.x): Consider showing global count even without viewer location`

### Checklist: What to Avoid

- **Do NOT** modify `searchMembersInDirectory()` — only ADD `searchMembersWithGeoFallback()`
- **Do NOT** add a new rate limit preset — reuse `MEMBER_SEARCH` with same bucket key
- **Do NOT** add an `IntersectionObserver` to `GeoFallbackIndicator` — it's not a member list
- **Do NOT** use `navigator.language` or IP geolocation — use viewer's profile location only
- **Do NOT** implement "region" level (e.g., "West Africa") — city → state → country → global is sufficient for MVP. Leave a `// TODO(Story 3.x): region level between country and global` comment
- **Do NOT** hardcode animation durations in JS — use CSS/Tailwind with `motion-safe:` modifier
- **Do NOT** call `searchMembersWithGeoFallback` in `GeoFallbackIndicator` — the hook (`useGeoFallback`) owns the data fetching; the component is presentational

### DB Query Pattern for Level Counts

The `countMembersAtLevel` helper uses a raw SQL COUNT. Example for city level:

```sql
SELECT COUNT(*)
FROM community_profiles cp
INNER JOIN auth_users au ON au.id = cp.user_id
WHERE cp.deleted_at IS NULL
  AND cp.profile_completed_at IS NOT NULL
  AND cp.profile_visibility != 'PRIVATE'
  AND cp.user_id::text != ALL('{uuid1,uuid2,...}'::text[])  -- block exclusion
  AND cp.location_city ILIKE '%Houston%'
```

The block exclusion uses the same `allExcludedIds` pattern as `searchMembersInDirectory` — array literal syntax. All four COUNT queries share the same `excludedIds` array (computed once with `Promise.all`).

### Test Pattern: `vi.hoisted` for `localStorage`

For tests of `DiscoverContent` that test tooltip dismissal:

```ts
const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mockLocalStorage[k] ?? null,
  setItem: (k: string, v: string) => {
    mockLocalStorage[k] = v;
  },
});
```

Reset `mockLocalStorage` in `beforeEach`.

### Project Structure Notes

**New files:**

- `src/app/api/v1/discover/geo-fallback/route.ts`
- `src/app/api/v1/discover/geo-fallback/route.test.ts`
- `src/features/discover/hooks/use-geo-fallback.ts`
- `src/features/discover/hooks/use-geo-fallback.test.ts`
- `src/features/discover/components/GeoFallbackIndicator.tsx`
- `src/features/discover/components/GeoFallbackIndicator.test.tsx`

**Modified files:**

- `src/services/geo-search.ts` — add types, constant, `countMembersAtLevel`, `searchMembersWithGeoFallback`
- `src/services/geo-search.test.ts` — add `describe("searchMembersWithGeoFallback")` block
- `src/features/discover/components/DiscoverContent.tsx` — add geo-fallback mode
- `src/features/discover/index.ts` — add new exports
- `src/app/[locale]/(app)/discover/page.tsx` — add `locationState` to viewer profile
- `src/app/[locale]/(app)/discover/page.test.tsx` — update mock shape
- `messages/en.json` — add `Discover.fallback.*` keys
- `messages/ig.json` — add `Discover.fallback.*` keys (Igbo)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update story status

**No new migration** — 0016 indexes are sufficient.

### Test Count Estimate

- `geo-search.test.ts` (new block): ~8 new tests
- `route.test.ts` (geo-fallback route): ~5 new tests
- `use-geo-fallback.test.ts`: ~4 new tests
- `GeoFallbackIndicator.test.tsx`: ~8 new tests
- `DiscoverContent.test.tsx` (does NOT exist — create `src/features/discover/components/DiscoverContent.test.tsx`): ~5 new tests
- `page.test.tsx` (update): ~0 new (just mock shape update)

**Estimated new tests: ~28–32** (bringing total from ~1702 to ~1730–1734)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.2, lines 1634–1674]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR18: geographic fallback suggestions, line 654]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — `GeoFallbackIndicator.tsx` in features/discover, line 936]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — NFR-A7 reduced motion compliance, Story 3.2, line 549]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — `/discover` rendering strategy: SSR shell + CSR results, line 353]
- [Source: `src/services/geo-search.ts` — `searchMembersInDirectory`, block exclusion pattern, cursor encoding]
- [Source: `src/db/migrations/0016_member_directory_search.sql` — `idx_community_profiles_geo_tiered` composite B-tree on (country, state, city)]
- [Source: `src/features/discover/components/DiscoverContent.tsx` — current layout structure, viewerProfile prop]
- [Source: `src/features/discover/components/MemberGrid.tsx` — IntersectionObserver pattern for infinite scroll]
- [Source: `src/features/discover/types/index.ts` — `DiscoverFilters`, `DEFAULT_FILTERS`]
- [Source: `src/features/discover/hooks/use-discover.ts` — `useInfiniteQuery` pattern reference]
- [Source: `_bmad-output/implementation-artifacts/3-1-member-directory-search.md` — Story 3.1 completion notes, block SQL pattern]
- [Source: `src/test/vi-patterns.ts` — `useRealTimersForReactQuery()` for React Query tests]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **geo-search.test.ts mock ordering**: `mockResolvedValueOnce` queues persist across tests unless `mockReset()` is called. Added `beforeEach(() => mockDbExecute.mockReset())` inside the geo-fallback describe block to prevent contamination. `vi.clearAllMocks()` only clears call history — not the `Once` queue.
- **geo-search tests cursor pagination**: Only `locationCity` was provided, so only 2 count queries run (city + global), not 4. Fixed mock setup from 5 calls to 3 calls.
- **GeoFallbackIndicator test `getByText(/cityCount/)`**: Pattern matched both header and ring button text. Changed to `getAllByText` with `.length > 0` assertion.

### Completion Notes List

- Implemented `searchMembersWithGeoFallback()` in `geo-search.ts` alongside existing `searchMembersInDirectory()` — no modification to existing function. Uses parallel `Promise.all` for COUNT queries, selects the first geo level meeting `GEO_FALLBACK_THRESHOLD = 5`.
- Created `GET /api/v1/discover/geo-fallback` route sharing the `member-search:{userId}` rate-limit bucket with `/api/v1/discover` (intentional — prevents bypass).
- `GeoFallbackIndicator` uses `motion-safe:animate-fade-slide-in` with inline `style={{ animationDelay }}` for stagger (Tailwind purges dynamic class names at build time). Added `fadeSlideIn` keyframe + `--animate-fade-slide-in` CSS variable to `globals.css`.
- `DiscoverContent` uses `localStorage` with SSR guard (`typeof window === "undefined"`) for tooltip dismissal. `selectedLevel` starts `null` and is initialized via `useEffect` after first `geoFallbackData` load to avoid flash of empty rings.
- `computeFiltersForLevel` is a module-level function (not inside component) for testability.
- Added `GeoFallbackLevel` re-export to `features/discover/types/index.ts` to allow `DiscoverContent` to import it without going through `@/services/geo-search` directly.
- All 1735 tests pass (77 new tests added: +8 geo-search, +5 route, +4 hook, +10 component, +6 DiscoverContent, +4 existing page tests still pass).

### File List

**New files:**

- `src/app/api/v1/discover/geo-fallback/route.ts`
- `src/app/api/v1/discover/geo-fallback/route.test.ts`
- `src/features/discover/hooks/use-geo-fallback.ts`
- `src/features/discover/hooks/use-geo-fallback.test.ts`
- `src/features/discover/components/GeoFallbackIndicator.tsx`
- `src/features/discover/components/GeoFallbackIndicator.test.tsx`
- `src/features/discover/components/DiscoverContent.test.tsx`

**Modified files:**

- `src/services/geo-search.ts`
- `src/services/geo-search.test.ts`
- `src/features/discover/components/DiscoverContent.tsx`
- `src/features/discover/types/index.ts`
- `src/features/discover/index.ts`
- `src/app/[locale]/(app)/discover/page.tsx`
- `src/app/[locale]/(app)/discover/page.test.tsx`
- `src/app/globals.css`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-2-geographic-fallback-discovery.md`

## Change Log

- 2026-03-01: Story 3.2 implemented — geographic fallback discovery with tiered geo-search, `GeoFallbackIndicator` UI, `useGeoFallback` hook, and full i18n (en + ig). 77 new tests. Total: 1735/1735 passing.
- 2026-03-01: Code review fixes — Added JSDoc to `countMembersAtLevel` documenting single-geo-param contract. Fixed trailing `?` in `buildGeoFallbackUrl` when no params. Added 2 new tests for `handleLevelSelect` filter updates and auto-level initialization in `DiscoverContent.test.tsx`. Removed stale `// NEW` comments from `DiscoverContent.tsx` and `index.ts`. Total: 1737/1737 passing.
