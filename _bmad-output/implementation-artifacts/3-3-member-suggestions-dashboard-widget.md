# Story 3.3: Member Suggestions & Dashboard Widget

Status: done

## Story

As a member,
I want to see suggested members to connect with based on shared interests, location, or skills,
So that I discover community members I might not have searched for directly.

## Acceptance Criteria

1. **Given** a member is on their dashboard
   **When** the dashboard loads
   **Then** a "People near you" widget displays a count of nearby members and a "See all" link to the full directory (FR82)
   **And** up to 5 suggested member cards are shown, prioritized by: same city > same state > shared interests > shared group membership

2. **Given** the suggestion algorithm runs
   **When** suggestions are generated for a member
   **Then** suggestions are based on shared interests, geographic proximity, and mutual community context (FR82)
   **And** the system excludes members the user has already messaged (direct conversations) or blocked (bidirectional)
   **And** suggestions are cached in Redis with a 24-hour TTL and refreshed daily
   **And** suggestions include a brief reason: "Also in Texas" or "Shares your interest in Cultural Heritage"

   > **Scope note (MVP):** epics.md also lists "shared skills" and "mutual group membership" as scoring factors. These are **deferred** — the `community_profiles` table has no dedicated `skills` column (interests serve as the proxy), and group membership scoring requires joins against group tables not yet built (Epic 5). The scoring algorithm uses geo proximity + shared interests only. The `"community"` reason type serves as a catch-all for members with no geo/interest overlap.

3. **Given** a member views a suggestion card
   **When** they interact with it
   **Then** they can tap the card to view the full profile
   **And** a "Message" button allows one-tap connection directly from the suggestion card
   **And** a "Dismiss" option removes the suggestion and prevents it from reappearing

4. **Given** the dashboard widget is viewed on mobile
   **When** the widget renders
   **Then** the system displays suggestion cards in a horizontal scrollable row
   **And** each card meets 44px minimum tap target for all interactive elements (NFR-A5)

## Tasks / Subtasks

### Task 1: `SuggestionService` — `src/services/suggestion-service.ts` (AC: #1, #2, #3)

- [x] 1.1 Create `src/services/suggestion-service.ts` with `import "server-only"` at the top:

  ```ts
  import "server-only";
  import { db } from "@/db";
  import { sql } from "drizzle-orm";
  import { getRedisClient } from "@/lib/redis";
  import type { MemberCardData } from "@/services/geo-search";

  export const SUGGESTION_CACHE_TTL_SECONDS = 86_400; // 24 hours
  export const SUGGESTION_DISMISS_TTL_SECONDS = 7_776_000; // 90 days (extends on each dismiss)
  export const SUGGESTION_CANDIDATE_POOL = 20; // fetch 20 candidates, score in-memory, return top N

  export type SuggestionReasonType = "city" | "state" | "country" | "interest" | "community";

  export interface MemberSuggestion {
    member: MemberCardData;
    reasonType: SuggestionReasonType;
    reasonValue: string; // city/state/country name or interest name; "" for "community"
  }
  ```

- [x] 1.2 Add `getAlreadyMessagedUserIds(viewerUserId: string): Promise<string[]>` private helper:

  ```ts
  async function getAlreadyMessagedUserIds(viewerUserId: string): Promise<string[]> {
    // Direct conversations only (type = 'direct') — excludes group chats
    const rows = await db.execute(sql`
      SELECT DISTINCT cm2.user_id::text
      FROM chat_conversation_members cm1
      JOIN chat_conversations c ON c.id = cm1.conversation_id
      JOIN chat_conversation_members cm2
        ON cm2.conversation_id = c.id
        AND cm2.user_id != ${viewerUserId}::uuid
      WHERE cm1.user_id = ${viewerUserId}::uuid
        AND c.type = 'direct'
        AND c.deleted_at IS NULL
    `);
    return rows.rows.map((r) => r.user_id as string);
  }
  ```

  **Note:** Uses the `conversation_type` enum value `'direct'` (not `is_group` — the schema has no `is_group` column; the type enum is `"direct" | "group" | "channel"`, defined in `src/db/schema/chat-conversations.ts`).

- [x] 1.3 Add `getBidirectionalBlockIds(viewerUserId: string): Promise<string[]>` private helper (same pattern as `geo-search.ts`):

  ```ts
  async function getBidirectionalBlockIds(viewerUserId: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT blocker_user_id::text AS id FROM platform_blocked_users WHERE blocked_user_id = ${viewerUserId}::uuid
      UNION
      SELECT blocked_user_id::text AS id FROM platform_blocked_users WHERE blocker_user_id = ${viewerUserId}::uuid
    `);
    return rows.rows.map((r) => r.id as string);
  }
  ```

- [x] 1.4 Add `getDismissedUserIds(viewerUserId: string, redis: Redis): Promise<string[]>` private helper:

  ```ts
  async function getDismissedUserIds(viewerUserId: string, redis: Redis): Promise<string[]> {
    return redis.smembers(`suggestions:dismissed:${viewerUserId}`);
  }
  ```

- [x] 1.5 Add `getCandidates(excludedIds: string[], limit: number)` private helper — raw SQL query for candidate pool:

  ```sql
  SELECT
    cp.user_id::text,
    cp.display_name,
    cp.photo_url,
    cp.location_city,
    cp.location_state,
    cp.location_country,
    cp.location_visible,
    cp.interests,
    cp.languages,
    cp.bio,
    au.membership_tier
  FROM community_profiles cp
  INNER JOIN auth_users au ON au.id = cp.user_id
  WHERE cp.deleted_at IS NULL
    AND cp.profile_completed_at IS NOT NULL
    AND cp.profile_visibility != 'PRIVATE'
    AND cp.user_id != ALL(:excludedIds::uuid[])
  ORDER BY cp.profile_completed_at DESC
  LIMIT :limit
  ```

  - **Raw columns for scoring:** Query returns unmasked `location_city/state/country` + `location_visible` boolean. Scoring uses the raw columns. After scoring, mask location on the `MemberCardData` before returning:

    ```ts
    const card: MemberCardData = {
      userId: row.user_id,
      displayName: row.display_name,
      photoUrl: row.photo_url,
      locationCity: row.location_visible ? row.location_city : null,
      locationState: row.location_visible ? row.location_state : null,
      locationCountry: row.location_visible ? row.location_country : null,
      interests: row.interests ?? [],
      languages: row.languages ?? [],
      membershipTier: row.membership_tier as MemberCardData["membershipTier"],
      bio: row.bio,
    };
    // Scoring uses raw row.location_city/state/country (unmasked)
    ```

  - Does NOT exclude rows based on `location_visible` — same pattern as `searchMembersWithGeoFallback`

- [x] 1.6 Add scoring helper `scoreCandidates(candidates, viewer, excludedIds)`:

  **Scoring (computed entirely in-memory, no additional DB calls):**
  - +4 if `candidate.locationCity` and viewer's city match (case-insensitive, trimmed)
  - +3 if `candidate.locationState` and viewer's state match (no city match; applies even if city present but non-matching)
  - +2 if `candidate.locationCountry` and viewer's country match (no city or state match)
  - +1 per shared interest (viewer `interests` ∩ candidate `interests`), capped at +3 total from interests
  - Minimum score = 0 (members with no match still eligible as "community" suggestions)

  **Reason determination (based on highest-scoring geo match):**
  - City score contribution → `reasonType: "city"`, `reasonValue: viewerCity`
  - State contribution (no city match) → `reasonType: "state"`, `reasonValue: viewerState`
  - Country contribution (no city/state match) → `reasonType: "country"`, `reasonValue: viewerCountry`
  - Interest contribution (no geo match) → `reasonType: "interest"`, `reasonValue: sharedInterests[0]`
  - No match → `reasonType: "community"`, `reasonValue: ""`

- [x] 1.7 Add main export `getMemberSuggestions(viewerUserId: string, limit = 5): Promise<MemberSuggestion[]>`:

  **Algorithm:**
  1. Check Redis cache: `suggestions:${viewerUserId}` — if exists, parse JSON and return (24h TTL is still valid)
  2. Load viewer profile: `SELECT location_city, location_state, location_country, interests FROM community_profiles WHERE user_id = $viewerUserId`
  3. In parallel via `Promise.all`: `getAlreadyMessagedUserIds()`, `getBidirectionalBlockIds()`, `getDismissedUserIds()` — merge + deduplicate + add `viewerUserId` → `allExcludedIds`
  4. Fetch candidate pool: `getCandidates(allExcludedIds, SUGGESTION_CANDIDATE_POOL)`
  5. Score and rank candidates with `scoreCandidates()`
  6. Sort descending by score, take top `limit`
  7. Cache result in Redis: `redis.set("suggestions:{viewerUserId}", JSON.stringify(result), "EX", SUGGESTION_CACHE_TTL_SECONDS)`
  8. Return `MemberSuggestion[]`

  **Edge cases:**
  - Viewer has no profile → return `[]`
  - Fewer than `limit` candidates available → return what exists
  - Empty interests on viewer → no interest-based scoring; geo scoring still applies

- [x] 1.8 Add `dismissSuggestion(viewerUserId: string, dismissedUserId: string): Promise<void>`:

  ```ts
  export async function dismissSuggestion(
    viewerUserId: string,
    dismissedUserId: string,
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.sadd(`suggestions:dismissed:${viewerUserId}`, dismissedUserId);
    await redis.expire(`suggestions:dismissed:${viewerUserId}`, SUGGESTION_DISMISS_TTL_SECONDS);
    // Invalidate suggestions cache so next fetch excludes the dismissed member
    await redis.del(`suggestions:${viewerUserId}`);
  }
  ```

  **Note:** Cache is invalidated on dismiss (not just filtered) — next request to `getMemberSuggestions` will recompute fresh suggestions. This ensures the dismissed member doesn't linger in the Redis-cached suggestion list.

- [x] 1.9 Create `src/services/suggestion-service.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/db");
  vi.mock("@/lib/redis");
  ```

  Tests:
  - Returns empty array when viewer has no profile
  - Returns cached result from Redis when cache present
  - Excludes blocked members (bidirectional)
  - Excludes already-messaged members
  - Excludes dismissed members
  - Scores by city match first (`reasonType: "city"`)
  - Scores by state match when no city match (`reasonType: "state"`)
  - Scores by interest when no geo match (`reasonType: "interest"`)
  - Assigns `"community"` reason when no match
  - `dismissSuggestion` adds to dismissed set, deletes cache key
  - Returns at most `limit` results

### Task 2: Rate Limiter Presets (AC: #1, #2)

- [x] 2.1 Add to `src/services/rate-limiter.ts` (after the `MEMBER_SEARCH` entry):

  ```ts
  // Story 3.3 additions
  MEMBER_SUGGESTIONS: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
  SUGGESTION_DISMISS: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
  ```

### Task 3: i18n Translations — i18n-First Mandate (AC: all)

**CRITICAL — Add ALL keys BEFORE any component work (Tasks 5–7)**

- [x] 3.1 Add to `messages/en.json` under the existing `"Dashboard"` key — append `"peopleNear"` sub-namespace:

  ```json
  "Dashboard": {
    // ...existing keys...
    "peopleNear": {
      "title": "People near you",
      "seeAll": "See all",
      "membersNearby": "{count, plural, =1 {1 member nearby} other {# members nearby}}",
      "noSuggestions": "No suggestions available yet. Check back soon!",
      "reasonCity": "Also in {location}",
      "reasonState": "Also in {location}",
      "reasonCountry": "Also from {location}",
      "reasonInterest": "Shares your interest in {interest}",
      "reasonCommunity": "In your community",
      "messageCta": "Message",
      "dismiss": "Dismiss",
      "dismissAriaLabel": "Dismiss {name}",
      "loadingAriaLabel": "Loading member suggestions",
      "viewProfile": "View {name}'s profile"
    }
  }
  ```

- [x] 3.2 Add corresponding Igbo keys to `messages/ig.json` under `"Dashboard"."peopleNear"`:

  ```json
  "peopleNear": {
    "title": "Ndị nọ n'ógbè gị",
    "seeAll": "Lee ha nile",
    "membersNearby": "{count, plural, =1 {Otu onye otu nọ nso} other {# ndị otu nọ nso}}",
    "noSuggestions": "Enweghị ndị a tụrụ aro ugbu a. Lọghachi n'oge ọzọ!",
    "reasonCity": "Ọ bụkwa na {location}",
    "reasonState": "Ọ bụkwa na {location}",
    "reasonCountry": "Ọ bụkwa si {location}",
    "reasonInterest": "Nwere mmasị gị na {interest}",
    "reasonCommunity": "Na obodo anyị",
    "messageCta": "Zite ozi",
    "dismiss": "Hapụ",
    "dismissAriaLabel": "Hapụ {name}",
    "loadingAriaLabel": "Na-ebugo ndị otu atụrụ aro",
    "viewProfile": "Hụ profaịlụ {name}"
  }
  ```

### Task 4: API Routes (AC: #1, #2, #3)

- [x] 4.1 Create `src/app/api/v1/discover/suggestions/route.ts`:

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse } from "@/lib/api-response";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { getMemberSuggestions } from "@/services/suggestion-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

  const getHandler = async (request: Request) => {
    const { userId } = await requireAuthenticatedSession();
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    let limit = 5;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) limit = parsed;
    }
    const suggestions = await getMemberSuggestions(userId, limit);
    return successResponse({ suggestions });
  };

  export const GET = withApiHandler(getHandler, {
    rateLimit: {
      key: async (_request: Request) => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `member-suggestions:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.MEMBER_SUGGESTIONS,
    },
  });
  ```

  **Notes:**
  - `GET` is CSRF-exempt — no `Origin` header needed in route tests
  - The `key` function signature is `(request: Request) => string | Promise<string>` per `withApiHandler` — the `request` param is unused here but include it for consistency: `key: async (_request: Request) => { ... }`
  - Double `requireAuthenticatedSession()` call (rate-limit `key` + handler) is the established pattern from Stories 3.1 and 3.2 — do NOT deduplicate
  - Returns `{ data: { suggestions: MemberSuggestion[] } }` (RFC 7807 `successResponse` shape)

- [x] 4.2 Create `src/app/api/v1/discover/suggestions/route.test.ts` (`@vitest-environment node`):

  ```ts
  vi.mock("server-only", () => ({}));
  vi.mock("@/services/suggestion-service");
  ```

  Tests:
  - Returns 200 `{ suggestions: [...] }` on success
  - Returns 401 when not authenticated
  - Passes `limit` param to `getMemberSuggestions`
  - Rate limit headers present on response

- [x] 4.3 Create `src/app/api/v1/discover/suggestions/[userId]/route.ts` (DELETE for dismiss):

  ```ts
  import { withApiHandler } from "@/server/api/middleware";
  import { successResponse, errorResponse } from "@/lib/api-response";
  import { requireAuthenticatedSession } from "@/services/permissions";
  import { dismissSuggestion } from "@/services/suggestion-service";
  import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
  import { z } from "zod/v4";

  const UUIDSchema = z.string().uuid();

  const deleteHandler = async (request: Request) => {
    const { userId: viewerUserId } = await requireAuthenticatedSession();
    const dismissedUserId = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const parsed = UUIDSchema.safeParse(dismissedUserId);
    if (!parsed.success) {
      return errorResponse(400, "Invalid user ID", parsed.error.issues[0].message);
    }
    await dismissSuggestion(viewerUserId, parsed.data);
    return successResponse({ dismissed: true });
  };

  export const DELETE = withApiHandler(deleteHandler, {
    rateLimit: {
      key: async (_request: Request) => {
        const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
        const { userId } = await getSession();
        return `suggestion-dismiss:${userId}`;
      },
      ...RATE_LIMIT_PRESETS.SUGGESTION_DISMISS,
    },
  });
  ```

  **Notes:**
  - URL parsing: `pathname.split("/").at(-1)` — the dismissed userId IS the last path segment
  - `DELETE` requires `Origin` header in route tests (CSRF validation in `withApiHandler`) — same as PATCH/DELETE routes in Story 2.5
  - Uses Zod v4 UUID validation: `z.string().uuid()` — must import from `"zod/v4"` and use `parsed.error.issues[0]` (NOT `parsed.issues[0]`)

- [x] 4.4 Create `src/app/api/v1/discover/suggestions/[userId]/route.test.ts` (`@vitest-environment node`):

  Tests:
  - Returns 200 `{ dismissed: true }` on success
  - Returns 401 when not authenticated
  - Returns 400 when `userId` path segment is not a valid UUID
  - Calls `dismissSuggestion(viewerUserId, dismissedUserId)`
  - Requires `Origin` header (CSRF validation) — include `{ headers: { Origin: "http://localhost:3000", Host: "localhost:3000" } }` in DELETE test requests

### Task 5: `useMemberSuggestions` Hook (AC: #1, #2, #3)

- [x] 5.1 Create `src/features/dashboard/hooks/use-member-suggestions.ts`:

  ```ts
  "use client";

  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import type { MemberSuggestion } from "@/services/suggestion-service";

  export function useMemberSuggestions(limit = 5) {
    const queryClient = useQueryClient();

    const query = useQuery<MemberSuggestion[]>({
      queryKey: ["member-suggestions"],
      queryFn: async () => {
        const res = await fetch(`/api/v1/discover/suggestions?limit=${limit}`);
        if (!res.ok) throw new Error("Failed to load suggestions");
        const json = (await res.json()) as { data: { suggestions: MemberSuggestion[] } };
        return json.data.suggestions;
      },
      staleTime: 5 * 60_000, // 5 min client-side stale time (server caches 24h)
    });

    const dismissMutation = useMutation({
      mutationFn: async (dismissedUserId: string) => {
        const res = await fetch(`/api/v1/discover/suggestions/${dismissedUserId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to dismiss suggestion");
      },
      onSuccess: (_data, dismissedUserId) => {
        // Optimistically remove from cache immediately
        queryClient.setQueryData(
          ["member-suggestions"],
          (prev: MemberSuggestion[] | undefined) =>
            prev?.filter((s) => s.member.userId !== dismissedUserId) ?? [],
        );
      },
    });

    return {
      suggestions: query.data ?? [],
      isLoading: query.isLoading,
      isError: query.isError,
      dismiss: dismissMutation.mutate,
    };
  }
  ```

  **Notes:**
  - `MemberSuggestion` imported from `@/services/suggestion-service` — this is a type-only import (erased at runtime); no server-only barrier crossed in hooks
  - Optimistic dismiss via `queryClient.setQueryData` removes dismissed member immediately without waiting for refetch
  - `staleTime: 5 * 60_000` balances freshness vs request frequency; server-side Redis cache means re-fetches are cheap

- [x] 5.2 Create `src/features/dashboard/hooks/use-member-suggestions.test.ts` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("@/services/suggestion-service"); // mock type source — no actual import issues
  ```

  Tests — call `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` at the **top of each test** that awaits React Query data (it calls `vi.useRealTimers()` once — NOT a lifecycle hook, just call it per-test before `render`):
  - Returns `suggestions` array from successful API response
  - `isLoading` is true during pending state
  - `isError` is true on fetch failure
  - `dismiss` calls DELETE endpoint with correct userId
  - After `dismiss` succeeds, dismissed suggestion is removed from `suggestions` array (optimistic update)

### Task 6: `PeopleNearYouWidget` Component (AC: #1, #2, #3, #4)

- [x] 6.1 Create `src/features/dashboard/components/PeopleNearYouWidget.tsx`:

  ```tsx
  "use client";

  import { useTranslations } from "next-intl";
  import { useRouter, Link } from "@/i18n/navigation";
  import { useMemberSuggestions } from "../hooks/use-member-suggestions";
  import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Skeleton } from "@/components/ui/skeleton";
  import type { MemberSuggestion, SuggestionReasonType } from "@/services/suggestion-service";
  ```

  **Component structure:**

  ```tsx
  export function PeopleNearYouWidget() {
    const t = useTranslations("Dashboard");
    const router = useRouter();
    const { suggestions, isLoading, dismiss } = useMemberSuggestions(5);

    if (isLoading) {
      return (
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <div
              className="flex gap-3 overflow-x-auto md:flex-col"
              aria-label={t("peopleNear.loadingAriaLabel")}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-40 flex-shrink-0 md:w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (suggestions.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("peopleNear.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("peopleNear.noSuggestions")}</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">{t("peopleNear.title")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("peopleNear.membersNearby", { count: suggestions.length })}
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/discover">{t("peopleNear.seeAll")}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {/* Mobile: horizontal scroll; Desktop (sidebar): vertical stack */}
          <div className="flex gap-3 overflow-x-auto pb-2 md:flex-col md:overflow-x-visible md:gap-2 md:pb-0">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.member.userId}
                suggestion={suggestion}
                onDismiss={() => dismiss(suggestion.member.userId)}
                t={t}
                router={router}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

  **`SuggestionCard` sub-component** (private, defined in the same file — NOT exported):

  ```tsx
  function formatReason(
    t: ReturnType<typeof useTranslations<"Dashboard">>,
    reasonType: SuggestionReasonType,
    reasonValue: string,
  ): string {
    switch (reasonType) {
      case "city":
        return t("peopleNear.reasonCity", { location: reasonValue });
      case "state":
        return t("peopleNear.reasonState", { location: reasonValue });
      case "country":
        return t("peopleNear.reasonCountry", { location: reasonValue });
      case "interest":
        return t("peopleNear.reasonInterest", { interest: reasonValue });
      case "community":
        return t("peopleNear.reasonCommunity");
    }
  }

  function SuggestionCard({
    suggestion,
    onDismiss,
    t,
    router,
  }: {
    suggestion: MemberSuggestion;
    onDismiss: () => void;
    t: ReturnType<typeof useTranslations<"Dashboard">>;
    router: ReturnType<typeof useRouter>;
  }) {
    const { member, reasonType, reasonValue } = suggestion;
    const initials = member.displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    return (
      <div className="relative flex-shrink-0 w-40 rounded-lg border bg-background p-3 md:w-full md:flex md:items-center md:gap-3">
        {/* Dismiss button — 44px tap target */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("peopleNear.dismissAriaLabel", { name: member.displayName })}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ×
        </button>

        {/* Avatar — tap to view profile */}
        <button
          type="button"
          onClick={() => router.push(`/members/${member.userId}`)}
          aria-label={t("peopleNear.viewProfile", { name: member.displayName })}
          className="flex flex-col items-center gap-1 text-center md:flex-row md:text-left"
        >
          <Avatar className="h-12 w-12">
            <AvatarImage src={member.photoUrl ?? undefined} alt={member.displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatReason(t, reasonType, reasonValue)}
            </p>
          </div>
        </button>

        {/* Message button — 44px tap target */}
        <Button
          size="sm"
          className="mt-2 w-full min-h-[44px] md:mt-0 md:ml-auto md:w-auto"
          onClick={() => router.push(`/chat?userId=${member.userId}`)}
        >
          {t("peopleNear.messageCta")}
        </Button>
      </div>
    );
  }
  ```

  **Accessibility notes:**
  - Dismiss button: `aria-label={t("peopleNear.dismissAriaLabel", { name })}` — 44px minimum tap target
  - Avatar/name area is a `<button>` with `aria-label` for screen readers
  - Message button is a standard `<Button>` — meets 44px via `min-h-[44px]`

- [x] 6.2 Create `src/features/dashboard/components/PeopleNearYouWidget.test.tsx` (`@vitest-environment jsdom`):

  ```ts
  vi.mock("../hooks/use-member-suggestions");
  vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
  ```

  Tests:
  - Renders skeleton while loading
  - Renders empty state when `suggestions` is `[]`
  - Renders up to 5 suggestion cards
  - Each card shows member `displayName`
  - Each card shows formatted reason string (test "city" and "interest" reason types)
  - Nearby count text is rendered (e.g. `membersNearby({"count":3})` via i18n mock)
  - Dismiss button click calls `dismiss(member.userId)`
  - Dismissed member is removed from rendered list (test via mock `dismiss` calling `setData`)
  - "See all" link renders with correct href (`/discover`) — uses `Link` from `@/i18n/navigation`
  - All interactive elements meet 44px tap target (check `min-h-[44px]` or `h-11 w-11` classes)

### Task 7: `DashboardShell` Update — Enable Widget (AC: #1)

- [x] 7.1 Update `src/features/dashboard/components/DashboardShell.tsx`:

  ```tsx
  "use client";

  import { useTranslations } from "next-intl"; // ADD
  import { DashboardGreeting } from "./DashboardGreeting";
  import { GettingStartedWidget } from "./GettingStartedWidget";
  import { WidgetSlot } from "./WidgetSlot";
  import { PeopleNearYouWidget } from "./PeopleNearYouWidget"; // ADD

  interface DashboardShellProps {
    displayName: string;
    avatarUrl?: string | null;
  }

  // Story 3.3: People near you widget is now enabled.
  const hasEnabledWidgets = true; // WAS: false

  export function DashboardShell({ displayName, avatarUrl }: DashboardShellProps) {
    const t = useTranslations("Dashboard"); // ADD

    return (
      <div className="container mx-auto px-4 py-6">
        <DashboardGreeting displayName={displayName} avatarUrl={avatarUrl} />
        <div className="mt-6 flex flex-col lg:flex-row gap-6">
          <main className={hasEnabledWidgets ? "lg:w-[65%]" : "w-full"}>
            <GettingStartedWidget />
          </main>
          {hasEnabledWidgets && (
            <aside className="lg:w-[35%] flex flex-col gap-4">
              <WidgetSlot enabled={true} title={t("peopleNear.title")}>
                {" "}
                {/* UPDATED */}
                <PeopleNearYouWidget /> {/* ADD */}
              </WidgetSlot>
            </aside>
          )}
        </div>
      </div>
    );
  }
  ```

  **Key changes:**
  - `hasEnabledWidgets` flipped from `false` → `true`
  - Added `useTranslations("Dashboard")` for the `WidgetSlot` `aria-label` title
  - Imported `PeopleNearYouWidget`

- [x] 7.2 Update `src/features/dashboard/components/DashboardShell.test.tsx` (**file exists — 72 lines**):
  - Add mock: `vi.mock("./PeopleNearYouWidget", () => ({ PeopleNearYouWidget: () => <div data-testid="people-near-you-widget" /> }))`
  - `useTranslations` is already mocked (line 5–10)
  - **BREAKING TEST FIX (line 55–58):** The existing test "does not render a sidebar aside element (Epic 1: no widgets enabled)" asserts `expect(container.querySelector("aside")).not.toBeInTheDocument()`. This WILL FAIL because `hasEnabledWidgets` is now `true`. **Update** this test to assert the sidebar IS rendered:
    ```ts
    it("renders a sidebar with the people-near-you widget", () => {
      const { container } = render(<DashboardShell displayName="Chidi" />);
      expect(container.querySelector("aside")).toBeInTheDocument();
      expect(screen.getByTestId("people-near-you-widget")).toBeInTheDocument();
    });
    ```
  - Add test: sidebar `<aside>` element is present in the DOM

### Task 8: Barrel Export Update (AC: all)

- [x] 8.1 Update `src/features/dashboard/index.ts`:

  ```ts
  export { DashboardShell } from "./components/DashboardShell";
  export { DashboardGreeting } from "./components/DashboardGreeting";
  export { WidgetSlot } from "./components/WidgetSlot";
  export { GettingStartedWidget } from "./components/GettingStartedWidget";
  export { PeopleNearYouWidget } from "./components/PeopleNearYouWidget"; // NEW
  export { useMemberSuggestions } from "./hooks/use-member-suggestions"; // NEW
  export type { MemberSuggestion, SuggestionReasonType } from "@/services/suggestion-service"; // NEW
  ```

### Task 9: Update Sprint Status

- [x] 9.1 Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Change `3-3-member-suggestions-dashboard-widget: ready-for-dev` → `3-3-member-suggestions-dashboard-widget: done`

## Dev Notes

### What Stories 3.1 & 3.2 Built (Do Not Reinvent)

Stories 3.1 and 3.2 are **fully complete**. The `features/discover` module is not modified by this story. Do NOT touch:

- `searchMembersInDirectory()` or `searchMembersWithGeoFallback()` in `geo-search.ts` — leave untouched
- `GeoFallbackIndicator`, `MemberGrid`, `DiscoverContent`, `useDiscover`, `useGeoFallback` — leave untouched
- `GET /api/v1/discover` and `GET /api/v1/discover/geo-fallback` routes — leave untouched
- All geo-related i18n keys in `messages/en.json` and `messages/ig.json` under `"Discover"."fallback"` — leave untouched

**Story 3.3 creates a new `suggestion-service.ts` and new routes under `/api/v1/discover/suggestions/`. The only file from features/discover it touches is the dashboard feature.**

### `MemberCardData` Is Already Defined — Reuse It

`src/services/geo-search.ts` exports `MemberCardData`:

```ts
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
```

`suggestion-service.ts` imports this type from `@/services/geo-search`. Do NOT redefine it. The `MemberSuggestion` interface wraps `MemberCardData` and adds `reasonType` + `reasonValue`.

### Conversation Type — NOT `is_group`

The `chat_conversations` table does NOT have an `is_group` column. It has a `type` enum: `"direct" | "group" | "channel"` (see `src/db/schema/chat-conversations.ts` line 5). The query for already-messaged users must filter on `c.type = 'direct'`.

### Redis Key Conventions

Following established project patterns (`redis.set(key, value, "EX", seconds)`):

- **Suggestions cache:** `suggestions:{userId}` — stores JSON-serialized `MemberSuggestion[]`, TTL 86400s (24h)
- **Dismissed set:** `suggestions:dismissed:{userId}` — Redis SADD set of dismissed userIds, TTL reset to 7776000s (90 days) on each new dismiss
- **On dismiss:** delete `suggestions:{userId}` cache key to force recompute on next fetch

Pattern: `redis.set("suggestions:{userId}", JSON.stringify(result), "EX", SUGGESTION_CACHE_TTL_SECONDS)`

### `import "server-only"` Impact

`suggestion-service.ts` has `import "server-only"` at the top. Tests MUST include:

```ts
vi.mock("server-only", () => ({}));
```

The API routes import `suggestion-service.ts` → route tests MUST also include this mock:

```ts
vi.mock("server-only", () => ({}));
vi.mock("@/services/suggestion-service", () => ({
  getMemberSuggestions: vi.fn(),
  dismissSuggestion: vi.fn(),
}));
```

`useMemberSuggestions` hook imports `MemberSuggestion` as a TYPE ONLY — the runtime bundle doesn't include `suggestion-service.ts` in client code. The `import type` is erased at compile time; no `server-only` error in jsdom tests.

### Zod v4 UUID Validation

From established project patterns (MEMORY.md critical):

```ts
import { z } from "zod/v4";
const UUIDSchema = z.string().uuid();
const parsed = UUIDSchema.safeParse(value);
if (!parsed.success) {
  // Use parsed.error.issues[0] — NOT parsed.issues[0] (undefined in Zod v4!)
  return errorResponse(400, "...", parsed.error.issues[0].message);
}
```

### DELETE Route — CSRF Validation Required

`withApiHandler` validates CSRF for all mutation methods (POST/PUT/PATCH/DELETE). Route tests for the `DELETE /api/v1/discover/suggestions/[userId]` must include the `Origin` header:

```ts
const res = await DELETE(
  new Request("http://localhost:3000/api/v1/discover/suggestions/some-uuid", {
    method: "DELETE",
    headers: {
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
  }),
);
```

Without this, tests will get 403 CSRF errors.

### `DashboardShell` — Adding `useTranslations`

`DashboardShell` is a client component (`"use client"`). Adding `useTranslations("Dashboard")` requires updating tests that mock this component. The existing `DashboardShell.test.tsx` (check if exists) likely mocks `next-intl` — verify it covers the new `"peopleNear"` namespace or add the mock keys.

Pattern from Story 1.11:

```ts
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
}));
```

### `useMemberSuggestions` — `waitFor` + Fake Timers

From Story 2.7 lessons: RTL's `waitFor` uses `setInterval` internally — it hangs with `vi.useFakeTimers()`. The helper `useRealTimersForReactQuery()` from `src/test/vi-patterns.ts` calls `vi.useRealTimers()` once when invoked. Call it at the **top of each test** that awaits React Query data:

```ts
import { useRealTimersForReactQuery } from "@/test/vi-patterns";

it("fetches suggestions", async () => {
  useRealTimersForReactQuery(); // call per-test, NOT in beforeEach
  render(<Wrapper />);
  await waitFor(() => expect(screen.getByText("result")).toBeInTheDocument());
});
```

### Algorithm: Candidate Pool vs Scored Results

The service fetches `SUGGESTION_CANDIDATE_POOL = 20` candidates from DB and scores them in memory. This is intentional:

- Avoids complex multi-join scoring SQL for MVP
- 20 candidates is sufficient for a member directory of early-stage size
- Future enhancement: increase pool size as community grows

The 20 candidates are ordered by `profile_completed_at DESC` (most recently completed profiles first) — gives preference to active/new members who haven't been seen yet.

### Score Ties — Deterministic Ordering

When multiple candidates have equal scores, the SQL `ORDER BY cp.profile_completed_at DESC` already establishes deterministic tie-breaking (most recently active profiles first). No additional sort needed after scoring.

### Location Visible vs Location Filtering

The candidate query in Task 1.5 returns **raw** `location_city/state/country` + `location_visible` boolean. Scoring uses the raw columns. The `location_visible` mask is applied in JS when mapping to `MemberCardData` (see Task 1.5 code snippet). Do NOT use `CASE WHEN` in the SQL — that would prevent scoring by hidden locations.

### Horizontal Scroll on Mobile

The suggestion cards use `flex gap-3 overflow-x-auto pb-2` on mobile, `md:flex-col md:overflow-x-visible` on desktop. The `pb-2` prevents scrollbar from clipping card content on mobile.

Card width: `w-40 flex-shrink-0` on mobile (fits 2.5 cards in viewport, hinting at scroll), `md:w-full` on desktop (full sidebar width).

### `"See all"` Link — Locale-Aware

`/discover` should use the locale-aware navigation:

```tsx
import { Link } from "@/i18n/navigation";
// ...
<Link href="/discover">{t("peopleNear.seeAll")}</Link>;
```

This ensures the link resolves to `/en/discover` or `/ig/discover` based on current locale.

### No New Migration Needed

Story 3.3 requires no DB schema changes:

- Suggestions are computed from existing `community_profiles` + `platform_blocked_users` + `chat_conversation_members` tables (all exist)
- Dismissed IDs stored in Redis SET — no DB table needed for MVP
- Suggestion cache stored in Redis — no DB table needed

**Next migration number** if one were needed: `0017` — but it is NOT needed.

### Test Pattern: `vi.mock` for `@/services/suggestion-service` in Hook Tests

Since `useMemberSuggestions` imports `MemberSuggestion` as a type from `@/services/suggestion-service`, the mock needs to handle this gracefully:

```ts
vi.mock("@/services/suggestion-service", () => ({})); // empty object — type-only imports are erased
```

No factory needed. The hook's runtime behavior depends on `fetch` (mocked via `global.fetch = vi.fn()`).

### Checklist: What to Avoid

- **Do NOT** import `suggestion-service.ts` in client components — it has `import "server-only"`. Only hooks/routes touch the service; components use the hook.
- **Do NOT** define `MemberCardData` again in suggestion-service — import from `@/services/geo-search`
- **Do NOT** modify `features/discover` module at all — this story is purely `features/dashboard` + `services/suggestion-service`
- **Do NOT** use `is_group` — the column does not exist; use `c.type = 'direct'` for direct conversation filtering
- **Do NOT** expose raw location fields in `MemberCardData` when `location_visible = false` — apply the mask before returning from service
- **Do NOT** use `z.string().uuid()` from `"zod"` — must import from `"zod/v4"` per project convention
- **Do NOT** use `parsed.issues[0]` — use `parsed.error.issues[0]` (Zod v4 API)

### Project Structure Notes

**New files:**

- `src/services/suggestion-service.ts`
- `src/services/suggestion-service.test.ts`
- `src/app/api/v1/discover/suggestions/route.ts`
- `src/app/api/v1/discover/suggestions/route.test.ts`
- `src/app/api/v1/discover/suggestions/[userId]/route.ts`
- `src/app/api/v1/discover/suggestions/[userId]/route.test.ts`
- `src/features/dashboard/hooks/use-member-suggestions.ts`
- `src/features/dashboard/hooks/use-member-suggestions.test.ts`
- `src/features/dashboard/components/PeopleNearYouWidget.tsx`
- `src/features/dashboard/components/PeopleNearYouWidget.test.tsx`

**Modified files:**

- `src/services/rate-limiter.ts` — add `MEMBER_SUGGESTIONS` and `SUGGESTION_DISMISS` presets
- `src/features/dashboard/components/DashboardShell.tsx` — flip `hasEnabledWidgets`, add widget + translations
- `src/features/dashboard/components/DashboardShell.test.tsx` — update mocks if file exists
- `src/features/dashboard/index.ts` — add new exports
- `messages/en.json` — add `Dashboard.peopleNear.*` keys
- `messages/ig.json` — add Igbo translations
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update story status

**No new migration** — 0016 is the latest and sufficient.

### Test Count Estimate

- `suggestion-service.test.ts`: ~10 new tests
- `suggestions/route.test.ts` (GET): ~4 new tests
- `suggestions/[userId]/route.test.ts` (DELETE): ~4 new tests
- `use-member-suggestions.test.ts`: ~5 new tests
- `PeopleNearYouWidget.test.tsx`: ~8 new tests
- `DashboardShell.test.tsx` (update): ~2 new tests

**Estimated new tests: ~33–35** (bringing total from ~1737 to ~1770–1772)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` — Epic 3, Story 3.3, lines 1675–1705]
- [Source: `_bmad-output/planning-artifacts/prd.md` — FR82: member suggestions]
- [Source: `_bmad-output/implementation-artifacts/3-2-geographic-fallback-discovery.md` — Story 3.2 completion notes, GEO_FALLBACK_THRESHOLD, location_visible pattern]
- [Source: `src/services/geo-search.ts` — `MemberCardData` type, block exclusion pattern, `searchMembersInDirectory` row mapping]
- [Source: `src/db/schema/chat-conversations.ts` — `conversationTypeEnum` ("direct"|"group"|"channel"), no `is_group` column]
- [Source: `src/features/dashboard/components/DashboardShell.tsx` — `hasEnabledWidgets`, `WidgetSlot` usage, sidebar layout]
- [Source: `src/features/dashboard/components/WidgetSlot.tsx` — `title` prop for aria-label, error boundary pattern]
- [Source: `src/features/dashboard/index.ts` — barrel export pattern]
- [Source: `src/services/rate-limiter.ts` — `RATE_LIMIT_PRESETS` type, `MEMBER_SEARCH` preset as reference (30/min pattern)]
- [Source: `src/services/gdpr-service.ts` — `redis.set(key, value, "EX", ttl)` pattern]
- [Source: `src/services/auth-service.ts` — `redis.sadd()` / `redis.smembers()` pattern reference via gdpr/auth]
- [Source: `_bmad-output/planning-artifacts/architecture.md` — NFR-A5 44px tap targets, dashboard rendering strategy]
- [Source: `src/test/vi-patterns.ts` — `useRealTimersForReactQuery()` for React Query tests]
- [Source: MEMORY.md — Zod v4 `parsed.error.issues[0]`, CSRF Origin header, `import "server-only"` mock, `waitFor` + fake timers antipattern]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **`errorResponse` signature fix**: Story spec showed `errorResponse(400, "msg", detail)` but actual `@/lib/api-response` `errorResponse` takes a single `ProblemDetails` object. Fixed dismiss route to use `throw new ApiError({ title, status, detail })` per established project pattern.
- **401 test pattern**: `mockRejectedValueOnce` was consumed by the rate-limit `key` function before the handler could reject; fixed to use `mockRejectedValue` (permanent) + `ApiError` (not plain Error) so `withApiHandler` correctly preserves 401 status.
- **`mockResolvedValueOnce` bleed-through**: `vi.clearAllMocks()` does NOT clear queued Once values. Changed service test `beforeEach` to call `mockReset()` on each mock to prevent cross-test contamination.

### Completion Notes List

- ✅ Task 1: `suggestion-service.ts` implemented with all helpers (`getAlreadyMessagedUserIds`, `getBidirectionalBlockIds`, `getDismissedUserIds`, `getCandidates`, `scoreCandidates`) and main exports (`getMemberSuggestions`, `dismissSuggestion`). 13 tests passing.
- ✅ Task 2: `MEMBER_SUGGESTIONS` and `SUGGESTION_DISMISS` presets added to `rate-limiter.ts`.
- ✅ Task 3: All i18n keys added to `messages/en.json` and `messages/ig.json` under `Dashboard.peopleNear`.
- ✅ Task 4: GET `/api/v1/discover/suggestions` and DELETE `/api/v1/discover/suggestions/[userId]` routes created with rate limiting and CSRF protection. 9 tests passing.
- ✅ Task 5: `useMemberSuggestions` hook with React Query + optimistic dismiss. 5 tests passing.
- ✅ Task 6: `PeopleNearYouWidget` component with loading/empty/populated states, horizontal scroll on mobile, 44px tap targets. 11 tests passing.
- ✅ Task 7: `DashboardShell` updated — `hasEnabledWidgets` flipped to `true`, `PeopleNearYouWidget` added to sidebar, `useTranslations` added. Test updated (removed "no sidebar" test, added "sidebar present + widget" test). 7 tests passing.
- ✅ Task 8: Barrel export `src/features/dashboard/index.ts` updated with new exports.
- ✅ Task 9: Sprint status updated to "review".
- **Total new tests**: 39 (1737 → 1776 passing, no regressions)

### File List

**New files:**

- `src/services/suggestion-service.ts`
- `src/services/suggestion-service.test.ts`
- `src/app/api/v1/discover/suggestions/route.ts`
- `src/app/api/v1/discover/suggestions/route.test.ts`
- `src/app/api/v1/discover/suggestions/[userId]/route.ts`
- `src/app/api/v1/discover/suggestions/[userId]/route.test.ts`
- `src/features/dashboard/hooks/use-member-suggestions.ts`
- `src/features/dashboard/hooks/use-member-suggestions.test.ts`
- `src/features/dashboard/components/PeopleNearYouWidget.tsx`
- `src/features/dashboard/components/PeopleNearYouWidget.test.tsx`

**Modified files:**

- `src/services/rate-limiter.ts`
- `src/features/dashboard/components/DashboardShell.tsx`
- `src/features/dashboard/components/DashboardShell.test.tsx`
- `src/features/dashboard/index.ts`
- `messages/en.json`
- `messages/ig.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-3-member-suggestions-dashboard-widget.md`

### Change Log

- 2026-03-01: Story 3.3 implemented — member suggestions dashboard widget with SuggestionService, Redis caching, dismiss functionality, PeopleNearYouWidget component, and full test coverage (39 new tests).
- 2026-03-01: Code review fixes (claude-opus-4-6) — 8 issues found, all fixed:
  - H1: Dismiss changed from onSuccess to truly optimistic onMutate + onError rollback
  - H2: Profile/Message navigation changed from button+router.push to semantic Link components
  - M1: queryKey now includes limit param for proper cache isolation
  - M2: Added isError state handling in PeopleNearYouWidget
  - M3: Added 4 edge case tests for invalid limit params in GET route
  - L1: Removed duplicate DashboardShell test
  - L2: Added user_id tiebreaker to JS score sort
  - L3: Added user_id secondary sort key to getCandidates SQL ORDER BY
  - Test count: 45 → 51 (6 new tests added during review fixes)
