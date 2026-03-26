# Story 3.1: Member Directory & Search

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to search the member directory by name, location, skills, interests, and language,
So that I can find and connect with community members who share my interests or live near me.

## Acceptance Criteria

1. **Directory loads with search interface** — When a member navigates to `/discover`, the page renders a search interface with:
   - A text search field (searches name, bio, interests, location via FTS)
   - A location field pre-filled from the member's own profile city/country
   - Filter options: interests (multi-select), language, membership tier
   - The page renders with an SSR shell and CSR search results per architecture rendering strategy

2. **Search results display member cards** — When results are returned:
   - Member cards show: avatar, display name, location (city/country), bio snippet (truncated), shared interests count, and a prominent "Message" button
   - Verification badge slot is reserved but displays nothing (badge system not yet built — Epic 8)
   - Results load within 1 second (NFR-P9)
   - Cursor-based pagination with infinite scroll
   - Card layout: single column on mobile, 2-column grid on tablet, 3-column grid on desktop

3. **Profile click shows full public profile** — When a member clicks a card:
   - The existing `/profiles/[userId]` page loads the full public profile (name, photo, bio, location, interests, cultural connections, languages, social links)
   - Profile respects the viewed member's visibility settings (PUBLIC_TO_MEMBERS / LIMITED / PRIVATE per Story 1.9) — PRIVATE profiles NEVER appear in directory results
   - "Message" button on the full profile page is already implemented (Story 2.2)

4. **Block enforcement** — When search results are returned:
   - Members the searcher has blocked do NOT appear in results
   - Members who have blocked the searcher do NOT appear in results (bidirectional)
   - The viewer's own profile does NOT appear in results
   - This applies both to the member card grid and to any future search autocomplete

5. **FTS indexes + geo-search service** — When this story is implemented:
   - Migration 0016 creates a GIN index on `community_profiles` for FTS on name, bio, interests, location fields, and a composite B-tree index on `(location_country, location_state, location_city)` for tiered geographic fallback queries
   - `src/services/geo-search.ts` is created with `searchMembersInDirectory()` implementing FTS + filter + bidirectional block exclusion + cursor-based pagination
   - `src/features/discover` module is created with `DiscoverSearch`, `MemberGrid`, `MemberCard` components and `use-discover` hook

## Tasks / Subtasks

### Task 1: Migration 0016 — FTS GIN Index + Composite Geo Index (AC: #5)

- [x] 1.1 Create `src/db/migrations/0016_member_directory_search.sql`:

  ```sql
  -- GIN index for member directory full-text search.
  -- Covers: display_name, bio, location fields, interests array, languages array.
  -- Partial index: only active completed profiles (reduces index size and cost).
  -- Prerequisites: pg_trgm already enabled (0000_extensions.sql).
  CREATE INDEX IF NOT EXISTS idx_community_profiles_fts
    ON community_profiles
    USING gin(
      to_tsvector('english',
        COALESCE(display_name, '') || ' ' ||
        COALESCE(bio, '') || ' ' ||
        COALESCE(location_city, '') || ' ' ||
        COALESCE(location_state, '') || ' ' ||
        COALESCE(location_country, '') || ' ' ||
        array_to_string(interests, ' ') || ' ' ||
        array_to_string(languages, ' ')
      )
    )
    WHERE deleted_at IS NULL AND profile_completed_at IS NOT NULL;

  -- Composite B-tree index supporting tiered geographic fallback queries
  -- (country → state → city joins). The single-column indexes from 0005 remain
  -- but this composite covers multi-predicate WHERE clauses more efficiently.
  CREATE INDEX IF NOT EXISTS idx_community_profiles_geo_tiered
    ON community_profiles (location_country, location_state, location_city)
    WHERE deleted_at IS NULL AND profile_completed_at IS NOT NULL;
  ```

  - Do NOT use drizzle-kit generate (fails with `server-only` error) — hand-write SQL only.
  - These are partial indexes scoped to active, completed profiles — query WHERE clauses must include `deleted_at IS NULL AND profile_completed_at IS NOT NULL` to hit the index.

### Task 2: Rate Limit Preset (AC: all)

- [x] 2.1 Add to `src/services/rate-limiter.ts` in `RATE_LIMIT_PRESETS`:

  ```ts
  // Story 3.1 additions
  MEMBER_SEARCH: { maxRequests: 60, windowMs: 60_000 }, // 60/min per userId
  ```

### Task 3: `geo-search.ts` Service — `searchMembersInDirectory()` (AC: #1, #2, #4, #5)

- [x] 3.1 Create `src/services/geo-search.ts`:

  ```ts
  import "server-only";
  import { sql } from "drizzle-orm";
  import { db } from "@/db";
  import { getBlockedUserIds, getUsersWhoBlocked } from "@/db/queries/block-mute";

  export interface DirectorySearchParams {
    viewerUserId: string;
    query?: string; // FTS text search (name, bio, interests, location)
    locationCity?: string; // Text-based location filter
    locationState?: string;
    locationCountry?: string;
    interests?: string[]; // Array overlap filter on interests field
    language?: string; // Single language (array-contains filter)
    membershipTier?: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
    cursor?: string; // Opaque base64 cursor (encodes { createdAt, userId })
    limit?: number;
  }

  export interface MemberCardData {
    userId: string;
    displayName: string;
    photoUrl: string | null;
    locationCity: string | null;
    locationState: string | null;
    locationCountry: string | null;
    interests: string[];
    languages: string[];
    membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
    bio: string | null;
  }

  export interface DirectorySearchResult {
    members: MemberCardData[];
    hasMore: boolean;
    nextCursor: string | null;
  }

  /** Encode cursor as opaque base64 JSON string. */
  function encodeCursor(createdAt: Date, userId: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), userId })).toString(
      "base64url",
    );
  }

  /** Decode cursor or return null on invalid input. */
  function decodeCursor(cursor: string): { createdAt: Date; userId: string } | null {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as {
        createdAt: string;
        userId: string;
      };
      if (!parsed.createdAt || !parsed.userId) return null;
      return { createdAt: new Date(parsed.createdAt), userId: parsed.userId };
    } catch {
      return null;
    }
  }

  /**
   * Search the member directory with full-text, location, interests, language, and
   * tier filters. Enforces bidirectional block filtering and profile visibility rules.
   * Returns cursor-paginated results (newest first).
   */
  export async function searchMembersInDirectory(
    params: DirectorySearchParams,
  ): Promise<DirectorySearchResult> {
    const {
      viewerUserId,
      query,
      locationCity,
      locationState,
      locationCountry,
      interests,
      language,
      membershipTier,
      cursor,
      limit: rawLimit,
    } = params;

    const safeLimit = Math.min(Math.max(1, rawLimit ?? 20), 50);

    // Bidirectional block filtering: load both directions then merge
    const [blockedByViewer, blockersOfViewer] = await Promise.all([
      getBlockedUserIds(viewerUserId),
      getUsersWhoBlocked(viewerUserId),
    ]);
    const allExcludedIds = [...new Set([...blockedByViewer, ...blockersOfViewer, viewerUserId])];

    // Decode cursor
    let cursorCreatedAt: Date | null = null;
    let cursorUserId: string | null = null;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        cursorCreatedAt = decoded.createdAt;
        cursorUserId = decoded.userId;
      }
    }

    const rows = await db.execute(sql`
      SELECT
        cp.user_id::text                        AS user_id,
        cp.display_name,
        cp.bio,
        cp.photo_url,
        CASE WHEN cp.location_visible THEN cp.location_city ELSE NULL END   AS location_city,
        CASE WHEN cp.location_visible THEN cp.location_state ELSE NULL END  AS location_state,
        CASE WHEN cp.location_visible THEN cp.location_country ELSE NULL END AS location_country,
        cp.interests,
        cp.languages,
        cp.created_at,
        au.membership_tier::text                AS membership_tier
      FROM community_profiles cp
      INNER JOIN auth_users au ON au.id = cp.user_id
      WHERE cp.deleted_at IS NULL
        AND cp.profile_completed_at IS NOT NULL
        AND cp.profile_visibility != 'PRIVATE'
        ${
          allExcludedIds.length > 0
            ? sql`AND cp.user_id::text != ALL(${`{${allExcludedIds.join(",")}}`}::text[])`
            : sql``
        }
        ${
          query && query.trim().length >= 2
            ? sql`AND to_tsvector('english',
        COALESCE(cp.display_name, '') || ' ' ||
        COALESCE(cp.bio, '') || ' ' ||
        COALESCE(cp.location_city, '') || ' ' ||
        COALESCE(cp.location_state, '') || ' ' ||
        COALESCE(cp.location_country, '') || ' ' ||
        array_to_string(cp.interests, ' ') || ' ' ||
        array_to_string(cp.languages, ' ')
      ) @@ plainto_tsquery('english', ${query.trim()})`
            : sql``
        }
        ${locationCity ? sql`AND cp.location_city ILIKE ${"%" + locationCity + "%"}` : sql``}
        ${locationState ? sql`AND cp.location_state ILIKE ${"%" + locationState + "%"}` : sql``}
        ${locationCountry ? sql`AND cp.location_country ILIKE ${"%" + locationCountry + "%"}` : sql``}
        ${
          interests && interests.length > 0
            ? sql`AND cp.interests && ${`{${interests.map((i) => `"${i.replace(/"/g, '\\"')}"`).join(",")}}`}::text[]`
            : sql``
        }
        ${language ? sql`AND cp.languages @> ARRAY[${language}]::text[]` : sql``}
        ${membershipTier ? sql`AND au.membership_tier = ${membershipTier}` : sql``}
        ${
          cursorCreatedAt && cursorUserId
            ? sql`AND (cp.created_at, cp.user_id::text) < (${cursorCreatedAt}, ${cursorUserId})`
            : sql``
        }
      ORDER BY cp.created_at DESC, cp.user_id DESC
      LIMIT ${safeLimit + 1}
    `);

    const allRows = rows as Array<Record<string, unknown>>;
    const hasMore = allRows.length > safeLimit;
    const pageRows = hasMore ? allRows.slice(0, safeLimit) : allRows;

    const members: MemberCardData[] = pageRows.map((row) => ({
      userId: String(row.user_id),
      displayName: String(row.display_name),
      bio: row.bio ? String(row.bio) : null,
      photoUrl: row.photo_url ? String(row.photo_url) : null,
      locationCity: row.location_city ? String(row.location_city) : null,
      locationState: row.location_state ? String(row.location_state) : null,
      locationCountry: row.location_country ? String(row.location_country) : null,
      interests: Array.isArray(row.interests) ? (row.interests as string[]) : [],
      languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
      membershipTier: String(row.membership_tier) as MemberCardData["membershipTier"],
    }));

    const lastRow = pageRows.at(-1);
    const nextCursor =
      hasMore && lastRow ? encodeCursor(lastRow.created_at as Date, String(lastRow.user_id)) : null;

    return { members, hasMore, nextCursor };
  }
  ```

  - `geo-search.ts` has `import "server-only"` — not callable from client components directly; accessed only via API routes or server actions.
  - Uses `plainto_tsquery` (not `to_tsquery` or `websearch_to_tsquery`) for safe user-input handling — no special syntax parsing required.
  - FTS minimum query length: 2 chars (shorter than message search's 3-char minimum — name searches are often short).
  - Block filtering via two DB queries + de-duplication with `Set`. `Promise.all()` parallelises them.
  - The `allExcludedIds.join(",")` pattern (same as block filtering in Story 2.7's `getUserConversations`) — passes as PostgreSQL array literal.
  - `interests` array filter builds a PostgreSQL array literal via string concatenation with `i.replace(/"/g, '\\"')` — safe for tag-like interests (no freeform input). If interests were freeform, use parameterized `ARRAY[...]::text[]` instead.
  - `locationVisible` privacy: SQL uses `CASE WHEN cp.location_visible THEN ... ELSE NULL END` — members who set `locationVisible: false` (Story 1.9) get their location hidden in directory cards, but still appear in results (they're not excluded). FTS and location filter still work on the raw fields for matching, but the card only displays location if the member allows it.
  - Cursor encodes `(created_at DESC, user_id DESC)` — stable sort because UUIDs break ties deterministically.
  - `safeLimit + 1` trick for `hasMore` detection (same as Story 2.2's `getUserConversations`).

- [x] 3.2 Write tests at `src/services/geo-search.test.ts` (`@vitest-environment node`):
  - `searchMembersInDirectory`: returns members matching FTS query
  - Returns empty array when no matches
  - Excludes PRIVATE profiles even if FTS matches
  - Excludes blocked users (bidirectional)
  - Excludes viewer's own profile
  - Applies membershipTier filter when provided
  - Applies interests overlap filter when provided
  - Applies language filter when provided
  - Cursor pagination: second page returns next batch
  - `hasMore: true` when results exceed limit, `false` otherwise
  - Returns `null` location fields when member has `locationVisible: false`

### Task 4: API Route — Member Directory Search (AC: #1, #2, #4)

- [x] 4.1 Create `src/app/api/v1/discover/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { searchMembersInDirectory } from "@/services/geo-search";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? undefined;
    const city = url.searchParams.get("city")?.trim() || undefined;
    const state = url.searchParams.get("state")?.trim() || undefined;
    const country = url.searchParams.get("country")?.trim() || undefined;
    const interests = url.searchParams.getAll("interests").filter(Boolean);
    const language = url.searchParams.get("language") || undefined;
    const tier = url.searchParams.get("tier") as "BASIC" | "PROFESSIONAL" | "TOP_TIER" | undefined;
    const cursor = url.searchParams.get("cursor") || undefined;
    const limitParam = url.searchParams.get("limit");

    let limit = 20;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 50) limit = parsed;
    }

    const validTiers = ["BASIC", "PROFESSIONAL", "TOP_TIER", undefined];
    const safeTier = validTiers.includes(tier) ? tier : undefined;

    const result = await searchMembersInDirectory({
      viewerUserId: userId,
      query: q,
      locationCity: city,
      locationState: state,
      locationCountry: country,
      interests: interests.length > 0 ? interests : undefined,
      language,
      membershipTier: safeTier,
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
        return `member-search:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.MEMBER_SEARCH,
    },
  });
  ```

  - Rate-limit key function and handler both call `requireAuthenticatedSession()` — this is intentional; `withApiHandler` evaluates the rate-limit key BEFORE calling the handler, so both calls are needed.
  - GET is CSRF-exempt — no `Origin` header needed in tests.
  - `interests` uses `getAll("interests")` to support repeated `?interests=X&interests=Y` query param syntax.
  - Invalid tier values are silently ignored (no 400 — client may pass stale values).

- [x] 4.2 Write tests at `src/app/api/v1/discover/route.test.ts` (`@vitest-environment node`):
  - Returns 200 with `{ members, hasMore, nextCursor }` on success
  - Returns 401 when not authenticated
  - Passes `query`, `city`, `country`, `interests`, `language`, `tier`, `cursor`, `limit` to `searchMembersInDirectory`
  - Invalid `tier` value is coerced to undefined (no error)
  - Rate limit headers present in response

### Task 5: `features/discover` Module — Types (AC: all)

- [x] 5.1 Create `src/features/discover/types/index.ts`:

  ```ts
  import type { MemberCardData } from "@/services/geo-search";

  export type { MemberCardData };

  export interface DiscoverFilters {
    query: string;
    locationCity: string;
    locationState: string;
    locationCountry: string;
    interests: string[];
    language: string;
    membershipTier: "" | "BASIC" | "PROFESSIONAL" | "TOP_TIER";
  }

  export const DEFAULT_FILTERS: DiscoverFilters = {
    query: "",
    locationCity: "",
    locationState: "",
    locationCountry: "",
    interests: [],
    language: "",
    membershipTier: "",
  };
  ```

### Task 6: `use-discover` Hook — TanStack `useInfiniteQuery` (AC: #1, #2)

- [x] 6.1 Create `src/features/discover/hooks/use-discover.ts`:

  ```ts
  "use client";

  import { useInfiniteQuery } from "@tanstack/react-query";
  import type { DiscoverFilters } from "../types";
  import type { MemberCardData } from "@/services/geo-search";

  function buildDiscoverUrl(filters: DiscoverFilters, cursor?: string): string {
    const params = new URLSearchParams();
    if (filters.query) params.set("q", filters.query);
    if (filters.locationCity) params.set("city", filters.locationCity);
    if (filters.locationState) params.set("state", filters.locationState);
    if (filters.locationCountry) params.set("country", filters.locationCountry);
    filters.interests.forEach((i) => params.append("interests", i));
    if (filters.language) params.set("language", filters.language);
    if (filters.membershipTier) params.set("tier", filters.membershipTier);
    if (cursor) params.set("cursor", cursor);
    return `/api/v1/discover?${params.toString()}`;
  }

  export function useDiscover(filters: DiscoverFilters) {
    return useInfiniteQuery<
      { members: MemberCardData[]; hasMore: boolean; nextCursor: string | null },
      Error,
      { pages: Array<{ members: MemberCardData[]; hasMore: boolean; nextCursor: string | null }> },
      (string | string[])[],
      string | undefined
    >({
      queryKey: [
        "discover",
        filters.query,
        filters.locationCity,
        filters.locationState,
        filters.locationCountry,
        filters.interests,
        filters.language,
        filters.membershipTier,
      ],
      queryFn: async ({ pageParam }) => {
        const url = buildDiscoverUrl(filters, pageParam);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load members");
        const json = (await res.json()) as {
          data: { members: MemberCardData[]; hasMore: boolean; nextCursor: string | null };
        };
        return json.data;
      },
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 60_000, // 1 minute — directory is read-heavy, tolerate slight staleness
    });
  }
  ```

  - Uses `useInfiniteQuery` (same pattern as `useConversations` from Story 2.2 — study that hook for patterns).
  - `queryKey` includes all filter values — any filter change invalidates the query and restarts from page 1.
  - `staleTime: 60_000` — tolerate 1 minute of staleness (directory data is not real-time). Also mitigates rapid API calls when user selects multiple interests/filters in quick succession — React Query deduplicates in-flight requests for the same queryKey.
  - `queryKey` includes `filters.interests` as a nested array (NOT spread) — React Query does deep comparison, and spreading would cause queryKey collisions between different filter states.

- [x] 6.2 Write tests at `src/features/discover/hooks/use-discover.test.ts` (`@vitest-environment jsdom`):
  - Fetches first page on mount
  - `getNextPageParam` returns next cursor when `hasMore: true`
  - `getNextPageParam` returns `undefined` when `hasMore: false`
  - Query key changes when filters change (new fetch triggered)
  - Use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` for tests involving `waitFor`

### Task 7: `MemberCard` Component (AC: #2, #3, #4)

- [x] 7.1 Create `src/features/discover/components/MemberCard.tsx`:

  ```tsx
  "use client";
  // Props: member data, viewer interests (for shared count), Message button handler.
  // On card click: navigate to /profiles/[userId].
  // Message button: calls createOrFindDirectConversation (same pattern as ProfileView.tsx).

  interface MemberCardProps {
    member: MemberCardData;
    viewerInterests: string[];
    onMessage: (userId: string) => void; // Parent handles navigation after action
  }
  ```

  - **Avatar**: use existing `Avatar` component from `@/components/shared/Avatar` or `@/components/ui/avatar`.
  - **Shared interests count**: `const sharedCount = member.interests.filter(i => viewerInterests.includes(i)).length` — computed client-side from returned arrays.
  - **Verification badge slot**: render nothing (`null`) — badge system not yet built. Leave a `{/* TODO(Epic 8): BadgeDisplay */}` comment.
  - **Location**: show `city, country` if both available; city only, country only, or nothing if absent.
  - **Bio snippet**: truncate to 80 characters with `...` using CSS `line-clamp-2` or JS truncation.
  - **Message button**: `createOrFindDirectConversation(member.userId)` action (same as `ProfileView.tsx:MessageButton`) → on success, `router.push(/[locale]/chat/[conversationId])`.
  - **Card click**: `router.push(/[locale]/profiles/[userId])` — routes to existing profile page.
  - **`aria-label`**: `"View profile of {displayName}"` on card root.
  - **44px minimum tap targets** (NFR-A5): ensure Message button meets this.
  - All user-visible strings via `useTranslations("Discover")`.

- [x] 7.2 Write tests at `src/features/discover/components/MemberCard.test.tsx` (`@vitest-environment jsdom`):
  - Renders displayName, bio snippet, location
  - Shows shared interests count when viewer shares interests
  - Shows 0 shared interests when none in common
  - Message button calls `createOrFindDirectConversation`
  - Card click navigates to profile page
  - Renders gracefully when optional fields (bio, location) are null

### Task 8: `MemberGrid` Component — Responsive Grid + Infinite Scroll (AC: #2)

- [x] 8.1 Create `src/features/discover/components/MemberGrid.tsx`:

  ```tsx
  "use client";
  // Renders all members from all pages of useInfiniteQuery.
  // Infinite scroll: uses IntersectionObserver sentinel at bottom; calls fetchNextPage.
  // Layout: 1 col mobile, 2 col tablet (md:), 3 col desktop (lg:)
  // Loading: shows MemberCardSkeleton placeholders while isPending
  // Empty state: shows friendly message when !isPending && members.length === 0

  interface MemberGridProps {
    filters: DiscoverFilters;
    viewerInterests: string[];
  }
  ```

  - Uses `useDiscover(filters)` hook internally.
  - All members = `data?.pages.flatMap(p => p.members) ?? []`.
  - **IntersectionObserver pattern** for infinite scroll: same pattern as `ConversationList`'s sentinel or similar existing implementation. Use `useRef` on a bottom sentinel `<div>`, observe it, call `fetchNextPage()` when it enters viewport and `hasNextPage`.
  - **Skeleton**: create `MemberCardSkeleton.tsx` alongside (5 placeholder cards while loading initial page).
  - **Empty state**: "No members found. Try adjusting your filters." i18n key: `Discover.noResults`.
  - **Error state**: "Failed to load members. Please try again." with retry button.
  - Use `useRealTimersForReactQuery()` in tests.

- [x] 8.2 Create `src/features/discover/components/MemberCardSkeleton.tsx`:
  - Skeleton version of `MemberCard` using shadcn `<Skeleton />` component (already used elsewhere in app).
  - Same card dimensions as `MemberCard` to prevent layout shift.

- [x] 8.3 Write tests at `src/features/discover/components/MemberGrid.test.tsx` (`@vitest-environment jsdom`):
  - Renders skeleton cards while loading
  - Renders member cards after data loads
  - Shows empty state when results are empty
  - Shows error state when fetch fails
  - Calls `fetchNextPage` when sentinel intersects viewport
  - Mock `useDiscover` hook in tests

### Task 9: `DiscoverSearch` Component — Filter Interface (AC: #1)

- [x] 9.1 Create `src/features/discover/components/DiscoverSearch.tsx`:

  ```tsx
  "use client";
  // Controlled filter form. Props: currentFilters, onFiltersChange, viewerProfile (for location pre-fill).

  interface DiscoverSearchProps {
    filters: DiscoverFilters;
    onFiltersChange: (filters: DiscoverFilters) => void;
    viewerProfile: {
      locationCity: string | null;
      locationCountry: string | null;
      interests: string[];
    } | null;
  }
  ```

  - **Text search field**: debounced 300ms before updating filters (same debounce pattern as `useMessageSearch`).
  - **Location field**: pre-fills `locationCity` from `viewerProfile.locationCity` on first render (only once — not reactive).
  - **Interests filter**: multi-select using `TagInput` component already at `src/features/profiles/components/TagInput.tsx` — import it directly (it's a shared primitive).
  - **Language filter**: single-select dropdown with common languages. Values come from the viewer's languages array + "All Languages" option.
  - **Tier filter**: single-select: All / Basic / Professional / Top-tier.
  - **"Clear filters"** button: resets to `DEFAULT_FILTERS` except keeps locationCity/Country from viewer profile.
  - All strings via `useTranslations("Discover")`.

- [x] 9.2 Write tests at `src/features/discover/components/DiscoverSearch.test.tsx` (`@vitest-environment jsdom`):
  - Pre-fills location from viewerProfile on mount
  - Text search debounces before calling onFiltersChange
  - Interests selection adds to filter array
  - Clear button resets filters (except location from profile)
  - Tier filter updates membership tier in filters

### Task 10: `/discover` Page Route (AC: #1, #2)

- [x] 10.1 Create `src/app/[locale]/(app)/discover/page.tsx`:

  ```tsx
  // SSR shell + CSR content per architecture.
  // SSR: render page shell with DiscoverSearch placeholder and skeleton grid.
  // CSR: DiscoverSearch and MemberGrid are "use client" components — load viewer profile
  //      via server-side data fetch (passed as prop) to pre-fill location.

  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getProfileByUserId } from "@/db/queries/community-profiles";
  // ... render DiscoverSearch + MemberGrid
  ```

  - Fetch viewer's own profile server-side (for location pre-fill and viewer interests for shared-count calculation).
  - Pass `viewerProfile` as prop to `DiscoverSearch` and `viewerInterests` to `MemberGrid`.
  - Page is inside `(app)` route group — auth is enforced by Next.js middleware (same as other app pages).
  - Nav link already exists: `BottomNav` and `TopNav` both have `{ key: "discover", href: "/discover" }`.
  - No `loading.tsx` needed if skeleton is handled in `MemberGrid`.

- [x] 10.2 Write tests at `src/app/[locale]/(app)/discover/page.test.tsx` (`@vitest-environment jsdom`):
  - Renders the discover page with DiscoverSearch and MemberGrid
  - Mock `requireAuthenticatedSession` and `getProfileByUserId`

### Task 11: Barrel Export + Types (AC: all)

- [x] 11.1 Create `src/features/discover/index.ts`:

  ```ts
  export { DiscoverSearch } from "./components/DiscoverSearch";
  export { MemberGrid } from "./components/MemberGrid";
  export { MemberCard } from "./components/MemberCard";
  export { useDiscover } from "./hooks/use-discover";
  export type { MemberCardData, DiscoverFilters } from "./types";
  ```

### Task 12: i18n Translations — i18n-First (AC: all)

**CRITICAL — AI-1 from Epic 2 retro: i18n keys must be defined BEFORE any UI component is scaffolded. Add all keys before implementing Task 7, 8, 9.**

- [x] 12.1 Add to `messages/en.json` under a top-level `"Discover"` key:

  ```json
  "Discover": {
    "pageTitle": "Discover Members",
    "searchPlaceholder": "Search by name, bio, or location...",
    "locationPlaceholder": "City or country",
    "filtersLabel": "Filters",
    "interestsLabel": "Interests",
    "languageLabel": "Language",
    "tierLabel": "Membership tier",
    "tierAll": "All tiers",
    "tierBasic": "Basic",
    "tierProfessional": "Professional",
    "tierTopTier": "Top-tier",
    "allLanguages": "All languages",
    "clearFilters": "Clear filters",
    "noResults": "No members found. Try adjusting your filters.",
    "loadingError": "Failed to load members. Please try again.",
    "retry": "Retry",
    "loadingMore": "Loading more...",
    "sharedInterests": "{count, plural, =0 {No shared interests} =1 {1 shared interest} other {# shared interests}}",
    "messageButton": "Message",
    "viewProfile": "View profile of {name}",
    "location": "{city}, {country}",
    "memberCount": "{count, plural, =0 {No members} =1 {1 member} other {# members}} found"
  }
  ```

- [x] 12.2 Add corresponding Igbo keys to `messages/ig.json` under `"Discover"`:

  ```json
  "Discover": {
    "pageTitle": "Chọpụta Ndị Otu",
    "searchPlaceholder": "Chọọ site n'aha, akụkọ, ma ọ bụ ebe...",
    "locationPlaceholder": "Obodo ma ọ bụ mba",
    "filtersLabel": "Nhọpụta",
    "interestsLabel": "Ihe ọ masịrị",
    "languageLabel": "Asụsụ",
    "tierLabel": "Ọkwa otu",
    "tierAll": "Ọkwa nile",
    "tierBasic": "Ọkwa izizi",
    "tierProfessional": "Ọkwa onye ọrụ",
    "tierTopTier": "Ọkwa elu",
    "allLanguages": "Asụsụ nile",
    "clearFilters": "Hichapụ nhọpụta",
    "noResults": "Ahụghị onye otu. Gbalịa ịgbanwe nhọpụta gị.",
    "loadingError": "Ọ dịghị mma ịbata ndị otu. Biko nwalee ọzọ.",
    "retry": "Nwalee ọzọ",
    "loadingMore": "Na-ebu ọzọ...",
    "sharedInterests": "{count, plural, =0 {Enweghị ihe ọ masịrị ọnụ} =1 {Otu ihe ọ masịrị ọnụ} other {# ihe ọ masịrị ọnụ}}",
    "messageButton": "Zitere ọ̀bá",
    "viewProfile": "Lee profaịl nke {name}",
    "location": "{city}, {country}",
    "memberCount": "{count, plural, =0 {Enweghị onye} =1 {Otu onye} other {# ndị otu}} achọtara"
  }
  ```

### Task 13: Tests Summary

Minimum new test counts:

- `src/db/migrations/0016_*.sql`: N/A (SQL file, not directly tested)
- `src/services/geo-search.test.ts`: ~11 new tests
- `src/app/api/v1/discover/route.test.ts`: ~5 new tests
- `src/features/discover/hooks/use-discover.test.ts`: ~4 new tests
- `src/features/discover/components/MemberCard.test.tsx`: ~6 new tests
- `src/features/discover/components/MemberGrid.test.tsx`: ~5 new tests
- `src/features/discover/components/DiscoverSearch.test.tsx`: ~5 new tests
- `src/app/[locale]/(app)/discover/page.test.tsx`: ~2 new tests

**Estimated new tests: ~38–46** (bringing total to ~1696–1704 passing from current 1658)

## Dev Notes

### Epic 3 Pre-Work Already Completed (Retro AI-2/AI-4/AI-5)

The following was completed as part of the Epic 2 retrospective action items — these are DONE:

- **Migration 0015** (`src/db/migrations/0015_geocoding_gist_index.sql`): GiST index `idx_community_profiles_ll_to_earth` on `ll_to_earth(location_lat::float8, location_lng::float8)` already created. Used for proximity queries (Story 3.2 will leverage this).
- **`cube` + `earthdistance` + `pg_trgm` extensions**: already enabled in migration 0000 — do NOT re-enable.
- **`src/services/geocoding-service.ts`**: `GeocodingService` interface, `NoOpGeocodingService`, `NominatimGeocodingService`, `createGeocodingService()` factory. Used when geocoding location text during profile updates. **Story 3.1 does NOT need to call the geocoding service** — we filter on the text fields (city/state/country) already stored. Geocoding is invoked when a user saves their profile location (outside Story 3.1's scope).
- **`ENABLE_GEOCODING` + `NOMINATIM_URL` env vars**: already declared in `src/env.ts`.
- **Test utilities** (`src/test/vi-patterns.ts`): `makeSocketContext`, `makeHandlerRegistry`, `useRealTimersForReactQuery` — all ready for use.

### Next Migration Number: 0016

Migrations 0000–0015 exist. Story 3.1 adds **0016** (`0016_member_directory_search.sql`).

### No `server-only` in `block-mute.ts`

`src/db/queries/block-mute.ts` does NOT have `import "server-only"` (it's shared with the realtime server). `geo-search.ts` DOES have `import "server-only"`. Tests for `geo-search.ts` need `vi.mock("server-only", () => ({}))`.

### `searchMembersByName()` — Reuse Not Replace

`src/db/queries/community-profiles.ts` already has `searchMembersByName()` used by the NewGroupDialog autocomplete. Story 3.1 does NOT modify or replace it — the new `searchMembersInDirectory()` in `geo-search.ts` is a separate, more powerful function for the public directory. They co-exist.

### Profile Visibility Rules in Directory

- `PRIVATE` profiles: **never** appear in directory results (enforced in SQL `profile_visibility != 'PRIVATE'`)
- `LIMITED` profiles: appear in directory (treated like `PUBLIC_TO_MEMBERS` until Epic 5 group-shared check is implemented — `TODO(Epic 5)` comment already in `getPublicProfileForViewer`)
- `PUBLIC_TO_MEMBERS`: appear normally
- Note: `MemberCardData` intentionally omits `profileVisibility` — the card shows available data without indicating visibility level. If a LIMITED member has sparse info, their card simply shows less. A visibility indicator on cards is deferred (Epic 5 group-shared check).

### Verification Badge: Not Yet Built

The epics mention "verification badge (if any)" on member cards. The badge system is planned for Epic 8. The `BadgeDisplay` component referenced in `architecture.md` does NOT yet exist in `src/features/profiles/components/`. Story 3.1 renders `null` for the badge slot with a `{/* TODO(Epic 8): BadgeDisplay */}` comment.

### "Message" Button Pattern

`ProfileView.tsx` has an existing `MessageButton` that calls `createOrFindDirectConversation(profileUserId)` from `@/features/chat/actions/create-conversation`. Reuse this EXACT pattern for `MemberCard`'s message button — same import, same error handling, same navigation on success. Do not reinvent.

### TagInput Component Reuse

`src/features/profiles/components/TagInput.tsx` is a reusable tag input component (used for interests in EditProfileForm). Import it directly in `DiscoverSearch.tsx` for the interests multi-select. Note: this is an internal import from another feature's internals — the architecture barrel-export rule normally forbids this, but `TagInput` is a shared primitive without its own barrel. OK to import directly for now; carry as tech debt to move to `src/components/shared/` in a future story.

### `useInfiniteQuery` Pattern Reference

Study `src/features/chat/hooks/use-conversations.ts` for the existing `useInfiniteQuery` pattern used in this project. The `use-discover` hook follows the same structure.

### Block Filter SQL Pattern

The `allExcludedIds.join(",")` approach for PostgreSQL `ANY(...)` array literals is the same pattern used in `getUserConversations()` for block filtering (Story 2.7, Task 6.1). Reference that implementation.

When `allExcludedIds` is empty (no blocks), the `AND cp.user_id::text != ALL(...)` clause is omitted from the query (performance: no empty-array `ANY()` comparison). However, the viewer's own userId is ALWAYS in `allExcludedIds` (it's always added), so the array is never truly empty — at minimum it contains the viewerUserId.

### FTS Query Tips

- `plainto_tsquery('english', $query)` handles arbitrary user input safely (no special syntax).
- The GIN index in migration 0016 uses the same `to_tsvector(...)` expression as the query — PostgreSQL will use the index when the expressions match exactly.
- Query minimum length: 2 characters — short enough for name searches (e.g. "Jo").
- Empty string / whitespace query: the `query && query.trim().length >= 2` guard skips FTS and returns all matching members for other filters.

### Cursor Pagination: `(created_at DESC, user_id DESC)` Stable Sort

Using `(created_at, user_id::text)` as cursor ensures stable ordering (same as Story 2.2's conversation cursor). The cursor is opaque base64 JSON — clients must not parse or construct it.

### i18n-First Mandate (Epic 2 Retro AI-1)

Add ALL i18n keys to BOTH `en.json` AND `ig.json` BEFORE scaffolding any UI component. The `Discover` namespace must be fully populated in both files before Task 7 begins. Missing Igbo translations will be flagged in code review.

### Rendering Strategy: SSR Shell + CSR Content

Per `architecture.md` rendering table: `/discover` uses "SSR shell + CSR results". Concretely:

- The `page.tsx` is a **Server Component** — fetches viewer profile server-side, renders static shell
- `DiscoverSearch` and `MemberGrid` are `"use client"` components — they hydrate client-side
- `MemberGrid` uses `useInfiniteQuery` which runs client-side
- This matches the `/feed` pattern (`SSR shell + CSR content`) already established

### `withApiHandler` CSRF Validation

`GET /api/v1/discover` is a read-only endpoint — CSRF validation is only applied to POST/PATCH/DELETE by `withApiHandler`. No `Origin` header required in GET route tests.

### Test Timer Pattern

Any test involving `useDiscover` (or any React Query hook) with `waitFor` MUST use `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` at the start of that test. See `use-message-search.test.ts` for the established pattern.

### Project Structure Notes

New files:

- `src/db/migrations/0016_member_directory_search.sql`
- `src/services/geo-search.ts`
- `src/services/geo-search.test.ts`
- `src/app/api/v1/discover/route.ts`
- `src/app/api/v1/discover/route.test.ts`
- `src/app/[locale]/(app)/discover/page.tsx`
- `src/app/[locale]/(app)/discover/page.test.tsx`
- `src/features/discover/components/DiscoverSearch.tsx`
- `src/features/discover/components/DiscoverSearch.test.tsx`
- `src/features/discover/components/MemberCard.tsx`
- `src/features/discover/components/MemberCard.test.tsx`
- `src/features/discover/components/MemberCardSkeleton.tsx`
- `src/features/discover/components/MemberGrid.tsx`
- `src/features/discover/components/MemberGrid.test.tsx`
- `src/features/discover/hooks/use-discover.ts`
- `src/features/discover/hooks/use-discover.test.ts`
- `src/features/discover/types/index.ts`
- `src/features/discover/index.ts`

Modified files:

- `src/services/rate-limiter.ts` — add `MEMBER_SEARCH` preset
- `messages/en.json` — add `Discover` namespace
- `messages/ig.json` — add `Discover` namespace (Igbo)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-1-member-directory-search: ready-for-dev`, `epic-3: in-progress`

No new files at:

- `src/db/schema/` — no new tables (community_profiles already has lat/lng/location columns)
- `src/server/realtime/` — no Socket.IO changes needed for directory
- `src/services/geocoding-service.ts` — already implemented (AI-5 retro action)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.1, lines 1591–1633]
- [Source: _bmad-output/planning-artifacts/architecture.md — Rendering Strategy table (discover: SSR shell + CSR results), line 353]
- [Source: _bmad-output/planning-artifacts/architecture.md — geo-search service in services/ mapping, line 1038]
- [Source: _bmad-output/planning-artifacts/architecture.md — features/discover module structure, lines 932–940]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR17-FR18 member discovery, line 1129]
- [Source: _bmad-output/implementation-artifacts/epic-2-retro-2026-02-28.md — AI-5 geocoding spike, AI-6 block enforcement in 3.1 AC, AI-1 i18n-first gate]
- [Source: src/db/migrations/0000_extensions.sql — cube + earthdistance + pg_trgm already enabled]
- [Source: src/db/migrations/0015_geocoding_gist_index.sql — GiST proximity index already created]
- [Source: src/services/geocoding-service.ts — GeocodingService interface + NominatimGeocodingService]
- [Source: src/db/schema/community-profiles.ts — locationLat/Lng/City/State/Country fields, profileVisibilityEnum, interests/languages text[] arrays]
- [Source: src/db/queries/community-profiles.ts — searchMembersByName() pattern, getPublicProfileForViewer() visibility rules]
- [Source: src/db/queries/block-mute.ts — getBlockedUserIds(), getUsersWhoBlocked() functions]
- [Source: src/features/profiles/components/ProfileView.tsx — MessageButton pattern using createOrFindDirectConversation]
- [Source: src/features/profiles/components/TagInput.tsx — reusable tag input for interests]
- [Source: src/features/chat/hooks/use-conversations.ts — useInfiniteQuery pattern reference]
- [Source: src/test/vi-patterns.ts — useRealTimersForReactQuery, makeSocketContext, makeHandlerRegistry]
- [Source: src/components/layout/BottomNav.tsx — discover nav link already configured]
- [Source: _bmad-output/implementation-artifacts/2-7-message-search-block-mute-conversation-preferences.md — block filtering SQL pattern, cursor encoding, CSRF rules]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- IntersectionObserver mock must use `vi.fn().mockImplementation(function() {...})` (regular function, not arrow) so `new IntersectionObserver(...)` works in tests.
- Page `redirect()` from `next/navigation` doesn't throw in tests — added `return null` after redirect for test isolation.
- MemberGrid test: used module-level `lastObserverCallback` variable to capture the observer callback from the constructor mock.

### Completion Notes List

- ✅ Migration 0016: GIN FTS index + composite geo B-tree index on `community_profiles` — partial indexes scoped to active completed profiles.
- ✅ `MEMBER_SEARCH` rate limit preset added to `src/services/rate-limiter.ts` (60/min per userId).
- ✅ `searchMembersInDirectory()` in `src/services/geo-search.ts`: FTS with `plainto_tsquery`, bidirectional block exclusion via `Promise.all([getBlockedUserIds, getUsersWhoBlocked])`, cursor pagination, `locationVisible` privacy via SQL CASE, location/interests/language/tier filters.
- ✅ `GET /api/v1/discover` route: rate-limited, all query params forwarded to service, invalid tier silently coerced to undefined.
- ✅ `features/discover` module: types, `useDiscover` hook (`useInfiniteQuery`), `MemberCard`, `MemberCardSkeleton`, `MemberGrid` (IntersectionObserver infinite scroll), `DiscoverSearch` (debounced text, TagInput for interests, location pre-fill from viewer profile), `DiscoverContent` (filter state wrapper), barrel export.
- ✅ `/discover` page: SSR Server Component fetches viewer profile, passes to `DiscoverContent` client component.
- ✅ i18n-first: `Discover` namespace added to both `en.json` and `ig.json` BEFORE any UI component was scaffolded (Task 12 done before Tasks 7–9).
- ✅ 44 new tests added (total: 1702/1702 passing, up from 1658). No regressions.

### File List

**New files:**

- `src/db/migrations/0016_member_directory_search.sql`
- `src/services/geo-search.ts`
- `src/services/geo-search.test.ts`
- `src/app/api/v1/discover/route.ts`
- `src/app/api/v1/discover/route.test.ts`
- `src/app/[locale]/(app)/discover/page.tsx`
- `src/app/[locale]/(app)/discover/page.test.tsx`
- `src/features/discover/components/DiscoverSearch.tsx`
- `src/features/discover/components/DiscoverSearch.test.tsx`
- `src/features/discover/components/DiscoverContent.tsx`
- `src/features/discover/components/MemberCard.tsx`
- `src/features/discover/components/MemberCard.test.tsx`
- `src/features/discover/components/MemberCardSkeleton.tsx`
- `src/features/discover/components/MemberGrid.tsx`
- `src/features/discover/components/MemberGrid.test.tsx`
- `src/features/discover/hooks/use-discover.ts`
- `src/features/discover/hooks/use-discover.test.ts`
- `src/features/discover/types/index.ts`
- `src/features/discover/index.ts`

**Modified files:**

- `src/services/rate-limiter.ts` — added `MEMBER_SEARCH` preset
- `messages/en.json` — added `Discover` namespace
- `messages/ig.json` — added `Discover` namespace (Igbo)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `3-1-member-directory-search: in-progress` (→ review at end)

## Change Log

- 2026-03-01: Story 3.1 implemented — Member Directory & Search. Added migration 0016 (FTS GIN + geo B-tree indexes), `searchMembersInDirectory()` service, `GET /api/v1/discover` API route, `features/discover` module (MemberCard, MemberGrid, DiscoverSearch, DiscoverContent, useDiscover hook), `/discover` page, bilingual i18n (en+ig). 44 new tests, 1702/1702 passing.
- 2026-03-01: Senior Developer Review (AI) — 8 issues found (1 HIGH, 4 MEDIUM, 3 LOW). All HIGH/MEDIUM fixed:
  - [H1] Fixed interests filter SQL injection risk — replaced string-concatenated array literal with parameterized `ARRAY[...]::text[]` via `sql.join()` in `geo-search.ts:141`
  - [M1] Removed dead code (unused `viewerLanguages` variable) in `DiscoverSearch.tsx:79-80`
  - [M2] Replaced inline avatar + emoji fallback with shared `Avatar`/`AvatarImage`/`AvatarFallback` from `@/components/ui/avatar` in `MemberCard.tsx`
  - [M3] Added country filter field to `DiscoverSearch.tsx`; updated pre-fill to populate both `locationCity` and `locationCountry` from viewer profile; added `countryLabel`/`countryPlaceholder` i18n keys to en.json and ig.json
  - [M4] Documented barrel export deviation (`DiscoverContent` included but wasn't in story spec Task 11.1)
  - LOW issues (L1-L3) left as-is: unused i18n keys, test assertion depth, type cast — non-blocking
  - 1702/1702 tests passing after fixes
