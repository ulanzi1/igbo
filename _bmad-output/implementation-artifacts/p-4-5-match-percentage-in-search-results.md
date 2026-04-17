# Story P-4.5: Match Percentage in Search Results

Status: done

<!-- Portal Epic 4, Story 5. Depends on P-4.4 (done — guest browsing), P-4.1B (done — search UI), P-2.2 (done — seeker preferences). This story adds a lightweight placeholder match scoring heuristic for authenticated seekers with consent. MatchPill component displayed on search result cards and discovery page cards. Forward-compatible with Epic 7's full matching engine. -->

## Story

As an **authenticated job seeker**,
I want to **see a match percentage on each job listing in search results**,
so that **I can prioritize jobs that best fit my profile**.

## Acceptance Criteria

1. **MatchPill component shows match score and tier on search result cards.** Each card includes a MatchPill showing the score (0–100) and tier label (Strong / Good / Fair). Tier colors: Strong (75+) = Forest Green, Good (50–74) = Golden Amber, Fair (30–49) = Sandy Tan. Scores below 30 are tier "none" and MatchPill is NOT shown (suppressed per PRD FR47).

2. **Lightweight placeholder heuristic computes match score.** The heuristic uses three signals:
   - `skillsOverlap`: count of seeker `skills[]` matching job `requirements` keywords (case-insensitive word tokenization), normalized to 0–60 points. Formula: `Math.min(60, Math.round((matchCount / Math.max(seekerSkills.length, 1)) * 60))`.
   - `locationMatch`: seeker `locations[]` (from preferences) vs job `location`. Exact match (case-insensitive includes) = 25 points, partial match (same region/country substring) = 15 points, no match = 0.
   - `employmentTypeMatch`: seeker `workModes[]` mapped to employment types vs job `employmentType`. Match = 15 points, no preference set = 10 points, mismatch = 0.
   - Total = skillsOverlap + locationMatch + employmentTypeMatch (capped at 100).

3. **Response shape is forward-compatible with Epic 7.** The `MatchScoreResult` type is defined in `@igbo/config` and exported from `./match`:
   ```typescript
   { score: number; tier: "strong" | "good" | "fair" | "none"; signals: { skillsOverlap: number; locationMatch: boolean; employmentTypeMatch: boolean } }
   ```
   Epic 7 replaces computation logic but preserves this shape exactly.

4. **Consent gate: no MatchPill without profile + consent.** If seeker has no profile or `consentMatching === false`, no MatchPill is shown. A subtle prompt displayed once per session: "Complete your profile to see how well you match" (sessionStorage key: `match_prompt_dismissed`).

5. **Match scores displayed on discovery page cards too.** Featured jobs and recent postings on `/[locale]/jobs` show MatchPill for authenticated seekers with consent.

6. **Match computation is client-side via a dedicated API endpoint.** A new `GET /api/v1/jobs/match-scores` endpoint accepts `jobIds[]` and returns `{ scores: Record<string, MatchScoreResult> }` for the authenticated seeker. The search page and discovery page call this endpoint after initial results load (non-blocking, progressive enhancement). Unauthenticated requests return 401. Seekers without profiles or consent return empty `scores: {}`.

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` → §7 Frontend Safety & Readiness

### i18n Key Inventory

- [x] Every user-facing string in the UI mocks / ACs maps to a key below
- [x] English copy filled in for every row
- [x] Keys reserved in `apps/portal/messages/en.json` (Igbo copy at Dev Completion)

- Keys:
  - `Portal.match.strong` — "Strong Match" — (Igbo copy at Dev Completion)
  - `Portal.match.good` — "Good Match" — (Igbo copy at Dev Completion)
  - `Portal.match.fair` — "Fair Match" — (Igbo copy at Dev Completion)
  - `Portal.match.score` — "{score}% match" — (Igbo copy at Dev Completion)
  - `Portal.match.completeProfilePrompt` — "Complete your profile to see how well you match" — (Igbo copy at Dev Completion)
  - `Portal.match.completeProfileLink` — "Complete Profile" — (Igbo copy at Dev Completion)
  - `Portal.match.dismiss` — "Dismiss" — (Igbo copy at Dev Completion)

### Sanitization Points

- [x] **[N/A]** — this story renders no HTML from strings. Justification: MatchPill renders score numbers and translated tier labels. No `dangerouslySetInnerHTML`.

### Accessibility Patterns

- [x] Keyboard interaction pattern documented for every new interactive element
- [x] ARIA roles/labels listed for every semantically meaningful element
- [x] Focus management plan documented
- [x] axe-core assertions planned in component tests

- Elements:
  - **MatchPill**: Non-interactive `<span>` with `aria-label="{score}% match - {tier}"`. Purely informational, no keyboard interaction. Screen reader announces score and tier via aria-label. axe assertion in component test.
  - **CompleteProfilePrompt**: Dismissible inline prompt (not a modal — no focus trap). Close button is `<button>` with `aria-label="Dismiss"` (i18n). Link to profile page is standard `<a>`. axe assertion planned.

### Component Dependencies

- [x] Every shadcn/ui component this story needs is listed below
- [x] Verified present in `apps/portal/src/components/ui/`

- Components:
  - `Badge` — verified at `apps/portal/src/components/ui/badge.tsx` (for MatchPill, using existing `success`/`warning`/`accent` variants)
  - `Button` — verified at `apps/portal/src/components/ui/button.tsx` (for dismiss)

### Codebase Verification

- [x] All referenced DB field names verified against current Drizzle schema
- [x] All referenced file paths verified to exist (or explicitly marked as new files)
- [x] All referenced TypeScript types/interfaces verified against current source
- [x] All referenced API route paths verified against current route tree
- [x] All referenced component names verified in portal components

- Verified references:
  - `portalSeekerProfiles.skills` (TEXT[]) — verified at `packages/db/src/schema/portal-seeker-profiles.ts`
  - `portalSeekerProfiles.consentMatching` (BOOLEAN) — verified at `packages/db/src/schema/portal-seeker-profiles.ts`
  - `portalSeekerPreferences.locations` (TEXT[]) — verified at `packages/db/src/schema/portal-seeker-preferences.ts`
  - `portalSeekerPreferences.workModes` (TEXT[]) — verified at `packages/db/src/schema/portal-seeker-preferences.ts`
  - `portalSeekerPreferences.desiredRoles` (TEXT[]) — verified at `packages/db/src/schema/portal-seeker-preferences.ts`
  - `portalJobPostings.requirements` (TEXT) — verified at `packages/db/src/schema/portal-job-postings.ts`
  - `portalJobPostings.location` (VARCHAR 200) — verified at `packages/db/src/schema/portal-job-postings.ts`
  - `portalJobPostings.employmentType` (ENUM) — verified at `packages/db/src/schema/portal-job-postings.ts`
  - `getSeekerProfileByUserId(userId)` — verified at `packages/db/src/queries/portal-seeker-profiles.ts`
  - `getSeekerPreferencesByProfileId(profileId)` — verified at `packages/db/src/queries/portal-seeker-preferences.ts`
  - `JobSearchResultItem` — verified at `apps/portal/src/lib/validations/job-search.ts` (14 fields, no match field yet)
  - `JobResultCard` — verified at `apps/portal/src/components/domain/job-result-card.tsx`
  - `JobDiscoveryPageContent` — verified at `apps/portal/src/components/domain/job-discovery-page-content.tsx` (uses `JobResultCard`)
  - `JobSearchPageContent` — verified at `apps/portal/src/components/domain/job-search-page-content.tsx`
  - `useJobSearch` hook — verified at `apps/portal/src/hooks/use-job-search.ts`
  - `searchJobs` service — verified at `apps/portal/src/services/job-search-service.ts`
  - `GET /api/v1/jobs/search` — verified at `apps/portal/src/app/api/v1/jobs/search/route.ts`
  - Badge component variants (`success`, `warning`, `accent`) — verified at `apps/portal/src/components/ui/badge.tsx`
  - `@igbo/config` exports — verified at `packages/config/src/index.ts` — no match config yet
  - `MatchScoreResult` type — **new**, created in Task 1 at `packages/config/src/match.ts`
  - `MatchPill` component — **new**, created in Task 3
  - `computeMatchScore` function — **new**, created in Task 2
  - `GET /api/v1/jobs/match-scores` route — **new**, created in Task 5
  - `useMatchScores` hook — **new**, created in Task 6
  - `CompleteProfilePrompt` component — **new**, created in Task 4

### Story Sizing Check

- [x] System axes count: **5** (DB queries — 1 new, Services — 1 new, API routes — 1 new, UI components — 3 new + 2 modified, Cross-feature integration — search + discovery pages)
- [x] If 3+ axes: justification — All axes serve one cohesive feature (match percentage display). The match scoring service is a pure function with no DB writes. The API route is a thin wrapper. UI components are small (MatchPill is a badge variant, CompleteProfilePrompt is a dismissible div). Splitting would create incomplete stories (service without UI or UI without data).

### Agent Model Selection

- [x] Agent model selected: `claude-opus-4-6`
- [x] If opus: justification — 5 system axes (§11 threshold), new shared type in @igbo/config affecting cross-package boundaries, forward-compatibility contract with Epic 7 (must get type shape right), client-side data fetching pattern (progressive enhancement) requires careful race-condition handling, employment type ↔ work mode mapping is non-trivial.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Authenticated seeker with consent sees MatchPill on search results** — Log in as a seeker with `consentMatching: true`, skills `["JavaScript", "React"]`, preferred location `["Lagos"]`. Search for a job with `requirements` containing "JavaScript" in Lagos. Expected: MatchPill shows a score (should be high, likely 75+, "Strong Match" in green). Evidence: screenshot of search results with MatchPill visible.

2. **MatchPill tiers display correct colors** — Find jobs matching different score ranges. Expected: Strong (75+) = green, Good (50–74) = amber, Fair (30–49) = tan. Scores < 30 = no MatchPill shown. Evidence: screenshots showing different tier colors.

3. **Guest user sees no MatchPill** — Open search page in incognito. Expected: No MatchPill on any result card. No "complete profile" prompt. Evidence: screenshot.

4. **Seeker without consent sees CompleteProfilePrompt** — Log in as seeker with `consentMatching: false`. View search results. Expected: No MatchPill. Subtle prompt "Complete your profile to see how well you match" shown once. After dismissing, prompt does not reappear during session. Evidence: screenshots before/after dismiss.

5. **Discovery page shows MatchPill** — As authenticated seeker with consent, visit `/en/jobs`. Expected: Featured and recent job cards show MatchPill. Evidence: screenshot.

6. **Match scores load progressively (non-blocking)** — Search results render immediately with no MatchPill, then MatchPills appear after the match-scores API responds. Expected: No layout shift (reserved space). Evidence: demonstrated flow or network tab showing sequential requests.

7. **No seeker profile → CompleteProfilePrompt** — Log in as user with JOB_SEEKER role but no seeker profile created yet. Expected: No MatchPill, prompt shown. Evidence: screenshot.

## Flow Owner (SN-4)

**Owner:** Dev (client-side display + service computation — no cross-app integration)

## Tasks / Subtasks

- [x] Task 0: Prerequisites (AC: all)
  - [x] 0.1 Verify `Badge` component exists at `apps/portal/src/components/ui/badge.tsx` with `success`, `warning`, `accent` variants.

- [x] Task 1: Define `MatchScoreResult` shared type in `@igbo/config` (AC: #3)
  - [x] 1.1 Create `packages/config/src/match.ts` — exports:
    - `MatchScoreResult` interface: `{ score: number; tier: "strong" | "good" | "fair" | "none"; signals: { skillsOverlap: number; locationMatch: boolean; employmentTypeMatch: boolean } }`
    - `MATCH_TIERS` constant: `{ STRONG: { min: 75, label: "strong" }, GOOD: { min: 50, label: "good" }, FAIR: { min: 30, label: "fair" }, NONE: { min: 0, label: "none" } }` — single source of truth for tier boundaries.
    - `getMatchTier(score: number): MatchScoreResult["tier"]` — pure function mapping score to tier.
  - [x] 1.2 Export from `packages/config/src/index.ts` as `export * from "./match"` (or `export * as match from "./match"` — follow existing pattern like `export * from "./chat"`).
  - [x] 1.3 Create `packages/config/src/match.test.ts` — tests: `getMatchTier` returns correct tier for boundary values (0, 29, 30, 49, 50, 74, 75, 100), `MatchScoreResult` type is importable.
  - [x] 1.4 Run `pnpm --filter @igbo/config build` to verify exports compile.

- [x] Task 2: Create match scoring service (AC: #2)
  - [x] 2.1 Create `apps/portal/src/services/match-scoring-service.ts` — exports:
    - `computeMatchScore(seekerProfile: { skills: string[] }, seekerPreferences: { locations: string[]; workModes: string[] } | null, jobPosting: { requirements: string | null; location: string | null; employmentType: string }): MatchScoreResult` — pure function, no DB access, no side effects.
    - **Skills overlap logic**: Tokenize job `requirements` by splitting on whitespace/punctuation → lowercase. For each seeker skill (lowercased), check if any job requirement token contains it or vice versa (substring match, not exact). `matchCount` = number of seeker skills with at least one hit. Points = `Math.min(60, Math.round((matchCount / Math.max(seekerSkills.length, 1)) * 60))`.
    - **Location match logic**: For each seeker `locations[]` entry (lowercased), check if it appears as substring in job `location` (lowercased) or vice versa. Exact city match = 25. If no exact match, check if any seeker location shares a common region word (e.g., "Nigeria", "Lagos State") with job location = 15. No match = 0.
    - **Employment type match logic**: Map seeker `workModes` → employment types: `["remote"] → any type`, `["onsite", "hybrid"] → full_time, part_time, contract, internship, apprenticeship`. If `workModes` is empty/null = 10 points (no preference). If job employment type is compatible with any mapped mode = 15. Mismatch = 0. **Note**: `workModes` and `employmentType` are orthogonal concepts (work flexibility vs contract type). The mapping is intentionally loose as a placeholder — Epic 7 will replace it. **Dev: add `// PLACEHOLDER: Epic 7 replaces this workModes→employmentType mapping` comment in source.**
    - Uses `getMatchTier()` from `@igbo/config` for tier assignment.
  - [x] 2.2 Create `apps/portal/src/services/match-scoring-service.test.ts` — tests:
    - Skills: 0 skills → 0 points, all skills match → 60 points, partial match → proportional, case-insensitive matching.
    - Location: exact match → 25, partial region match → 15, no match → 0, multiple locations checked.
    - Employment type: match → 15, no preference → 10, mismatch → 0, workModes mapping.
    - Integration: all signals combined, cap at 100, tier assignment (strong/good/fair/none boundaries).
    - Edge cases: null/empty requirements, null/empty location, null preferences, empty skills array, empty locations array.

- [x] Task 3: Create `MatchPill` component (AC: #1)
  - [x] 3.1 Create `apps/portal/src/components/domain/match-pill.tsx` — a small inline badge displaying match score and tier:
    - Props: `{ matchScore: MatchScoreResult }` — does NOT render if `tier === "none"`.
    - Uses `Badge` component with tier-mapped variants: Strong → `variant="success"`, Good → custom amber className (`bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300`), Fair → custom tan className (`bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300`).
    - Content: `{score}% · {t(`Portal.match.${tier}`)}` (e.g., "82% · Strong Match").
    - `aria-label={t("Portal.match.score", { score })}` for screen readers.
    - Compact size: `text-xs` variant.
  - [x] 3.2 Create `apps/portal/src/components/domain/match-pill.test.tsx` — tests:
    - Renders score and tier label for strong/good/fair.
    - Does NOT render for tier "none" (score < 30).
    - Correct variant/color class per tier.
    - aria-label includes score.
    - axe accessibility assertion (no violations).

- [x] Task 4: Create `CompleteProfilePrompt` component (AC: #4)
  - [x] 4.1 Create `apps/portal/src/components/domain/complete-profile-prompt.tsx` — a dismissible inline prompt:
    - Renders: text "Complete your profile to see how well you match" + link to `/profile` + dismiss button.
    - Dismiss persisted in `sessionStorage` key `match_prompt_dismissed`.
    - Uses `useState` + `useEffect` for hydration-safe sessionStorage check (same pattern as P-4.4 GuestConversionBanner).
    - `role="status"`, `aria-label` for screen readers. Dismiss button: `aria-label={t("Portal.match.dismiss")}`.
    - Only renders once per session — checks sessionStorage on mount, writes on dismiss.
  - [x] 4.2 Create `apps/portal/src/components/domain/complete-profile-prompt.test.tsx` — tests:
    - Renders prompt text and profile link.
    - Dismiss button hides prompt.
    - Re-render after dismiss does NOT show prompt (sessionStorage check).
    - Does NOT render if sessionStorage already has `match_prompt_dismissed`.
    - axe accessibility assertion.

- [x] Task 5: Create `GET /api/v1/jobs/match-scores` API route (AC: #6)
  - [x] 5.1 Create `apps/portal/src/app/api/v1/jobs/match-scores/route.ts`:
    - Method: GET with query param `jobIds` (comma-separated UUIDs, max 50).
    - Auth: `const session = await auth()` from `@igbo/auth` — return 401 if `!session?.user` (portal auth pattern, NOT community's `requireAuthenticatedSession()`).
    - Check `session.user.activePortalRole === "JOB_SEEKER"` — return empty `{ scores: {} }` for non-seekers.
    - Load seeker profile via `getSeekerProfileByUserId(session.user.id)` — return empty if no profile.
    - Check `profile.consentMatching === true` — return empty if no consent.
    - Load preferences via `getSeekerPreferencesByProfileId(profile.id)`.
    - Load job postings for requested `jobIds` via a new batch query (see Task 5.2).
    - Call `computeMatchScore()` for each job posting.
    - Return `{ scores: { [jobId]: MatchScoreResult } }`.
    - **No caching** (personalized per-user — Redis cache would need per-user keys, premature optimization for placeholder heuristic).
  - [x] 5.2 Create a batch job query in `packages/db/src/queries/portal-job-search.ts` — add:
    - `getJobPostingsForMatching(jobIds: string[]): Promise<Array<{ id: string; requirements: string | null; location: string | null; employmentType: string }>>` — minimal projection for match computation. Filter: `status = 'active'` AND `id IN (jobIds)`. Max 50 IDs.
  - [x] 5.3 Create `apps/portal/src/app/api/v1/jobs/match-scores/route.test.ts` — tests:
    - Unauthenticated → 401.
    - Non-seeker role → `{ scores: {} }`.
    - No seeker profile → `{ scores: {} }`.
    - `consentMatching: false` → `{ scores: {} }`.
    - Valid request → returns scores for each job ID.
    - Missing `jobIds` param → 400.
    - More than 50 job IDs → 400.
    - Invalid UUID format → 400.
  - [x] 5.4 Create `packages/db/src/queries/portal-job-search.test.ts` addition — add test for `getJobPostingsForMatching`: returns minimal projection, filters active-only, respects ID list.

- [x] Task 6: Create `useMatchScores` hook (AC: #6)
  - [x] 6.1 Create `apps/portal/src/hooks/use-match-scores.ts`:
    - `useMatchScores(jobIds: string[], enabled: boolean): { scores: Record<string, MatchScoreResult>; isLoading: boolean }`.
    - `enabled` is `true` only for authenticated seekers (derived from session — `activePortalRole === "JOB_SEEKER"` AND not guest).
    - Fetches `GET /api/v1/jobs/match-scores?jobIds=id1,id2,...` when `enabled && jobIds.length > 0`.
    - Uses `useEffect` + `fetch` (NOT react-query — portal doesn't use it). Aborts on cleanup via `AbortController`.
    - Deduplicates: if `jobIds` haven't changed (referential equality via `JSON.stringify`), skip re-fetch.
    - Returns empty `scores: {}` and `isLoading: false` when `!enabled`.
  - [x] 6.2 Create `apps/portal/src/hooks/use-match-scores.test.ts` — tests:
    - `enabled: false` → no fetch, empty scores.
    - `enabled: true` with valid jobIds → fetches and returns scores.
    - Re-renders with same jobIds → no duplicate fetch.
    - Re-renders with different jobIds → re-fetches.
    - Fetch error → empty scores, `isLoading: false` (graceful degradation).
    - Cleanup aborts in-flight request.

- [x] Task 7: Integrate MatchPill into `JobResultCard` (AC: #1, #5)
  - [x] 7.1 Update `apps/portal/src/components/domain/job-result-card.tsx`:
    - Add optional prop: `matchScore?: MatchScoreResult | null`.
    - If `matchScore` is provided and `tier !== "none"`, render `<MatchPill matchScore={matchScore} />` **inline on the meta line** (after location/type/salary, before cultural context badges) to avoid layout shift when scores load asynchronously. If inline placement is not feasible, reserve space with `min-h-[20px]` on the MatchPill row to prevent content reflow.
    - No change if `matchScore` is undefined/null — backward compatible.
  - [x] 7.2 Update `apps/portal/src/components/domain/job-result-card.test.tsx`:
    - Test: MatchPill renders when matchScore provided with tier !== "none".
    - Test: MatchPill NOT rendered when matchScore is null/undefined.
    - Test: MatchPill NOT rendered when tier is "none".

- [x] Task 8: Integrate match scores into search page (AC: #1, #4, #6)
  - [x] 8.1 Update `apps/portal/src/components/domain/job-search-page-content.tsx`:
    - Import `useMatchScores` hook. Extract `jobIds` from `results` array.
    - Determine `enabled` from session status (use existing `useSession()` + check `activePortalRole === "JOB_SEEKER"`).
    - Pass `matchScore={scores[item.id] ?? null}` to each `JobResultCard`.
    - Show `<CompleteProfilePrompt />` above results if authenticated seeker AND `scores` is empty AND `isLoading` is false (indicates no profile or no consent).
    - **Important**: `CompleteProfilePrompt` visibility is determined by: `isSeeker && !matchLoading && Object.keys(scores).length === 0`. This avoids showing the prompt to employers, guests, or seekers whose scores are still loading.
  - [x] 8.2 Update `apps/portal/src/components/domain/job-search-page-content.test.tsx`:
    - Test: MatchPill shown on result cards when match scores loaded.
    - Test: CompleteProfilePrompt shown for seeker without consent/profile.
    - Test: No MatchPill or prompt for guest user.
    - Test: No MatchPill or prompt for employer.

- [x] Task 9: Integrate match scores into discovery page (AC: #5)
  - [x] 9.1 Update `apps/portal/src/components/domain/job-discovery-page-content.tsx`:
    - **Add `"use client"` directive at line 1** — file is currently a server component; hooks require client component.
    - Import `useMatchScores`. Extract `jobIds` from combined featured + recent arrays.
    - Pass `matchScore={scores[item.id] ?? null}` to each `JobResultCard`.
    - `enabled` = check session via `useSession()`.
  - [x] 9.2 Update `apps/portal/src/components/domain/job-discovery-page-content.test.tsx`:
    - Test: MatchPill shown on featured and recent cards when scores available.
    - Test: No MatchPill when not authenticated.

- [x] Task 10: Add i18n keys (AC: all)
  - [x] 10.1 Add new keys to `apps/portal/messages/en.json` under `Portal.match` namespace:
    - `strong`: `"Strong Match"`
    - `good`: `"Good Match"`
    - `fair`: `"Fair Match"`
    - `score`: `"{score}% match"`
    - `completeProfilePrompt`: `"Complete your profile to see how well you match"`
    - `completeProfileLink`: `"Complete Profile"`
    - `dismiss`: `"Dismiss"`
  - [x] 10.2 Add corresponding Igbo translations to `apps/portal/messages/ig.json` under `Portal.match`:
    - `strong`: `"Dakọtara Nke Ọma"`
    - `good`: `"Dakọtara Nke Ọma"`
    - `fair`: `"Dakọtara Nke Obere"`
    - `score`: `"{score}% dakọtara"`
    - `completeProfilePrompt`: `"Mejupụta profaịlụ gị ka ị hụ otu i si dakọta"`
    - `completeProfileLink`: `"Mejupụta Profaịlụ"`
    - `dismiss`: `"Kagbuo"`

## Dev Notes

### Architecture & Patterns

#### Match Computation Is Client-Triggered, Not Embedded in Search API

The search API (`GET /api/v1/jobs/search`) is **public** (guests can search) and cached in Redis with a 60s TTL. Embedding per-user match scores in search results would:
1. Break the shared cache (each user would need their own cache entry).
2. Couple the search endpoint to seeker profile data.
3. Slow down search for all users (even non-seekers and guests).

Instead, match scores are fetched via a **separate API endpoint** (`GET /api/v1/jobs/match-scores`) called client-side after search results load. This is a progressive enhancement — results render immediately, MatchPills appear after scores load. This pattern:
- Preserves search API cacheability.
- Keeps search fast for everyone.
- Makes match computation optional (only for authenticated seekers with consent).
- Allows independent scaling of match computation.

#### workModes vs employmentType (Orthogonal Concepts)

`workModes` (seeker preferences) = work flexibility: `["remote", "hybrid", "onsite"]`
`employmentType` (job posting) = contract type: `full_time`, `part_time`, `contract`, `internship`, `apprenticeship`

These are **orthogonal**. A "full_time remote" job and a "contract onsite" job are valid combinations. The placeholder heuristic uses a **loose compatibility mapping**:
- `remote` → compatible with all employment types (remote work can be any contract type).
- `onsite` / `hybrid` → compatible with all employment types.
- Empty `workModes` → 10 points (benefit of the doubt).
- The mapping is intentionally generous because Epic 7 replaces it with a proper scoring engine.

#### Forward-Compatibility Contract with Epic 7

The `MatchScoreResult` type in `@igbo/config` is the **contract**. Epic 7 will:
1. Replace `computeMatchScore()` internals with a proper scoring engine (possibly DB-backed).
2. Keep the same `MatchScoreResult` response shape.
3. Keep the same API endpoint (`GET /api/v1/jobs/match-scores`).
4. The `MatchPill` component and `useMatchScores` hook remain unchanged.

**Do NOT** add any fields to `MatchScoreResult` beyond what's specified. Do NOT store scores in the database. This is a stateless, on-demand computation.

#### Batch Query Pattern

`getJobPostingsForMatching()` uses `WHERE id IN (...)` with max 50 IDs. This is safe because:
- Search results page shows max ~20 results per page.
- Discovery page shows max ~12 cards (6 featured + 6 recent).
- The 50 limit is a safety cap, not an expected workload.

#### Session Check Pattern in Client Components

Both `JobSearchPageContent` and `JobDiscoveryPageContent` are client components. Use `useSession()` from `next-auth/react`:

```typescript
const { data: session } = useSession();
const isSeeker = session?.user?.activePortalRole === "JOB_SEEKER";
```

**Do NOT** call `auth()` (server-only) from client components. The session is already available via `SessionProvider` in the portal layout.

### Previous Story Intelligence (P-4.4)

- P-4.4 established the guest/authenticated divergence pattern: guest → no match features, authenticated seeker → match features. Follow same conditional rendering approach.
- P-4.4 used hydration-safe `useState` + `useEffect` for `sessionStorage` checks (GuestConversionBanner dismiss state). Use same pattern for CompleteProfilePrompt.
- P-4.4 added `useSession` mocking pattern in nav tests — reuse for search/discovery page tests.
- P-4.4 `callbackUrl` pattern is irrelevant to this story — no auth redirect changes.

### Test Patterns

- **Portal test rules**: `expect.extend(toHaveNoViolations)` + `expect(results).toHaveNoViolations()` — NO `@ts-ignore` in portal.
- **Mock `useSession`**: `vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { activePortalRole: "JOB_SEEKER" } }, status: "authenticated" }), SessionProvider: ({ children }: any) => children }))`.
- **Mock `fetch`** for `useMatchScores` tests: `global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ scores: {...} }) })`.
- **`useSession` mock must include `SessionProvider`** export to avoid "no export" errors.
- **Portal ESLint**: Do NOT add `// eslint-disable-next-line react-hooks/exhaustive-deps` — rule doesn't exist in portal config.
- **Radix pointer polyfills**: Not needed for this story (no Radix Select/DropdownMenu).
- **`@igbo/config` tests**: Run with `pnpm --filter @igbo/config test`.
- **Portal tests**: Run with `pnpm --filter @igbo/portal test`.
- **DB build requirement**: After adding `getJobPostingsForMatching` to `portal-job-search.ts`, run `pnpm --filter @igbo/db build` so portal resolves from dist.

### Integration Tests (SN-3 — Missing Middle)

- **Match scores API route**: Unit tested with mocked DB queries (standard withApiHandler pattern). No real DB integration test needed for placeholder heuristic.
- **End-to-end flow** (seeker searches → sees MatchPill): Would require running portal + DB. Covered by validation scenarios during manual testing. No automated integration test for this story.
- **Cross-package type export**: `pnpm --filter @igbo/config build` + `pnpm --filter @igbo/portal typecheck` verifies the shared type exports correctly. Run as part of standard CI.

### Project Structure Notes

- New files:
  - `packages/config/src/match.ts` — MatchScoreResult type, MATCH_TIERS, getMatchTier
  - `packages/config/src/match.test.ts` — tests
  - `apps/portal/src/services/match-scoring-service.ts` — computeMatchScore pure function
  - `apps/portal/src/services/match-scoring-service.test.ts` — tests
  - `apps/portal/src/components/domain/match-pill.tsx` — MatchPill component
  - `apps/portal/src/components/domain/match-pill.test.tsx` — tests
  - `apps/portal/src/components/domain/complete-profile-prompt.tsx` — CompleteProfilePrompt
  - `apps/portal/src/components/domain/complete-profile-prompt.test.tsx` — tests
  - `apps/portal/src/hooks/use-match-scores.ts` — useMatchScores hook
  - `apps/portal/src/hooks/use-match-scores.test.ts` — tests
  - `apps/portal/src/app/api/v1/jobs/match-scores/route.ts` — match scores API
  - `apps/portal/src/app/api/v1/jobs/match-scores/route.test.ts` — tests
- Modified files:
  - `packages/config/src/index.ts` — add match export
  - `packages/db/src/queries/portal-job-search.ts` — add getJobPostingsForMatching
  - `packages/db/src/queries/portal-job-search.test.ts` — add tests
  - `apps/portal/src/components/domain/job-result-card.tsx` — add matchScore prop
  - `apps/portal/src/components/domain/job-result-card.test.tsx` — add tests
  - `apps/portal/src/components/domain/job-search-page-content.tsx` — integrate useMatchScores + MatchPill + CompleteProfilePrompt
  - `apps/portal/src/components/domain/job-search-page-content.test.tsx` — add tests
  - `apps/portal/src/components/domain/job-discovery-page-content.tsx` — integrate useMatchScores + MatchPill
  - `apps/portal/src/components/domain/job-discovery-page-content.test.tsx` — add tests
  - `apps/portal/messages/en.json` — 7 new Portal.match.* keys
  - `apps/portal/messages/ig.json` — 7 new Portal.match.* keys

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5] — AC definitions
- [Source: packages/db/src/schema/portal-seeker-profiles.ts] — skills[], consentMatching fields
- [Source: packages/db/src/schema/portal-seeker-preferences.ts] — locations[], workModes[], desiredRoles[]
- [Source: packages/db/src/schema/portal-job-postings.ts] — requirements, location, employmentType fields
- [Source: packages/db/src/queries/portal-seeker-profiles.ts] — getSeekerProfileByUserId
- [Source: packages/db/src/queries/portal-seeker-preferences.ts] — getSeekerPreferencesByProfileId
- [Source: apps/portal/src/lib/validations/job-search.ts] — JobSearchResultItem type
- [Source: apps/portal/src/components/domain/job-result-card.tsx] — current card layout
- [Source: apps/portal/src/components/domain/job-search-page-content.tsx] — search page container
- [Source: apps/portal/src/components/domain/job-discovery-page-content.tsx] — discovery page container
- [Source: apps/portal/src/services/job-search-service.ts] — searchJobs service (Redis cache-aside)
- [Source: apps/portal/src/hooks/use-job-search.ts] — search hook
- [Source: apps/portal/src/app/api/v1/jobs/search/route.ts] — search API endpoint
- [Source: apps/portal/src/components/ui/badge.tsx] — Badge component variants
- [Source: packages/config/src/index.ts] — @igbo/config exports
- [Source: _bmad-output/implementation-artifacts/p-4-4-guest-browsing-conversion-flow.md] — previous story

## Definition of Done (SN-1)

- [ ] All acceptance criteria met
- [ ] All validation scenarios demonstrated with evidence
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing (SN-3)
- [ ] Flow owner has verified the complete end-to-end chain
- [ ] No pre-existing test regressions introduced
- [ ] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [ ] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory**
- [ ] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [ ] Dev Completion: all a11y patterns listed in Readiness (including focus management) have passing axe-core assertions
- [ ] Dev Completion: all component dependencies in Readiness are imported and rendering
- [ ] Dev Completion: all codebase references in Readiness verified at implementation time (no stale refs)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Validation Evidence

<!-- Attach or link evidence for each validation scenario before moving to review -->

### Debug Log References

### Senior Developer Review (AI) — 2026-04-17

**Outcome: Approved (all issues fixed)**

**Issues Found & Fixed (3 HIGH, 4 MEDIUM, 1 LOW noted):**

1. **HIGH-1 (fixed):** Igbo translations used `TODO(ig-translations):` placeholders for `completeProfilePrompt`, `completeProfileLink`, `dismiss` — replaced with real Igbo copy from story spec.
2. **HIGH-2 (fixed):** `Portal.match.score` i18n key was `"Match score: {score}%"` instead of spec's `"{score}% match"` — corrected in en.json. Igbo updated to `"{score}% dakọtara"`.
3. **HIGH-3 (fixed):** Leftover debug file `apps/portal/minimal-match-test.test.ts` at portal root — deleted (was a duplicate subset of use-match-scores.test.ts).
4. **MEDIUM-1 (fixed):** Story File List section was empty — populated with all 12 new + 12 modified files.
5. **MEDIUM-2 (fixed):** `computeEmploymentTypeScore` ignores `jobEmploymentType` entirely — added comprehensive JSDoc explaining the intentional placeholder behavior and why AC #2's mapping is deferred to Epic 7.
6. **MEDIUM-3 (fixed):** `useMatchScores` ran effect body (including JSON.stringify) on every render due to unstable `jobIds` reference — refactored to use `useMemo` for stable `jobIdsKey`, effect now depends on `jobIdsKey` instead of `jobIds`.
7. **MEDIUM-4 (fixed):** `getJobPostingsForMatching` SQL query was missing `AND archived_at IS NULL` — added to match all other queries in the file. Test updated to verify the guard.

**LOW-1 (noted, not fixed):** Discovery page test only verifies MatchPill on featured card, not on recent card specifically.

**Test Results Post-Fix:**
- @igbo/config: 77/77 ✅
- @igbo/db: 1158/1158 ✅
- @igbo/portal: 2909/2909 ✅ (3 fewer than pre-review due to deleted debug file)

### Completion Notes List

### File List

**New files:**
- `packages/config/src/match.ts` — MatchScoreResult type, MATCH_TIERS, getMatchTier
- `packages/config/src/match.test.ts` — tests for match config
- `apps/portal/src/services/match-scoring-service.ts` — computeMatchScore pure function
- `apps/portal/src/services/match-scoring-service.test.ts` — tests for match scoring service
- `apps/portal/src/components/domain/match-pill.tsx` — MatchPill component
- `apps/portal/src/components/domain/match-pill.test.tsx` — tests for MatchPill
- `apps/portal/src/components/domain/complete-profile-prompt.tsx` — CompleteProfilePrompt component
- `apps/portal/src/components/domain/complete-profile-prompt.test.tsx` — tests for CompleteProfilePrompt
- `apps/portal/src/hooks/use-match-scores.ts` — useMatchScores hook
- `apps/portal/src/hooks/use-match-scores.test.ts` — tests for useMatchScores
- `apps/portal/src/app/api/v1/jobs/match-scores/route.ts` — match scores API endpoint
- `apps/portal/src/app/api/v1/jobs/match-scores/route.test.ts` — tests for match scores route

**Modified files:**
- `packages/config/src/index.ts` — added match.js re-export
- `packages/config/package.json` — added ./match export entry + build entry
- `packages/db/src/queries/portal-job-search.ts` — added getJobPostingsForMatching batch query
- `packages/db/src/queries/portal-job-search.test.ts` — added tests for getJobPostingsForMatching
- `apps/portal/src/components/domain/job-result-card.tsx` — added matchScore prop + MatchPill rendering
- `apps/portal/src/components/domain/job-result-card.test.tsx` — added matchScore prop tests
- `apps/portal/src/components/domain/job-search-page-content.tsx` — integrated useMatchScores + MatchPill + CompleteProfilePrompt
- `apps/portal/src/components/domain/job-search-page-content.test.tsx` — added match score integration tests
- `apps/portal/src/components/domain/job-discovery-page-content.tsx` — added "use client", integrated useMatchScores + MatchPill
- `apps/portal/src/components/domain/job-discovery-page-content.test.tsx` — added match score tests
- `apps/portal/messages/en.json` — added 7 Portal.match.* i18n keys
- `apps/portal/messages/ig.json` — added 7 Portal.match.* i18n keys
