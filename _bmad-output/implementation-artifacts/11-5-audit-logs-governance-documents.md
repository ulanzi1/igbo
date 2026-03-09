# Story 11.5: Audit Logs & Governance Documents

Status: done

**Story Key:** 11-5-audit-logs-governance-documents
**Epic:** 11 — Administration & Moderation
**Primary outcome:** Deliver a searchable audit log UI plus bilingual governance document repository so every administrative action is traceable, governance materials stay versioned, and members always read the latest English/Igbo policies from a single source of truth.

## Story

As an admin,
I want a searchable, filterable audit log and a bilingual governance document manager,
so that accountability is transparent and policy documents remain officially versioned, translated, and downloadable.

## Acceptance Criteria

1. Given an admin navigates to `/admin/audit-log`, when the view loads, then the chronological table shows timestamp, actor name, action type, target type + ID, outcome, and trace ID; the table supports filters (action, actor, target type, date-range) plus pagination, captures 100% of admin events, and never exposes PII.
2. Given an admin manages governance documents, when they upload or edit a document, then the system stores title, English content, Igbo content, version (integer, auto-incremented on publish), status (draft/published), published metadata, and generates an audit log entry for every publish so all policies are bilingual and reviewable before publishing.
3. Given a member visits the governance documents catalog, when the list renders, then each entry surfaces the title, last updated date, available languages, and download link (HTML export), the body is read-only, and the same content is available in English and Igbo depending on the member's locale preference.
4. Given the database needs audit + governance support, when migrations run, then the existing `audit_logs` table is ALTERed to add `target_type` (VARCHAR 50) and `trace_id` (VARCHAR 64) columns, and a new `platform_governance_documents` table exists with columns described below.
5. Given the About Us page and GDPR breach notification runbook already existed in code, when this story finishes, then both pieces are seeded into `platform_governance_documents` as published entries, the About Us page renders from the governance service instead of hardcoded i18n, and the GDPR runbook lives as an admin-only governance document.

## Existing Code Context

### `audit_logs` table ALREADY EXISTS (migration 0003)

Schema at `src/db/schema/audit-logs.ts`:

```
pgTable("audit_logs", {
  id: uuid PK defaultRandom,
  actorId: uuid NOT NULL FK → auth_users.id,
  action: varchar(100) NOT NULL,
  targetUserId: uuid nullable,
  details: jsonb nullable,
  ipAddress: varchar(45) nullable,
  createdAt: timestamp(tz) NOT NULL defaultNow
})
```

Imported in `src/db/index.ts` as `import * as auditLogsSchema from "./schema/audit-logs"`.

### `audit-logger.ts` service ALREADY EXISTS

At `src/services/audit-logger.ts`. Exports `logAdminAction(params)` which inserts directly into `auditLogs`. Already covers 17 action types:
`APPROVE_APPLICATION`, `REQUEST_INFO`, `REJECT_APPLICATION`, `UNDO_ACTION`, `RESET_2FA`, `MEMBER_TIER_CHANGED`, `RECORDING_LOST`, `RECORDING_EXPIRED_CLEANUP`, `FLAG_CONTENT`, `UNFLAG_CONTENT`, `HIDE_CONTENT`, `UNHIDE_CONTENT`, `WARN_MEMBER`, `SUSPEND_MEMBER`, `BAN_MEMBER`, `LIFT_SUSPENSION`, `VIEW_DISPUTE_CONVERSATION`.

All calls are direct (routes/services call `logAdminAction()`) — there are NO EventBus subscriptions. **Keep direct calls.** Do NOT add EventBus subscriptions — it would risk double-logging or missing calls. Instead, audit any admin actions not yet calling `logAdminAction()` and add calls where missing.

### New action types to add to `AdminAction` union

Audit coverage gaps — these admin actions likely exist but are NOT yet audited:

- `BADGE_ASSIGNED` / `BADGE_REVOKED` — badge management
- `SETTINGS_UPDATED` — platform settings changes
- `GOVERNANCE_PUBLISHED` / `GOVERNANCE_UPDATED` — governance document lifecycle
- `ARTICLE_REJECTED` / `ARTICLE_REVISION_REQUESTED` — article moderation

### About Us page location

`src/app/[locale]/(guest)/about/page.tsx` — uses `useTranslations("About")` with keys in `messages/en.json` and `messages/ig.json` under the `About` namespace. Migration requires:

1. Seed governance doc with content from both `About` namespaces
2. Rewrite page to fetch from governance service (with ISR or cache)
3. Remove `About` namespace from both message files
4. Fallback: if governance doc not found, render a "content unavailable" message

### GDPR breach runbook location

`docs/gdpr-breach-runbook.md` — already has a note saying "This runbook will be migrated to the governance document repository in Story 11.5." Seed as an admin-only governance document (add `visibility` column or filter by convention).

## Tasks / Subtasks

- [x] Task 1: Extend audit_logs schema + queries
  - [x] Write migration `0046_audit_logs_extend.sql`: ALTER `audit_logs` ADD COLUMN `target_type` VARCHAR(50), ADD COLUMN `trace_id` VARCHAR(64). Add journal entry (idx:46) to `_journal.json`.
  - [x] Update `src/db/schema/audit-logs.ts` to add `targetType` and `traceId` columns to the Drizzle schema definition.
  - [x] Update `logAdminAction` params interface to accept optional `targetType`, `targetId` (rename from `targetUserId`), and `traceId`. Keep backward compatibility — existing callers pass `targetUserId` which maps to `targetId`.
  - [x] Add new action types to `AdminAction` union: `BADGE_ASSIGNED`, `BADGE_REVOKED`, `SETTINGS_UPDATED`, `GOVERNANCE_PUBLISHED`, `GOVERNANCE_UPDATED`, `ARTICLE_REJECTED`, `ARTICLE_REVISION_REQUESTED`.
  - [x] Create `src/db/queries/audit-logs.ts` with `listAuditLogs({ page, limit, filters: { action?, actorId?, targetType?, dateFrom?, dateTo? } })` returning paginated results with actor display name (JOIN `auth_users`).
  - [x] Write tests for query helpers (filter combinations, pagination, date range).
- [x] Task 2: Audit log API + admin UI
  - [x] Create `src/app/api/v1/admin/audit-log/route.ts` with `GET` handler: `withApiHandler()` + `requireAdminSession()`. Accept query params: `page`, `limit`, `action`, `actorId`, `targetType`, `dateFrom`, `dateTo`. Validate with Zod (import from `"zod/v4"`). Return `successResponse({ logs, pagination })`. Throw `ApiError` for invalid input.
  - [x] Create `src/app/[locale]/(admin)/admin/audit-log/page.tsx` — admin page consuming the API via TanStack Query (`useQuery`). Show filters (action type dropdown, actor search, target type dropdown, date range pickers), paginated table with columns: Timestamp, Admin, Action, Target Type, Target ID, Details (truncated), Trace ID. Use `useTranslations("Admin.auditLog")`. Follow admin shell patterns from moderation pages.
  - [x] Write tests: API route tests (auth, validation, success), component tests (filters render, pagination, translation keys).
- [x] Task 3: Governance document repository
  - [x] Write migration `0047_governance_documents.sql`: CREATE TABLE `platform_governance_documents` (...). Add journal entry (idx:47).
  - [x] Create `src/db/schema/platform-governance-documents.ts` with Drizzle schema. Add import to `src/db/index.ts` as `import * as governanceDocumentsSchema`.
  - [x] Create `src/db/queries/governance-documents.ts` with: `listPublishedDocuments(visibility?)`, `getDocumentBySlug(slug)`, `getDocumentById(id)`, `createDocument(data)`, `updateDocument(id, data)`, `publishDocument(id, publishedBy)` (increments version, sets status=published, published_at, published_by).
  - [x] Create `src/services/governance-document-service.ts` wrapping queries + calling `logAdminAction()` with `GOVERNANCE_PUBLISHED` / `GOVERNANCE_UPDATED` on mutations.
  - [x] Create admin API routes under `src/app/api/v1/admin/governance-documents/route.ts` (GET list + POST create) and `src/app/api/v1/admin/governance-documents/[documentId]/route.ts` (GET, PATCH, POST publish). All wrapped with `withApiHandler()` + `requireAdminSession()`.
  - [x] Create admin governance UI at `src/app/[locale]/(admin)/admin/governance/page.tsx`. List documents with status badges, create/edit form with title + English content + Igbo content (textarea), publish button, version display.
  - [x] Create member-facing page `src/app/[locale]/(guest)/governance/page.tsx` listing published public documents. Show title, last updated, language toggle (EN/IG based on locale). Render content as sanitized HTML. Use `useTranslations("Governance")`.
  - [x] For download: generate server-side HTML export endpoint `GET /api/v1/governance-documents/[slug]/download` returning `Content-Type: text/html`.
  - [x] Add all i18n keys under `Admin.governance.*` and `Governance.*` namespaces in both `messages/en.json` and `messages/ig.json`.
  - [x] Write tests: query tests, service tests, API route tests (auth, validation, CRUD), component tests (admin form, member list, language toggle).
- [x] Task 4: Migrate existing content
  - [x] Write a seed migration `0048_seed_governance_documents.sql` that INSERTs About Us (slug: `about-us`, published, public) and GDPR Breach Runbook (slug: `gdpr-breach-runbook`, published, admin_only).
  - [x] Update `src/app/[locale]/(guest)/about/page.tsx` to fetch the `about-us` governance document from the service instead of using `useTranslations("About")`. ISR `revalidate = 60`. Fallback if not found. Remove `About` namespace from both message files.
  - [x] Write regression tests: About Us page renders from governance service, handles missing document gracefully, GDPR runbook is admin-only.

## Pre-Review Checklist

- [x] Audit log API wrapped with `withApiHandler()` + `requireAdminSession()`, returns RFC 7807 errors.
- [x] Existing `audit_logs` table extended with `target_type` + `trace_id` columns (migration 0046). No new `platform_audit_logs` table created.
- [x] `logAdminAction` updated to accept `targetType`/`traceId`. Existing callers still work.
- [x] Governance documents editors require English content before publishing (Igbo optional but encouraged), persist version metadata.
- [x] Member-facing governance list uses `useTranslations()`, shows title/last-updated/language + download link.
- [x] About Us page fetches from governance service. `About` i18n namespace removed.
- [x] GDPR runbook seeded as admin-only governance document.
- [x] All new UI strings in `messages/en.json` + `messages/ig.json`. TanStack Query for data fetching (no `useEffect`+`fetch`).
- [x] Co-located tests for queries, services, routes, and components.

## Dev Notes

### Critical Project Patterns

- **Migrations**: Hand-write SQL — `drizzle-kit generate` fails with `server-only` error. After writing SQL file, MUST add journal entry to `src/db/migrations/meta/_journal.json`.
- **Zod**: Import from `"zod/v4"`. Validation errors: `throw new ApiError(...)` (NOT `return errorResponse(string, 400)`).
- **Admin routes**: `requireAdminSession()` from `@/lib/admin-auth.ts`.
- **API wrapping**: `withApiHandler()` from `@/server/api/middleware`.
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`.
- **DB schema imports**: No `src/db/schema/index.ts` — import directly in `src/db/index.ts` with `import * as xSchema`.
- **Tests**: Co-located with source. `@vitest-environment node` pragma for server files.
- **i18n**: All user-facing strings via `useTranslations()`. No hardcoded strings.
- **`successResponse` status**: `successResponse(data, meta?, status)` — status is 3rd arg. Use `successResponse({ x }, undefined, 201)` for 201.
- **`db.execute()` mock format**: Returns raw array, NOT `{ rows: [...] }`.

### Project Structure

- Audit log API: `src/app/api/v1/admin/audit-log/route.ts`
- Audit log page: `src/app/[locale]/(admin)/admin/audit-log/page.tsx`
- Governance admin: `src/app/[locale]/(admin)/admin/governance/page.tsx`
- Governance member page: `src/app/[locale]/(guest)/governance/page.tsx`
- Governance download API: `src/app/api/v1/governance-documents/[slug]/download/route.ts`
- Schema: `src/db/schema/audit-logs.ts` (extend), `src/db/schema/platform-governance-documents.ts` (new)
- Queries: `src/db/queries/audit-logs.ts` (new), `src/db/queries/governance-documents.ts` (new)
- Service: `src/services/audit-logger.ts` (extend), `src/services/governance-document-service.ts` (new)

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` (Story 11.5)
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- About Us origin: Story 1.4
- GDPR runbook origin: Story 1.13, file at `docs/gdpr-breach-runbook.md`

## File List

- `src/db/schema/audit-logs.ts` (extend with targetType + traceId)
- `src/db/schema/platform-governance-documents.ts` (new)
- `src/db/migrations/0046_audit_logs_extend.sql` (ALTER TABLE)
- `src/db/migrations/0047_governance_documents.sql` (CREATE TABLE)
- `src/db/migrations/0048_seed_governance_documents.sql` (INSERT seed data)
- `src/db/migrations/meta/_journal.json` (idx 46, 47, 48 added)
- `src/db/index.ts` (add governanceDocumentsSchema)
- `src/db/queries/audit-logs.ts` (new — paginated filtered reads)
- `src/db/queries/audit-logs.test.ts` (new — 8 tests)
- `src/db/queries/governance-documents.ts` (new — CRUD)
- `src/db/queries/governance-documents.test.ts` (new — 10 tests)
- `src/services/audit-logger.ts` (extend — new action types, targetType/traceId params)
- `src/services/audit-logger.test.ts` (update — add targetType/traceId to expectations)
- `src/services/governance-document-service.ts` (new)
- `src/services/governance-document-service.test.ts` (new — 6 tests)
- `src/app/api/v1/admin/audit-log/route.ts` (new)
- `src/app/api/v1/admin/audit-log/route.test.ts` (new — 8 tests)
- `src/app/api/v1/admin/governance-documents/route.ts` (new)
- `src/app/api/v1/admin/governance-documents/route.test.ts` (new — 5 tests)
- `src/app/api/v1/admin/governance-documents/[documentId]/route.ts` (new)
- `src/app/api/v1/admin/governance-documents/[documentId]/route.test.ts` (new — 7 tests)
- `src/app/api/v1/governance-documents/[slug]/download/route.ts` (new)
- `src/app/[locale]/(admin)/admin/audit-log/page.tsx` (new)
- `src/app/[locale]/(admin)/admin/governance/page.tsx` (new)
- `src/app/[locale]/(guest)/governance/page.tsx` (new)
- `src/app/[locale]/(guest)/about/page.tsx` (modify — fetch from governance service, ISR)
- `src/app/[locale]/(guest)/about/page.test.tsx` (rewrite — 6 tests for governance service)
- `src/features/admin/components/AuditLogTable.tsx` (new)
- `src/features/admin/components/AuditLogTable.test.tsx` (new — 7 tests)
- `src/features/admin/components/GovernanceManager.tsx` (new)
- `src/features/admin/components/GovernanceManager.test.tsx` (new — 6 tests)
- `messages/en.json` (add Admin.auditLog + Admin.governance + Governance keys; remove About namespace)
- `messages/ig.json` (same)

## Dev Agent Record

### Implementation Plan

1. Task 1: Extended audit_logs schema with `targetType`/`traceId` columns (migration 0046). Updated `logAdminAction` to accept both `targetUserId` (legacy) and `targetId` (new generic). Added 7 new action types. Created paginated `listAuditLogs` query with JOIN to auth_users for actor name.

2. Task 2: Admin audit log GET route with Zod validation for all filter params. `AuditLogTable` client component with action/targetType dropdowns, date range pickers, paginated table, prev/next buttons.

3. Task 3: Migration 0047 creates `platform_governance_documents`. Full CRUD query layer with `publishDocument` incrementing version via SQL expression. Governance service wraps queries + logs `GOVERNANCE_PUBLISHED`/`GOVERNANCE_UPDATED`. Admin API routes (GET/POST list, GET/PATCH/POST[publish] document). Admin `GovernanceManager` component with create/edit form and publish button. Member-facing `/governance` page with locale-aware content rendering and HTML download endpoint.

4. Task 4: Migration 0048 seeds About Us (public) and GDPR Breach Runbook (admin_only). About Us page rewritten to ISR + governance service fetch, falls back to "content unavailable" if doc missing. `About` i18n namespace removed from both message files. Added `Governance.contentUnavailable` and `Governance.applyButton` keys.

### Completion Notes

- All 4 tasks complete. 65 new/updated tests; all pass.
- Total test suite: 4030 passing + 10 skipped + 19 pre-existing failures (unchanged).
- backward-compatible: `logAdminAction` resolves `targetId ?? targetUserId` → `targetUserId` DB column — existing callers unaffected.
- `publishDocument` increments version using `sql\`${platformGovernanceDocuments.version} + 1\`` — atomic DB-side increment.
- Download route uses `parts.at(-2)` to extract slug from `.../[slug]/download` URL path.

## Change Log

- 2026-03-09: Story 11.5 implemented. Migrations 0046–0048, audit log query/API/UI, governance document CRUD service/API/admin UI, member governance page, HTML download endpoint, About Us page migrated from i18n to governance service, GDPR runbook seeded as admin-only doc.
- 2026-03-09: **Code review fixes** (7 issues resolved):
  - H1: Added `sanitizeHtml()` to governance page, about page, and download route — XSS via `dangerouslySetInnerHTML` without sanitization. Also escaped `doc.title` in download HTML template.
  - H2: `createGovernanceDocument` now logs `GOVERNANCE_CREATED` audit entry. Added `GOVERNANCE_CREATED` to `AdminAction` union and `AuditLogTable` action types.
  - H3: Governance page download link now passes `?locale=${locale}` so Igbo users get the correct language.
  - M1: `publishDocument` only increments version on re-publish (already published). First publish keeps version 1.
  - M2: Removed `ipAddress` from `listAuditLogs` query response and `AuditLogTable` interface — GDPR compliance.
  - M3: Added `import "server-only"` to `src/db/queries/audit-logs.ts` and `src/db/queries/governance-documents.ts`.
  - L1: Fixed `_journal.json` formatting (comma placement).
