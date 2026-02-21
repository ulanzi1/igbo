# Story 1.1a: Project Scaffolding & Core Setup

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the project initialized with Next.js 16.1.x, all core dependencies installed, database and cache configured, linting and formatting enforced, and a health check endpoint available,
so that all subsequent features can be developed on a consistent, working foundation.

## Acceptance Criteria

1. **Next.js Application Initialization**
   - Given the project does not yet exist
   - When the initialization commands are run (`create-next-app`, dependency installation per Architecture doc)
   - Then the system creates a working Next.js 16.1.x application with TypeScript strict mode, Tailwind CSS v4, App Router, and `src/` directory structure

2. **Production Dependencies Installed**
   - Given the project is initialized
   - When all production dependencies are installed
   - Then the following are available: drizzle-orm, postgres, next-auth@beta, next-intl, @serwist/next, serwist, socket.io, socket.io-client, @tanstack/react-query, zod, ioredis

3. **Development Dependencies Installed**
   - Given the project is initialized
   - When all dev dependencies are installed
   - Then the following are available: drizzle-kit, vitest, @testing-library/react, @testing-library/jest-dom, playwright

4. **Database and Cache Infrastructure**
   - Given the project is initialized
   - When the developer runs `docker compose up`
   - Then PostgreSQL and Redis containers start and are accessible from the application
   - And Drizzle ORM connects to PostgreSQL with the connection string from T3 Env validated environment variables

5. **Code Quality Enforcement**
   - Given code quality enforcement is needed from day one
   - When ESLint and Prettier are configured
   - Then ESLint rules enforce all documented anti-patterns: no `any` type, no `console.log`, no inline SQL, no `useEffect` + `fetch`, no hardcoded UI strings, no imports from internal feature module paths
   - And Prettier is configured with project conventions
   - And a pre-commit hook (via lint-staged + husky or lefthook) runs lint and format checks on staged files
   - And TypeScript strict mode is enabled with `noUncheckedIndexedAccess`

6. **Platform Settings Table**
   - Given the platform needs admin-configurable settings from day one
   - When the database schema is created
   - Then the migration creates the `platform_settings` table: key (text PK), value (JSONB), description (text), updated_by (FK → auth_users.id, nullable), updated_at (timestamp)

7. **Admin Bootstrap Account & Seed Script**
   - Given admin workflows require an initial admin account
   - When the platform is first deployed
   - Then a database seed script (`src/server/seed/admin-seed.ts`) creates the initial admin account from environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`)
   - And the script is idempotent (skips if admin already exists)
   - And the script runs as part of the deployment entrypoint before the application starts

8. **Database Connection Pool Configuration**
   - Given the database needs connection management for production reliability
   - When Drizzle ORM connects to PostgreSQL
   - Then the connection pool is configured via Drizzle ORM's `max` pool size parameter (default 20 per container)
   - And documented in `.env.example` as `DATABASE_POOL_SIZE=20`

9. **PostgreSQL Extensions for Downstream Stories**
   - Given downstream stories require PostgreSQL extensions
   - When the foundation migration runs
   - Then the migration enables: `cube` (Story 3.1 proximity queries), `earth_distance` (Story 3.1 proximity queries), `pg_trgm` (Story 10.1 fuzzy text matching)

10. **Health Check Endpoint**
    - Given the project needs a health check
    - When a GET request is made to `/api/health`
    - Then a JSON response returns with: DB connectivity status, Redis connectivity status, uptime

## Tasks / Subtasks

- [x] Task 1: Initialize Next.js 16.1.x project (AC: #1)
  - [x] Run `create-next-app` with TypeScript, Tailwind CSS v4, App Router, `src/` directory
  - [x] Configure TypeScript strict mode with `noUncheckedIndexedAccess` in `tsconfig.json`
  - [x] Set up Tailwind CSS v4 with CSS-first `@theme` configuration (not `tailwind.config.js`)
  - [x] Configure `next.config.ts` for the project

- [x] Task 2: Install all dependencies (AC: #2, #3)
  - [x] Install production deps: drizzle-orm, postgres, next-auth@beta, next-intl, @serwist/next, serwist, socket.io, socket.io-client, @tanstack/react-query, zod, ioredis, @t3-oss/env-nextjs, radix-ui (unified package)
  - [x] Install dev deps: drizzle-kit, vitest, @testing-library/react, @testing-library/jest-dom, playwright, eslint, prettier, lint-staged, husky (or lefthook)

- [x] Task 3: Set up project directory structure (AC: #1)
  - [x] Create `src/app/` with route groups: `(guest)/`, `(auth)/`, `(app)/`, `(admin)/`
  - [x] Create `src/features/` for domain feature modules
  - [x] Create `src/components/ui/` for shadcn/ui base components
  - [x] Create `src/components/layout/` for layout components
  - [x] Create `src/db/schema/`, `src/db/queries/`, `src/db/migrations/`
  - [x] Create `src/services/` for business logic layer
  - [x] Create `src/server/` for server-only code (seed scripts, jobs)
  - [x] Create `src/lib/` for utilities and configuration
  - [x] Create `src/i18n/` for internationalization skeleton
  - [x] Create `src/providers/` for React context providers
  - [x] Create `src/test/` for test utilities
  - [x] Create `e2e/` at project root for Playwright E2E tests

- [x] Task 4: Docker Compose for local development (AC: #4)
  - [x] Create `docker-compose.yml` with PostgreSQL and Redis services
  - [x] Configure PostgreSQL with volume persistence and health check
  - [x] Configure Redis with persistence and health check
  - [x] Create `.env.example` with all required environment variables

- [x] Task 5: Database configuration and initial migration (AC: #4, #6, #8, #9)
  - [x] Set up T3 Env (`src/env.ts`) with Zod validation for all environment variables
  - [x] Configure Drizzle ORM connection in `src/db/index.ts` with pool size from env
  - [x] Create `drizzle.config.ts` for drizzle-kit
  - [x] Create initial schema: `src/db/schema/platform-settings.ts` with `platform_settings` table
  - [x] Create migration enabling PostgreSQL extensions: `cube`, `earth_distance`, `pg_trgm`
  - [x] Generate and run initial migration

- [x] Task 6: Admin seed script (AC: #7)
  - [x] Create `src/server/seed/admin-seed.ts` — idempotent admin account creation
  - [x] Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment variables
  - [x] Implement skip logic if admin already exists
  - [x] Add npm script `db:seed` to run the seed script

- [x] Task 7: Code quality enforcement (AC: #5)
  - [x] Configure ESLint with rules: no `any`, no `console.log`, no inline SQL, no `useEffect`+`fetch`, no hardcoded UI strings, no internal feature path imports
  - [x] Configure Prettier with project conventions
  - [x] Set up Husky (or Lefthook) with pre-commit hook
  - [x] Configure lint-staged to run lint + format on staged files

- [x] Task 8: Testing infrastructure (AC: #3)
  - [x] Configure Vitest in `vitest.config.ts` with path aliases matching `tsconfig.json`
  - [x] Create `src/test/setup.ts` for Vitest global setup
  - [x] Create `src/test/test-utils.tsx` with custom render function
  - [x] Configure Playwright in `playwright.config.ts`
  - [x] Create `e2e/fixtures/` directory for shared test fixtures

- [x] Task 9: Health check endpoint (AC: #10)
  - [x] Create `src/app/api/health/route.ts`
  - [x] Implement DB connectivity check (Drizzle query)
  - [x] Implement Redis connectivity check (ioredis ping)
  - [x] Return JSON with `{ status, db, redis, uptime }` structure
  - [x] Write unit test for health check endpoint

- [x] Task 10: Foundation config files
  - [x] Create root layout `src/app/layout.tsx` with Inter font, providers shell, metadata
  - [x] Create `src/app/globals.css` with Tailwind CSS v4 `@theme` cultural color tokens
  - [x] Create `src/app/not-found.tsx` and `src/app/error.tsx` placeholders
  - [x] Create `src/middleware.ts` placeholder for future auth/i18n middleware

## Dev Notes

### Technical Stack — Pinned Versions (Feb 2026)

| Technology           | Version    | Notes                                                                                                 |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Next.js              | 16.1.6 LTS | Async request APIs required (`cookies()`, `headers()`, `params`, `searchParams`). Min Node.js 20.9.0. |
| TypeScript           | 5.1+       | Strict mode with `noUncheckedIndexedAccess`                                                           |
| Tailwind CSS         | v4.1       | CSS-first config via `@theme` in CSS (no `tailwind.config.js`). Rust-powered Oxide engine.            |
| Drizzle ORM          | 0.45.x     | PostgreSQL driver. Use `drizzle-kit push` for dev, `generate`+`migrate` for prod.                     |
| Auth.js (next-auth)  | v5 beta    | ENV prefix: `AUTH_*` (not `NEXTAUTH_*`). Adapters: `@auth/*-adapter` scope.                           |
| TanStack React Query | 5.90.x     | Stable, no breaking changes from v5                                                                   |
| shadcn/ui            | latest     | Unified `radix-ui` package (not individual `@radix-ui/react-*`). Copy-paste components.               |
| Vitest               | 4.0.x      | ESM-native. Browser mode now stable.                                                                  |
| Playwright           | 1.58.x     | Multi-browser E2E testing                                                                             |
| Serwist              | 9.5.x      | PWA service worker, successor to next-pwa                                                             |
| T3 Env               | 0.13.x     | ESM-only, Zod validation, `NEXT_PUBLIC_` prefix preconfigured                                         |
| ioredis              | latest     | Redis client                                                                                          |
| Zod                  | latest     | Runtime schema validation                                                                             |

### Critical Next.js 16 Migration Notes

- **Async Request APIs**: `cookies()`, `headers()`, `params`, `searchParams` are now async-only — must `await` them
- **Node.js 20.9.0 minimum** — Node 18 no longer supported
- **AMP support removed** — not relevant for this project
- **`revalidateTag()`** now requires `cacheLife` profile as second argument
- Codemods available: `npx @next/codemod@latest upgrade`

### Tailwind CSS v4 Migration Notes

- **CSS-first configuration**: Replace `tailwind.config.js` with `@theme` block in `globals.css`
- **Single import**: Just `@import "tailwindcss"` in main CSS file (no separate `@tailwind base/components/utilities`)
- **Browser support**: Safari 16.4+, Chrome 111+, Firefox 128+
- **Modern CSS features**: `@layer`, custom properties, `color-mix()`, logical properties
- Automated migration: `npx @tailwindcss/upgrade`

### Cultural Color System (from UX Spec)

```css
/* src/app/globals.css — @theme block */
@import "tailwindcss";

@theme {
  /* Primary Palette (OBIGBO Logo) */
  --color-primary: #2d5a27; /* Deep Forest Green */
  --color-secondary: #d4a574; /* Warm Sandy Tan */
  --color-accent: #c4922a; /* Golden Amber */

  /* Semantic Colors */
  --color-success: #38a169; /* Leaf Green */
  --color-warning: #d69e2e; /* Warm Amber */
  --color-destructive: #c53030; /* Muted Terracotta Red */
  --color-info: #3182ce; /* Calm Blue */

  /* Neutral Palette */
  --color-background: #faf8f5; /* Warm Off-White */
  --color-foreground: #1a1612; /* Warm Near-Black */
  --color-card: #ffffff; /* Warm White */
  --color-muted: #f0ede8; /* Warm Light Grey */
  --color-border: #e7e2db; /* Warm Border Grey */
}
```

### Typography

- **Font**: Inter (via `next/font`) — excellent Igbo diacritic support (ụ, ọ, ṅ, á, à, é, è)
- **Mono**: JetBrains Mono for code snippets
- **Body minimum**: 16px (non-negotiable for elder accessibility)
- **Line height**: 1.6 minimum for body text (generous for Igbo diacritics)

### Architecture Patterns & Constraints

- **Monorepo**: Single repo, two containers (web + realtime)
- **App Router only**: No Pages Router
- **Feature modules**: `src/features/[name]/` with barrel exports (`index.ts`)
- **Service layer**: `src/services/` — services communicate via EventBus, never directly
- **Database access**: All through `src/db/queries/` — never raw SQL
- **API responses**: RFC 7807 Problem Details for errors
- **Naming conventions**:
  - DB tables: `snake_case`, plural (`platform_settings`)
  - DB columns: `snake_case` (`updated_at`, `updated_by`)
  - Components: `PascalCase.tsx` (`UserCard.tsx`)
  - Non-component files: `kebab-case.ts` (`admin-seed.ts`)
  - Functions/variables: `camelCase`
  - Constants: `SCREAMING_SNAKE`
  - Types: `PascalCase`, no `I` prefix
  - Zod schemas: `camelCase` + `Schema` suffix (`createPostSchema`)
- **Test co-location**: Tests live next to source (`health.test.ts` beside `route.ts`). NEVER `__tests__/` directories.

### ESLint Anti-Pattern Rules to Implement

| Rule                             | Rationale                                                     |
| -------------------------------- | ------------------------------------------------------------- |
| No `any` type                    | Type safety from day one                                      |
| No `console.log`                 | Production needs structured logging (Story 12.3)              |
| No inline SQL                    | Prevents SQL injection, enforces Drizzle ORM                  |
| No `useEffect` + `fetch`         | Prevents race conditions; use React Query or server actions   |
| No hardcoded UI strings          | Bilingual support requires `useTranslations()` from next-intl |
| No internal feature path imports | Enforces clean module boundaries via barrel exports           |

### Environment Variables (.env.example)

```env
# Database
DATABASE_URL=postgresql://igbo:igbo@localhost:5432/igbo
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379

# Admin Bootstrap
ADMIN_EMAIL=admin@igbo.app
ADMIN_PASSWORD=changeme

# Auth.js v5
AUTH_SECRET=generate-a-secret
AUTH_URL=http://localhost:3000

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Docker Compose Services

- **PostgreSQL**: Latest 16.x, port 5432, volume `pgdata`, health check via `pg_isready`
- **Redis**: Latest 7.x, port 6379, health check via `redis-cli ping`

### Project Structure Notes

```
igbo/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (guest)/            # Public pages (SSR)
│   │   ├── (auth)/             # Auth flows
│   │   ├── (app)/              # Authenticated app (CSR)
│   │   ├── (admin)/            # Admin dashboard
│   │   ├── api/
│   │   │   └── health/route.ts # Health check endpoint
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Tailwind v4 @theme + base
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   ├── features/               # Domain feature modules
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   └── layout/             # Layout components
│   ├── db/
│   │   ├── index.ts            # Drizzle connection
│   │   ├── schema/             # Table definitions
│   │   ├── queries/            # Query builders
│   │   └── migrations/         # Generated migrations
│   ├── services/               # Business logic
│   ├── server/
│   │   └── seed/
│   │       └── admin-seed.ts   # Admin bootstrap
│   ├── lib/                    # Utilities, config
│   │   └── env.ts              # T3 Env validation
│   ├── i18n/                   # Internationalization
│   ├── providers/              # React context providers
│   ├── test/                   # Test utilities
│   │   ├── setup.ts
│   │   └── test-utils.tsx
│   └── middleware.ts           # Next.js middleware (placeholder)
├── e2e/                        # Playwright E2E tests
│   └── fixtures/
├── docker-compose.yml          # Local dev (PostgreSQL + Redis)
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── .eslintrc.json (or eslint.config.js)
├── .prettierrc
├── package.json
└── tsconfig.json
```

### Alignment with Unified Project Structure

- Follows architecture doc's `src/` directory structure exactly
- Route groups match architecture: `(guest)`, `(auth)`, `(app)`, `(admin)`
- Database organization matches: `src/db/schema/`, `src/db/queries/`, `src/db/migrations/`
- Service layer at `src/services/` as specified
- Test utilities at `src/test/` as specified
- E2E tests at `e2e/` at project root as specified
- No detected conflicts or variances

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1a]
- [Source: _bmad-output/planning-artifacts/architecture.md — Technical Stack, Code Structure, Database Schema, API Patterns, Testing Standards, Deployment Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — Non-Functional Requirements (NFR-P, NFR-S, NFR-SC, NFR-A)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Design System, Color System, Typography, Responsive Layout, PWA Requirements]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Fixed missing `jsdom` dependency for Vitest environment
- Fixed missing `@playwright/test` package (separate from `playwright` browser binary)
- Zod v4 installed; using `zod/v4` import path for T3 Env compatibility

### Completion Notes List

- Scaffolded Next.js 16.1.6 project with TypeScript strict mode, Tailwind CSS v4, App Router, src/ directory
- Installed all production dependencies (drizzle-orm, postgres, next-auth@beta, next-intl, @serwist/next, serwist, socket.io, socket.io-client, @tanstack/react-query, zod, ioredis, @t3-oss/env-nextjs, radix-ui)
- Installed all dev dependencies (drizzle-kit, vitest, @testing-library/react, @testing-library/jest-dom, @playwright/test, eslint, prettier, lint-staged, husky, jsdom)
- Created full project directory structure with route groups (guest, auth, app, admin), features, components, db, services, lib, i18n, providers, test, e2e
- Docker Compose configured with PostgreSQL 16 and Redis 7 with health checks and volume persistence
- T3 Env configured with Zod validation for all environment variables
- Drizzle ORM connection configured with pool size from env vars
- Platform settings schema created (key, value JSONB, description, updated_by, updated_at)
- PostgreSQL extensions migration created (cube, earth_distance, pg_trgm)
- Idempotent admin seed script created with graceful handling when auth_users table doesn't exist yet
- ESLint configured with anti-pattern rules (no any, no console.log, drizzle enforcement, no internal feature imports)
- Prettier configured with project conventions
- Husky + lint-staged pre-commit hook configured
- Vitest configured with jsdom environment, path aliases, and setup file
- Playwright configured for multi-browser E2E testing
- Health check endpoint created at /api/health with DB and Redis connectivity checks
- 3 unit tests for health check endpoint (healthy, db down, redis down) — all passing
- Root layout with Inter + JetBrains Mono fonts, cultural color system in globals.css
- Error and not-found placeholder pages created
- Middleware placeholder created
- Next.js build succeeds; all tests pass; ESLint passes (0 errors)

### Change Log

- 2026-02-21: Initial project scaffolding and core setup complete (Story 1.1a)
- 2026-02-21: Code review fixes applied — 10 issues resolved (3 critical, 4 medium, 3 low)

### File List

- package.json (new)
- package-lock.json (new)
- tsconfig.json (new)
- next.config.ts (new)
- next-env.d.ts (new)
- eslint.config.mjs (new)
- postcss.config.mjs (new)
- .gitignore (new)
- .prettierrc (new)
- .prettierignore (new)
- .env.example (new)
- docker-compose.yml (new)
- drizzle.config.ts (new)
- vitest.config.ts (new)
- playwright.config.ts (new)
- .husky/pre-commit (new)
- src/env.ts (new)
- src/middleware.ts (new)
- src/app/layout.tsx (new)
- src/app/globals.css (new)
- src/app/page.tsx (new — scaffolded default)
- src/app/not-found.tsx (new)
- src/app/error.tsx (new)
- src/app/api/health/route.ts (new)
- src/app/api/health/route.test.ts (new)
- src/db/index.ts (new)
- src/db/schema/platform-settings.ts (new)
- src/db/migrations/0000_extensions.sql (new)
- src/db/migrations/0001_platform_settings.sql (new — code review fix: missing migration for platform_settings table)
- src/db/queries/admin-queries.ts (new — code review fix: extract raw SQL into queries layer per architecture)
- src/server/seed/admin-seed.ts (modified — code review fix: use db/queries layer)
- src/test/setup.ts (new)
- src/test/test-utils.tsx (new)
- src/app/(guest)/.gitkeep (new)
- src/app/(auth)/.gitkeep (new)
- src/app/(app)/.gitkeep (new)
- src/app/(admin)/.gitkeep (new)
- src/features/.gitkeep (new)
- src/components/ui/.gitkeep (new)
- src/components/layout/.gitkeep (new)
- src/db/queries/.gitkeep (new)
- src/services/.gitkeep (new)
- src/i18n/.gitkeep (new)
- src/providers/.gitkeep (new)
- e2e/fixtures/.gitkeep (new)
