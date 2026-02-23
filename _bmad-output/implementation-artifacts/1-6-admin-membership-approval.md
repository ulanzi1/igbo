# Story 1.6: Admin Membership Approval

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to review membership applications and approve, request more information on, or reject them,
so that the community maintains quality membership with verified cultural connections.

## Acceptance Criteria

1. **Given** an admin navigates to the admin approvals page
   **When** the page loads
   **Then** the system displays a table of pending membership applications showing: applicant name, email, location, cultural connection summary, reason for joining, referral (if any), application date, and a location discrepancy flag (comparing Cloudflare-detected country stored at application time vs. self-reported country)
   **And** the page uses the admin layout with dark sidebar navigation per UX spec

2. **Given** an admin reviews an application
   **When** they click "Approve"
   **Then** the account status transitions to `APPROVED`
   **And** the system sends a welcome email with login instructions to the applicant
   **And** the applicant appears in the member list
   **And** the system logs the action with timestamp, admin ID, and action details (NFR-S11)

3. **Given** an admin needs clarification on an application
   **When** they click "Request More Info" and enter a message
   **Then** the system sends an email to the applicant with the admin's question
   **And** the application status updates to `INFO_REQUESTED`
   **And** the admin's message is persisted to `auth_users.admin_notes`
   **And** the applicant can respond via email or a dedicated response page

4. **Given** an admin determines an application should be rejected
   **When** they click "Reject" and optionally enter a reason
   **Then** the account status transitions to `REJECTED`
   **And** the system sends a respectful notification email to the applicant
   **And** the system logs the action

5. **Given** the admin page needs to be protected
   **When** a non-admin member attempts to access `/admin/*` routes
   **Then** they are redirected to the member dashboard with no indication the admin section exists

## Tasks / Subtasks

- [ ] Task 1: Database migrations (AC: 3)
  - [ ] Add `admin_notes text` column to `auth_users` in `src/db/schema/auth-users.ts`
  - [ ] Add `role` pgEnum (`"user_role"`, values: `MEMBER | ADMIN | MODERATOR`) and `role` column (default `MEMBER`) to `auth_users`; update `src/server/seed/admin-seed.ts` to set `role: "ADMIN"` on the seeded admin account
  - [ ] Create `src/db/schema/audit-logs.ts` with `audit_logs` table: `id` (uuid PK), `actor_id` (uuid FK → auth_users.id), `action` (varchar 100), `target_user_id` (uuid nullable), `details` (jsonb), `ip_address` (varchar 45 nullable), `created_at` (timestamp with tz, defaultNow)
  - [ ] Run `drizzle-kit generate` to produce migration SQL; export new schemas from `src/db/index.ts`

- [ ] Task 2: Admin auth stub + permissions (AC: 5)
  - [ ] Create `src/lib/admin-auth.ts` with `import "server-only"`; export `requireAdminSession(request: Request): Promise<{ adminId: string }>` — reads session from request headers/cookie (stub: validate `role === "ADMIN"` from DB; Story 1.7 wires this to Auth.js `auth()`)
  - [ ] Create `src/services/permissions.ts` with `import "server-only"`; export `isAdmin(userId: string): Promise<boolean>` — queries `auth_users.role`; used by API handlers and service layer as single source of RBAC truth

- [ ] Task 3: Admin approvals UI (AC: 1)
  - [ ] Create `src/app/[locale]/(admin)/layout.tsx` — dark sidebar layout wrapping all admin routes; sidebar links: Dashboard, Approvals, Moderation, Reports, Analytics, Audit Log
  - [ ] Build approvals table using `ApplicationRow` with columns: avatar/name/email, location, location discrepancy flag, cultural connection strength/summary, status pill, action buttons
  - [ ] Queue summary card on dashboard; desktop-first UX; keyboard shortcuts A (approve) / R (reject) / M (request info) / N (next); auto-advance after action
  - [ ] Undo toast: after each action show a 30-second dismissible toast with "Undo" button; on undo, call a `DELETE /api/v1/admin/applications/[id]/action` endpoint that reverses the last transition (only if status has not changed again); if undo window lapses, toast dismisses silently
  - [ ] Add empty, loading, and error states with warm messaging and next actions
  - [ ] All strings use `useTranslations("Admin")` / `getTranslations("Admin")`

- [ ] Task 4: Admin approvals API + service layer (AC: 1-4)
  - [ ] Create REST endpoints under `/api/v1/admin/applications` for list, approve, request-info, reject (wrap each with `withApiHandler()` from `@/server/api/middleware`)
  - [ ] Add service layer `src/services/admin-approval-service.ts` with `import "server-only"`; call `requireAdminSession()` + `isAdmin()` at top of every exported function before any DB access
  - [ ] Ensure status transitions only from `PENDING_APPROVAL` → `APPROVED | INFO_REQUESTED | REJECTED`; reject all other inputs with RFC 7807 `ApiError`
  - [ ] Sanitize admin message (`admin_notes`) using `sanitizeHtml` from `@/lib/sanitize` before persisting and before passing to email payload

- [ ] Task 5: Email + notifications integration (AC: 2-4)
  - [ ] Enqueue email jobs using `enqueueEmailJob()` from `@/services/email-service` (not `registerJob`/`runJob` directly); use template IDs: `welcome-approved`, `request-info`, `rejection-notice`
  - [ ] Emit domain events via EventBus: `member.approved` (existing — reuse `MemberApprovedEvent { userId, approvedBy }`), `member.info_requested` (new), `member.rejected` (new)
  - [ ] Add `member.info_requested` and `member.rejected` to `EventName` union, `EventMap`, and corresponding interfaces in `src/types/events.ts`

- [ ] Task 6: Audit logging (AC: 2-4)
  - [ ] Create `src/services/audit-logger.ts` with `import "server-only"`; export `logAdminAction({ actorId, action, targetUserId, details, ipAddress })` — inserts into `audit_logs` via Drizzle query; never logs PII (IDs only in `details`)
  - [ ] Call `logAdminAction()` from `admin-approval-service.ts` for every approve / request-info / reject action

- [ ] Task 7: Tests
  - [ ] Component tests: approvals table renders, status pills, keyboard shortcuts fire correct handlers, auto-advance moves to next row, undo toast appears and calls undo endpoint
  - [ ] API tests: list returns paginated `PENDING_APPROVAL` rows; approve/request-info/reject enforce valid status transitions; non-admin request returns 403; audit log row created per action; `admin_notes` persisted and sanitized on request-info

## Dev Notes

### Developer Context (Read First)

This story completes the admin review workflow for membership applications created in Story 1.5. It operates on `auth_users` rows with `account_status = PENDING_APPROVAL` and transitions them to `APPROVED`, `INFO_REQUESTED`, or `REJECTED`. Admin actions must be fully audited (NFR-S11) and safe: no reliance on client-only checks, no middleware-only security, and no PII logging.

**Execution order matters — do tasks in order:**

1. Task 1 (DB migrations) first — all other tasks depend on the new columns/tables.
2. Task 2 (auth stub + permissions) second — API and service layers depend on these.
3. Tasks 3–6 can proceed in parallel after Tasks 1–2.

**Key dependencies and preconditions:**

- Story 1.1a: admin seed script at `src/server/seed/admin-seed.ts` creates the initial admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars. After Task 1 migration, update this seed to set `role: "ADMIN"` on insert (idempotent).
- Story 1.5: `auth_users` and `auth_verification_tokens` schema and application flow are complete. See `src/db/schema/auth-users.ts` and `src/db/queries/auth-queries.ts`.
- Story 1.7 (Auth.js): Full session management is not yet configured. `requireAdminSession()` is a stub — see Task 2 for the pattern.
- Admin UI is desktop-first with a dark sidebar (UX spec), keyboard shortcuts (A/R/M/N), and auto-advance queues.

### Schema Changes Required (Task 1 — Do First)

**`src/db/schema/auth-users.ts` additions:**

```typescript
export const userRoleEnum = pgEnum("user_role", ["MEMBER", "ADMIN", "MODERATOR"]);

// Add to authUsers table columns:
role: userRoleEnum("role").notNull().default("MEMBER"),
adminNotes: text("admin_notes"),  // stores admin message on INFO_REQUESTED
```

**`src/db/schema/audit-logs.ts` (new file):**

```typescript
import "server-only";
import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => authUsers.id),
  action: varchar("action", { length: 100 }).notNull(),
  targetUserId: uuid("target_user_id"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
```

Export `auditLogs` from `src/db/index.ts` alongside existing schemas.

### Admin Auth Stub Pattern (Task 2 — Do Before API Work)

Story 1.7 has not run yet — there is no Auth.js session. Use this stub pattern:

```typescript
// src/lib/admin-auth.ts
import "server-only";
import { findUserById } from "@/db/queries/auth-queries";
import { ApiError } from "@/lib/api-error";

export async function requireAdminSession(request: Request): Promise<{ adminId: string }> {
  // TODO: Story 1.7 replaces this with Auth.js auth() session extraction.
  // For now, read X-Admin-Id header (set by dev tooling/tests only; never exposed in prod middleware).
  const adminId = request.headers.get("X-Admin-Id");
  if (!adminId) throw new ApiError(401, "Unauthorized");
  const user = await findUserById(adminId);
  if (!user || user.role !== "ADMIN") throw new ApiError(403, "Forbidden");
  return { adminId };
}
```

```typescript
// src/services/permissions.ts
import "server-only";
import { findUserById } from "@/db/queries/auth-queries";

export async function isAdmin(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  return user?.role === "ADMIN";
}
```

Every API handler and service function must call `requireAdminSession()` as its very first operation.

### Event Naming — Use Existing + Add New (Task 5)

**Do NOT add `user.approved`, `user.info_requested`, or `user.rejected`.** The `events.ts` file already has `member.approved` with the correct shape. Follow the existing `member.*` namespace:

```typescript
// events.ts already has — REUSE:
// "member.approved": MemberApprovedEvent { userId: string; approvedBy: string }

// ADD these two new events:
export interface MemberInfoRequestedEvent extends BaseEvent {
  userId: string;
  requestedBy: string;
}

export interface MemberRejectedEvent extends BaseEvent {
  userId: string;
  rejectedBy: string;
  reason?: string;
}

// Add to EventName union:
| "member.info_requested"
| "member.rejected"

// Add to EventMap:
"member.info_requested": MemberInfoRequestedEvent;
"member.rejected": MemberRejectedEvent;
```

### Audit Logging Service Pattern (Task 6)

```typescript
// src/services/audit-logger.ts
import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";

interface AuditParams {
  actorId: string;
  action: "APPROVE_APPLICATION" | "REQUEST_INFO" | "REJECT_APPLICATION";
  targetUserId: string;
  details?: Record<string, unknown>; // IDs only — no PII
  ipAddress?: string;
}

export async function logAdminAction(params: AuditParams): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: params.action,
    targetUserId: params.targetUserId,
    details: params.details ?? null,
    ipAddress: params.ipAddress ?? null,
  });
}
```

Call from `admin-approval-service.ts` after each successful status transition. Never log applicant email, name, cultural connection text, or reason for joining in `details` — log IDs only.

### API Handler Pattern

`withApiHandler()` is at `@/server/api/middleware` — not `@/lib`. Every route export must be wrapped:

```typescript
import { withApiHandler } from "@/server/api/middleware";
export const GET = withApiHandler(async (request) => { ... });
export const POST = withApiHandler(async (request) => { ... });
```

Use `successResponse()` and `ApiError` from `@/lib/api-response` and `@/lib/api-error`. Return paginated list responses using offset pagination:

```json
{ "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 47 } }
```

Query params: `?page=1&pageSize=20&status=PENDING_APPROVAL`.

### Admin Message Sanitization (Task 4)

Before persisting `admin_notes` or passing to email payload, sanitize:

```typescript
import { sanitizeHtml } from "@/lib/sanitize";
const safeNotes = sanitizeHtml(rawAdminMessage);
```

`src/lib/sanitize.ts` exists and uses `sanitize-html` with an HTML whitelist (b, i, em, strong, a, p, ul, ol, li, br, blockquote, h2-h4, code, pre). Do not reimplement sanitization.

### TanStack Query Integration (UI)

The admin UI fetches data via TanStack Query calling the REST endpoints. Use this pattern:

```typescript
// src/features/admin/hooks/use-approvals.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const adminKeys = {
  applications: (status?: string) => ["admin", "applications", status] as const,
};

export function useApplications(status = "PENDING_APPROVAL") {
  return useQuery({
    queryKey: adminKeys.applications(status),
    queryFn: () => fetch(`/api/v1/admin/applications?status=${status}`).then((r) => r.json()),
  });
}

export function useApproveApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/admin/applications/${id}/approve`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.applications() }),
  });
}
```

Do NOT use `useEffect` + `fetch`. Do not call REST APIs from server components — fetch in client hooks only.

### UX Requirements (Admin Queue Processing)

- Admin dashboard uses dark sidebar layout, desktop-first. Create `src/app/[locale]/(admin)/layout.tsx` with dark sidebar component.
- Application table row: name + email + location + location discrepancy flag (⚠ if detected country ≠ self-reported country) + cultural connection strength (Strong/Unclear/Weak) + status pill + action buttons.
- Keyboard shortcuts: **A** approve, **R** reject, **M** request more info, **N** next. Attach to `keydown` on the focused `ApplicationRow` — use `aria-keyshortcuts` attribute.
- Auto-advance: after action, automatically focus the next row.
- Undo: display a 30-second dismissible toast after each action. Show "Undo" button that calls `DELETE /api/v1/admin/applications/[id]/action`. The undo endpoint reverses the last status transition only if the current status matches the action's result (e.g., only un-approve if still `APPROVED`). Undo is UI-initiated — no background timer on the server.
- Queue summary cards on the admin dashboard home page; approvals page goal: 4 applications in 10 minutes.

### Location Discrepancy Flag (AC1)

The `auth_users` table stores `location_city`, `location_state`, `location_country` as submitted by the applicant. Cloudflare geo detection was used to prefill those fields at application time (Story 1.5), but the values stored are the **submitted** values (which the user may have overridden). There is no separately stored "detected country" column — the IP-based assessment display in the admin table should show the submitted location values only, with a note that these were prefilled from IP detection. Do not attempt to re-geolocate at admin review time. Display a `(prefilled)` badge if `location_country` was set (it always is unless user cleared it).

### i18n Keys — Admin Namespace

Add an `"Admin"` namespace to `messages/en.json` and `messages/ig.json`. Minimum required keys:

```json
"Admin": {
  "approvals": {
    "title": "Membership Applications",
    "empty": "No pending applications",
    "loading": "Loading applications…",
    "approve": "Approve",
    "reject": "Reject",
    "requestInfo": "Request Info",
    "next": "Next",
    "undo": "Undo",
    "undoMessage": "Action applied. You have {seconds} seconds to undo.",
    "statusPending": "Pending",
    "statusInfoRequested": "Awaiting Info",
    "statusApproved": "Approved",
    "statusRejected": "Rejected",
    "locationPrefilled": "prefilled",
    "culturalStrengthStrong": "Strong",
    "culturalStrengthUnclear": "Unclear",
    "culturalStrengthWeak": "Weak",
    "infoMessagePlaceholder": "Enter your question for the applicant…",
    "infoMessageLabel": "Message to applicant"
  },
  "sidebar": {
    "dashboard": "Dashboard",
    "approvals": "Approvals",
    "moderation": "Moderation",
    "reports": "Reports",
    "analytics": "Analytics",
    "auditLog": "Audit Log"
  }
}
```

### Project Structure Notes

- Feature modules in `src/features/admin/*`; barrel exports via `src/features/admin/index.ts`.
- Use `@/` aliases only — no relative cross-feature imports.
- `src/services/admin-approval-service.ts` — business logic, calls `src/db/queries/admin-approvals.ts`.
- `src/services/permissions.ts` — RBAC check (created this story).
- `src/services/audit-logger.ts` — audit log write (created this story).
- `src/lib/admin-auth.ts` — session extraction stub (created this story, replaced in Story 1.7).
- `src/db/schema/audit-logs.ts` — new schema (created this story).
- `src/app/api/v1/admin/applications/*` — REST route handlers.
- `src/app/[locale]/(admin)/admin/approvals/page.tsx` — approvals page (URL: `/admin/approvals`).

### Test Patterns

Reuse the established mock patterns from Story 1.5:

```typescript
vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "en",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string) => (key: string) => `${ns}.${key}`,
  setRequestLocale: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));
```

Mock `requireAdminSession` and `isAdmin` for API tests. Mock `logAdminAction` to verify it is called with correct params. 316 tests currently passing — new tests must not break existing setup.

### References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.6`
- Architecture: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`, `#API & Communication Patterns`, `#Component Boundaries`
- UX: `_bmad-output/planning-artifacts/ux-design-specification.md#Journey 8: Admin Queue Processing`, `#Admin Components`
- Project Context: `_bmad-output/project-context.md`
- Previous Story: `_bmad-output/implementation-artifacts/1-5-membership-application-email-verification.md`

### Previous Story Intelligence (Story 1.5)

- Applications are created in `auth_users` with statuses: `PENDING_EMAIL_VERIFICATION` then `PENDING_APPROVAL` after verification.
- Email enqueueing pattern: use `enqueueEmailJob(name, payload)` from `@/services/email-service` — do NOT call `registerJob`/`runJob` directly. This was refactored in Story 1.5 code review.
- `auth_users` schema: PK is `id` (uuid), includes `email_verified` timestamp, soft-delete `deleted_at`. All queries must include `.where(isNull(authUsers.deletedAt))`.
- All queries are in `src/db/queries/auth-queries.ts`. Add admin-specific queries to `src/db/queries/admin-approvals.ts`.
- EventBus events already defined: `user.applied`, `user.email_verified`, `member.approved` (already in EventMap — reuse for approve action).

### Git Intelligence Summary

- Recent commits focused on guest routing and locale handling. Admin routes follow the same locale-aware patterns (`/en/admin/approvals`) and use next-intl utilities.
- `src/middleware.ts` exists for i18n + guest protection. **Do not rely on it for admin security** — enforce admin access in API handlers and service layer.

### Technical Guardrails (Non-Negotiable)

- **RBAC:** Call `requireAdminSession()` + `isAdmin()` at the top of every API handler and every service function — before any DB read.
- **Status transitions:** Only `PENDING_APPROVAL` → `APPROVED | INFO_REQUESTED | REJECTED`. All other transitions return `ApiError(409, "Invalid status transition")`.
- **Email:** Use `enqueueEmailJob()` only. Never `await emailService.send()` inline.
- **Audit logging:** Every approve/request-info/reject writes to `audit_logs` via `logAdminAction()`. No exceptions.
- **No PII in logs or audit details:** IDs only. Never log `email`, `name`, `culturalConnection`, `reasonForJoining`, or `adminNotes` text.
- **Sanitize admin input:** All `admin_notes` content through `sanitizeHtml()` before persistence and email payload.
- **Soft-delete filter:** All `auth_users` queries include `.where(isNull(authUsers.deletedAt))`.
- **No `any`**, no `console.log`, no inline SQL, no `useEffect + fetch`, no hardcoded UI strings.
- **`import "server-only"`** as first import in all server-side files.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- None.

### Completion Notes List

- Story context built from epics, architecture, UX, and project-context rules.
- Guardrails include admin RBAC enforcement, audit logging, and queued email notifications.

### File List

- `src/db/schema/audit-logs.ts` (new)
- `src/db/schema/auth-users.ts` (modified — add `role` enum + column, `admin_notes` column)
- `src/db/migrations/0003_admin_role_audit_logs.sql` (new, generated by drizzle-kit)
- `src/db/index.ts` (modified — export auditLogs schema)
- `src/db/queries/admin-approvals.ts` (new)
- `src/lib/admin-auth.ts` (new)
- `src/services/permissions.ts` (new)
- `src/services/audit-logger.ts` (new)
- `src/services/admin-approval-service.ts` (new)
- `src/server/seed/admin-seed.ts` (modified — set role: "ADMIN")
- `src/app/[locale]/(admin)/layout.tsx` (new — dark sidebar admin layout)
- `src/app/[locale]/(admin)/admin/approvals/page.tsx` (new)
- `src/app/[locale]/(admin)/admin/approvals/loading.tsx` (new)
- `src/app/[locale]/(admin)/admin/approvals/error.tsx` (new)
- `src/app/api/v1/admin/applications/route.ts` (new)
- `src/app/api/v1/admin/applications/[id]/approve/route.ts` (new)
- `src/app/api/v1/admin/applications/[id]/request-info/route.ts` (new)
- `src/app/api/v1/admin/applications/[id]/reject/route.ts` (new)
- `src/app/api/v1/admin/applications/[id]/action/route.ts` (new — DELETE, undo endpoint)
- `src/features/admin/components/ApplicationRow.tsx` (new)
- `src/features/admin/components/ApprovalsTable.tsx` (new)
- `src/features/admin/components/QueueSummaryCard.tsx` (new)
- `src/features/admin/hooks/use-approvals.ts` (new)
- `src/features/admin/index.ts` (new)
- `src/types/events.ts` (modified — add `member.info_requested`, `member.rejected`)
- `messages/en.json` (modified — add Admin namespace)
- `messages/ig.json` (modified — add Admin namespace)
- `src/features/admin/components/ApplicationRow.test.tsx` (new)
- `src/features/admin/components/ApprovalsTable.test.tsx` (new)
- `src/app/api/v1/admin/applications/route.test.ts` (new)
- `src/app/api/v1/admin/applications/[id]/approve/route.test.ts` (new)
- `src/app/api/v1/admin/applications/[id]/request-info/route.test.ts` (new)
- `src/app/api/v1/admin/applications/[id]/reject/route.test.ts` (new)
