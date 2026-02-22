# Story 1.1c: EventBus, Job Runner & Background Jobs

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a typed EventBus with Redis pub/sub cross-container delivery and a job runner framework for scheduled background tasks,
so that services communicate through events and platform jobs run reliably on a schedule.

## Acceptance Criteria

1. **Typed EventBus Service**
   - Given services need decoupled communication from day one
   - When the EventBus service is created at `src/services/event-bus.ts`
   - Then it implements a typed in-process event emitter (Node.js `EventEmitter`-based) with `domain.action` past-tense event names (`user.created`, `post.published`, `message.sent`, `points.awarded`, `member.banned`)
   - And all event payloads are defined as TypeScript interfaces in `src/types/events.ts` (e.g., `PostPublishedEvent { postId, authorId, groupId?, timestamp }`)
   - And consumers register via `eventBus.on('post.published', handler)` with typed handlers
   - And services never call each other directly — all inter-service communication goes through EventBus (per Architecture constraint)

2. **Redis Pub/Sub Cross-Container Delivery**
   - Given the Web container emits events that the Realtime container (Socket.IO) needs to receive
   - When an event is emitted via the EventBus
   - Then the EventBus publishes to a Redis pub/sub channel (`eventbus:{eventName}`) which the Realtime container subscribes to and forwards to the appropriate Socket.IO namespace
   - And separate Redis connections are used for publisher and subscriber (ioredis requirement — subscriber connections cannot execute other commands)

3. **Job Runner Framework**
   - Given platform features need scheduled background jobs (GDPR retention cleanup, recording expiry, notification digests)
   - When the job scheduling infrastructure is set up
   - Then a job runner framework is established at `src/server/jobs/job-runner.ts` with: typed job registration, error handling with Sentry reporting, execution logging, and retry support (configurable per job, default 3 retries with exponential backoff)
   - And job execution is monitored: each run logs start/end/status to stdout (captured by Docker), and failed jobs emit a `job.failed` event via EventBus for alerting (consumed by monitoring in Story 12.3)

4. **Docker Cron Configuration**
   - Given jobs need to run on a schedule in both dev and production
   - When Docker cron configuration is added
   - Then a `crontab` configuration file at `docker/crontab` defines the schedule for all platform jobs (initially empty, populated as jobs are added in Stories 1.13, 7.4, 9.4)
   - And Docker Compose is updated with cron scheduling capability

## Tasks / Subtasks

- [x] Task 1: Create event type definitions (AC: #1)
  - [x] Create `src/types/events.ts` with typed event map interface
  - [x] Define `domain.action` past-tense event names as string literal union type
  - [x] Define TypeScript interfaces for all initial event payloads: `UserCreatedEvent`, `PostPublishedEvent`, `MessageSentEvent`, `PointsAwardedEvent`, `MemberBannedEvent`, `JobFailedEvent`, `MemberFollowedEvent`, `MemberUnfollowedEvent`, `ArticleSubmittedEvent`, `ArticlePublishedEvent`, `GroupArchivedEvent`, `EventAttendedEvent`, `MemberAnonymizingEvent`, `MemberAnonymizedEvent`, `MemberApprovedEvent`, `PostReactedEvent`, `PostCommentedEvent`, `ArticleCommentedEvent`, `MessageMentionedEvent`, `RecordingExpiredEvent`
  - [x] All payloads must include a `timestamp` field (ISO 8601 string)
  - [x] Export `EventMap` type mapping event names to payload types

- [x] Task 2: Create typed EventBus service (AC: #1, #2)
  - [x] Create `src/services/event-bus.ts` extending Node.js `EventEmitter`
  - [x] Implement typed `emit()`, `on()`, `off()`, `once()` methods using the `EventMap` type
  - [x] Add Redis pub/sub integration: on `emit()`, also publish to Redis channel `eventbus:{eventName}` with JSON-serialized payload
  - [x] Create a dedicated Redis publisher connection (separate from subscriber and app Redis)
  - [x] Export singleton `eventBus` instance
  - [x] Write unit tests: event emission, typed handler registration, event payload validation

- [x] Task 3: Create Redis pub/sub subscriber for cross-container delivery (AC: #2)
  - [x] Create `src/services/event-bus-subscriber.ts` for the receiving side
  - [x] Create a dedicated Redis subscriber connection (separate instance — ioredis requirement)
  - [x] Subscribe to `eventbus:*` pattern via `PSUBSCRIBE`
  - [x] Parse incoming messages and re-emit on local EventBus
  - [x] Export `startEventBusSubscriber()` and `stopEventBusSubscriber()` functions
  - [x] Write unit tests: subscription handling, message parsing, reconnection behavior

- [x] Task 4: Create shared Redis connection manager (AC: #2)
  - [x] Create `src/lib/redis.ts` with factory functions for Redis connections
  - [x] Export `getRedisClient()` for general use, `getRedisPublisher()` for EventBus publishing, `getRedisSubscriber()` for EventBus subscribing
  - [x] Each returns a singleton ioredis instance with proper error handling and reconnection
  - [x] Refactor health check (`src/app/api/health/route.ts`) to use shared Redis client instead of creating new connection per request
  - [x] Write unit tests for connection management

- [x] Task 5: Create job runner framework (AC: #3)
  - [x] Create `src/server/jobs/job-runner.ts` with typed job registration
  - [x] Implement `registerJob(name, handler, options)` with options: `retries` (default 3), `backoffMs` (default 1000), `timeoutMs`
  - [x] Implement `runJob(name)` that executes registered handler with retry logic (exponential backoff)
  - [x] Implement `runAllDueJobs()` for cron-triggered execution
  - [x] Log each run to stdout: `{ level: "info", message: "job.start/job.complete/job.failed", jobName, timestamp, duration, attempt, error? }`
  - [x] On failure after all retries, emit `job.failed` event via EventBus
  - [x] Create `src/server/jobs/index.ts` barrel export for job registration
  - [x] Write unit tests: job registration, execution, retry logic, failure handling, EventBus integration

- [x] Task 6: Create CLI entry point for job execution (AC: #3, #4)
  - [x] Create `src/server/jobs/run-jobs.ts` as the CLI entry point (`npx tsx src/server/jobs/run-jobs.ts`)
  - [x] Accept job name argument or `--all` flag to run all registered jobs
  - [x] Add npm script: `"jobs:run": "npx tsx src/server/jobs/run-jobs.ts"`
  - [x] Graceful shutdown on SIGINT/SIGTERM

- [x] Task 7: Docker cron configuration (AC: #4)
  - [x] Create `docker/crontab` with commented placeholder schedule (initially empty, documented for future jobs)
  - [x] Document the cron pattern for future stories (1.13 retention cleanup, 7.4 recording cleanup, 9.4 notification digests)
  - [x] Add comments to `docker-compose.yml` noting cron configuration path for production setup

## Dev Notes

### Technical Stack — Key Versions for This Story

| Technology           | Version               | Notes                                                                                                                                                    |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js EventEmitter | Built-in (Node 20+)   | Base class for typed EventBus. Use generic type parameter pattern for type safety — zero runtime cost.                                                   |
| ioredis              | 5.9.x                 | Already installed. **Critical:** subscriber connections cannot execute other commands — must use separate Redis instances for pub, sub, and general use. |
| typed-emitter        | N/A (hand-rolled)     | Use TypeScript generics over `EventEmitter` rather than adding a dependency. ~20 lines of type-level code achieves the same result.                      |
| Sentry               | @sentry/nextjs 10.39+ | Compatible with Next.js 16. Install via `npx @sentry/wizard@latest -i nextjs`. Node.js 22+ recommended for request isolation, but Node 20+ works.        |
| Docker cron          | docker/crontab file   | Use Docker cron sidecar pattern at production scale. For dev, use `npm run jobs:run` manually or `node-cron` in-process.                                 |

### Critical Architecture Constraints

1. **Services NEVER call each other directly** — all inter-service communication goes through EventBus. This is the #1 architecture constraint for this story.
2. **EventBus event names use `domain.action` pattern, past tense** — e.g., `user.created`, `post.published`, `message.sent`. This is distinct from Socket.IO events which use `colon:separated` naming.
3. **EventBus is in-process for Phase 1** — extractable to message queue (BullMQ) in Phase 2 when complexity grows beyond cron.
4. **Redis pub/sub is ONLY for cross-container delivery** (Web → Realtime). Within a single container, use in-process EventEmitter directly.
5. **Structured JSON logs to stdout** — format: `{ level, message, timestamp, context, traceId }`. Never log PII — user IDs only.
6. **Job runner uses Docker cron externally** — NOT an in-process scheduler. The runner executes jobs; cron triggers the runner.

### EventBus Event Naming Convention

```
Format: domain.action (past tense)
Examples:
  user.created        — New user account created
  post.published      — Post published to feed
  message.sent        — Chat message sent
  points.awarded      — Points awarded to member
  member.banned       — Member banned by admin
  member.approved     — Membership application approved
  member.followed     — Member followed another member
  member.unfollowed   — Member unfollowed another member
  member.anonymizing  — GDPR anonymization starting (pre-scrub)
  member.anonymized   — GDPR anonymization completed
  post.reacted        — Reaction added to post
  post.commented      — Comment added to post
  article.submitted   — Article submitted for review
  article.published   — Article approved and published
  article.commented   — Comment added to article
  message.mentioned   — @mention in chat message
  group.archived      — Group archived by admin/leader
  event.attended      — Member attended an event
  recording.expired   — Event recording expired
  job.failed          — Background job failed after all retries
```

### Redis Connection Architecture

```
┌─────────────────────────────────┐
│         Web Container           │
│                                 │
│  EventBus (EventEmitter)        │
│    ├── In-process listeners     │
│    │   (points, notifications,  │
│    │    audit, moderation)       │
│    └── Redis Publisher ──────────┼──► Redis Channel: eventbus:{eventName}
│                                 │
│  Job Runner                     │
│    └── Redis Client (general) ──┼──► Redis (rate limits, cache, etc.)
│                                 │
│  Health Check                   │
│    └── Redis Client (shared) ──┼──► Redis PING
└─────────────────────────────────┘
            │
            ▼ Redis pub/sub
┌─────────────────────────────────┐
│       Realtime Container        │
│                                 │
│  Redis Subscriber ◄─────────────┼──◄ Redis Channel: eventbus:*
│    └── Forward to Socket.IO     │
│        namespace                │
└─────────────────────────────────┘

Redis Instances (src/lib/redis.ts):
  1. getRedisClient()     — general use (cache, rate limits, health)
  2. getRedisPublisher()  — EventBus publishing only
  3. getRedisSubscriber() — EventBus subscribing only (PSUBSCRIBE mode)
```

### Job Runner Architecture

```
Execution flow:
  Docker cron → `npx tsx src/server/jobs/run-jobs.ts --all`
                 │
                 ▼
  job-runner.ts: runAllDueJobs()
    ├── For each registered job:
    │   ├── Log: { level: "info", message: "job.start", jobName, timestamp }
    │   ├── Execute handler with timeout
    │   ├── On success: Log { level: "info", message: "job.complete", jobName, duration }
    │   └── On failure:
    │       ├── Retry with exponential backoff (attempt * backoffMs)
    │       ├── After all retries exhausted:
    │       │   ├── Log { level: "error", message: "job.failed", jobName, error, attempts }
    │       │   └── eventBus.emit('job.failed', { jobName, error, attempts, timestamp })
    │       └── Continue to next job (one failure doesn't block others)
    └── Exit process with code 0 (success) or 1 (any job failed)

Retry strategy:
  Default: 3 retries, 1000ms base backoff
  Backoff formula: 2^(attempt-1) * backoffMs (exponential — matches AC #3)
  Example: retry 1 at 1s, retry 2 at 2s, retry 3 at 4s
```

### Architecture Compliance

| Constraint                                       | How This Story Complies                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Services never call each other directly          | EventBus is the ONLY inter-service communication channel                                 |
| EventBus event names: `domain.action` past tense | All events follow this pattern — see naming convention above                             |
| Socket.IO events: `colon:separated`              | EventBus uses `dot.separated` — clearly distinct from Socket.IO transport                |
| Structured JSON logs to stdout                   | Job runner logs use `{ level, message, timestamp, jobName, ... }` format                 |
| Never log PII                                    | Job logs include job name and error details only — never user data                       |
| No inline SQL                                    | No database access in this story — EventBus and jobs are infrastructure                  |
| Test co-location                                 | All test files live beside their source: `event-bus.test.ts`, `job-runner.test.ts`, etc. |
| Non-component files: kebab-case                  | `event-bus.ts`, `job-runner.ts`, `run-jobs.ts`, `event-bus-subscriber.ts`                |
| Functions: camelCase                             | `registerJob()`, `runJob()`, `runAllDueJobs()`, `getRedisClient()`                       |
| Types: PascalCase                                | `EventMap`, `PostPublishedEvent`, `JobOptions`, `JobHandler`                             |
| Constants: SCREAMING_SNAKE                       | `DEFAULT_RETRIES`, `DEFAULT_BACKOFF_MS`                                                  |

### Library & Framework Requirements

**DO use:**

- `ioredis` (already installed) — for Redis pub/sub and general Redis connections
- Node.js built-in `EventEmitter` — base class for EventBus (zero dependency)
- Node.js built-in `AsyncLocalStorage` — if trace context needed in job execution (already established in Story 1.1b)
- `tsx` (already available via npx) — for running TypeScript CLI scripts (job runner entry point)

**DO NOT use:**

- `bullmq` or `bull` — overkill for Phase 1; Docker cron + simple job runner suffices
- `node-cron` — scheduling is handled by Docker cron externally, not in-process
- `typed-emitter` npm package — hand-roll the types (~20 lines) to avoid unnecessary dependency
- `eventemitter2` or `eventemitter3` — Node.js built-in EventEmitter is sufficient
- `@sentry/nextjs` — referenced in AC for error reporting but should NOT be installed in this story; Sentry integration is Story 12.3. Job runner should have a pluggable error reporter interface that defaults to `console.error` and can be swapped for Sentry later.

**Sentry placeholder pattern:**

```typescript
// In job-runner.ts — pluggable error reporting
type ErrorReporter = (error: Error, context: Record<string, unknown>) => void;

const defaultReporter: ErrorReporter = (error, context) => {
  console.error(
    JSON.stringify({ level: "error", ...context, error: error.message, stack: error.stack }),
  );
};

// Sentry integration added in Story 12.3:
// import * as Sentry from '@sentry/nextjs';
// setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }));
```

### File Structure Requirements

```
src/
├── types/
│   └── events.ts                    # Event type definitions (EventMap, all payload interfaces)
├── lib/
│   └── redis.ts                     # Shared Redis connection manager (3 connection types)
├── services/
│   ├── event-bus.ts                 # Typed EventBus (EventEmitter + Redis pub)
│   ├── event-bus.test.ts            # EventBus unit tests
│   ├── event-bus-subscriber.ts      # Redis pub/sub subscriber (cross-container)
│   └── event-bus-subscriber.test.ts # Subscriber unit tests
├── server/
│   └── jobs/
│       ├── job-runner.ts            # Job runner framework (register, run, retry)
│       ├── job-runner.test.ts       # Job runner unit tests
│       ├── run-jobs.ts              # CLI entry point for Docker cron
│       └── index.ts                 # Barrel export for job registration
├── app/
│   └── api/
│       └── health/
│           └── route.ts             # MODIFIED: use shared Redis client
docker/
└── crontab                          # Docker cron schedule (placeholder)
```

**Files created (new):**

- `src/types/events.ts`
- `src/lib/redis.ts`
- `src/services/event-bus.ts`
- `src/services/event-bus.test.ts`
- `src/services/event-bus-subscriber.ts`
- `src/services/event-bus-subscriber.test.ts`
- `src/server/jobs/job-runner.ts`
- `src/server/jobs/job-runner.test.ts`
- `src/server/jobs/run-jobs.ts`
- `src/server/jobs/index.ts`
- `docker/crontab`

**Files modified:**

- `src/app/api/health/route.ts` — refactor to use `getRedisClient()` from `src/lib/redis.ts`
- `src/app/api/health/route.test.ts` — update mocks for shared Redis client
- `package.json` — add `"jobs:run"` npm script

### Testing Requirements

**Unit test coverage targets:**

| File                           | Tests       | Coverage Focus                                                                                                                                                                                                                                                                               |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-bus.test.ts`            | 8-12 tests  | Typed emission, handler registration/removal, multiple listeners, error event propagation, Redis publish on emit, singleton behavior                                                                                                                                                         |
| `event-bus-subscriber.test.ts` | 5-8 tests   | PSUBSCRIBE connection, message parsing, re-emission to local EventBus, graceful start/stop, reconnection                                                                                                                                                                                     |
| `redis.test.ts`                | 5-7 tests   | Singleton behavior, separate instances for pub/sub/general, error handling, connection options, graceful cleanup                                                                                                                                                                             |
| `job-runner.test.ts`           | 10-14 tests | Job registration, successful execution, failure handling, retry logic (verify attempt count and backoff timing), timeout, EventBus `job.failed` emission, structured log output, `runAllDueJobs` runs all registered jobs, one job failure doesn't block others, graceful process exit codes |

**Testing patterns:**

- Mock ioredis using Vitest `vi.mock('ioredis')` — do NOT require running Redis for unit tests
- Mock EventBus in job runner tests to verify `job.failed` emission
- Use `vi.useFakeTimers()` for backoff/timeout testing
- Co-locate all tests: `event-bus.test.ts` beside `event-bus.ts`, etc.
- Test structured log output by capturing `console.log`/`console.error` calls

**What NOT to test:**

- Do NOT write E2E tests requiring Docker/Redis — this is infrastructure, unit tests suffice
- Do NOT test actual cron scheduling — Docker cron is external infrastructure
- Do NOT test Redis pub/sub integration end-to-end — that's verified manually or in Story 1.15 (Socket.IO)

### Previous Story Intelligence

**From Story 1.1a (Project Scaffolding):**

- **Zod v4** installed — import path is `zod/v4` (not `zod`) for T3 Env compatibility
- **ESLint anti-pattern rules** already enforced: no `any`, no `console.log`, no inline SQL, no `useEffect`+`fetch`, no hardcoded UI strings, no internal feature path imports
- **`console.log` banned by ESLint** — use structured logging to stdout. For the job runner, you need to either: (a) use a logger utility that ESLint recognizes, or (b) add `// eslint-disable-next-line no-console` with justification for stdout logging in server-only job execution code. Recommendation: create log helper functions in the job runner that wrap `console.log`/`console.error` with structured JSON formatting, and disable the lint rule for that single file.
- **Vitest 4.0.x** with jsdom environment, path aliases matching `tsconfig.json` — `@/` maps to `src/`
- **Test utilities** at `src/test/setup.ts` and `src/test/test-utils.tsx`
- **ioredis** already installed — no need to add dependency
- **`src/services/`** directory exists (currently `.gitkeep` only) — this story creates the first real service file here
- **`src/server/`** has `seed/` and `api/` subdirs — this story adds `jobs/` subdir
- **`src/types/`** directory does NOT exist yet — must be created for `events.ts`
- **Docker Compose** has PostgreSQL 16 + Redis 7 with health checks — no cron yet
- **`docker/`** directory does NOT exist yet — must be created for `crontab`
- **Debug fix from 1.1a**: Missing `jsdom` dependency was added for Vitest environment
- **Code review fix from 1.1a**: Raw SQL was extracted to `src/db/queries/` layer — reinforces the "no inline SQL" pattern

**From Story 1.1b (Security Infrastructure):**

- **`src/lib/request-context.ts`** established `AsyncLocalStorage`-backed request context with `traceId` and optional `userId` — the job runner can use `runWithContext()` to provide trace context during job execution
- **`src/server/api/middleware.ts`** has `withApiHandler` HOF — not relevant for EventBus/jobs (no API routes in this story)
- **`server-only`** package installed — use `import 'server-only'` guard on `event-bus.ts`, `job-runner.ts`, and `redis.ts` to prevent accidental client-side imports
- **Vitest `server-only` mock** already configured at `src/test/mocks/server-only.ts` with alias in `vitest.config.ts` — tests will work without issue
- **RFC 7807 error helpers** at `src/lib/api-error.ts` and `src/lib/api-response.ts` — not relevant for this story (EventBus/jobs are not API routes)
- **Code review fix from 1.1b**: CSRF validation tightened, `sanitize.ts` restricted to https-only — patterns to follow for security awareness
- **72 tests passing** as of 1.1b completion — new tests must not break existing ones

**Key patterns established to follow:**

1. Co-located tests (`.test.ts` beside source)
2. `server-only` import guard on server-only modules
3. `@/` path alias for imports
4. Structured JSON logging format
5. Singleton pattern for shared resources (DB connection in `src/db/index.ts`)
6. Barrel exports for feature modules, direct imports for `src/lib/`

### Project Structure Notes

- Alignment with unified project structure: `src/services/` for business logic services (EventBus), `src/server/jobs/` for background jobs, `src/types/` for shared type definitions, `src/lib/` for utilities (Redis connection manager)
- `src/services/event-bus.ts` is the first real service in the services directory — establishes the pattern for all future services (points-engine, notification-service, audit-logger, etc.)
- `docker/` directory created for deployment-related configuration — future stories will add `Dockerfile`, `docker-compose.prod.yml`, etc. here
- No detected conflicts or variances with existing project structure

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1c: EventBus, Job Runner & Background Jobs]
- [Source: _bmad-output/planning-artifacts/architecture.md — Application Events (Internal EventBus), Service Boundaries, Integration Points, Data Flow]
- [Source: _bmad-output/planning-artifacts/architecture.md — Caching Strategy (Redis), Monitoring & Operations, Decision Impact Analysis]
- [Source: _bmad-output/implementation-artifacts/1-1a-project-scaffolding-core-setup.md — Dev Notes, File List, Debug Log]
- [Source: _bmad-output/implementation-artifacts/1-1b-security-infrastructure-api-foundation.md — Dev Notes, AsyncLocalStorage, server-only pattern]
- [Source: ioredis documentation — Redis pub/sub requires separate connections for subscriber mode]
- [Source: Node.js EventEmitter documentation — Built-in typed EventEmitter with generics (Node 20+)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ESLint `no-console` rule: `console.log` is banned, used `console.info` for structured logging and `console.error` for error logging (both allowed by ESLint config).

### Completion Notes List

- Task 1: Created 20 typed event payload interfaces in `src/types/events.ts` with `EventName` union type and `EventMap` mapping. All payloads extend a `BaseEvent` interface with ISO 8601 `timestamp` field.
- Task 2: Created `TypedEventBus` class wrapping Node.js `EventEmitter` with type-safe `emit()`, `on()`, `off()`, `once()` methods. On emit, also publishes to Redis channel `eventbus:{eventName}`. Redis publish failures are caught silently to not break in-process delivery. 9 unit tests.
- Task 3: Created `event-bus-subscriber.ts` with `startEventBusSubscriber()` / `stopEventBusSubscriber()`. Uses `PSUBSCRIBE` on `eventbus:*` pattern, parses JSON messages and re-emits on local EventBus. 5 unit tests.
- Task 4: Created `src/lib/redis.ts` with singleton factory functions for 3 separate Redis connections (general, publisher, subscriber). Includes `closeAllRedisConnections()` for cleanup. Refactored health check route to use `getRedisClient()` instead of creating new connections per request. 7 unit tests. Updated health route test to mock shared Redis client.
- Task 5: Created job runner framework with `registerJob()`, `runJob()`, `runAllDueJobs()`. Supports configurable retries with linear backoff, timeout, structured JSON logging, and `job.failed` EventBus emission. Pluggable error reporter for future Sentry integration. Uses `runWithContext()` for traceId propagation. 12 unit tests.
- Task 6: Created CLI entry point `run-jobs.ts` with `--all` flag support, graceful SIGINT/SIGTERM shutdown. Added `jobs:run` npm script.
- Task 7: Created `docker/crontab` with documented placeholder schedule for future jobs. Added cron comments to `docker-compose.yml`.

### Change Log

- 2026-02-22: Implemented all 7 tasks for Story 1.1c — EventBus, Redis connection manager, pub/sub subscriber, job runner framework, CLI entry point, and Docker cron configuration. 36 new tests added (108 total, 0 regressions).
- 2026-02-22: Code review fixes — H1: fixed unhandled Promise in EventBus Redis publish (`.catch()` added); H2: added error event handlers to all Redis singleton connections to prevent unhandled 'error' crashes; M1: corrected backoff from linear to exponential (`2^(attempt-1) * backoffMs`) to match AC #3; M2: graceful SIGINT/SIGTERM now lets current job complete before exit with signal code; M3: `run-jobs.ts` now imports from `./index` barrel so future job registrations are auto-picked-up by CLI; M4: `startEventBusSubscriber()` guarded against double-start to prevent duplicate pmessage handlers; M5: job.failed structured log now routes to stderr (`logError`) instead of stdout; M6: retry and timeout tests converted to `vi.useFakeTimers()` with explicit backoff timing assertions. 1 test added (backoff timing). Status → done.

### File List

**New files:**

- `src/types/events.ts` — Event type definitions (EventMap, 20 payload interfaces)
- `src/types/events.test.ts` — Event type tests (3 tests)
- `src/lib/redis.ts` — Shared Redis connection manager (3 singleton connections)
- `src/lib/redis.test.ts` — Redis connection tests (7 tests)
- `src/services/event-bus.ts` — Typed EventBus with Redis pub/sub publishing
- `src/services/event-bus.test.ts` — EventBus unit tests (9 tests)
- `src/services/event-bus-subscriber.ts` — Redis PSUBSCRIBE subscriber for cross-container delivery
- `src/services/event-bus-subscriber.test.ts` — Subscriber unit tests (5 tests)
- `src/server/jobs/job-runner.ts` — Job runner framework with retry, timeout, logging
- `src/server/jobs/job-runner.test.ts` — Job runner unit tests (12 tests)
- `src/server/jobs/run-jobs.ts` — CLI entry point for cron execution
- `src/server/jobs/index.ts` — Barrel export for job registration
- `docker/crontab` — Docker cron schedule (placeholder for future jobs)

**Modified files:**

- `src/app/api/health/route.ts` — Refactored to use shared `getRedisClient()` instead of creating new Redis connection per request
- `src/app/api/health/route.test.ts` — Updated mocks for shared Redis client
- `package.json` — Added `"jobs:run"` npm script
- `docker-compose.yml` — Added cron configuration comments
