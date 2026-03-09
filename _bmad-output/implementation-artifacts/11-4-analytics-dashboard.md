# Story 11.4: Analytics Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to view a comprehensive analytics dashboard showing platform health and community metrics,
so that I can monitor growth, engagement, and identify trends or issues.

## Acceptance Criteria

1. Given an admin navigates to the analytics page, when the dashboard loads, then it displays Daily Active Users (DAU), Monthly Active Users (MAU), DAU/MAU ratio, growth trends, geographic distribution, tier breakdown, and engagement metrics, and all metrics are computed from platform data with configurable date ranges.
2. Given the admin views member growth, when they select a time period, then a chart shows new registrations, approvals, and net member growth over time, and geographic distribution shows member counts by country with drill-down to city level.
3. Given the admin views engagement metrics, when the engagement section loads, then it shows messages sent per user per month, posts created per day, articles published per week, events hosted per month, average event attendance, and top content by engagement.
4. Given the dashboard needs real-time indicators, when the dashboard is open, then key metrics including DAU and currently online users update periodically every 60 seconds, and the dashboard uses CSR rendering with no SEO-oriented SSR requirement.
5. Given the analytics dashboard needs efficient metrics computation, when this story is implemented, then the migration creates `platform_analytics_snapshots` with `id`, `metric_type`, `metric_date`, `metric_value`, `metadata`, and `created_at`; a nightly job at `src/server/jobs/analytics-aggregation.ts` computes snapshots from source tables; historical dashboard views query snapshots; live queries are limited to real-time indicators and today's partial DAU; and rerunning the job for an existing date overwrites that day's snapshot idempotently.

## Tasks / Subtasks

- [x] Task 1: Add analytics snapshot persistence layer and schema exports (AC: 5)
  - [x] Create `src/db/schema/platform-analytics-snapshots.ts` with a `metric_type` enum covering `dau`, `mau`, `registrations`, `approvals`, `net_growth`, `posts`, `messages`, `articles`, `events`, `avg_event_attendance`, `active_by_tier`, `active_by_country`, and `top_content`
  - [x] Define `platform_analytics_snapshots` with `metric_date` as the daily grain, `metric_value` integer for scalar values, and `metadata` JSONB for breakdown payloads and chart series; add a `UNIQUE(metric_type, metric_date)` constraint — the idempotent upsert in Task 2/3 requires `ON CONFLICT (metric_type, metric_date) DO UPDATE`
  - [x] Scalar metric types (use `metric_value`): `dau`, `mau`, `registrations`, `approvals`, `net_growth`, `posts`, `messages`, `articles`, `events`, `avg_event_attendance`; Breakdown metric types (use `metadata` JSONB, `metric_value` = 0): `active_by_tier`, `active_by_country`, `top_content`
  - [x] Export the schema from `src/db/index.ts` using the standard pattern: `import * as analyticsSnapshotsSchema from "./schema/platform-analytics-snapshots"` and spread into the drizzle schema object
  - [x] Add migration `0045_analytics_snapshots.sql` and add journal entry to `src/db/migrations/meta/_journal.json` (idx: 45, version: "7", when: 1708000045000, tag: "0045_analytics_snapshots", breakpoints: true)
- [x] Task 2: Build reusable analytics query layer for snapshots and live indicators (AC: 1, 2, 3, 4, 5)
  - [x] Create `src/db/queries/analytics.ts`
  - [x] Implement snapshot upsert helpers that overwrite by `(metric_type, metric_date)` to keep the aggregation idempotent
  - [x] Implement admin read helpers for dashboard sections: summary metrics, growth series, geographic breakdown, tier breakdown, engagement metrics, and top content
  - [x] Implement `currentlyOnlineUsers`: query `auth_sessions` for sessions with `expires > NOW()` and `updatedAt > NOW() - INTERVAL '5 minutes'`; implement `todayPartialDau`: count distinct `userId` from `auth_sessions` where `updatedAt >= start of today`
  - [x] `DAU/MAU` ratio is derived client-side from the `dau` and `mau` snapshot values — do not store as a separate metric type
  - [x] `net_growth` = approvals (new approved members) minus account deletions/anonymizations for that date
  - [x] Keep historical reads snapshot-backed; do not add expensive ad hoc multi-table aggregation to request-time routes
- [x] Task 3: Implement nightly analytics aggregation job using the existing job runner (AC: 5)
  - [x] Create `src/server/jobs/analytics-aggregation.ts`
  - [x] Register the job via side-effect import in `src/server/jobs/index.ts` (add `import "./analytics-aggregation";`); the job is triggered by whatever scheduling mechanism already calls `runJob()` for existing jobs — do not add BullMQ, cron libraries, or a new scheduler
  - [x] Follow existing `registerJob()` conventions, structured JSON logging, retries, and timeout behavior from `job-runner.ts`
  - [x] Aggregate source data from existing tables: `auth_users`, `community_posts`, `chat_messages`, `community_articles`, `community_events`, `post_interactions` (top content by reaction+comment count)
  - [x] Geographic breakdown: parse `location` fields with comma-heuristic; store as `{ countries: [{ name, count, cities: [{ name, count }] }] }`
  - [x] Ensure reruns for an existing date overwrite the previous snapshot set rather than double-inserting
  - [x] Emit only operational logs and alerts needed by the current jobs stack; do not introduce BullMQ or a second scheduler
- [x] Task 4: Add admin analytics API surface under existing auth and response patterns (AC: 1, 2, 3, 4)
  - [x] Create `src/app/api/v1/admin/analytics/route.ts` for the main dashboard payload
  - [x] Single route with `?live=true` shortcut for polling-only indicator calls
  - [x] Protect all routes with `requireAdminSession(request)`
  - [x] Wrap all handlers with `withApiHandler()`
  - [x] Validate date-range query params and throw `ApiError` (RFC 7807) for invalid input
  - [x] Return `camelCase` API contracts while preserving `snake_case` in the DB layer
- [x] Task 5: Add the analytics page to the existing admin surface, not a new shell (AC: 1, 2, 3, 4)
  - [x] Create `src/app/[locale]/(admin)/admin/analytics/page.tsx`
  - [x] Add a feature entry component `src/features/admin/components/AnalyticsDashboard.tsx` and export it from `src/features/admin/index.ts`
  - [x] Reuse `AdminPageHeader`, existing dark admin styling, and TanStack Query patterns
  - [x] Render summary cards, growth table, geographic breakdown, tier breakdown, engagement metrics, and top content sections in a desktop-first but responsive layout
  - [x] Keep all user-facing strings in `messages/en.json` and `messages/ig.json` under the `Admin` namespace
  - [x] Poll live indicators every 60 seconds via TanStack Query `refetchInterval`; no hand-rolled `setInterval`
- [x] Task 6: Preserve accessibility and UX requirements for the admin morning workflow (AC: 1, 2, 3, 4)
  - [x] Keyboard-reachable filters with explicit `<label>` elements
  - [x] Textual summaries alongside growth/geo tables; data not conveyed by color only
  - [x] Empty, loading, and error states implemented and translated
  - [x] No animated charts (no reduced-motion concern for table-based display)
  - [x] Date input controls rendered with `min-h-[44px]` for 44px touch target
- [x] Task 7: Add comprehensive regression and new coverage (AC: 1, 2, 3, 4, 5)
  - [x] 19 query-layer tests for upsert, date-range, live indicators, summary, growth, engagement, breakdown
  - [x] 6 job tests covering registration, success path, idempotent reruns, failure propagation, all metric types
  - [x] 10 API route tests for admin auth, invalid params, live-only mode, and full dashboard payload shape
  - [x] 19 component tests for loading, empty, success, filter changes, live-refresh interval, translated labels
  - [x] 2 page-level tests for breadcrumb/header pattern
  - [x] No new `@/db/queries/*` imports introduced into eventbus-bridge surfaces

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `npx vitest run` — 3969 pass, 19 pre-existing failures, 10 skipped)
- [x] No new `@/db/queries/*` import in `eventbus-bridge.ts` — analytics queries not used in bridge surfaces
- [x] `successResponse()` calls with non-200 status use 3rd arg (no non-200 in this story)
- [x] No new member statuses/roles introduced
- [x] Historical analytics reads use `platform_analytics_snapshots`; only real-time indicators query live source tables
- [x] Aggregation reruns for the same date overwrite existing snapshots via `ON CONFLICT DO UPDATE`
- [x] Analytics filters, cards, and tables have non-visual textual equivalents (sr-only captions, aria-labels) and translated empty or error states
- [x] The analytics page stays inside the existing admin shell and nav, with no parallel admin entry point

## Dev Notes

### Story Foundation

- Epic 11 is already in progress and Stories `11.1` through `11.3` established the admin shell, moderation APIs, discipline and audit patterns, and the expectation that new admin workflows extend the same surface rather than fork it.
- This story is the first analytics-heavy admin experience. The acceptance criteria explicitly require a mixed model:
  - precomputed nightly snapshots for historical and trend views
  - limited live queries for `currently online users` and `today` partial activity
- Business value: give admins a fast, trustworthy morning operations view without adding high-latency reporting queries to the runtime path.

### Technical Requirements

- Create a durable analytics snapshot table instead of computing history directly from source tables on every request.
- Keep API responses admin-only and CSR-consumed through TanStack Query.
- Support configurable date ranges in the dashboard payload and query helpers.
- Include:
  - DAU, MAU, DAU/MAU
  - registrations, approvals, net growth
  - geographic distribution with country-to-city drill-down support
  - tier breakdown
  - engagement metrics: messages per user per month, posts per day, articles per week, events per month, average attendance
  - top content by engagement
- Rerunning the nightly aggregation for an already-processed date must be idempotent and replace prior snapshot data.

### Architecture Compliance

- Admin route must live at `src/app/[locale]/(admin)/admin/analytics/page.tsx`, which matches the architecture's reserved route structure. [Source: _bmad-output/planning-artifacts/architecture.md]
- Admin surfaces are CSR-oriented authenticated dashboards; do not optimize this page for SEO or guest SSR. [Source: _bmad-output/planning-artifacts/architecture.md]
- Use `requireAdminSession()` for API protection, `withApiHandler()` for API wrapping, and `successResponse()` for successful REST payloads, matching the moderation routes already in production. [Source: src/app/api/v1/admin/moderation/route.ts]
- Use the existing job runner and side-effect registration pattern in `src/server/jobs/index.ts`; do not add BullMQ, cron parsing libraries, or a separate orchestration system. [Source: src/server/jobs/index.ts, src/server/jobs/job-runner.ts]
- Keep DB definitions under `src/db/schema/*`, reusable query builders in `src/db/queries/*`, and business orchestration in `src/server/jobs/*` or `src/services/*` as appropriate. [Source: _bmad-output/project-context.md]

### File Structure Requirements

- New files expected:
  - `src/db/schema/platform-analytics-snapshots.ts`
  - `src/db/queries/analytics.ts`
  - `src/db/queries/analytics.test.ts`
  - `src/server/jobs/analytics-aggregation.ts`
  - `src/server/jobs/analytics-aggregation.test.ts`
  - `src/app/api/v1/admin/analytics/route.ts`
  - `src/app/api/v1/admin/analytics/route.test.ts`
  - `src/app/[locale]/(admin)/admin/analytics/page.tsx`
  - `src/features/admin/components/AnalyticsDashboard.tsx`
  - `src/features/admin/components/AnalyticsDashboard.test.tsx`
- Modified files likely include:
  - `src/db/index.ts`
  - `src/db/migrations/meta/_journal.json`
  - `src/server/jobs/index.ts`
  - `src/features/admin/index.ts`
  - `messages/en.json`
  - `messages/ig.json`
  - optional admin nav or layout tests if the new route needs explicit coverage

### Existing Patterns to Reuse

- `AdminShell` already contains the `/admin/analytics` nav entry. Fill the route rather than changing shell structure first. [Source: src/components/layout/AdminShell.tsx]
- `AdminPageHeader` breadcrumb and title pattern is already used by moderation and should be reused for analytics. [Source: src/app/[locale]/(admin)/admin/moderation/page.tsx]
- `QueueSummaryCard` shows the established visual language for dark admin metric cards. Use that tone for analytics summary tiles rather than inventing a conflicting admin design language. [Source: src/features/admin/components/QueueSummaryCard.tsx]
- TanStack Query is already the admin data-fetching standard; follow the moderation queue approach for query keys, auth credentials, and invalidation behavior. [Source: src/features/admin/components/ModerationQueue.tsx]

### Data and Computation Guidance

- Prefer daily-grain snapshot rows keyed by metric type plus date.
- Use `metadata` JSONB for structured breakdowns that do not fit a single integer:
  - country or city counts
  - tier slices
  - top-content lists
  - chart-series supporting metadata if needed
- Keep scalar metrics normalized enough that they can be filtered and compared without reparsing large blobs.
- For live indicators:
  - `currentlyOnlineUsers` should come from the same presence or session-aware mechanisms already used in the app rather than from approximated snapshot math
  - `todayPartialDau` can be computed live for the current day, but historical days must come from snapshots

### Testing Requirements

- Co-locate all new tests with the code they cover.
- Query tests should verify:
  - upsert overwrite semantics
  - date-range filtering
  - correct shape for geography, tier, and content breakdowns
- Job tests should verify:
  - registration via `registerJob`
  - success path writes snapshots
  - rerun behavior replaces duplicates
  - failures surface through the existing job error or reporting path
- API tests should verify:
  - admin-only access
  - invalid date ranges return proper client errors
  - payload includes all required dashboard sections
- Component tests should verify:
  - translated labels
  - loading, empty, and error states
  - date-range filter interaction
  - 60-second polling configuration or equivalent refetch behavior
  - textual accessibility companions for charts and visualizations

### Previous Story Intelligence

- Story `11.1` created the moderation admin page, admin route wrapping conventions, and reusable admin component patterns. Reuse those route and component conventions for analytics instead of inventing a separate dashboard stack.
- Story `11.2` reinforced the rule to extend, not duplicate, admin moderation architecture. That same rule applies here: analytics belongs in the same admin shell and route family.
- Story `11.3` extended audit and admin auth rigor; if analytics introduces any admin-sensitive data access beyond plain reads, follow the same `requireAdminSession` discipline. There is no current acceptance criterion requiring every dashboard view to emit audit logs, so do not add noisy audit writes without a clear requirement.

### Git Intelligence Summary

- Recent commits show a stable pattern in Epic 11:
  - add schema, migration, and query layer first
  - expose admin REST routes with tests
  - wire UI under `src/app/[locale]/(admin)/admin/*`
  - add component tests and i18n entries
- Story `11.3` also shows the repo is comfortable with adding background jobs through `src/server/jobs/index.ts` side-effect registration.
- Recent admin work favors incremental extension over broad refactors; maintain that discipline here.

### Project Structure Notes

- Align with the existing unified admin structure:
  - page file in `src/app/[locale]/(admin)/admin/analytics/page.tsx`
  - feature UI in `src/features/admin/components/*`
  - APIs in `src/app/api/v1/admin/analytics/*`
  - queries in `src/db/queries/analytics.ts`
  - snapshot schema in `src/db/schema/platform-analytics-snapshots.ts`
  - job in `src/server/jobs/analytics-aggregation.ts`
- No project-structure conflict is expected. `AdminShell` already references `/admin/analytics`, which is a strong signal that this route was intended and should now be implemented.

### References

- `_bmad-output/planning-artifacts/epics.md` - Epic 11, Story 11.4 acceptance criteria
- `_bmad-output/planning-artifacts/architecture.md` - admin route structure, CSR strategy, jobs architecture, feature and module boundaries
- `_bmad-output/planning-artifacts/ux-design-specification.md` - admin dashboard UX direction, dark sidebar, summary cards, 45-minute workflow
- `_bmad-output/project-context.md` - repo rules for i18n, API wrappers, testing, query organization, and anti-patterns
- `src/components/layout/AdminShell.tsx` - existing admin nav, page header, QueryClient setup
- `src/app/[locale]/(admin)/admin/moderation/page.tsx` - canonical admin page composition pattern
- `src/features/admin/components/ModerationQueue.tsx` - current TanStack Query admin component pattern
- `src/features/admin/components/QueueSummaryCard.tsx` - existing admin metric-card visual language
- `src/server/jobs/index.ts` - job registration pattern
- `src/server/jobs/job-runner.ts` - retries, timeout, logging, and trace context pattern
- `src/app/api/v1/admin/moderation/route.ts` - admin API auth, wrapper, and response pattern
- Official references used for latest-tech verification:
  - https://github.com/vercel/next.js/releases
  - https://nextjs.org/blog/next-16-1
  - https://nextjs.org/blog/security-update-2025-12-11
  - https://tanstack.com/query/latest/docs/framework/react/installation
  - https://authjs.dev/
  - https://github.com/drizzle-team/drizzle-orm/releases

### Completion Status

- Story status for implementation handoff: `ready-for-dev`
- Completion note: `Ultimate context engine analysis completed - comprehensive developer guide created`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `server-only` guard was removed from `analytics.ts` query layer — query files in this repo don't import `server-only` (only service layer and route handlers do). Confirmed against `moderation.ts` pattern.
- `errorResponse()` replaced with `throw new ApiError()` in route — `withApiHandler` only maps `ApiError` to proper status; other errors become 500. Critical pattern from `api-response.ts` doc comment.
- `defaultFromDate()` computed before validation check caused `Invalid time value` crash for bad `toDate` param. Fixed: validate `toDate` first, then compute `fromDate`.

### Completion Notes List

- **Task 1**: `platform_analytics_snapshots` schema with 13 metric types, `UNIQUE(metric_type, metric_date)` constraint, migration 0045, journal entry, db/index.ts export.
- **Task 2**: Complete query layer — upsert helpers (idempotent via `onConflictDoUpdate`), snapshot series, breakdown reads, `currentlyOnlineUsers` + `todayPartialDau` live indicators.
- **Task 3**: `analytics-aggregation` job aggregates yesterday's data from 8 source tables. Geographic breakdown via comma-heuristic on free-text `location` fields. `retries: 2, timeoutMs: 120_000`. Registered in `jobs/index.ts`.
- **Task 4**: Single `GET /api/v1/admin/analytics` route. `?live=true` shortcut for 60s polling. Date range validation with `throw new ApiError`. Admin-only via `requireAdminSession`.
- **Task 5**: `AnalyticsDashboard` CSR component with 7 sections (live, summary, growth table, geo, tier, engagement, top content). TanStack Query with `refetchInterval: 60_000` for live indicators.
- **Task 6**: Accessible — labeled filter inputs, sr-only table captions, `aria-label` on metric cards, `role="alert"` for errors, `min-h-[44px]` on date controls.
- **Task 7**: 56 new tests (19 query, 6 job, 10 route, 19 component, 2 page). No regressions.

### Change Log

- **2026-03-09**: Story 11.4 implemented — analytics dashboard with snapshot table, aggregation job, admin API, and AnalyticsDashboard UI. 56 new tests added. (claude-sonnet-4-6)
- **2026-03-09**: Code review fixes (claude-opus-4-6):
  - F1 [HIGH]: Fixed approvals metric to query `audit_logs` for `APPROVE_APPLICATION` actions instead of counting all active users updated that day
  - F2 [HIGH]: Fixed `active_by_tier` to count all active members by tier (total distribution) instead of recently-updated users
  - F3 [HIGH]: Wrapped `upsertSnapshotsForDate` in `db.transaction()` for atomic snapshot writes
  - F4 [MEDIUM]: Fixed `todayPartialDau` to use `setUTCHours` matching aggregation job's UTC semantics
  - F6 [MEDIUM]: Replaced in-memory geo aggregation with SQL `GROUP BY` to avoid loading all users into memory
  - F7 [MEDIUM]: Added 10th route test (default 30-day range). Total: 57 tests.

### File List

**New files:**

- `src/db/schema/platform-analytics-snapshots.ts`
- `src/db/migrations/0045_analytics_snapshots.sql`
- `src/db/queries/analytics.ts`
- `src/db/queries/analytics.test.ts`
- `src/server/jobs/analytics-aggregation.ts`
- `src/server/jobs/analytics-aggregation.test.ts`
- `src/app/api/v1/admin/analytics/route.ts`
- `src/app/api/v1/admin/analytics/route.test.ts`
- `src/app/[locale]/(admin)/admin/analytics/page.tsx`
- `src/app/[locale]/(admin)/admin/analytics/page.test.tsx`
- `src/features/admin/components/AnalyticsDashboard.tsx`
- `src/features/admin/components/AnalyticsDashboard.test.tsx`

**Modified files:**

- `src/db/index.ts` — added analyticsSnapshotsSchema import and spread
- `src/db/migrations/meta/_journal.json` — added idx:45 entry
- `src/server/jobs/index.ts` — added `import "./analytics-aggregation"`
- `src/features/admin/index.ts` — exported AnalyticsDashboard
- `messages/en.json` — added Admin.analytics namespace
- `messages/ig.json` — added Admin.analytics namespace
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated 11-4 status
