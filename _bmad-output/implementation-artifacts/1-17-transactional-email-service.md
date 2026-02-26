# Story 1.17: Transactional Email Service

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a basic transactional email service available from day one,
so that membership application, authentication, and onboarding flows can send emails without waiting for the full notification system in Epic 9.

## Acceptance Criteria

### AC1: Provider-Agnostic Email Service Interface

- **Given** the email service is implemented at `src/services/email-service.ts`
- **When** `emailService.send(payload)` is called
- **Then** the email is sent via the Resend provider (configured via `EMAIL_PROVIDER` env var, defaults to `"resend"`)
- **And** the `EmailPayload` interface gains an optional `locale?: 'en' | 'ig'` field (backward-compatible — all existing callers continue to work unchanged)
- **And** when `ENABLE_EMAIL_SENDING=false`, `emailService.send()` logs the payload summary and returns without sending (for dev/staging environments)

### AC2: Branded HTML Email Template Foundation

- **Given** email templates are defined at `src/templates/email/`
- **When** `renderTemplate(templateId, data, locale)` is called
- **Then** it returns `{ subject: string; html: string; text: string }` with OBIGBO branding:
  - Text-based OBIGBO header (no external images — email clients block them)
  - Brand colors: warm orange `#D4631F` header accent, white body, warm grey footer `#F5F0EB`
  - Footer with platform name, © year, and "Unsubscribe" placeholder link
  - Responsive inline styles (email-safe CSS, no external stylesheets, max-width 600px)

### AC3: All 15 Transactional Email Templates Implemented

- **Given** existing code already calls `enqueueEmailJob(name, { to, subject, templateId, data })` for 15 distinct template IDs
- **When** the email service renders a template
- **Then** each template produces a valid `{ subject, html, text }` in both English (`locale='en'`) and Igbo (`locale='ig'`):
  1. `email-verification` — data: `{ name, verifyUrl }`
  2. `application-received` — data: `{ name }`
  3. `welcome-approved` — data: `{ name }`
  4. `request-info` — data: `{ name, message }`
  5. `rejection-notice` — data: `{ name }`
  6. `member-welcome` — data: `{ name }`
  7. `account-lockout` — data: `{ name, ip, lockoutMinutes }`
  8. `email-otp` — data: `{ name, otp, expiresMinutes? }`
  9. `password-reset` — data: `{ name, resetUrl }`
  10. `password-reset-confirmation` — data: `{ name }`
  11. `session-evicted` — data: `{ name }`
  12. `2fa-reset-complete` — data: `{ name }`
  13. `gdpr-account-deletion` — data: `{ name, scheduledDeletionAt, cancellationToken }`
  14. `gdpr-export-ready` — data: `{ name, downloadToken, expiresAt }`
  15. `gdpr-breach-notification` — data: `{ name, incidentTimestamp, notificationMessage }`
- **And** if `templateId` is not in the registry, `renderTemplate()` throws `Error("Unknown email template: ${templateId}")`

### AC4: Async Email Sending via Job Runner (Unchanged Interface)

- **Given** `enqueueEmailJob(name, payload)` is the public interface used by all callers
- **When** the job executes
- **Then** the email is sent via `emailService.send()` asynchronously (non-blocking)
- **And** the job runner's existing retry mechanism (3 retries, exponential backoff at 1s base) handles transient Resend failures
- **And** the `enqueueEmailJob()` function signature does NOT change — all existing callers in auth-service, gdpr-service, admin-approval-service, onboarding-service, etc. work without modification

### AC5: Email Logging Without PII

- **Given** an email send is attempted
- **When** the send succeeds or fails
- **Then** structured JSON log entries are emitted with: `{ level, message: "email.send.*", templateId, toHash: SHA-256(to), locale, resendId?, error? }`
- **And** the full `to` email address is NEVER logged (only SHA-256 hash for correlation/debugging)
- **And** email body content is NEVER logged

### AC6: Environment Variables

- **Given** new env vars are added to `src/env.ts` (server-side section)
- **When** the app starts with missing/invalid values
- **Then** T3 Env Zod validation fails at build time (not runtime)
- **And** the following vars are defined:
  - `EMAIL_PROVIDER: z.enum(["resend"]).default("resend")`
  - `RESEND_API_KEY: z.string().optional()` (optional at definition level; throws at send time if `ENABLE_EMAIL_SENDING=true` and key absent)
  - `EMAIL_FROM_ADDRESS: z.string().email().default("noreply@obigbo.app")`
  - `EMAIL_FROM_NAME: z.string().default("OBIGBO")`
  - `ENABLE_EMAIL_SENDING: z.string().optional().default("true")` (must use `.optional()` before `.default()` — same pattern as `ENABLE_CLAMAV`)
- **And** `.env.example` is updated with a documented `# Email Service (Story 1.17)` section

### AC7: Onboarding Completion Subscriber Registered

- **Given** `registerOnboardingCompletionSubscriber()` in `src/services/onboarding-service.ts` is implemented but currently not called anywhere
- **When** the job runner initializes
- **Then** the subscriber is registered so `member.onboarding_completed` events trigger welcome emails
- **And** the call is added to `src/server/jobs/index.ts` alongside other job initializations

## Tasks / Subtasks

### Task 1: Environment Variables & Package (AC: #6)

- [x] 1.1 Install `resend` package: `npm install resend@^6.9.2`
- [x] 1.2 Add email env vars to `src/env.ts` server section (after existing vars):
  ```typescript
  EMAIL_PROVIDER: z.enum(["resend"]).default("resend"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().default("noreply@obigbo.app"),
  EMAIL_FROM_NAME: z.string().default("OBIGBO"),
  ENABLE_EMAIL_SENDING: z.string().optional().default("true"),
  ```
- [x] 1.2b Add the corresponding `runtimeEnv` mappings (below the existing entries):
  ```typescript
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  ENABLE_EMAIL_SENDING: process.env.ENABLE_EMAIL_SENDING,
  ```
- [x] 1.3 Add email section to `.env.example`:
  ```
  # Email Service (Story 1.17)
  EMAIL_PROVIDER=resend
  RESEND_API_KEY=re_your_api_key_here
  EMAIL_FROM_ADDRESS=noreply@obigbo.app
  EMAIL_FROM_NAME=OBIGBO
  ENABLE_EMAIL_SENDING=true
  ```

### Task 2: Template Types & Base Layout (AC: #2)

- [x] 2.1 Create `src/templates/email/types.ts`:
  - Export `interface EmailTemplateResult { subject: string; html: string; text: string }`
  - Export `type EmailTemplateRenderer = (data: Record<string, unknown>, locale: "en" | "ig") => EmailTemplateResult`
- [x] 2.2 Create `src/templates/email/base.ts`:
  - Export `function escHtml(str: unknown): string` — escapes `& < > " '` for HTML safety
  - Export `function renderBase(content: string, lang: "en" | "ig"): string` — wraps content in OBIGBO-branded HTML email layout (see Dev Notes for exact structure)
  - Language-aware footer text (English / Igbo variants)

### Task 3: All 15 Email Template Files (AC: #3)

Create each file in `src/templates/email/` with the pattern described in Dev Notes. Each file exports `render(data, locale): EmailTemplateResult`.

- [x] 3.1 `email-verification.ts` — verify link CTA button, 24-hour expiry note
- [x] 3.2 `application-received.ts` — acknowledgment after email verified (review timeline note)
- [x] 3.3 `welcome-approved.ts` — approval notification with login CTA
- [x] 3.4 `request-info.ts` — admin message included (data.message — must be HTML-escaped), reply instructions
- [x] 3.5 `rejection-notice.ts` — respectful rejection, no appeal link in Epic 1
- [x] 3.6 `member-welcome.ts` — post-onboarding completion welcome, next-steps links (dashboard, groups)
- [x] 3.7 `account-lockout.ts` — lockout reason (failed attempts), duration (`data.lockoutMinutes`), unlock instructions
- [x] 3.8 `email-otp.ts` — large OTP code display, expiry (`data.expiresMinutes ?? 10`), security notice
- [x] 3.9 `password-reset.ts` — reset link CTA button, 1-hour expiry note, "didn't request" disclaimer
- [x] 3.10 `password-reset-confirmation.ts` — confirmation only, security notice (contact support if unexpected)
- [x] 3.11 `session-evicted.ts` — device sign-out notification, security notice
- [x] 3.12 `2fa-reset-complete.ts` — 2FA reset confirmation, security notice
- [x] 3.13 `gdpr-account-deletion.ts` — 30-day warning, cancellation link with `data.cancellationToken`, `data.scheduledDeletionAt` human-readable date
- [x] 3.14 `gdpr-export-ready.ts` — download link with `data.downloadToken`, `data.expiresAt` expiry notice, 48-hour window reminder
- [x] 3.15 `gdpr-breach-notification.ts` — incident timestamp (`data.incidentTimestamp`), notification message (`data.notificationMessage` — HTML-escaped), recommended actions

### Task 4: Template Registry (AC: #3)

- [x] 4.1 Create `src/templates/email/index.ts`:
  - Import all 15 render functions
  - Define `REGISTRY: Record<string, EmailTemplateRenderer>` mapping templateId → render function
  - Export `function renderTemplate(templateId: string, data: Record<string, unknown>, locale: "en" | "ig" = "en"): EmailTemplateResult`
  - Throws `Error("Unknown email template: ${templateId}")` if not in registry

### Task 5: Email Service Implementation (AC: #1, #4, #5)

- [x] 5.1 Update `EmailPayload` interface to add `locale?: "en" | "ig"` (backward-compatible)
- [x] 5.2 Replace stub body of `emailService.send()` with Resend implementation:
  - Lazy `Resend` instance (see Dev Notes — avoids env var issues at module load)
  - Call `renderTemplate(payload.templateId, payload.data, payload.locale ?? "en")`
  - When `ENABLE_EMAIL_SENDING === "false"`: log skipped + return early
  - Throw if `ENABLE_EMAIL_SENDING === "true"` and `RESEND_API_KEY` is absent
  - Call `resend.emails.send({ from: "...", to, subject, html, text })`
  - Log success with `toHash` + `resendId` (no PII)
  - On Resend error: log + re-throw (job runner handles retry)
- [x] 5.3 Remove the dev-only `console.info("[email-stub]", ...)` line (replaced by proper logging)
- [x] 5.4 Update GDPR callers to pass full URLs in `data` (backward-compatible — adding fields, not removing):
  - `src/services/gdpr-service.ts`: add `cancellationUrl` to the `gdpr-account-deletion` email data (see Dev Notes for exact code)
  - `src/server/jobs/data-export.ts`: add `downloadUrl` to the `gdpr-export-ready` email data (see Dev Notes for exact code)
- [x] 5.5 Add TODO comment in `enqueueEmailJob()`: `// TODO: Epic 9 — clean up one-shot jobs after completion`

### Task 6: Subscriber Registration (AC: #7)

- [x] 6.1 In `src/server/jobs/index.ts`, add import and call:
  ```typescript
  import { registerOnboardingCompletionSubscriber } from "@/services/onboarding-service";
  registerOnboardingCompletionSubscriber();
  ```

### Task 7: Tests (AC: all)

- [x] 7.1 `src/services/email-service.test.ts`:
  - Mock `resend` package (see Dev Notes for exact mock pattern)
  - Mock `@/templates/email` registry
  - Mock `@/env`
  - Test: successful send → logs `email.send.success` with resendId, `toHash` present, no `to` in log
  - Test: Resend returns `{ error: { message: "Resend API error" } }` → throws
  - Test: `ENABLE_EMAIL_SENDING=false` → mock send NOT called, logs `email.send.skipped`
  - Test: `locale` defaults to `"en"` when not in payload
  - Test: `locale: "ig"` passed to `renderTemplate`
  - Test: `RESEND_API_KEY` absent with `ENABLE_EMAIL_SENDING=true` → throws before calling Resend
- [x] 7.2 `src/templates/email/index.test.ts`:
  - All 15 template IDs registered (loop over expected IDs and assert `renderTemplate(id, {name:"T",...minData}, "en")` does not throw)
  - `renderTemplate("email-verification", { name: "Chima", verifyUrl: "https://t.co" }, "en")` returns `{ subject, html, text }` with "Chima" in html
  - `renderTemplate(..., "ig")` returns different (Igbo) subject vs. "en"
  - Unknown templateId throws `Error("Unknown email template: unknown-id")`
  - HTML output contains OBIGBO branding (base layout)
- [x] 7.3 `src/templates/email/base.test.ts`:
  - Returns string containing `<html>`, `<body>`, injected content
  - Contains OBIGBO branding token ("OBIGBO" in output)
  - `escHtml()` correctly escapes `& < > " '`
  - English footer differs from Igbo footer

## Dev Notes

### Critical: Existing Callers Do NOT Change

`enqueueEmailJob()` is called across 8+ service files already implemented in Stories 1.5–1.15. The function signature and `EmailPayload` shape (`{ to, subject, templateId, data }`) must not break. Adding `locale?: "en" | "ig"` is the ONLY interface change — it is optional with no default, so all existing `{ to, subject, templateId, data }` calls continue to work. The service uses `payload.locale ?? "en"` internally.

**IMPORTANT: Do NOT update existing callers to pass `locale` in this story.** The `locale` field is added to the interface for future use. Actually passing `locale` from each call site requires looking up `user.languagePreference` from the DB, which is a cross-cutting change across 8+ files (submit-application, resend-verification, verify-email, admin-approval-service, auth-service, onboarding-service, gdpr-service, data-export, breach-response). That work is deferred — the only caller modifications in this story are adding `cancellationUrl`/`downloadUrl` to the two GDPR callers (Task 5.4).

### Resend SDK Usage (v6.9.2)

```typescript
import "server-only";
import { Resend } from "resend";
import { env } from "@/env";

// Lazy initialization — do NOT instantiate at module top level.
// Avoids "env not ready" errors during module import in tests.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set but ENABLE_EMAIL_SENDING=true");
  }
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

// In emailService.send():
const { data: resendData, error } = await getResend().emails.send({
  from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
  to: payload.to,
  subject: rendered.subject, // from renderTemplate(), NOT payload.subject
  html: rendered.html,
  text: rendered.text,
});

if (error) {
  throw new Error(`Resend API error [${payload.templateId}]: ${error.message}`);
}
```

Note: `rendered.subject` overrides `payload.subject`. The subject from the template is localized and authoritative. `payload.subject` was set by callers before templates existed — it's now a fallback only if needed, but prefer the template subject.

### Template File Pattern

Each template file in `src/templates/email/` follows this exact structure:

```typescript
// src/templates/email/email-verification.ts
import { renderBase, escHtml } from "./base";
import type { EmailTemplateResult } from "./types";

const COPY = {
  en: {
    subject: "Verify your OBIGBO email address",
    body: (d: Record<string, unknown>) =>
      `<p>Hello ${escHtml(d.name)},</p>
       <p>Please verify your email address to complete your OBIGBO membership application.</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.verifyUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Verify Email Address
         </a>
       </p>
       <p style="color:#666;font-size:14px">This link expires in 24 hours. If you didn't apply, please ignore this email.</p>`,
    text: (d: Record<string, unknown>) =>
      `Hello ${String(d.name)},\n\nVerify your OBIGBO email address:\n${String(d.verifyUrl)}\n\nThis link expires in 24 hours.\nIf you didn't apply, ignore this email.`,
  },
  ig: {
    subject: "Kwenye adreesi email OBIGBO gị",
    body: (d: Record<string, unknown>) =>
      `<p>Ndewo ${escHtml(d.name)},</p>
       <p>Biko kwenye adreesi email gị ka ị nwee ike ịmalite ịnọ n'otu OBIGBO.</p>
       <p style="text-align:center;margin:32px 0">
         <a href="${escHtml(d.verifyUrl)}"
            style="background:#D4631F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
           Kwenye Adreesi Email
         </a>
       </p>
       <p style="color:#666;font-size:14px">Njikọ a ga-akwụsị n'ime awa iri abụọ na anọ. Ọ bụrụ na ị arịọghị, hapụ email a.</p>`,
    text: (d: Record<string, unknown>) =>
      `Ndewo ${String(d.name)},\n\nKwenye adreesi email OBIGBO gị:\n${String(d.verifyUrl)}\n\nNjikọ a ga-akwụsị n'ime awa iri abụọ na anọ.`,
  },
} as const;

export function render(data: Record<string, unknown>, locale: "en" | "ig"): EmailTemplateResult {
  const lang = locale === "ig" ? "ig" : "en";
  const c = COPY[lang];
  return {
    subject: c.subject,
    html: renderBase(c.body(data), lang),
    text: c.text(data),
  };
}
```

Apply this exact pattern to all 15 templates. The `COPY` object has `en` and `ig` keys; each has `subject`, `body(d)`, and `text(d)` (no `heading` field — headings are embedded directly in the body HTML). Inline styles only (no `<style>` tags — Gmail strips them).

### XSS Prevention — `escHtml()` is Mandatory

```typescript
// src/templates/email/base.ts
export function escHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

**Rules**:

- All `data.name`, `data.message`, `data.ip`, `data.notificationMessage`, `data.incidentTimestamp` → must use `escHtml()` (these are all user/admin-supplied strings)
- URLs used in `href` attributes → use `escHtml()` (prevents `javascript:` injection)
- OTP codes (`data.otp`) → use `escHtml()` (could theoretically contain special chars)
- Numbers (`data.lockoutMinutes`, `data.expiresMinutes`) → `String(d.lockoutMinutes)` is safe, but `escHtml()` doesn't hurt

### PII-Safe Logging — SHA-256 Email Hash

```typescript
import { createHash } from "node:crypto";

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

// Success log:
console.info(
  JSON.stringify({
    level: "info",
    message: "email.send.success",
    templateId: payload.templateId,
    toHash: hashEmail(payload.to),
    locale: payload.locale ?? "en",
    resendId: resendData.id,
  }),
);

// Skip log (ENABLE_EMAIL_SENDING=false):
console.info(
  JSON.stringify({
    level: "info",
    message: "email.send.skipped",
    templateId: payload.templateId,
    reason: "ENABLE_EMAIL_SENDING=false",
  }),
);

// Error log (before re-throwing):
console.error(
  JSON.stringify({
    level: "error",
    message: "email.send.error",
    templateId: payload.templateId,
    toHash: hashEmail(payload.to),
    error: err instanceof Error ? err.message : String(err),
  }),
);
```

### Base Layout HTML Structure

```typescript
// src/templates/email/base.ts
const FOOTER_TEXT = {
  en: "You're receiving this email because you're a member of OBIGBO.",
  ig: "Ị na-enweta email a n'ihi na ị bụ onye otu OBIGBO.",
};

export function renderBase(content: string, lang: "en" | "ig"): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OBIGBO</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe5;padding:24px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#D4631F;padding:24px 32px;border-radius:8px 8px 0 0">
            <span style="color:#fff;font-size:24px;font-weight:700;letter-spacing:1px">OBIGBO</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px;color:#1a1a1a;font-size:16px;line-height:1.6">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F5F0EB;padding:20px 32px;border-radius:0 0 8px 8px;font-size:13px;color:#666;line-height:1.5">
            <p style="margin:0 0 8px">${FOOTER_TEXT[lang]}</p>
            <p style="margin:0">© ${year} OBIGBO · <a href="#" style="color:#D4631F;text-decoration:none">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
```

Use `<table>`-based layout (not `<div>`) for email client compatibility. Outlook requires table layout.

### Igbo Subject Lines for All 15 Templates

| Template ID                   | English Subject                                      | Igbo Subject                             |
| ----------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `email-verification`          | Verify your OBIGBO email address                     | Kwenye adreesi email OBIGBO gị           |
| `application-received`        | Your OBIGBO application is received                  | Anyị natara arịọ ọbịbịa gị na OBIGBO     |
| `welcome-approved`            | Welcome to OBIGBO — your application is approved     | Nnọ na OBIGBO — anyị nabatara gị         |
| `request-info`                | OBIGBO needs more information about your application | OBIGBO chọrọ ozi ndị ọzọ gbasara arịọ gị |
| `rejection-notice`            | Update on your OBIGBO membership application         | Ọnọdụ arịọ ọbịbịa gị na OBIGBO           |
| `member-welcome`              | Welcome to OBIGBO — you're in!                       | Nnọ na OBIGBO — ị bụ onye otu!           |
| `account-lockout`             | Your OBIGBO account has been temporarily locked      | Achichiara akaụntụ OBIGBO gị oge nta     |
| `email-otp`                   | Your OBIGBO sign-in code                             | Koodu ịbanye OBIGBO gị                   |
| `password-reset`              | Reset your OBIGBO password                           | Tọgharia okwuntughe OBIGBO gị            |
| `password-reset-confirmation` | Your OBIGBO password has been reset                  | Atọghariala okwuntughe OBIGBO gị         |
| `session-evicted`             | You were signed out on another device                | Ị pụọla na ngwaọrụ ọzọ                   |
| `2fa-reset-complete`          | Your OBIGBO two-factor authentication has been reset | Atọghariala njikwa abụọ-oge OBIGBO gị    |
| `gdpr-account-deletion`       | OBIGBO account deletion requested                    | Arịọla ihichapụ akaụntụ OBIGBO gị        |
| `gdpr-export-ready`           | Your OBIGBO data export is ready                     | Mbupu data OBIGBO gị dị njikere          |
| `gdpr-breach-notification`    | Important security notice from OBIGBO                | Ozi nchedo dị mkpa sitere na OBIGBO      |

### Template Data Field Notes

**`email-verification`**: Called from TWO locations — `submit-application.ts:136` AND `resend-verification.ts:55`. Both pass the same data shape `{ name, verifyUrl }`.

**`gdpr-account-deletion`**: `data.scheduledDeletionAt` is an ISO 8601 string. Format it as a human-readable date in the template:

```typescript
const deletionDate = new Date(String(d.scheduledDeletionAt)).toLocaleDateString(
  locale === "ig" ? "en-GB" : "en-US", // no ig locale in Intl — use en-GB as closer
  { year: "numeric", month: "long", day: "numeric" },
);
```

The cancellation link structure: `${env.NEXT_PUBLIC_APP_URL}/api/v1/gdpr/cancel-deletion?token=${encodeURIComponent(String(d.cancellationToken))}` — but since templates don't have access to `env`, the caller should pass the full `cancellationUrl` in data, OR the template can construct it using `data.cancellationToken` concatenated with a base URL also passed in `data`.

**Decision**: Keep templates free of `env` imports. Callers that need URL-based CTAs should pass the full URL in `data` (e.g., `data.verifyUrl`, `data.resetUrl`). For `gdpr-account-deletion`, the GDPR service already passes `cancellationToken` — Story 1.17 should update `gdpr-service.ts` to also pass `data.cancellationUrl` (the full cancel-deletion URL). Same for `gdpr-export-ready`: pass `data.downloadUrl` (full URL with token).

Update these two callers in `src/services/gdpr-service.ts` and `src/server/jobs/data-export.ts`:

```typescript
// In gdpr-service.ts enqueueEmailJob for gdpr-account-deletion:
data: {
  name: ...,
  scheduledDeletionAt: ...,
  cancellationToken,
  cancellationUrl: `${env.NEXT_PUBLIC_APP_URL}/api/v1/gdpr/cancel-deletion?token=${cancellationToken}`,
}

// In data-export.ts enqueueEmailJob for gdpr-export-ready:
data: {
  name: ...,
  downloadToken,
  expiresAt: ...,
  downloadUrl: `${env.NEXT_PUBLIC_APP_URL}/api/v1/gdpr/download?token=${downloadToken}`,
}
```

This is a backward-compatible change (adding fields to `data`, never removing). Templates use `data.cancellationUrl` / `data.downloadUrl` for CTA buttons, with `data.cancellationToken` / `data.downloadToken` as plaintext fallback in the `text` variant.

### Template Registry in `src/templates/email/index.ts`

```typescript
import "server-only";
import { render as renderEmailVerification } from "./email-verification";
// ... (all 15 imports)
import type { EmailTemplateResult, EmailTemplateRenderer } from "./types";

const REGISTRY: Record<string, EmailTemplateRenderer> = {
  "email-verification": renderEmailVerification,
  "application-received": renderApplicationReceived,
  "welcome-approved": renderWelcomeApproved,
  "request-info": renderRequestInfo,
  "rejection-notice": renderRejectionNotice,
  "member-welcome": renderMemberWelcome,
  "account-lockout": renderAccountLockout,
  "email-otp": renderEmailOtp,
  "password-reset": renderPasswordReset,
  "password-reset-confirmation": renderPasswordResetConfirmation,
  "session-evicted": renderSessionEvicted,
  "2fa-reset-complete": render2faResetComplete,
  "gdpr-account-deletion": renderGdprAccountDeletion,
  "gdpr-export-ready": renderGdprExportReady,
  "gdpr-breach-notification": renderGdprBreachNotification,
};

export function renderTemplate(
  templateId: string,
  data: Record<string, unknown>,
  locale: "en" | "ig" = "en",
): EmailTemplateResult {
  const renderer = REGISTRY[templateId];
  if (!renderer) throw new Error(`Unknown email template: ${templateId}`);
  return renderer(data, locale);
}
```

### Testing Patterns — Server-Only Files

All new files have `import "server-only"` at the top. Tests need `@vitest-environment node` directive:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
```

Mock `@/env` for all tests touching email-service:

```typescript
vi.mock("@/env", () => ({
  env: {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM_ADDRESS: "noreply@obigbo.app",
    EMAIL_FROM_NAME: "OBIGBO",
    ENABLE_EMAIL_SENDING: "true",
  },
}));
```

Mock `resend` package — **use regular function (not arrow) for `new`-called mocks** (same issue as MockRedis in Story 1.15):

```typescript
const mockSend = vi.fn().mockResolvedValue({
  data: { id: "resend-abc123" },
  error: null,
});
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  }),
}));
```

For template tests, provide minimal valid data matching each template's data fields. Templates should not throw if optional fields are missing (use `d.expiresMinutes ?? 10` etc.).

### `src/templates/email/` Does Not Need `server-only`

`base.ts`, `types.ts`, and individual template files are pure string manipulation functions with no server-side imports. They do NOT need `import "server-only"`. Only `index.ts` (which has `import "server-only"`) and `email-service.ts` are server-only.

For `index.test.ts`: the `@vitest-environment node` directive is sufficient — `server-only` does not throw in node vitest environment (confirmed in Stories 1.5–1.16). No need to mock `server-only` separately.

### No Database Migrations Needed

Story 1.17 does not create any new tables or columns. Email sending is stateless (logs go to stdout only, per architecture: "10. Never log PII").

### Job Registry Accumulation (Known, Not a Blocker)

`enqueueEmailJob()` calls `registerJob(uniqueName, handler)` then `runJob(uniqueName)`. After the job completes, the handler stays in the `registry` Map forever. With high email volume this is a slow memory leak. Do NOT fix in Story 1.17 — add a `// TODO: Epic 9 — clean up one-shot jobs after completion` comment in `enqueueEmailJob()`. The proper fix (queue-based email worker) belongs in Epic 9 / Story 9.2.

### Resend Rate Limit

Resend allows 2 API requests/second per team (default). The job runner's exponential backoff naturally handles 429 rate-limit errors. On the Resend API returning `error.message` containing "rate", the job fails and the job runner retries after 1s, 2s, 4s. No special 429 handling needed beyond letting the job runner do its job.

### EMAIL_PROVIDER — Single Provider, No Factory Pattern

`EMAIL_PROVIDER` is `z.enum(["resend"])` with only one value. Do NOT implement a provider strategy/factory pattern. Hardcode the Resend implementation directly in `emailService.send()`. The env var exists as a placeholder for future multi-provider support (Epic 9+), not as a signal to build abstractions now.

### Subscriber Registration — Where to Call

`registerOnboardingCompletionSubscriber()` must be called in the web container (not just the job runner container) to respond to `member.onboarding_completed` EventBus events emitted during onboarding API calls. `src/server/jobs/index.ts` handles the job-runner container context. For the web container, the import of `onboarding-service` in the onboarding API route will trigger the module, but the function must be explicitly called.

**For Story 1.17**: Register in `src/server/jobs/index.ts`. Add a TODO comment noting Epic 9 (Story 9.2) should move subscriber registration to a proper server initialization module for the web container.

### Story 1.16 Cross-Story Note

Story 1.16 is independent (dashboard shell). Story 1.17 note from 1.16: "Independent — no overlap." Confirmed.

### Test Baseline

After Story 1.16 code review fixes: **899/899 passing** (130 test files).

### Pre-Existing Test Failure

`ProfileStep.test.tsx` has 1 failure since Story 1.9 — do NOT investigate.

### File Structure

```
src/
├── services/
│   ├── email-service.ts              (modified — replace stub with Resend)
│   └── email-service.test.ts         (new — ~30 tests)
├── templates/
│   └── email/
│       ├── types.ts                   (new — EmailTemplateResult, EmailTemplateRenderer)
│       ├── base.ts                    (new — renderBase(), escHtml())
│       ├── base.test.ts               (new — ~8 tests)
│       ├── index.ts                   (new — registry + renderTemplate())
│       ├── index.test.ts              (new — ~12 tests)
│       ├── email-verification.ts      (new)
│       ├── application-received.ts    (new)
│       ├── welcome-approved.ts        (new)
│       ├── request-info.ts            (new)
│       ├── rejection-notice.ts        (new)
│       ├── member-welcome.ts          (new)
│       ├── account-lockout.ts         (new)
│       ├── email-otp.ts               (new)
│       ├── password-reset.ts          (new)
│       ├── password-reset-confirmation.ts (new)
│       ├── session-evicted.ts         (new)
│       ├── 2fa-reset-complete.ts      (new)
│       ├── gdpr-account-deletion.ts   (new)
│       ├── gdpr-export-ready.ts       (new)
│       └── gdpr-breach-notification.ts (new)
└── server/
    └── jobs/
        └── index.ts                   (modified — add subscriber registration)
```

Also modified:

- `src/env.ts` — new email env vars
- `.env.example` — documented email section
- `src/services/gdpr-service.ts` — add `cancellationUrl` to deletion email data
- `src/server/jobs/data-export.ts` — add `downloadUrl` to export-ready email data
- `package.json` + `package-lock.json` — add `resend@^6.9.2`

### Project Structure Notes

- `src/templates/` is a new top-level directory under `src/` — not listed in architecture.md (which was written before Story 1.17 scope). The epics.md AC is authoritative: "a branded HTML email template foundation is created at `src/templates/email/`".
- Template files are NOT feature modules (no barrel export needed). They are pure utility functions called only by `email-service.ts` via `src/templates/email/index.ts`.
- Do NOT place templates in `src/features/` (they're not UI features) or `src/lib/` (they're too domain-specific).

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.17 acceptance criteria, user story, technical requirements]
- [Source: _bmad-output/planning-artifacts/architecture.md — services/email-service.ts entry; External Integrations: "Email provider (TBD: Resend, Postmark, or SendGrid)"; Agent Rules 10]
- [Source: _bmad-output/planning-artifacts/prd.md — FR8 (automated welcome emails), FR73 (email notifications), NFR-I3 (98%+ inbox placement, 5-min delivery)]
- [Source: src/services/email-service.ts — existing stub with EmailPayload interface + enqueueEmailJob() pattern]
- [Source: src/server/jobs/job-runner.ts — retry/backoff mechanism: 3 retries, backoff=2^(attempt-1)*1000ms]
- [Source: src/services/onboarding-service.ts — registerOnboardingCompletionSubscriber() not yet called]
- [Source: src/services/gdpr-service.ts — cancellationToken passed in data; needs cancellationUrl added]
- [Source: src/server/jobs/data-export.ts — downloadToken passed in data; needs downloadUrl added]
- [Source: src/env.ts — T3 Env pattern for extending server env vars]
- [Source: resend npm v6.9.2 — resend.emails.send({ from, to, subject, html, text }) → { data: { id }, error }]
- [Source: _bmad-output/implementation-artifacts/1-15-socket-io-realtime-server-core-notification-infrastructure.md — MockRedis constructor fix pattern for `new`-called mocks]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without issues.

### Completion Notes List

- Installed `resend@6.9.2` package.
- Added 5 email env vars to `src/env.ts` (server section + runtimeEnv).
- Created new directory `src/templates/email/` with: `types.ts`, `base.ts`, 15 template files, `index.ts`.
- All 15 templates implement both `en` and `ig` locales per the Igbo subject-line table in Dev Notes.
- `escHtml()` applied to all user/admin-supplied data fields per XSS prevention rules.
- `renderBase()` uses table-based layout for Outlook compatibility.
- `emailService.send()` fully replaced: lazy Resend init, template rendering, PII-safe SHA-256 logging, ENABLE_EMAIL_SENDING bypass, error re-throw for job runner retry.
- `EmailPayload.locale?: "en" | "ig"` added (backward-compatible — all existing callers unmodified).
- GDPR callers updated: `gdpr-service.ts` now passes `cancellationUrl`, `data-export.ts` now passes `downloadUrl`.
- `registerOnboardingCompletionSubscriber()` wired in `src/server/jobs/index.ts`.
- `gdpr-service.test.ts` and `data-export.test.ts` gained `vi.mock("@/env", ...)` to handle new `@/env` import in their source files.
- 3 new test files: 74 new tests. Total: 973/973 passing (133 test files).

### File List

**New files:**

- `src/templates/email/types.ts`
- `src/templates/email/base.ts`
- `src/templates/email/base.test.ts`
- `src/templates/email/index.ts`
- `src/templates/email/index.test.ts`
- `src/templates/email/email-verification.ts`
- `src/templates/email/application-received.ts`
- `src/templates/email/welcome-approved.ts`
- `src/templates/email/request-info.ts`
- `src/templates/email/rejection-notice.ts`
- `src/templates/email/member-welcome.ts`
- `src/templates/email/account-lockout.ts`
- `src/templates/email/email-otp.ts`
- `src/templates/email/password-reset.ts`
- `src/templates/email/password-reset-confirmation.ts`
- `src/templates/email/session-evicted.ts`
- `src/templates/email/2fa-reset-complete.ts`
- `src/templates/email/gdpr-account-deletion.ts`
- `src/templates/email/gdpr-export-ready.ts`
- `src/templates/email/gdpr-breach-notification.ts`
- `src/services/email-service.test.ts`

**Modified files:**

- `src/env.ts`
- `.env.example`
- `src/services/email-service.ts`
- `src/services/gdpr-service.ts`
- `src/server/jobs/data-export.ts`
- `src/server/jobs/index.ts`
- `src/services/gdpr-service.test.ts` (added `@/env` mock)
- `src/server/jobs/data-export.test.ts` (added `@/env` mock)
- `package.json`
- `package-lock.json`

**Modified files (code review fixes):**

- `src/services/email-service.ts` (moved `renderTemplate` inside try/catch for structured error logging; removed over-defensive toHash try/catch)
- `src/templates/email/welcome-approved.ts` (replaced hardcoded `https://obigbo.app` URLs with `data.loginUrl`)
- `src/templates/email/member-welcome.ts` (replaced hardcoded `https://obigbo.app` URLs with `data.dashboardUrl`, `data.groupsUrl`, `data.membersUrl`)
- `src/templates/email/gdpr-export-ready.ts` (added hour/minute to text variant date formatting for consistency with HTML variant)
- `src/templates/email/index.test.ts` (updated minData for welcome-approved and member-welcome with URL fields)
- `src/services/admin-approval-service.ts` (added `env` import, passes `loginUrl` to welcome-approved email data)
- `src/services/onboarding-service.ts` (added `env` import, passes dashboard/groups/members URLs to member-welcome email data)
- `src/services/onboarding-service.test.ts` (added `vi.mock("@/env")`)
- `src/server/jobs/data-export.ts` (removed redundant `if (user)` null check)

## Change Log

- 2026-02-26: Story 1.17 implemented — transactional email service with Resend, 15 bilingual HTML templates, PII-safe logging, subscriber registration. 74 new tests, 973/973 passing.
- 2026-02-26: Code review fixes (claude-opus-4-6) — 5 issues fixed: H1 hardcoded production URLs in welcome-approved/member-welcome templates replaced with data-driven URLs; H2 renderTemplate errors now captured by structured logging; M1 dead code removed in data-export.ts; M2 unnecessary try/catch removed in email-service.ts; M3 consistent date formatting in gdpr-export-ready text variant. 973/973 tests still passing.
