---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - product-brief-igbo-2026-02-18.md
  - prd.md
  - prd-validation-report.md
  - ux-design-specification.md
  - masterplan2.1.md
  - Job_Portal_PRD_v1.1_FINAL.md
workflowType: "architecture"
lastStep: 8
status: "complete"
completedAt: "2026-02-20"
project_name: "igbo"
user_name: "Dev"
date: "2026-02-19"
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
