# Story 8.1: Points Engine & Earning Rules

Status: done

## Story

As a member,
I want to earn points through receiving likes and engaging with the platform,
so that my contributions are recognized and I can unlock additional capabilities.

## Acceptance Criteria

1. **Given** a member's content receives a like or reaction, **When** points are calculated, **Then** base points are awarded to the post author for the like — and if the author has a verification badge, a multiplier is applied (Blue 3x, Red 6x, Purple 10x). The calculation is atomic (Redis + Lua). The award is recorded in `platform_points_ledger`.

2. **Given** a member performs engagement activities (attending an event), **When** the activity completes, **Then** activity-based points are awarded to the host according to `platform_points_rules` (configurable base points per activity type).

3. **Given** an article is published, **When** the `article.published` event fires, **Then** the article author earns points per the `article_published` rule.

4. **Given** a member attempts to react to their own post, **When** `reactToPost()` is called with `userId === authorId`, **Then** an `ApiError` with status 403 is thrown and no reaction is toggled. This blocks self-liking at the service layer.

5. **Given** anti-gaming measures are enforced, **When** a single member sends more than 10 reactions within a 60-second sliding window, **Then** subsequent reactions are silently discarded (no points awarded), a notification is delivered to the reactor ("Reaction Limit Reached"), and the event is logged to `audit_logs` with `action = 'points_throttled'`.

6. **Given** a post has fewer than 10 characters (stripped of whitespace), **When** a reaction is received, **Then** no points are awarded to the author (quality gate). The reaction itself still succeeds — only the point award is skipped.

7. **Given** the database needs points support, **When** this story is implemented, **Then** migration `0035_points_engine.sql` creates `platform_points_ledger` and `platform_points_rules` tables, and seeds default rules for `like_received`, `event_attended`, and `article_published`.

8. **Given** a member's points balance is queried, **When** any component requests it, **Then** it is served from Redis (`points:user:{userId}`) first; on cache miss it falls back to PostgreSQL aggregate and re-caches.

9. **Given** a member's account is suspended or deleted, **When** `account.status_changed` fires with `newStatus` in `['SUSPENDED', 'PENDING_DELETION', 'ANONYMIZED']`, **Then** the member is removed from the `points:leaderboard` Redis ZSET.

## Tasks / Subtasks

- [x] Task 1: DB migration and Drizzle schema (AC: 7)
  - [x] 1.1 Write `src/db/migrations/0035_points_engine.sql` — CREATE `platform_points_ledger`, `platform_points_rules`; INSERT seed rows (see Dev Notes for full SQL)
  - [x] 1.2 Add journal entry idx=35 to `src/db/migrations/meta/_journal.json` (tag: `0035_points_engine`, when: `1708000035000`)
  - [x] 1.3 Create `src/db/schema/platform-points.ts` — Drizzle schema for both tables + source type enum (see Dev Notes)
  - [x] 1.4 Register in `src/db/index.ts`: `import * as platformPointsSchema from "./schema/platform-points"` and spread into the `schema` object

- [x] Task 2: DB query functions (AC: 7, 8)
  - [x] 2.1 Create `src/db/queries/points.ts` — `insertPointsLedgerEntry`, `getActivePointsRules`, `getPointsRuleByActivityType`, `getUserPointsTotal` (see Dev Notes for signatures)
  - [x] 2.2 Add `getPostContentLength(postId: string): Promise<number | null>` to `src/db/queries/posts.ts` — `SELECT LENGTH(content) FROM community_posts WHERE id = $1 AND deleted_at IS NULL`
  - [x] 2.3 Write `src/db/queries/points.test.ts` — ≥8 unit tests (mock db, test each query function and null cases; see Dev Notes for mock setup template)

- [x] Task 3: Refactor `reactToPost` for self-reaction block (AC: 4)
  - [x] 3.1 In `src/services/post-interaction-service.ts`: move `getPostAuthorId` call **before** `toggleReaction`; if `authorId === null` throw `ApiError({ status: 404 })`; if `userId === authorId` throw `ApiError({ status: 403, title: "You cannot react to your own content" })`; reuse fetched `authorId` in the event emit (no second fetch needed)
  - [x] 3.2 Remove the `// TODO (Story 8.1)` comment after implementing the block
  - [x] 3.3 Update `src/services/post-interaction-service.test.ts`: add self-reaction 403 test; add post-not-found 404 test; verify existing tests still pass with reordered flow

- [x] Task 4: Create PointsEngine service (AC: 1, 2, 3, 5, 6, 8, 9)
  - [x] 4.1 Create `src/services/points-engine.ts` with `import "server-only"` (see Dev Notes for full service spec)
  - [x] 4.2 Implement `getBadgeMultiplier(userId: string): Promise<number>` — returns `1` provisionally; Story 8.3 updates when `community_user_badges` table exists
  - [x] 4.3 Implement `getUserPointsBalance(userId: string): Promise<number>` — reads `points:user:{userId}` from Redis (`getRedisClient().get(...)`); on null falls back to `getUserPointsTotal(userId)` from DB, then caches via `redis.set(key, String(total))`
  - [x] 4.4 Implement `handlePostReacted(payload: PostReactedEvent)` — quality gate → get rule → get multiplier → call `awardPoints()` → on success insert ledger → on rapid_fire log + notify
  - [x] 4.5 Implement `handleEventAttended(payload: EventAttendedEvent)` — get rule → `awardPoints()` → insert ledger
  - [x] 4.6 Implement `handleArticlePublished(payload: ArticlePublishedEvent)` — get rule → `awardPoints()` (synthetic actorId) → insert ledger
  - [x] 4.7 Implement `handleAccountStatusChanged(payload: AccountStatusChangedEvent)` — if suspended/deleted/anonymized call `getRedisClient().zrem('points:leaderboard', payload.userId)`
  - [x] 4.8 Register all 4 event handlers with HMR guard (see Dev Notes for pattern)

- [x] Task 5: Register PointsEngine in app (AC: all)
  - [x] 5.1 Add `import "@/services/points-engine";` to `src/server/jobs/index.ts` below the notification-service import (side-effect: registers all eventBus.on() handlers for points)

- [x] Task 6: i18n keys (AC: 5)
  - [x] 6.1 Add `notifications.points_throttled.title` and `notifications.points_throttled.body` to `messages/en.json` (see Dev Notes for values)
  - [x] 6.2 Add same keys to `messages/ig.json` with Igbo translations

- [x] Task 7: Tests for PointsEngine (AC: all)
  - [x] 7.1 Create `src/services/points-engine.test.ts` — ≥20 unit tests (see Dev Notes for mock setup and required test list)

## Pre-Review Checklist

Before marking this story as ready for review, confirm all items below:

- [x] All user-facing strings use `useTranslations()` — zero hardcoded English prose in JSX or error responses
- [x] New i18n keys added to both `messages/en.json` AND `messages/ig.json`
- [x] All tests passing (run `bun test` locally before review)
- [x] Any new `@/db/queries/*` import in `eventbus-bridge.ts` has corresponding `vi.mock()` in both `eventbus-bridge.test.ts` and `notification-flow.test.ts` — **N/A: points-engine.ts runs in the web container, NOT the realtime container. No changes to eventbus-bridge.ts.**
- [x] `successResponse()` calls with non-200 status use 3rd arg: `successResponse(data, undefined, 201)` — N/A: no route files in this story
- [x] New member statuses/roles audited across ALL entry-point functions for permission gaps — N/A: no new statuses/roles
- [x] `points-engine.ts` does NOT have any route files importing from it directly — it is registered only via side-effect import in `jobs/index.ts`
- [x] `getPostContentLength` returns `null` (post deleted/not found) → award skipped (not an error)
- [x] No changes to `eventbus-bridge.ts` or `notification-flow.ts` — points engine runs in web container only

## Dev Notes

### Architecture Decision: Web Container Only

The PointsEngine (`points-engine.ts`) runs in the **web container** (Next.js process), NOT in the standalone realtime server (`eventbus-bridge.ts`). This matches the notification-service.ts pattern:

```
HTTP Request → Service → EventBus.emit() → Redis pub/sub → web container EventBus subscriber
     → points-engine.ts handler → awardPoints() Lua → DB ledger insert
```

`points-lua-runner.ts` has no `import "server-only"` (it's a Redis library usable anywhere), but `points-engine.ts` **must** have `import "server-only"` because it uses Drizzle (requires `@/env`).

### Task 1: SQL Migration (`0035_points_engine.sql`)

```sql
-- Enum for source type (extends in future stories as needed)
CREATE TYPE platform_points_source_type AS ENUM (
    'like_received',
    'event_attended',
    'article_published'
);

-- Append-only ledger: one row per award event
CREATE TABLE platform_points_ledger (
    id                UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID                        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    points            INTEGER                     NOT NULL CHECK (points > 0),
    reason            VARCHAR(100)                NOT NULL,  -- human-readable label
    source_type       platform_points_source_type NOT NULL,
    source_id         TEXT                        NOT NULL,  -- postId, eventId, articleId
    multiplier_applied NUMERIC(4, 2)              NOT NULL DEFAULT 1.00,
    created_at        TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_points_ledger_user_id     ON platform_points_ledger(user_id);
CREATE INDEX idx_platform_points_ledger_created_at  ON platform_points_ledger(created_at);

-- Configurable earning rules (admin-editable via future admin UI)
CREATE TABLE platform_points_rules (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_type VARCHAR(50) NOT NULL UNIQUE,
    base_points   INTEGER     NOT NULL CHECK (base_points > 0),
    description   TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default earning rules (configurable; [REVIEW] validate values with PO before ship)
INSERT INTO platform_points_rules (activity_type, base_points, description) VALUES
    ('like_received',    1,  'Points awarded to post author when their post receives a like/reaction'),
    ('event_attended',   5,  'Points awarded to event host when an attendee checks in'),
    ('article_published', 10, 'Points awarded to article author when their article is published');
```

**Journal entry** (idx=35, add after idx=34 entry):

```json
{
  "idx": 35,
  "version": "7",
  "when": 1708000035000,
  "tag": "0035_points_engine",
  "breakpoints": true
}
```

### Task 1: Drizzle Schema (`src/db/schema/platform-points.ts`)

Follow the pattern of `src/db/schema/audit-logs.ts`:

```ts
import {
  pgTable,
  uuid,
  integer,
  text,
  boolean,
  numeric,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const platformPointsSourceTypeEnum = pgEnum("platform_points_source_type", [
  "like_received",
  "event_attended",
  "article_published",
]);

export const platformPointsLedger = pgTable("platform_points_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  sourceType: platformPointsSourceTypeEnum("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  multiplierApplied: numeric("multiplier_applied", { precision: 4, scale: 2 })
    .notNull()
    .default("1.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const platformPointsRules = pgTable("platform_points_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityType: varchar("activity_type", { length: 50 }).notNull().unique(),
  basePoints: integer("base_points").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlatformPointsLedgerEntry = typeof platformPointsLedger.$inferSelect;
export type NewPlatformPointsLedgerEntry = typeof platformPointsLedger.$inferInsert;
export type PlatformPointsRule = typeof platformPointsRules.$inferSelect;
```

**`src/db/index.ts` addition** (after existing imports):

```ts
import * as platformPointsSchema from "./schema/platform-points";
// ... and spread in the schema object: ...platformPointsSchema,
```

### Task 2: DB Query Functions (`src/db/queries/points.ts`)

No `server-only` (follows `posts.ts` / `feed.ts` pattern — these are imported from server-only services):

```ts
import { eq, and, sum } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { platformPointsLedger, platformPointsRules } from "@/db/schema/platform-points";

export interface InsertLedgerEntryData {
  userId: string;
  points: number;
  reason: string;
  sourceType: "like_received" | "event_attended" | "article_published";
  sourceId: string;
  multiplierApplied?: number; // defaults to 1
}

export async function insertPointsLedgerEntry(data: InsertLedgerEntryData): Promise<void> { ... }

export async function getActivePointsRules(): Promise<PlatformPointsRule[]> { ... }

export async function getPointsRuleByActivityType(activityType: string): Promise<PlatformPointsRule | null> {
  // SELECT ... WHERE activity_type = $1 AND is_active = true LIMIT 1
}

export async function getUserPointsTotal(userId: string): Promise<number> {
  // SELECT COALESCE(SUM(points), 0) FROM platform_points_ledger WHERE user_id = $1
  // Returns 0 if no rows
}

export async function logPointsThrottle(params: {
  actorId: string;   // reactor userId (valid UUID FK)
  earnerUserId: string;
  reason: string;    // 'rapid_fire' | 'repeat_pair'
  eventType: string; // 'post.reacted'
  eventId: string;   // postId
}): Promise<void> {
  // INSERT INTO audit_logs (actor_id, action, target_user_id, details)
  // action = 'points_throttled'
  // Only call for rapid_fire and repeat_pair (actorId is always a real user UUID in these cases)
}
```

**`getPostContentLength` in `src/db/queries/posts.ts`**:

```ts
export async function getPostContentLength(postId: string): Promise<number | null> {
  // SELECT LENGTH(content) as len FROM community_posts WHERE id = $1 AND deleted_at IS NULL
  // Returns null if not found (post deleted or doesn't exist)
  // NOTE: PostgreSQL LENGTH() counts characters (not bytes) — correct for multi-byte Igbo text with diacritics
}
```

### Task 2: Test Mock Setup (`src/db/queries/points.test.ts`)

Follow the same `vi.mock("@/db")` pattern used by `posts.test.ts` and `feed.test.ts`. The `@/db` import triggers `@/env` validation which fails without env vars — always mock it:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi
  .fn()
  .mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
  });
const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    }),
  }),
});
vi.mock("@/db", () => ({
  db: { insert: mockInsert, select: mockSelect, execute: vi.fn() },
}));

vi.mock("@/db/schema/platform-points", () => ({
  platformPointsLedger: {
    id: "id",
    userId: "user_id",
    points: "points",
    reason: "reason",
    sourceType: "source_type",
    sourceId: "source_id",
    multiplierApplied: "multiplier_applied",
    createdAt: "created_at",
  },
  platformPointsRules: {
    id: "id",
    activityType: "activity_type",
    basePoints: "base_points",
    isActive: "is_active",
  },
}));
vi.mock("@/db/schema/audit-logs", () => ({
  auditLogs: {
    id: "id",
    actorId: "actor_id",
    action: "action",
    targetUserId: "target_user_id",
    details: "details",
  },
}));
```

Test each exported function: `insertPointsLedgerEntry`, `getActivePointsRules`, `getPointsRuleByActivityType` (found + not-found), `getUserPointsTotal` (with rows + zero), `logPointsThrottle`, plus `getPostContentLength` null case.

### Task 4: PointsEngine Service (`src/services/points-engine.ts`)

```ts
import "server-only";
import { eventBus } from "@/services/event-bus";
import { awardPoints } from "@/lib/points-lua-runner";
import { POINTS_CONFIG } from "@/config/points";
import { getRedisClient, getRedisPublisher } from "@/lib/redis";
import { createNotification } from "@/db/queries/notifications";
import {
  insertPointsLedgerEntry,
  getPointsRuleByActivityType,
  getUserPointsTotal,
  logPointsThrottle,
} from "@/db/queries/points";
import { getPostContentLength } from "@/db/queries/posts";
import type {
  PostReactedEvent,
  EventAttendedEvent,
  ArticlePublishedEvent,
  AccountStatusChangedEvent,
} from "@/types/events";

/** Returns badge multiplier for the earner. Story 8.3 will update when community_user_badges exists. */
export async function getBadgeMultiplier(_userId: string): Promise<number> {
  return 1;
}

/** Read points balance from Redis; fall back to DB aggregate on cache miss. */
export async function getUserPointsBalance(userId: string): Promise<number> {
  const redis = getRedisClient();
  const cached = await redis.get(`points:user:${userId}`);
  if (cached !== null) return parseInt(cached, 10);
  const total = await getUserPointsTotal(userId);
  await redis.set(`points:user:${userId}`, String(total)); // no TTL — Lua maintains this key
  return total;
}
```

**Handler implementations (key decisions)**:

`handlePostReacted`:

1. Fetch content length via `getPostContentLength(payload.postId)` — if `null` (deleted post) or `length < POINTS_CONFIG.QUALITY_GATE_MIN_CHARS` → return early, skip award
2. `const rule = await getPointsRuleByActivityType('like_received')` — if null, return (safety fallback)
3. `const multiplier = await getBadgeMultiplier(payload.authorId)` — always 1 for now
4. `const amount = Math.round(rule.basePoints * multiplier)`
5. Call `awardPoints({ idempotencyKey: "reaction:${payload.postId}:${payload.userId}", actorId: payload.userId, earnerUserId: payload.authorId, contentOwnerId: payload.authorId, amount })`
6. Check `result[0] === 1` (awarded): `await insertPointsLedgerEntry({ userId: payload.authorId, points: amount, reason: 'like_received', sourceType: 'like_received', sourceId: payload.postId, multiplierApplied: multiplier })`
7. Check `result[1] === 'rapid_fire'`: `await logPointsThrottle(...)` AND send throttle notification (see below)
8. Check `result[1] === 'repeat_pair'`: `await logPointsThrottle(...)` (no user notification — admin review only)
9. All other reasons (duplicate, daily_cap, self): silent skip (self is also blocked at API layer)

**Rapid-fire notification delivery** (in handlePostReacted, rapid_fire branch):

```ts
// Deliver throttle notification directly (not via notification-service.ts to avoid circular dep).
// No block/mute filtering needed — this is a system notification TO the reactor about their own behavior.
try {
  const notification = await createNotification({
    userId: payload.userId, // reactor gets the toast
    type: "system",
    title: "notifications.points_throttled.title",
    body: "notifications.points_throttled.body",
    link: undefined,
  });
  const publisher = getRedisPublisher();
  await publisher.publish(
    "eventbus:notification.created",
    JSON.stringify({
      userId: payload.userId,
      notificationId: notification.id,
      type: "system",
      title: "notifications.points_throttled.title",
      body: "notifications.points_throttled.body",
      timestamp: notification.createdAt.toISOString(),
    }),
  );
} catch (err) {
  // Non-critical — swallow
}
```

`handleEventAttended`:

- `idempotencyKey: "attended:${payload.eventId}:${payload.userId}"`
- `actorId: payload.userId` (attendee), `earnerUserId: payload.hostId`, `contentOwnerId: payload.hostId`
- No quality gate for events
- On success: `insertPointsLedgerEntry({ userId: payload.hostId, sourceType: 'event_attended', sourceId: payload.eventId, ... })`

`handleArticlePublished`:

- `idempotencyKey: "article:${payload.articleId}"`
- `actorId: "article:${payload.articleId}"` — synthetic ID; bypasses Lua self-block + prevents false rapid-fire triggers (unique per article)
- `earnerUserId: payload.authorId`, `contentOwnerId: payload.authorId`
- No quality gate for articles (editorial review is the gate)
- On success: `insertPointsLedgerEntry({ userId: payload.authorId, sourceType: 'article_published', ... })`

`handleAccountStatusChanged`:

Note: `notification-service.ts` also handles `account.status_changed` (for group ownership transfer). Both handlers fire independently — they do not conflict. Do NOT merge them or deduplicate.

```ts
const CLEANUP_STATUSES = ["SUSPENDED", "PENDING_DELETION", "ANONYMIZED"] as const;
if (CLEANUP_STATUSES.includes(payload.newStatus as (typeof CLEANUP_STATUSES)[number])) {
  await getRedisClient().zrem("points:leaderboard", payload.userId);
}
```

**HMR guard pattern** (matches notification-service.ts structure exactly):

```ts
const globalForPoints = globalThis as unknown as { __pointsHandlersRegistered?: boolean };
if (globalForPoints.__pointsHandlersRegistered) {
  // Handlers already live on the globalThis-persisted eventBus — skip re-registration
} else {
  globalForPoints.__pointsHandlersRegistered = true;

  eventBus.on("post.reacted", async (payload: PostReactedEvent) => {
    try {
      await handlePostReacted(payload);
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "points.post_reacted.failed", error: String(err) }),
      );
    }
  });
  eventBus.on("event.attended", async (payload: EventAttendedEvent) => {
    try {
      await handleEventAttended(payload);
    } catch {
      /* swallow */
    }
  });
  eventBus.on("article.published", async (payload: ArticlePublishedEvent) => {
    try {
      await handleArticlePublished(payload);
    } catch {
      /* swallow */
    }
  });
  eventBus.on("account.status_changed", async (payload: AccountStatusChangedEvent) => {
    try {
      await handleAccountStatusChanged(payload);
    } catch {
      /* swallow */
    }
  });
} // end of hot-reload guard (globalForPoints.__pointsHandlersRegistered)
```

### Task 3: Refactored `reactToPost` Flow

The refactored function structure:

```ts
export async function reactToPost(postId, userId, reactionType): Promise<ReactToPostResult> {
  // 1. Fetch authorId FIRST (needed for self-block and event emit)
  const authorId = await getPostAuthorId(postId); // may throw on DB error — propagate
  if (!authorId) {
    throw new ApiError({ title: "Post not found", status: 404 });
  }
  // 2. Block self-reactions (FR28 anti-gaming)
  if (userId === authorId) {
    throw new ApiError({ title: "You cannot react to your own content", status: 403 });
  }
  // 3. Toggle the reaction
  const result = await toggleReaction(postId, userId, reactionType);
  // 4. Emit event (authorId already in scope — no second DB query)
  if (result.newReactionType !== null) {
    try {
      await eventBus.emit("post.reacted", {
        postId,
        userId,
        reaction: result.newReactionType,
        timestamp: new Date().toISOString(),
        authorId,
      });
    } catch {
      /* Non-critical */
    }
  }
  return result;
}
```

Note: `ApiError` is imported from `@/lib/api-error`. The 404 case handles deleted posts (race condition between reaction and post deletion).

### Task 6: i18n Keys

**`messages/en.json`** (add to existing `notifications` object):

```json
"points_throttled": {
  "title": "Reaction Limit Reached",
  "body": "Slow down — your reactions are going too fast"
}
```

**`messages/ig.json`** (add to existing `notifications` object):

```json
"points_throttled": {
  "title": "Ọnụọgụ Mmesi Eruola",
  "body": "Biko hụzie oge — i na-eme mmesi ngwa ngwa karịa ọ dị mma"
}
```

### Task 7: Test Mock Setup (`src/services/points-engine.test.ts`)

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Capture event handlers at module-load time
const { handlerRef, captureHandler } = vi.hoisted(() => {
  const m = new Map<string, (payload: unknown) => unknown>();
  return {
    handlerRef: { current: m },
    captureHandler: (e: string, h: unknown) => m.set(e, h as (p: unknown) => unknown),
  };
});

const mockAwardPoints = vi.hoisted(() => vi.fn().mockResolvedValue([1, "ok", 100, 150]));
vi.mock("@/lib/points-lua-runner", () => ({
  awardPoints: (...args: unknown[]) => mockAwardPoints(...args),
}));

const mockInsertLedgerEntry = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetPointsRule = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ basePoints: 1, activityType: "like_received", isActive: true }),
);
const mockGetUserPointsTotal = vi.hoisted(() => vi.fn().mockResolvedValue(10));
const mockLogPointsThrottle = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/db/queries/points", () => ({
  insertPointsLedgerEntry: (...args: unknown[]) => mockInsertLedgerEntry(...args),
  getPointsRuleByActivityType: (...args: unknown[]) => mockGetPointsRule(...args),
  getUserPointsTotal: (...args: unknown[]) => mockGetUserPointsTotal(...args),
  logPointsThrottle: (...args: unknown[]) => mockLogPointsThrottle(...args),
}));

const mockGetPostContentLength = vi.hoisted(() => vi.fn().mockResolvedValue(50)); // default: 50 chars (passes gate)
vi.mock("@/db/queries/posts", () => ({
  getPostContentLength: (...args: unknown[]) => mockGetPostContentLength(...args),
  insertPost: vi.fn(),
  getPostGroupId: vi.fn(),
  getPostAuthorId: vi.fn(), // include others to prevent import errors
}));

const mockRedisGet = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue("OK"));
const mockRedisZrem = vi.hoisted(() => vi.fn().mockResolvedValue(1));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ get: mockRedisGet, set: mockRedisSet, zrem: mockRedisZrem }),
  getRedisPublisher: () => ({ publish: vi.fn().mockResolvedValue(1) }),
}));

const mockCreateNotification = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "notif-1", createdAt: new Date() }),
);
vi.mock("@/db/queries/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { on: vi.fn(captureHandler), emit: vi.fn() },
}));

import "./points-engine"; // side-effect: registers handlers
```

**Required tests** (≥20):

1. `handlePostReacted`: quality gate — content < 10 chars → `awardPoints` NOT called
2. `handlePostReacted`: quality gate — content === null (post deleted) → `awardPoints` NOT called
3. `handlePostReacted`: award success — `awardPoints` called with correct keys (idempotencyKey includes postId + userId)
4. `handlePostReacted`: award success — `insertPointsLedgerEntry` called with `sourceType: 'like_received'`
5. `handlePostReacted`: duplicate block — `result[1] === 'duplicate'` → NO ledger insert, NO audit log
6. `handlePostReacted`: rapid_fire block — `logPointsThrottle` called with `reason: 'rapid_fire'`
7. `handlePostReacted`: rapid_fire block — `createNotification` called for reactor userId
8. `handlePostReacted`: repeat_pair block — `logPointsThrottle` called, `createNotification` NOT called
9. `handlePostReacted`: daily_cap block — neither logThrottle nor notification (silent)
10. `handlePostReacted`: rule not found (returns null) → `awardPoints` NOT called
11. `handleEventAttended`: actorId = payload.userId, earnerUserId = payload.hostId in `awardPoints` call
12. `handleEventAttended`: award success → `insertPointsLedgerEntry` with `sourceType: 'event_attended'`, `userId: payload.hostId`
13. `handleArticlePublished`: actorId starts with `"article:"` in `awardPoints` call (synthetic)
14. `handleArticlePublished`: award success → `insertPointsLedgerEntry` with `sourceType: 'article_published'`
15. `handleAccountStatusChanged`: SUSPENDED → `zrem` called with `('points:leaderboard', userId)`
16. `handleAccountStatusChanged`: PENDING_DELETION → `zrem` called
17. `handleAccountStatusChanged`: ANONYMIZED → `zrem` called
18. `handleAccountStatusChanged`: active status → `zrem` NOT called
19. `getUserPointsBalance`: Redis hit (non-null) → returns cached value, DB NOT queried
20. `getUserPointsBalance`: Redis miss (null) → calls `getUserPointsTotal` + caches via `redis.set`
21. `getBadgeMultiplier`: always returns `1`

**`post-interaction-service.test.ts`** — add these tests:

- Self-reaction: `reactToPost(postId, userId=authorId, ...)` → rejects with ApiError 403; `toggleReaction` NOT called
- Post not found: `getPostAuthorId` returns null → ApiError 404; `toggleReaction` NOT called
- Update `getPostAuthorId` mock default to `vi.fn().mockResolvedValue('author-user-id')` in the mock factory (should already be set from the spike — verify)

### Project Structure Notes

**Files to create:**

- `src/db/migrations/0035_points_engine.sql`
- `src/db/schema/platform-points.ts`
- `src/db/queries/points.ts`
- `src/db/queries/points.test.ts`
- `src/services/points-engine.ts`
- `src/services/points-engine.test.ts`

**Files to modify:**

- `src/db/migrations/meta/_journal.json` (add idx 35 entry)
- `src/db/index.ts` (import + spread platformPointsSchema)
- `src/db/queries/posts.ts` (add `getPostContentLength`)
- `src/services/post-interaction-service.ts` (refactor `reactToPost`)
- `src/services/post-interaction-service.test.ts` (add 2+ tests)
- `src/server/jobs/index.ts` (add side-effect import)
- `messages/en.json` (add `notifications.points_throttled.*`)
- `messages/ig.json` (add `notifications.points_throttled.*`)

**Files NOT to change:**

- `src/types/events.ts` — no new event types needed; `points.awarded` already in EventMap (pre-existing, but not used in this story)
- `src/server/realtime/subscribers/eventbus-bridge.ts` — points engine is web-container only
- `src/lib/points-lua-runner.ts` — prototype is complete; Story 8.1 uses it directly

### References

- [Source: `_bmad-output/implementation-artifacts/tech-spec-redis-lua-spike-points-engine.md`] — complete Lua key design, defineCommand pattern, AwardPointsResult contract, AC 1–17 all passing
- [Source: `src/lib/points-lua-runner.ts`] — `awardPoints(input: AwardPointsInput)` API; `AwardPointsResult` type; key builder
- [Source: `src/config/points.ts`] — `POINTS_CONFIG` constants (RAPID_FIRE_WINDOW_SEC=60, RAPID_FIRE_THRESHOLD=10, QUALITY_GATE_MIN_CHARS=10, DAILY_CAP_POINTS=100)
- [Source: `src/services/notification-service.ts`] — HMR guard pattern; handler registration; deliverNotification pattern (direct createNotification + Redis publish)
- [Source: `src/server/jobs/index.ts`] — side-effect import pattern for service registration
- [Source: `src/services/post-interaction-service.ts:27`] — `TODO (Story 8.1)` comment location; existing `reactToPost` structure
- [Source: `src/db/queries/posts.ts:159`] — `getPostAuthorId` (already exists); `getPostGroupId` as pattern for `getPostContentLength`
- [Source: `docs/decisions/redis-lua-spike.md`] — key design reference, idempotency key formulas
- [Source: `docs/decisions/anti-gaming-test-strategy.md`] — test strategy; ZSET score seeding; vi.useFakeTimers() scope

### Key Constraints & Gotchas

1. **`points-lua-runner.ts` is a prototype** — do NOT refactor it in Story 8.1. Use `awardPoints()` exported from it directly. The key builder (`buildPointsKeys`) is also exported if useful.

2. **`getPostContentLength` null guard** — if returns `null` (post deleted between reaction and content fetch), skip the award silently (not an error). Log at `console.info` level.

3. **Multiplier storage** — `multiplierApplied` in the ledger stores the numeric multiplier (e.g., `1.00`, `3.00`, `6.00`, `10.00`). For Story 8.1 it's always `1.00`. When Story 8.3 implements badges, update `getBadgeMultiplier` and the ledger records will automatically reflect the badge level.

4. **`audit_logs` FK constraint** — `actor_id` is `NOT NULL REFERENCES auth_users(id)`. Only log throttle events where `actorId` is a guaranteed real user UUID (rapid_fire: actorId = reactor userId ✓; repeat_pair: actorId = reactor userId ✓). For daily_cap, skip the audit log (actor ambiguous — earner hit their cap but "actor" is unclear). Use `console.warn` structured log for daily_cap instead.

5. **`DAILY_CAP_POINTS: 100`** — this caps total points EARNED per UTC day (not number of awards). The Lua script tracks cumulative `INCRBY` (not INCR 1). A single 10-point article publish counts as 10 toward the cap. The `[REVIEW]` note in `points.ts` — validate this value with PO before Story 8.1 ships.

6. **HMR guard key** — use `__pointsHandlersRegistered` (not `__notifHandlersRegistered`). Both guards must be independent.

7. **`getRedisPublisher` vs `getRedisClient`** — for the throttle notification publish, use `getRedisPublisher()` (returns the dedicated pub/sub connection). For `points:user:{userId}` cache, use `getRedisClient()`. These are separate ioredis connections.

8. **Test isolation** — `points-engine.test.ts` MUST mock `@/lib/points-lua-runner` (it imports from `@/lib/redis` which needs `REDIS_URL`). Mock `@/db/queries/posts` fully (includes getPostAuthorId etc.) to prevent import chain errors. Always `vi.clearAllMocks()` in `beforeEach`.

9. **`awardPoints` Redis errors** — if the Lua call itself throws (Redis connection failure), the handler's `try/catch` wrapper swallows it. This is intentional: points are best-effort, not transactional with the reaction/event. The reaction/event itself already succeeded before the EventBus handler fires.

10. **Handler invocation in tests** — the `captureHandler` pattern stores handlers in a Map keyed by event name. To invoke a handler in a test:
    ```ts
    const handler = handlerRef.current.get("post.reacted")!;
    await handler({
      postId: "p1",
      userId: "u1",
      reaction: "like",
      authorId: "author-1",
      timestamp: new Date().toISOString(),
    });
    ```
    Always use `handlerRef.current.get(eventName)!` — the `!` is safe because handler registration runs at import time (line `import "./points-engine";`).

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation, no blocking issues.

### Completion Notes List

- **Task 1**: Created `0035_points_engine.sql` migration with `platform_points_ledger` and `platform_points_rules` tables + seed data. Added journal entry idx=35. Created `platform-points.ts` Drizzle schema with pgEnum. Registered in `src/db/index.ts`.
- **Task 2**: Created `src/db/queries/points.ts` with all 5 query functions. Added `getPostContentLength` to `posts.ts` using `sql<number>` template. Created 10-test suite in `points.test.ts` using `vi.hoisted()` for mock vars.
- **Task 3**: Refactored `reactToPost` — `getPostAuthorId` now called first (before `toggleReaction`). Self-reaction → ApiError 403. Post not found → ApiError 404. Removed TODO comment. Imported `ApiError`. Updated 2 broken tests (null/throw cases now throw instead of resolve), added 2 new tests (self-react 403, different-user allows through). 25 post-interaction tests all pass.
- **Task 4**: Created `src/services/points-engine.ts` with `server-only` guard. All 4 handlers implemented. HMR guard uses `__pointsHandlersRegistered` key. Rapid-fire sends system notification directly (avoiding circular dep with notification-service). Repeat-pair audit log only. Daily-cap console.warn only. `getBadgeMultiplier` stub returns 1.
- **Task 5**: Added side-effect import of `@/services/points-engine` to `src/server/jobs/index.ts`.
- **Task 6**: Added `notifications.points_throttled.title/body` to both `en.json` and `ig.json`.
- **Task 7**: Created 21-test suite (exceeds ≥20 requirement). All handler scenarios tested including quality gates, award success, duplicate/rapid_fire/repeat_pair/daily_cap/self blocks, account status cleanup, Redis cache hit/miss.
- **Test counts**: 3290 baseline → 3337 passing (47 new tests). 0 regressions. 10 Lua integration tests skipped (require REDIS_URL).

### File List

- src/db/migrations/0035_points_engine.sql (created)
- src/db/migrations/meta/\_journal.json (modified — added idx=35)
- src/db/schema/platform-points.ts (created)
- src/db/index.ts (modified — added platformPointsSchema import + spread)
- src/db/queries/points.ts (created)
- src/db/queries/points.test.ts (created)
- src/db/queries/posts.ts (modified — added getPostContentLength; review: whitespace-stripped LENGTH)
- src/db/queries/posts.test.ts (modified — review: added 2 getPostContentLength tests)
- src/services/post-interaction-service.ts (modified — reactToPost refactored + ApiError import)
- src/services/post-interaction-service.test.ts (modified — 2 tests updated, 2 new + ApiError import)
- src/services/points-engine.ts (created)
- src/services/points-engine.test.ts (created)
- src/server/jobs/index.ts (modified — side-effect import for points-engine)
- messages/en.json (modified — notifications.points_throttled.\* added)
- messages/ig.json (modified — notifications.points_throttled.\* added)

### Change Log

- 2026-03-07: Story 8.1 implemented — Points Engine & Earning Rules. Migration 0035, Drizzle schema, query functions, PointsEngine service (4 handlers + HMR guard), self-reaction block, i18n keys, 47 new tests.
- 2026-03-07: Senior Dev Review — 7 findings (1 HIGH, 3 MEDIUM, 3 LOW), all fixed:
  - F1 (HIGH): AC 6 quality gate now strips whitespace via `REGEXP_REPLACE(content, '\s', '', 'g')` in `getPostContentLength` SQL
  - F2 (MEDIUM): Added 2 `getPostContentLength` tests to `posts.test.ts` (found + null cases)
  - F3 (MEDIUM): `getUserPointsBalance` now guards against NaN from corrupted Redis data — falls back to DB
  - F4 (MEDIUM): `event.attended`, `article.published`, and `account.status_changed` handler wrappers now log structured errors (matching `post.reacted` pattern)
  - F5 (LOW): Added "rule not found" negative tests for `handleEventAttended` and `handleArticlePublished`
  - F6 (LOW): `[REVIEW]` PO validation of base_points (1/5/10) and DAILY_CAP (100) noted as pre-launch blocker
  - F7 (LOW): Added `awardPoints` throws (Redis down) error propagation test
  - Test counts: 3337 → 3343 passing (+6 review fix tests). 0 regressions. 10 Lua integration tests skipped.
