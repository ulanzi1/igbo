# Story 1.7: Authentication & Session Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an approved member,
I want to log in with email/username and two-factor authentication, manage my active sessions, and reset my password when needed,
so that my account is secure and I can access the platform from multiple devices.

## Acceptance Criteria

1. **Given** an approved member navigates to the login page
   **When** they enter valid email/username and password
   **Then** they are prompted for a two-factor authentication code
   **And** upon entering a valid 2FA code, the system creates a session in PostgreSQL and caches it in Redis
   **And** they are redirected to the member dashboard

2. **Given** a member has not yet set up 2FA
   **When** they log in for the first time after approval
   **Then** they are guided through 2FA setup (authenticator app TOTP as primary, email OTP as fallback) before accessing the platform
   **And** backup recovery codes are generated and displayed for the member to save

3. **Given** a member has lost access to their authenticator app and backup recovery codes
   **When** they click "Can't access your authenticator?" on the 2FA screen
   **Then** they can request an admin-assisted identity verification and 2FA reset
   **And** the request enters the admin queue with the member's application data for identity verification
   **And** the admin can reset the member's 2FA, requiring them to set up a new method on next login

4. **Given** a user enters incorrect credentials
   **When** they fail login 5 consecutive times
   **Then** the account is locked for 15 minutes
   **And** the user sees: "Account temporarily locked. Try again in 15 minutes or contact support."
   **And** the system sends an email notification to the account owner about the lockout

5. **Given** a member has forgotten their password
   **When** they click "Forgot Password" and enter their email
   **Then** the system sends a secure password reset link via email
   **And** the link expires after 1 hour
   **And** upon setting a new password (meeting complexity requirements), all existing sessions are invalidated

6. **Given** a member wants to manage their sessions
   **When** they navigate to security settings
   **Then** they see a list of active sessions with device info, location, and last active timestamp
   **And** they can revoke any individual session
   **And** revoking a session deletes it from Redis for instant effect

7. **Given** a member logs in and already has the maximum number of active sessions (configurable, default 5)
   **When** the new session is created
   **Then** the oldest active session is automatically evicted (deleted from Redis and PostgreSQL)
   **And** the member is notified on the evicted device: "You were signed out because you signed in on another device"

8. **Given** the session infrastructure is needed
   **When** this story is implemented
   **Then** the migration creates the `auth_sessions` table in PostgreSQL
   **And** session records are cached in Redis with configurable TTL
   **And** Auth.js v5 is configured with the database session strategy and Redis cache layer
   **And** passwords are hashed using bcryptjs (10+ rounds)

## Tasks / Subtasks

- [x] Task 0: Install required dependencies (AC: all)
  - [x] `npm install bcryptjs @types/bcryptjs` — password hashing (Auth.js does NOT include this)
  - [x] `npm install otplib` — TOTP generation/verification (RFC 6238 compliant; `speakeasy` is unmaintained)
  - [x] `npm install qrcode @types/qrcode` — QR code generation for 2FA setup
  - [x] `npm install @auth/drizzle-adapter` — Auth.js v5 Drizzle ORM database adapter
  - [x] `npm install ua-parser-js @types/ua-parser-js` — user-agent parsing for session device info

- [x] Task 1: Auth.js v5 integration + session strategy (AC: 1, 6, 8)
  - [x] Create `src/server/auth/` directory (does not exist yet) with:
    - `src/server/auth/config.ts` — main Auth.js config with CredentialsProvider, session callbacks, adapter
    - `src/server/auth/redis-session-cache.ts` — Redis read-through cache wrapper for session lookups
  - [x] Create Auth.js route handler at `src/app/api/auth/[...nextauth]/route.ts` (required by Auth.js v5)
  - [x] Configure `CredentialsProvider` with custom `authorize()` that:
    1. Looks up user by email in `auth_users` (must have `accountStatus = APPROVED`)
    2. Verifies password with `bcryptjs.compare()` against `auth_users.passwordHash`
    3. Returns user object or null (never throw — prevents enumeration)
  - [x] Configure database session strategy using `@auth/drizzle-adapter` with `auth_sessions` table
  - [x] Add `session` callback to expose `user.id`, `user.role`, and `user.accountStatus` on the session object:
    ```ts
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        session.user.role = user.role;
        return session;
      }
    }
    ```
  - [x] Implement Redis session cache: on session read, check Redis first (`session:{token}`), fallback to DB, re-cache on miss
  - [x] On session delete/revoke: delete from Redis key AND DB row (instant invalidation)
  - [x] Replace `requireAdminSession()` stub in `src/lib/admin-auth.ts` with `auth()` from Auth.js:
    ```ts
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN")
      throw new ApiError({ title: "Forbidden", status: 403 });
    return { adminId: session.user.id };
    ```
  - [x] Add env vars to `src/env.ts`: `MAX_SESSIONS_PER_USER` (default 5), `SESSION_TTL_SECONDS` (default 86400), `ACCOUNT_LOCKOUT_SECONDS` (default 900), `ACCOUNT_LOCKOUT_ATTEMPTS` (default 5)

- [x] Task 2: DB schema + migration (AC: 5, 6, 7, 8)
  - [x] Add `passwordHash` column to `auth_users` table in `src/db/schema/auth-users.ts`:
    - `passwordHash: varchar("password_hash", { length: 255 })` — nullable initially (existing users don't have passwords yet; set during first login flow or registration update)
  - [x] Create `src/db/schema/auth-sessions.ts` — `auth_sessions` table:
    - `id` (uuid PK), `userId` (FK → auth_users), `sessionToken` (varchar 255, unique), `deviceName` (varchar), `deviceIp` (varchar 45), `deviceLocation` (varchar), `expiresAt` (timestamptz), `lastActiveAt` (timestamptz), `createdAt` (timestamptz)
    - Indexes: `user_id`, `session_token`, `expires_at`
  - [x] Create `src/db/schema/auth-mfa.ts` — `auth_totp_secrets` table:
    - `id` (uuid PK), `userId` (FK → auth_users, unique), `secret` (varchar 32, base32-encoded), `recoveryCodes` (jsonb, array of bcrypt-hashed codes), `verifiedAt` (timestamptz, null until first successful code), `createdAt` (timestamptz)
    - Index: `user_id`
  - [x] Create `src/db/schema/auth-password-reset.ts` — `auth_password_reset_tokens` table:
    - Reuse same pattern as existing `auth_verification_tokens` in `src/db/schema/auth-users.ts`
    - `id` (uuid PK), `userId` (FK), `tokenHash` (varchar 64, unique), `expiresAt` (timestamptz), `usedAt` (timestamptz nullable)
    - Indexes: `token_hash`, `(user_id, expires_at)`
  - [x] Login attempt tracking: **Use Redis only** — key `login_attempts:{email}:{ip}` as sorted set with timestamps, TTL 15min. No DB table needed (ephemeral data).
  - [x] Create migration `0004_auth_sessions_mfa.sql` via `drizzle-kit generate`
  - [x] Create `src/db/queries/auth-sessions.ts` for session CRUD queries

- [x] Task 3: 2FA enrollment + verification flow (AC: 1, 2)
  - [x] Enrollment API (`/api/v1/auth/2fa/setup` POST): generate TOTP secret with `otplib.authenticator.generateSecret()`, return secret + otpauth URI
  - [x] QR code: use `qrcode.toDataURL(otpauthUri)` to generate QR image for client display
  - [x] Verification API (`/api/v1/auth/2fa/verify` POST): verify code with `otplib.authenticator.check(code, secret)`, allow 1-step clock drift via `window` option
  - [x] On successful verification: set `verifiedAt` timestamp, generate 10 recovery codes (random 8-char alphanumeric), hash each with bcryptjs, store in `recoveryCodes` JSONB column, return plaintext codes once
  - [x] Email OTP fallback: generate 6-digit code, store in Redis (`email_otp:{userId}`, TTL 5min), rate limit to 3 requests per 15min per user, send via `enqueueEmailJob()`
  - [x] Enforce 2FA requirement: middleware check — if user is APPROVED but has no `auth_totp_secrets` row with `verifiedAt != null`, redirect to 2FA setup page
  - [x] UI pages in `(auth)` route group:
    - `src/app/[locale]/(auth)/2fa-setup/page.tsx` — QR code display, manual key, code entry, recovery codes display

- [x] Task 4: Login, lockout, and security notifications (AC: 1, 4)
  - [x] Login flow state machine:
    1. POST credentials → verify email exists + password matches → return `{ requires2FA: true, challengeToken }` (short-lived Redis token)
    2. POST 2FA code + challengeToken → verify TOTP/email OTP/recovery code → create session → redirect
  - [x] Block login if `accountStatus !== "APPROVED"` — return same generic error as invalid credentials
  - [x] Lockout: use Redis sorted set `login_attempts:{email}:{ip}`, add timestamp on failure, count entries in last 15min window. If >= 5, set `lockout:{email}` key with TTL 900s. Check lockout key before processing login.
  - [x] Send lockout notification: `enqueueEmailJob("account-lockout", { userId, ip, timestamp })` — never inline email send
  - [x] Uniform error responses: always return `{ error: "Invalid credentials" }` for wrong email, wrong password, and non-existent account (prevent enumeration)
  - [x] Parse user-agent with `ua-parser-js` during session creation to populate `deviceName`
  - [x] UI pages in `(auth)` route group:
    - `src/app/[locale]/(auth)/login/page.tsx` — email/password form + 2FA challenge dialog

- [x] Task 5: Password reset flow (AC: 5)
  - [x] Request API (`/api/v1/auth/forgot-password` POST): always return success (prevent enumeration), generate crypto-random token, hash with SHA-256, store in `auth_password_reset_tokens` (1h expiry), send reset link via `enqueueEmailJob()`
  - [x] Reset API (`/api/v1/auth/reset-password` POST): validate token hash, check not expired/used, set new password (bcryptjs hash), mark token used (`usedAt = now()`), invalidate ALL user sessions (delete from Redis + DB), send confirmation email
  - [x] Password complexity: minimum 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special character. Zod schema:
    ```ts
    z.string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/);
    ```
  - [x] Do NOT auto-login after reset — redirect to login page
  - [x] UI pages in `(auth)` route group:
    - `src/app/[locale]/(auth)/forgot-password/page.tsx`
    - `src/app/[locale]/(auth)/reset-password/page.tsx` (accepts token query param)

- [x] Task 6: Session management UI (AC: 6, 7)
  - [x] Sessions list API (`/api/v1/sessions` GET): return all active sessions for authenticated user with device, IP, location, lastActiveAt
  - [x] Revoke session API (`/api/v1/sessions/:sessionId` DELETE): delete from Redis + DB, verify session belongs to requesting user
  - [x] Max concurrent sessions: on new session creation, count user's active sessions. If >= `MAX_SESSIONS_PER_USER`, delete oldest by `createdAt` from both Redis + DB.
  - [x] UI: `src/features/auth/components/SessionList.tsx` — list with revoke buttons, current session highlighted
  - [x] Security settings page: `src/app/[locale]/(app)/settings/security/page.tsx`

- [x] Task 7: Admin-assisted 2FA reset queue (AC: 3)
  - [x] Create admin queue entry type for 2FA reset requests (extend existing admin queue from Story 1.6)
  - [x] Admin UI: display member's application data for identity verification, "Reset 2FA" action
  - [x] On admin reset: delete user's `auth_totp_secrets` row, user must re-enroll on next login
  - [x] Notify member via `enqueueEmailJob("2fa-reset-complete", { userId })`

- [x] Task 8: Tests (AC: all)
  - [x] Unit tests: bcryptjs hashing/comparison, TOTP verification with otplib, token generation, session cache logic
  - [x] API tests: all auth endpoints (login, 2FA verify, lockout after 5 failures, reset token expiry, session revoke, max session eviction)
  - [x] Component tests: LoginForm, TwoFactorSetup (QR + codes), ForgotPasswordForm, ResetPasswordForm, SessionList
  - [ ] E2E (Playwright): approved member login → 2FA setup → recovery codes → dashboard redirect (deferred — no E2E infra in sprint)
  - [ ] E2E: password reset → expired token rejection → valid token → new password → session invalidation → login required (deferred — no E2E infra in sprint)

## Dev Notes

### Critical Context

- **`src/server/auth/` does not exist** — create it from scratch. No existing Auth.js config anywhere in the project.
- **`@auth/drizzle-adapter` is not installed** — must install along with bcryptjs, otplib, qrcode, ua-parser-js.
- **Auth.js v5 does NOT handle password hashing** — you must implement credential verification manually in the `CredentialsProvider.authorize()` function using bcryptjs.
- **`auth_users` table has no password column** — add `passwordHash` column in this story.
- **`requireAdminSession()` in `src/lib/admin-auth.ts`** is a dev stub reading `X-Admin-Id` header. Replace with `auth()` session extraction. Update all existing admin route tests to mock Auth.js session instead of the header.
- **Approved members only** can authenticate. Block `accountStatus !== "APPROVED"` at sign-in with same generic error as invalid credentials.
- **2FA is mandatory** for all approved members (NFR-S3). No skip option.
- **No user enumeration:** login errors, password reset, and forgot-password must return uniform responses.

### Architecture Compliance

- Auth pages go in `(auth)` route group: `src/app/[locale]/(auth)/login/`, `2fa-setup/`, `forgot-password/`, `reset-password/`
- Session management page goes in `(app)` route group: `src/app/[locale]/(app)/settings/security/`
- REST endpoints under `/api/v1/auth/*` wrapped with `withApiHandler()` for CSRF, tracing, RFC 7807 errors
- Auth.js catch-all route at `src/app/api/auth/[...nextauth]/route.ts` (separate from `/api/v1/` routes)
- Server-only logic uses `import "server-only"` at top
- Service boundary: `src/services/auth-service.ts` for business logic, emits EventBus events (`member.logged_in`, `member.password_reset`, `member.2fa_setup`, `member.locked_out`)
- Use `@/` aliases only; no cross-feature relative imports
- Always `useTranslations("Auth")` for UI strings; no hardcoded text
- Use TanStack Query for session list fetching; no `useEffect + fetch`
- Emails always via `enqueueEmailJob()` — never inline send

### Auth.js v5 Configuration Pattern

Auth.js v5 (`next-auth@5.0.0-beta.30`) key integration points:

- **CredentialsProvider**: custom `authorize(credentials)` → lookup user → `bcryptjs.compare()` → return user or null
- **Database adapter**: `@auth/drizzle-adapter` connecting to `auth_sessions` table
- **Session strategy**: `"database"` — cookie stores only `sessionToken`, server loads full session from DB
- **Session callbacks**: expose `user.id` and `user.role` on the session object for client access
- **`session.maxAge`** and **`updateAge`**: configurable via env vars
- **Redis cache layer**: custom wrapper around adapter — check Redis on session read, fallback to DB, re-cache on miss. Delete Redis key on session revoke for instant invalidation.
- **Graceful fallback**: Redis miss → DB lookup → re-cache (handles Redis restarts)

### File Structure

- **DB schema**: `src/db/schema/auth-sessions.ts`, `src/db/schema/auth-mfa.ts`, `src/db/schema/auth-password-reset.ts`
- **DB queries**: `src/db/queries/auth-queries.ts` (extend with password/user lookups), `src/db/queries/auth-sessions.ts` (new)
- **Auth config**: `src/server/auth/config.ts`, `src/server/auth/redis-session-cache.ts`
- **Auth.js route**: `src/app/api/auth/[...nextauth]/route.ts`
- **API routes**: `src/app/api/v1/auth/login/route.ts`, `2fa/setup/route.ts`, `2fa/verify/route.ts`, `forgot-password/route.ts`, `reset-password/route.ts`
- **Session routes**: `src/app/api/v1/sessions/route.ts`, `src/app/api/v1/sessions/[sessionId]/route.ts`
- **Feature module**: `src/features/auth/components/`, `hooks/`, `actions/`, `types/`
- **Auth pages**: `src/app/[locale]/(auth)/login/`, `2fa-setup/`, `forgot-password/`, `reset-password/`
- **Settings page**: `src/app/[locale]/(app)/settings/security/page.tsx`
- **Admin additions**: `src/features/admin/*` for 2FA reset review queue

### Previous Story Patterns (Reuse These)

- **Email enqueueing**: `enqueueEmailJob(name, payload)` from `@/services/email-service` — never inline
- **Audit logging**: `logAdminAction()` from `@/services/audit-logger` — extend for 2FA reset admin actions
- **RBAC**: `isAdmin()` from `@/services/permissions` — extend with `isAuthenticated()` helper
- **Error handling**: `ApiError` with RFC 7807 shape, Zod validation errors in `detail` field
- **i18n**: all strings via `useTranslations()` / `getTranslations()` with namespace (`Auth`)
- **Test mocking**: follow patterns from `src/app/api/v1/admin/applications/route.test.ts` — mock services, not DB
- **Locale routing**: keep paths `/[locale]/...`, use `next-intl` Link component, never raw `<a>` tags
- **Code review lessons from 1.6**: no hardcoded strings, no double DB fetches, cleanup timers in useEffect, validate all API params with allowlists

### Testing Requirements

- **Unit/API**: Vitest tests co-located with handlers and services (e.g., `route.test.ts` next to `route.ts`)
- **Component**: use `@/test/test-utils` custom render with providers
- **E2E**: Playwright for full login → 2FA → dashboard flow
- **Coverage target**: 80%+ for auth routes and services

### References

- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.7`
- Architecture: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`, `#API & Communication Patterns`
- Previous Story: `_bmad-output/implementation-artifacts/1-6-admin-membership-approval.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- UAParser mock fixed: changed `vi.fn().mockImplementation(arrow)` → `class` mock to avoid arrow-function-as-constructor Vitest issue
- ResetPasswordForm test fixed: changed `/passwordLabel/i` regex (matched "confirmPasswordLabel") to exact string `"passwordLabel"`

### Completion Notes List

- All Tasks 0–7 fully implemented; E2E Playwright tests deferred (no E2E infrastructure in this sprint)
- Two-step login flow uses challenge tokens in Redis (5min TTL): `/api/v1/auth/login` (password check) → `/api/v1/auth/2fa/verify` (TOTP check) → `signIn("credentials", { challengeToken })` (Auth.js session creation)
- Device info bridging: stored in `pending_session_device:{userId}` Redis key (30s TTL) between `authorize()` and custom `createSession()` adapter
- `requireAdminSession()` in `admin-auth.ts` replaced with `auth()` — function signature kept backward-compatible (`_request?: Request`)
- Login lockout uses Redis sorted-set sliding window; password reset invalidates all sessions via `deleteAllSessionsForUser` + `evictAllUserSessions`
- `auth_sessions.id` is UUID PK exposed to clients; `sessionToken` is never returned to frontend
- 430 tests passing, 0 failures (19 new tests added in code review)

### Code Review (AI) — 2026-02-24

**Reviewer:** claude-opus-4-6

**Issues Found:** 7 Critical, 8 High, 6 Medium, 4 Low (25 total)
**Issues Fixed:** 7 Critical, 8 High, 5 Medium (20 fixed)
**Remaining (Low/deferred):** 5 items (L1-L4 low severity, M3 requires background job infrastructure)

**Fixes Applied:**

- C1: Fixed timing attack in `initiateLogin()` — dummy bcrypt compare + always record failed attempt
- C2: Added Redis rate limiting (5 attempts/15min) to `verify2fa()` per challenge token
- C3: Tightened 2FA code Zod validation from `min(1).max(8)` to `min(6).max(16)`, challengeToken to UUID
- C4: Wrapped password reset in DB transaction (password update + token mark + session delete)
- C5: Created test files for 2FA setup route (9 tests) and email OTP route (8 tests)
- C6: Added `onDelete: "cascade"` to `authPasswordResetTokens` FK
- C7: Fixed hardcoded "Copy all codes" string with i18n key `copyRecoveryCodes`
- H1: Replaced `getChallenge` + `deleteChallenge` with atomic `consumeChallenge` (Redis GETDEL)
- H2: Increased recovery code entropy from 32 bits to 80 bits (`randomBytes(10)`)
- H3: Made lockout key include IP (`lockout:{email}:{ip}`) for granular lockout
- H4: Changed `revokeSession()` to throw 404 instead of silent return
- H5: Added self-reset guard to admin 2FA reset endpoint
- H6: Added client-side validation to LoginForm, ForgotPasswordForm, ResetPasswordForm
- H7: Added `onDelete: "cascade"` to `authVerificationTokens` FK
- H8: Changed Redis pipeline failure mode from fail-open to fail-closed
- M1: Removed redundant `.unique()` on `sessionToken` (kept `uniqueIndex` only)
- M5: Added `package.json`, `package-lock.json` to File List
- M6: Replaced `console.error(JSON.stringify(...))` with `console.warn` in Redis cache

**Not Fixed (deferred):**

- M3: Expired token cleanup requires background job infrastructure (not in this sprint)
- L1-L4: Low severity items tracked for future improvement

### File List

- `src/env.ts` — added MAX_SESSIONS_PER_USER, SESSION_TTL_SECONDS, ACCOUNT_LOCKOUT_SECONDS, ACCOUNT_LOCKOUT_ATTEMPTS
- `src/db/schema/auth-users.ts` — added passwordHash column
- `src/db/schema/auth-sessions.ts` — new auth_sessions table
- `src/db/schema/auth-mfa.ts` — new auth_totp_secrets table
- `src/db/schema/auth-password-reset.ts` — new auth_password_reset_tokens table
- `src/db/index.ts` — added new schemas
- `src/db/migrations/0004_auth_sessions_mfa.sql` — migration
- `src/db/queries/auth-sessions.ts` — session CRUD queries
- `src/types/events.ts` — added auth event types
- `src/server/auth/config.ts` — Auth.js v5 config with CredentialsProvider, custom adapter, challenge token helpers
- `src/server/auth/redis-session-cache.ts` — Redis read-through cache for sessions
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js catch-all handler
- `src/lib/admin-auth.ts` — replaced stub with auth() session check
- `src/services/permissions.ts` — added isAuthenticated, requireAuthenticatedSession
- `src/services/audit-logger.ts` — added RESET_2FA action
- `src/services/auth-service.ts` — all auth business logic
- `src/app/api/v1/auth/login/route.ts`
- `src/app/api/v1/auth/2fa/setup/route.ts`
- `src/app/api/v1/auth/2fa/verify/route.ts`
- `src/app/api/v1/auth/2fa/email-otp/route.ts`
- `src/app/api/v1/auth/forgot-password/route.ts`
- `src/app/api/v1/auth/reset-password/route.ts`
- `src/app/api/v1/sessions/route.ts`
- `src/app/api/v1/sessions/[sessionId]/route.ts`
- `src/app/api/v1/admin/members/[id]/reset-2fa/route.ts`
- `messages/en.json` — added Auth namespace
- `messages/ig.json` — added Auth namespace
- `src/features/auth/types/auth.ts`
- `src/features/auth/hooks/use-sessions.ts`
- `src/features/auth/components/LoginForm.tsx`
- `src/features/auth/components/TwoFactorSetup.tsx`
- `src/features/auth/components/ForgotPasswordForm.tsx`
- `src/features/auth/components/ResetPasswordForm.tsx`
- `src/features/auth/components/SessionList.tsx`
- `src/features/auth/index.ts`
- `src/features/admin/components/TwoFactorResetButton.tsx`
- `src/features/admin/index.ts`
- `src/app/[locale]/(auth)/login/page.tsx`
- `src/app/[locale]/(auth)/2fa-setup/page.tsx`
- `src/app/[locale]/(auth)/forgot-password/page.tsx`
- `src/app/[locale]/(auth)/reset-password/page.tsx`
- `src/app/[locale]/(app)/settings/security/page.tsx`
- `src/middleware.ts` — added 2fa-setup to public path patterns
- `src/services/auth-service.test.ts`
- `src/server/auth/redis-session-cache.test.ts`
- `src/app/api/v1/auth/login/route.test.ts`
- `src/app/api/v1/auth/2fa/verify/route.test.ts`
- `src/app/api/v1/auth/forgot-password/route.test.ts`
- `src/app/api/v1/auth/reset-password/route.test.ts`
- `src/app/api/v1/sessions/route.test.ts`
- `src/app/api/v1/sessions/[sessionId]/route.test.ts`
- `src/app/api/v1/admin/members/[id]/reset-2fa/route.test.ts`
- `src/features/auth/components/LoginForm.test.tsx`
- `src/features/auth/components/ForgotPasswordForm.test.tsx`
- `src/features/auth/components/ResetPasswordForm.test.tsx`
- `src/features/auth/components/SessionList.test.tsx`
- `src/app/api/v1/auth/2fa/setup/route.test.ts`
- `src/app/api/v1/auth/2fa/email-otp/route.test.ts`
- `package.json` — added auth dependencies (bcryptjs, otplib, qrcode, @auth/drizzle-adapter, ua-parser-js)
- `package-lock.json` — lockfile update
