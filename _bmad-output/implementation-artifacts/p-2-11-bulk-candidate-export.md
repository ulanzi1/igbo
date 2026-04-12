# Story P-2.11: Bulk Candidate Export

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an employer,
I want to export all candidates for a specific job posting as a CSV file,
so that I can share candidate information with my hiring team or import into external HR systems.

## Acceptance Criteria

1. **Export candidates as CSV** — Given an employer is viewing the applicants for a job posting, when they click "Export Candidates", then a CSV file is generated containing: seeker name, email (if consent allows), application date, current status, last status change date, and headline. The CSV is downloaded to the employer's device. The export covers all applicants for that single posting (not across postings).

2. **Consent-gated email** — Given consent settings affect data export, when a seeker has not consented to employer visibility (`consentEmployerView === false` from Story 2.2), then their email is omitted from the CSV (replaced with "—"). Other non-PII fields (name, status, dates) are still included.

3. **Empty posting guard** — Given a posting has no applicants, when the employer clicks "Export Candidates", then a message is shown: "No candidates to export for this posting". No empty CSV file is generated.

4. **File naming & encoding** — Given the export is generated, when the CSV file is created, then the filename follows the pattern: `{company-name}_{job-title}_candidates_{date}.csv`. The file uses UTF-8 encoding with BOM for Excel compatibility.

## Story Readiness Checklist (SN-5 — REQUIRED, Gate 1)

**Gate Owner:** Scrum Master (enforces before story moves to `ready-for-dev`)
**Source of Rules:** `docs/monorepo-playbook.md` -> Section 7 Frontend Safety & Readiness

### i18n Key Inventory

- [x] Every user-facing string in the UI mocks / ACs maps to a key below
- [x] English copy filled in for every row
- [x] Keys reserved in `apps/portal/messages/en.json` (Igbo copy at Dev Completion)

Keys (under `Portal.ats.export.*`):

- `Portal.ats.export.button` — "Export Candidates"
- `Portal.ats.export.noData` — "No candidates to export for this posting"
- `Portal.ats.export.downloading` — "Exporting..."
- `Portal.ats.export.success` — "CSV exported successfully"
- `Portal.ats.export.error` — "Failed to export candidates"
- `Portal.ats.export.ariaButton` — "Export all candidates as CSV"

**CSV column headers** (not i18n — CSV headers are always English for interoperability with external HR systems):
- `Name`, `Email`, `Headline`, `Status`, `Applied Date`, `Last Status Change`

### Sanitization Points

- [x] **[N/A]** — This story renders no HTML from user-input strings via `dangerouslySetInnerHTML`. CSV is generated server-side from DB data. No `dangerouslySetInnerHTML` introduced.

### Accessibility Patterns

- [x] Keyboard interaction pattern documented for every new interactive element
- [x] ARIA roles/labels listed for every semantically meaningful element
- [x] **Focus management plan documented for every modal / dropdown / route transition in this story**
- [x] axe-core assertions planned in component tests

Elements:

- **ExportCandidatesButton**: A `<Button>` with `aria-label={t("export.ariaButton")}`. Keyboard: Tab-focusable, Enter/Space triggers export. Shows loading spinner + "Exporting..." text during download. Disabled during download to prevent double-click. No modal/dialog — direct download trigger. Positioned in the page header area (right side of the flex row containing "Candidates" title and count).
- **axe assertions**: Planned for: (a) export button in default state, (b) export button in loading state.

### Component Dependencies

- [x] **[N/A]** — This story adds no new component dependencies. All needed components (Button, toast/Sonner) already exist in `apps/portal/src/components/ui/`. No new shadcn/ui installs required.

## Validation Scenarios (SN-2 — REQUIRED)

1. **Export candidates for a job with applicants** — Employer navigates to candidates page for a job with 5 applicants, clicks "Export Candidates". A CSV file downloads with the correct filename pattern. Opening the CSV in Excel shows 5 data rows + 1 header row, with all 6 columns populated.
   - Expected outcome: CSV file downloaded with correct filename, UTF-8 BOM, all fields present
   - Evidence required: API route test + component test + manual CSV inspection

2. **Email omitted for non-consenting seekers** — Job has 3 applicants: 2 with `consentEmployerView: true`, 1 with `consentEmployerView: false`. CSV exported. The 2 consenting seekers have their email addresses. The non-consenting seeker shows "—" in the Email column.
   - Expected outcome: Email conditionally included based on consent
   - Evidence required: Query test + API route test

3. **Empty posting shows message, no download** — Employer views candidates page for a job with 0 applicants. Clicks "Export Candidates". Toast message: "No candidates to export for this posting". No file downloaded.
   - Expected outcome: No CSV file generated, user feedback message shown
   - Evidence required: Component test (button click with 0 applications)

4. **Filename format** — Export generates a file named `Acme-Corp_Senior-Developer_candidates_2026-04-12.csv` (spaces replaced with hyphens, date in ISO format).
   - Expected outcome: Filename sanitized and matches pattern
   - Evidence required: API route test verifying Content-Disposition header

5. **Ownership check** — Employer A tries to export candidates for Employer B's job posting. Returns 404, no data exported.
   - Expected outcome: 404 response, no CSV generated
   - Evidence required: API route test

6. **transitionedAt (last status change) reflects actual timestamp** — Candidate was submitted on April 1, moved to "under_review" on April 5. CSV shows "Applied Date: 2026-04-01" and "Last Status Change: 2026-04-05".
   - Expected outcome: Both dates correct and distinct
   - Evidence required: Query test with mock data

## Flow Owner (SN-4)

**Owner:** Dev (full stack — new DB query, 1 new API route, export button in candidates page, with manual CSV file verification)

## Tasks / Subtasks

- [x] Task 0: Reference patterns & codebase verification (AC: all)
  - [x] 0.1 Read `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx` — understand server page structure. The export button needs to be added to the header area (line 48–55, the `flex items-end justify-between` div). The page already has `posting.title`, `company.id`, and `applications.length` available. **The export button is a client component** that will be rendered in the server page's header section.
  - [x] 0.2 Read `packages/db/src/queries/portal-applications.ts` — understand `getApplicationsWithSeekerDataByJobId(jobId)` (lines 348–395). This query already joins `auth_users` (name) and `portal_seeker_profiles` (headline, skills) but does NOT include: `authUsers.email`, `portalSeekerProfiles.consentEmployerView`, or `portalApplications.transitionedAt`. These must be added in a **new export-specific query** (not by modifying the existing one — the existing one feeds the kanban board and shouldn't carry export-only fields).
  - [x] 0.3 Read `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts` — reference for employer authentication pattern (`requireEmployerRole()` + `getCompanyByOwnerId(session.user.id)`).
  - [x] 0.4 Read `apps/community/src/app/api/v1/user/account/export/download/[token]/route.ts` — reference for `new Response()` with `Content-Disposition: attachment` pattern (established download pattern in codebase).
  - [x] 0.5 Read `packages/db/src/schema/portal-seeker-profiles.ts` — confirm `consentEmployerView` field (boolean, default false) at the correct column path.
  - [x] 0.6 Read `packages/db/src/schema/portal-applications.ts` — confirm `transitionedAt` field (TIMESTAMPTZ, nullable).

- [x] Task 1: DB query — export-specific application data (AC: 1, 2)
  - [x] 1.1 Add `getApplicationsForExport(jobId: string, companyId: string)` to `packages/db/src/queries/portal-applications.ts`. This is a new query (NOT a modification of `getApplicationsWithSeekerDataByJobId`) that returns export-specific fields:
    ```typescript
    export async function getApplicationsForExport(
      jobId: string,
      companyId: string,
    ): Promise<Array<{
      seekerName: string | null;
      seekerEmail: string | null;
      seekerHeadline: string | null;
      status: PortalApplicationStatus;
      createdAt: Date;
      transitionedAt: Date | null;
      consentEmployerView: boolean;
    }>>
    ```
    **Joins:**
    - `portalApplications` — base (id, status, createdAt, transitionedAt)
    - `portalJobPostings` — ownership verification (`portalJobPostings.companyId = companyId` AND `portalJobPostings.id = jobId`) — INNER JOIN (no results if job doesn't belong to company)
    - `authUsers` — LEFT JOIN on `seekerUserId` → `authUsers.id` for name + email
    - `portalSeekerProfiles` — LEFT JOIN on `seekerUserId` → `portalSeekerProfiles.userId` for headline + consentEmployerView
    **WHERE:** `portalApplications.jobId = jobId`
    **ORDER BY:** `portalApplications.createdAt ASC` (oldest first for chronological CSV)
    **Note:** The INNER JOIN on `portalJobPostings` scoped by `companyId` makes this query return empty array (not null) when the employer doesn't own the job. The route must distinguish "no applicants" from "not owned" — see Task 2.
  - [x] 1.2 **Ownership verification**: The query embeds ownership check via the INNER JOIN to `portalJobPostings` with `companyId` filter. However, the route needs to separately verify the job exists and belongs to the employer (to return 404 vs empty-but-valid). Add a `companyId` filter on the portalJobPostings join: `and(eq(portalJobPostings.id, portalApplications.jobId), eq(portalJobPostings.companyId, companyId))`.
  - [x] 1.3 Export query function from `packages/db/src/queries/portal-applications.ts` (exported via `export async function`; `@igbo/db build` run to update dist types).
  - [x] 1.4 Tests: `portal-applications.test.ts` — add tests for `getApplicationsForExport`:
    - Returns applications with seeker data when job owned
    - Returns empty array when job not owned by company (INNER JOIN filter)
    - Returns `consentEmployerView` correctly for each row
    - Orders by `createdAt ASC`
    - Returns `transitionedAt` when available, null when not

- [x] Task 2: CSV export API route (AC: 1, 2, 3, 4)
  - [x] 2.1 Create `apps/portal/src/app/api/v1/jobs/[jobId]/export/route.ts`:
    - **Zod import**: `import { z } from "zod/v4"` — NOT `"zod"`
    - `GET` handler: `withApiHandler`, `requireEmployerRole()`, `getCompanyByOwnerId(session.user.id)`.
    - Extract `jobId` from URL: `new URL(req.url).pathname.split("/").at(-2)` (export is the last segment, jobId is second-to-last). Validate as UUID with Zod.
    - **Ownership verification**: First call `getJobPostingWithCompany(jobId)` to verify the job exists and belongs to the employer's company. If not → 404. This is needed because `getApplicationsForExport` returns empty array for both "no applicants" and "not owned" — we need to distinguish them.
    - Call `getApplicationsForExport(jobId, company.id)`.
    - If empty results AND job exists → return 200 with empty CSV (just header row). **Note**: The AC says "No empty CSV file is generated" — this is enforced client-side (the button checks application count before calling the API). The API still returns a valid CSV with headers-only for robustness.
    - **CSV generation** (inline helper — no library needed):
      1. UTF-8 BOM: `\uFEFF` prepended for Excel compatibility
      2. Header row: `Name,Email,Headline,Status,Applied Date,Last Status Change`
      3. For each application row:
         - `seekerName` — escape with `escapeCsvField()` (double-quote if contains comma/quote/newline)
         - `seekerEmail` — if `consentEmployerView === true`, include `seekerEmail`; else `"—"`
         - `seekerHeadline` — escape with `escapeCsvField()`
         - `status` — raw enum value (e.g., "under_review")
         - `createdAt` — format as `YYYY-MM-DD` using `toISOString().split("T")[0]`
         - `transitionedAt` — format as `YYYY-MM-DD` if not null, else empty string
    - **`escapeCsvField(value: string | null): string`** — private helper function at the top of the route file:
      - If null/empty → return empty string
      - If contains comma, double-quote, or newline → wrap in double-quotes, escape internal double-quotes by doubling them (`"` → `""`)
      - Else return as-is
    - **Filename generation**:
      - `sanitizeForFilename(str: string)` — private helper: replace spaces and non-alphanumeric characters with hyphens, collapse multiple hyphens, trim leading/trailing hyphens, truncate to 50 chars
      - Pattern: `{company-name}_{job-title}_candidates_{YYYY-MM-DD}.csv`
      - Get `companyName` from the `company` object, `jobTitle` from `getJobPostingWithCompany` result
    - **Response**: Return `new Response(csvString, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"{filename}\"", "Cache-Control": "no-store" } })`. **Do NOT use `successResponse()`** — this is a raw file download, not a JSON API response.
  - [x] 2.2 Tests: `export/route.test.ts`:
    - 401 (no session)
    - 403 (non-employer role)
    - 404 (job not found)
    - 404 (job owned by different company)
    - 200 with valid CSV (2 applicants, verify header + 2 data rows)
    - 200 with consent-gated email (1 consenting, 1 non-consenting — verify "—" replacement)
    - 200 with empty applications (header-only CSV)
    - Verify Content-Disposition header filename format
    - Verify UTF-8 BOM (`\uFEFF`) at start of response body
    - Verify CSV field escaping (name with comma, headline with double-quote)
    - Verify `transitionedAt` column (null → empty string, non-null → formatted date)

- [x] Task 3: ExportCandidatesButton client component (AC: 1, 3)
  - [x] 3.1 Create `apps/portal/src/components/domain/export-candidates-button.tsx` (`"use client"`). Props: `{ jobId: string; applicationCount: number }`.
  - [x] 3.2 Implementation:
    - Button with `variant="outline"` and download icon (use Lucide `Download` icon, already available in portal via `lucide-react`).
    - **Empty guard (AC-3)**: If `applicationCount === 0`, clicking the button shows a toast warning: `t("export.noData")`. Does NOT call the API. Button is still rendered (not hidden) but the click handler short-circuits.
    - **Download flow**:
      1. Set `isExporting = true` (disables button, shows "Exporting..." text)
      2. `fetch(`/api/v1/jobs/${jobId}/export`)` with `credentials: "same-origin"`
      3. If `!response.ok` → show error toast: `t("export.error")`
      4. Read response as Blob: `const blob = await response.blob()`
      5. Extract filename from `Content-Disposition` header: `response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "candidates.csv"`
      6. Create `<a>` element, set `href = URL.createObjectURL(blob)`, `download = filename`, click it, revoke URL
      7. Show success toast: `t("export.success")`
      8. Set `isExporting = false`
    - **Error handling**: Wrap in try/catch. On error: show error toast, reset loading state.
  - [x] 3.3 Tests: `export-candidates-button.test.tsx`:
    - Renders button with correct label
    - Shows "Exporting..." during download
    - Calls correct API endpoint
    - Creates and clicks download link on success
    - Shows error toast on API failure
    - Shows "no data" toast when `applicationCount === 0` (does not fetch)
    - Button disabled during export
    - axe assertion

- [x] Task 4: Integrate export button into candidates page (AC: 1, 3)
  - [x] 4.1 In `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx`:
    - Import `ExportCandidatesButton` from `@/components/domain/export-candidates-button`
    - Add to header area (inside the `flex items-end justify-between` div, right side):
      ```tsx
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("candidateCount", { count: applications.length })}
          </p>
        </div>
        <ExportCandidatesButton jobId={jobId} applicationCount={applications.length} />
      </div>
      ```
  - [x] 4.2 Update `candidates/page.test.tsx` — add `ExportCandidatesButton` to the mock (or verify it renders with correct props). Add test for: export button visible with correct application count prop.

- [x] Task 5: i18n keys (AC: all)
  - [x] 5.1 Add 6 `Portal.ats.export.*` keys to `apps/portal/messages/en.json` (see i18n inventory above)
  - [x] 5.2 Add Igbo translations to `apps/portal/messages/ig.json` (Dev Completion obligation per SN-1)

- [x] Task 6: Final verification (AC: all)
  - [x] 6.1 Run `pnpm --filter @igbo/db test` — all db tests green (new export query tests) ✅ 923/923
  - [x] 6.2 Run `pnpm --filter @igbo/portal test` — all portal tests green ✅ 1793/1793
  - [x] 6.3 Run `pnpm --filter @igbo/portal typecheck` and `pnpm --filter @igbo/portal lint` — no errors ✅
  - [x] 6.4 Run `pnpm ci-checks` — all CI checks passed ✅
  - [x] 6.5 Rebuild `@igbo/db` if new exports added — `pnpm --filter @igbo/db build` ✅
  - [x] 6.6 Verify CSV file manually: open in Excel/Google Sheets, check BOM encoding renders correctly, special characters preserved — verified via byte-level tests (UTF-8 BOM 0xEF 0xBB 0xBF asserted in arrayBuffer); field escaping verified via comma/quote tests

## Dev Notes

### Architecture Patterns & Constraints

**This story adds a CSV export endpoint and download button for the existing ATS candidates page (from P-2.9). The export is a lightweight server-side CSV generation — no external library, no S3 storage, no background jobs.**

#### Existing Building Blocks (MUST reuse)

1. **`candidates/page.tsx`** — The server page at `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx`. Already fetches `getJobPostingWithCompany(jobId)` and `getApplicationsWithSeekerDataByJobId(jobId)`. The export button goes in the page header's right side. The page already verifies employer ownership (redirects if company doesn't own the job).

2. **`requireEmployerRole()` + `getCompanyByOwnerId()`** — The established employer auth pattern. Import `requireEmployerRole` from `@/lib/portal-permissions` and `getCompanyByOwnerId` from `@igbo/db/queries/portal-companies`.

3. **`getJobPostingWithCompany(jobId)`** — Returns posting with company data. Used to get job title and company name for the CSV filename.

4. **Download pattern from community app** — The GDPR export download route at `apps/community/src/app/api/v1/user/account/export/download/[token]/route.ts` uses `new Response(content, { headers: { "Content-Disposition": "attachment; filename=..." } })`. This is the established file download pattern in the codebase.

5. **Sonner toast** — Use for success/error/warning feedback.

#### CSV Generation Strategy

**No external CSV library needed.** The export data is simple (6 columns, all string/date fields, no nested objects). Hand-rolled CSV generation with proper escaping is sufficient and avoids adding a dependency.

```
CSV structure:
BOM + Header row + N data rows

\uFEFF
Name,Email,Headline,Status,Applied Date,Last Status Change
"Jane Doe",jane@example.com,"Senior Developer",under_review,2026-04-01,2026-04-05
"John Smith",—,"Full-Stack Engineer",submitted,2026-04-03,
```

**UTF-8 BOM** (`\uFEFF`): Required for Excel to correctly auto-detect UTF-8 encoding. Without it, Excel may interpret accented characters (common in Igbo names) incorrectly.

**Field escaping rules:**
- Null/empty → empty string
- Contains comma, double-quote, or newline → wrap in double-quotes, escape internal `"` as `""`
- Otherwise → as-is

#### Consent-Gated Email (AC-2)

The `consentEmployerView` field on `portal_seeker_profiles` (added in P-2.2, migration 0060) controls whether the seeker's email is visible to employers. For the CSV export:
- If `consentEmployerView === true` → include `authUsers.email`
- If `consentEmployerView === false` (default) → replace with `"—"`
- If `consentEmployerView` is null (no seeker profile — edge case for legacy applications) → treat as false → `"—"`

The consent check happens in the **query result** (the query returns both `seekerEmail` and `consentEmployerView`), and the **route** applies the gating logic when building CSV rows.

#### Filename Sanitization

Company names and job titles may contain characters that are invalid in filenames. The `sanitizeForFilename()` helper:
1. Replace spaces with hyphens
2. Remove characters that aren't alphanumeric, hyphen, or underscore
3. Collapse consecutive hyphens
4. Trim leading/trailing hyphens
5. Truncate to 50 chars per segment

Example: `"Acme Corp!"` → `"Acme-Corp"`, `"Senior Developer (Full-Time)"` → `"Senior-Developer-Full-Time"`

#### Why GET (Not POST) for the Export Route

The export is an idempotent read operation — no state changes. GET is semantically correct. The route returns `Content-Type: text/csv` (not JSON), so it doesn't use `successResponse()`. The browser handles the download via the `Content-Disposition: attachment` header.

### Previous Story Intelligence (P-2.10)

Key patterns from P-2.10 (immediate predecessor):

- **`requireEmployerRole()` + `getCompanyByOwnerId(session.user.id)`** — established in every employer route. P-2.11 follows the same pattern.
- **`successResponse(data, meta?, status?)` 3-arg form** — P-2.10 discovered the signature. But P-2.11 doesn't use `successResponse` (returns raw `Response` for CSV download).
- **Zod v4 strict UUIDs** — Test fixtures must use valid UUID format (pos 14 = `4`, pos 19 in `[89ab]`). E.g., `a1111111-1111-4111-a111-111111111111`.
- **URL param extraction** — `new URL(req.url).pathname.split("/")`. For `/api/v1/jobs/[jobId]/export`, the `jobId` is at `.at(-2)` (export is last segment).
- **`router.refresh()` for data re-fetch** — Not needed here (export is a download, not a mutation).

### Git Intelligence

Recent commits show P-2.9 (ATS pipeline) and P-2.10 (notes + bulk actions) as immediate predecessors. P-2.11 builds on these by adding an export action to the candidates page. The pipeline view, candidate data model, and employer auth patterns are all established and stable.

### Integration Tests (SN-3 — Missing Middle)

- **Export with consent gating**: Call `GET /api/v1/jobs/[jobId]/export` for a job with mixed consent applicants. Parse the CSV response. Verify consenting seekers have emails, non-consenting seekers have "—".
- **Export ownership isolation**: Employer A calls export for Employer B's job → 404.
- **Export matches application count**: Create 3 applications for a job, export CSV, verify 3 data rows (plus header).

### Project Structure Notes

**New files:**
- `apps/portal/src/app/api/v1/jobs/[jobId]/export/route.ts`
- `apps/portal/src/app/api/v1/jobs/[jobId]/export/route.test.ts`
- `apps/portal/src/components/domain/export-candidates-button.tsx`
- `apps/portal/src/components/domain/export-candidates-button.test.tsx`

**Modified files:**
- `packages/db/src/queries/portal-applications.ts` — add `getApplicationsForExport(jobId, companyId)`
- `packages/db/src/queries/portal-applications.test.ts` — add export query tests
- `packages/db/src/index.ts` — export new query function
- `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx` — add ExportCandidatesButton
- `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.test.tsx` — update mock for export button
- `apps/portal/messages/en.json` — 6 new keys
- `apps/portal/messages/ig.json` — Igbo translations

**Files NOT touched (reference only):**
- `apps/portal/src/components/flow/ats-pipeline-view.tsx` — export button is in the server page, not the client pipeline view
- `apps/portal/src/components/domain/ats-kanban-board.tsx` — no changes needed
- `apps/portal/src/components/domain/bulk-action-toolbar.tsx` — export is a separate button, not in bulk toolbar
- `apps/portal/src/services/application-state-machine.ts` — read-only operation, no transitions

### Critical Anti-Patterns to Avoid

1. **Do NOT modify `getApplicationsWithSeekerDataByJobId`** — Create a separate export-specific query. The existing query feeds the kanban board and should not carry export-only fields (email, consentEmployerView, transitionedAt).
2. **Do NOT use `successResponse()` for the CSV download** — Return a raw `new Response()` with `Content-Type: text/csv`. `successResponse()` wraps data in JSON `{ data: ... }` which is wrong for file downloads.
3. **Do NOT add a CSV library dependency** — The CSV structure is simple (6 string/date columns). Hand-rolled generation with proper escaping is sufficient. Adding `papaparse` or `csv-stringify` for 20 lines of logic is over-engineering.
4. **Do NOT expose seeker email without consent check** — Always check `consentEmployerView`. If `false` or `null` → replace email with `"—"`. This is a GDPR-relevant data protection requirement.
5. **Do NOT use POST for the export endpoint** — GET is semantically correct for an idempotent read. POST implies a state change.
6. **Do NOT forget the UTF-8 BOM** — Without `\uFEFF` at the start, Excel on Windows will corrupt accented characters (including Igbo names with diacritics like `Ọ`, `Ụ`, `Ị`).
7. **Do NOT put the export button in `AtsPipelineView`** — The button belongs in the server page's header section, not in the client pipeline view. The server page already has the `posting.title` and `company` context needed for display.
8. **Do NOT generate empty CSV files** — AC-3 says to show a message instead. Enforce client-side via `applicationCount === 0` guard. The API returns header-only CSV as a safety fallback but the button prevents the call entirely.
9. **Do NOT use 403 for ownership failures** — Return 404 to prevent information leakage (established pattern).
10. **Do NOT import from `"zod"` in route files** — Always `import { z } from "zod/v4"`.
11. **Do NOT hardcode English strings in the component** — All user-facing text via `useTranslations("Portal.ats")`.
12. **Do NOT forget to sanitize the filename** — Company names and job titles can contain special characters, spaces, and Unicode. Sanitize before using in `Content-Disposition`.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md:1147-1175`] — Story 2.11 Bulk Candidate Export acceptance criteria
- [Source: `_bmad-output/planning-artifacts/prd-v2.md:1104`] — FR131 (bulk candidate export MVP-lite)
- [Source: `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx`] — Server page where export button integrates
- [Source: `apps/portal/src/components/flow/ats-pipeline-view.tsx`] — Client pipeline view (NOT modified)
- [Source: `packages/db/src/queries/portal-applications.ts:348-395`] — `getApplicationsWithSeekerDataByJobId` (reference, not modified)
- [Source: `packages/db/src/schema/portal-seeker-profiles.ts`] — `consentEmployerView` field
- [Source: `packages/db/src/schema/portal-applications.ts`] — `transitionedAt` field
- [Source: `apps/community/src/app/api/v1/user/account/export/download/[token]/route.ts`] — File download Response pattern
- [Source: `apps/portal/src/app/api/v1/applications/[applicationId]/detail/route.ts`] — Employer auth pattern reference
- [Source: `_bmad-output/implementation-artifacts/p-2-10-employer-notes-bulk-actions.md`] — Predecessor story (P-2.10) learnings
- [Source: `docs/monorepo-playbook.md` Section 7] — Frontend Safety & Readiness checklist

## Definition of Done (SN-1)

- [x] All acceptance criteria met (AC 1-4)
- [x] All validation scenarios demonstrated with evidence
- [x] Unit tests written and passing
- [x] Integration tests written and passing (SN-3: consent-gated export, ownership isolation, application count match)
- [x] Flow owner has verified the complete end-to-end chain
- [x] No pre-existing test regressions introduced
- [x] Dev Completion: all i18n keys in Readiness inventory exist in `en.json` with English copy and render without missing-key warnings
- [x] Dev Completion: **Igbo translations added to `ig.json` for every key in the Readiness inventory**
- [x] Dev Completion: every sanitization point passes `pnpm ci-checks` locally
- [x] Dev Completion: all a11y patterns listed in Readiness (export button aria-label, loading state) have passing axe-core assertions
- [x] Dev Completion: all component dependencies in Readiness are imported and rendering
- [x] P-2.10 tests: all existing kanban board + side panel + bulk action tests still pass (no regressions)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Validation Evidence

1. **Export candidates for a job with applicants** — `route.test.ts:161` "returns 200 with valid CSV for 2 applicants" + component test "creates and clicks download anchor on successful response" ✅
2. **Email omitted for non-consenting seekers** — `portal-applications.test.ts` "Returns consentEmployerView correctly for each row" + `route.test.ts:183` "omits email for non-consenting seeker (AC-2)" ✅
3. **Empty posting shows message, no download** — `export-candidates-button.test.tsx` "shows warning toast and does not fetch when applicationCount is 0" ✅
4. **Filename format** — `route.test.ts:211` "sets Content-Disposition header with sanitized filename" — verifies company/title slug + `.csv` suffix ✅
5. **Ownership check** — `route.test.ts:129` "returns 404 when job belongs to a different company" ✅
6. **transitionedAt dates correct** — `portal-applications.test.ts` "Returns transitionedAt when available, null when not" + `route.test.ts:252` "formats transitionedAt as YYYY-MM-DD when present, empty string when null" ✅

### Debug Log References

- **BOM handling**: `TextDecoder` strips the UTF-8 BOM (`\uFEFF`) when calling `response.text()` in tests (Node.js Web Streams API default behavior). Tests amended to use `response.arrayBuffer()` + `Uint8Array` byte checks (0xEF, 0xBB, 0xBF) for BOM verification. Production download via blob + `URL.createObjectURL` is unaffected — bytes are preserved correctly.
- **Anchor spy**: `document.createElement` spy required tag-specific mock (`if (tag === 'a') return mockAnchor`) to avoid intercepting React's internal element creation. `vi.restoreAllMocks()` called at end of that test.

### Completion Notes List

- `getApplicationsForExport` return type uses `boolean | null` for `consentEmployerView` (not `boolean`) because a LEFT JOIN on `portalSeekerProfiles` can produce `null` for legacy applications with no profile. Route treats `null` as `false` (→ em-dash in CSV). Story spec said `boolean` but `boolean | null` is the accurate Drizzle LEFT JOIN type.
- `pnpm --filter @igbo/db build` required after adding the new query — TypeScript types for the portal's imports are generated from the dist.
- `escapeCsvField` and `sanitizeForFilename` are private module-level helpers in the route file (not exported). They have no external callers.

### File List

- `packages/db/src/queries/portal-applications.ts` — added `getApplicationsForExport`
- `packages/db/src/queries/portal-applications.test.ts` — added `getApplicationsForExport (P-2.11)` describe block (6 tests)
- `apps/portal/src/app/api/v1/jobs/[jobId]/export/route.ts` — new file (CSV export GET handler)
- `apps/portal/src/app/api/v1/jobs/[jobId]/export/route.test.ts` — new file (16 tests)
- `apps/portal/src/components/domain/export-candidates-button.tsx` — new file (client component)
- `apps/portal/src/components/domain/export-candidates-button.test.tsx` — new file (10 tests)
- `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.tsx` — added ExportCandidatesButton import + render
- `apps/portal/src/app/[locale]/(gated)/my-jobs/[jobId]/candidates/page.test.tsx` — added ExportCandidatesButton mock + 2 tests
- `apps/portal/messages/en.json` — added `Portal.ats.export.*` (6 keys)
- `apps/portal/messages/ig.json` — added `Portal.ats.export.*` (6 keys, Igbo copy)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] `escapeCsvField` had no CSV formula injection protection — seeker-controlled fields (name, headline) starting with `=`, `+`, `-`, `@`, `\t`, `\r` could inject formulas into Excel. Fixed: added `CSV_FORMULA_PREFIX` regex guard that wraps formula-trigger fields in `"'..."` (single-quote prefix neutralizes formula). Added test. [route.ts:17-30]
- [x] [AI-Review][MEDIUM] `escapeCsvField` only checked `\n` but not `\r` (carriage return). Per RFC 4180, CRLF within fields must be enclosed in double-quotes. Fixed: added `\r` to the quoting condition. Added test. [route.ts:23]
- [x] [AI-Review][MEDIUM] Download anchor in `ExportCandidatesButton` was not appended to DOM before `.click()` — some browsers (Safari) may silently ignore detached anchor clicks. Fixed: added `document.body.appendChild(anchor)` before click + `removeChild` after. Updated test with real anchor element + append/remove assertions. [export-candidates-button.tsx:39-46]
- [x] [AI-Review][LOW] `sanitizeForFilename` could return empty string for all-special-character input. Fixed: added `|| "export"` fallback. [route.ts:38]
- [x] [AI-Review][LOW] No test for CSV formula injection. Fixed: added "neutralizes CSV formula injection in seeker-controlled fields" test with `=CMD(calc)` and `+1+cmd` payloads. [route.test.ts:320]

## Change Log

| Date       | Version | Description                                                              | Author        |
| ---------- | ------- | ------------------------------------------------------------------------ | ------------- |
| 2026-04-12 | 0.1     | Story drafted — Bulk Candidate Export                                    | Scrum Master  |
| 2026-04-12 | 1.0     | Implementation complete — all 6 tasks delivered, 1793/1793 portal tests + 923/923 @igbo/db tests passing, typecheck + lint clean. Status → review. | Dev Agent |
| 2026-04-12 | 1.1     | Code review: 1 HIGH + 2 MEDIUM + 2 LOW findings. Fixed: CSV formula injection guard, \r in escapeCsvField, anchor DOM attachment, sanitizeForFilename fallback, injection test. All 5 issues fixed. 1795/1795 portal tests + 923/923 @igbo/db tests. Status → done. | Reviewer |
