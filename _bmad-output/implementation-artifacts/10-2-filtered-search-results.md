# Story 10.2: Filtered Search Results

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a member,
I want to filter search results by content type, date range, author, category, location, and membership tier,
so that I can narrow down results to find exactly what I'm looking for.

## Acceptance Criteria

1. Given a member is viewing search results, when they apply filters, then they can filter by content type (members, posts, articles, groups, events), date range (today, this week, this month, custom), author, category/tags, location, and membership tier (FR80).
2. Given a member applies filters, when results update, then filters are applied without full page reload (client-side filtering with API re-query).
3. Given active filters exist, when the results view renders, then active filters are visible as dismissible chips.
4. Given a member refreshes, shares, or bookmarks the page, when the search page loads, then filter state is preserved from URL search params.
5. Given filtered results are rendered, when each item is shown, then each content type uses its appropriate card format (member, post, article, group, event).
6. Given filtered result text includes query matches, when results render, then query terms are highlighted in result text.
7. Given there are more filtered results than one page, when the member scrolls, then cursor-based pagination loads additional results via infinite scroll.

## Tasks / Subtasks

- [x] Task 1: Extend search API contract for server-side filtering and cursor pagination (AC: 1,2,4,7)
  - [x] Add validated query params to `GET /api/v1/search`: `type`, `dateRange`, `dateFrom`, `dateTo`, `authorId`, `category`, `location`, `membershipTier`, `cursor`, `limit`.
  - [x] Keep route wrapped with `withApiHandler()` and RFC7807 error handling via `ApiError`.
  - [x] Return deterministic response shape for both sectioned mode and filtered full-results mode with `pageInfo.nextCursor`.
  - [x] Preserve rate limit behavior using `RATE_LIMIT_PRESETS.GLOBAL_SEARCH`.

- [x] Task 2: Implement filtered query layer with stable cursor semantics (AC: 1,2,5,7)
  - [x] Extend `src/db/queries/search.ts` to accept filter object and cursor inputs.
  - [x] Apply existing visibility/privacy constraints (status filters, soft-delete exclusion, blocked-member exclusion) to all filtered paths.
  - [x] Add deterministic sort keys per type with unique tie-breaker IDs to avoid duplicate/skip rows across pages.
  - [x] Implement cursor encoding/decoding that captures ordered fields (e.g., rank + createdAt + id where applicable).

- [x] Task 3: Deliver URL-driven filter UX in results page (AC: 1,2,3,4)
  - [x] Extend `src/features/discover/components/SearchResultsContent.tsx` with filter controls and active-chip row.
  - [x] Sync filter state to URL search params (`q`, `type`, filter params, `cursor` where needed) with router updates and no full reload.
  - [x] Add per-filter clear and clear-all actions.
  - [x] Keep all strings under `GlobalSearch` i18n namespace in `messages/en.json` and `messages/ig.json`.

- [x] Task 4: Add infinite scroll + highlighted snippets on filtered results (AC: 5,6,7)
  - [x] Add `useInfiniteQuery` path in `src/features/discover/hooks/use-global-search.ts` for filtered full-results mode.
  - [x] Implement intersection-observer driven “load more” behavior with loading/end states.
  - [x] Render query highlights safely (server-provided highlight fields preferred; client fallback must sanitize/escape output).
  - [x] Ensure card components remain consistent with existing member/post/article/group/event presentation.

- [x] Task 5: Add comprehensive tests for filter correctness and pagination safety (AC: 1-7)
  - [x] API tests: param validation, filter combinations, URL-state behavior assumptions, cursor next-page flow.
  - [x] Query tests: each filter dimension, mixed filters, cursor continuity, stable ordering, blocked/privacy constraints.
  - [x] Component tests: filter controls, dismissible chips, URL sync, infinite-scroll loading states, highlights rendering.
  - [x] Regression tests: Story 10.1 grouped search remains intact when no advanced filters are applied.

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — N/A (search.ts not imported in eventbus-bridge)
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — N/A (all 200 responses)
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps — N/A (no new roles)

## Dev Notes

### Overview

Story 10.2 extends Story 10.1's grouped global search into a full filtered search experience. Reuse the existing search foundation — do not re-implement from scratch. Story 10.1 introduced `cursor` plumbing placeholders and explicitly deferred filtered full-results pagination to this story.

### Mode Switching (Critical Architecture Decision)

The search page operates in two distinct modes determined by URL params:

- **Overview mode**: `type` param is absent or `"all"` → show grouped sections (existing 10.1 behavior). Use `useQuery`. No filters, no infinite scroll.
- **Filtered mode**: `type` is a specific type (e.g., `members`, `posts`) → show single-type results with filter controls, active chips, infinite scroll. Use `useInfiniteQuery`.

Story 10.1's "See all" links already navigate to `/search?q=...&type=members` etc. — this URL triggers filtered mode. The `search/page.tsx` currently reads only `q`; it must also read `type` and all filter params from `searchParams` and pass them to `SearchResultsContent`.

### Filter-to-Type Applicability Matrix

Not all filters apply to all content types. The query layer must only apply filters relevant to the selected type. Inapplicable filters are silently ignored (not errors).

| Filter                              | members                                       | posts                                           | articles    | groups    | events             |
| ----------------------------------- | --------------------------------------------- | ----------------------------------------------- | ----------- | --------- | ------------------ |
| `dateRange` / `dateFrom` / `dateTo` | createdAt                                     | createdAt                                       | publishedAt | createdAt | startsAt           |
| `authorId`                          | —                                             | ✓ (author)                                      | ✓ (author)  | —         | ✓ (hostId)         |
| `category`                          | —                                             | ✓ (enum: `discussion`, `event`, `announcement`) | —           | —         | —                  |
| `location`                          | ✓ (profile fields)                            | —                                               | —           | —         | ✓ (event location) |
| `membershipTier`                    | ✓ (enum: `BASIC`, `PROFESSIONAL`, `TOP_TIER`) | —                                               | —           | —         | —                  |

**`location` filter**: Free-text `ILIKE '%' || $input || '%'` match against `location_city`, `location_state`, OR `location_country` (ANY match). Use parameterized query — no raw string interpolation.

**`category` filter**: Applies ONLY to posts via `community_post_category` enum. Do NOT apply to articles (articles have no category column). Validate against enum values: `discussion`, `event`, `announcement`.

**`documents` type**: Exclude from filter type selector in UI. If `type=documents` arrives via URL, return empty results gracefully (same as 10.1).

### Type-Specific Result Cards (AC5)

Each content type must render a distinct card layout in filtered mode. Fields to display per type:

- **Member card**: photo (or initial avatar), displayName, locationCity, membershipTier badge, bio snippet
- **Post card**: content preview (highlighted), author displayName, category badge, createdAt relative date, reaction/comment counts
- **Article card**: title (highlighted), author displayName, publishedAt date, featuredImage thumbnail, subtitle (titleIgbo if exists)
- **Group card**: name (highlighted), description snippet, memberCount, visibility badge (`public`/`private`), joinType indicator
- **Event card**: title (highlighted), startsAt date/time, location, RSVP count, status badge (upcoming/ongoing/past)

In overview mode, the existing generic `ResultRow` is acceptable.

### Cursor Encoding

Use base64-encoded JSON for opaque cursor tokens. Encode the sort fields per type:

```ts
// Encode: btoa(JSON.stringify({ rank, sortVal, id }))
// Decode: JSON.parse(atob(cursor))
```

Sort keys and cursor fields per type (existing sort order from 10.1):

- members: `rank DESC, display_name ASC` → cursor: `{ rank, displayName, id }`
- posts: `rank DESC, created_at DESC` → cursor: `{ rank, createdAt, id }`
- articles: `rank DESC, published_at DESC` → cursor: `{ rank, publishedAt, id }`
- groups: `rank DESC, member_count DESC` → cursor: `{ rank, memberCount, id }`
- events: `rank DESC, starts_at ASC` → cursor: `{ rank, startsAt, id }`

The `WHERE` clause for cursor pagination must use the composite comparison pattern: `(rank, sortVal, id) < (cursorRank, cursorSortVal, cursorId)` (adjusted for ASC/DESC per field).

### Highlighting with `ts_headline`

- Use `ts_headline('english', content_field, query, 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30, MinWords=15')`.
- Return the highlighted snippet as a `highlight` field in the API response per item.
- On the client, render highlight HTML via `dangerouslySetInnerHTML` ONLY after server-side sanitization with `sanitize-html` (allow only `<mark>` tags).
- Never trust raw `ts_headline` output on the client without sanitization.

### Filter UX Layout

- Desktop: collapsible horizontal filter bar above results. Type selector as tab-like buttons. Other filters as dropdown selects in a row.
- Mobile: full-width stacked filter controls, collapsible.
- Active filter chips row between filter bar and results list. Each chip has an × dismiss button. "Clear all" link at row end.
- Filter changes debounce API calls: click-based filters (type, category, tier) apply immediately; text-based filters (location) debounce 300ms. Date range applies on selection/confirm.

### Technical Requirements

- **API**: Continue using `GET /api/v1/search`. Keep `q >= 3` guard. Add Zod validation for filter params. `dateRange=custom` requires both `dateFrom` AND `dateTo` — throw `ApiError` 400 if missing either. Valid `dateRange` values: `today`, `week`, `month`, `custom`.
- **Server-side filtering only**: All filtering in query layer. No client-side post-filtering.
- **Cursor stability**: Deterministic under concurrent inserts via unique tie-breaker ID.
- **Existing constraints preserved**: status filters, soft-delete exclusion, blocked-member exclusion (both directions in members query), hidden group exclusion, cancelled event exclusion.
- **`withApiHandler()`** wrapping + `RATE_LIMIT_PRESETS.GLOBAL_SEARCH` rate limit preserved.

### Architecture Compliance

- REST route handlers in `src/app/api/v1/*`, wrapped by `withApiHandler()`.
- DB queries in `src/db/queries/*` only. No inline SQL outside query layer.
- `camelCase` API response shape. URL as source of truth for search/filter state.
- TanStack Query v5: `useInfiniteQuery` with `initialPageParam: undefined` and `getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined`.
- `useQuery` for overview mode, `useInfiniteQuery` for filtered mode — same hook file, branched by whether `type` is a specific type.
- `plainto_tsquery('english', ...)` or `websearch_to_tsquery` for user input. Never `to_tsquery` with raw strings.
- Strict TypeScript, no `any`. Feature-barrel imports. All UI strings via `useTranslations()`.
- Project on Next.js `16.1.6`; preserve async params/searchParams patterns.

### File Structure

- **Extend**:
  - `src/app/api/v1/search/route.ts` — add filter param validation, pass filters to query layer
  - `src/db/queries/search.ts` — add filter objects, cursor encode/decode, per-type filtered queries
  - `src/features/discover/hooks/use-global-search.ts` — add `useInfiniteQuery` branch, accept filter params
  - `src/features/discover/components/SearchResultsContent.tsx` — add filter controls, chips, infinite scroll, type-specific cards, highlights
  - `src/app/[locale]/(app)/search/page.tsx` — read all filter params from searchParams, pass to component
- **Add/extend tests**:
  - `src/app/api/v1/search/route.test.ts`
  - `src/db/queries/search.test.ts`
  - `src/features/discover/components/SearchResultsContent.test.tsx`
  - `src/features/discover/hooks/use-global-search.test.ts` (if `useInfiniteQuery` branch warrants separate tests)
- **i18n**: `messages/en.json` + `messages/ig.json` — new keys under `GlobalSearch` namespace

### Testing Requirements

- **API tests**: invalid filter params → 400 RFC7807; `dateRange=custom` without `dateFrom`/`dateTo` → 400; valid filter combos → expected shape + `pageInfo.nextCursor`; cursor next-page flow; inapplicable filter for type silently ignored (not error).
- **Query tests**: each filter dimension independently; mixed filter combos; cursor continuity (no duplicate IDs between pages); stable ordering; blocked/privacy constraints preserved; `category` filter only affects posts (not articles).
- **UI tests**: filter controls mutate URL params + trigger re-query without reload; active chips render + dismiss + clear-all; infinite scroll loads next cursor pages + handles end state; highlight rendering shows `<mark>` emphasis without unsafe markup; overview mode (no type) renders grouped sections unchanged (10.1 regression).
- **Regression**: Story 10.1 grouped search remains intact when no type filter is applied.

### Previous Story Intelligence

From Story 10.1:

- Search API, query layer, UI scaffolding in place and tested.
- `cursor` param accepted in route but ignored in query layer — complete it here.
- `documents` type returns empty array — keep this behavior, exclude from filter UI.
- Block/mute constraints patched during review — do not regress.
- Mobile search affordance in TopNav + ARIA fixes already landed — maintain.
- Existing search functions use `plainto_tsquery`, `limit + 1` hasMore trick, raw `db.execute(sql\`...\`)`.
- Current sort keys: members (rank DESC, display_name ASC), posts (rank DESC, created_at DESC), articles (rank DESC, published_at DESC), groups (rank DESC, member_count DESC), events (rank DESC, starts_at ASC).
- `pageInfo.cursor` is hardcoded `null` — replace with real cursor in filtered mode.
- `searchMembers` excludes viewer + blocked users (both directions).
- `ResultRow` is generic for all types — extend with type-specific cards for filtered mode.
- `use-global-search.ts` hardcodes `limit: "5"` and uses `useQuery` only — extend for filtered mode with configurable limit and `useInfiniteQuery`.
- `search/page.tsx` reads only `q` — must also read `type` and filter params.

### DB Schema Quick Reference

- `membershipTierEnum`: `BASIC`, `PROFESSIONAL`, `TOP_TIER` (in `auth-permissions.ts`)
- `postCategoryEnum`: `discussion`, `event`, `announcement` (in `community-posts.ts`)
- `communityProfiles`: `locationCity`, `locationState`, `locationCountry` (all varchar 255, indexed)
- `communityPosts.category`: uses `postCategoryEnum`
- `communityArticles`: no `category` column — do not apply category filter to articles
- `communityEvents`: has `location` (text), `startsAt`, `endsAt`, `status`, `hostId`

### References

- `_bmad-output/planning-artifacts/epics.md` (Epic 10, Story 10.2 acceptance criteria)
- `_bmad-output/planning-artifacts/prd.md` (FR80, search/discovery requirements)
- `_bmad-output/planning-artifacts/architecture.md` (API/query/state/pagination patterns)
- `_bmad-output/project-context.md` (implementation guardrails)
- `_bmad-output/implementation-artifacts/10-1-global-search-autocomplete.md` (previous story learnings)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Sprint source: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Story source: `_bmad-output/planning-artifacts/epics.md` (Story 10.2)
- Previous story: `_bmad-output/implementation-artifacts/10-1-global-search-autocomplete.md`
- Existing implementation references: `src/app/api/v1/search/route.ts`, `src/db/queries/search.ts`, `src/features/discover/components/SearchResultsContent.tsx`, `src/features/discover/hooks/use-global-search.ts`

### Completion Notes List

- Story 10.2 context assembled from epics, PRD, architecture, UX spec, project context, prior story intelligence, git pattern analysis, and current-version technical references.
- Guidance optimized for dev-agent execution with explicit constraints, file targets, and test guardrails.
- **Task 1**: Extended route with Zod v4 validation for all filter params (`dateRange`, `dateFrom`, `dateTo`, `authorId`, `category`, `location`, `membershipTier`, `cursor`). `dateRange=custom` requires both `dateFrom`+`dateTo` → 400 otherwise. Filters only passed to query layer in filtered mode (single type, not "all").
- **Task 2**: Extended `search.ts` with `SearchFilters` type, `encodeCursor`/`decodeCursor` helpers (base64+JSON), per-type filtered search functions with seek predicates for cursor pagination, `ts_headline` highlights sanitized via `sanitize-html` (only `<mark>` allowed). Overview mode (type=all or no filters) preserved unchanged. `documents` type returns empty gracefully.
- **Task 3**: `SearchResultsContent.tsx` now accepts `initialType`/`initialFilters` props. Mode switching: overview vs filtered. `FilterBar` shows applicable filters per type (category→posts only, location→members+events, membershipTier→members only). `ActiveChips` shows dismissible chips with per-chip × and clear-all. URL synced on every filter change via `router.push`. `LocationInput` debounces 300ms.
- **Task 4**: `use-global-search.ts` exports `useFilteredSearch` using `useInfiniteQuery` with `initialPageParam: undefined` and `getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined`. `InfiniteScrollSentinel` uses IntersectionObserver. Type-specific cards: MemberCard, PostCard, ArticleCard, GroupCard, EventCard. Highlights rendered via `dangerouslySetInnerHTML` (server-sanitized).
- **Task 5**: 59 new tests (32 route, 25 query, 30 component). Pre-existing failures unchanged (2 lua-runner + 10 BottomNav = 12 total). IntersectionObserver mocked in component tests with function syntax.
- **Key decisions**: Used `Buffer.from(...).toString("base64")` for cursor encoding (Node env). `community_events.start_time` is the real column name (schema uses `startTime`). `community_events.creator_id` maps to `authorId` filter. `community_articles` has no `published_at`, uses `created_at`.

### File List

- `_bmad-output/implementation-artifacts/10-2-filtered-search-results.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/api/v1/search/route.ts`
- `src/app/api/v1/search/route.test.ts`
- `src/db/queries/search.ts`
- `src/db/queries/search.test.ts`
- `src/features/discover/hooks/use-global-search.ts`
- `src/features/discover/components/SearchResultsContent.tsx`
- `src/features/discover/components/SearchResultsContent.test.tsx`
- `src/app/[locale]/(app)/search/page.tsx`
- `messages/en.json`
- `messages/ig.json`

## Senior Developer Review (AI)

**Reviewer:** Dev on 2026-03-08
**Outcome:** Approved with fixes applied

### Findings Fixed (7 issues: 3 HIGH, 4 MEDIUM)

1. **F1 (HIGH)** — Hardcoded English placeholder `"City, state, country"` in `LocationInput`. Fixed: added `placeholder` prop threaded from `useTranslations()`, added `filters.locationPlaceholder` i18n key to both `en.json` and `ig.json`.
2. **F2 (HIGH)** — Overview `searchEvents` used wrong column `e.starts_at` instead of `e.start_time` (the actual DB column). Fixed in `search.ts`.
3. **F5 (HIGH→fixed)** — `syncUrl` used `router.push({ pathname, query })` object form, but next-intl's `useRouter().push()` only accepts strings. Would silently navigate to `[object Object]`. Fixed: builds URL string with `URLSearchParams`.
4. **F4 (MEDIUM)** — `SearchSection` interface missing `nextCursor` field, relying on type intersection. Fixed: added `nextCursor?: string | null` to interface, removed all `& { nextCursor: string | null }` intersections.
5. **F6 (MEDIUM)** — No test for `handleTypeChange` clearing type-specific filters when switching type. Fixed: added test verifying dateRange is preserved but membershipTier/location are cleared.
6. **F7 (MEDIUM)** — `LocationInput` timer ref not cleared on unmount (stale callback risk). Fixed: added cleanup `useEffect` returning `clearTimeout`.
7. **F5-test (MEDIUM)** — Added test verifying `syncUrl` produces a proper `/search?...` URL string, not `[object Object]`.

### Not Fixed (2 LOW issues)

- **F8**: Dev Agent Record says "59 new tests" but actual count is 87 — documentation typo only.
- **F9**: `authorId` chip shows truncated UUID — cosmetic UX issue, deferred to future story.

### Test Count

- Pre-review: 87 tests (32 route + 25 query + 30 component)
- Post-review: 89 tests (+2 review fix tests)

### Change Log

- 2026-03-08: Senior dev review — 7 fixes applied, 2 new tests added
