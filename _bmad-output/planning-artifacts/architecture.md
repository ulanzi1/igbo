---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - product-brief-igbo-2026-02-18.md
  - prd.md
  - prd-validation-report.md
  - ux-design-specification.md
  - masterplan2.1.md
  - Job_Portal_PRD_v1.1_FINAL.md
  - prd-v2.md
  - product-brief-igbo-2026-03-29.md
  - prd-v2-validation-report.md
workflowType: "architecture"
lastStep: 8
status: "complete"
completedAt: "2026-04-01"
previousCompletedAt: "2026-02-20"
project_name: "igbo"
user_name: "Dev"
date: "2026-04-01"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
99 FRs across 15 categories covering the full MVP scope. The heaviest categories are Real-Time Communication (FR31-FR40, 10 requirements), Groups & Channels (FR41-FR48, 8 requirements), News Feed & Content (FR49-FR56, 8 requirements), and Administration & Moderation (FR83-FR92, 10 requirements). These four areas represent the architectural core — they touch the most subsystems and have the deepest interdependencies.

Key FR clusters that drive architectural decisions:

- **Real-time chat (FR31-FR40):** WebSocket infrastructure, message persistence, search, read receipts, typing indicators, file attachments, emoji reactions, thread model, block/mute, per-conversation notification preferences
- **RBAC and tiers (FR20-FR25):** Three-tier permission model (Basic/Professional/Top-tier) with posting limits that increase with points accumulation, enforced across news feed, articles, groups, events, and admin functions
- **Content moderation pipeline (FR84-FR88):** Automated flagging with bilingual keyword blocklist, admin review queue, progressive discipline, dispute resolution with flagged conversation access, and member reporting with categorized reasons
- **Member discovery (FR17-FR18):** Geographic fallback search (city → state → country) — a novel UX pattern requiring tiered query logic and graceful UI expansion
- **Notification routing (FR72-FR77):** Multi-channel delivery (in-app, email, push via Web Push API), per-type and per-channel customization, digest options, quiet hours/DND

**Non-Functional Requirements:**
53 NFRs across 6 categories with specific measurable targets:

- **Performance (12):** < 2s SSR page load, < 1s SPA navigation, < 500ms chat delivery, < 200ms API p95, < 5s video join, Core Web Vitals targets (FCP < 1.5s, LCP < 2.5s, CLS < 0.1, FID < 100ms)
- **Security (12):** TLS 1.2+, AES-256 at rest, mandatory 2FA, account lockout, CSP headers, file upload virus scanning, GDPR compliance, audit logging, E2E encryption migration readiness via service abstraction layer
- **Scalability (7):** 500 concurrent users at launch scalable to 2,000 without redesign, 10x growth with < 10% degradation, 3x traffic spikes during events, 100+ messages/second throughput, horizontal scalability readiness
- **Accessibility (9):** WCAG 2.1 AA, keyboard navigation, screen reader compatibility (VoiceOver + NVDA), 4.5:1 contrast ratios, 44x44px tap targets, 16px minimum body text, reduced motion support, high contrast mode, semantic HTML
- **Integration (6):** Video SDK 99%+ connection success, < 300ms audio/video lag, email 98%+ inbox placement, push notification < 30s delivery, 90%+ CDN cache hit ratio
- **Reliability (7):** 99.5% uptime, < 4h RTO, < 24h RPO, daily automated backups with 30-day retention, WebSocket auto-reconnect within 5s with no message loss, graceful degradation to read-only mode

**Scale & Complexity:**

- Primary domain: Community Platform (social, cultural preservation, civic engagement)
- Secondary domains (Phase 2+): Fintech, Civic-Tech
- Complexity level: High
- Estimated architectural components: 12-15 major subsystems for Phase 1
- Project context: Greenfield

### Technical Constraints & Dependencies

**Specified in PRD/UX:**

- **Frontend:** Next.js (React) with TypeScript, Tailwind CSS, shadcn/ui + Radix UI primitives, next-intl for i18n, next-pwa for Lite PWA
- **Backend:** PostgreSQL primary database, Redis caching layer, WebSocket (Socket.io or native WS)
- **Infrastructure:** Hetzner hosting with containerized deployment, Cloudflare CDN with edge caching, CI/CD via GitHub Actions
- **Video:** Agora or Daily.co SDK integration
- **Testing:** Jest + React Testing Library + Cypress E2E, automated Lighthouse CI in pipeline
- **State management:** React Context + TanStack Query or SWR

**Phase 2+ architectural implications (must not be blocked):**

- Job portal on separate subdomain requiring SSO/shared auth
- Platform wallet requiring financial transaction infrastructure and KYC/AML
- Marketplace with escrow and payment processing
- Native mobile apps (iOS/Android) requiring API design that supports both web and native clients
- E2E encryption for chat requiring service abstraction layer now
- Studio broadcasting requiring advanced video infrastructure
- Voting/governance system with anonymous cryptographic vote storage

### Cross-Cutting Concerns Identified

1. **Authentication & Authorization (RBAC)** — Every API endpoint must enforce tier-based permissions. Middleware-based access control with a well-defined permission matrix is essential.
2. **Internationalization (i18n)** — Every user-facing string, every system message, every notification, every email template must support English + Igbo. Built from day one, not retrofitted.
3. **Real-time connection management** — WebSocket connections for chat, notifications, presence indicators, and typing indicators must be managed efficiently with graceful reconnection and no message loss.
4. **Content moderation pipeline** — Automated keyword filtering (bilingual) + human review queue + progressive discipline + admin audit logging. Touches posts, comments, articles, messages, and profiles.
5. **Points calculation engine** — Points from likes (with badge multipliers: 1x/3x/6x/10x), activity-based points, posting limit calculations based on accumulated points. Must be consistent, auditable, and resistant to gaming.
6. **Notification routing** — Multi-channel (in-app, email, push), per-type customization, digest aggregation, quiet hours. Notification events generated by chat, groups, events, articles, admin actions, and system processes.
7. **Audit logging** — 100% coverage of admin actions with timestamp, actor, and action details. Must not impact API performance.
8. **GDPR data handling** — Consent management, soft-delete with retention policies, right to deletion, breach notification procedures. Affects every data model containing PII.
9. **File upload pipeline** — Virus scanning, type whitelisting, size limits, image optimization (WebP/AVIF with responsive srcset), secure storage. Used by profiles, posts, articles, chat, and groups.
10. **SEO and rendering strategy** — SSR for guest pages, CSR for authenticated experience, structured data, hreflang tags, sitemap generation. Affects routing, data fetching patterns, and caching strategy.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack real-time community platform built on Next.js with WebSocket infrastructure, PWA capabilities, and bilingual (English + Igbo) internationalization.

### Starter Options Considered

| #   | Starter                     | Version        | Strengths                                                         | Gaps                                                        |
| --- | --------------------------- | -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | **create-next-app**         | Next.js 16.1.x | Official, always current, minimal opinions, Turbopack, App Router | No auth, no DB, no components — everything added manually   |
| 2   | **create-t3-app**           | v7.40.0        | Excellent DX, tRPC type-safety, Drizzle/Prisma, NextAuth          | Still on Next.js 15 (not 16), tRPC adds coupling, no PWA/WS |
| 3   | **nextjs/saas-starter**     | Latest         | Drizzle + shadcn + Stripe, team management                        | SaaS-oriented, Stripe-centric, no i18n/PWA/WS               |
| 4   | **ixartz/SaaS-Boilerplate** | v1.7.6         | Most complete (Clerk, Drizzle, Sentry, Stripe, i18n)              | Clerk vendor lock-in, SaaS billing focus, heavy opinions    |
| 5   | **Blazity/next-enterprise** | Latest         | Tailwind, testing setup, Storybook, T3 Env                        | Enterprise-oriented, no auth/DB/i18n built in               |

**Critical Finding:** No existing starter template includes WebSocket/Socket.IO support or PWA (service worker) capabilities. These are two of igbo's core architectural requirements and must be layered in regardless of starter choice.

**Critical Finding:** Serwist (@serwist/next) is the maintained successor to the abandoned next-pwa package. All PWA configuration should use Serwist.

### Selected Approach: Strategy C — Minimal Base + Full Control

**Starter:** `create-next-app` (Next.js 16.1.x official scaffold)

**Rationale:**

- Guarantees Next.js 16.1.x with Turbopack, App Router, and all latest features from day one
- No opinions to fight or remove — every dependency is chosen intentionally
- WebSocket (Socket.IO) and PWA (Serwist) are layered cleanly without starter conflicts
- Avoids vendor lock-in (no Clerk, no Stripe assumptions)
- create-t3-app's Next.js 15 dependency is a disqualifier for a greenfield project in Feb 2026
- The project's complexity demands full control over every architectural layer

### Initialization Command Sequence

```bash
npx create-next-app@latest igbo --typescript --tailwind --eslint --app --src-dir
cd igbo && npx shadcn@latest init
npm install drizzle-orm postgres next-auth@beta next-intl @serwist/next serwist socket.io socket.io-client @tanstack/react-query zod ioredis
npm install -D drizzle-kit vitest @testing-library/react @testing-library/jest-dom playwright
```

### Architectural Decisions Provided by Starter

| Decision            | Value                             | Source                |
| ------------------- | --------------------------------- | --------------------- |
| Language            | TypeScript (strict)               | create-next-app flag  |
| Framework           | Next.js 16.1.x (App Router)       | create-next-app       |
| Styling             | Tailwind CSS v4                   | create-next-app flag  |
| Bundler             | Turbopack (default in Next.js 16) | create-next-app       |
| Directory structure | `src/` directory with App Router  | create-next-app flags |
| Linting             | ESLint with Next.js config        | create-next-app flag  |
| Component library   | shadcn/ui 3.0 + Radix UI          | shadcn CLI init       |

### Dependencies Selected

| Category              | Package                           | Version | Rationale                                                                                                    |
| --------------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| **ORM**               | drizzle-orm + drizzle-kit         | Latest  | SQL-native, no client generation, lighter than Prisma, excellent PostgreSQL support                          |
| **DB Driver**         | postgres (pg.js)                  | Latest  | Native PostgreSQL driver for Drizzle                                                                         |
| **Auth**              | next-auth@beta (Auth.js v5)       | v5 beta | Open standard, no vendor lock-in, supports 2FA, custom providers, extensible for admin-approved registration |
| **i18n**              | next-intl                         | Latest  | Purpose-built for Next.js App Router, supports Igbo diacritics (ụ, ọ, ṅ)                                     |
| **PWA**               | @serwist/next + serwist           | Latest  | Maintained successor to abandoned next-pwa, service worker management, offline support                       |
| **WebSocket**         | socket.io + socket.io-client      | Latest  | Mature, auto-reconnect, room support, binary streaming, requires custom Node.js server on Hetzner            |
| **Server State**      | @tanstack/react-query             | v5      | Caching, deduplication, optimistic updates, prefetching, superior to SWR for complex real-time apps          |
| **Validation**        | zod                               | Latest  | Runtime + compile-time validation, integrates with Drizzle schemas and Auth.js                               |
| **Cache**             | ioredis                           | Latest  | Full Redis feature set, cluster support, Lua scripting for points calculation atomicity                      |
| **Unit Testing**      | vitest                            | Latest  | Vite-native, faster than Jest, ESM-first, compatible with Testing Library                                    |
| **Component Testing** | @testing-library/react + jest-dom | Latest  | Standard React testing, screen reader assertion support                                                      |
| **E2E Testing**       | playwright                        | Latest  | Multi-browser, better DX than Cypress, native async/await, auto-waiting                                      |

### Testing Stack Deviation from PRD

The PRD specifies Jest + Cypress. This architecture selects **Vitest + Playwright** instead:

- **Vitest over Jest:** ESM-native (no transform overhead), Vite-powered HMR for watch mode, Jest-compatible API — zero migration friction if needed
- **Playwright over Cypress:** True multi-browser testing (Chromium + Firefox + WebKit), no browser sandbox limitations, native async/await, parallel test execution, better CI performance

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- Data modeling approach (schema structure, migration strategy)
- Session strategy and RBAC enforcement pattern
- API design pattern (Server Actions + REST hybrid)
- Real-time architecture (Socket.IO namespace/room design)
- Container strategy (two-container deployment)

**Important Decisions (Shape Architecture):**

- Caching strategy per use case
- Registration flow (two-gate approval)
- File upload pipeline (presigned URLs)
- Component directory structure (feature-based)
- Rendering strategy per route
- CI/CD pipeline design
- Monitoring stack

**Deferred Decisions (Post-MVP):**

- Kubernetes migration (start with Docker Compose)
- Full log aggregation (Loki — add when log volume demands it)
- PR preview deployments (use staging for verification)
- E2E encryption implementation (service abstraction layer built now, encryption added Phase 2+)

### Data Architecture

**Schema Strategy: Hybrid Single Schema with Domain Prefixes**

- All tables in PostgreSQL `public` schema for Phase 1
- Table naming convention with domain prefixes (`chat_messages`, `community_posts`, `auth_sessions`) to enable clean extraction into separate schemas in Phase 2
- Drizzle schema files organized per domain: `src/db/schema/users.ts`, `src/db/schema/chat.ts`, `src/db/schema/groups.ts`, etc.
- Rationale: Avoids cross-schema join complexity in Phase 1 while the naming convention makes Phase 2 domain extraction (job portal subdomain, wallet service) straightforward

**Migration Strategy: Push + Migration Files**

- `drizzle-kit push` for local development (fast iteration)
- `drizzle-kit generate` + `drizzle-kit migrate` for staging and production (versioned, auditable SQL migration files)

**Caching Strategy: Hybrid Per Use Case**

- **Cache-aside (lazy loading):** Member profiles, group listings, article content, event details — read-heavy, tolerates slight staleness
- **Write-through:** Points balances, online presence, unread counts — must be immediately consistent
- **Redis pub/sub:** Real-time cache invalidation for cross-instance consistency, TanStack Query cache invalidation triggers
- **TTL policy:** Profiles 5min, listings 2min, presence 30s with heartbeat renewal, session cache 15min

**Soft Delete & GDPR Compliance:**

- `deletedAt` timestamp column on all PII-containing tables
- Global Drizzle query filter to exclude soft-deleted rows by default (`.where(isNull(table.deletedAt))`)
- Scheduled background job for retention policy enforcement (hard delete after configurable retention period)
- Dedicated hard-delete function for right-to-deletion (GDPR Article 17) requests that removes across all tables and backups
- Consent tracking table with versioned consent records

### Authentication & Security

**Session Strategy: Database Sessions with Redis Cache**

- Session records stored in PostgreSQL (durable, queryable for admin)
- Active sessions cached in Redis (near-zero latency on lookups)
- Instant session revocation: delete from Redis → immediate lockout (critical for moderation: banning/suspending users takes effect on next request)
- Graceful fallback: Redis miss → DB lookup → re-cache
- Rationale: Moderation requirements demand instant revocation; Redis is already in the stack

**Registration Flow: Two-Gate (Email Verification → Admin Approval)**

1. User submits registration form (validated by Zod)
2. Email verification sent (proves real email address)
3. User verifies email → account enters `pending_approval` state
4. Admin receives notification in review queue
5. Admin approves/rejects → user notified via email
6. On approval: account activated, user can log in

- Rationale: Email verification gate filters spam/fake signups before reaching admin queue, reducing admin workload

**RBAC Enforcement: Middleware + Centralized Permission Service**

- **Next.js middleware:** Coarse route protection (authenticated? admin? banned?)
- **Permission service (`src/services/permissions.ts`):** Fine-grained business logic checks (can this user create a post? has posting limit been reached? can they create a group at their tier?)
- Permission service called from API route handlers and server actions
- Permission matrix defined as configuration, not scattered conditionals
- Rationale: Middleware catches unauthorized access early; permission service keeps tier-based business logic DRY, testable, and centralized

**Rate Limiting: Layered (Cloudflare + Redis)**

- **Cloudflare edge:** DDoS protection, brute-force login prevention, IP-based rate limiting
- **Redis app-level:** Per-user, per-endpoint sliding window rate limiter. Tier-based posting limits (Basic: X posts/day, Professional: Y, Top-tier: Z), message rate limits, API call quotas
- Rationale: Cloudflare stops abuse before it hits the server; Redis handles the tier-based business logic limits

**E2E Encryption Readiness: Service Abstraction Layer**

- All chat message read/write operations routed through `MessageService` interface
- Phase 1: `PlaintextMessageService` implementation — stores/retrieves plaintext in PostgreSQL
- Phase 2+: Swap to `EncryptedMessageService` implementation — encrypt/decrypt without changing any calling code
- Interface defined now, encryption implementation deferred

### API & Communication Patterns

**API Design: Server Actions + REST Hybrid**

- **Server Actions:** Web-only form submissions and mutations (profile updates, post creation, settings changes). Fast DX, automatic revalidation.
- **REST Route Handlers (`/api/v1/*`):** Public API surface for endpoints that mobile apps will also consume (auth, chat, profiles, groups, events, content CRUD). TanStack Query calls these.
- **URL-based versioning:** `/api/v1/users`, `/api/v1/messages`, etc.
- Rationale: Server Actions for web DX; REST API as the contract for Phase 2 mobile apps and job portal subdomain SSO integration

**Error Handling: RFC 7807 Problem Details**

- Standard JSON error format: `{ type, title, status, detail, instance }`
- Zod validation errors mapped into the `detail` field with field-level error paths
- Consistent across Server Actions (thrown) and REST endpoints (returned)
- Error codes enumerated in shared constants for client-side handling

**Real-Time Architecture (Socket.IO):**

- **Namespaces:**
  - `/chat` — messaging (1:1 and group conversations)
  - `/notifications` — real-time notifications, presence indicators, unread counts
- **Room design (`/chat`):** One room per conversation (`conversation:{id}`), user joins rooms for all active conversations on connect
- **Presence:** Maintained in Redis (`user:{id}:online` with 30s TTL + heartbeat), broadcast via `/notifications` namespace
- **Message flow:** Client → Socket.IO server → validate + persist to PostgreSQL → broadcast to conversation room → update read receipts in Redis → TanStack Query cache invalidation on receiving clients
- **Reconnection:** Socket.IO auto-reconnect + message gap sync (client sends last received message timestamp, server replays missed messages from DB)
- **Scaling:** Redis adapter for Socket.IO enables multi-instance pub/sub — messages published on one server instance are delivered to clients connected to other instances

**File Upload Pipeline: Presigned URL to Object Storage**

- Client requests presigned upload URL from API (with file metadata: type, size)
- API validates file type whitelist and size limits, generates presigned URL for Hetzner Object Storage (S3-compatible)
- Client uploads directly to object storage (app server never handles file bytes)
- Upload completion triggers processing pipeline (background job):
  1. Virus scan (ClamAV in sidecar container)
  2. File type verification (magic bytes, not just extension)
  3. Image optimization (sharp: WebP/AVIF conversion, responsive srcset generation)
  4. CDN cache warming via Cloudflare
- File record updated in DB with processed URLs and metadata
- Rationale: Keeps Node.js server free for API requests, scales independently

### Frontend Architecture

**Component & Directory Structure: Feature-Based Co-location**

```
src/
  app/                  # Next.js App Router routes
  features/             # Domain modules (co-located)
    chat/               # components, hooks, actions, types, tests
    groups/
    feed/
    events/
    profiles/
    articles/
    notifications/
    admin/
    discover/
  components/
    ui/                 # shadcn/ui base components
    layout/             # Shell, nav, sidebar, footer
    shared/             # Reusable cross-feature components
  lib/                  # Utilities, config, constants
  db/                   # Drizzle schema, queries, migrations
    schema/             # Per-domain schema files
    queries/            # Reusable query builders
    migrations/         # Generated migration files
  services/             # Business logic (MessageService, PointsService, PermissionService, etc.)
  server/               # Server-only code (Socket.IO server, background jobs)
  i18n/                 # next-intl messages (en.json, ig.json), config
```

- Rationale: For 15+ subsystems, co-locating each feature's components, hooks, server actions, and types keeps related code together and scales as the project grows

**Rendering Strategy Per Route:**

| Route                          | Strategy                                      | Rationale                                               |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------- |
| `/` (landing)                  | SSR + ISR (60s)                               | SEO, fast FCP, infrequent content changes               |
| `/about`, `/terms`, `/privacy` | Static (SSG)                                  | Rarely changes, maximum performance                     |
| `/feed`                        | SSR shell + CSR content                       | Authenticated, personalized, real-time                  |
| `/chat`                        | CSR (client-only)                             | Fully real-time, WebSocket-driven, no SEO value         |
| `/groups`, `/events`           | SSR for public listings, CSR for member views | Public pages need SEO, member views are dynamic         |
| `/profiles/:id`                | SSR + ISR (300s)                              | Public profiles need SEO, semi-static                   |
| `/articles/:slug`              | SSR + ISR (60s)                               | SEO-critical, structured data, hreflang                 |
| `/admin/*`                     | CSR (client-only)                             | No SEO, authenticated, dashboard interactions           |
| `/discover`                    | SSR shell + CSR results                       | Geographic search is dynamic, shell provides loading UI |

- PPR (Partial Prerendering) enabled project-wide — static shells render instantly while dynamic slots stream in

**State Management Layers (No Global Store):**

| State Type           | Solution                                | Examples                                                         |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Server state (async) | TanStack Query                          | Profiles, posts, groups, events, articles, notifications         |
| Real-time state      | Socket.IO + TanStack Query invalidation | Chat messages, typing indicators, online presence, unread counts |
| Auth state           | Auth.js session + React Context         | Current user, session, permissions                               |
| UI state (local)     | React `useState` / `useReducer`         | Modal open/close, form inputs, accordion state                   |
| UI state (shared)    | React Context (scoped providers)        | Theme, sidebar collapsed, active chat conversation               |
| URL state            | Next.js `searchParams` + `useRouter`    | Filters, pagination, search queries, tab selection               |

- No Redux, no Zustand — TanStack Query replaces 90% of global state needs; React Context handles remaining shared UI state in scoped providers (`ChatProvider`, `ThemeProvider`)

**Bundle Optimization:**

- Dynamic imports for heavy features: chat (Socket.IO client), video SDK, rich text editor, admin dashboard
- Route-based code splitting automatic via App Router (each route segment = separate chunk)
- Image optimization via Next.js `<Image>` with WebP/AVIF and responsive `srcset`, served through Cloudflare CDN
- Font optimization via `next/font` with self-hosted Inter (no CLS from font swap)
- Tree shaking: shadcn/ui is copy-paste (no full library import), Radix primitives individually imported
- Lazy hydration with `React.lazy` + `Suspense` for below-fold components on SSR pages

### Infrastructure & Deployment

**Container Strategy: Two Containers**

- **Container 1 (web):** Next.js application (`next start`) — handles HTTP requests, SSR, API routes, Server Actions
- **Container 2 (realtime):** Socket.IO server (standalone Node.js) — handles WebSocket connections, chat, notifications, presence
- Communication between containers via Redis pub/sub (already in stack)
- Independent scaling: Socket.IO container can add replicas behind sticky-session load balancer without affecting web container
- Failure isolation: if realtime container crashes, web app continues in read-only mode (graceful degradation per NFRs)
- Rationale: At 500+ concurrent WebSocket connections, chat traffic spikes must not degrade API response times

**Container Orchestration: Docker Compose → Kubernetes Migration Path**

- **Launch:** Docker Compose on a single Hetzner dedicated server managing Next.js, Socket.IO, PostgreSQL, Redis containers
- **Scale trigger:** When approaching 2,000 concurrent users, migrate to Hetzner managed Kubernetes or self-hosted k3s
- **K8s readiness from day one:** Health check endpoints (`/api/health`), graceful shutdown handlers, 12-factor env config, stateless container design, readiness/liveness probe compatibility

**CI/CD Pipeline (GitHub Actions):**

```
PR opened/updated:
  ├── Lint (ESLint + Prettier) ─────────┐
  ├── Type check (tsc --noEmit) ────────┤ parallel
  ├── Unit tests (Vitest) ──────────────┤
  ├── Build (next build) ──────────────┘
  ├── E2E tests (Playwright against build)
  └── Lighthouse CI (performance budgets)

Merge to main:
  ├── All PR checks (above)
  ├── Build Docker images (web + realtime)
  ├── Push to GitHub Container Registry
  ├── Deploy to staging (automatic)
  └── Deploy to production (manual approval gate)
```

- Deploy mechanism: SSH + `docker compose pull && docker compose up -d` at launch; swap for `kubectl apply` on K8s migration
- No PR preview deployments at launch (use staging for verification)

**Environment Configuration: T3 Env with Zod Validation**

- `@t3-oss/env-nextjs` with Zod schemas for type-safe environment variables
- Build-time validation — missing or malformed env vars fail the build, not runtime
- Secrets in GitHub Actions secrets (CI) and Docker secrets / `.env` files on server (never committed)
- Three environments: `development` (local), `staging` (auto-deploy from main), `production` (manual gate)

**Monitoring & Logging: Hybrid Stack**

- **Error tracking:** Sentry (free tier) — error capture, performance monitoring, release tracking
- **Infrastructure metrics:** Self-hosted Prometheus + Grafana on Hetzner — CPU, memory, disk, network, container health, PostgreSQL stats, Redis stats, Socket.IO connection counts
- **Application logs:** stdout (Docker captures) — query via `docker logs`, pipe to Loki when log volume demands it
- **Uptime monitoring:** UptimeRobot or similar (free tier) — external health checks, downtime alerts
- Custom health check endpoint (`/api/health`) reporting: DB connectivity, Redis connectivity, Socket.IO server status

**Database Backup Strategy:**

- Automated daily `pg_dump` via cron job in sidecar container → compressed → uploaded to Hetzner Object Storage (S3-compatible)
- 30-day retention with lifecycle policy on storage bucket
- WAL archiving enabled for point-in-time recovery (PITR) — RPO well under 24h requirement
- Monthly automated restore test to verify backup integrity

### Decision Impact Analysis

**Implementation Sequence:**

1. Project scaffolding (create-next-app + dependencies + directory structure)
2. Database schema + Drizzle configuration + migration pipeline
3. Auth.js v5 setup + session strategy + RBAC middleware + permission service
4. i18n setup (next-intl with English + Igbo message files)
5. Core UI layout (shadcn/ui components, navigation, responsive shell)
6. REST API layer (`/api/v1/*`) with error handling and rate limiting
7. Socket.IO server (separate container) + Redis pub/sub + namespace/room setup
8. Feature modules (profiles → feed → chat → groups → events → articles → discover → admin)
9. File upload pipeline (presigned URLs + processing)
10. Notification system (in-app + email + push)
11. PWA setup (Serwist service worker)
12. CI/CD pipeline + Docker Compose deployment
13. Monitoring stack (Sentry + Prometheus/Grafana)

**Cross-Component Dependencies:**

- Auth (step 3) must exist before any feature module can enforce permissions
- Redis (step 2 config) must be available before session caching, rate limiting, presence, and Socket.IO adapter
- Socket.IO server (step 7) must be running before chat or real-time notifications
- File upload pipeline (step 9) is needed by profiles, feed, chat, articles, and groups
- Permission service (step 3) is called by every API route and server action
- Points engine touches feed, articles, groups, events, and profiles — must be a shared service
- Notification routing is triggered by chat, groups, events, articles, admin actions — must be event-driven to avoid coupling

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 28 areas across 5 categories where AI agents could make incompatible choices. All resolved below.

### Naming Patterns

**Database Naming Conventions:**

- Tables: `snake_case`, plural (`users`, `chat_messages`, `group_members`, `audit_logs`)
- Columns: `snake_case` (`created_at`, `user_id`, `display_name`, `deleted_at`)
- Foreign keys: `{referenced_table_singular}_id` (`user_id`, `group_id`, `conversation_id`)
- Indexes: `idx_{table}_{columns}` (`idx_users_email`, `idx_chat_messages_conversation_id_created_at`)
- Unique constraints: `unq_{table}_{columns}` (`unq_users_email`)
- Enums: `snake_case` type name, `SCREAMING_SNAKE` values (`membership_tier`: `BASIC`, `PROFESSIONAL`, `TOP_TIER`)

**API Naming Conventions:**

- REST endpoints: plural nouns, `kebab-case` for multi-word (`/api/v1/users`, `/api/v1/group-members`, `/api/v1/chat-messages`)
- Route parameters: `camelCase` (`/api/v1/users/:userId`, `/api/v1/groups/:groupId/members`)
- Query parameters: `camelCase` (`?pageSize=20&sortBy=createdAt`)
- HTTP methods: `GET` (read), `POST` (create), `PATCH` (partial update), `DELETE` (remove)

**Code Naming Conventions:**

- Components: `PascalCase` (`UserCard`, `ChatMessageList`, `GroupHeader`)
- Component files: `PascalCase.tsx` (`UserCard.tsx`, `ChatMessageList.tsx`)
- Non-component files: `kebab-case.ts` (`use-chat.ts`, `permissions.ts`, `points-engine.ts`)
- Functions/variables: `camelCase` (`getUserById`, `unreadCount`, `isOnline`)
- Constants: `SCREAMING_SNAKE` (`MAX_FILE_SIZE`, `DEFAULT_PAGE_SIZE`, `POSTING_LIMITS`)
- Types/interfaces: `PascalCase`, no `I` prefix (`User`, `ChatMessage`, `GroupMember` — not `IUser`)
- Zod schemas: `camelCase` suffixed with `Schema` (`createPostSchema`, `updateProfileSchema`)
- Server Actions: `camelCase` prefixed with verb (`createPost`, `updateProfile`, `deleteMessage`)
- Custom hooks: `camelCase` prefixed with `use` (`useChat`, `usePresence`, `usePermissions`)
- Feature directories: `kebab-case` if multi-word, singular concept (`chat`, `feed`, `admin`, `notifications`)

### Structure Patterns

**Test Location: Co-located with Source**

- Unit/component tests live next to the code they test: `UserCard.tsx` → `UserCard.test.tsx`
- E2E tests in `e2e/` at project root: `e2e/chat.spec.ts`, `e2e/registration.spec.ts`
- Test utilities in `src/test/` (`test-utils.tsx` with custom render, mock providers)
- Never create a separate `__tests__` directory tree

**Feature Module Structure:**

```
src/features/chat/
  components/              # Feature-specific components
    ChatWindow.tsx
    ChatWindow.test.tsx
    MessageBubble.tsx
    MessageBubble.test.tsx
  hooks/                   # Feature-specific hooks
    use-chat.ts
    use-typing-indicator.ts
  actions/                 # Server actions for this feature
    send-message.ts
    mark-read.ts
  types/                   # Feature-specific types
    index.ts
  utils/                   # Feature-specific utilities
    format-message.ts
  index.ts                 # Public API barrel export
```

**Barrel Export Rule:** Each feature has an `index.ts` that exports its public API. Other features import from the barrel, never from internal paths:

```typescript
// GOOD
import { ChatWindow } from "@/features/chat";
// BAD
import { ChatWindow } from "@/features/chat/components/ChatWindow";
```

**Config Files:** All at project root (`drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `serwist.config.ts`, `.env.example`)

### Format Patterns

**API Response Formats:**

Success response:

```json
{ "data": { ... }, "meta": { "page": 1, "pageSize": 20, "total": 142 } }
```

Error response (RFC 7807 Problem Details):

```json
{
  "type": "https://igbo.app/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "Posting limit reached for Basic tier",
  "instance": "/api/v1/posts"
}
```

Validation error:

```json
{
  "type": "https://igbo.app/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": { "fieldErrors": { "email": ["Invalid email format"] } },
  "instance": "/api/v1/users"
}
```

**Data Exchange Formats:**

- JSON fields: `camelCase` at API boundary — Drizzle handles `snake_case` DB ↔ `camelCase` TypeScript mapping
- Dates: ISO 8601 strings in JSON (`"2026-02-19T14:30:00Z"`), `Date` objects in TypeScript
- Booleans: `true`/`false` (never `1`/`0`)
- Null: explicit `null` for absent values, never `undefined` in API responses
- Pagination: cursor-based for feeds/chat (`?cursor=abc&limit=20`), offset-based for admin lists (`?page=1&pageSize=20`)

### Communication Patterns

**Socket.IO Event Conventions:**

- Event names: `snake_case` with colon namespace (`message:send`, `message:delivered`, `message:read`, `typing:start`, `typing:stop`, `presence:online`, `presence:offline`)
- Event payloads: always an object with `camelCase` keys, always include a `timestamp` field

```json
{
  "conversationId": "conv_123",
  "content": "Ndewo!",
  "senderId": "usr_456",
  "timestamp": "2026-02-19T14:30:00Z"
}
```

**Application Events (Internal EventBus):**

- Event names: `domain.action` pattern, past tense (`user.created`, `post.published`, `message.sent`, `points.awarded`, `member.banned`)
- Emitted via a shared `EventBus` service (in-process for Phase 1, extractable to message queue for Phase 2)
- Consumers: notification service, points engine, audit logger, moderation pipeline

**Logging Standard:**

- Structured JSON logs to stdout: `{ level, message, timestamp, context, traceId }`
- Levels: `error` (failures requiring attention), `warn` (unexpected but handled), `info` (business events), `debug` (development only)
- Always include `traceId` for request correlation across services
- Never log PII (emails, passwords, tokens) — log user IDs only

### Process Patterns

**Error Handling:**

- API routes: try/catch at route level, map to RFC 7807 responses, log with `error` level
- Server Actions: throw typed `ActionError` class (with `code` and `message`), caught by client error boundaries
- Client components: React Error Boundaries per feature area (chat error boundary, feed error boundary), global fallback at app level
- Never swallow errors silently — always log or re-throw
- User-facing messages: translated via i18n, never expose internal error details or stack traces

**Loading State Patterns:**

- Use TanStack Query's `isPending`, `isError`, `data` directly — don't create parallel loading state
- Skeleton components for initial loads (not spinners): `<UserCardSkeleton />`, `<FeedItemSkeleton />`
- Optimistic updates for user-initiated mutations (post creation, message send, like/react) — roll back on error
- `Suspense` boundaries co-located with data-fetching components

**Validation Pattern:**

- Single source of truth: Zod schemas defined once, shared between client and server
- Client: validate on submit (not on every keystroke), show field-level errors
- Server: always re-validate (never trust client), return 422 with field errors
- Drizzle integration: Zod schemas derived from Drizzle table definitions where possible (`createInsertSchema` from `drizzle-zod`)

### Enforcement Guidelines

**All AI Agents MUST:**

1. Follow the naming conventions exactly — no exceptions for personal preference
2. Co-locate tests with source code, never create a separate `__tests__` directory tree
3. Use barrel exports for feature modules — never import from internal feature paths
4. Return RFC 7807 error responses from all API endpoints
5. Use TanStack Query for all server state — never `useEffect` + `useState` for data fetching
6. Add `traceId` to all log entries
7. Validate with Zod on both client and server
8. Use skeleton components (not spinners) for loading states
9. Emit application events for all state-changing operations (for audit log, notifications, points)
10. Never log PII — user IDs only

**Anti-Patterns to Avoid:**

- `any` type in TypeScript — use `unknown` and narrow with type guards
- `console.log` in production code — use structured logger service
- Inline SQL queries — always use Drizzle query builder
- Direct DOM manipulation — use React state and refs
- Synchronous file operations on the server
- Hardcoded strings in UI — always use i18n message keys
- `useEffect` + `fetch` for data loading — use TanStack Query
- Importing from internal feature module paths — use barrel exports
- Creating separate `__tests__` directories — co-locate tests with source
- Mutable state updates — use immutable patterns (spread, map, filter)

## Project Structure & Boundaries

### Complete Project Directory Structure

```
igbo/
├── .github/
│   └── workflows/
│       ├── ci.yml                          # PR checks (lint, type-check, test, build, Lighthouse)
│       ├── deploy-staging.yml              # Auto-deploy to staging on merge to main
│       └── deploy-production.yml           # Manual approval gate for production
├── .env.example                            # Documented env var template
├── .eslintrc.cjs                           # ESLint config (Next.js preset)
├── .gitignore
├── .prettierrc                             # Prettier config
├── docker-compose.yml                      # Local dev: web, realtime, postgres, redis
├── docker-compose.prod.yml                 # Production: web, realtime (external DB/Redis)
├── Dockerfile.web                          # Next.js container
├── Dockerfile.realtime                     # Socket.IO container
├── drizzle.config.ts                       # Drizzle Kit configuration
├── next.config.ts                          # Next.js 16 config (PPR, i18n, Serwist)
├── package.json
├── playwright.config.ts                    # E2E test configuration
├── postcss.config.js                       # PostCSS for Tailwind
├── serwist.config.ts                       # PWA service worker configuration
├── tailwind.config.ts                      # Tailwind CSS v4 config
├── tsconfig.json                           # TypeScript strict config
├── vitest.config.ts                        # Unit test configuration
│
├── e2e/                                    # End-to-end tests (Playwright)
│   ├── fixtures/                           # Shared test fixtures and page objects
│   │   └── auth.fixture.ts
│   ├── registration.spec.ts
│   ├── login.spec.ts
│   ├── chat.spec.ts
│   ├── feed.spec.ts
│   ├── groups.spec.ts
│   ├── events.spec.ts
│   ├── admin.spec.ts
│   └── discover.spec.ts
│
├── public/
│   ├── icons/                              # PWA icons (multiple sizes)
│   ├── images/                             # Static images (logo, fallbacks)
│   ├── manifest.json                       # PWA web app manifest
│   └── sw.js                               # Generated service worker (Serwist output)
│
└── src/
    ├── app/                                # Next.js App Router
    │   ├── globals.css                     # Tailwind base + custom CSS vars
    │   ├── layout.tsx                      # Root layout (providers, fonts, i18n)
    │   ├── not-found.tsx                   # Global 404 page
    │   ├── error.tsx                       # Global error boundary
    │   ├── (guest)/                        # Route group: public/SEO pages (SSR)
    │   │   ├── page.tsx                    # Landing page
    │   │   ├── about/page.tsx
    │   │   ├── terms/page.tsx
    │   │   ├── privacy/page.tsx
    │   │   └── layout.tsx                  # Guest layout (marketing nav)
    │   ├── (auth)/                         # Route group: auth flow pages
    │   │   ├── login/page.tsx
    │   │   ├── register/page.tsx
    │   │   ├── verify-email/page.tsx
    │   │   ├── pending-approval/page.tsx
    │   │   ├── forgot-password/page.tsx
    │   │   └── layout.tsx                  # Auth layout (centered card)
    │   ├── (app)/                          # Route group: authenticated app (CSR-heavy)
    │   │   ├── layout.tsx                  # App shell (sidebar, bottom nav, providers)
    │   │   ├── feed/page.tsx               # News feed
    │   │   ├── chat/
    │   │   │   ├── page.tsx                # Conversation list
    │   │   │   └── [conversationId]/page.tsx
    │   │   ├── groups/
    │   │   │   ├── page.tsx                # Groups listing
    │   │   │   └── [groupId]/
    │   │   │       ├── page.tsx            # Group detail
    │   │   │       └── settings/page.tsx
    │   │   ├── events/
    │   │   │   ├── page.tsx                # Events listing
    │   │   │   └── [eventId]/page.tsx
    │   │   ├── articles/
    │   │   │   ├── page.tsx                # Articles listing
    │   │   │   └── [slug]/page.tsx
    │   │   ├── discover/page.tsx           # Member discovery
    │   │   ├── profiles/
    │   │   │   └── [userId]/page.tsx       # Public profile
    │   │   ├── settings/
    │   │   │   ├── page.tsx                # General settings
    │   │   │   ├── profile/page.tsx
    │   │   │   ├── notifications/page.tsx
    │   │   │   ├── privacy/page.tsx
    │   │   │   └── security/page.tsx
    │   │   └── notifications/page.tsx      # Notification center
    │   ├── (admin)/                        # Route group: admin dashboard
    │   │   ├── layout.tsx                  # Admin layout (admin sidebar)
    │   │   ├── admin/
    │   │   │   ├── page.tsx                # Dashboard overview
    │   │   │   ├── members/page.tsx        # Member management
    │   │   │   ├── approvals/page.tsx      # Registration approval queue
    │   │   │   ├── moderation/page.tsx     # Content moderation queue
    │   │   │   ├── reports/page.tsx        # Member reports
    │   │   │   ├── analytics/page.tsx      # Platform analytics
    │   │   │   └── audit-log/page.tsx      # Audit log viewer
    │   └── api/
    │       ├── health/route.ts             # Health check endpoint
    │       ├── upload/
    │       │   └── presign/route.ts        # Presigned URL generation
    │       └── v1/                         # Versioned REST API
    │           ├── auth/
    │           │   ├── register/route.ts
    │           │   ├── login/route.ts
    │           │   ├── logout/route.ts
    │           │   ├── verify-email/route.ts
    │           │   └── session/route.ts
    │           ├── users/
    │           │   ├── route.ts            # GET list, POST create
    │           │   ├── [userId]/route.ts   # GET, PATCH, DELETE
    │           │   └── [userId]/points/route.ts
    │           ├── profiles/
    │           │   └── [userId]/route.ts
    │           ├── feed/
    │           │   └── route.ts            # GET (cursor-paginated)
    │           ├── posts/
    │           │   ├── route.ts            # POST create
    │           │   └── [postId]/
    │           │       ├── route.ts        # GET, PATCH, DELETE
    │           │       ├── likes/route.ts
    │           │       └── comments/route.ts
    │           ├── articles/
    │           │   ├── route.ts
    │           │   └── [slug]/route.ts
    │           ├── messages/
    │           │   ├── route.ts
    │           │   └── [conversationId]/route.ts
    │           ├── conversations/
    │           │   ├── route.ts
    │           │   └── [conversationId]/
    │           │       ├── route.ts
    │           │       └── members/route.ts
    │           ├── groups/
    │           │   ├── route.ts
    │           │   └── [groupId]/
    │           │       ├── route.ts
    │           │       └── members/route.ts
    │           ├── events/
    │           │   ├── route.ts
    │           │   └── [eventId]/
    │           │       ├── route.ts
    │           │       └── attendees/route.ts
    │           ├── notifications/
    │           │   ├── route.ts
    │           │   └── preferences/route.ts
    │           ├── discover/
    │           │   └── route.ts            # Geographic member search
    │           └── admin/
    │               ├── approvals/route.ts
    │               ├── moderation/route.ts
    │               ├── reports/route.ts
    │               └── audit-log/route.ts
    │
    ├── features/                           # Domain feature modules (co-located)
    │   ├── auth/
    │   │   ├── components/
    │   │   │   ├── LoginForm.tsx
    │   │   │   ├── RegisterForm.tsx
    │   │   │   └── TwoFactorDialog.tsx
    │   │   ├── actions/
    │   │   │   ├── login.ts
    │   │   │   ├── register.ts
    │   │   │   └── verify-email.ts
    │   │   ├── hooks/
    │   │   │   └── use-session.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── feed/
    │   │   ├── components/
    │   │   │   ├── FeedList.tsx
    │   │   │   ├── FeedItem.tsx
    │   │   │   ├── FeedItemSkeleton.tsx
    │   │   │   ├── CreatePostForm.tsx
    │   │   │   ├── CommentThread.tsx
    │   │   │   └── LikeButton.tsx
    │   │   ├── actions/
    │   │   │   ├── create-post.ts
    │   │   │   ├── like-post.ts
    │   │   │   └── add-comment.ts
    │   │   ├── hooks/
    │   │   │   └── use-feed.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── chat/
    │   │   ├── components/
    │   │   │   ├── ChatWindow.tsx
    │   │   │   ├── ConversationList.tsx
    │   │   │   ├── MessageBubble.tsx
    │   │   │   ├── MessageInput.tsx
    │   │   │   ├── TypingIndicator.tsx
    │   │   │   └── ChatSkeleton.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-chat.ts
    │   │   │   ├── use-typing-indicator.ts
    │   │   │   └── use-conversations.ts
    │   │   ├── actions/
    │   │   │   ├── send-message.ts
    │   │   │   └── mark-read.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── groups/
    │   │   ├── components/
    │   │   │   ├── GroupCard.tsx
    │   │   │   ├── GroupList.tsx
    │   │   │   ├── GroupHeader.tsx
    │   │   │   ├── GroupSettings.tsx
    │   │   │   └── MemberList.tsx
    │   │   ├── actions/
    │   │   │   ├── create-group.ts
    │   │   │   ├── join-group.ts
    │   │   │   └── update-group.ts
    │   │   ├── hooks/
    │   │   │   └── use-groups.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── events/
    │   │   ├── components/
    │   │   │   ├── EventCard.tsx
    │   │   │   ├── EventList.tsx
    │   │   │   ├── EventDetail.tsx
    │   │   │   ├── CreateEventForm.tsx
    │   │   │   └── AttendeeList.tsx
    │   │   ├── actions/
    │   │   │   ├── create-event.ts
    │   │   │   └── rsvp-event.ts
    │   │   ├── hooks/
    │   │   │   └── use-events.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── articles/
    │   │   ├── components/
    │   │   │   ├── ArticleCard.tsx
    │   │   │   ├── ArticleList.tsx
    │   │   │   ├── ArticleReader.tsx
    │   │   │   └── ArticleEditor.tsx
    │   │   ├── actions/
    │   │   │   ├── publish-article.ts
    │   │   │   └── update-article.ts
    │   │   ├── hooks/
    │   │   │   └── use-articles.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── profiles/
    │   │   ├── components/
    │   │   │   ├── ProfileCard.tsx
    │   │   │   ├── ProfileHeader.tsx
    │   │   │   ├── EditProfileForm.tsx
    │   │   │   ├── BadgeDisplay.tsx
    │   │   │   └── ProfileSkeleton.tsx
    │   │   ├── actions/
    │   │   │   └── update-profile.ts
    │   │   ├── hooks/
    │   │   │   └── use-profile.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── discover/
    │   │   ├── components/
    │   │   │   ├── DiscoverSearch.tsx
    │   │   │   ├── MemberGrid.tsx
    │   │   │   └── GeoFallbackIndicator.tsx
    │   │   ├── hooks/
    │   │   │   └── use-discover.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   ├── notifications/
    │   │   ├── components/
    │   │   │   ├── NotificationList.tsx
    │   │   │   ├── NotificationItem.tsx
    │   │   │   ├── NotificationBadge.tsx
    │   │   │   └── NotificationPreferences.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-notifications.ts
    │   │   │   └── use-push-subscription.ts
    │   │   ├── actions/
    │   │   │   ├── mark-notification-read.ts
    │   │   │   └── update-preferences.ts
    │   │   ├── types/index.ts
    │   │   └── index.ts
    │   └── admin/
    │       ├── components/
    │       │   ├── DashboardStats.tsx
    │       │   ├── ApprovalQueue.tsx
    │       │   ├── ModerationQueue.tsx
    │       │   ├── ReportViewer.tsx
    │       │   ├── MemberTable.tsx
    │       │   ├── AuditLogTable.tsx
    │       │   └── AnalyticsDashboard.tsx
    │       ├── actions/
    │       │   ├── approve-member.ts
    │       │   ├── moderate-content.ts
    │       │   ├── ban-member.ts
    │       │   └── resolve-report.ts
    │       ├── hooks/
    │       │   ├── use-admin-stats.ts
    │       │   └── use-audit-log.ts
    │       ├── types/index.ts
    │       └── index.ts
    │
    ├── components/                         # Shared components
    │   ├── ui/                             # shadcn/ui base (auto-generated)
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   ├── dialog.tsx
    │   │   ├── input.tsx
    │   │   ├── select.tsx
    │   │   ├── toast.tsx
    │   │   ├── skeleton.tsx
    │   │   └── ...                         # Other shadcn components as needed
    │   ├── layout/
    │   │   ├── AppShell.tsx                # Authenticated app shell
    │   │   ├── GuestShell.tsx              # Public/marketing shell
    │   │   ├── AdminShell.tsx              # Admin dashboard shell
    │   │   ├── Sidebar.tsx
    │   │   ├── BottomNav.tsx               # Mobile bottom navigation
    │   │   ├── TopNav.tsx                  # Desktop top navigation
    │   │   └── Footer.tsx
    │   └── shared/
    │       ├── Avatar.tsx                  # User avatar with fallback
    │       ├── FileUpload.tsx              # Presigned URL upload component
    │       ├── RichTextEditor.tsx          # Shared text editor
    │       ├── InfiniteScroll.tsx          # Cursor-based infinite scroll
    │       ├── ErrorBoundary.tsx           # Reusable error boundary
    │       ├── LanguageToggle.tsx          # EN/IG switcher
    │       └── OnlineIndicator.tsx         # Presence dot
    │
    ├── db/                                 # Database layer (Drizzle)
    │   ├── index.ts                        # DB connection + Drizzle instance
    │   ├── schema/
    │   │   ├── index.ts                    # Re-exports all schemas
    │   │   ├── auth-users.ts              # users, sessions, accounts, verification_tokens
    │   │   ├── auth-permissions.ts        # roles, permissions, user_roles
    │   │   ├── community-profiles.ts      # profiles, badges, user_badges
    │   │   ├── community-posts.ts         # posts, comments, likes, post_media
    │   │   ├── community-articles.ts      # articles, article_tags
    │   │   ├── community-groups.ts        # groups, group_members, group_channels
    │   │   ├── community-events.ts        # events, event_attendees
    │   │   ├── chat-conversations.ts      # conversations, conversation_members
    │   │   ├── chat-messages.ts           # messages, message_reactions, message_attachments
    │   │   ├── platform-notifications.ts  # notifications, notification_preferences
    │   │   ├── platform-points.ts         # points_ledger, points_rules, posting_limits
    │   │   ├── platform-reports.ts        # reports, moderation_actions, moderation_keywords
    │   │   ├── platform-audit.ts          # audit_logs
    │   │   └── platform-files.ts          # uploaded_files
    │   ├── queries/                        # Reusable query builders
    │   │   ├── users.ts
    │   │   ├── posts.ts
    │   │   ├── messages.ts
    │   │   └── notifications.ts
    │   └── migrations/                     # Generated migration files (drizzle-kit)
    │       └── .gitkeep
    │
    ├── services/                           # Business logic services
    │   ├── permissions.ts                  # RBAC permission service (tier checks, posting limits)
    │   ├── points-engine.ts                # Points calculation, badge multipliers, ledger
    │   ├── message-service.ts              # MessageService interface + PlaintextMessageService
    │   ├── notification-service.ts         # Multi-channel notification routing
    │   ├── moderation-service.ts           # Keyword filtering, flagging, progressive discipline
    │   ├── event-bus.ts                    # Application event emitter/subscriber
    │   ├── audit-logger.ts                 # Structured audit logging service
    │   ├── email-service.ts                # Transactional email sending
    │   ├── push-service.ts                 # Web Push API notification delivery
    │   └── geo-search.ts                   # Geographic fallback search logic
    │
    ├── server/                             # Server-only code
    │   ├── realtime/
    │   │   ├── index.ts                    # Socket.IO server entry point
    │   │   ├── namespaces/
    │   │   │   ├── chat.ts                 # /chat namespace handlers
    │   │   │   └── notifications.ts        # /notifications namespace handlers
    │   │   ├── middleware/
    │   │   │   └── auth.ts                 # Socket.IO auth middleware
    │   │   └── adapters/
    │   │       └── redis.ts                # Redis adapter for multi-instance
    │   └── jobs/
    │       ├── notification-digest.ts      # Digest email aggregation
    │       ├── retention-cleanup.ts        # GDPR retention enforcement
    │       ├── backup.ts                   # Database backup trigger
    │       └── file-processing.ts          # Post-upload virus scan + optimization
    │
    ├── lib/                                # Shared utilities and configuration
    │   ├── auth.ts                         # Auth.js v5 configuration
    │   ├── db.ts                           # Database connection (re-export from db/index)
    │   ├── redis.ts                        # Redis client (ioredis)
    │   ├── env.ts                          # T3 Env type-safe env vars
    │   ├── api-error.ts                    # RFC 7807 error helpers
    │   ├── action-error.ts                 # Server Action typed error class
    │   ├── logger.ts                       # Structured JSON logger
    │   ├── rate-limiter.ts                 # Redis-based sliding window rate limiter
    │   ├── validators.ts                   # Shared Zod schemas (pagination, IDs, etc.)
    │   └── utils.ts                        # Generic utility functions (cn, formatDate, etc.)
    │
    ├── i18n/                               # Internationalization
    │   ├── config.ts                       # next-intl configuration
    │   ├── request.ts                      # Server-side i18n request config
    │   └── messages/
    │       ├── en.json                     # English translations
    │       └── ig.json                     # Igbo translations (with diacritics)
    │
    ├── middleware.ts                        # Next.js middleware (auth, i18n, rate limiting)
    │
    ├── providers/                          # React context providers
    │   ├── query-provider.tsx              # TanStack Query provider
    │   ├── session-provider.tsx            # Auth.js session provider
    │   ├── socket-provider.tsx             # Socket.IO connection provider
    │   ├── theme-provider.tsx              # Theme (light/dark/high contrast)
    │   └── toast-provider.tsx              # Toast notification provider
    │
    └── test/                               # Test utilities
        ├── test-utils.tsx                  # Custom render with all providers
        ├── mocks/
        │   ├── handlers.ts                 # MSW API mock handlers
        │   ├── server.ts                   # MSW server setup
        │   └── data.ts                     # Factory functions for test data
        └── setup.ts                        # Vitest global setup
```

### Architectural Boundaries

**API Boundaries:**

- `/api/v1/*` — Public REST API (consumed by web app via TanStack Query, future mobile apps, job portal subdomain)
- `/api/health` — Infrastructure health check (Docker health checks, uptime monitoring)
- `/api/upload/presign` — File upload presigned URL generation (internal use)
- Socket.IO server (separate container, port 3001) — Real-time WebSocket API

**Service Boundaries:**

- `src/services/*` — Business logic layer. Services call `src/db/queries/*` for data access. API routes and server actions call services. Services never call each other directly — they communicate via `EventBus`.
- `src/server/realtime/*` — Socket.IO server. Communicates with main app only via Redis pub/sub. Has its own auth middleware that validates sessions via Redis.
- `src/server/jobs/*` — Background jobs. Triggered by cron (retention, backup, digest) or events (file processing). Access DB directly.

**Data Boundaries:**

- `src/db/schema/*` — Single source of truth for all table definitions. Domain-prefixed naming (`auth_*`, `community_*`, `chat_*`, `platform_*`).
- `src/db/queries/*` — Reusable query builders. Only place where Drizzle queries are constructed. Services consume these, never write raw queries.
- Redis: session cache, presence state, rate limiting counters, Socket.IO adapter, points balance cache. Never used as primary data store.

**Component Boundaries:**

- `src/features/*/` — Feature modules own their components, hooks, actions, and types. Export public API via barrel `index.ts`. Never import from another feature's internals.
- `src/components/ui/` — shadcn/ui primitives. No business logic. Used by all features.
- `src/components/shared/` — Cross-feature reusable components (Avatar, FileUpload, InfiniteScroll). No feature-specific logic.
- `src/components/layout/` — App shells and navigation. Compose feature components but don't contain feature logic.

### Requirements to Structure Mapping

**FR Category → Feature Module Mapping:**

| FR Category                   | FRs       | Feature Module                         | Key Files                                                      |
| ----------------------------- | --------- | -------------------------------------- | -------------------------------------------------------------- |
| Authentication & Registration | FR1-FR8   | `features/auth`                        | actions/register.ts, actions/login.ts                          |
| User Profiles & Badges        | FR9-FR16  | `features/profiles`                    | components/ProfileHeader.tsx, BadgeDisplay.tsx                 |
| Member Discovery              | FR17-FR18 | `features/discover`                    | components/DiscoverSearch.tsx, services/geo-search.ts          |
| Member Tiers & Points         | FR19-FR25 | `features/profiles` + `services/`      | services/points-engine.ts, services/permissions.ts             |
| Community Events              | FR26-FR30 | `features/events`                      | components/EventDetail.tsx, actions/create-event.ts            |
| Real-Time Communication       | FR31-FR40 | `features/chat` + `server/realtime/`   | server/realtime/namespaces/chat.ts, hooks/use-chat.ts          |
| Groups & Channels             | FR41-FR48 | `features/groups`                      | components/GroupCard.tsx, actions/create-group.ts              |
| News Feed & Content           | FR49-FR56 | `features/feed`                        | components/FeedList.tsx, actions/create-post.ts                |
| Articles & Knowledge          | FR57-FR62 | `features/articles`                    | components/ArticleEditor.tsx, actions/publish-article.ts       |
| Video Conferencing            | FR63-FR71 | `features/events` (video submodule)    | Dynamic import of video SDK                                    |
| Notifications                 | FR72-FR77 | `features/notifications` + `services/` | services/notification-service.ts, hooks/use-notifications.ts   |
| Settings & Preferences        | FR78-FR82 | `app/(app)/settings/` pages            | Multiple settings page.tsx files                               |
| Admin & Moderation            | FR83-FR92 | `features/admin`                       | components/ModerationQueue.tsx, services/moderation-service.ts |
| Platform & System             | FR93-FR96 | `lib/` + `services/`                   | lib/logger.ts, services/audit-logger.ts                        |
| Accessibility                 | FR97-FR99 | Cross-cutting (all components)         | components/ui/\* (WCAG-compliant base)                         |

**Cross-Cutting Concern → Location Mapping:**

| Concern            | Primary Location                                                                                      | Touched By                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| RBAC               | `services/permissions.ts` + `middleware.ts`                                                           | Every API route, every server action          |
| i18n               | `i18n/messages/{en,ig}.json` + `i18n/config.ts`                                                       | Every component with user-facing text         |
| Audit Logging      | `services/audit-logger.ts`                                                                            | All admin actions, all moderation actions     |
| GDPR               | `db/schema/*` (deletedAt columns) + `server/jobs/retention-cleanup.ts`                                | All PII-containing tables                     |
| Points Engine      | `services/points-engine.ts` + `db/schema/platform-points.ts`                                          | Feed, articles, groups, events, profiles      |
| Content Moderation | `services/moderation-service.ts` + `db/schema/platform-reports.ts`                                    | Posts, comments, articles, messages, profiles |
| File Uploads       | `components/shared/FileUpload.tsx` + `api/upload/presign/route.ts` + `server/jobs/file-processing.ts` | Profiles, feed, chat, articles, groups        |
| Notifications      | `services/notification-service.ts` + `services/event-bus.ts`                                          | Chat, groups, events, articles, admin, system |

### Integration Points

**Internal Communication:**

- Feature → Service: Direct function call (e.g., server action calls `permissionService.canCreatePost(userId)`)
- Service → Service: Via `EventBus` (e.g., `post.published` event → points engine awards points → notification service sends alerts)
- Web container → Realtime container: Redis pub/sub only (no direct HTTP calls between containers)
- Client → Realtime: Socket.IO WebSocket connection (authenticated via session token)

**External Integrations:**

- **Cloudflare CDN:** Edge caching, DDoS protection, image optimization CDN
- **Hetzner Object Storage:** File uploads via presigned URLs (S3-compatible API)
- **Email provider** (TBD: Resend, Postmark, or SendGrid): Transactional emails via `services/email-service.ts`
- **Video SDK** (Agora or Daily.co): Dynamic import in event video feature, SDK credentials via env vars
- **Web Push API:** Push notifications via `services/push-service.ts`, VAPID keys in env vars
- **Sentry:** Error tracking and performance monitoring, initialized in `src/app/layout.tsx`

**Data Flow (Post Creation Example):**

1. User submits form → `features/feed/actions/create-post.ts` (Server Action)
2. Server Action → `services/permissions.ts` (check posting limit for tier)
3. Server Action → `db/queries/posts.ts` (insert post)
4. Server Action → `services/event-bus.ts` (emit `post.published`)
5. EventBus → `services/points-engine.ts` (award activity points)
6. EventBus → `services/notification-service.ts` (notify group members / followers)
7. EventBus → `services/audit-logger.ts` (log if admin action)
8. Notification service → Redis pub/sub → Socket.IO `/notifications` namespace → client TanStack Query invalidation

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**
All 12 technology pairings validated — no conflicts found. Key validations: Next.js 16 + Auth.js v5 (purpose-built for App Router), Socket.IO in separate container avoids edge runtime limitations, Drizzle + Zod bridge via `drizzle-zod`, TanStack Query works with both Server Actions and REST endpoints, Serwist integrates with Next.js build pipeline, shadcn/ui 3.0 is built for Tailwind v4.

**Pattern Consistency:**
Naming conventions have clear boundaries at each layer: `snake_case` in DB, `camelCase` in JS/TS/API, `PascalCase` for components/types. Drizzle handles DB↔TS field mapping automatically. RFC 7807 applies to all REST routes; `ActionError` class for Server Actions — distinct, non-overlapping patterns. Socket.IO events (`colon:separated`) vs EventBus events (`dot.separated`) are clearly distinguished by transport.

**Structure Alignment:**
Feature-based co-location matches barrel export pattern. `src/services/` separation matches "services communicate via EventBus" boundary. `src/server/realtime/` isolation matches two-container deployment. `src/db/queries/` as single query construction point enforces "no inline SQL" rule.

### Requirements Coverage Validation

**Functional Requirements (99 FRs across 15 categories):**

| FR Category                   | FRs       | Coverage                                                                                             |
| ----------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| Authentication & Registration | FR1-FR8   | FULL — Auth.js v5, two-gate registration, RBAC middleware                                            |
| User Profiles & Badges        | FR9-FR16  | FULL — features/profiles, community-profiles schema                                                  |
| Member Discovery              | FR17-FR18 | FULL — geo-search service, geographic fallback queries                                               |
| Member Tiers & Points         | FR19-FR25 | FULL — permissions service, points-engine, Redis cache                                               |
| Community Events              | FR26-FR30 | FULL — features/events, video SDK dynamic import                                                     |
| Real-Time Communication       | FR31-FR40 | FULL — Socket.IO /chat namespace, rooms, Redis presence, MessageService abstraction                  |
| Groups & Channels             | FR41-FR48 | FULL — features/groups, permission checks                                                            |
| News Feed & Content           | FR49-FR56 | FULL — features/feed, cursor pagination, optimistic updates                                          |
| Articles & Knowledge          | FR57-FR62 | FULL — features/articles, SSR+ISR for SEO                                                            |
| Video Conferencing            | FR63-FR71 | FULL — dynamic import of Agora/Daily.co SDK                                                          |
| Notifications                 | FR72-FR77 | FULL — notification-service, push-service, email-service, per-type preferences                       |
| Settings & Preferences        | FR78-FR82 | FULL — settings pages, Zod-validated forms                                                           |
| Admin & Moderation            | FR83-FR92 | FULL — features/admin, moderation-service, bilingual keywords, progressive discipline, audit logging |
| Platform & System             | FR93-FR96 | FULL — audit-logger, structured logging                                                              |
| Accessibility                 | FR97-FR99 | FULL — shadcn/ui + Radix primitives, semantic HTML, keyboard nav, contrast ratios                    |

**Non-Functional Requirements (53 NFRs across 6 categories):**

| NFR Category      | Coverage                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Performance (12)  | FULL — SSR+ISR+PPR, Redis caching, Socket.IO, Cloudflare CDN, bundle optimization                                     |
| Security (12)     | FULL — Cloudflare TLS, PostgreSQL encryption, Auth.js 2FA, CSP middleware, ClamAV sidecar, soft-delete, audit service |
| Scalability (7)   | FULL — Two-container architecture, Redis adapter for Socket.IO, Docker Compose→K8s path                               |
| Accessibility (9) | FULL — Radix UI primitives (accessible by default), WCAG 2.1 AA compliance                                            |
| Integration (6)   | FULL — SDK integration, managed email provider, Web Push API, Cloudflare cache rules                                  |
| Reliability (7)   | FULL — Health checks, Docker restart policies, daily backups + WAL PITR, Socket.IO auto-reconnect + gap sync          |

### Implementation Readiness Validation

**Decision Completeness:** All critical decisions documented with technology names, version constraints, and rationale. Implementation patterns include concrete code examples for naming, file structure, API responses, and Socket.IO events.

**Structure Completeness:** Full project tree with 160+ files/directories defined. Every FR category mapped to specific feature modules and files. All integration points specified.

**Pattern Completeness:** 28 conflict points addressed. 10 mandatory agent rules. 10 anti-patterns documented. Barrel export rules, test co-location, error handling flows all specified with examples.

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps (non-blocking):**

1. **Email provider TBD** — Resend, Postmark, or SendGrid. Service interface abstracts the choice; decide during email service implementation.
2. **Video SDK TBD** — Agora vs Daily.co. Dynamic import pattern means either integrates without architectural changes.

**Nice-to-Have (future enhancements):**

1. Dedicated search infrastructure (Meilisearch/Typesense) — not needed at 500 users, PostgreSQL full-text search suffices
2. Background job scheduler (BullMQ) — Docker cron suffices at launch scale
3. Feature flag system — useful for Phase 2 gradual rollouts

### Architecture Completeness Checklist

**Requirements Analysis:**

- [x] Project context thoroughly analyzed (99 FRs, 53 NFRs)
- [x] Scale and complexity assessed (High, 12-15 subsystems)
- [x] Technical constraints identified (PRD-specified stack + Phase 2 implications)
- [x] Cross-cutting concerns mapped (10 concerns with location mapping)

**Architectural Decisions:**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (17 packages)
- [x] Integration patterns defined (EventBus, Redis pub/sub, presigned URLs)
- [x] Performance considerations addressed (caching, rendering, bundles)

**Implementation Patterns:**

- [x] Naming conventions established (DB, API, code)
- [x] Structure patterns defined (feature co-location, barrel exports, test placement)
- [x] Communication patterns specified (Socket.IO events, EventBus, logging)
- [x] Process patterns documented (error handling, loading states, validation)

**Project Structure:**

- [x] Complete directory structure defined
- [x] Component boundaries established (features, services, DB, realtime)
- [x] Integration points mapped (internal and external)
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**

- Clean separation between web and realtime containers enables independent scaling
- Feature-based co-location with barrel exports prevents cross-feature coupling
- EventBus pattern decouples services while enabling the points/notification/audit trifecta
- MessageService abstraction prepares for E2E encryption without premature complexity
- Hybrid rendering strategy (SSR/CSR/ISR/PPR per route) optimizes both SEO and interactivity
- Two-gate registration + Redis-cached database sessions enables instant moderation enforcement
- Domain-prefixed table naming enables clean Phase 2 schema extraction

**Areas for Future Enhancement:**

- Dedicated search infrastructure (Meilisearch) when full-text search performance degrades
- BullMQ job scheduler when background job complexity grows beyond cron
- Feature flags for Phase 2 gradual rollouts
- Kubernetes migration when approaching 2,000 concurrent users
- E2E encryption implementation (MessageService abstraction is ready)

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions
- When in doubt about a pattern, check the Enforcement Guidelines section

**First Implementation Priority:**

```bash
npx create-next-app@latest igbo --typescript --tailwind --eslint --app --src-dir
cd igbo && npx shadcn@latest init
npm install drizzle-orm postgres next-auth@beta next-intl @serwist/next serwist socket.io socket.io-client @tanstack/react-query zod ioredis
npm install -D drizzle-kit vitest @testing-library/react @testing-library/jest-dom playwright
```

---

# Job Portal Architecture Extension

_This section extends the original architecture to cover the Job Portal product, a separate Next.js application at `job.[domain]` that shares infrastructure with the community platform. Based on PRD v2, Product Brief (2026-03-29), and UX Design Specification._

## Project Context Analysis — Job Portal

### Requirements Overview

**Functional Requirements:**
108 FRs across 14 categories covering the Job Portal MVP. The heaviest areas are:

- **Job Posting & Management (FR1-FR18):** Bilingual job CRUD, inline company creation, auto-save drafts, ATS pipeline (Applied → Screening → Interview → Offer → Hired), skill-tag taxonomy, salary normalization (NGN/USD/GBP/EUR)
- **Smart Matching (FR33-FR42):** Weighted scoring (50% skills/30% location/20% experience), match pill display (Strong/Good/Partial), match explanation breakdown, seeker-side "Jobs for You" feed, employer-side candidate ranking
- **Application Flow (FR19-FR32):** One-tap apply with profile auto-fill, resume management, cover letter optional, "Viewed by Employer" signal (the defining emotional moment), application status tracking with real-time updates
- **Trust & Verification (FR43-FR52):** Community verification badges on job surfaces, employer trust tiers (New → Established → Trusted), referral tracking (3-deep chain), engagement-level indicators
- **Content Moderation (FR53-FR62):** Admin review queue for job postings, risk scoring, bulk approve/reject, content policy enforcement, employer discipline
- **Apprenticeship Program (FR63-FR72):** Structured mentorship listings, application flow, mentor-mentee matching, progress tracking
- **Guest Access & SEO (FR73-FR82):** Full browse without auth, conversion gates at action points only, ISR for all listing/detail pages, structured data (JobPosting schema.org)

**Non-Functional Requirements:**
42 NFRs with specific targets:

- **Performance (8):** FCP < 1.5s on Fast 3G, LCP < 2.5s, CLS < 0.1, TTI < 3.5s, per-route JS budgets (guest pages < 150KB, authenticated < 200KB)
- **Security (7):** Cross-subdomain SSO with Safari ITP handling, CSRF protection, rate limiting per-route, file upload scanning (resume PDFs), employer identity verification
- **Scalability (5):** Shared PostgreSQL with portal-prefixed tables, shared Redis with enforced namespacing, independent horizontal scaling of portal app, connection pooling strategy
- **Accessibility (9):** WCAG 2.1 AA, density-mode adaptation (Comfortable/Compact/Dense) without accessibility degradation, keyboard-only E2E flows, axe-core mandatory in every component test
- **Integration (6):** Cross-subdomain EventBus, shared notification system, shared file upload pipeline, shared user/auth system
- **Reliability (7):** Same 99.5% uptime target, portal-independent deployability at process level (separate containers/scaling) with documented shared-infrastructure caveat (shared PostgreSQL/Redis means DB outage affects both apps)

**Scale & Complexity:**

- Primary domain: Employment marketplace (community-integrated)
- Project context: **Brownfield** — extends existing igbo platform
- Complexity level: **High** — monorepo migration + new app + shared infrastructure + cross-subdomain auth
- Estimated architectural components: 8-10 major new subsystems + 4-5 shared package extractions

### Technical Constraints & Dependencies

**From PRD v2:**

- **Separate Next.js app** at `job.[domain]` subdomain — NOT a route group in the existing app
- **Monorepo prerequisite (Phase 0):** Must extract shared packages (`@igbo/db`, `@igbo/auth`, `@igbo/ui`, `@igbo/config`) before portal development begins. Phase 0 scope includes migrating 4,795+ existing tests with updated import paths (F-11).
- **Cross-subdomain SSO:** Auth.js v5 session cookies scoped to `.[domain]` apex, silent token refresh, Safari ITP workaround (apex-domain login page). E2E test suite requires multi-origin Playwright configuration from day one (F-9).
- **Shared PostgreSQL:** `@igbo/db` owns ALL migrations — single source of truth. Portal tables use `job_` prefix. Migration sequencing strategy required to prevent PR collision when two apps evolve the schema concurrently (F-1). Options: timestamp-based naming, app-prefixed numbering, or serialized merge queue.
- **Shared Redis:** Namespaced keys enforced at the type level via `@igbo/config` `createRedisKey(app, domain, id)` helper — not just a `job:` prefix convention. Covers session store keys, rate limiter keys, Bull queue names, and application cache keys (F-2).
- **JOB_ADMIN role:** New role in existing RBAC system, portal-scoped permissions
- **Dual-role users:** Members can be both seekers and employers, with session-scoped role switching

**From UX Design Specification:**

- **Three-layer component architecture:** Semantic → Domain → Flow, with `DensityContext` provider (portal-only — not in `@igbo/ui`) (F-5)
- **Theme scoping:** `@igbo/ui` exports theme-unaware base components; each app applies its own design tokens (community palette vs portal's Forest Green/Golden Amber/Teal-shift channels) (F-5)
- **Tailwind version alignment:** Architecture must specify unified Tailwind version across monorepo. Portal UX spec requires Tailwind v4 `@container` variants — community platform version must be confirmed and aligned or independently configured (F-6).
- **Container queries** for card adaptation (not viewport breakpoints)
- **Role-based navigation:** Different nav structures for Seeker/Employer/Admin/Guest
- **ApplyDrawer:** Multi-step flow component with different DOM structures per viewport (Sheet on mobile, side panel on desktop)
- **FilterParams URL contract:** Shared filter serialization schema via `useFilterParams()` hook — initially portal-only, future candidate for `@igbo/ui` extraction when community platform needs filters (F-12)
- **"Viewed by Employer" signal:** Architectural invariant requiring **at-least-once delivery with deduplication** — different from standard EventBus fire-and-forget semantics. Requires queue-based retry on failure, irreversibility, admin-view exclusion, and anti-gaming rate limiting. May need dedicated reliable queue separate from EventBus (F-3).

**Phase 2 implications (must not be blocked):**

- Premium employer tiers (paid features) — payment infrastructure hooks
- AI-powered matching improvements — matching engine abstraction
- Native mobile apps — API design supporting both web and native
- Advanced analytics — event tracking abstraction

### Cross-Cutting Concerns Identified

1. **Monorepo Package Boundaries** — Clear API contracts between `@igbo/db`, `@igbo/auth`, `@igbo/ui`, `@igbo/config`. `@igbo/db` owns all migrations with a defined sequencing strategy to prevent cross-app PR collisions (F-1). Schema ownership: shared tables (auth, users, notifications) in `@igbo/db` core; portal tables (`job_*`) in `@igbo/db` portal subpath.
2. **Cross-Subdomain Authentication** — Session cookie scoping to `.[domain]`, Safari ITP workaround (apex-domain login), silent refresh, role context (seeker vs employer) per session. Multi-origin E2E test configuration required (F-9).
3. **Shared EventBus with Differentiated Delivery Guarantees** — Standard events use at-most-once delivery (existing pattern). Critical signals ("Viewed by Employer", "You've been hired") require at-least-once delivery with deduplication — may need a separate reliable queue or EventBus enhancement (F-3).
4. **Matching Engine** — Weighted scoring (50% skills / 30% location / 20% experience). Architecture must decide: real-time scoring on query vs background job with materialized scores vs hybrid (pre-computed scores refreshed on profile/posting change). This shapes DB schema, API latency, and the seeker "Jobs for You" experience (F-4).
5. **Trust Signal Pipeline** — Verification badges, match scores, referral chains, and engagement levels flow from community platform data to portal surfaces. Read-only cross-app data access patterns via shared DB queries in `@igbo/db`.
6. **Content Moderation (Portal-Scoped)** — Job posting review queue separate from community content moderation but sharing infrastructure (moderation service, admin UI patterns).
7. **Notification Routing Extension** — New notification types (application_received, application_viewed, status_changed, new_job_match) flowing through existing NotificationRouter with portal-specific channel preferences.
8. **Design System Theme Scoping** — `@igbo/ui` exports theme-unaware base components. Each app applies its own design tokens. `DensityContext` is portal-only, not shared (F-5). Tailwind version must be aligned across monorepo (F-6).
9. **Bilingual Content** — Job descriptions, company profiles, and all portal UI strings support EN + IG, reusing existing `next-intl` infrastructure.
10. **Guest SEO Strategy** — ISR for job listings/details (same pattern as community articles), structured data (schema.org/JobPosting), guest conversion gates at action points only.
11. **File Upload Extension** — Resume PDFs, company logos through shared upload pipeline with portal-specific file type allowlists.
12. **Cross-App Integration Testing** — Monorepo needs a `packages/integration-tests` layer that boots both apps against shared test infrastructure to verify cross-app event flows, SSO, and trust signal propagation. Unit tests with mocks are insufficient for multi-app integration boundaries (F-7).
13. **Route Parameter Extraction** — Portal routes with multiple dynamic segments (e.g., `/jobs/[jobId]/applications/[applicationId]`) need a standardized `extractRouteParams(url, pattern)` helper in `@igbo/config` to replace fragile `.split("/").at(-N)` pattern (F-10).
14. **Deployment Independence** — Process-level isolation (separate containers, independent scaling) — NOT data-level isolation. Shared PostgreSQL/Redis means infrastructure outage affects both apps. This caveat must be documented and accepted (F-8).

### Party Mode Findings Incorporated

| ID | Severity | Finding | Section Modified |
|----|----------|---------|-----------------|
| F-1 | Critical | Migration ownership & sequencing — `@igbo/db` owns all, needs collision prevention strategy | Technical Constraints, Cross-Cutting #1 |
| F-2 | Critical | Redis namespace enforcement via typed `createRedisKey()` helper, not convention | Technical Constraints |
| F-3 | Important | "Viewed by Employer" needs at-least-once delivery with dedup — different from standard EventBus | Technical Constraints, Cross-Cutting #3 |
| F-4 | Important | Matching engine architecture (real-time vs background vs hybrid) missing from concerns | Cross-Cutting #4 |
| F-5 | Important | `@igbo/ui` theme-unaware base components; DensityContext portal-only | Technical Constraints, Cross-Cutting #8 |
| F-6 | Important | Tailwind version alignment across monorepo | Technical Constraints, Cross-Cutting #8 |
| F-7 | Important | `packages/integration-tests` layer for cross-app verification | Cross-Cutting #12 |
| F-8 | Medium | Deployment "independence" is process-level only — shared DB caveat documented | Cross-Cutting #14 |
| F-9 | Medium | Multi-origin Playwright config for SSO E2E testing | Technical Constraints, Cross-Cutting #2 |
| F-10 | Medium | `extractRouteParams(url, pattern)` helper for multi-segment routes | Cross-Cutting #13 |
| F-11 | Low | 4,795+ existing test import paths need migration in Phase 0 | Technical Constraints |
| F-12 | Low | `useFilterParams()` portal-only initially, future `@igbo/ui` candidate | Technical Constraints |

## Starter Template Evaluation — Job Portal

### Primary Technology Domain

Full-stack bilingual employment marketplace built as a second Next.js application within a monorepo, sharing infrastructure with the existing igbo community platform. The technology stack is **already established** — this evaluation focuses on the **monorepo orchestration layer**.

### Existing Technical Preferences

- **Language:** TypeScript strict | **Framework:** Next.js 16.1.x (App Router)
- **Styling:** Tailwind CSS + shadcn/ui + Radix UI | **Database:** PostgreSQL via Drizzle ORM
- **Cache:** Redis via ioredis | **Auth:** Auth.js v5 | **i18n:** next-intl
- **Real-time:** Socket.IO | **State:** TanStack React Query
- **Testing:** Vitest + React Testing Library + Playwright
- **CI/CD:** GitHub Actions | **Hosting:** Hetzner containers + Cloudflare CDN
- **Package manager:** npm (current — migrating to pnpm in Phase 0)

### Monorepo Tooling Options Considered

| # | Option | Strengths | Gaps |
|---|--------|-----------|------|
| 1 | **Turborepo + pnpm workspaces** | Minimal config (~20 lines turbo.json), native Next.js integration (Vercel-maintained), build caching (96% faster rebuilds), parallel task execution, composable config (v2.7+), `--affected` flag for CI optimization | No module boundary enforcement, coarse change detection (package.json-level), no code generation |
| 2 | **Nx** | Import-level change detection, enforced module boundaries, code generators, distributed task execution, project graph visualization | Steeper learning curve, heavier runtime, overkill for 2-app monorepo |
| 3 | **pnpm workspaces only** | Zero additional tooling, simplest mental model | No task caching, no parallel orchestration, slower CI |

### Selected: Turborepo + pnpm workspaces

**Rationale:**

1. **Right-sized for 2 apps + 4-5 shared packages.** Nx justified at 5+ teams / 50+ packages.
2. **Native Next.js integration.** Vercel-maintained, first-class `transpilePackages` support.
3. **Build caching halves CI time.** `--affected` flag further reduces CI to only touched packages.
4. **pnpm for package management.** Symlink-based `node_modules` is faster and more disk-efficient. Note: npm → pnpm migration may expose phantom dependencies — budget for debugging (F-10).
5. **Low migration risk.** `turbo.json` is additive on top of existing `package.json` scripts.
6. **Composable configuration (v2.7+).** Shared configs defined once in `packages/config`.

### Phase 0 Extraction Strategy

**Extraction order (dependency order, each as separate PR with full green test suite before next) (F-1):**

1. **`@igbo/config`** — No internal deps. Shared TS/ESLint/Tailwind configs, Redis helpers (`createRedisKey()`), environment validation.
2. **`@igbo/db`** — Depends on config. Drizzle schema, migrations (single source of truth), queries. Both apps run ALL migrations — no portal-only migration concept; every migration is global (F-2).
3. **`@igbo/auth`** — Depends on db. Auth.js config, session helpers, RBAC, permission checks.
4. **`@igbo/ui`** — **Deferred to Phase 1** (F-9). Portal copies shadcn/ui primitives into its own `src/components/ui/` initially. `@igbo/ui` extraction happens when shared vs divergent components are known from actual portal development. This reduces Phase 0 scope by ~30%.

**Migration mechanics:**

- **`transpilePackages`** required in both apps' `next.config.ts` for `@igbo/*` imports (F-3):
  ```ts
  transpilePackages: ["@igbo/db", "@igbo/auth", "@igbo/config"]
  ```
- **Codemod script** for `vi.mock("@/db/...")` → `vi.mock("@igbo/db/...")` across 4,795+ tests — not manual find-and-replace (F-4).
- **`server-only`** in `@igbo/db` — `package.json` `"exports"` field must have proper conditions (server import only, no browser export). Verify no new build issues in monorepo context (F-5).
- **Mock boundary shift** — every `@/` mock becomes `@igbo/` mock. Test isolation semantics change from implicit (co-located) to explicit (cross-package). This is architecturally correct but means mock patterns must be updated systematically (F-6).

### Proposed Monorepo Structure

```
igbo/
├── turbo.json                    # Task pipeline config
├── pnpm-workspace.yaml           # Workspace definition
├── package.json                  # Root scripts + devDeps
├── apps/
│   ├── community/                # Existing igbo community platform (moved from root)
│   │   ├── package.json          # @igbo/community
│   │   ├── next.config.ts
│   │   ├── e2e/                  # Community Playwright E2E tests (F-8)
│   │   └── src/
│   └── portal/                   # NEW: Job Portal app
│       ├── package.json          # @igbo/portal
│       ├── next.config.ts
│       ├── e2e/                  # Portal Playwright E2E tests (F-8)
│       └── src/
│           └── components/ui/    # Copied shadcn/ui primitives (until @igbo/ui extraction)
├── packages/
│   ├── db/                       # @igbo/db — Drizzle schema, migrations, queries
│   │   ├── package.json          # "exports" with server-only conditions (F-5)
│   │   ├── src/
│   │   │   ├── schema/           # All table definitions (community + portal)
│   │   │   ├── queries/          # Shared query functions
│   │   │   └── migrations/       # Single migration source of truth (F-2)
│   │   └── drizzle.config.ts
│   ├── auth/                     # @igbo/auth — Auth.js config, session helpers, RBAC
│   ├── config/                   # @igbo/config — shared TS/ESLint/Tailwind configs, Redis helpers
│   └── integration-tests/        # Cross-app integration tests (F-7, F-8)
│       ├── package.json
│       ├── sso.test.ts           # Cross-subdomain SSO flow tests
│       └── vitest.config.ts
```

### Test Infrastructure in Monorepo

- **Per-app tests:** Each app has its own `vitest.config.ts` with `@/` alias pointing to its `src/`. Turborepo runs `turbo run test` in parallel across all packages (F-6).
- **Per-app E2E:** Playwright configs per app with different `baseURL` — `localhost:3000` (community), `job.localhost:3001` (portal) (F-8).
- **Cross-app integration tests:** `packages/integration-tests` runs last in Turborepo pipeline via `dependsOn: ["@igbo/community#build", "@igbo/portal#build"]`. CI-only — developers don't run locally during development (F-7).
- **Cross-app E2E (SSO):** Login on community → session valid on portal. Lives in `packages/integration-tests`, not per-app E2E (F-8).

### Turborepo Pipeline Configuration

```jsonc
// turbo.json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "test:integration": {
      "dependsOn": ["@igbo/community#build", "@igbo/portal#build"],
      "cache": false
    },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

### Initialization Command

```bash
# Phase 0: Monorepo migration (on existing repo)
npm install -g pnpm
pnpm init
pnpm add -Dw turbo
# Create workspace definition
echo 'packages:\n  - "apps/*"\n  - "packages/*"' > pnpm-workspace.yaml
```

### Party Mode Findings Incorporated

| ID | Severity | Finding | Section Modified |
|----|----------|---------|-----------------|
| F-1 | Critical | Phase 0 extraction order: config → db → auth (dependency order), each separate PR with green suite | Extraction Strategy |
| F-2 | Important | All migrations global — both apps run all. No portal-only concept. | Extraction Strategy, Structure |
| F-3 | Important | `transpilePackages` required in both apps' `next.config.ts` | Migration Mechanics |
| F-4 | Important | Codemod script for `vi.mock("@/db")` → `vi.mock("@igbo/db")` across 4,795+ tests | Migration Mechanics |
| F-5 | Medium | `server-only` in `@igbo/db` — verify `package.json` exports conditions | Migration Mechanics, Structure |
| F-6 | Medium | Mock boundaries shift from `@/` to `@igbo/` — test isolation semantics change | Migration Mechanics, Test Infrastructure |
| F-7 | Medium | Integration tests CI-only, last in pipeline via `dependsOn` | Test Infrastructure, Pipeline |
| F-8 | Medium | Per-app `e2e/` directories + cross-app SSO tests in integration-tests | Structure, Test Infrastructure |
| F-9 | Important | Defer `@igbo/ui` to Phase 1 — extract only db/auth/config in Phase 0 (~30% scope reduction) | Extraction Strategy |
| F-10 | Medium | npm → pnpm may expose phantom dependencies — budget for debugging | Rationale |

## Core Architectural Decisions — Job Portal

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Migration sequencing strategy (timestamp + auto-idx script)
- Matching engine computation (hybrid with batch recomputation)
- "Viewed by Employer" delivery (PostgreSQL outbox + 1s poller)
- Cross-subdomain SSO (apex-domain cookie)
- Cross-app data access pattern (named query functions)

**Important Decisions (Shape Architecture):**
- Portal role model (session-scoped context)
- Portal API namespace (subdomain-scoped, no prefix)
- State management (TanStack Query + RHF)
- Design token strategy (Tailwind theme extension)
- Container strategy (separate per app)

**Deferred Decisions (Post-MVP):**
- AI-powered matching improvements
- Premium employer tiers / payment infrastructure
- Native mobile API adaptations / BFF layer
- `@igbo/ui` extraction (Phase 1)
- Offline queueing

### Data Architecture

**Migration Sequencing: Timestamp-based naming + auto-idx registration script (F-4)**

- Filenames: `20260401120000_add_job_postings.sql` — timestamp prevents collision across parallel PRs
- `_journal.json` `idx` values auto-assigned by a registration script that reads the migrations folder, sorts by timestamp, and generates sequential indices
- CI pre-merge check runs the script and fails if `_journal.json` is out of sync
- Both apps run ALL migrations — no portal-only migration concept. Every migration is global.

**Matching Engine: Hybrid with batch recomputation (F-1, F-8)**

- **Feed/listing surfaces:** Pre-computed `job_match_scores` table. Scores marked stale (`stale = true`) when `profile.updated` or `job.updated` fires via EventBus. Background job runs every 5 minutes, recomputes all stale scores in bulk. This converts N events × M seekers fan-out into a single batch per window.
- **Detail page:** Real-time score computation on every request — always accurate for the match breakdown popover.
- **Card display:** MatchPill shows quality label only ("Strong Match" / "Good Match" / "Partial Match") — NOT skill count. Full skill breakdown shown only on detail page where scores are always fresh. This avoids staleness mismatch between card and detail (F-8).
- **Schema:** `job_match_scores` table: `seeker_id` (FK), `job_id` (FK), `score` (NUMERIC), `quality` (enum: strong/good/partial), `stale` (BOOLEAN default false), `computed_at` (TIMESTAMPTZ). Composite PK on (seeker_id, job_id). Index on `stale = true` for batch processing.

**"Viewed by Employer" Delivery: PostgreSQL outbox + 1-second poller (F-2, F-9)**

- Outbox table: `job_event_outbox` — `id` (UUID PK), `event_type` (VARCHAR), `payload` (JSONB), `created_at` (TIMESTAMPTZ default now()), `processed_at` (TIMESTAMPTZ nullable). Index on `processed_at IS NULL`.
- The `application.viewed_at` timestamp update and outbox INSERT happen in the **same transaction** — guarantees no lost events.
- Poller runs at 1-second interval (NOT LISTEN/NOTIFY — poller survives connection drops). Reads unprocessed rows via `SELECT ... FOR UPDATE SKIP LOCKED` to prevent double-delivery with concurrent pollers (F-9).
- Deduplication: `processed_at` is set atomically with the SELECT lock. Second poller skips already-locked rows.
- Cleanup: processed events older than 24h purged by daily job.
- **Required integration tests (F-9):** (1) Happy path — write event, poller delivers within 1 cycle. (2) Idempotency — double process, single notification. (3) Restart recovery — unprocessed events from before crash. (4) Concurrent pollers — `SKIP LOCKED` prevents double-delivery. (5) Cleanup — 24h purge. All in `packages/integration-tests`.

### Authentication & Security

**Cross-Subdomain SSO: Apex-domain cookie**

- Auth.js session cookie set with `domain=.igbo.com`, readable by both `app.igbo.com` and `job.igbo.com`
- Safari ITP workaround: login page hosted on `igbo.com` apex domain (not a subdomain). Redirect to originating subdomain after login.
- Silent token refresh: short-lived session token (15 min) + long-lived refresh token (30 days). Refresh endpoint on apex domain.

**Portal Role Model: Session-scoped context (F-7)**

- User has `portalRole` field: `seeker` | `employer` | `both`
- Session stores `activePortalRole` — the currently active context
- Role switcher in top nav (visible only for users with `portalRole = "both"`)
- **Role switch navigates to the switched role's default landing page** (F-7): seeker → "Jobs for You", employer → "Dashboard". No attempt to map current page to other role's equivalent.
- Portal layout reads `activePortalRole` from session to render correct nav structure, sidebar, and bottom nav

### API & Communication Patterns

**Portal API Namespace: Subdomain-scoped, no prefix**

- Portal routes follow existing `/api/v1/` pattern: `/api/v1/jobs/...`, `/api/v1/applications/...`, `/api/v1/companies/...`
- No `/portal/` prefix — subdomain scoping (`job.igbo.com`) provides namespace isolation
- Same `withApiHandler()` middleware, RFC 7807 error format, rate limiting patterns

**Cross-App Data Access: Shared DB reads via named query functions (F-3, F-10)**

- `@igbo/db` exports **named query functions** for cross-app reads — the shared kernel pattern:
  - `getCommunityVerificationStatus(userId)` → `{ isVerified, verifiedAt, badgeType }`
  - `getUserEngagementLevel(userId)` → `{ level, score, lastActive }`
  - `getReferralChain(userId)` → `{ referrals: Array<{ userId, depth }> }`
  - `getMembershipDuration(userId)` → `{ joinedAt, durationDays }`
- Portal imports these functions, **never writes raw queries against community tables**
- Community team owns these functions — can refactor internals without breaking portal
- **Type-safe contracts (F-10):** Each function has an explicit TypeScript return type (not inferred). Return type IS the contract. Both apps import the type. TypeScript compilation catches shape changes.
- **Unit tests in `@igbo/db`** verify return shapes against test database (F-10)

**Cross-App Events: Shared EventBus (Redis pub/sub)**

- Portal publishes: `job.published`, `application.submitted`, `application.viewed`, `application.status_changed`
- Community listens for portal events to award points, update engagement levels, send notifications
- Portal listens for community events: `user.verified`, `user.role_changed`, `user.suspended`
- Standard at-most-once delivery for all except "Viewed" signal (uses outbox pattern above)

### Frontend Architecture

**State Management: TanStack Query + React Hook Form**

- TanStack Query for server state (jobs, applications, dashboard data)
- React Hook Form for all form state (PostingForm, ApplyDrawer, filters)
- **PostingForm auto-save implementation note (F-5):** Use `useWatch()` + `useEffect` with `setTimeout` for 30-second debounce. `beforeunload` handler reads current values via `getValues()` (no re-render). Avoid `watch()` which re-renders on every keystroke across 15+ fields.
- No new state library (Zustand) — consistency with existing codebase

**Design Token Strategy: Tailwind theme extension per app (F-6)**

- Each app's `tailwind.config.ts` extends the base theme with app-specific colors
- Portal adds: `portal-primary` (Forest Green #2D5016), `portal-action` (Golden Amber #C4841D), `portal-context` (Teal-shift #1A6B5C), `portal-warm` (Sandy Tan #E8DCC8)
- **Semantic class convention documented for future `@igbo/ui` (F-6):** When `@igbo/ui` is extracted in Phase 1, shared components use semantic classes (`bg-surface`, `text-heading`, `border-accent`) that each app maps to its own palette. This convention is documented now, applied later.

**DensityContext: Portal-only**

- `DensityContext` provider in portal app layout, not in shared packages
- Three modes: Comfortable (seeker default), Compact (employer default), Dense (admin default)
- Components read density from context, never from props
- Density controls visual weight (spacing, padding, line-height) — orthogonal to container queries (spatial arrangement)

### Infrastructure & Deployment

**Container Strategy: Separate container per app**

- `apps/community` → Docker image `igbo-community`, container on port 3000
- `apps/portal` → Docker image `igbo-portal`, container on port 3001
- Independent scaling, independent deploys, independent rollbacks
- Shared infrastructure (PostgreSQL, Redis) remains a single point — process-level isolation only

**Development Server: Turborepo parallel dev**

- Full-stack work: `turbo run dev` — both apps on `:3000` and `:3001`
- Focused portal work: `turbo run dev --filter=@igbo/portal` — portal only
- Both documented in dev setup guide

**Reverse Proxy (Production):**

- Cloudflare DNS: `app.igbo.com` → community container, `job.igbo.com` → portal container
- Same Cloudflare CDN for static assets and ISR page caching
- CORS: portal API allows `app.igbo.com` origin for cross-subdomain requests (notification links, SSO redirects)

### Decision Impact Analysis

**Implementation Sequence:**
1. Phase 0: Monorepo migration (Turborepo + pnpm, package extractions)
2. Phase 0: Migration tooling (timestamp naming, auto-idx script, CI check)
3. Phase 0: Cross-subdomain SSO (apex cookie, Safari ITP, session `activePortalRole`)
4. Phase 1a: Portal app scaffold (container, routing, nav, design tokens)
5. Phase 1a: DB schema (job postings, applications, companies, match scores, outbox)
6. Phase 1a: Core flows (posting, applying, "Viewed" outbox, matching engine)
7. Phase 1b: Trust pipeline (named query functions for verification/engagement/referral)
8. Phase 1b: Apprenticeships, admin queue, notification extension

**Cross-Component Dependencies:**
- Matching engine depends on `@igbo/db` schema + EventBus integration
- "Viewed" outbox depends on `@igbo/db` schema + poller infrastructure
- Trust signals depend on cross-app named query functions in `@igbo/db`
- Role switcher depends on session `activePortalRole` in `@igbo/auth`
- Design tokens depend on Tailwind config in each app (independent)

### Party Mode Findings Incorporated

| ID | Severity | Finding | Section Modified |
|----|----------|---------|-----------------|
| F-1 | Critical | Matching engine: batch recomputation with 5-min debounce, stale flag, bulk recompute | Data Architecture |
| F-2 | Important | Viewed outbox: 1-second poller, not LISTEN/NOTIFY. Outbox table schema defined. | Data Architecture |
| F-3 | Important | Cross-app DB reads: named query functions only, shared kernel pattern | API & Communication |
| F-4 | Important | Timestamp migrations: auto-idx registration script + CI pre-merge check | Data Architecture |
| F-5 | Low | PostingForm auto-save: `useWatch()` + `getValues()`, not `watch()` | Frontend Architecture |
| F-6 | Medium | Semantic class convention (`bg-surface`, `text-heading`) documented for future `@igbo/ui` | Frontend Architecture |
| F-7 | Medium | Role switch → default landing page per role. `activePortalRole` in session. | Auth & Security |
| F-8 | Medium | MatchPill card: quality label only, no skill count. Full breakdown on detail page. | Data Architecture |
| F-9 | Important | Outbox poller: 5 integration tests (happy path, idempotency, restart, concurrent, cleanup) | Data Architecture |
| F-10 | Medium | Cross-app query functions: explicit TS return types as contracts + unit tests in `@igbo/db` | API & Communication |

## Implementation Patterns — Job Portal Extension

### Inherited Patterns (Community Platform → Portal)

These patterns are proven across 12 epics and carry forward unchanged:

- **DB naming:** snake_case tables/columns, e.g. `job_postings`, `seeker_id`
- **API format:** RFC 7807 via `successResponse()`/`errorResponse()`, `withApiHandler()` middleware
- **Route handlers:** Always `withApiHandler()`, admin routes use `requireAdminSession()`, user routes use `requireAuthenticatedSession()`
- **Tests:** Co-located with source (`*.test.ts` / `*.test.tsx`), `@vitest-environment node` for server files
- **Zod:** Import from `"zod/v4"`, validation errors use `throw new ApiError(...)`
- **EventBus:** Emit from services, never from routes
- **i18n:** All user-facing strings via `useTranslations()`, keys in `messages/en.json` + `messages/ig.json`
- **Error format:** RFC 7807, `ProblemDetails` object
- **DB schema:** Direct imports in `db/index.ts` with `import * as xSchema`

### New Patterns: Monorepo Package Imports

**Cross-package imports use bare specifiers, not path aliases:**

```typescript
// ✅ Correct — portal importing from shared packages
import { db } from "@igbo/db";
import { getCommunityVerificationStatus } from "@igbo/db/queries/cross-app";
import { requireAuthenticatedSession } from "@igbo/auth";
import { createRedisKey } from "@igbo/config/redis";

// ❌ Wrong — using path alias for shared packages
import { db } from "@/db";
import { requireAuthenticatedSession } from "@/lib/admin-auth";
```

**App-local imports still use `@/` alias:**

```typescript
// ✅ Correct — portal importing its own code
import { JobCard } from "@/components/domain/job-card";
import { useFilterParams } from "@/hooks/use-filter-params";
```

**Rule:** `@/` = app-local (resolves to `apps/{app}/src/`). `@igbo/*` = shared package.

**`@igbo/db` initialization pattern (F-1):**

```typescript
// packages/db/src/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Factory — for tests and custom connection strings
export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

// Lazy singleton — for app code
let _db: ReturnType<typeof createDb> | null = null;
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop) {
    if (!_db) _db = createDb(process.env.DATABASE_URL!);
    return (_db as any)[prop];
  },
});
```

App code: `import { db } from "@igbo/db"` (uses singleton, reads `DATABASE_URL` from app's `.env`).
Test code: `import { createDb } from "@igbo/db"` (uses factory with test connection string).

### New Patterns: Portal DB Schema & Queries

**Portal table prefix:**

```typescript
// ✅ All portal tables use job_ prefix
export const jobPostings = pgTable("job_postings", { ... });
export const jobApplications = pgTable("job_applications", { ... });
export const jobCompanies = pgTable("job_companies", { ... });
export const jobMatchScores = pgTable("job_match_scores", { ... });
export const jobEventOutbox = pgTable("job_event_outbox", { ... });

// ❌ Wrong — no prefix, conflicts with potential community tables
export const postings = pgTable("postings", { ... });
```

**Portal schema files live in `@igbo/db`:**

```
packages/db/src/schema/
├── auth-users.ts            # Existing community schema
├── community-posts.ts       # Existing community schema
├── ...
├── job-postings.ts          # NEW: portal schema
├── job-applications.ts      # NEW: portal schema
├── job-companies.ts         # NEW: portal schema
├── job-match-scores.ts      # NEW: portal schema
└── job-event-outbox.ts      # NEW: portal schema
```

**Portal query files:**

```
packages/db/src/queries/
├── posts.ts                 # Existing community queries
├── ...
├── cross-app.ts             # NEW: named query functions for cross-app reads
├── job-postings.ts          # NEW: portal queries
├── job-applications.ts      # NEW: portal queries
└── job-match-scores.ts      # NEW: portal queries
```

### New Patterns: Portal Migration Naming

**Timestamp-based filenames:**

```
packages/db/src/migrations/
├── 0049_existing_community_migration.sql   # Existing (keep numbering)
├── 20260415120000_job_postings.sql         # NEW: timestamp-based
├── 20260415130000_job_applications.sql     # NEW: timestamp-based
├── 20260416090000_job_match_scores.sql     # NEW: timestamp-based
```

**Transition rule:** Existing numbered migrations (0000–0049) remain unchanged. All new migrations use timestamp format. The auto-idx script assigns sequential `idx` values to all migrations sorted by: old migrations first (by number), then new migrations (by timestamp).

### New Patterns: Portal EventBus Events

**Portal event naming follows existing convention (dot-notation, past tense):**

```typescript
// ✅ Correct — portal events
"job.published"
"job.updated"
"job.closed"
"application.submitted"
"application.viewed"      // → triggers outbox, not standard EventBus
"application.status_changed"
"application.withdrawn"

// ❌ Wrong — camelCase or present tense
"jobPublished"
"application.submit"
```

**Portal event payloads follow existing structure:**

```typescript
interface PortalEvent {
  type: string;
  payload: {
    jobId?: string;
    applicationId?: string;
    seekerId?: string;
    employerId?: string;
    timestamp: string;  // ISO 8601
    [key: string]: unknown;
  };
}
```

### New Patterns: Portal Redis Key Taxonomy (F-7)

**All portal Redis keys constructed via `createRedisKey("portal", domain, id)`:**

```
portal:session:{sessionId}        — portal session data
portal:rate:{route}:{ip}          — rate limiter
portal:cache:job:{jobId}          — job detail cache
portal:cache:match:{seekerId}     — match scores cache for feed
portal:queue:outbox               — Bull queue name for outbox poller
portal:filter:{userId}            — cached filter preferences per session
```

**Rule:** No portal code writes a raw Redis key string. Always use `createRedisKey()`. This enforces the namespace at the type level and prevents key collisions with community keys (`community:session:*`, `community:rate:*`, etc.).

### New Patterns: Portal Error Codes (F-8)

**Standardized portal error codes in `apps/portal/src/lib/portal-errors.ts`:**

```typescript
export const PORTAL_ERRORS = {
  JOB_NOT_FOUND:          { type: "PORTAL_JOB_NOT_FOUND",          status: 404 },
  APPLICATION_DUPLICATE:   { type: "PORTAL_APPLICATION_DUPLICATE",   status: 409 },
  JOB_CLOSED:             { type: "PORTAL_JOB_CLOSED",             status: 410 },
  EMPLOYER_SUSPENDED:     { type: "PORTAL_EMPLOYER_SUSPENDED",     status: 403 },
  POSTING_UNDER_REVIEW:   { type: "PORTAL_POSTING_UNDER_REVIEW",   status: 403 },
  ROLE_MISMATCH:          { type: "PORTAL_ROLE_MISMATCH",          status: 403 },
  MATCH_SCORE_STALE:      { type: "PORTAL_MATCH_SCORE_STALE",      status: 202 },
} as const;

// Usage in route:
throw new ApiError(PORTAL_ERRORS.JOB_CLOSED.status, {
  type: PORTAL_ERRORS.JOB_CLOSED.type,
  title: "Job no longer accepting applications",
  detail: "This position was closed on ...",
});
```

**Rule:** All portal-specific errors use `PORTAL_*` codes from this enum. Generic HTTP errors (400 validation, 401 unauth, 500 server) continue using the existing community error patterns.

### New Patterns: Portal API Routes

**Portal route structure mirrors community pattern:**

```
apps/portal/src/app/api/v1/
├── jobs/
│   ├── route.ts                           # GET (list), POST (create)
│   └── [jobId]/
│       ├── route.ts                       # GET, PATCH, DELETE
│       ├── applications/
│       │   ├── route.ts                   # GET (list for employer)
│       │   └── [applicationId]/
│       │       └── route.ts              # GET, PATCH (status change)
│       └── match-score/
│           └── route.ts                   # GET (real-time score for detail page)
├── applications/
│   └── route.ts                           # POST (apply), GET (my applications)
├── companies/
│   ├── route.ts                           # POST (create), GET (list)
│   └── [companyId]/
│       └── route.ts                       # GET, PATCH
├── match-scores/
│   └── recompute/
│       └── route.ts                       # POST (trigger batch recompute, admin only)
└── admin/
    └── review-queue/
        ├── route.ts                       # GET (pending postings)
        └── [postingId]/
            └── route.ts                   # PATCH (approve/reject)
```

**Multi-segment route param extraction (F-3):**

```typescript
import { extractRouteParams } from "@igbo/config/route-helpers";

// extractRouteParams contract:
// - Returns Record<string, string> with named params
// - Throws ApiError(400, "Missing route parameter: {name}") if segment missing
// - Pattern uses :paramName syntax

export const GET = withApiHandler(async (req) => {
  const { jobId, applicationId } = extractRouteParams(
    req.url,
    "/api/v1/jobs/:jobId/applications/:applicationId"
  );
  // jobId and applicationId guaranteed to be strings here
});
```

### New Patterns: Portal Services (F-2)

**Portal services in `apps/portal/src/services/`:**

```
apps/portal/src/services/
├── matching-engine.ts          # Hybrid scoring (batch + real-time)
├── application-service.ts      # Apply, withdraw, status changes
├── posting-service.ts          # CRUD, draft management, auto-save
├── outbox-poller.ts            # Portal-only background process
├── review-service.ts           # Admin approve/reject/escalate
└── trust-signal-service.ts     # Reads cross-app queries, assembles trust data
```

**Rule:** Outbox poller is portal-only (`apps/portal/`), not shared (`packages/`). If community needs an outbox in the future, extract at that point.

### New Patterns: Portal Component Organization

**Three-layer architecture + skeletons (F-9) + PortalAvatar (F-10):**

```
apps/portal/src/components/
├── ui/                        # Copied shadcn/ui primitives + portal-specific
│   ├── button.tsx
│   ├── card.tsx
│   ├── portal-avatar.tsx      # (F-10) Wraps next/image + fallback div
│   └── ...
├── semantic/                  # Layer 1: Atomic status/signal components
│   ├── status-pill.tsx        # Exports StatusPill + StatusPillSkeleton
│   ├── match-pill.tsx         # Exports MatchPill + MatchPillSkeleton
│   └── trust-badge.tsx        # Exports TrustBadge + TrustBadgeSkeleton
├── domain/                    # Layer 2: Business-entity components
│   ├── job-card.tsx           # Exports JobCard + JobCardSkeleton
│   ├── candidate-card.tsx     # Exports CandidateCard + CandidateCardSkeleton
│   ├── review-queue-row.tsx   # Exports ReviewQueueRow + ReviewQueueRowSkeleton
│   └── empty-state-card.tsx   # Exports EmptyStateCard (no skeleton needed)
├── flow/                      # Layer 3: Multi-step task components
│   ├── apply-drawer.tsx       # Exports ApplyDrawer + ApplyDrawerSkeleton
│   ├── posting-form.tsx       # Exports PostingForm + PostingFormSkeleton
│   └── confirmation-panel.tsx
├── layout/
│   ├── portal-layout.tsx
│   ├── portal-top-nav.tsx
│   ├── portal-bottom-nav.tsx
│   ├── portal-sidebar.tsx
│   └── role-switcher.tsx
└── providers/
    └── density-provider.tsx
```

**Skeleton naming convention (F-9):** `ComponentName` → `ComponentNameSkeleton`, co-located as named export in same file. Skeleton must match loaded component's geometry exactly (same height, width, spacing). Every domain-layer and flow-layer component must export a skeleton variant.

**PortalAvatar rule (F-10):** All image surfaces (employer logos, candidate photos, company banners) MUST use `PortalAvatar` from `@/components/ui/portal-avatar`. Never use raw `<img>` or bare `next/image`. `PortalAvatar` renders `next/image` when `src` is present, styled fallback `<div>` (initial letter, Forest Green bg, white text) when `src` is null or `onError` fires. Both paths produce identical outer dimensions.

### New Patterns: Portal i18n Keys

**Portal i18n keys namespaced under `Portal.*`:**

```json
{
  "Portal": {
    "nav": { "jobs": "Jobs", "applications": "My Applications" },
    "jobs": { "title": "Jobs for You", "noResults": "No exact matches" },
    "apply": { "submit": "Submit Application", "autosaved": "Saved" },
    "employer": { "dashboard": "Dashboard", "postJob": "Post a Job" },
    "admin": { "queue": "Review Queue", "approve": "Approve" },
    "match": { "strong": "Strong Match", "good": "Good Match", "partial": "Partial Match" }
  }
}
```

**Rule:** All portal strings under `Portal.*` namespace. Community strings remain under existing namespaces.

### New Patterns: Portal Testing

**Test utilities centralized (F-4):**

```
apps/portal/src/test-utils/
├── render.tsx                 # renderWithPortalContext, renderWithPortalProviders
├── factories.ts               # createMockJob, createMockApplication, createMockCompany
└── setup.ts                   # Global test setup (axe extensions, etc.)
```

```typescript
// render.tsx
export function renderWithPortalContext(
  ui: React.ReactElement,
  options?: { density?: "comfortable" | "compact" | "dense" }
) {
  return render(
    <DensityProvider mode={options?.density ?? "comfortable"}>
      {ui}
    </DensityProvider>
  );
}

export function renderWithPortalProviders(
  ui: React.ReactElement,
  options?: { density?: string; session?: Session; locale?: string }
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale={options?.locale ?? "en"}>
        <DensityProvider mode={options?.density ?? "comfortable"}>
          {ui}
        </DensityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
```

**Per-package test environment (F-5):**

- Each package/app with tests has `.env.test` loaded by `vitest.config.ts` via `dotenv`
- Root `.env.test.example` documents all required variables
- CI sets variables via GitHub Actions secrets
- `packages/db/.env.test` has `DATABASE_URL` pointing to test database
- `apps/portal/.env.test` has all portal-specific env vars

**Cross-app query contract tests (F-6):**

```typescript
// packages/db/src/queries/cross-app.test.ts
// @vitest-environment node
// These tests run against REAL PostgreSQL — they ARE the contract tests

import { createDb } from "../index";

const testDb = createDb(process.env.DATABASE_URL!);

beforeAll(async () => {
  // Seed: one user, one profile, one verification
  await seedTestFixtures(testDb);
});

it("getCommunityVerificationStatus returns correct shape", async () => {
  const result = await getCommunityVerificationStatus(testDb, testUserId);
  expect(result).toEqual({
    isVerified: expect.any(Boolean),
    verifiedAt: expect.any(Date),  // or null
    badgeType: expect.stringMatching(/^(community|cultural|elder)$/),
  });
});
```

CI spins up a PostgreSQL container for `packages/db` tests via GitHub Actions `services`.

**Mocking shared packages in portal tests:**

```typescript
vi.mock("@igbo/db");
vi.mock("@igbo/db/queries/job-postings");
vi.mock("@igbo/auth");
```

**axe-core mandatory for all portal components:**

```typescript
import { axe, toHaveNoViolations } from "jest-axe";
expect.extend(toHaveNoViolations);

it("has no accessibility violations", async () => {
  const { container } = renderWithPortalContext(<JobCard {...defaultProps} />);
  expect(await axe(container)).toHaveNoViolations();
});
```

### New Patterns: Outbox Event Processing

**Outbox pattern — used only for critical signals:**

```typescript
// ✅ Writing to outbox (in same transaction as business logic)
await db.transaction(async (tx) => {
  await tx.update(jobApplications).set({ viewedAt: new Date() }).where(eq(id, applicationId));
  await tx.insert(jobEventOutbox).values({
    eventType: "application.viewed",
    payload: { applicationId, employerId, seekerId },
  });
});

// ❌ Wrong — emitting via EventBus for critical signals
eventBus.emit("application.viewed", { ... }); // Fire-and-forget, may lose event
```

**Events that use outbox (at-least-once):** `application.viewed`, `application.hired`
**Events that use EventBus (at-most-once):** Everything else

### Enforcement Guidelines

**All AI Agents implementing portal stories MUST:**

1. Use `@igbo/*` bare specifiers for shared package imports, `@/` for app-local
2. Use `import { db } from "@igbo/db"` (singleton) in app code, `createDb()` in tests (F-1)
3. Prefix all new DB tables with `job_`, place schema files in `packages/db/src/schema/`
4. Use timestamp format for new migration filenames
5. Place portal components in the three-layer structure (semantic/domain/flow)
6. Export `*Skeleton` variant for every domain and flow component (F-9)
7. Use `PortalAvatar` for all image surfaces, never raw `<img>` (F-10)
8. Namespace portal i18n keys under `Portal.*`
9. Include axe-core assertions in every component test
10. Wrap component tests with `renderWithPortalContext` from `@/test-utils/render` (F-4)
11. Use outbox pattern for `application.viewed` and `application.hired` events
12. Use `extractRouteParams()` for multi-segment dynamic routes — throws `ApiError(400)` on missing param (F-3)
13. Export explicit TypeScript return types for all cross-app query functions
14. Use `createRedisKey("portal", domain, id)` for all Redis keys — never raw strings (F-7)
15. Use `PORTAL_ERRORS.*` codes for portal-specific errors (F-8)
16. Place portal services in `apps/portal/src/services/` — outbox poller is portal-only (F-2)
17. Cross-app query tests run against real PostgreSQL, not mocks (F-6)

### Party Mode Findings Incorporated

| ID | Severity | Finding | Section Modified |
|----|----------|---------|-----------------|
| F-1 | Critical | `@igbo/db` `createDb()` factory + lazy singleton pattern | Monorepo Package Imports |
| F-2 | Medium | Portal services in `apps/portal/src/services/`. Outbox poller portal-only. | Portal Services |
| F-3 | Medium | `extractRouteParams` contract: `Record<string, string>`, throws `ApiError(400)` | API Routes |
| F-4 | Important | Test utilities centralized in `apps/portal/src/test-utils/` | Portal Testing |
| F-5 | Medium | Per-package `.env.test` + vitest env loading. Root `.env.test.example`. | Portal Testing |
| F-6 | Important | Cross-app query tests against real PostgreSQL (contract tests), CI Postgres container | Portal Testing |
| F-7 | Important | Portal Redis key taxonomy: `portal:{domain}:{id}` | Redis Key Taxonomy |
| F-8 | Medium | Portal error code enum `PORTAL_ERRORS` in `portal-errors.ts` | Portal Error Codes |
| F-9 | Medium | Skeleton naming: `*Skeleton` co-located named export, geometry must match | Component Organization |
| F-10 | Medium | `PortalAvatar` in `ui/` — all image surfaces must use it | Component Organization |

## Project Structure & Boundaries — Job Portal

### Complete Monorepo Directory Structure

```
igbo/
├── .github/
│   └── workflows/
│       ├── ci.yml                          # Turborepo-aware CI pipeline
│       ├── ci-integration.yml              # Cross-app integration tests
│       └── deploy.yml                      # Per-app deploy workflows
├── turbo.json                              # Task pipeline config
├── pnpm-workspace.yaml                     # Workspace definition
├── package.json                            # Root devDeps (turbo, prettier, etc.)
├── .env.test.example                       # Documents all test env vars
├── .prettierrc                             # Shared prettier config
│
├── apps/
│   ├── community/                          # @igbo/community — existing platform
│   │   ├── package.json
│   │   ├── next.config.ts                  # transpilePackages: ["@igbo/db", "@igbo/auth", "@igbo/config"]
│   │   ├── tailwind.config.ts              # Community color tokens
│   │   ├── vitest.config.ts                # @/ alias → src/
│   │   ├── .env.local
│   │   ├── .env.test
│   │   ├── e2e/
│   │   │   ├── playwright.config.ts        # baseURL: localhost:3000
│   │   │   └── tests/
│   │   ├── messages/
│   │   │   ├── en.json
│   │   │   └── ig.json
│   │   ├── public/
│   │   ├── Dockerfile
│   │   └── src/                            # Existing community source (unchanged)
│   │       ├── app/
│   │       ├── components/
│   │       ├── services/
│   │       ├── lib/
│   │       ├── hooks/
│   │       ├── config/
│   │       ├── i18n/                       # Existing next-intl config
│   │       ├── env.ts                      # Existing env validation
│   │       └── middleware.ts
│   │
│   └── portal/                             # @igbo/portal — NEW Job Portal
│       ├── package.json
│       ├── next.config.ts                  # transpilePackages: ["@igbo/db", "@igbo/auth", "@igbo/config"]
│       ├── tailwind.config.ts              # Portal tokens: portal-primary, portal-action, portal-context, portal-warm
│       ├── vitest.config.ts                # @/ alias → src/
│       ├── .env.local                      # Portal env vars (DATABASE_URL, REDIS_URL, PORTAL_BASE_URL, etc.)
│       ├── .env.test
│       ├── Dockerfile                      # Web server container
│       ├── Dockerfile.poller               # Outbox poller container (F-3)
│       ├── e2e/
│       │   ├── playwright.config.ts        # baseURL: job.localhost:3001
│       │   └── tests/
│       │       ├── seeker-browse-apply.spec.ts
│       │       ├── employer-post-review.spec.ts
│       │       ├── admin-queue.spec.ts
│       │       └── guest-conversion.spec.ts
│       ├── messages/
│       │   ├── en.json                     # Portal.* namespace keys (incl. emptyState variants F-8)
│       │   └── ig.json
│       ├── public/
│       │   └── icons/
│       ├── scripts/
│       │   └── outbox-poller.ts            # Standalone process, 1s poll interval (F-3)
│       └── src/
│           ├── app/
│           │   ├── globals.css
│           │   ├── layout.tsx              # PortalLayout + DensityProvider + usePathname focus
│           │   ├── page.tsx                # Portal home (redirect based on role)
│           │   ├── [locale]/
│           │   │   ├── layout.tsx          # i18n locale layout
│           │   │   ├── jobs/
│           │   │   │   ├── page.tsx        # "Jobs for You" / browse all (ISR, guest-accessible)
│           │   │   │   └── [jobId]/
│           │   │   │       └── page.tsx    # Job detail (ISR, guest-accessible)
│           │   │   ├── apply/
│           │   │   │   └── [jobId]/
│           │   │   │       └── page.tsx    # Apply flow (auth required)
│           │   │   ├── applications/
│           │   │   │   └── page.tsx        # My Applications (seeker)
│           │   │   ├── saved/
│           │   │   │   └── page.tsx        # Saved Jobs (seeker)
│           │   │   ├── apprenticeships/
│           │   │   │   ├── page.tsx
│           │   │   │   └── [id]/
│           │   │   │       └── page.tsx
│           │   │   ├── dashboard/
│           │   │   │   └── page.tsx        # Employer dashboard
│           │   │   ├── my-jobs/
│           │   │   │   ├── page.tsx        # Employer job listings
│           │   │   │   └── [jobId]/
│           │   │   │       ├── page.tsx    # Job detail (employer view + applications)
│           │   │   │       └── applications/
│           │   │   │           └── [applicationId]/
│           │   │   │               └── page.tsx  # Candidate detail
│           │   │   ├── post-job/
│           │   │   │   └── page.tsx        # PostingForm (employer)
│           │   │   ├── company/
│           │   │   │   └── page.tsx        # Company profile management
│           │   │   ├── admin/
│           │   │   │   ├── layout.tsx      # Admin layout
│           │   │   │   ├── review-queue/
│           │   │   │   │   └── page.tsx
│           │   │   │   ├── reports/
│           │   │   │   │   └── page.tsx
│           │   │   │   └── settings/
│           │   │   │       └── page.tsx
│           │   │   └── profile/
│           │   │       └── page.tsx        # Portal profile (seeker resume, skills)
│           │   └── api/v1/
│           │       ├── jobs/
│           │       │   ├── route.ts                    # GET (list+filter), POST (create)
│           │       │   └── [jobId]/
│           │       │       ├── route.ts                # GET, PATCH, DELETE
│           │       │       ├── applications/
│           │       │       │   ├── route.ts            # GET (employer: list applicants)
│           │       │       │   └── [applicationId]/
│           │       │       │       └── route.ts        # GET, PATCH (status change)
│           │       │       └── match-score/
│           │       │           └── route.ts            # GET (real-time score)
│           │       ├── applications/
│           │       │   └── route.ts                    # POST (apply), GET (my applications)
│           │       ├── companies/
│           │       │   ├── route.ts
│           │       │   └── [companyId]/
│           │       │       └── route.ts
│           │       ├── apprenticeships/
│           │       │   ├── route.ts
│           │       │   └── [id]/
│           │       │       └── route.ts
│           │       ├── saved-jobs/
│           │       │   └── route.ts
│           │       ├── match-scores/
│           │       │   └── recompute/
│           │       │       └── route.ts                # POST (admin: trigger batch)
│           │       ├── admin/
│           │       │   └── review-queue/
│           │       │       ├── route.ts
│           │       │       └── [postingId]/
│           │       │           └── route.ts
│           │       ├── internal/
│           │       │   └── jobs/
│           │       │       ├── recompute-matches/
│           │       │       │   └── route.ts            # POST — cron: batch recompute
│           │       │       └── cleanup-outbox/
│           │       │           └── route.ts            # POST — cron: purge > 24h
│           │       └── user/
│           │           ├── portal-role/
│           │           │   └── route.ts
│           │           └── resume/
│           │               └── route.ts
│           ├── components/
│           │   ├── ui/                                 # shadcn/ui primitives + PortalAvatar
│           │   │   ├── button.tsx
│           │   │   ├── card.tsx
│           │   │   ├── dialog.tsx
│           │   │   ├── sheet.tsx
│           │   │   ├── popover.tsx
│           │   │   ├── portal-avatar.tsx               # next/image + fallback wrapper (F-10)
│           │   │   └── ...
│           │   ├── semantic/                           # Layer 1
│           │   │   ├── status-pill.tsx                 # + StatusPillSkeleton
│           │   │   ├── status-pill.test.tsx            # Co-located test (F-4)
│           │   │   ├── match-pill.tsx                  # + MatchPillSkeleton
│           │   │   ├── match-pill.test.tsx
│           │   │   ├── trust-badge.tsx                 # + TrustBadgeSkeleton
│           │   │   └── trust-badge.test.tsx
│           │   ├── domain/                             # Layer 2
│           │   │   ├── job-card.tsx                    # + JobCardSkeleton
│           │   │   ├── job-card.test.tsx               # Co-located test (F-4)
│           │   │   ├── candidate-card.tsx              # + CandidateCardSkeleton
│           │   │   ├── candidate-card.test.tsx
│           │   │   ├── review-queue-row.tsx            # + ReviewQueueRowSkeleton
│           │   │   ├── application-status-block.tsx    # "Viewed" hero + Skeleton
│           │   │   ├── empty-state-card.tsx            # variant prop → i18n lookup (F-8)
│           │   │   └── notification-item.tsx           # + Skeleton
│           │   ├── flow/                               # Layer 3
│           │   │   ├── apply-drawer.tsx                # + ApplyDrawerSkeleton
│           │   │   ├── posting-form.tsx                # + PostingFormSkeleton
│           │   │   └── confirmation-panel.tsx
│           │   └── layout/
│           │       ├── portal-layout.tsx
│           │       ├── portal-top-nav.tsx
│           │       ├── portal-bottom-nav.tsx
│           │       ├── portal-sidebar.tsx
│           │       └── role-switcher.tsx
│           ├── providers/
│           │   └── density-provider.tsx
│           ├── hooks/
│           │   ├── use-filter-params.ts
│           │   ├── use-keyboard-shortcuts.ts
│           │   ├── use-active-portal-role.ts
│           │   └── use-reduced-motion.ts
│           ├── services/
│           │   ├── matching-engine.ts
│           │   ├── matching-engine.test.ts             # Co-located test (F-4)
│           │   ├── application-service.ts
│           │   ├── application-service.test.ts
│           │   ├── posting-service.ts
│           │   ├── posting-service.test.ts
│           │   ├── review-service.ts
│           │   └── trust-signal-service.ts
│           ├── lib/
│           │   ├── portal-errors.ts                    # PORTAL_ERRORS enum
│           │   └── api-response.ts
│           ├── types/                                  # Portal domain types (F-7)
│           │   ├── job.ts                              # Job, JobWithCompany, JobCardData
│           │   ├── application.ts                      # Application, ApplicationWithMatch, ApplicationStatus
│           │   ├── company.ts                          # Company, CompanyProfile
│           │   ├── match.ts                            # MatchScore, MatchQuality, MatchBreakdown
│           │   └── portal-role.ts                      # PortalRole, ActivePortalRole
│           ├── i18n/                                   # Portal next-intl config (F-1)
│           │   ├── routing.ts                          # Portal locale routing
│           │   ├── request.ts                          # getRequestConfig for portal
│           │   └── navigation.ts                       # Portal typed Link, redirect, usePathname
│           ├── env.ts                                  # Portal env validation (F-2)
│           ├── config/
│           │   └── portal-config.ts
│           ├── test-utils/
│           │   ├── render.tsx                          # renderWithPortalContext/Providers
│           │   ├── factories.ts                        # createMockJob, createMockApplication (mock, no DB)
│           │   └── setup.ts                            # axe extensions
│           └── middleware.ts
│
├── packages/
│   ├── db/                                 # @igbo/db — shared database layer
│   │   ├── package.json                    # exports with server-only conditions
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── .env.test
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── index.ts                    # createDb() factory + lazy singleton
│   │       ├── schema/
│   │       │   ├── auth-users.ts           # Existing
│   │       │   ├── community-posts.ts      # Existing
│   │       │   ├── community-profiles.ts   # Existing
│   │       │   ├── ...                     # All existing community schemas
│   │       │   ├── job-postings.ts         # NEW: portal
│   │       │   ├── job-applications.ts     # NEW: portal
│   │       │   ├── job-companies.ts        # NEW: portal
│   │       │   ├── job-match-scores.ts     # NEW: portal
│   │       │   ├── job-event-outbox.ts     # NEW: portal
│   │       │   ├── job-saved-jobs.ts       # NEW: portal
│   │       │   └── job-apprenticeships.ts  # NEW: portal
│   │       ├── queries/
│   │       │   ├── posts.ts               # Existing community queries
│   │       │   ├── users.ts               # Existing
│   │       │   ├── ...                     # All existing community queries
│   │       │   ├── cross-app.ts           # Named functions for cross-app reads
│   │       │   ├── cross-app.test.ts      # Contract tests — real PostgreSQL (F-6)
│   │       │   ├── job-postings.ts        # NEW: portal queries
│   │       │   ├── job-applications.ts    # NEW: portal queries
│   │       │   ├── job-match-scores.ts    # NEW: portal queries
│   │       │   └── job-companies.ts       # NEW: portal queries
│   │       └── migrations/
│   │           ├── 0000_initial.sql
│   │           ├── ...
│   │           ├── 0049_last_numbered.sql
│   │           ├── 20260415120000_job_postings.sql
│   │           ├── 20260415130000_job_applications.sql
│   │           ├── 20260416090000_job_match_scores.sql
│   │           ├── 20260416100000_job_event_outbox.sql
│   │           └── meta/
│   │               └── _journal.json       # Auto-generated by idx script
│   │
│   ├── auth/                               # @igbo/auth — shared auth layer
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                    # Auth.js config, session helpers
│   │       ├── session.ts                  # requireAuthenticatedSession, requireAdminSession
│   │       ├── rbac.ts                     # Role/permission checks (incl. JOB_ADMIN)
│   │       └── portal-role.ts             # activePortalRole session helpers
│   │
│   ├── config/                             # @igbo/config — shared configuration
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── redis.ts                    # createRedisKey(app, domain, id)
│   │       ├── route-helpers.ts            # extractRouteParams(url, pattern)
│   │       ├── env.ts                      # Shared base env schema (DATABASE_URL, REDIS_URL, etc.)
│   │       └── tailwind/
│   │           └── base.config.ts          # Shared: spacing (8px grid), breakpoints (md/lg), fonts (Inter/JetBrains), animations — NO colors (F-6)
│   │
│   └── integration-tests/                  # Cross-app integration tests
│       ├── package.json
│       ├── vitest.config.ts
│       ├── .env.test
│       └── src/
│           ├── fixtures/                   # DB seed factories (F-5)
│           │   ├── seed.ts                 # Seeds test DB with minimal data
│           │   ├── users.ts               # Test user factory (real DB inserts)
│           │   ├── jobs.ts                # Test job factory
│           │   └── applications.ts        # Test application factory
│           ├── sso-flow.test.ts
│           ├── outbox-poller.test.ts        # 5 integration tests
│           ├── cross-app-events.test.ts
│           └── trust-signal-flow.test.ts
│
├── scripts/
│   ├── migration-idx.ts                    # Auto-assigns sequential idx to migrations
│   └── codemod-imports.ts                  # @/ → @igbo/* import migration tool
│
└── docs/
    ├── decisions/
    │   ├── isr-pattern.md
    │   ├── bilingual-editor-prototype.md
    │   └── monorepo-migration.md           # Phase 0 migration guide
    └── dev-setup.md                        # Monorepo dev setup guide
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | Owner | Consumers | Protocol |
|----------|-------|-----------|----------|
| `apps/portal/src/app/api/v1/` | Portal app | Portal frontend, external clients | REST, RFC 7807 |
| `apps/portal/src/app/api/v1/internal/` | Portal app | Cron scheduler (GitHub Actions) | REST, internal only |
| `apps/community/src/app/api/v1/` | Community app | Community frontend | REST, RFC 7807 |
| `@igbo/db/queries/cross-app` | `@igbo/db` package | Both apps (read-only) | TypeScript function calls |
| EventBus (Redis pub/sub) | Shared infrastructure | Both apps (publish + subscribe) | Event payloads |
| Outbox poller (`apps/portal/scripts/`) | Portal standalone process | Portal notification delivery | PostgreSQL polling |

**Data Boundaries:**

| Data Domain | Schema Location | Query Location | Owner |
|-------------|----------------|----------------|-------|
| Auth/Users | `@igbo/db/schema/auth-*` | `@igbo/db/queries/users` | `@igbo/db` (shared) |
| Community content | `@igbo/db/schema/community-*` | `@igbo/db/queries/posts`, etc. | Community app |
| Portal jobs | `@igbo/db/schema/job-*` | `@igbo/db/queries/job-*` | Portal app |
| Cross-app reads | N/A (reads existing schemas) | `@igbo/db/queries/cross-app` | `@igbo/db` (shared) |

**Rule:** Portal NEVER writes to community tables. Community NEVER writes to portal tables. Cross-app reads go through `@igbo/db/queries/cross-app` named functions only.

**Component Boundaries:**

| Layer | Location | Imports From | Never Imports |
|-------|----------|-------------|---------------|
| Semantic (StatusPill, etc.) | `components/semantic/` | `ui/` only | Domain, Flow, services |
| Domain (JobCard, etc.) | `components/domain/` | `ui/`, `semantic/` | Flow, services |
| Flow (ApplyDrawer, etc.) | `components/flow/` | `ui/`, `semantic/`, `domain/`, hooks | services directly (uses hooks) |
| Layout | `components/layout/` | `ui/`, hooks, providers | Domain, Flow |

### Outbox Poller Deployment (F-3)

The outbox poller runs as a **standalone Node process** — not inside the Next.js web server. It needs 1-second poll intervals which cron cannot provide.

- **Development:** `tsx apps/portal/scripts/outbox-poller.ts` (runs alongside `turbo run dev`)
- **Production:** `Dockerfile.poller` builds a lightweight Node container. Same `DATABASE_URL` env var as the portal web server. Deployed as a separate container alongside `igbo-portal`.
- **Cron-triggered jobs** (5-min match recompute, 24h outbox cleanup) still use the API route pattern: `POST /api/v1/internal/jobs/recompute-matches` triggered by GitHub Actions cron or external scheduler.

### Portal Environment Validation (F-2)

```typescript
// apps/portal/src/env.ts
import { baseEnvSchema } from "@igbo/config/env";
import { z } from "zod/v4";

export const portalEnv = baseEnvSchema.extend({
  PORTAL_BASE_URL: z.string().url(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  MATCH_RECOMPUTE_INTERVAL_MS: z.coerce.number().default(300000),
  NEXT_PUBLIC_PORTAL_NAME: z.string().default("Igbo Jobs"),
});

// Validated at startup in layout.tsx or instrumentation.ts
```

### Tailwind Base Config Contract (F-6)

```typescript
// @igbo/config/src/tailwind/base.config.ts
export const baseConfig = {
  theme: {
    screens: { md: "768px", lg: "1024px" },
    fontFamily: {
      sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      mono: ["var(--font-jetbrains)", "monospace"],
    },
    // 8px grid spacing scale
  },
  plugins: [
    // @tailwindcss/typography — prose classes
    // @tailwindcss/container-queries — @container variants
  ],
};
// Exports: spacing, breakpoints, fonts, animations, plugins
// Does NOT export: colors (each app defines its own)
```

### Empty State i18n Pattern (F-8)

`EmptyStateCard` takes a `variant` prop and looks up i18n keys by variant name:

```typescript
// empty-state-card.tsx
type EmptyStateVariant =
  | "noJobsMatch" | "noJobsColdStart" | "noApplicationsSeeker"
  | "noApplicationsEmployer" | "noCandidatesMatch" | "emptyQueue"
  | "noNotifications" | "noSavedJobs" | "searchNoResults";

type EmptyStateTone = "celebratory" | "instructional" | "reassuring" | "optimistic" | "practical";

const VARIANT_TONE: Record<EmptyStateVariant, EmptyStateTone> = {
  noJobsMatch: "practical",
  noJobsColdStart: "optimistic",
  noApplicationsSeeker: "reassuring",
  noApplicationsEmployer: "reassuring",
  noCandidatesMatch: "practical",
  emptyQueue: "celebratory",
  noNotifications: "celebratory",
  noSavedJobs: "instructional",
  searchNoResults: "practical",
};
```

All copy lives in `messages/en.json` under `Portal.emptyState.{variant}.headline`, `.cta`, `.secondaryCta`.

### PRD v2 Requirements → Structure Mapping

| PRD Category | FR Range | Portal Location |
|--------------|----------|-----------------|
| Job Posting & Management | FR1-FR18 | `services/posting-service`, `api/v1/jobs/`, `components/flow/posting-form`, `schema/job-postings` |
| Application Flow | FR19-FR32 | `services/application-service`, `api/v1/applications/`, `components/flow/apply-drawer`, `schema/job-applications` |
| Smart Matching | FR33-FR42 | `services/matching-engine`, `api/v1/jobs/[jobId]/match-score/`, `components/semantic/match-pill`, `schema/job-match-scores` |
| Trust & Verification | FR43-FR52 | `services/trust-signal-service`, `@igbo/db/queries/cross-app`, `components/semantic/trust-badge` |
| Content Moderation | FR53-FR62 | `services/review-service`, `api/v1/admin/review-queue/`, `components/domain/review-queue-row` |
| Apprenticeship Program | FR63-FR72 | `api/v1/apprenticeships/`, `schema/job-apprenticeships`, `app/[locale]/apprenticeships/` |
| Guest Access & SEO | FR73-FR82 | ISR in `page.tsx` files, `middleware.ts` (auth gates at action points) |
| Notifications | FR83-FR92 | `scripts/outbox-poller` (critical), EventBus (standard), shared NotificationRouter |
| Navigation & Role Switch | FR93-FR100 | `components/layout/`, `hooks/use-active-portal-role`, `api/v1/user/portal-role/` |
| Filtering & Search | FR101-FR108 | `hooks/use-filter-params`, `api/v1/jobs/?context=...` |

### Cross-Cutting Concerns → Structure Mapping

| Concern | Files |
|---------|-------|
| Cross-subdomain SSO | `@igbo/auth/src/index.ts`, `@igbo/auth/src/portal-role.ts`, `packages/integration-tests/sso-flow.test.ts` |
| Redis namespacing | `@igbo/config/src/redis.ts`, consumed by both apps |
| Bilingual content | `messages/en.json` + `ig.json` per app, `Portal.*` namespace |
| Design tokens | `apps/portal/tailwind.config.ts`, `@igbo/config/tailwind/base.config.ts` |
| Density modes | `apps/portal/src/providers/density-provider.tsx` |
| Accessibility | axe in every component test, skip links in portal layout, ARIA per UX spec |
| Migration tooling | `scripts/migration-idx.ts`, CI pre-merge check |
| Portal env validation | `apps/portal/src/env.ts` extending `@igbo/config/env` (F-2) |
| Portal i18n config | `apps/portal/src/i18n/` — routing, request, navigation (F-1) |
| Portal domain types | `apps/portal/src/types/` — Job, Application, Company, Match, PortalRole (F-7) |
| Empty state content | i18n keys `Portal.emptyState.{variant}.*`, `EmptyStateCard` variant prop (F-8) |

### Party Mode Findings Incorporated

| ID | Severity | Finding | Section Modified |
|----|----------|---------|-----------------|
| F-1 | Important | `apps/portal/src/i18n/` — routing.ts, request.ts, navigation.ts for next-intl | Directory Structure |
| F-2 | Medium | `apps/portal/src/env.ts` — portal env validation extending base schema | Directory Structure, Env Validation |
| F-3 | Important | Outbox poller as standalone script + `Dockerfile.poller` — 1s intervals need own process | Directory Structure, Outbox Deployment |
| F-4 | Low | Co-located test files shown in directory examples | Directory Structure |
| F-5 | Medium | `packages/integration-tests/src/fixtures/` — DB seed factories | Directory Structure |
| F-6 | Medium | `@igbo/config/tailwind/base.config.ts` contract: spacing, breakpoints, fonts — NO colors | Tailwind Base Config |
| F-7 | Medium | `apps/portal/src/types/` — Job, Application, Company, MatchScore, PortalRole | Directory Structure |
| F-8 | Medium | Empty state content in i18n, `EmptyStateCard` variant prop, tone mapping | Empty State Pattern |

## Architecture Validation Results — Job Portal

### Coherence Validation ✅

**Decision Compatibility:**
All portal architectural decisions are compatible with each other and with the existing community platform architecture. 10 critical technology pairings validated: Turborepo+pnpm ↔ Next.js 16.1.x (Vercel-maintained), `@igbo/db` singleton ↔ Drizzle ORM (`createDb()` factory + Proxy), outbox poller (1s) ↔ container strategy (standalone `Dockerfile.poller`), cross-subdomain SSO ↔ Auth.js v5 (apex cookie + Safari ITP), matching engine (hybrid) ↔ EventBus (stale flag + batch recompute), `DensityContext` ↔ `@igbo/ui` deferral (portal-only provider), timestamp migrations ↔ existing numbered (transition rule clear), portal Redis keys ↔ community Redis keys (`createRedisKey()` typed enforcement), three-layer components ↔ Tailwind theme tokens, `extractRouteParams()` ↔ `withApiHandler()`.

**Pattern Consistency:**
Portal extends all community patterns without deviation. Import convention clear: `@igbo/*` for shared, `@/` for app-local. DB naming (`job_*` prefix), API format (RFC 7807), EventBus events (dot-notation past tense), test co-location — all inherited unchanged. New patterns (three-layer components, DensityContext, outbox) are portal-scoped and don't conflict.

**Structure Alignment:**
Monorepo structure supports all decisions. `packages/db/` as single migration source of truth matches "both apps run all migrations." Portal services in `apps/portal/src/services/` matches portal-only ownership. `packages/integration-tests/` last in Turborepo pipeline matches CI dependency order. `Dockerfile.poller` alongside `Dockerfile` in portal app matches container strategy.

**Connection Pooling Specificity (F-1):**
`createDb()` factory must accept pool configuration to satisfy NFR42 (separate connection pool):

```typescript
// packages/db/src/index.ts
export function createDb(connectionString: string, options?: { poolSize?: number }) {
  const client = postgres(connectionString, { max: options?.poolSize ?? 20 });
  return drizzle(client, { schema });
}
```

Expected pool sizes: community (default: 20), portal (default: 10), integration tests (default: 5). Each app passes its pool size via env var (`DB_POOL_SIZE`).

**Tailwind Base Config Merge Semantics (F-3):**
Each app's `tailwind.config.ts` uses `extends` to merge with `@igbo/config/tailwind/base.config.ts`:

```typescript
// apps/portal/tailwind.config.ts
import { baseConfig } from "@igbo/config/tailwind/base.config";

export default {
  ...baseConfig,
  theme: {
    ...baseConfig.theme,
    extend: {
      colors: {
        "portal-primary": "#2D5016",
        "portal-action": "#C4841D",
        // ...
      },
    },
  },
};
```

Both apps confirmed on Tailwind v4. Base config is v4-compatible (CSS-first configuration). No v3 `module.exports` patterns.

### Requirements Coverage Validation ✅

**Functional Requirements (108 FRs across 14 categories):**

| FR Category | FR Range | Coverage |
|------------|----------|---------|
| Job Posting & Lifecycle | FR1-FR14 | ✅ FULL |
| Company Profiles | FR15-FR20 | ✅ FULL |
| Job Seeker Profiles & Resume | FR21-FR30 | ✅ FULL |
| Application System & ATS | FR31-FR43 | ✅ FULL |
| Smart Matching | FR44-FR48 | ✅ FULL |
| Search & Discovery | FR49-FR55 | ✅ FULL |
| Apprenticeship Program | FR56-FR58 | ✅ FULL |
| Messaging | FR59-FR61 | ✅ FULL |
| Notifications | FR62-FR65 | ✅ FULL |
| Referral System | FR66-FR69 | ✅ FULL |
| Guest Access & SEO | FR70-FR75 | ✅ FULL |
| Job Admin Review | FR76-FR83 | ✅ FULL |
| Cold Start & Onboarding | FR84-FR86 | ✅ FULL |
| Platform Integration | FR87-FR90 | ✅ FULL |
| Data Protection | FR91-FR97 | ✅ FULL |
| Community Trust | FR98-FR108 | ✅ FULL |

**Journey Coverage Gap — Posting Templates (F-10):**
Journey 4 (Repeat Employer) describes "selects a previous posting as a template" but no FR covers this. Architecturally supported — job posting data is already stored, copying is a service-level operation in `posting-service.ts`. Recommended: Add FR109 ("Employers can create a new job posting by copying from a previous posting") during story creation, or document as UX enhancement beyond core MVP if scope is tight. Architecture does NOT need changes to support this.

**Journey Coverage Gap — Apprenticeship Success Stories (F-11):**
FR101 specifies Job Admin management of success stories, but Journey 3 depends on the featured section having content at launch. Without seed data, the apprenticeship carousel is empty on day one. Recommended: Seed 2-3 success stories via migration data (JSONB content with sanitized HTML), or provide a simple admin form as part of the admin review story. Do not defer entirely — Journey 3's emotional impact depends on visible success stories.

**Non-Functional Requirements (42 NFRs):**

| NFR Category | Coverage |
|-------------|---------|
| Performance (NFR1-7) | ✅ FULL — ISR+CDN, hybrid matching (pre-computed for NFR5), JS budgets, Lighthouse CI |
| Security (NFR8-17) | ✅ FULL — TLS, S3 encryption, signed URLs, apex cookie SSO, CSRF, audit, sanitize-html, no PII |
| Scalability (NFR18-22) | ✅ FULL — independent container, portal DB prefix, connection pooling (F-1), search abstraction |
| Reliability (NFR23-28) | ✅ FULL — 99.5%, rolling deploys, additive migrations, retry UI, idempotent notifications, test suite gate |
| Accessibility (NFR29-35) | ✅ FULL — WCAG 2.1 AA, 44px targets, ARIA live regions, text+color badges, combobox, keyboard nav, axe-core |
| Integration (NFR36-42) | ✅ FULL — SSO <1s (Safari ITP), EventBus naming, shared realtime auth, CI trigger, rate limiting, pool config (F-1) |

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions documented with concrete implementation details. Connection pooling now includes factory API and expected pool sizes (F-1). Outbox poller includes graceful shutdown protocol (F-2). Tailwind config includes merge semantics (F-3).

**Structure Completeness:**
Full directory tree with 200+ files/directories. Every FR mapped to specific portal location. All new `job_*` tables enumerated. All API routes specified with HTTP methods.

**Pattern Completeness:**
17 mandatory agent rules. New enforcement additions:
- Every `extractRouteParams()` call must have a paired unit test verifying the pattern string matches the actual filesystem route (F-4)
- Codemod script is multi-pass: source imports, `vi.mock()` paths, inline mocks, dynamic `import()` calls (F-5)
- axe-core exclusion config for known upstream shadcn/ui issues maintained in `apps/portal/src/test-utils/axe-config.ts` (F-9)

**Outbox Poller Graceful Shutdown (F-2):**

```typescript
// apps/portal/scripts/outbox-poller.ts
let running = true;

process.on("SIGTERM", () => {
  console.log("[poller] SIGTERM received, finishing current cycle...");
  running = false;
});

async function poll() {
  while (running) {
    await processOutboxBatch();
    await sleep(POLL_INTERVAL_MS);
  }
  console.log("[poller] Graceful shutdown complete.");
  process.exit(0);
}
```

Health check: Docker Compose uses `healthcheck: test: ["CMD", "kill", "-0", "1"]` (process liveness). Kubernetes: liveness probe on process existence. No HTTP health endpoint needed for a background worker.

**Portal Middleware Responsibilities (F-6):**

Portal `middleware.ts` handles 5 concerns (vs community's 3):

1. **SSO session validation** — verify apex-domain cookie, refresh if expired
2. **Locale detection** — `next-intl` locale from URL segment or `Accept-Language`
3. **Portal-role injection** — read `activePortalRole` from session, inject into request headers for downstream consumption
4. **Guest pass-through** — ISR pages (job listings, job details) accessible without auth; auth gate only at action points (Apply, Message, Dashboard)
5. **Rate limiting** — per-route, per-user sliding window (inherited pattern from community)

**`extractRouteParams` Test Enforcement (F-4):**

```typescript
// Every route using extractRouteParams MUST have this paired test:
it("extractRouteParams matches filesystem route structure", () => {
  const url = "http://localhost/api/v1/jobs/job-123/applications/app-456";
  const params = extractRouteParams(url, "/api/v1/jobs/:jobId/applications/:applicationId");
  expect(params).toEqual({ jobId: "job-123", applicationId: "app-456" });
});
```

Added to enforcement rules: Rule 18 — "Every `extractRouteParams` call requires a paired unit test verifying param extraction from a realistic URL matching the filesystem route."

### Gap Analysis Results

**Critical Gaps:** None.

**Important Gaps (non-blocking, all addressed by Party Mode findings):**

1. **Connection pooling API** — `createDb()` now accepts `{ poolSize }` option (F-1). Implement in Phase 0 during `@igbo/db` extraction.
2. **Outbox poller graceful shutdown** — SIGTERM handler + container health check specified (F-2). Implement when building `Dockerfile.poller`.
3. **Safari ITP SSO E2E test** — Mandatory Playwright WebKit test as Phase 0 acceptance criterion (F-7). Must verify: login on apex → navigate to portal subdomain → session present.
4. **Match score staleness integration tests** — 3 scenarios added to `packages/integration-tests` (F-8): (1) profile update → stale=true, (2) batch recompute → scores refreshed, (3) concurrent updates → no lost staleness flags.
5. **`extractRouteParams` test pairing** — Enforcement rule 18 added (F-4).
6. **Posting templates** — Architecture supports it, FR109 recommended (F-10).
7. **Apprenticeship success story seed data** — Seed 2-3 stories via migration or provide admin form (F-11).

**Nice-to-Have Gaps:**

1. **Codemod multi-pass documentation** — Document as 4-pass tool (source, vi.mock paths, inline mocks, dynamic imports) (F-5).
2. **Portal middleware documentation** — 5 responsibilities explicitly documented (F-6).
3. **axe-core exclusion config** — `axe-config.ts` for known upstream shadcn/ui issues (F-9).
4. **Tailwind merge semantics** — `extends` pattern documented with v4 confirmation (F-3).

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (108 FRs, 42 NFRs, 6 user journeys)
- [x] Scale and complexity assessed (High, 8-10 new subsystems + 4-5 shared extractions)
- [x] Technical constraints identified (monorepo, SSO, shared DB/Redis, UX three-layer)
- [x] Cross-cutting concerns mapped (14 concerns with file locations)

**✅ Architectural Decisions**
- [x] Critical decisions documented with implementation details
- [x] Technology stack leverages existing platform stack + Turborepo + pnpm
- [x] Integration patterns defined (named query functions, EventBus, outbox, Redis namespacing)
- [x] Performance considerations addressed (hybrid matching, ISR, bundle budgets, connection pooling F-1)

**✅ Implementation Patterns**
- [x] Inherited patterns documented (9 patterns from community)
- [x] New patterns documented with code examples (18+ portal-specific patterns)
- [x] Communication patterns specified (portal EventBus events, outbox, cross-app reads)
- [x] Process patterns documented (outbox poller with graceful shutdown F-2, batch recompute, skeleton naming)

**✅ Project Structure**
- [x] Complete monorepo directory structure defined (apps + packages + scripts)
- [x] Component boundaries established (three-layer, API, data, package)
- [x] Integration points mapped (cross-app queries, EventBus, SSO, shared infra)
- [x] Requirements to structure mapping complete (all 108 FRs + 6 journeys mapped)

**✅ Test Strategy**
- [x] Safari ITP SSO E2E test specified as Phase 0 gate (F-7)
- [x] Match score staleness integration tests specified (3 scenarios) (F-8)
- [x] `extractRouteParams` paired test enforcement rule added (F-4)
- [x] axe-core exclusion config for upstream issues documented (F-9)
- [x] Outbox poller integration tests (5 scenarios, from Step 4)

### Validation Issues Addressed

All issues identified during validation were resolved through Party Mode Round 6 (11 findings from 4 agents):

- **2 critical:** Connection pooling API (F-1), Safari ITP E2E test (F-7)
- **4 important:** Outbox graceful shutdown (F-2), extractRouteParams test pairing (F-4), match staleness tests (F-8), posting templates FR gap (F-10)
- **5 medium:** Tailwind merge semantics (F-3), codemod multi-pass (F-5), portal middleware docs (F-6), axe-core exclusions (F-9), success story seed data (F-11)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**

- Clean monorepo extraction strategy with dependency-ordered PRs (config → db → auth)
- Hybrid matching engine avoids both fan-out storms and stale feeds
- PostgreSQL outbox pattern provides same-transaction guarantee for "Viewed" signal without new infrastructure
- Deferred `@igbo/ui` extraction reduces Phase 0 scope by ~30%
- 61 Party Mode findings incorporated across 6 rounds — architecture stress-tested from 6+ agent perspectives
- Cross-app query functions with explicit TypeScript return types as enforceable contracts
- Three-layer component architecture (semantic/domain/flow) matches UX spec density modes
- Connection pooling with configurable pool sizes per app (NFR42)
- Outbox poller with graceful shutdown and container health checks
- Safari ITP SSO explicitly tested as Phase 0 acceptance criterion

**Areas for Future Enhancement:**

- `@igbo/ui` extraction (Phase 1 — after portal reveals shared vs divergent components)
- Read replica activation if portal query load exceeds threshold (operational, not architectural)
- AI-powered matching improvements (matching engine abstraction is ready)
- Premium employer tiers / payment infrastructure hooks
- Native mobile API adaptations / BFF layer
- Dedicated search engine (Meilisearch) when PostgreSQL full-text search hits scale limits

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all 18 portal enforcement rules exactly as documented
- Inherit all 10 community enforcement rules for shared patterns
- Respect package boundaries: `@igbo/*` for shared, `@/` for app-local
- Use outbox pattern for critical signals, EventBus for everything else
- Include axe-core assertions in every portal component test (with exclusion config for upstream issues)
- Refer to this document for all architectural questions

**First Implementation Priority:**

Phase 0 — Monorepo migration:
1. Install Turborepo + pnpm, create workspace definition
2. Extract `@igbo/config` (shared configs, Redis helpers, route helpers, Tailwind base config)
3. Extract `@igbo/db` (schema, migrations, queries, `createDb()` with pool config) — run multi-pass codemod for import paths
4. Extract `@igbo/auth` (Auth.js config, session helpers, RBAC, portal-role helpers)
5. Verify all 4,795+ existing tests pass with updated import paths
6. Safari ITP SSO E2E test in Playwright WebKit — Phase 0 acceptance gate

### Party Mode Findings Incorporated

| ID | Severity | Finding | Agent | Section Modified |
|----|----------|---------|-------|-----------------|
| F-1 | Critical | `createDb(connectionString, { poolSize })` — factory must accept pool config for NFR42 | Winston | Coherence Validation, Implementation Readiness |
| F-2 | Important | Outbox poller graceful shutdown: SIGTERM handler + container health check | Winston | Implementation Readiness |
| F-3 | Medium | Tailwind base config merge semantics — `extends` pattern, v4 confirmed | Winston | Coherence Validation |
| F-4 | Important | Every `extractRouteParams` call needs paired unit test verifying pattern matches filesystem route | Amelia | Implementation Readiness, Enforcement Rule 18 |
| F-5 | Medium | Codemod is multi-pass (source imports + vi.mock paths + inline mocks + dynamic imports) | Amelia | Gap Analysis |
| F-6 | Medium | Portal middleware 5 responsibilities documented explicitly | Amelia | Implementation Readiness |
| F-7 | Critical | Safari ITP SSO E2E test in Playwright WebKit — Phase 0 acceptance criterion | Murat | Gap Analysis, Implementation Handoff |
| F-8 | Important | Match score staleness integration tests (3 scenarios) | Murat | Gap Analysis |
| F-9 | Medium | axe-core exclusion config for known upstream shadcn/ui issues | Murat | Implementation Readiness, Gap Analysis |
| F-10 | Important | Journey 4 "posting template" — no FR. Add FR109 or document as post-MVP | John | Requirements Coverage |
| F-11 | Medium | Apprenticeship success stories need seed data — Journey 3 depends on them | John | Requirements Coverage |
