# Story 1.1b: Security Infrastructure & API Foundation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want security headers, CSRF protection, HTML sanitization, and the REST API foundation in place from day one,
so that the platform is secure by default and has a consistent API structure for all features.

## Acceptance Criteria

1. **Security Headers via Next.js Middleware**
   - Given the platform needs security headers from day one
   - When Next.js middleware and response headers are configured
   - Then all responses include:
     - Content Security Policy (CSP) — static policy via `next.config.ts` headers (compatible with PPR/Cache Components; nonce-based CSP is incompatible with static generation)
     - `X-Frame-Options: DENY`
     - `X-Content-Type-Options: nosniff`
     - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - And CSRF protection is configured: SameSite cookies (Strict for session cookies), Origin header validation in REST route handlers
   - And Server Actions get automatic CSRF protection from Next.js built-in POST-only + Origin/Host comparison

2. **HTML Sanitization Utility**
   - Given user-generated rich text content needs sanitization to prevent stored XSS (NFR-S10)
   - When the sanitization utility is created at `src/lib/sanitize.ts`
   - Then it provides a `sanitizeHtml()` function using `sanitize-html` (server-only, no DOM dependency, fine-grained allowlist control)
   - And it whitelists only safe HTML tags (b, i, em, strong, a, p, ul, ol, li, br, blockquote, h2, h3, h4, code, pre) and safe attributes (href with https-only, rel, class)
   - And it strips all event handlers, script tags, iframes, and data URIs
   - And it is used server-side before persisting any user-generated HTML content (articles, posts, comments, chat messages)
   - And unit tests verify sanitization of common XSS vectors

3. **Versioned REST API Foundation (`/api/v1/`)**
   - Given the platform needs a versioned REST API alongside Server Actions
   - When the `/api/v1/` route structure is established
   - Then a shared API middleware at `src/server/api/middleware.ts` handles:
     - Request tracing: reads `X-Request-Id` header (from proxy/load balancer) or generates UUID, sets in `AsyncLocalStorage` context within route handler scope
     - Error serialization: catches thrown errors and returns RFC 7807 Problem Details format
   - And all REST error responses use RFC 7807 format: `{ type, title, status, detail, instance }` via a shared `ApiError` class at `src/lib/api-error.ts`
   - And a `withApiHandler` wrapper function provides consistent error handling, request context initialization, and CSRF origin validation for all REST route handlers
   - And the `/api/v1/` prefix establishes URL-based versioning for future mobile app consumption

4. **Request Context with AsyncLocalStorage**
   - Given route handlers need request-scoped context for tracing and logging
   - When `src/lib/request-context.ts` is created
   - Then it exports an `AsyncLocalStorage`-backed context with `traceId` and optional `userId`
   - And the `withApiHandler` wrapper initializes the context per request
   - And downstream code can call `getRequestContext()` to access the trace ID for structured logging

5. **API Response Helpers**
   - Given all API responses need consistent formatting
   - When response helper utilities are created at `src/lib/api-response.ts`
   - Then success responses follow format: `{ data: T, meta?: { page, pageSize, total } }`
   - And error responses follow RFC 7807 Problem Details with `Content-Type: application/problem+json`
   - And validation errors include field-level error paths in the `detail` field

## Tasks / Subtasks

- [x] Task 1: Configure security headers in `next.config.ts` (AC: #1)
  - [x] Add CSP header (static policy: `default-src 'self'`, `script-src 'self' 'unsafe-inline'` + `'unsafe-eval'` in dev, `style-src 'self' 'unsafe-inline'`, `img-src 'self' blob: data:`, `font-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`)
  - [x] Add `X-Frame-Options: DENY`
  - [x] Add `X-Content-Type-Options: nosniff`
  - [x] Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - [x] Add `Referrer-Policy: strict-origin-when-cross-origin`
  - [x] Add `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - [x] Write unit test verifying headers are configured

- [x] Task 2: Install sanitize-html and create HTML sanitization utility (AC: #2)
  - [x] Install `sanitize-html` and `@types/sanitize-html`
  - [x] Create `src/lib/sanitize.ts` with `sanitizeHtml()` function
  - [x] Configure allowlist: safe tags (b, i, em, strong, a, p, ul, ol, li, br, blockquote, h2, h3, h4, code, pre), safe attributes (href with https/http only, rel, class), strip everything else
  - [x] Write unit tests for XSS vector sanitization (script tags, event handlers, data URIs, javascript: links, nested encoding attacks)

- [x] Task 3: Create `ApiError` class and RFC 7807 response helpers (AC: #3, #5)
  - [x] Create `src/lib/api-error.ts` with `ApiError` class extending `Error` — fields: `type`, `title`, `status`, `detail`, `instance`, plus extension members
  - [x] Create `src/lib/api-response.ts` with:
    - `successResponse<T>(data: T, meta?: PaginationMeta): Response` — returns JSON with `{ data, meta? }`
    - `errorResponse(problem: ProblemDetails): Response` — returns RFC 7807 JSON with `Content-Type: application/problem+json`
    - `validationErrorResponse(fieldErrors: Record<string, string[]>): Response` — returns 422 with field-level errors
  - [x] Write unit tests for all response helpers

- [x] Task 4: Create request context with AsyncLocalStorage (AC: #4)
  - [x] Create `src/lib/request-context.ts` with `AsyncLocalStorage<RequestContext>` storing `{ traceId: string, userId?: string }`
  - [x] Export `requestContext` store, `getRequestContext()` accessor, and `runWithContext()` helper
  - [x] Write unit test verifying context propagation within async call chains

- [x] Task 5: Create `withApiHandler` wrapper and API middleware (AC: #3, #4)
  - [x] Create `src/server/api/middleware.ts` with `withApiHandler` higher-order function
  - [x] `withApiHandler` wraps route handlers to provide:
    - Read `X-Request-Id` header or generate UUID for traceId
    - Initialize `AsyncLocalStorage` request context with traceId
    - CSRF origin validation for mutating methods (POST, PATCH, DELETE): compare `Origin` header to `Host`/`X-Forwarded-Host`; reject mismatches with 403
    - Try/catch with `ApiError` → RFC 7807 response mapping
    - Catch unknown errors → generic 500 Problem Details (never expose internals)
  - [x] Write unit tests for the wrapper (success path, ApiError handling, unknown error handling, CSRF validation, request tracing)

- [x] Task 6: Create example `/api/v1/` route to validate the foundation (AC: #3)
  - [x] Create `src/app/api/v1/health/route.ts` as a simple example route using `withApiHandler`
  - [x] Verify it returns proper success response format
  - [x] Verify error cases return RFC 7807 format
  - [x] Write integration test exercising the full middleware chain

- [x] Task 7: Update existing middleware for CSRF awareness (AC: #1)
  - [x] Update `src/middleware.ts` to pass through security-relevant headers
  - [x] Note: Next.js 16 has deprecated `middleware.ts` in favor of `proxy.ts`, but for this story keep using `middleware.ts` as it still functions — migration to `proxy.ts` is a separate concern

## Dev Notes

### Technical Stack — Key Versions for This Story

| Technology        | Version            | Notes                                                                                                                                                                                       |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js           | 16.1.6             | Static CSP via `next.config.ts` headers (nonce-based CSP incompatible with PPR/static generation). `middleware.ts` still supported but deprecated in favor of `proxy.ts`.                   |
| sanitize-html     | 2.17.x             | Server-only, no DOM dependency, fine-grained allowlist. Preferred over isomorphic-dompurify for server-only use with whitelist control. Types: `@types/sanitize-html`.                      |
| AsyncLocalStorage | Node.js built-in   | Works in Next.js 16 route handlers (Node.js runtime default). Does NOT propagate from middleware/proxy to route handlers — use headers to bridge, then initialize ALS within handler scope. |
| RFC 7807          | Hand-rolled        | No well-maintained TS library exists. ~30 lines of hand-rolled code. Content-Type: `application/problem+json`.                                                                              |
| Zod               | v4 (zod/v4 import) | Already installed from Story 1.1a. Use for request validation in `withApiHandler`.                                                                                                          |

### Critical Next.js 16 Notes

- **AsyncLocalStorage caveat**: Context set in `middleware.ts` / `proxy.ts` does NOT propagate to route handlers. They run in isolated module contexts. Pattern: set `X-Request-Id` header in middleware, read it in route handler, initialize ALS within handler scope.
- **CSP strategy**: Use static CSP via `next.config.ts` headers (not nonce-based) to maintain compatibility with PPR and static generation. This requires `'unsafe-inline'` for scripts/styles but is the recommended trade-off per architecture.
- **CSRF for Server Actions**: Built-in (POST-only + Origin/Host comparison). No extra code needed.
- **CSRF for Route Handlers**: Must implement manually in `withApiHandler` — compare `Origin` to `Host`/`X-Forwarded-Host`.

### Architecture Patterns & Constraints

- **API Design**: Server Actions + REST Hybrid. REST at `/api/v1/*` for mobile-consumable endpoints.
- **Error Format**: RFC 7807 Problem Details for ALL REST endpoints: `{ type, title, status, detail, instance }`
- **Validation Errors**: RFC 7807 with `detail` containing `{ fieldErrors: { field: [messages] } }`
- **Success Response**: `{ data: T, meta?: { page, pageSize, total } }`
- **JSON fields**: `camelCase` at API boundary (Drizzle handles snake_case DB mapping)
- **Dates**: ISO 8601 strings in JSON
- **Null**: explicit `null` for absent values, never `undefined`
- **Error handling**: try/catch at route level, map to RFC 7807, log with error level, never expose internals
- **Logging**: Structured JSON to stdout: `{ level, message, timestamp, context, traceId }`. Never log PII — user IDs only.
- **Naming**: Non-component files `kebab-case.ts`, functions `camelCase`, types `PascalCase`, constants `SCREAMING_SNAKE`
- **Test co-location**: Tests live next to source (e.g., `api-error.test.ts` beside `api-error.ts`). Never `__tests__/` directories.
- **Barrel exports**: Not needed for `src/lib/` utilities (direct imports OK). Barrel exports for `src/features/` modules.

### File Locations (from Architecture)

| File                             | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `next.config.ts`                 | Security headers configuration (modify existing) |
| `src/lib/sanitize.ts`            | HTML sanitization utility (new)                  |
| `src/lib/api-error.ts`           | ApiError class + ProblemDetails type (new)       |
| `src/lib/api-response.ts`        | Success/error/validation response helpers (new)  |
| `src/lib/request-context.ts`     | AsyncLocalStorage request context (new)          |
| `src/server/api/middleware.ts`   | `withApiHandler` wrapper (new)                   |
| `src/app/api/v1/health/route.ts` | Example v1 route to validate foundation (new)    |
| `src/middleware.ts`              | Update for header passthrough (modify existing)  |

### Previous Story Intelligence (1.1a)

- **Zod v4**: Installed with `zod/v4` import path for T3 Env compatibility
- **ESLint**: Anti-pattern rules already configured (no `any`, no `console.log`, etc.)
- **Testing**: Vitest 4.0.x with jsdom, co-located tests, `src/test/setup.ts` and `src/test/test-utils.tsx` available
- **DB**: Drizzle ORM at `src/db/index.ts`, Redis via ioredis
- **Health check**: Existing at `src/app/api/health/route.ts` — the new `/api/v1/health` route is separate (validates the `withApiHandler` pattern)
- **T3 Env**: `src/env.ts` with Zod validation for all env vars
- **Code review fixes applied**: Raw SQL extracted to `src/db/queries/` layer, missing migration added

### Security Headers Detail

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';  // unsafe-eval only in dev
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;

X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### CSRF Protection Strategy

| Context                        | Protection                 | Implementation                                                           |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Server Actions                 | Built-in (Next.js 16)      | POST-only + Origin/Host comparison. No code needed.                      |
| REST Route Handlers (mutating) | Manual in `withApiHandler` | Compare `Origin` to `Host`/`X-Forwarded-Host`. Reject mismatch with 403. |
| Session cookies                | SameSite=Strict            | Set explicitly when creating session cookies.                            |
| GET requests                   | Safe by design             | No state mutations on GET.                                               |

### Project Structure Notes

- All new files align with architecture doc's directory structure
- `src/lib/` for utilities and configuration (direct imports, no barrel exports)
- `src/server/api/` for API-specific server infrastructure
- Test files co-located: `sanitize.test.ts`, `api-error.test.ts`, `api-response.test.ts`, `request-context.test.ts`, `middleware.test.ts`
- No detected conflicts or variances with existing project structure

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1b]
- [Source: _bmad-output/planning-artifacts/architecture.md — Authentication & Security, API & Communication Patterns, Implementation Patterns, Error Handling]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR-S7 (Security Headers), NFR-S10 (XSS Prevention)]
- [Source: _bmad-output/implementation-artifacts/1-1a-project-scaffolding-core-setup.md — Dev Notes, File List, Technical Stack]
- [Source: Next.js 16 Content Security Policy Guide — Static CSP via next.config.ts]
- [Source: Next.js 16 Data Security Guide — CSRF protection for Server Actions]
- [Source: sanitize-html npm — Server-side HTML sanitization with allowlist control]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

No debug issues encountered. All tasks implemented cleanly.

### Completion Notes List

- Task 1: Configured all 6 security headers in `next.config.ts` via async `headers()` function. CSP uses static policy with `'unsafe-eval'` only in development mode. 9 unit tests verify all headers.
- Task 2: Installed `sanitize-html` + types. Created `sanitizeHtml()` utility with strict allowlist of safe HTML tags/attributes. 20 unit tests cover safe tags, XSS vectors (script injection, event handlers, javascript: links, data URIs, nested encoding).
- Task 3: Created `ApiError` class extending `Error` with RFC 7807 `toProblemDetails()` serialization. Created response helpers: `successResponse()`, `errorResponse()`, `validationErrorResponse()`. 12 unit tests.
- Task 4: Created `AsyncLocalStorage`-backed request context with `traceId` and optional `userId`. Exports `getRequestContext()` and `runWithContext()`. 6 unit tests including async propagation and concurrent isolation.
- Task 5: Created `withApiHandler` HOF wrapping route handlers with: X-Request-Id tracing (read or generate UUID), AsyncLocalStorage context, CSRF origin validation for mutating methods, ApiError → RFC 7807 mapping, unknown error → generic 500. 13 unit tests.
- Task 6: Created `/api/v1/health` route using `withApiHandler` + `successResponse()`. Returns `{ data: { status: "ok", timestamp } }`. 4 integration tests verify the full middleware chain.
- Task 7: Updated `src/middleware.ts` to generate/forward `X-Request-Id` header for request tracing across non-API routes. 3 unit tests.

### Change Log

- 2026-02-21: Story 1.1b implemented — Security headers, HTML sanitization, RFC 7807 API error handling, request context with AsyncLocalStorage, withApiHandler middleware wrapper, /api/v1/health example route, middleware X-Request-Id tracing. 70 tests total, all passing.
- 2026-02-21: Code review fixes applied (claude-sonnet-4-6) — 3 HIGH + 5 MEDIUM issues fixed: (H1) CSRF bypass via forged X-Forwarded-Host removed — CSRF now validates Host only; (H2) ProblemDetails.detail type widened to string | Record<string,unknown>, eliminating `as unknown as string` cast in validationErrorResponse; (H3) sanitize.ts ALLOWED_SCHEMES restricted to https-only per AC #2, http stripped; (M1) misleading health route test replaced with ISO 8601 timestamp assertion; (M2) middleware.test.ts updated to assert actual X-Request-Id response header values; (M3) PUT method added to CSRF test coverage, X-Forwarded-Host test inverted to assert rejection; (M4) CSP test added verifying unsafe-eval absent in non-dev; (M5) server-only guard added to sanitize.ts with vitest alias mock. 72 tests total, all passing.

### File List

New files:

- src/lib/sanitize.ts
- src/lib/sanitize.test.ts
- src/lib/api-error.ts
- src/lib/api-error.test.ts
- src/lib/api-response.ts
- src/lib/api-response.test.ts
- src/lib/request-context.ts
- src/lib/request-context.test.ts
- src/server/api/middleware.ts
- src/server/api/middleware.test.ts
- src/app/api/v1/health/route.ts
- src/app/api/v1/health/route.test.ts
- next.config.test.ts
- src/middleware.test.ts
- src/test/mocks/server-only.ts

Modified files:

- next.config.ts (added security headers configuration)
- src/middleware.ts (added X-Request-Id header passthrough)
- vitest.config.ts (added root-level test pattern + server-only alias for tests)
- package.json (added sanitize-html + server-only dependencies)
- package-lock.json (dependency lock file updated)
