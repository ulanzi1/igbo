# Story 1.13: GDPR Compliance & Data Privacy

Status: done

## Story

As a member,
I want cookie consent controls, data processing transparency, and the ability to delete my account,
so that my privacy rights are respected in compliance with GDPR (NFR-S9).

## Acceptance Criteria

1. **Given** a visitor (guest or member) loads any page
   **When** the page renders for the first time (no prior consent recorded)
   **Then** a cookie consent banner displays with granular opt-in categories: essential (always on), analytics, and preferences
   **And** the consent choice is persisted (in a `cookie-consent` cookie) and respected across sessions
   **And** no non-essential cookies or tracking scripts load until consent is granted

2. **Given** a prospective member submits a membership application (Story 1.5)
   **When** the application form is submitted
   **Then** a data processing consent checkbox is required: "I consent to the processing of my personal data as described in the Privacy Policy"
   **And** the consent is recorded with timestamp, IP address, and consent version for audit purposes
   _(Note: `consentGivenAt`, `consentIp`, `consentVersion` columns already exist on `authUsers` — verify Story 1.5 wired them correctly; patch any gaps)_

3. **Given** a member wants to delete their account
   **When** they navigate to account settings and click "Delete My Account"
   **Then** the system requires password confirmation and displays a warning about data deletion consequences
   **And** a confirmation email is sent with a cancellation link valid for 30 days
   **And** the account `accountStatus` is set to `'PENDING_DELETION'` and `scheduledDeletionAt` is set to `now() + 30 days`
   **And** after 30 days the daily retention-cleanup job hard-anonymizes all PII (name → `"Former Member"`, email → `"deleted-{id}@anonymized.invalid"`, phone/bio/location/photo → `null` or anonymized placeholder)
   **And** soft-deleted records preserve non-identifying content — posts/articles display "Former Member" as author with a generic silhouette avatar
   **And** the `member.anonymizing` EventBus event is emitted before PII scrubbing
   **And** the job logs each anonymization to the audit trail and emits a `member.anonymized` EventBus event

4. **Given** a data breach is detected
   **When** an admin navigates to `/admin/breach-response`
   **Then** the page displays: affected member list generation (by date range), bulk email notification tool, and incident timestamp logging
   **And** the breach notification runbook is documented in `docs/gdpr-breach-runbook.md`

5. **Given** a member requests their data export (GDPR Article 20 — right to data portability)
   **When** they click "Export My Data" in account settings
   **Then** the export is rate-limited to 1 request per 7 days per member (using `RATE_LIMIT_PRESETS.GDPR_EXPORT`)
   **And** the system enqueues a background export job and returns HTTP 202 Accepted
   **And** the export job generates a JSON archive: profile data, posts authored, articles authored, comments authored, event RSVPs, points history, notification preferences
   **And** sent messages are included with recipient names/IDs anonymized as "Member-1", "Member-2" (consistent within export, not linkable externally)
   **And** received messages from other members are excluded entirely (controlled by feature flag `INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false`)
   **And** the export JSON is stored in the `gdprExportRequests.exportData` column with a signed download token
   **And** the download link expires after 48 hours
   **And** when the member hits the download endpoint with a valid non-expired token, the system returns the JSON file as a download
   **And** **Legal review prerequisite (BLOCKER for production launch):** received-message exclusion policy must be confirmed by legal counsel; see `docs/gdpr-breach-runbook.md` for tracking

## Tasks / Subtasks

- [x] Task 1: DB Migration 0009 — add `gdprExportRequests` table + account deletion columns (AC: 3, 5)
  - [x] Create `src/db/migrations/0009_gdpr_compliance.sql`:
    - Add `scheduled_deletion_at TIMESTAMPTZ` column to `auth_users`
    - Add `'PENDING_DELETION'` and `'ANONYMIZED'` to `account_status` enum — **UPPERCASE to match existing values** (`PENDING_EMAIL_VERIFICATION`, `APPROVED`, `SUSPENDED`, `BANNED`, etc.)
    - Create `gdpr_export_requests` table:
      ```sql
      CREATE TABLE gdpr_export_requests (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | ready | expired
        download_token VARCHAR(64) UNIQUE,
        export_data   JSONB,
        expires_at    TIMESTAMPTZ,
        requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX gdpr_export_requests_user_id_idx ON gdpr_export_requests(user_id);
      CREATE INDEX gdpr_export_requests_token_idx ON gdpr_export_requests(download_token) WHERE download_token IS NOT NULL;
      ```
  - [x] Create `src/db/schema/gdpr.ts` (Drizzle schema matching the new table)
  - [x] Add `import * as gdprSchema` to `src/db/index.ts` and spread into drizzle config
  - [x] Hand-write migration SQL — do NOT use `drizzle-kit generate` (fails with `server-only` error, established pattern)

- [x] Task 2: GDPR queries + GdprService (AC: 3, 5)
  - [x] Create `src/db/queries/gdpr.ts`:
    - `createExportRequest(userId: string): Promise<GdprExportRequest>`
    - `getExportRequestByToken(token: string): Promise<GdprExportRequest | null>`
    - `getUserExportRequests(userId: string): Promise<GdprExportRequest[]>`
    - `updateExportRequest(id: string, data: Partial<GdprExportRequest>): Promise<void>`
    - `findAccountsPendingAnonymization(): Promise<AuthUser[]>` — where `scheduledDeletionAt <= now()` and `accountStatus = 'PENDING_DELETION'`
  - [x] Create `src/services/gdpr-service.ts` (add `import "server-only"` as first line):
    - `requestAccountDeletion(userId: string, password: string): Promise<void>`
      - Verify password via bcrypt (use `verifyPassword()` from `@/services/auth-service` or inline bcrypt compare — see note below)
      - Set `accountStatus = 'PENDING_DELETION'`, `scheduledDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)`
      - Send cancellation email via `enqueueEmailJob()`
      - Emit `member.deletion_requested` EventBus event
    - `cancelAccountDeletion(token: string): Promise<void>`
      - Verify cancellation token (store in Redis with 30-day TTL keyed to `gdpr:cancel:{userId}`)
      - Reset `accountStatus = 'APPROVED'`, `scheduledDeletionAt = null`
    - `anonymizeAccount(userId: string): Promise<void>` — called by retention-cleanup job:
      - Emit `member.anonymizing` EventBus event FIRST
      - Update `authUsers`: `name = 'Former Member'`, `email = 'deleted-{id}@anonymized.invalid'`, `phone = null`, `image = null`
      - Update `communityProfiles`: `displayName = 'Former Member'`, `bio = null`, `photoUrl = null`, `location* = null`, `interests = []`
      - Set `authUsers.accountStatus = 'ANONYMIZED'`, `authUsers.deletedAt = now()`
      - Log to `auditLogs` — **use the user's own ID as `actorId`** (self-service deletion; `actorId` is `UUID NOT NULL` with FK to `auth_users`, so "system" string won't work)
      - Emit `member.anonymized` EventBus event
    - `requestDataExport(userId: string): Promise<{ requestId: string }>` — creates `gdprExportRequests` row, enqueues job
    - `generateExportToken(): string` — use `crypto.randomBytes(32).toString('hex')` for a 64-char hex token (matches `download_token VARCHAR(64)` column). Alternatively `crypto.randomUUID()` works (32 hex chars without dashes, fits in VARCHAR(64)).
  - [x] **Password verification**: `verifyPassword()` is exported from `@/services/auth-service` (line ~50). Import it directly — `gdpr-service.ts` does not import anything that `auth-service.ts` depends on, so no circular dependency. Alternatively, `import bcrypt from "bcryptjs"` and call `bcrypt.compare()` directly if you prefer isolation.

- [x] Task 3: Retention Cleanup Job (AC: 3)
  - [x] Create `src/server/jobs/retention-cleanup.ts`:

    ```typescript
    import "server-only";
    import { registerJob } from "@/server/jobs/job-runner";
    import { anonymizeAccount, findAccountsPendingAnonymization } from "@/services/gdpr-service";

    registerJob("retention-cleanup", async () => {
      const accounts = await findAccountsPendingAnonymization();
      for (const account of accounts) {
        await anonymizeAccount(account.id);
      }
    });
    ```

  - [x] Register the job in `src/server/jobs/index.ts` (import the file so `registerJob` runs)
  - [x] The job is triggered daily via Docker cron in the Web container — document the cron entry in `docs/gdpr-breach-runbook.md`

- [x] Task 4: Data Export Background Job (AC: 5)
  - [x] Create `src/server/jobs/data-export.ts`:
    - Job handler receives `requestId` as context
    - Loads export request from DB
    - Queries all relevant user data:
      - Profile from `authUsers` + `communityProfiles` + `communitySocialLinks`
      - Posts authored (when post schema exists — use empty array `[]` with TODO comment for now)
      - Articles authored (same — empty array with TODO)
      - Comments authored (same)
      - Event RSVPs (same)
      - Points history (same)
      - Notification preferences (same)
    - Sent messages: included with recipient names/IDs anonymized (placeholder "Member-1" etc.) — check `INCLUDE_RECEIVED_MESSAGES_IN_EXPORT` env var
    - Received messages: excluded by default (`INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false`)
    - Assembles `exportData` JSON object
    - Generates download token: `crypto.randomUUID()`
    - Sets `expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000)`
    - Updates `gdprExportRequests` with token, data, `status = 'ready'`, `completed_at`
    - Sends in-app notification (emit `gdpr.export_ready` EventBus event — Story 9.1 will consume it; for now, send email via `enqueueEmailJob()`)
  - [x] Register in `src/server/jobs/index.ts`
  - [x] **Important**: `runJob(name)` accepts NO payload. Store context in Redis before calling `runJob("data-export")`: `redis.set(\`gdpr:export:${userId}\`, requestId, 'EX', 3600)`. In the job handler, query `gdprExportRequests`for rows with`status = 'pending'` to find work.

- [x] Task 5: API Routes — User Account Self-Service (AC: 3, 5)
  - [x] Create `src/app/api/v1/user/account/delete/route.ts`:
    ```typescript
    // POST /api/v1/user/account/delete — initiate account deletion
    export const POST = withApiHandler(handler);
    // Body: { password: string }
    // Returns: 200 { message: "Deletion scheduled. Check email for cancellation link." }
    // Errors: 401 (not authenticated), 400 (wrong password), 422 (validation)
    ```
  - [x] Create `src/app/api/v1/user/account/cancel-deletion/route.ts`:
    ```typescript
    // POST /api/v1/user/account/cancel-deletion — cancel pending deletion
    export const POST = withApiHandler(handler);
    // Body: { token: string }
    // Returns: 200 { message: "Account deletion cancelled." }
    ```
  - [x] Create `src/app/api/v1/user/account/export/route.ts`:
    ```typescript
    // POST /api/v1/user/account/export — request data export (rate-limited 1/7 days)
    export const POST = withApiHandler(handler, {
      rateLimit: {
        key: async (req) => {
          const session = await auth();
          return `gdpr-export:${session?.user?.id ?? req.headers.get("x-client-ip") ?? "anonymous"}`;
        },
        ...RATE_LIMIT_PRESETS.GDPR_EXPORT, // { maxRequests: 1, windowMs: 604_800_000 }
      },
    });
    // Returns: 202 Accepted { requestId: string }
    ```
  - [x] Create `src/app/api/v1/user/account/export/download/[token]/route.ts`:
    ```typescript
    // GET /api/v1/user/account/export/download/:token — download export JSON
    // No auth required (token IS the auth) — but validate token ownership + expiry
    // Returns: 200 with Content-Disposition: attachment; filename="my-data-export.json"
    // Errors: 404 (token not found), 410 Gone (expired), 401 (wrong user — only if also logged in)
    ```
  - [x] Use `requireAuthenticatedSession()` from `@/services/permissions.ts` for delete/export routes
  - [x] Import `auth` from `@/server/auth/config` (NOT `@/auth` — that file doesn't exist)

- [x] Task 6: Admin Breach Response (AC: 4)
  - [x] Create `src/app/api/v1/admin/breach-response/affected-members/route.ts`:
    ```typescript
    // GET /api/v1/admin/breach-response/affected-members?since=ISO_DATE&until=ISO_DATE
    // Returns list of members created/active during breach window
    // Use requireAdminSession() from @/lib/admin-auth
    export const GET = withApiHandler(handler);
    ```
  - [x] Create `src/app/api/v1/admin/breach-response/notify/route.ts`:
    ```typescript
    // POST /api/v1/admin/breach-response/notify
    // Body: { userIds: string[], incidentTimestamp: string, notificationMessage: string }
    // Sends notification emails + logs incident to auditLogs
    export const POST = withApiHandler(handler);
    ```
  - [x] Create `src/app/[locale]/(admin)/admin/breach-response/page.tsx`:
    - Admin-gated (use `requireAdminSession()` server-side)
    - Date range picker to generate affected member list
    - Bulk notification tool with preview
    - Incident log display
  - [x] Create `docs/gdpr-breach-runbook.md`:
    - 72-hour breach notification requirement (NFR-S9)
    - Step-by-step procedure: detect → log incident → generate affected list → bulk notify → document
    - Retention cleanup job cron schedule: `0 2 * * *` (2AM daily)
    - Legal review tracking for received-message inclusion decision
    - Feature flag: `INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false`
    - Note: migrate to Story 11.5 governance document repository when implemented

- [x] Task 7: Cookie Consent Banner (AC: 1)
  - [x] Create `src/components/shared/CookieConsentBanner.tsx`:
    - Client component (`"use client"`)
    - Reads `cookie-consent` cookie on mount; if absent/expired, shows banner
    - Three categories: Essential (always on, locked), Analytics (default off), Preferences (default off)
    - Accept All / Accept Essential / Customize options
    - On save: write `cookie-consent` cookie as JSON `{ essential: true, analytics: boolean, preferences: boolean, version: "1.0", timestamp: number }` with `max-age=31536000` (1 year)
    - Use `@/i18n/navigation` and `useTranslations()` for all strings
  - [x] Add `<CookieConsentBanner />` to `src/app/[locale]/layout.tsx` — place it **after `<Toaster />`** (end of the `<NextIntlClientProvider>` children) so it renders as a fixed-position overlay on all pages (both guest and authenticated)
  - [x] Add i18n keys under `cookieConsent` namespace in `messages/en.json` and `messages/ig.json`
  - [x] **No DB required**: cookie is the persisted state. No need for a `cookie_consent` table.
  - [x] **No tracking scripts currently exist**: The banner primarily establishes the consent framework. Add a comment noting that analytics integration (e.g. Plausible, PostHog) should check the cookie before initializing.

- [x] Task 8: Settings UI — Account Deletion + Data Export (AC: 3, 5)
  - [x] Create `src/app/[locale]/(app)/settings/account/page.tsx` (new settings section):
    - "Delete My Account" section with password confirmation dialog (shadcn `AlertDialog`)
    - "Export My Data" section with request button, status display if pending, download link if ready
    - Use `useSession()` from `next-auth/react` for user data (add mock in tests)
    - All strings via `useTranslations("settings.account")`
  - [x] Add "Account" link to `src/app/[locale]/(app)/settings/layout.tsx` sidebar nav (existing tabs: Profile, Privacy, Security — add Account as 4th tab)
  - [x] Do NOT create `src/features/account/` — it doesn't exist and settings pages live directly under `src/app/[locale]/(app)/settings/`
  - [x] Add i18n keys: `settings.account.deleteAccount.*`, `settings.account.exportData.*`

- [x] Task 9: i18n Strings (AC: all UI)
  - [x] Add `cookieConsent` namespace to `messages/en.json`:
    ```json
    "cookieConsent": {
      "title": "Cookie Preferences",
      "description": "We use cookies to improve your experience. Essential cookies are required for the site to function.",
      "essential": "Essential (Required)",
      "analytics": "Analytics",
      "preferences": "Preferences",
      "acceptAll": "Accept All",
      "acceptEssential": "Essential Only",
      "save": "Save Preferences"
    }
    ```
  - [x] Add `ig.json` translations (Igbo) for `cookieConsent` namespace
  - [x] Add `settings.account` namespace for account deletion/export UI strings in both `en.json` and `ig.json`
  - [x] **Admin namespace stays English** (established in Story 1.11 — admin namespace not translated)

- [x] Task 10: Verify Application Consent Fields (AC: 2)
  - [x] **Pre-verified**: Story 1.5 correctly wires all three fields in `src/features/auth/actions/submit-application.ts`:
    - `consentGivenAt` → `new Date()` on submission
    - `consentIp` → extracted from `CF-Connecting-IP` / `X-Forwarded-For` headers
    - `consentVersion` → hardcoded `"1.0"` (constant `CONSENT_VERSION`)
  - [x] Quick-verify the above still holds (file may have changed). If gaps found, patch and add tests.
  - [x] If `consentIp` extraction was changed, prefer `X-Client-IP` header (set by middleware.ts since Story 1.12)

- [x] Task 11: Tests (AC: all)
  - [x] `src/services/gdpr-service.test.ts`:
    - `@vitest-environment node`
    - Mock `@/lib/redis`, `@/db`, `@/lib/event-bus`, `@/services/email-service`, `bcryptjs`
    - Test `requestAccountDeletion`: sets `accountStatus = 'PENDING_DELETION'`, sends email, emits event
    - Test `cancelAccountDeletion`: resets status, clears scheduledDeletionAt
    - Test `anonymizeAccount`: emits `member.anonymizing` BEFORE scrub, updates correct fields, emits `member.anonymized` AFTER
    - Test `requestDataExport`: creates DB record, enqueues job, returns requestId
  - [x] `src/server/jobs/retention-cleanup.test.ts`:
    - Mock `gdpr-service`, `job-runner`
    - Test that `anonymizeAccount` is called for each account past grace period
  - [x] `src/app/api/v1/user/account/delete/route.test.ts`:
    - Mock session, gdpr-service, rate-limiter
    - Test 200 on valid password, 400 on wrong password, 401 on unauthenticated
  - [x] `src/app/api/v1/user/account/export/route.test.ts`:
    - Test 202 on first request, 429 with `X-RateLimit-*` headers on second request within window
    - Mock `@/lib/rate-limiter` AND `@/server/auth/config`
  - [x] `src/app/api/v1/user/account/export/download/[token]/route.test.ts`:
    - Test 200 with correct JSON payload and `Content-Disposition` header
    - Test 410 Gone on expired token, 404 on unknown token
  - [x] `src/components/shared/CookieConsentBanner.test.tsx`:
    - `@testing-library/react` (client component)
    - Test: shows banner when no cookie present
    - Test: does not show banner when valid cookie present
    - Test: saves cookie on "Accept All"
    - Test: saves cookie with correct categories on "Save Preferences"
  - [x] Baseline: **610 tests passing** (after Story 1.12 review fixes). Expect ~20–25 new tests.
  - [x] Pre-existing failure: `ProfileStep.test.tsx` — 1 failure since Story 1.9, do NOT investigate.

## Dev Notes

### Developer Context

Story 1.13 adds the GDPR compliance layer. Most foundational infrastructure already exists:

- **Soft-delete columns**: `deletedAt` on `authUsers` and `communityProfiles` (Stories 1.5, 1.9)
- **Consent tracking columns**: `consentGivenAt`, `consentIp`, `consentVersion` on `authUsers` (Story 1.5)
- **Background job runner**: `src/server/jobs/job-runner.ts` (Story 1.1c)
- **Email service stub**: `src/services/email-service.ts` with `enqueueEmailJob()` (Stories 1.5/1.7)
- **GDPR_EXPORT rate limit preset**: already defined in `src/services/rate-limiter.ts` (Story 1.12)
- **`withApiHandler()` with rateLimit option**: ready to use (Story 1.12)
- **Audit logs table**: `auditLogs` exists with full audit trail (Story 1.6)

**What this story adds:**

1. Cookie consent UI (banner + preference persistence via cookie)
2. Account deletion: 30-day grace period → anonymization
3. Retention cleanup background job (daily)
4. Data export: background job → JSON archive → 48-hour download token
5. Admin breach response tools
6. GDPR runbook documentation

**⚠️ CRITICAL: Soft delete vs. anonymization distinction:**

- `deletedAt` is set on **anonymization** (not on deletion request) — this is the GDPR hard-anonymize date
- `scheduledDeletionAt` (new column) tracks when anonymization will happen (30 days from request)
- During grace period: `accountStatus = 'PENDING_DELETION'`, user CAN still log in (to cancel)
- After anonymization: `accountStatus = 'ANONYMIZED'`, `deletedAt` is set — user can no longer log in

**⚠️ CASCADE deletes**: When `authUsers.deletedAt` is set for anonymization, do NOT hard-delete the row — keep it for data integrity (`authUserRoles`, `auditLogs` foreign keys). Only PII fields are zeroed out. The row remains with anonymized data.

**⚠️ Audit log `actorId` constraint**: `auditLogs.actorId` is `UUID NOT NULL` with FK to `auth_users`. For anonymization audit entries, use **the target user's own ID** as `actorId` (account deletion is self-service). Do NOT pass a string like `"system"` — it will fail the UUID/FK constraint.

**⚠️ EventMap type updates required**: `member.anonymizing` and `member.anonymized` already exist in `src/types/events.ts` (EventName union + EventMap interface + event interfaces). You must ADD:

1. `MemberDeletionRequestedEvent` interface (with `userId: string`)
2. `GdprExportReadyEvent` interface (with `userId: string`, `requestId: string`)
3. `"member.deletion_requested"` and `"gdpr.export_ready"` to the `EventName` union
4. Both entries to the `EventMap` interface

**⚠️ Job context passing**: **Confirmed**: `runJob(name: string): Promise<boolean>` accepts NO payload argument. Use Redis to pass the `requestId`:

```typescript
const redis = getRedisClient();
await redis.set(`gdpr:export:${userId}`, requestId, "EX", 3600);
await runJob("data-export");
// In job handler:
const redis = getRedisClient();
// Scan for pending export keys or query gdprExportRequests where status='pending'
```

**⚠️ Legal review blocker**: The received-message exclusion is gated by `INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false`. Add this to `.env.example` with a comment explaining the legal review requirement. The feature should ship with exclusion as default; legal review can toggle the flag without code changes.

**Scope boundaries — do NOT implement in this story:**

- Group ownership transfer on deletion (requires group schema from Story 5.1 — emit `member.anonymizing` event and handle in Story 5.1 listener)
- Event creator reference update (Story 7.1 will consume `member.anonymizing` event)
- Points history table (Story 8.1 — export will have empty `[]` with TODO comment)
- In-app notification delivery for export-ready event (Story 9.1 — email notification only in this story)
- Actual file storage for exports (Story 1.14 — store in DB JSONB for now)

### Architecture Compliance

- All services use `import "server-only"` as first line (`src/services/gdpr-service.ts`)
- DB queries go in `src/db/queries/gdpr.ts` — services never write raw Drizzle queries
- Background jobs in `src/server/jobs/` — called from API routes via `runJob()`, never directly from components
- EventBus events: `member.deletion_requested`, `member.anonymizing`, `member.anonymized`, `gdpr.export_ready` — **use underscores** (existing pattern: `member.password_reset`, `member.2fa_setup`, `member.social_account_linked`)
- **`member.anonymizing` and `member.anonymized` already exist** in `src/types/events.ts` EventMap (lines 243-244, 285-286). You must ADD `member.deletion_requested` and `gdpr.export_ready` to both `EventName` union and `EventMap` interface with corresponding event interfaces.
- RFC 7807 error format via `errorResponse()` from `@/lib/api-response` (handled in `withApiHandler`)
- Rate limiting via `withApiHandler()` `rateLimit` option (Story 1.12 pattern)
- `auth()` import from `@/server/auth/config` (NOT `@/auth` — that file does NOT exist in this project)
- Admin routes use `requireAdminSession()` from `@/lib/admin-auth.ts`
- User self-service routes use `requireAuthenticatedSession()` from `@/services/permissions.ts`
- All user-facing strings via `useTranslations()` — no hardcoded strings
- **No `schema/index.ts`**: add `import * as gdprSchema from "@/db/schema/gdpr"` directly in `src/db/index.ts`

### Library/Framework Requirements

- **`bcryptjs`** — already installed; `import bcrypt from "bcryptjs"` for password verification in `gdpr-service.ts`
- **`crypto`** — Node.js built-in; `crypto.randomUUID()` for download tokens (no import needed in Node.js, or `import { randomUUID } from "crypto"`)
- **No new npm packages needed** — all infrastructure already in place
- **`ioredis`** via `getRedisClient()` from `@/lib/redis` for cancellation token storage in Redis
- **Zod v4**: `import { z } from "zod/v4"` — use `.issues[0]` (not `.errors[0]`) for validation errors
- **shadcn/ui**: `AlertDialog` for the delete confirmation modal in settings UI
- **`next-auth/react`**: `useSession()` in client components (layout tests need `vi.mock("next-auth/react")`)

### File Structure Requirements

**New files:**

- `src/db/migrations/0009_gdpr_compliance.sql`
- `src/db/schema/gdpr.ts` (Drizzle schema for `gdprExportRequests`)
- `src/db/queries/gdpr.ts`
- `src/services/gdpr-service.ts`
- `src/services/gdpr-service.test.ts`
- `src/server/jobs/retention-cleanup.ts`
- `src/server/jobs/retention-cleanup.test.ts`
- `src/server/jobs/data-export.ts`
- `src/server/jobs/data-export.test.ts`
- `src/app/api/v1/user/account/delete/route.ts`
- `src/app/api/v1/user/account/delete/route.test.ts`
- `src/app/api/v1/user/account/cancel-deletion/route.ts`
- `src/app/api/v1/user/account/cancel-deletion/route.test.ts`
- `src/app/api/v1/user/account/export/route.ts`
- `src/app/api/v1/user/account/export/route.test.ts`
- `src/app/api/v1/user/account/export/download/[token]/route.ts`
- `src/app/api/v1/user/account/export/download/[token]/route.test.ts`
- `src/app/api/v1/admin/breach-response/affected-members/route.ts`
- `src/app/api/v1/admin/breach-response/notify/route.ts`
- `src/app/[locale]/(admin)/admin/breach-response/page.tsx`
- `src/app/[locale]/(app)/settings/account/page.tsx`
- `src/components/shared/CookieConsentBanner.tsx`
- `src/components/shared/CookieConsentBanner.test.tsx`
- `docs/gdpr-breach-runbook.md`

**Modified files:**

- `src/db/index.ts` — add `gdprSchema` import
- `src/db/schema/auth-users.ts` — add `scheduledDeletionAt` column definition
- `src/types/events.ts` — add `MemberDeletionRequestedEvent`, `GdprExportReadyEvent` interfaces + `EventName` + `EventMap` entries
- `src/server/jobs/index.ts` — register new jobs
- `src/app/[locale]/(app)/settings/layout.tsx` — add "Account" nav link
- `src/app/[locale]/layout.tsx` (or equivalent shell) — add `<CookieConsentBanner />`
- `messages/en.json` — add `cookieConsent` and `settings.account` namespaces
- `messages/ig.json` — add same namespaces (Igbo translations)
- `.env.example` — add `INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false` with legal review comment
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

**Do NOT create:**

- A separate `cookie-consent` table (cookie-in-browser is sufficient for Phase 1)
- A separate `gdpr-consent-log` table (the `authUsers` consent fields cover AC 2)
- A second email service (use existing `enqueueEmailJob()` stub)

### Testing Requirements

- `@vitest-environment node` annotation required for all server-side test files
- Client component tests (`CookieConsentBanner.test.tsx`): use `@testing-library/react` — no `@vitest-environment` header needed (defaults to jsdom)
- Mock Redis: `vi.mock("@/lib/redis", () => ({ getRedisClient: vi.fn() }))`
- Mock DB: `vi.mock("@/db", () => ({ db: { ... } }))` — provide mock `db` object
- Mock EventBus: `vi.mock("@/lib/event-bus", () => ({ eventBus: { emit: vi.fn() } }))`
- Mock email service: `vi.mock("@/services/email-service", () => ({ enqueueEmailJob: vi.fn() }))`
- Mock rate limiter for export route: `vi.mock("@/lib/rate-limiter", ...)` AND `vi.mock("@/server/auth/config", ...)`
- Test 429 body: `{ type: "about:blank", title: "Too Many Requests", status: 429 }`
- Export download: test `Content-Disposition: attachment; filename="my-data-export.json"` header
- Use `vi.clearAllMocks()` in `beforeEach`
- Co-locate tests with source (no `__tests__` directories)
- **Baseline**: 610/610 passing after Story 1.12. Expect ~20–25 new tests.
- **Pre-existing failure**: `ProfileStep.test.tsx` (1 test since Story 1.9) — do NOT investigate

### Previous Story Intelligence (1.12)

- **`auth` function location**: `@/server/auth/config` — NOT `@/auth` (doesn't exist). This caused a debug issue in Story 1.12.
- **Dynamic import for rate-limiter**: `withApiHandler` uses `await import("@/lib/rate-limiter")` internally — route tests that use `withApiHandler` with `rateLimit` option must mock `@/lib/rate-limiter`.
- **`import "server-only"` MUST be first line** in all `src/services/*.ts` files.
- **`RATE_LIMIT_PRESETS.GDPR_EXPORT`** is already defined in `src/services/rate-limiter.ts`: `{ maxRequests: 1, windowMs: 604_800_000 }` (1 request per 7 days). Use it directly.
- **`enrichHeaders()` pattern**: `withApiHandler` internally clones responses to attach rate limit headers — no need to implement this in route handlers.
- **Test fixtures**: Any mock of `AuthUser` must include `languagePreference: "en"` (added in Story 1.11).
- **Zod**: `import { z } from "zod/v4"`, validation errors at `.issues[0]` (not `.errors[0]`).
- **Hand-write migrations**: Never run `drizzle-kit generate` — it fails with `server-only` error. Next migration: **`0009`**.

### Git Intelligence Summary

- **Migration pattern**: Hand-written SQL in `src/db/migrations/NNNN_name.sql`, matching Drizzle schema defined in `src/db/schema/`. Both files must be created together.
- **Schema import pattern**: `import * as gdprSchema from "@/db/schema/gdpr"` added to `src/db/index.ts`, spread into drizzle config — no central schema/index.ts.
- **Job registration pattern**: `registerJob(name, handler)` in the job file, then import that file in `src/server/jobs/index.ts`.
- **API route pattern**: All routes export via `withApiHandler()`. Authenticated user routes start with `requireAuthenticatedSession()`. Admin routes start with `requireAdminSession()`.
- **EventBus**: `emit()` is **synchronous** (Node.js `EventEmitter` — returns `boolean`, does not return a Promise). Call `eventBus.emit("member.anonymizing", ...)` before PII scrub — in-process listeners execute synchronously. Redis publish is fire-and-forget (async but not awaited internally).

### Latest Technical Context

- **GDPR Article 17** (right to erasure): Hard anonymization is the standard approach — actual hard delete is complex due to FK constraints and data integrity. Replacing PII with "Former Member" + anonymized email satisfies the requirement while preserving non-identifying historical content.
- **GDPR Article 20** (data portability): JSON format is accepted. The download token pattern (no account needed to download) is intentional — member may already be locked out during deletion flow.
- **72-hour breach notification** (NFR-S9 / GDPR Article 33): The breach response admin page is a process enabler; the actual 72-hour clock starts from breach discovery, not system notification.
- **Cookie consent regulation**: GDPR requires that tracking/analytics cookies are opt-in. Storing consent in a `cookie-consent` browser cookie (not localStorage) is correct — it persists across tabs, survives page refresh, and is automatically sent with requests if needed server-side.
- **`crypto.randomUUID()`**: Available natively in Node.js 14.17+ and all modern browsers. No additional import needed in Node.js 18+. For Next.js server context, `import { randomUUID } from "crypto"` is the safe explicit import.
- **Bcrypt password verification**: `bcryptjs` is already installed (used in `auth-service.ts`). Use `await bcrypt.compare(plaintext, hash)`. Get the stored `passwordHash` from `authUsers` before comparing.

### Project Structure Notes

- **Settings nav**: `src/app/[locale]/(app)/settings/layout.tsx` needs an "Account" link alongside Profile, Privacy, Security.
- **Admin routes**: Check if `src/app/[locale]/(admin)/admin/` already has a route group — breach-response page goes there.
- **Cookie consent banner placement**: Add to the root locale layout (`src/app/[locale]/layout.tsx`) so it renders on both guest and authenticated pages.
- **`docs/` directory**: Already exists (created in Story 1.12 for `cloudflare-rules.md`). Add `gdpr-breach-runbook.md` there.
- **`src/features/account/` does NOT exist**: Settings pages live directly under `src/app/[locale]/(app)/settings/`. Do not create a features/account directory.
- **EventBus event names**: Use **underscores** as separator (not hyphens). Existing events: `member.password_reset`, `member.2fa_setup`, `member.social_account_linked`, `member.privacy_settings_updated`. New events for this story: `member.deletion_requested`, `gdpr.export_ready`.

### References

- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Soft delete & GDPR (lines 218-225), GDPR cross-cutting concern (line 88), security NFR (line 42)
- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.13` — Full acceptance criteria
- DB Schema: `src/db/schema/auth-users.ts` — consentGivenAt, consentIp, consentVersion, deletedAt fields
- DB Schema: `src/db/schema/community-profiles.ts` — deletedAt, CASCADE FK
- Job runner: `src/server/jobs/job-runner.ts` — registerJob, runJob, runAllDueJobs
- Email service: `src/services/email-service.ts` — enqueueEmailJob()
- Rate limiter preset: `src/services/rate-limiter.ts` — GDPR_EXPORT preset (already defined)
- API handler: `src/server/api/middleware.ts` — withApiHandler() with rateLimit option
- Permissions: `src/services/permissions.ts` — requireAuthenticatedSession()
- Admin auth: `src/lib/admin-auth.ts` — requireAdminSession()
- Audit logs: `src/db/schema/audit-logs.ts`
- Redis client: `src/lib/redis.ts` — getRedisClient()
- Story 1.12 notes: `_bmad-output/implementation-artifacts/1-12-rate-limiting-abuse-prevention.md`
- Settings pages: `src/app/[locale]/(app)/settings/` — profile, privacy, security (existing)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `vi.hoisted()` required for `mockRegisterJob` + `handlerRef` in job test files — mock factory runs before `let` declarations, causing TDZ error without hoisting.
- `z.string().uuid()` in Zod v4 validates version nibble; simplified cancel-deletion schema to `z.string().min(1)` for userId.
- `withApiHandler` only accepts `(request: Request)` — download token parsed from `request.url` pathname.

### Completion Notes List

- Implemented full GDPR compliance layer: cookie consent banner, 30-day account deletion grace period → anonymization, background data export job, admin breach response page and API.
- Migration 0009: `PENDING_DELETION`/`ANONYMIZED` enum values, `scheduled_deletion_at` column, `gdpr_export_requests` table.
- `src/services/gdpr-service.ts`: requestAccountDeletion, cancelAccountDeletion, anonymizeAccount (emit before scrub), requestDataExport.
- Events: `MemberDeletionRequestedEvent` + `GdprExportReadyEvent` added to events.ts.
- Two background jobs registered: `retention-cleanup` (daily PII anonymization) and `data-export`.
- Cookie consent banner: 3 categories, Accept All / Essential Only / Customize, 1-year cookie.
- Account settings page with AlertDialog delete confirmation + data export UI.
- i18n: `cookieConsent` + `settings.account` namespaces in both en.json and ig.json; `accountTab` key added.
- `getClientIp` in submit-application.ts updated to check `X-Client-IP` (Story 1.12 middleware header).
- 45 new tests added (610 → 655 passing). Pre-existing `ProfileStep.test.tsx` failure not investigated.

### Senior Developer Review (AI) — 2026-02-25

**Reviewer:** claude-opus-4-6
**Outcome:** Approved with fixes applied

**Issues Fixed (10):**

1. **H1** — Cancel-deletion route had no rate limiting → Added `withApiHandler` rate limit (5/15min per IP)
2. **H2** — `passwordHash` not cleared in `anonymizeAccount()` → Added `passwordHash: null` to update
3. **H3** — Breach response page used 100% hardcoded strings → Moved all strings to `Admin.breachResponse` i18n namespace in en.json/ig.json
4. **H4** — Admin breach response routes had zero test coverage → Created `affected-members/route.test.ts` (5 tests) and `notify/route.test.ts` (7 tests)
5. **H5** — `culturalConnections` and `languages` not cleared in anonymization → Added to `communityProfiles` update
6. **M1** — Export route returned non-standard RFC 7807 format for 202 → Fixed to `{ data: { requestId } }` with `application/json`
7. **M2** — Export route called `auth()` redundantly alongside `requireAuthenticatedSession()` → Removed `auth` import, rate limit key uses `x-client-ip`
8. **M4** — Export job didn't guard against missing user → Added `if (!user) throw` before building export data
9. **M5** — `notificationMessage` had no max-length → Added `.max(2000)` to Zod schema
10. **Export route test** — Fixed `body.requestId` → `body.data.requestId` to match new response format

**Test count:** 655 → 667 (+12 review fix tests)

**Not fixed (LOW — deferred):**

- L1: Redundant expiration check in download route (harmless)
- L2: `t()` import now used after H3 fix (resolved)
- L3: `.env.example` git tracking discrepancy (cosmetic)

### File List

**New files:**

- src/db/migrations/0009_gdpr_compliance.sql
- src/db/schema/gdpr.ts
- src/db/queries/gdpr.ts
- src/services/gdpr-service.ts
- src/services/gdpr-service.test.ts
- src/server/jobs/retention-cleanup.ts
- src/server/jobs/retention-cleanup.test.ts
- src/server/jobs/data-export.ts
- src/server/jobs/data-export.test.ts
- src/app/api/v1/user/account/delete/route.ts
- src/app/api/v1/user/account/delete/route.test.ts
- src/app/api/v1/user/account/cancel-deletion/route.ts
- src/app/api/v1/user/account/cancel-deletion/route.test.ts
- src/app/api/v1/user/account/export/route.ts
- src/app/api/v1/user/account/export/route.test.ts
- src/app/api/v1/user/account/export/download/[token]/route.ts
- src/app/api/v1/user/account/export/download/[token]/route.test.ts
- src/app/api/v1/admin/breach-response/affected-members/route.ts
- src/app/api/v1/admin/breach-response/affected-members/route.test.ts
- src/app/api/v1/admin/breach-response/notify/route.ts
- src/app/api/v1/admin/breach-response/notify/route.test.ts
- src/app/[locale]/(admin)/admin/breach-response/page.tsx
- src/app/[locale]/(app)/settings/account/page.tsx
- src/components/shared/CookieConsentBanner.tsx
- src/components/shared/CookieConsentBanner.test.tsx
- docs/gdpr-breach-runbook.md

**Modified files:**

- src/db/index.ts
- src/db/schema/auth-users.ts
- src/types/events.ts
- src/server/jobs/index.ts
- src/app/[locale]/(app)/settings/layout.tsx
- src/app/[locale]/layout.tsx
- messages/en.json
- messages/ig.json
- src/features/auth/actions/submit-application.ts
- .env.example
- \_bmad-output/implementation-artifacts/sprint-status.yaml
