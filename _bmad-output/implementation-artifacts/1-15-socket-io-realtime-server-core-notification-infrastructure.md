# Story 1.15: Socket.IO Realtime Server & Core Notification Infrastructure

Status: done

## Story

As a member,
I want the real-time server running and to receive in-app notifications for key platform events from day one,
So that I'm informed about activity relevant to me without waiting for the full notification system in Epic 9.

## Acceptance Criteria

### AC1: WebSocket Server & Multi-Instance Setup

- **Given** the realtime infrastructure does not yet exist
- **When** the Socket.IO server is implemented
- **Then** a standalone Node.js Socket.IO server runs in a separate Docker container (`Dockerfile.realtime`) on port 3001
- **And** the Redis adapter (`@socket.io/redis-adapter` v7.2.0+) is configured for multi-instance pub/sub (messages published on one instance reach clients on another)
- **And** the server configures two namespaces, each with authentication middleware that validates sessions via Redis:
  - `/notifications` — real-time notifications, presence indicators, unread counts, and live event updates; room design: `user:{userId}` (each user joins their own room on connect), `event:{eventId}` (joined on RSVP or event page visit); events emitted: `notification:new`, `presence:update`, `unread:update`, `event:attendee_update`, `event:status_change`, `event:live_reaction`
  - `/chat` — reserved namespace definition only (authentication middleware, room pattern `conversation:{id}`); full chat implementation deferred to Epic 2 (Story 2.1)
- **And** for cross-container delivery (Web container EventBus → Realtime container Socket.IO), the EventBus publishes to a Redis pub/sub channel (`eventbus:{eventName}`) which the Realtime container subscribes to and forwards to the appropriate Socket.IO namespace

### AC2: Event Rate Limiting

- **Given** the realtime server needs protection from event flooding
- **When** Socket.IO middleware processes incoming events
- **Then** per-connection event rate limiting is enforced: max 60 events/second per client across all event types, with specific limits for `typing:start` (1 per 2 seconds per conversation), `message:send` (30 per minute), and `reaction:add` (10 per 10 seconds)
- **And** exceeding limits triggers a `rate_limit:exceeded` event to the client and drops the offending event
- **And** limits are configurable in `src/config/realtime.ts`

### AC3: Connection Management & Presence

- **Given** a member connects to the Socket.IO server
- **When** their WebSocket connection is established
- **Then** they automatically join their personal notification room (`user:{userId}`)
- **And** their online presence is set in Redis (`user:{id}:online` with 30s TTL + heartbeat)
- **And** connection uses auto-reconnect with message gap sync: client sends last received timestamp; if the gap is ≤ 1 hour, the server replays missed notifications; if the gap exceeds 1 hour, the server returns a `sync:full_refresh` event and the client fetches current state via REST API (`/api/v1/notifications?since=...` with pagination) instead of WebSocket replay

### AC4: Client-Side Socket Provider

- **Given** the client infrastructure is needed
- **When** the `SocketProvider` React context is implemented
- **Then** it manages the WebSocket connection lifecycle (connect on auth, disconnect on logout)
- **And** it exposes hooks for features to subscribe to events
- **And** Socket.IO client is dynamically imported to avoid loading on non-authenticated pages

### AC5: Notification Table, Schema & Block/Mute Infrastructure

- **Given** the notification infrastructure does not yet exist
- **When** this story is implemented
- **Then** migration `0011` creates:
  - `platform_notifications` table: id (UUID PK), user_id (FK CASCADE), type (enum: message, mention, group_activity, event_reminder, post_interaction, admin_announcement, system), title, body, link, is_read (default false), created_at
  - `platform_blocked_users` table: blocker_user_id (FK CASCADE), blocked_user_id (FK CASCADE), created_at; composite unique (blocker_user_id, blocked_user_id)
  - `platform_muted_users` table: muter_user_id (FK CASCADE), muted_user_id (FK CASCADE), created_at; composite unique (muter_user_id, muted_user_id)

### AC6: NotificationService & EventBus Integration

- **Given** platform services emit EventBus events (`message.sent`, `post.reacted`, `post.commented`, `member.approved`, etc.)
- **When** events are emitted
- **Then** a minimal `NotificationService` at `src/services/notification-service.ts` listens to EventBus events, determines recipients, and creates in-app notification records in the `platform_notifications` table
- **And** the service respects block relationships (no notifications from blocked users)
- **And** after persisting, the service emits the notification to the user's Socket.IO room via Redis pub/sub for real-time delivery

### AC7: Real-Time Notification Delivery & UI Components

- **Given** a notification is created and the member is connected
- **When** the notification is delivered via the `/notifications` Socket.IO namespace using `notification:new`
- **Then** the notification bell in the navigation shell displays an unread badge count (updated via `unread:update` event)
- **And** clicking the notification bell opens a dropdown displaying notifications in reverse chronological order with: icon, description, timestamp, and read/unread indicator
- **And** clicking a notification navigates to the relevant content
- **And** notifications can be marked as read individually or all at once
- **And** a REST API at `/api/v1/notifications` supports: GET (paginated list with `?since=` filter), PATCH `/:id/read` (mark single as read), POST `/read-all` (mark all as read)

## Tasks / Subtasks

### Task 1: Database Migration & Schema (AC: #5)

- [x] 1.1 Write migration `0011_notifications_block_mute.sql` with `platform_notifications`, `platform_blocked_users`, `platform_muted_users` tables
- [x] 1.2 Create Drizzle schema `src/db/schema/platform-notifications.ts` (notifications table + notificationTypeEnum)
- [x] 1.3 Create Drizzle schema `src/db/schema/platform-social.ts` (blocked_users + muted_users tables)
- [x] 1.4 Add schema imports to `src/db/index.ts` (import \* as pattern, NO schema/index.ts)
- [x] 1.5 Create `src/db/queries/notifications.ts` (createNotification, getNotifications, markRead, markAllRead, getUnreadCount)
- [x] 1.6 Create `src/db/queries/block-mute.ts` (isBlocked, isMuted, blockUser, unblockUser, muteUser, unmuteUser, getBlockedUserIds)
- [x] 1.7 Write tests for notification and block/mute queries

### Task 2: Realtime Configuration & Server Core (AC: #1, #2)

- [x] 2.1 Create `src/config/realtime.ts` with rate limit presets, namespace config, presence TTL, replay window
- [x] 2.2 Create `src/server/realtime/index.ts` — standalone Socket.IO server entry point (HTTP server on port 3001, CORS config)
- [x] 2.3 Create `src/server/realtime/adapters/redis.ts` — Redis adapter setup using `@socket.io/redis-adapter` with ioredis pub/sub clients
- [x] 2.4 Create `src/server/realtime/middleware/auth.ts` — session validation middleware (extract token from handshake, validate via Redis session cache, attach userId to socket)
- [x] 2.5 Create `src/server/realtime/middleware/rate-limiter.ts` — per-connection event rate limiting (sliding window, per-event-type limits)
- [x] 2.6 Write tests for auth middleware, rate limiter middleware, Redis adapter setup

### Task 3: Namespace Handlers (AC: #1, #3)

- [x] 3.1 Create `src/server/realtime/namespaces/notifications.ts` — `/notifications` namespace: connection handler (join `user:{userId}` room), presence management (Redis SET with TTL + heartbeat interval), reconnection gap sync logic
- [x] 3.2 Create `src/server/realtime/namespaces/chat.ts` — `/chat` namespace: skeleton with auth middleware only, room pattern `conversation:{id}` reserved
- [x] 3.3 Create `src/server/realtime/subscribers/eventbus-bridge.ts` — Redis subscriber that listens to `eventbus:*` channels and forwards events to appropriate Socket.IO namespace/rooms
- [x] 3.4 Write tests for notification namespace (connection, room join, presence, reconnect sync), chat namespace (auth only), eventbus bridge

### Task 4: BlockService & NotificationService (AC: #5, #6)

- [x] 4.1 Create `src/services/block-service.ts` — shared query filters for block/mute checks, used by notifications, directory, suggestions
- [x] 4.2 Create `src/services/notification-service.ts` — EventBus listener, recipient determination, block filtering, notification persistence, Socket.IO delivery via Redis pub/sub
- [x] 4.3 Add notification event types to `src/types/events.ts` — add the following interfaces and union entries:
  ```ts
  export interface NotificationCreatedEvent extends BaseEvent {
    userId: string; // target recipient — used by bridge to route to user:{userId} room
    notificationId: string;
    type: string; // NotificationType enum value
    title: string;
    body: string;
    link?: string;
  }
  export interface NotificationReadEvent extends BaseEvent {
    userId: string;
    notificationId: string | "all"; // 'all' for mark-all-read
  }
  ```
  Add `"notification.created"` and `"notification.read"` to the `EventName` union and `EventMap`.
- [x] 4.4 Write tests for BlockService (block/unblock, mute/unmute, filtering)
- [x] 4.5 Write tests for NotificationService (event handling, block filtering, persistence, real-time delivery)

### Task 5: REST API Endpoints (AC: #7)

- [x] 5.1 Create `src/app/api/v1/notifications/route.ts` — GET paginated notifications with `?since=` filter
- [x] 5.2 Create `src/app/api/v1/notifications/[id]/read/route.ts` — PATCH mark single notification as read
- [x] 5.3 Create `src/app/api/v1/notifications/read-all/route.ts` — POST mark all notifications as read
- [x] 5.4 Add `NOTIFICATION_FETCH` rate limit preset to `src/services/rate-limiter.ts`
- [x] 5.5 Write tests for all notification API endpoints (auth, pagination, rate limiting, RFC 7807 errors)

### Task 6: Client-Side SocketProvider & Hooks (AC: #4)

- [x] 6.0 Add `NEXT_PUBLIC_REALTIME_URL: z.url()` to the `client:` section of `src/env.ts` and its `runtimeEnv` mapping (`NEXT_PUBLIC_REALTIME_URL: process.env.NEXT_PUBLIC_REALTIME_URL`). Also add `REALTIME_INTERNAL_URL: z.url().optional().default('http://localhost:3001')` to the `server:` section (used by the health check to reach the realtime container — use service name `http://realtime:3001` in production Docker). T3 Env validates all vars at startup; missing `NEXT_PUBLIC_REALTIME_URL` crashes the app.
- [x] 6.1 Create `src/providers/SocketProvider.tsx` — React context with dynamic socket.io-client import, connection lifecycle (connect on auth, disconnect on logout), namespace management; use `env.NEXT_PUBLIC_REALTIME_URL` for the connection URL
- [x] 6.2 Create `src/hooks/use-socket.ts` — base hook for socket connection access
- [x] 6.3 Create `src/hooks/use-notifications.ts` — hook for notification subscription (`notification:new`, `unread:update` events), returns notifications array and unread count. Use `useQuery` from `@tanstack/react-query` for the initial REST fetch (`GET /api/v1/notifications`) and for the `sync:full_refresh` REST fallback — NO `useEffect + fetch` (architecture agent rule #5). On `notification:new` socket event, call `queryClient.setQueryData()` to append to the TanStack Query cache rather than maintaining separate local state.
- [x] 6.4 Create `src/hooks/use-presence.ts` — hook for presence status subscription (`presence:update`)
- [x] 6.5 Integrate `SocketProvider` into authenticated layout (AppShell)
- [x] 6.6 Write tests for SocketProvider, use-socket, use-notifications, use-presence hooks

### Task 7: Notification UI Components (AC: #7)

- [x] 7.1 Create `src/features/notifications/components/NotificationBell.tsx` — bell icon with unread badge count in navigation
- [x] 7.2 Create `src/features/notifications/components/NotificationList.tsx` — dropdown list with reverse chronological notifications
- [x] 7.3 Create `src/features/notifications/components/NotificationItem.tsx` — individual notification row (icon, description, timestamp, read/unread)
- [x] 7.4 Integrate NotificationBell into TopNav/AppShell navigation
- [x] 7.5 Add i18n keys to `messages/en.json` and `messages/ig.json` (Notifications namespace)
- [x] 7.6 Create `src/features/notifications/index.ts` — barrel export for all public components and types (architecture agent rule #3: never import from internal feature paths)
- [x] 7.7 Write tests for NotificationBell, NotificationList, NotificationItem components

### Task 8: Docker & Deployment (AC: #1)

- [x] 8.1 Create `Dockerfile.realtime` for standalone Socket.IO container (multi-stage: build with `npx tsx` transpile or esbuild, run with `node`)
- [x] 8.2 Update `docker-compose.yml` with `realtime` service only (port 3001, `depends_on: redis`). The `web` service is NOT added here — developers run Next.js via `npm run dev`. No `Dockerfile.web` yet; it is deferred to Story 12.1 (CI/CD pipeline). Current compose has postgres + redis; add realtime as the third service.
- [x] 8.3 Update `docker-compose.prod.yml` with both `web` service (using `Dockerfile.web` placeholder referencing `build: { dockerfile: Dockerfile.web }` with a TODO comment) and `realtime` service. Note: `docker-compose.prod.yml` currently has only a `networks:` section — add both services with the `app-network` network.
- [x] 8.4 Add realtime env vars to `.env.example` AND to `src/env.ts` per Task 6.0:
  ```
  # Realtime Server
  REALTIME_PORT=3001
  REALTIME_CORS_ORIGIN=http://localhost:3000
  NEXT_PUBLIC_REALTIME_URL=http://localhost:3001
  REALTIME_INTERNAL_URL=http://localhost:3001   # use http://realtime:3001 in Docker
  ```
  Also add `"realtime:dev": "npx tsx src/server/realtime/index.ts"` to `package.json` scripts (following the `jobs:run` pattern for local dev outside Docker).
- [x] 8.5 Update `/api/health` to include Socket.IO server status check. The realtime server's HTTP server (which backs Socket.IO) must expose `GET /health` returning `{ status: "ok" }`. The web container's health route fetches it: `fetch(env.REALTIME_INTERNAL_URL + '/health', { signal: AbortSignal.timeout(2000) })` and reports `realtime: "connected" | "disconnected"`. Realtime unavailability should set overall status to `"degraded"` (not hard `"unhealthy"`) — the web app continues in read-only mode per NFR failure isolation requirements.

## Dev Notes

### Critical Architecture Decisions

- **Two-Container Architecture**: Socket.IO runs as a SEPARATE standalone Node.js server in its own Docker container (`Dockerfile.realtime`) on port 3001. It is NOT embedded in the Next.js server. Communication between containers is via Redis pub/sub (already in the stack).
- **Redis Adapter**: Use `@socket.io/redis-adapter` (NOT the old `socket.io-redis`). Requires separate pub/sub ioredis clients. Compatible with ioredis v5.9.3 (already installed). Adapter version must be ≥7.2.0.
- **Socket.IO v4.8.3**: Already installed in package.json. Skip v4.8.0 (binary data bug). v4.8.3 is safe.
- **EventBus Bridge**: The existing EventBus (`src/services/event-bus.ts`) already publishes to Redis channels (`eventbus:{eventName}`). The realtime container subscribes to these channels and forwards events to Socket.IO namespaces. This cross-container pattern is already established.
- **Auth Middleware**: Socket.IO `io.use()` middleware must ALWAYS call `next()` (with or without error). Extract session token from `socket.handshake.auth.token`, validate via Redis session cache (`getCachedSession()`), attach `userId` to socket data.
- **Namespace Multiplexing**: Multiple namespaces share a single WebSocket connection. Each namespace has its own auth middleware.
- **⚠️ ARCHITECTURE DOC CONFLICT — `/events` namespace: DO NOT CREATE IT.** `architecture.md` lines 1041-1051 shows `src/server/realtime/namespaces/events.ts` in the directory structure, and lines 284-289 list three namespaces (`/chat`, `/notifications`, `/events`). This reflects the multi-epic final state. Per the authoritative design decision in `epics.md` (line 312): "a dedicated `/events` namespace is unnecessary — event updates flow through `/notifications`." Story 1.15 creates **exactly two namespaces**: `/notifications` (full implementation) and `/chat` (skeleton only). Live event updates (`event:attendee_update`, `event:status_change`, `event:live_reaction`) are emitted on the `/notifications` namespace.

### Patterns from Previous Stories (MUST Follow)

- **Migrations**: Hand-write SQL — `drizzle-kit generate` fails with `server-only` error. Next migration: `0011`
- **Zod**: Import from `"zod/v4"`, use `.issues[0]` (not `.errors[0]`)
- **API routes**: Always wrap with `withApiHandler()` from `@/server/api/middleware`
- **User self-service routes**: Use `requireAuthenticatedSession()` from `@/services/permissions.ts`
- **Error format**: RFC 7807 via `successResponse()`/`errorResponse()` from `@/lib/api-response`
- **EventBus**: Emit from services, never from routes. `eventBus.emit()` is synchronous (Node.js EventEmitter), no await needed
- **i18n**: All user-facing strings via `useTranslations()` — no hardcoded strings. Admin stays English per Story 1.11.
- **DB schema**: No `src/db/schema/index.ts` — schemas imported directly in `src/db/index.ts` with `import * as xSchema`
- **Tests**: Co-located with source (not `__tests__` dir), `@vitest-environment node` for server files
- **`vi.hoisted()`**: Required for any `vi.mock()` factory that references outer-scope `let`/`const`
- **`handlerRef.current` pattern**: For job registration tests where handler fires at module load time
- **`import "server-only"`**: Add to all server-only modules (services, queries, realtime server files). Do NOT add to config files imported by client components.
- **Auth import**: `auth()` from `@/server/auth/config` (NOT `@/auth`)
- **Rate limiting dynamic import**: `withApiHandler()` uses dynamic `await import("@/lib/rate-limiter")` — route tests that use `rateLimit` option need `vi.mock("@/lib/rate-limiter", ...)`

### Socket.IO Event Conventions (from Architecture)

- Event names: `snake_case` with colon namespace (`notification:new`, `presence:update`, `typing:start`)
- Event payloads: always an object with `camelCase` keys, always include a `timestamp` field
- Application events (internal EventBus): `domain.action` pattern, past tense (`notification.created`, `notification.read`)

### Existing Infrastructure to Leverage

| Component           | Location                                 | Usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EventBus            | `src/services/event-bus.ts`              | Already emits 40+ event types, publishes to Redis `eventbus:{eventName}` channels                                                                                                                                                                                                                                                                                                                                                                                                                         |
| EventBus Subscriber | `src/services/event-bus-subscriber.ts`   | **Pattern reference only** — follow the same `psubscribe('eventbus:*')` approach for `eventbus-bridge.ts`, BUT the bridge must route directly to Socket.IO namespace rooms, NOT call `eventBus.emit()`. The existing file re-emits Redis events onto the in-process EventBus (web container). The bridge is the realtime-side counterpart: receives the same Redis messages, extracts routing info (e.g., `userId` from `notification.created` payload), and emits Socket.IO events to the correct rooms. |
| Redis Clients       | `src/lib/redis.ts`                       | 3 instances: `getRedisClient()`, `getRedisPublisher()`, `getRedisSubscriber()`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Session Cache       | `src/server/auth/redis-session-cache.ts` | `getCachedSession()`, `evictCachedSession()` for WebSocket auth                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Rate Limiter        | `src/services/rate-limiter.ts`           | `checkRateLimit()`, `RATE_LIMIT_PRESETS`, `buildRateLimitHeaders()`                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| withApiHandler      | `src/server/api/middleware.ts`           | CSRF, tracing, rate limiting wrapper for REST routes                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Permission Service  | `src/services/permissions.ts`            | `requireAuthenticatedSession()` returns `{ userId, role }`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Event Types         | `src/types/events.ts`                    | Type-safe event definitions, add new notification events here                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Database Schema Conventions

- Tables: `snake_case`, plural, domain-prefixed (`platform_notifications`, `platform_blocked_users`)
- Columns: `snake_case` (`user_id`, `is_read`, `created_at`)
- Foreign keys: `{referenced_table_singular}_id` with `ON DELETE CASCADE`
- Indexes: `idx_{table}_{columns}` (e.g., `idx_platform_notifications_user_id_created_at`)
- UUIDs as primary keys: `uuid("id").primaryKey().defaultRandom()`
- Timestamps with timezone: `TIMESTAMPTZ DEFAULT NOW()`

### File Structure

```
src/server/realtime/
├── index.ts                        # Socket.IO server entry point (standalone, port 3001)
├── namespaces/
│   ├── notifications.ts            # /notifications namespace handlers
│   └── chat.ts                     # /chat namespace (skeleton only)
├── middleware/
│   ├── auth.ts                     # Session validation middleware
│   └── rate-limiter.ts             # Per-connection event rate limiting
├── adapters/
│   └── redis.ts                    # @socket.io/redis-adapter setup
└── subscribers/
    └── eventbus-bridge.ts          # Redis subscriber → Socket.IO forwarder

src/services/
├── notification-service.ts         # EventBus listener → notification creation → real-time delivery
├── notification-service.test.ts
├── block-service.ts                # Shared block/mute query filters
└── block-service.test.ts

src/db/schema/
├── platform-notifications.ts       # Notifications table schema
└── platform-social.ts              # Blocked/muted users schemas

src/db/queries/
├── notifications.ts                # Notification CRUD queries
└── block-mute.ts                   # Block/mute queries

src/config/
└── realtime.ts                     # Rate limits, namespace config, presence TTL

src/providers/
└── SocketProvider.tsx               # React context for WebSocket lifecycle

src/hooks/
├── use-socket.ts                   # Base socket connection hook
├── use-notifications.ts            # Notification subscription hook
└── use-presence.ts                 # Presence status hook

src/features/notifications/
├── components/
│   ├── NotificationBell.tsx        # Bell icon + unread badge
│   ├── NotificationList.tsx        # Dropdown notification list
│   └── NotificationItem.tsx        # Individual notification row
└── index.ts                        # Barrel export

src/app/api/v1/notifications/
├── route.ts                        # GET paginated notifications
├── route.test.ts
├── [id]/read/
│   ├── route.ts                    # PATCH mark single as read
│   └── route.test.ts
└── read-all/
    ├── route.ts                    # POST mark all as read
    └── route.test.ts
```

### Cross-Story Dependencies

- **Story 1.16 (Dashboard)**: Will consume `unread:update` from the SocketProvider + `use-notifications` hook for notification count in dashboard greeting header
- **Story 1.17 (Email Service)**: Independent — email notifications are Epic 9, not this story
- **Story 2.1 (Chat)**: Will implement the `/chat` namespace that this story creates as skeleton. Depends on SocketProvider, Redis adapter, auth middleware all being operational.
- **Epic 9 (Notifications)**: Will extend NotificationService with email/push delivery, digest batching, quiet hours, and notification preferences

### Testing Strategy

- **Server tests** (`@vitest-environment node`): Socket.IO server, namespaces, middleware, services, queries, API routes
- **Component tests** (`@testing-library/react`): SocketProvider, hooks, NotificationBell/List/Item
- **Mock patterns**:
  - Mock `ioredis` for Redis operations
  - Mock `socket.io` Server for namespace tests
  - Mock `@/server/auth/config` for auth middleware tests
  - Mock `@/lib/rate-limiter` for API route tests with rate limiting
  - Use `vi.hoisted()` for mock factories referencing outer-scope variables
- **Test baseline**: 716/716 passing (from Story 1.14)
- **Pre-existing failure**: `ProfileStep.test.tsx` — 1 failure since Story 1.9, do not investigate

### Environment Variables (add to .env.example)

```
# Realtime Server
REALTIME_PORT=3001
REALTIME_CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_REALTIME_URL=http://localhost:3001
```

### npm Dependencies to Install

```
@socket.io/redis-adapter@^7.2.0  # Redis adapter for Socket.IO multi-instance (must be ≥7.2.0)
```

Note: `socket.io` and `socket.io-client` are already in package.json v4.8.3.

### Project Structure Notes

- Follows architecture directory structure exactly: `src/server/realtime/` with namespaces, middleware, adapters subdirectories. The `subscribers/` subdirectory is an addition beyond the architecture's initial spec — add it as shown.
- Notification feature module at `src/features/notifications/` per architecture feature-based structure
- Providers at `src/providers/` (SocketProvider alongside any existing providers)
- **Hooks at `src/hooks/` — intentional deviation from architecture.** Architecture (lines 942-955) places `use-notifications.ts` inside `src/features/notifications/hooks/`. This story puts all socket hooks (`use-socket`, `use-notifications`, `use-presence`) at `src/hooks/` for cross-feature reuse: Epic 2 (chat) and Epic 3 (member suggestions) both need presence hooks. Do NOT move them into the feature directory.
- Config at `src/config/realtime.ts` (NO `server-only` — rate limit constants needed by client for display)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.15 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — Real-Time Architecture section, lines 284-294]
- [Source: _bmad-output/planning-artifacts/architecture.md — Container Strategy, lines 382-389]
- [Source: _bmad-output/planning-artifacts/architecture.md — Socket.IO Event Conventions, lines 592-604]
- [Source: _bmad-output/planning-artifacts/architecture.md — Project Directory Structure, lines 1041-1051]
- [Source: _bmad-output/planning-artifacts/architecture.md — Notification Feature Module, lines 942-955]
- [Source: _bmad-output/planning-artifacts/architecture.md — Database Schema, lines 1003-1026]
- [Source: _bmad-output/planning-artifacts/architecture.md — Agent Rules, lines 645-669]
- [Source: _bmad-output/implementation-artifacts/1-14-file-upload-processing-pipeline.md — Dev patterns, testing approaches]
- [Source: Socket.IO v4 docs — Redis adapter setup, middleware pattern, namespace API]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — all issues resolved inline during implementation.

### Completion Notes List

- **`@socket.io/redis-adapter` installed**: `npm install @socket.io/redis-adapter@^7.2.0` — added to package.json dependencies.
- **No `/events` namespace created**: Conflict between `architecture.md` (lists `/events`) and `epics.md` (authoritative: event updates flow through `/notifications`). Followed epics.md — two namespaces only.
- **`[id]/read/route.ts` uses URL parsing**: `withApiHandler` only passes `request` to the handler (its `RouteHandler` type has no second argument). The notification ID is extracted from the URL path (`segments.at(-2)`) rather than from Next.js params.
- **MockRedis constructor fix**: `vi.fn().mockImplementation(() => {...})` with arrow function fails when called with `new` (arrow functions aren't constructors). Fixed with `vi.fn().mockImplementation(function () { return {...}; })` using a regular function.
- **NotificationService handlers made async**: EventBus listeners use `async/await` for `deliverNotification` so tests can `await handler(payload)` and verify Redis publish was called.
- **health/route.test.ts env mock**: Route now imports `@/env` (for `REALTIME_INTERNAL_URL`); test adds `vi.mock("@/env", ...)` and `global.fetch = vi.fn().mockResolvedValue({ ok: true })` in `beforeEach`.
- **SocketProvider `waitFor` pattern**: Dynamic import inside `useEffect` is a floating promise; `act()` doesn't wait for it. Test uses `waitFor(() => expect(mockIo).toHaveBeenCalledTimes(2))` instead.
- **Test count**: 716 baseline (Story 1.14) → 852 passing (+136 new tests, 0 failures).

### Senior Developer Review (AI)

**Reviewer**: claude-opus-4-6 (adversarial code review workflow)
**Date**: 2026-02-25
**Result**: PASS — all HIGH and MEDIUM issues fixed, 864/864 tests passing

**Issues Found**: 10 HIGH, 11 MEDIUM, 10 LOW (LOW deferred)

**HIGH fixes applied (10):**

- H1: Rate limiter converted from passive `socket.onAny()` to blocking `socket.use()` packet middleware
- H2: Fixed `lt` → `gt` in getNotifications `since` date filter (was returning older-than instead of newer-than)
- H3: Removed broken event handlers (post.reacted, post.commented, message.sent) that notified wrong recipients — deferred to when target features exist
- H4: Removed `import "server-only"` from all `src/server/realtime/` files (standalone Node.js container, not Next.js)
- H5: Changed `getUnreadCount` from fetching all rows to SQL `COUNT()` aggregation
- H6: Changed hardcoded English notification titles/bodies to i18n message keys
- H7: Added try/catch wrapping entire auth middleware body
- H8: Fixed eventbus bridge payload to emit PlatformNotification-shaped data (id, userId, isRead, createdAt fields)
- H9: Changed SocketProvider from `useRef` to `useState` for socket instances (enables consumer re-renders)
- H10: Changed NotificationItem from `window.location.href` to `router.push()` from `@/i18n/navigation`

**MEDIUM fixes applied (11):**

- M1: Added UUID validation on `[id]/read` route before DB query
- M2: Added rate limiting to write endpoints (PATCH mark-read, POST read-all)
- M3: Moved EventBus emit from routes to service functions (`markNotificationAsRead`, `markAllNotificationsAsRead`)
- M4: Added `notification.read` case in eventbus bridge for multi-tab read sync
- M5: Added comment documenting presence scope limitation (user's own room only)
- M6: Added mute filtering to `filterNotificationRecipients` via new `getUsersWhoMuted` query
- M7: Changed SocketProvider dependency from `[session]` object to `[sessionToken]` string to prevent reconnect churn
- M8: Fixed pingInterval/pingTimeout (swapped to 15k/30k — timeout must be ≥ interval)
- M9: Added NaN date validation in sync:request handler
- M10: Added `.desc()` to platform_notifications index on createdAt
- M11: Added indexes on `blocked_user_id` and `muted_user_id` columns

**Test count after review**: 852 → 864 passing (+12 tests from review fixes)

### File List

**New Files:**

- `src/db/migrations/0011_notifications_block_mute.sql`
- `src/db/schema/platform-notifications.ts`
- `src/db/schema/platform-social.ts`
- `src/db/queries/notifications.ts`
- `src/db/queries/notifications.test.ts`
- `src/db/queries/block-mute.ts`
- `src/db/queries/block-mute.test.ts`
- `src/config/realtime.ts`
- `src/server/realtime/index.ts`
- `src/server/realtime/adapters/redis.ts`
- `src/server/realtime/adapters/redis.test.ts`
- `src/server/realtime/middleware/auth.ts`
- `src/server/realtime/middleware/auth.test.ts`
- `src/server/realtime/middleware/rate-limiter.ts`
- `src/server/realtime/middleware/rate-limiter.test.ts`
- `src/server/realtime/namespaces/notifications.ts`
- `src/server/realtime/namespaces/notifications.test.ts`
- `src/server/realtime/namespaces/chat.ts`
- `src/server/realtime/namespaces/chat.test.ts`
- `src/server/realtime/subscribers/eventbus-bridge.ts`
- `src/server/realtime/subscribers/eventbus-bridge.test.ts`
- `src/services/block-service.ts`
- `src/services/block-service.test.ts`
- `src/services/notification-service.ts`
- `src/services/notification-service.test.ts`
- `src/app/api/v1/notifications/route.ts`
- `src/app/api/v1/notifications/route.test.ts`
- `src/app/api/v1/notifications/[id]/read/route.ts`
- `src/app/api/v1/notifications/[id]/read/route.test.ts`
- `src/app/api/v1/notifications/read-all/route.ts`
- `src/app/api/v1/notifications/read-all/route.test.ts`
- `src/providers/SocketProvider.tsx`
- `src/providers/SocketProvider.test.tsx`
- `src/hooks/use-socket.ts`
- `src/hooks/use-socket.test.ts`
- `src/hooks/use-notifications.ts`
- `src/hooks/use-notifications.test.ts`
- `src/hooks/use-presence.ts`
- `src/hooks/use-presence.test.ts`
- `src/features/notifications/components/NotificationBell.tsx`
- `src/features/notifications/components/NotificationBell.test.tsx`
- `src/features/notifications/components/NotificationList.tsx`
- `src/features/notifications/components/NotificationList.test.tsx`
- `src/features/notifications/components/NotificationItem.tsx`
- `src/features/notifications/components/NotificationItem.test.tsx`
- `src/features/notifications/index.ts`
- `Dockerfile.realtime`

**Modified Files:**

- `src/db/index.ts` — added platformNotificationsSchema, platformSocialSchema imports
- `src/types/events.ts` — added NotificationCreatedEvent, NotificationReadEvent, updated EventName + EventMap
- `src/services/rate-limiter.ts` — added NOTIFICATION_FETCH preset
- `src/env.ts` — added REALTIME_INTERNAL_URL (server) and NEXT_PUBLIC_REALTIME_URL (client)
- `src/components/layout/AppShell.tsx` — wrapped with SocketProvider
- `src/components/layout/AppShell.test.tsx` — added SocketProvider mock
- `src/components/layout/TopNav.tsx` — replaced placeholder bell with NotificationBell
- `src/components/layout/TopNav.test.tsx` — added @/features/notifications mock
- `src/app/api/health/route.ts` — added realtime health check
- `src/app/api/health/route.test.ts` — added @/env mock and global.fetch mock
- `docker-compose.yml` — added realtime service
- `docker-compose.prod.yml` — added realtime and web placeholder services
- `.env.example` — added realtime env vars
- `package.json` — added @socket.io/redis-adapter, realtime:dev script
- `messages/en.json` — added Notifications namespace
- `messages/ig.json` — added Notifications namespace (Igbo)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
