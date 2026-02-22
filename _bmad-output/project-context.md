---
project_name: "igbo"
user_name: "Dev"
date: "2026-02-22"
sections_completed:
  [
    "technology_stack",
    "language_rules",
    "framework_rules",
    "testing_rules",
    "code_quality",
    "workflow_rules",
    "critical_rules",
  ]
status: "complete"
rule_count: 48
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core

- **Next.js 16.1.6** — App Router, Turbopack, PPR enabled, `src/` directory
- **React 19.2.3** — Strict mode enabled
- **TypeScript ^5** — `strict: true`, `noUncheckedIndexedAccess: true`
- **Tailwind CSS v4** — PostCSS integration
- **Node.js** — ES2017 target

### Dependencies

| Package                      | Version           | Role                  |
| ---------------------------- | ----------------- | --------------------- |
| drizzle-orm / drizzle-kit    | ^0.45.1 / ^0.31.9 | ORM + migrations      |
| postgres                     | ^3.4.8            | PostgreSQL driver     |
| ioredis                      | ^5.9.3            | Redis client          |
| next-auth                    | ^5.0.0-beta.30    | Auth.js v5 (beta)     |
| next-intl                    | ^4.8.3            | i18n (English + Igbo) |
| @tanstack/react-query        | ^5.90.21          | Server state          |
| socket.io / socket.io-client | ^4.8.3            | Real-time WebSocket   |
| zod                          | ^4.3.6            | Validation            |
| @serwist/next + serwist      | ^9.5.6            | PWA                   |
| radix-ui                     | ^1.4.3            | Component primitives  |
| sanitize-html                | ^2.17.1           | XSS protection        |
| @t3-oss/env-nextjs           | ^0.13.10          | Type-safe env vars    |

### Dev Dependencies

| Package                           | Version          | Role              |
| --------------------------------- | ---------------- | ----------------- |
| vitest / @vitest/coverage-v8      | ^4.0.18          | Unit testing      |
| @testing-library/react + jest-dom | ^16.3.2 / ^6.9.1 | Component testing |
| @playwright/test                  | ^1.58.2          | E2E testing       |
| eslint (flat config)              | ^9               | Linting           |
| prettier                          | ^3.8.1           | Formatting        |
| husky + lint-staged               | ^9.1.7 / ^16.2.7 | Pre-commit hooks  |

### Infrastructure

- **PostgreSQL 16** (Alpine) via Docker, port 5432
- **Redis 7** (Alpine) via Docker, port 6379
- **Two-container architecture:** web (Next.js) + realtime (Socket.IO)
- **Docker Compose** for local dev and production

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

**Configuration:**

- `strict: true` + `noUncheckedIndexedAccess: true` — every indexed access returns `T | undefined`, always narrow before use
- Path alias `@/*` → `./src/*` — always use `@/` imports, never relative paths across directories
- `isolatedModules: true` — no `const enum`, no namespace merging

**Imports:**

- Use `import type` for type-only imports (`import type { NextRequest } from "next/server"`)
- Add `import "server-only"` in server-side files to prevent client bundling
- Node built-ins with `node:` prefix (`import { randomUUID } from "node:crypto"`)
- Feature modules: import from barrel only (`@/features/chat`, not internal paths) — ESLint enforced

**Error Handling:**

- `ApiError` class for API routes — maps to RFC 7807 Problem Details
- `withApiHandler()` HOF wraps all API route handlers — provides CSRF validation, request tracing, error catching
- Never use `any` — use `unknown` + type narrowing (ESLint errors on `@typescript-eslint/no-explicit-any`)

**Type Naming:**

- Types/interfaces: `PascalCase`, no `I` prefix (`User`, not `IUser`)
- Zod schemas: `camelCase` + `Schema` suffix (`createPostSchema`)
- Domain events: fully typed via `EventMap` in `@/types/events`
- DB enums: `SCREAMING_SNAKE` values (`BASIC`, `PROFESSIONAL`, `TOP_TIER`)

### Framework-Specific Rules (Next.js + React)

**Next.js App Router:**

- Route groups: `(guest)` public/SEO, `(auth)` auth flow, `(app)` authenticated, `(admin)` admin dashboard
- REST API at `/api/v1/*` — all handlers wrapped with `withApiHandler()`
- Health check at `/api/health` — unwrapped, infrastructure-level
- Server Actions for web-only mutations; REST for shared API surface (future mobile)
- Security headers in `next.config.ts`: CSP (dev/prod differentiated), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, restrictive `Permissions-Policy`, `PoweredByHeader` disabled

**Rendering Strategy:**

- SSR + ISR: SEO pages (landing, profiles, articles)
- CSR: authenticated interactive (chat, admin)
- SSR shell + CSR content: hybrid (feed, discover)
- PPR (Partial Prerendering) enabled project-wide

**React Patterns:**

- TanStack Query for all server state — never `useEffect` + `useState` for data fetching (ESLint enforced)
- No global store — TanStack Query + scoped React Context providers (`ChatProvider`, `ThemeProvider`)
- Skeleton components for loading states, not spinners
- Optimistic updates for user-initiated mutations — roll back on error
- Error boundaries per feature area + global fallback
- Dynamic imports for heavy features (Socket.IO client, video SDK, rich text editor)

**Middleware & Request Context:**

- `src/middleware.ts`: adds `X-Request-Id` (UUID) to all requests
- `withApiHandler()`: CSRF validation (Origin vs Host on mutating methods), request context via `AsyncLocalStorage`, RFC 7807 error responses, `X-Request-Id` in response headers
- `AsyncLocalStorage` provides `{ traceId, userId? }` across async boundaries — `traceId` in all log entries

### Testing Rules

**Organization:**

- Co-located with source: `api-error.ts` → `api-error.test.ts` (same directory)
- Never create `__tests__` directory trees
- E2E tests in `e2e/` at project root
- Test utilities in `src/test/` (`test-utils.tsx`, `mocks/`, `setup.ts`)

**Framework:**

- Vitest with globals enabled (no imports for `describe`, `it`, `expect`)
- Environment per file: `// @vitest-environment node` for server code, `jsdom` default
- `server-only` mocked via `src/test/mocks/server-only.ts`
- Coverage: v8 provider, `src/**/*.{ts,tsx}`

**Patterns:**

- `vi.mock()` for module mocking, `vi.fn()` for functions, `vi.spyOn()` for spying
- `vi.clearAllMocks()` in `beforeEach` for clean state
- Arrange / Act / Assert structure
- `describe` blocks grouped by feature, `it` blocks for individual behaviors
- Use custom `render()` from `@/test/test-utils` for component tests (wraps with providers)
- Re-export from `@testing-library/react` via test-utils, never import Testing Library directly

### Code Quality & Style Rules

**ESLint (flat config, eslint@9):**

- No `any` types — use `unknown` + narrowing (`@typescript-eslint/no-explicit-any: error`)
- No `console.log` — only `console.warn`, `console.error`, `console.info`
- Drizzle: `.delete()` and `.update()` must have `.where()` clause
- No `fetch()` in `useEffect` — use TanStack Query
- No hardcoded UI strings — use `next-intl` message keys
- No direct feature internal imports — use barrel exports only

**Prettier:** semicolons, double quotes, 2-space indent, trailing commas (all), 100 char width, LF, always arrow parens

**Pre-commit (Husky + lint-staged):** auto-runs `eslint --fix` + `prettier --write` on staged `.ts/.tsx/.mts` files

**Naming Conventions:**

- Components: `PascalCase.tsx` (`UserCard.tsx`)
- Non-component files: `kebab-case.ts` (`use-chat.ts`, `points-engine.ts`)
- Functions/variables: `camelCase` | Constants: `SCREAMING_SNAKE`
- Hooks: `use` prefix | Server Actions: verb prefix (`createPost`)
- DB tables: `snake_case`, plural, domain-prefixed (`chat_messages`, `auth_sessions`)
- DB columns: `snake_case` | Foreign keys: `{table_singular}_id`
- REST endpoints: plural, `kebab-case` (`/api/v1/group-members`)
- Route/query params: `camelCase` (`:userId`, `?pageSize=20`)

**File Structure:**

- Features: `src/features/{name}/` with `components/`, `hooks/`, `actions/`, `types/`, `index.ts` barrel
- Shared: `src/components/ui/` (shadcn), `src/components/shared/`, `src/components/layout/`
- Services: `src/services/` — business logic, communicate via EventBus only (no direct cross-service calls)
- DB: `src/db/schema/` (per-domain files), `src/db/queries/` (reusable builders, only place Drizzle queries are constructed)
- Config files at project root

### Development Workflow Rules

**Key Scripts:**

- `npm run test` / `test:watch` / `test:coverage` — Vitest
- `npm run test:e2e` — Playwright
- `npm run db:push` — local dev (fast), `db:generate` + `db:migrate` — staging/prod (versioned SQL)
- `npm run db:seed` — admin seed
- `npm run jobs:run` — background job runner

**Docker (local dev):**

- `docker-compose.yml` runs PostgreSQL 16 + Redis 7
- DB credentials: `igbo/igbo`, port 5432; Redis port 6379
- Health checks configured for both services

**Environment Variables:**

- `@t3-oss/env-nextjs` + Zod — missing/malformed vars fail the build, not runtime
- Server: `DATABASE_URL`, `REDIS_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AUTH_SECRET`
- Client: `NEXT_PUBLIC_APP_URL`
- Never commit `.env` files

**CI/CD (planned):**

- PR: lint → type-check → unit tests → build → E2E → Lighthouse (parallel where possible)
- Main: build Docker images → GHCR → auto-deploy staging → manual production gate

### Critical Don't-Miss Rules

**Anti-Patterns (NEVER do):**

- `any` type — use `unknown` + type narrowing
- `console.log` — use structured logger service
- Inline SQL — use Drizzle query builder via `src/db/queries/`
- `useEffect` + `fetch` — use TanStack Query
- Internal feature imports — use barrel exports only
- `__tests__` directories — co-locate tests with source
- Hardcoded UI strings — use `next-intl` message keys
- Mutable state updates — use immutable patterns
- Swallowing errors — always log or re-throw
- Logging PII (emails, passwords, tokens) — user IDs only

**Security (ALWAYS do):**

- Wrap API handlers with `withApiHandler()` (CSRF + tracing + error handling)
- Sanitize user HTML via `sanitize-html` (whitelist tags, HTTPS-only)
- Drizzle `.delete()` / `.update()` must have `.where()` (ESLint enforced)
- Never expose stack traces — show translated i18n error messages only

**Architecture (ALWAYS follow):**

- Services communicate via `EventBus` only — never call each other directly
- All state-changing operations emit events (`domain.action` past tense: `user.created`, `post.published`)
- API responses: `{ data, meta? }` success, RFC 7807 errors
- Pagination: cursor-based for feeds/chat, offset-based for admin
- JSON: `camelCase` at API boundary, Drizzle handles `snake_case` DB mapping
- Dates: ISO 8601 in JSON, `Date` in TypeScript; `null` for absent values (never `undefined`)
- Socket.IO events: `snake_case:colon` (`message:send`); EventBus: `dot.separated` (`post.published`)

**Redis:**

- Three singletons: `getRedisClient()`, `getRedisPublisher()`, `getRedisSubscriber()`
- Cache/pub-sub only — never primary data store
- EventBus publishes to Redis for cross-container delivery, gracefully handles Redis failures

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Refer to `_bmad-output/planning-artifacts/architecture.md` for full architectural details

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Remove rules that become obvious over time

Last Updated: 2026-02-22
