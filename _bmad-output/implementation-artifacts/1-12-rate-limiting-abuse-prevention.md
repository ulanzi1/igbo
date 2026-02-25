# Story 1.12: Rate Limiting & Abuse Prevention

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want layered rate limiting at both the edge and application level,
So that the platform is protected from abuse, brute-force attacks, and API flooding.

## Acceptance Criteria

1. **Given** the platform is publicly accessible
   **When** Cloudflare edge rules are configured
   **Then** DDoS protection, brute-force login prevention, and IP-based rate limiting are active at the edge before requests reach the application server

2. **Given** the application needs per-user rate limiting
   **When** a Redis-based sliding window rate limiter is implemented
   **Then** each API endpoint and server action has a configurable rate limit (per-user, per-endpoint)
   **And** tier-based limits are enforced via PermissionService (posting limits, message rates, API call quotas)
   **And** all rate-limited responses return HTTP 429 Too Many Requests in RFC 7807 Problem Details format
   **And** rate limit headers are included on all API responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

3. **Given** the rate limiter needs infrastructure
   **When** this story is implemented
   **Then** the developer creates the rate limiter service at `src/services/rate-limiter.ts` using the existing primitive in `src/lib/rate-limiter.ts`
   **And** the rate limiter integrates with Next.js middleware for IP extraction (coarse Cloudflare-layer protection)
   **And** fine-grained per-action limits are enforced within server actions and API route handlers

## Tasks / Subtasks

- [x] Task 1: Extend `src/lib/rate-limiter.ts` with `limit` field and header builder (AC: 2, 3)
  - [x] Add `limit: number` field to the existing `RateLimitResult` interface (required for `X-RateLimit-Limit` header)
  - [x] Update `checkRateLimit` to include `limit: maxRequests` in its return value
  - [x] Add `buildRateLimitHeaders(result: RateLimitResult): Record<string, string>` export:
    - Returns `{ "X-RateLimit-Limit": string, "X-RateLimit-Remaining": string, "X-RateLimit-Reset": string }`
    - `X-RateLimit-Reset` value: epoch seconds (`Math.ceil(result.resetAt / 1000)`)
  - [x] Do NOT change the `checkRateLimit` signature — it's already used in `resend-verification.ts` and `auth-service.ts`

- [x] Task 2: Create `src/services/rate-limiter.ts` — higher-level rate limiting service (AC: 2, 3)
  - [x] Add `import "server-only";` at top
  - [x] Import `checkRateLimit, RateLimitResult, buildRateLimitHeaders` from `@/lib/rate-limiter`
  - [x] Define `RATE_LIMIT_PRESETS` configuration object:
    ```typescript
    export const RATE_LIMIT_PRESETS = {
      // Auth endpoints — strict limits, IP-based key recommended
      LOGIN: { maxRequests: 10, windowMs: 60_000 }, // 10/min per IP+email
      REGISTER: { maxRequests: 5, windowMs: 60_000 }, // 5/min per IP
      FORGOT_PASSWORD: { maxRequests: 3, windowMs: 3_600_000 }, // 3/hour per email
      RESEND_VERIFY: { maxRequests: 3, windowMs: 3_600_000 }, // 3/hour per email (matches existing)
      EMAIL_OTP: { maxRequests: 3, windowMs: 900_000 }, // 3/15min per userId (matches existing)
      MFA_VERIFY: { maxRequests: 5, windowMs: 900_000 }, // 5/15min per challengeToken (matches existing)
      // User self-service API endpoints
      PROFILE_UPDATE: { maxRequests: 20, windowMs: 60_000 }, // 20/min per userId
      LANGUAGE_UPDATE: { maxRequests: 30, windowMs: 60_000 }, // 30/min per userId
      GDPR_EXPORT: { maxRequests: 1, windowMs: 604_800_000 }, // 1/7days per userId (per Story 1.13 AC)
      // General API
      API_GENERAL: { maxRequests: 100, windowMs: 60_000 }, // 100/min per userId
      // Tier-based API quotas (per hour)
      TIER_BASIC: { maxRequests: 200, windowMs: 3_600_000 },
      TIER_PROFESSIONAL: { maxRequests: 1000, windowMs: 3_600_000 },
      TIER_TOP_TIER: { maxRequests: 5000, windowMs: 3_600_000 },
    } as const satisfies Record<string, { maxRequests: number; windowMs: number }>;
    ```
  - [x] Export `type RateLimitPreset = typeof RATE_LIMIT_PRESETS[keyof typeof RATE_LIMIT_PRESETS]`
  - [x] Export convenience function:
    ```typescript
    export async function applyRateLimit(
      key: string,
      preset: RateLimitPreset,
    ): Promise<RateLimitResult> {
      return checkRateLimit(key, preset.maxRequests, preset.windowMs);
    }
    ```
  - [x] Export `{ buildRateLimitHeaders }` from `@/lib/rate-limiter` (re-export for convenience)
  - [x] Export `{ RateLimitResult }` type re-export

- [x] Task 3: Update `withApiHandler()` to support rate limiting and emit rate limit headers (AC: 2, 3)
  - [x] Modify `src/server/api/middleware.ts` — add optional `rateLimit` option to `withApiHandler`:

    ```typescript
    interface ApiHandlerOptions {
      rateLimit?: {
        key: (request: Request) => string | Promise<string>; // key resolver
        maxRequests: number;
        windowMs: number;
      };
    }

    export function withApiHandler(
      handler: RouteHandler,
      options?: ApiHandlerOptions,
    ): RouteHandler;
    ```

  - [x] Import `checkRateLimit, buildRateLimitHeaders` from `@/lib/rate-limiter` and `type RateLimitResult` for the scoped variable
  - [x] **Implementation skeleton** — `rateLimitResult` MUST be declared in outer scope so both success and error paths can attach headers:

    ```typescript
    export function withApiHandler(handler: RouteHandler, options?: ApiHandlerOptions): RouteHandler {
      return async (request: Request) => {
        let rateLimitResult: RateLimitResult | undefined;
        try {
          // ... existing CSRF + traceId setup (unchanged) ...

          if (options?.rateLimit) {
            const key = await options.rateLimit.key(request);
            rateLimitResult = await checkRateLimit(key, options.rateLimit.maxRequests, options.rateLimit.windowMs);
            if (!rateLimitResult.allowed) {
              throw new ApiError({ title: "Too Many Requests", status: 429, detail: "Rate limit exceeded. Please try again later." });
            }
          }

          const response = await handler(request);
          // Attach rate limit headers to SUCCESS responses (Response is immutable — must clone)
          if (rateLimitResult) {
            const rlHeaders = buildRateLimitHeaders(rateLimitResult);
            const newHeaders = new Headers(response.headers);
            for (const [k, v] of Object.entries(rlHeaders)) newHeaders.set(k, v);
            return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
          }
          return response;
        } catch (error) {
          // ... existing ApiError / unknown error handling ...
          let errResponse = /* existing errorResponse() call */;
          // Attach rate limit headers to ERROR responses (including 429)
          if (rateLimitResult) {
            const rlHeaders = buildRateLimitHeaders(rateLimitResult);
            const newHeaders = new Headers(errResponse.headers);
            for (const [k, v] of Object.entries(rlHeaders)) newHeaders.set(k, v);
            errResponse = new Response(errResponse.body, { status: errResponse.status, statusText: errResponse.statusText, headers: newHeaders });
          }
          return errResponse;
        }
      };
    }
    ```

  - [x] **Response cloning pattern**: Web API `Response` objects are immutable after creation — you CANNOT call `response.headers.set()`. Instead, create a `new Response(response.body, { status, statusText, headers: newHeaders })` with merged headers
  - [x] The `withApiHandler` without `options.rateLimit` must remain UNCHANGED — zero regressions to existing routes
  - [x] Do NOT add rate limit headers to responses when `options.rateLimit` is not set (to keep response size minimal for unenforced routes)

- [x] Task 4: Apply rate limiting to the language preference endpoint (AC: 2)
  - [x] Update `src/app/api/v1/user/language/route.ts` to use rate limiting
  - [x] Import `auth` from `@/auth` (Auth.js config) and `RATE_LIMIT_PRESETS` from `@/services/rate-limiter`
  - [x] Extract the existing inline handler function to a `const handler` variable, then pass options:

    ```typescript
    import { auth } from "@/auth";
    import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

    const handler = async (request: Request) => {
      // ... existing handler body unchanged ...
    };

    export const PATCH = withApiHandler(handler, {
      rateLimit: {
        key: async (req) => {
          const session = await auth();
          return `lang-update:${session?.user?.id ?? req.headers.get("x-client-ip") ?? "anonymous"}`;
        },
        ...RATE_LIMIT_PRESETS.LANGUAGE_UPDATE,
      },
    });
    ```

  - [x] **Note**: The rate limit key resolver calls `auth()` and the handler calls `requireAuthenticatedSession()` — this results in two session lookups per request. This is an acceptable trade-off: the rate limit check must run BEFORE the handler, and `withApiHandler`'s `rateLimit.key` only receives the raw `Request`. Use `x-client-ip` header (from Task 6) as fallback instead of `x-forwarded-for` for consistency.
  - [x] This demonstrates the per-user rate limiting pattern for all future routes

- [x] Task 5: Refactor inline rate limiting in `src/services/auth-service.ts` to use `checkRateLimit` (AC: 3)
  - [x] The `check2faRateLimit()` function (lines 271-282) uses `redis.incr()` + `redis.expire()` (NOT the sliding window pattern — uses a simple counter). It's intentional for MFA: counts attempts per challenge token. Keep it as-is to avoid regressing MFA behavior.
  - [x] The email OTP rate limiting (lines 340-355) duplicates the sliding window pattern from `checkRateLimit`. Refactor it:

    ```typescript
    // BEFORE (duplicate sliding window):
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(...);
    pipeline.zadd(...);
    pipeline.zcount(...);
    pipeline.expire(...);

    // AFTER (use shared primitive):
    const rlResult = await checkRateLimit(
      `email_otp_rl:${userId}`,
      EMAIL_OTP_RATE_LIMIT,
      EMAIL_OTP_RATE_WINDOW_MS,
    );
    if (!rlResult.allowed) {
      throw new ApiError({ title: "Too Many Requests", status: 429, detail: "Rate limit exceeded" });
    }
    ```

  - [x] Keep `EMAIL_OTP_RATE_LIMIT` and `EMAIL_OTP_RATE_WINDOW_MS` constants local in `auth-service.ts` — do NOT import from `RATE_LIMIT_PRESETS` (the presets are reference values; the auth-service constants are the source of truth for this function)
  - [x] Do NOT remove the `getRedisClient()` import from `auth-service.ts` — `check2faRateLimit()` (kept as-is) still uses it
  - [x] Update `auth-service.test.ts`: the email OTP test currently mocks `redis.pipeline()` — after refactor, mock `checkRateLimit` from `@/lib/rate-limiter` instead. Keep existing MFA `check2faRateLimit` tests with the `redis.incr` mock unchanged.

- [x] Task 6: Update `src/middleware.ts` for IP extraction (coarse middleware layer) (AC: 1, 3)
  - [x] **IMPORTANT**: Next.js middleware runs in the **Edge Runtime** — `ioredis` is NOT Edge-compatible. Redis rate limiting CANNOT happen in `middleware.ts`. The edge-level rate limiting is Cloudflare's job (AC: 1).
  - [x] The middleware's contribution is forwarding real client IP so API route rate limiters can key by IP (not just user ID):
    ```typescript
    // Add to middleware.ts — extract real IP from Cloudflare or proxy headers
    const clientIp =
      request.headers.get("CF-Connecting-IP") ?? // Cloudflare real IP
      request.headers.get("X-Real-IP") ?? // Nginx/load balancer
      request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? // Proxy chain
      "unknown";
    requestHeaders.set("X-Client-IP", clientIp);
    ```
  - [x] This `X-Client-IP` header is then available to API route handlers for IP-based rate limit keys
  - [x] No other changes to middleware.ts routing logic

- [x] Task 7: Create `docs/cloudflare-rules.md` — Cloudflare edge configuration (AC: 1)
  - [x] Create `docs/cloudflare-rules.md` (NOT in `src/` — it's operational documentation):
    - DDoS protection: Cloudflare Pro+ "Under Attack Mode" or managed rules
    - Rate limiting rule: `/*/login` and `/api/v1/auth/login` — 10 requests per IP per minute → Block
    - Rate limiting rule: `/*/apply` (membership application) — 5 requests per IP per 10 minutes → Block
    - Rate limiting rule: `/api/v1/**` — 500 requests per IP per minute → Block (catch-all)
    - Brute-force protection: Challenge after 3 failed login attempts per IP in 5 minutes
    - Bot Fight Mode: enabled
    - Note that `CF-Connecting-IP` header is set by Cloudflare with the real client IP (used in middleware.ts extraction above)
  - [x] This is pure documentation — no code changes

- [x] Task 8: Tests (AC: all)
  - [x] `src/lib/rate-limiter.test.ts` — unit tests for updated `checkRateLimit` + `buildRateLimitHeaders`:
    - `@vitest-environment node` header required
    - Mock `@/lib/redis` (already pattern in codebase — see `vi.mock("@/db")` pattern)
    - Test `allowed: true` when under limit
    - Test `allowed: false` when over limit
    - Test `remaining` decrements correctly
    - Test `limit` field equals `maxRequests`
    - Test `buildRateLimitHeaders` returns correct header names and epoch seconds for `X-RateLimit-Reset`
  - [x] `src/services/rate-limiter.test.ts` — unit tests for service:
    - Mock `@/lib/rate-limiter` (`vi.mock("@/lib/rate-limiter")`)
    - Test `applyRateLimit` delegates to `checkRateLimit` with correct args
    - Test `RATE_LIMIT_PRESETS` shape (all presets have `maxRequests` and `windowMs`)
  - [x] `src/server/api/middleware.test.ts` — update existing tests:
    - Add tests for `withApiHandler` with `rateLimit` option:
      - Passes through when `allowed: true` and adds `X-RateLimit-*` headers to success response
      - Returns 429 with RFC 7807 body when `allowed: false` and adds `X-RateLimit-*` headers to 429 response
      - Verify Response cloning works (headers present on both success and error responses)
      - Verify no rate limit headers when `options.rateLimit` is not set
    - Existing tests (CSRF, error handling) must continue to pass
  - [x] `src/services/auth-service.test.ts` — update if email OTP test mocks `redis.pipeline()`:
    - After Task 5 refactor, mock `checkRateLimit` from `@/lib/rate-limiter` instead
    - Keep existing MFA `check2faRateLimit` tests with the `redis.incr` mock
  - [x] `src/middleware.test.ts` — if middleware tests exist, add tests for `X-Client-IP` extraction:
    - Test `CF-Connecting-IP` header takes precedence over `X-Real-IP` and `X-Forwarded-For`
    - Test fallback to `X-Real-IP` when `CF-Connecting-IP` is absent
    - Test `X-Forwarded-For` first-entry extraction (comma-separated list)
    - Test default to `"unknown"` when no IP headers present

## Dev Notes

### Developer Context

Story 1.12 builds a **layered rate limiting system**. The key insight is that:

- **Cloudflare** handles edge-level protection (IP-based DDoS, brute-force) — no code needed
- **Application-level Redis rate limiting** already has a working primitive at `src/lib/rate-limiter.ts` (created in Stories 1.5/1.7 and already used in `resend-verification.ts`)

**⚠️ CRITICAL: Do NOT reinvent `checkRateLimit`** — it already exists at `src/lib/rate-limiter.ts`. Story 1.12 extends it, does not replace it.

**Pre-existing rate limiting state (already done in prior stories):**

- `src/lib/rate-limiter.ts`: `checkRateLimit(key, maxRequests, windowMs)` — sliding window via Redis sorted sets
- `src/features/auth/actions/resend-verification.ts`: uses `checkRateLimit` (3/hour per email)
- `src/services/auth-service.ts`: inline OTP rate limiting (duplicate pattern — Task 5 refactors this); separate `check2faRateLimit` using `redis.incr` (keep as-is)

**What this story adds:**

1. `limit` field on `RateLimitResult` + `buildRateLimitHeaders()` helper
2. `src/services/rate-limiter.ts` — named presets and `applyRateLimit()` convenience function
3. `withApiHandler()` option for declarative per-route rate limiting
4. Rate limit headers on ALL rate-limited responses (both success AND 429 — via Response cloning)
5. IP forwarding in middleware for IP-keyed rate limits
6. Cloudflare configuration documentation

**⚠️ Response cloning required**: Web API `Response` is immutable — you CANNOT call `response.headers.set()`. To add rate limit headers, create `new Response(response.body, { status, statusText, headers: mergedHeaders })`. This applies to BOTH success responses (from handler) and error responses (from catch block).

**Scope boundaries** — do NOT implement in this story:

- Socket.IO event rate limiting (Story 1.15 — `max 60 events/second per client`)
- Anti-gaming/reaction rate limiting (Story 8.4 — `10 reactions per 60-second sliding window`)
- GDPR export rate limiting code (Story 1.13 — referenced in presets but the endpoint doesn't exist yet)
- Redis-based tier API quota enforcement for existing routes (only define presets; apply when new routes are built)

### Architecture Compliance

- Rate limiter primitive: `src/lib/rate-limiter.ts` (existing) — utility functions, no business logic
- Rate limiter service: `src/services/rate-limiter.ts` (new) — presets, business logic, tier-based config
- Architecture file tree (`architecture.md` line 1066): `src/services/rate-limiter.ts` — Redis-based sliding window rate limiter
- Architecture `middleware.ts` line 1077: Next.js middleware does auth, i18n, rate limiting — "rate limiting" here means IP forwarding (Edge can't use ioredis)
- Rate limit headers on BOTH success and 429 responses: RFC 7807 format via existing `errorResponse()` from `@/lib/api-response`; headers attached in `withApiHandler()` wrapper via Response cloning (both success and error paths)
- `withApiHandler()` change is backward-compatible: the `options` parameter is optional, existing call sites (`export const PATCH = withApiHandler(handler)`) need no changes

### Library/Framework Requirements

- **ioredis** (`import Redis from "ioredis"`) — already installed; `getRedisClient()` from `@/lib/redis` is the correct access pattern; do NOT create new Redis connections
- **No new npm packages needed** — sliding window via Redis sorted sets (`pipeline.zremrangebyscore`, `pipeline.zadd`, `pipeline.zcount`, `pipeline.pexpire`) is already implemented
- **`"server-only"`** — MUST be the first import in `src/services/rate-limiter.ts` (it's a server service)
- **Zod** — not needed for the rate limiter itself; already used in API routes for request body validation
- `@/lib/api-error` — `ApiError({ title: "Too Many Requests", status: 429, detail: "..." })` for 429 responses
- `@/lib/api-response` — `errorResponse()` formats the RFC 7807 body (already in `withApiHandler()`)

### File Structure Requirements

**New files:**

- `src/services/rate-limiter.ts` — rate limit service with presets and tier-based config
- `src/services/rate-limiter.test.ts` — tests for the service
- `src/lib/rate-limiter.test.ts` — tests for the primitive (if not already present — check first with glob)
- `docs/cloudflare-rules.md` — Cloudflare WAF configuration documentation

**Modified files:**

- `src/lib/rate-limiter.ts` — add `limit` field to `RateLimitResult`, add `buildRateLimitHeaders()` export
- `src/server/api/middleware.ts` — add optional `rateLimit` option to `withApiHandler()`
- `src/server/api/middleware.test.ts` — add rate limit tests
- `src/services/auth-service.ts` — refactor email OTP inline rate limiting to use `checkRateLimit`
- `src/services/auth-service.test.ts` — update mocks if needed
- `src/app/api/v1/user/language/route.ts` — add rate limiting as demonstration
- `src/middleware.ts` — add `X-Client-IP` extraction from Cloudflare/proxy headers
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status update

**Do NOT create:**

- A second `rate-limiter.ts` at a different path (only add `src/services/rate-limiter.ts`)
- A separate middleware for rate limiting (integrate into existing `withApiHandler()`)
- Any Redis Lua scripts (the pipeline approach in `checkRateLimit` is sufficient; Lua scripting is for future use)

### Testing Requirements

- `@vitest-environment node` annotation required for all server-side files
- Mock Redis: `vi.mock("@/lib/redis", () => ({ getRedisClient: vi.fn() }))` — then provide a mock Redis instance with `pipeline()` method
  - Mock `pipeline.exec()` return: `[[null, 0], [null, 1], [null, count], [null, null]]` (4 results: zremrangebyscore, zadd, zcount, pexpire)
- Mock rate limiter in service tests: `vi.mock("@/lib/rate-limiter", () => ({ checkRateLimit: vi.fn(), buildRateLimitHeaders: vi.fn() }))`
- Test 429 response body matches RFC 7807: `{ type: "about:blank", title: "Too Many Requests", status: 429 }` (detail may vary)
- Test rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` present on 429 responses
- `X-RateLimit-Reset` should be an integer (epoch seconds, NOT milliseconds)
- Baseline after Story 1.11: **578 tests passing**. Expect ~15–20 new tests. Pre-existing failure: `ProfileStep.test.tsx` (1 test) — do not investigate.
- Use `vi.clearAllMocks()` in `beforeEach`
- Co-locate tests with source (no `__tests__` directories)

### Previous Story Intelligence (1.11)

- **`"server-only"` import**: Always first line in service files — `src/services/rate-limiter.ts` must include it
- **Zod imports**: `import { z } from "zod/v4"` — but rate limiter doesn't use Zod
- **`withApiHandler()`** wraps ALL REST routes — the rate limit option added here is how all future routes get rate limiting
- **`requireAuthenticatedSession()`** from `@/services/permissions` returns `{ userId, role }` — use `userId` as the per-user rate limit key prefix
- **`successResponse()`/`errorResponse()`** from `@/lib/api-response` — RFC 7807 format already handled in `withApiHandler()` catch block
- **Next.js middleware Edge Runtime limitation**: Added as `X-Client-IP` header extraction only — confirmed ioredis not usable in Edge
- **Test fixtures**: Any test using `AuthUser` mock must include `languagePreference: "en"` (added in Story 1.11)

### Git Intelligence Summary

- All prior API routes: `withApiHandler(handler)` — no options parameter currently. Task 3 adds `withApiHandler(handler, options?)` — fully backward compatible.
- Pattern for key construction: `{action}:{identifier}` — e.g., `resend-verify:email@example.com`, `mfa_attempts:challengeToken`. Story 1.12 uses same convention.
- Commit pattern: Stories are committed together with code review fixes — implement cleanly before running tests.
- `src/lib/` = shared utilities/primitives; `src/services/` = business logic services with server-only imports.

### Latest Technical Research

- **Redis sorted set sliding window**: The existing `checkRateLimit` uses `zremrangebyscore` + `zadd` + `zcount` pipeline — this is the canonical Redis sliding window implementation. It's NOT atomic (pipeline vs MULTI/EXEC), but race conditions result in at most 1 extra allowed request — acceptable for rate limiting.
- **`X-RateLimit-Reset` standard**: RFC 6585 and IETF draft specify epoch seconds (not milliseconds). Return `Math.ceil(result.resetAt / 1000)` where `resetAt` is a `Date.now()` timestamp.
- **`X-RateLimit-Remaining`**: Should return 0 (not negative) when limit is exceeded — the existing `Math.max(0, maxRequests - count)` in `checkRateLimit` already handles this.
- **ioredis Edge incompatibility**: ioredis uses Node.js `net` module. Next.js middleware runs in the Edge Runtime (Vercel Edge / Cloudflare Workers compatible). Any Redis operation in middleware.ts will fail at build time or runtime. This is why Cloudflare handles edge-level rate limiting.
- **Cloudflare Rate Limiting**: Available on Cloudflare Pro plan and above. Rules are configured in Cloudflare dashboard → WAF → Rate Limiting rules. The `docs/cloudflare-rules.md` should document the exact rules to create.

### Project Structure Notes

- `src/lib/rate-limiter.ts` is already at the correct lib location (utility/primitive). The architecture's `src/services/rate-limiter.ts` is the business-logic wrapper on top.
- `docs/` directory: check if it exists. If not, create it. Cloudflare rules doc belongs here (not in `src/`).
- `src/middleware.ts` already handles auth, i18n, and onboarding redirect — add IP extraction BEFORE the `handleI18nRouting` call.
- Existing rate limit keys in Redis: `ratelimit:{key}` (from `checkRateLimit`), `mfa_attempts:{token}` (from auth-service), `email_otp_rl:{userId}` (from auth-service). All new keys should follow `ratelimit:{action}:{identifier}` convention to be discoverable.
- `src/app/api/v1/user/language/route.ts` is the only API route that makes sense to add rate limiting to in this story (as a demonstration). Do NOT retrofit rate limiting to all existing routes (that's unnecessary churn — rate limiting is applied to new routes as they're built).
- `RATE_LIMIT_PRESETS.MFA_VERIFY` is defined as a reference value but NOT used in this story — `check2faRateLimit()` in auth-service uses a simple `redis.incr()` counter (not sliding window). The preset exists for documentation/future use only.
- `getRedisClient()` import in `auth-service.ts` CANNOT be removed after Task 5 refactor — `check2faRateLimit()` still uses it directly.

### References

- Architecture: `_bmad-output/planning-artifacts/architecture.md` — Rate Limiting decision (lines 255-259), Redis usage (line 1114), services file tree (line 1066), middleware (line 1077)
- Epics: `_bmad-output/planning-artifacts/epics.md#Story 1.12` (lines 1086-1110)
- Epics cross-reference: Story 1.1b (`epics.md` line 672) mentions `withApiHandler` handles rate limiting
- Epics cross-reference: Story 1.13 (line 1159) — GDPR export rate limited to 1/7 days — preset defined here, enforced in Story 1.13
- Epics cross-reference: Story 1.15 (line 1225) — Socket.IO event rate limiting — NOT part of this story
- Epics cross-reference: Story 8.4 (line 2350) — reaction anti-gaming — NOT part of this story
- Existing primitive: `src/lib/rate-limiter.ts` — `checkRateLimit`, `RateLimitResult`
- Existing consumers: `src/features/auth/actions/resend-verification.ts:32`, `src/services/auth-service.ts:350`
- withApiHandler: `src/server/api/middleware.ts` — existing wrapper to extend
- Redis client: `src/lib/redis.ts` — `getRedisClient()` is the correct access pattern
- PermissionService: `src/services/permissions.ts` — `PERMISSION_MATRIX`, `TIER_ORDER` for tier-based preset selection

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **Dynamic import pattern for `@/lib/rate-limiter` in `middleware.ts`**: Static import of `@/lib/rate-limiter` caused a cascade (`rate-limiter` → `redis` → `@/env`) that broke 16 existing route tests. Resolved by using `await import("@/lib/rate-limiter")` lazily inside `withApiHandler` only when `options.rateLimit` is set. Type-only `import type { RateLimitResult }` retained at top level (erased at runtime, no cascade). `buildRateLimitHeadersFn` stored in closure-scoped variable alongside `rateLimitResult` so both success and error paths share the same builder reference.
- **`@/auth` import doesn't exist**: Story spec referenced `import { auth } from "@/auth"`. This project places the Auth.js config at `@/server/auth/config`. Updated route to use the correct import. Language route test updated with `vi.mock("@/server/auth/config", ...)` and `vi.mock("@/lib/rate-limiter", ...)` mocks.
- **`redis.pipeline()` → `pipeline.pexpire` discrepancy**: Original code used `pipeline.expire` (seconds), but `checkRateLimit` already uses `pipeline.pexpire` (milliseconds). The test mock used `pexpire`. Kept consistent with existing primitive.

### Completion Notes List

- ✅ Task 1: `RateLimitResult` extended with `limit: number` field; `buildRateLimitHeaders()` added — returns `X-RateLimit-{Limit,Remaining,Reset}` headers with epoch-second Reset value per RFC 6585.
- ✅ Task 2: `src/services/rate-limiter.ts` created with 13 named presets covering auth, user self-service, and tier-based quotas. `applyRateLimit()` convenience wrapper delegates to `checkRateLimit`. `buildRateLimitHeaders` and `RateLimitResult` re-exported.
- ✅ Task 3: `withApiHandler()` extended with optional `rateLimit` option. Uses lazy dynamic import of `@/lib/rate-limiter` to avoid breaking existing route tests. Both success and 429 error responses receive `X-RateLimit-*` headers. Existing call sites unchanged (backward-compatible).
- ✅ Task 4: Language preference endpoint refactored to `const handler` + `withApiHandler(handler, { rateLimit: { key: ..., ...RATE_LIMIT_PRESETS.LANGUAGE_UPDATE } })`. Uses `auth()` from `@/server/auth/config` for session-based key, falls back to `X-Client-IP` → "anonymous".
- ✅ Task 5: Email OTP inline pipeline rate limiting replaced with `checkRateLimit()` call. `check2faRateLimit()` kept as-is (uses `redis.incr()` — different pattern intentionally). `getRedisClient()` import retained (still used by `check2faRateLimit` and `redis.set()`). `auth-service.test.ts` updated: `pipeline` mock removed, `vi.mock("@/lib/rate-limiter")` + `vi.mock("@/lib/redis")` with `incr`/`expire` for MFA.
- ✅ Task 6: `src/middleware.ts` now extracts `X-Client-IP` from `CF-Connecting-IP` → `X-Real-IP` → `X-Forwarded-For` (first entry) → `"unknown"` chain, forwarded to API handlers.
- ✅ Task 7: `docs/cloudflare-rules.md` created with DDoS, rate limiting, brute-force, and bot protection rules for Cloudflare WAF.
- ✅ Task 8: 30 new tests added across 5 test files. All 608 tests pass (578 baseline + 30 new). Pre-existing `ProfileStep.test.tsx` failure unchanged.

### Senior Developer Review (AI)

**Reviewer:** Dev (claude-opus-4-6) — 2026-02-25
**Outcome:** Approved with fixes applied

**Findings (3 MEDIUM, 3 LOW):**

- **[M1] FIXED** — X-Client-IP middleware tests were smoke tests with no real assertions. Rewrote 4 tests to capture enriched request headers and assert actual X-Client-IP values. Fixed MockHeaders to use case-insensitive key lookup (matching real Headers behavior).
- **[M2] FIXED** — Missing test coverage for rate limit headers on handler-thrown non-429 errors. Added 2 tests: ApiError (404) and unknown error (500) paths with rate limiting enabled — verify X-RateLimit-\* headers present on both.
- **[M3] FIXED** — Response header attachment pattern duplicated 3× in `withApiHandler`. Extracted `enrichHeaders()` helper inside closure scope, eliminating DRY violation while preserving access to `traceId`, `rateLimitResult`, and `buildRateLimitHeadersFn`.
- **[L1] Acknowledged** — Double session lookup in language route (auth() + requireAuthenticatedSession). Acceptable trade-off per story spec.
- **[L2] Acknowledged** — `applyRateLimit` convenience function is dead code (designed for future server actions).
- **[L3] Acknowledged** — AC 2 tier-based PermissionService enforcement deferred (no consuming endpoints exist yet).

**Test count after review:** 610/610 passing (+2 new tests from M2 fix)

### File List

**New files:**

- `src/services/rate-limiter.ts`
- `src/services/rate-limiter.test.ts`
- `src/lib/rate-limiter.test.ts`
- `docs/cloudflare-rules.md`

**Modified files:**

- `src/lib/rate-limiter.ts`
- `src/server/api/middleware.ts`
- `src/server/api/middleware.test.ts`
- `src/services/auth-service.ts`
- `src/services/auth-service.test.ts`
- `src/app/api/v1/user/language/route.ts`
- `src/app/api/v1/user/language/route.test.ts`
- `src/middleware.ts`
- `src/middleware.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/1-12-rate-limiting-abuse-prevention.md`

## Change Log

- **2026-02-25** — Story 1.12 implemented: layered rate limiting system.
  - Extended `RateLimitResult` with `limit` field and added `buildRateLimitHeaders()` to `src/lib/rate-limiter.ts`
  - Created `src/services/rate-limiter.ts` with `RATE_LIMIT_PRESETS` (13 named presets) and `applyRateLimit()` convenience function
  - Extended `withApiHandler()` in `src/server/api/middleware.ts` with optional `rateLimit` option; attaches `X-RateLimit-*` headers to all rate-limited responses (success and 429)
  - Applied `LANGUAGE_UPDATE` rate limit (30/min per user) to `PATCH /api/v1/user/language`
  - Refactored email OTP inline sliding-window rate limiting in `auth-service.ts` to use shared `checkRateLimit()` primitive
  - Added `X-Client-IP` extraction in `src/middleware.ts` for IP-keyed rate limiting at API layer
  - Created `docs/cloudflare-rules.md` — operational guide for Cloudflare WAF rules (DDoS, brute-force, bot protection)
- **2026-02-25** — Code review fixes applied:
  - Extracted `enrichHeaders()` helper in `withApiHandler` to eliminate 3× duplicated header attachment pattern
  - Rewrote X-Client-IP middleware tests with real assertions on header values (fixed MockHeaders case-sensitivity)
  - Added 2 tests for rate limit headers on handler-thrown non-429 errors (ApiError + unknown error paths)
