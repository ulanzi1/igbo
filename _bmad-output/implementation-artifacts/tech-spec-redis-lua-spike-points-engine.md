---
title: "Redis+Lua Spike — Points Engine Pre-Epic-8 Prototype"
slug: "redis-lua-spike-points-engine"
created: "2026-03-07"
status: "implementation-complete"
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
tech_stack:
  [
    "Next.js 16 App Router",
    "TypeScript strict",
    "ioredis 5.9.3",
    "Vitest",
    "Lua 5.1 (Redis embedded)",
  ]
files_to_modify:
  - "src/types/events.ts"
  - "src/services/post-interaction-service.ts"
  - "src/services/event-service.ts"
  - "src/db/queries/posts.ts"
  - "next.config.ts"
  - ".github/workflows/test.yml"
code_patterns:
  [
    "server-only guard on lib files",
    "export const X = {} as const for config",
    "vi.mock @/lib/redis factory at top of test file",
    "co-located tests with @vitest-environment node",
  ]
test_patterns:
  [
    'vi.mock("@/lib/redis", () => ({ getRedisClient: () => ({ awardPoints: vi.fn() }) }))',
    "describe.skipIf(!process.env.REDIS_URL) for integration tests",
    "ZSET score seeding for window simulation",
  ]
---

# Tech-Spec: Redis+Lua Spike — Points Engine Pre-Epic-8 Prototype

**Created:** 2026-03-07

## Overview

### Problem Statement

Epic 8's points engine requires atomic Redis operations (idempotent increment, sliding-window anti-gaming, daily cap, leaderboard) that the current pipeline-based rate-limiter pattern cannot safely provide. Three blocking gaps exist before Story 8.1 can be authored: (1) no Lua prototype, `defineCommand` pattern, or CI mock strategy documented; (2) `post.reacted` is missing `authorId` and `event.attended` is missing `hostId` in EventBus payloads, making it impossible to award points to the correct recipient; (3) no anti-gaming constants (`src/config/points.ts`) or Vitest time-window test strategy exist.

### Solution

Patch the two EventBus payload types and all their emitters. Create `src/lib/lua/award-points.lua` — a single atomic Lua script covering idempotency, self-award block, rapid-fire detection, repeat-pair detection, daily cap (UTC date), user counter increment, and leaderboard update. Register it via ioredis `defineCommand()` as a named method. Build prototype `src/lib/points-lua-runner.ts` wrapping the command. Create `src/config/points.ts` with all anti-gaming constants. Produce two decision docs locking key design, the `defineCommand` pattern, and the Vitest mock strategy — everything Story 8.1 needs to implement production code without discovery work.

### Scope

**In Scope:**

- Patch `src/types/events.ts`: add `authorId` to `PostReactedEvent`, add `hostId` to `EventAttendedEvent`
- Find and patch all emitters of `post.reacted` and `event.attended` to include the new fields
- `src/lib/lua/award-points.lua` — single atomic Lua script (7-step flow)
- `src/lib/points-lua-runner.ts` — prototype using ioredis `defineCommand()`, not production-shipping
- `src/config/points.ts` — self-like block, rapid-fire 60s/10, repeat-pair 10min/5, quality gate 10 chars, daily cap constant
- `docs/decisions/redis-lua-spike.md` — full key design, defineCommand pattern, atomic flow diagram, CI mock strategy
- `docs/decisions/anti-gaming-test-strategy.md` — `vi.useFakeTimers()` + Redis mock pattern for windowed rules
- Tests for the prototype (proving defineCommand + Lua flow works under mocks)

**Out of Scope:**

- Production `PointsService` with DB integration (Story 8.1)
- `platform_points_ledger` + `platform_points_rules` schema + migration (separate Winston+Charlie task)
- Stories 8.2–8.4 (dashboard, badges, posting limits)

## Context for Development

### Codebase Patterns

- **Redis client:** `import Redis from "ioredis"` — `getRedisClient()` returns `Redis` (full ioredis class). No `server-only` guard (shared with realtime server). `defineCommand()` is available directly on the returned instance.
- **`defineCommand` TypeScript typing:** ioredis adds the custom method at runtime but TypeScript doesn't know about it. Use module augmentation in `points-lua-runner.ts` — `declare module 'ioredis' { interface Redis { awardPoints(...): Promise<[number, string, number, number]> } }` — or cast as needed.
- **Config file pattern:** `export const X = { ... } as const` + companion type aliases. No default export, no `server-only`, no imports. Follow `src/config/feed.ts`.
- **Lib file pattern for `points-lua-runner.ts`:** Do NOT add `import "server-only"` — follow `src/lib/redis.ts` precedent (no `server-only`), not `rate-limiter.ts`. Story 8.1 will wire points to `eventbus-bridge.ts` running in the standalone realtime server; `server-only` would crash it.
- **Rate-limiter mock pattern:** `vi.mock("@/lib/redis", () => ({ getRedisClient: () => ({ pipeline: () => mockPipeline }) }))` hoisted at top of test file. For points runner: swap `pipeline` for `defineCommand: vi.fn(), awardPoints: mockAwardPoints`.
- **EventBus:** `eventBus.emit(event, payload)` — synchronous boolean return (do not `await` it — vestigial pattern in existing code). TypeScript enforces payload shape via `EventMap[K]`. Adding required fields causes compile-time errors at all emit sites.
- **Co-located tests:** `src/lib/points-lua-runner.test.ts` and `src/lib/lua/award-points-lua.test.ts` alongside their source files. `// @vitest-environment node` at top of both.
- **`vi.clearAllMocks()` in `beforeEach`** — never `vi.resetAllMocks()` (breaks factory mocks).

### Files to Reference

| File                                       | Purpose                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/redis.ts`                         | Redis client — `getRedisClient(): Redis`. No `server-only`. `defineCommand()` available on return value.                                                               |
| `src/lib/rate-limiter.ts`                  | Pipeline-based ZSET sliding window — pattern the Lua script replaces. `import "server-only"` at line 1.                                                                |
| `src/lib/rate-limiter.test.ts`             | Redis mock pattern — `vi.mock("@/lib/redis", () => ({ getRedisClient: () => ({ pipeline: () => mockPipeline }) }))`                                                    |
| `src/types/events.ts`                      | `PostReactedEvent` (lines 29-33): `{ postId, userId, reaction }` — missing `authorId`. `EventAttendedEvent` (lines 387-390): `{ eventId, userId }` — missing `hostId`. |
| `src/services/post-interaction-service.ts` | `reactToPost()` emits `post.reacted` at line 38. `authorId` NOT in scope — requires DB fetch before emit.                                                              |
| `src/services/event-service.ts`            | `markAttendance()` emits `event.attended` at line 426. `event.creatorId` IS in scope (fetched at line 408).                                                            |
| `src/services/event-bus.ts`                | `TypedEventBus` singleton — `eventBus.emit(event, payload): boolean`.                                                                                                  |
| `src/config/feed.ts`                       | Config file pattern — `export const X = {} as const` + type aliases, no imports.                                                                                       |

### Technical Decisions

**`authorId` fetch in `reactToPost` (critical finding):**
`authorId` is NOT available in scope at the `post.reacted` emit site (`post-interaction-service.ts:38`). The function only receives `postId`, `userId` (reactor), and `reactionType`. A DB fetch is required before the emit. Add `getPostAuthorId(postId: string): Promise<string | null>` to `src/db/queries/posts.ts` (alongside existing `getPostGroupId`) — single `SELECT creator_id FROM community_posts WHERE id = $1`, no join. Call inside `reactToPost` before the emit block.

**Null-guard requirement (explicit):** If `getPostAuthorId` returns `null` (post deleted), skip the emit entirely — do NOT emit with `authorId: null`. TypeScript enforces `authorId: string` (required), so a null emission will fail to compile, but the implementation task must explicitly state the skip-on-null behaviour to prevent a `authorId: authorId ?? ''` workaround.

**`hostId` fetch in `markAttendance` (trivial):**
`event.creatorId` is already in scope at the emit site (`event-service.ts:426`) — the full event object is fetched at line 408. Simply add `hostId: event.creatorId` to the emit payload. No additional DB query needed.

**`defineCommand` ioredis type augmentation — named types (not inline):**

```ts
// In src/lib/points-lua-runner.ts — export these so Story 8.1 can import them
export type AwardPointsResult = [
  awarded: 0 | 1, // index 0 — 1 = awarded, 0 = blocked
  reason: string, // index 1 — "ok" | "duplicate" | "self" | "rapid_fire" | "repeat_pair" | "daily_cap"
  newTotal: number, // index 2 — earner's cumulative points:user:{userId} value
  leaderboardScore: number, // index 3 — earner's current points:leaderboard score
];

declare module "ioredis" {
  interface Redis {
    awardPoints(
      numberOfKeys: number,
      // KEYS (numberOfKeys = 6)
      idempotencyKey: string,
      rapidKey: string,
      repeatKey: string,
      dailyKey: string,
      leaderboardKey: string,
      userKey: string,
      // ARGV
      actorId: string,
      earnerUserId: string,
      amount: number,
      rapidThreshold: number,
      rapidWindowSec: number,
      repeatThreshold: number,
      repeatWindowSec: number,
      dailyCap: number,
    ): Promise<AwardPointsResult>;
  }
}
```

**Key Design (full set):**

| Key                                        | Redis Type | Purpose                                                                                     | TTL                        |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| `points:user:{userId}`                     | STRING     | Cumulative all-time counter (INCRBY)                                                        | none                       |
| `points:leaderboard`                       | ZSET       | All-time rankings (ZINCRBY)                                                                 | none                       |
| `points:idempotency:{compositeKey}`        | STRING     | Dedup flag — deterministic per event type (see below)                                       | 24h                        |
| `points:rapid:{actorId}`                   | ZSET       | Rapid-fire sliding window (timestamps as scores)                                            | auto via ZREMRANGEBYSCORE  |
| `points:repeat:{actorId}:{contentOwnerId}` | ZSET       | Repeat-pair sliding window — keyed by content owner (authorId for posts, hostId for events) | auto via ZREMRANGEBYSCORE  |
| `points:daily:{earnerUserId}:{YYYY-MM-DD}` | STRING     | Daily cap on points EARNED — UTC date, earner userId (not actor)                            | EXPIREAT next UTC midnight |

**Idempotency key formula (deterministic — not a random UUID):**
| Event | Idempotency key |
|-------|----------------|
| `post.reacted` | `points:idempotency:reaction:{postId}:{actorId}` |
| `event.attended` | `points:idempotency:attended:{eventId}:{userId}` |
| `article.published` | `points:idempotency:article:{articleId}` |

> **Why deterministic?** If the emitter generates a new UUID per emission, a user who unreacts and re-reacts gets a fresh `eventId` and bypasses the dedup gate. A composite key derived from stable identifiers prevents re-earning regardless of how many times the event is emitted.

**Lua via `defineCommand` (not raw `eval`):**
ioredis `defineCommand(name, { lua, numberOfKeys })` registers the script as a named method on the client instance. Lua file is read with `fs.readFileSync` at module load and passed as the `lua` string. Avoids raw `eval()` call sites — the script hash is managed automatically by ioredis.

**`award-points.lua` atomic flow (step 0 + 7 writes):**

- **Step 0 — ARGV validation (before any Redis write):** Validate all required ARGV values are non-nil and non-empty. If any are missing, `return error("invalid args: ...")` immediately. No keys are touched if inputs are malformed — prevents partial-write desync.
- **Step 1 — Idempotency:** `redis.call('SET', idempotencyKey, '1', 'NX', 'EX', 86400)` — single atomic command (not SETNX + EXPIRE). If returns nil (key existed) → `return {0, "duplicate", 0, 0}`.
- **Step 2 — Self-award block:** if `actorId == earnerUserId` (ARGV) → `return {0, "self", 0, 0}`.
- **Step 3 — Rapid-fire check:** `local now = tonumber(redis.call('TIME')[1])`. `local us = tostring(redis.call('TIME')[2])`. `ZREMRANGEBYSCORE` entries older than window + `ZCARD` → if ≥ threshold → `return {0, "rapid_fire", 0, 0}`. Then `ZADD rapidKey now (tostring(now)..":"..us)` — member is `"seconds:microseconds"` for uniqueness (avoids same-second collision). `EXPIRE rapidKey windowSeconds`.
- **Step 4 — Repeat-pair check:** Same pattern with unique member — `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD repeatKey now (tostring(now)..":"..us)` + `EXPIRE repeatKey windowSeconds`.
- **Step 5 — Daily cap check:** `local utcDate = os.date("!%Y-%m-%d")`. `GET points:daily:{earnerUserId}:{utcDate}` → if ≥ cap → `return {0, "daily_cap", 0, 0}`.
- **Step 6 — Increment:** `INCRBY points:user:{earnerUserId} {amount}`. `INCRBY points:daily:{earnerUserId}:{utcDate} {amount}` (tracks total points earned, not award count — consistent with `DAILY_CAP_POINTS` semantics). `local midnight = (math.floor(now / 86400) + 1) * 86400`. `EXPIREAT` daily cap key to `midnight` — note `(floor+1)*86400` not `ceil*86400` to avoid instant-expiry at exact midnight boundary.
- **Step 7 — Leaderboard:** `ZINCRBY points:leaderboard {amount} {earnerUserId}`. Return `{1, "ok", newTotal, leaderboardScore}`.

> **Lua time source:** `local now = tonumber(redis.call('TIME')[1])` — extracts seconds from the `{seconds, microseconds}` array. Never use a server-supplied ARGV timestamp. Eliminates multi-container clock skew.

> **ZSET TTL hardening:** After each `ZADD` to a sliding window ZSET, call `EXPIRE {key} {windowSeconds}`. Keys self-destruct if no new activity arrives within the window — prevents unbounded Redis memory growth at `O(users²)` repeat-pair key scale.

> **Return contract — positional flat array:** Lua returns `{awarded(0|1), reason(string), newTotal(number), leaderboardScore(number)}`. ioredis parses Lua hash tables incorrectly as JS — always use positional flat arrays. TypeScript wrapper reads by index: `result[0]`, `result[1]`, etc. This contract must be documented in the decision doc.

> **Leaderboard ghost scores (known gap):** When a user is suspended or deleted, `points:leaderboard` retains their score. Story 8.1 must emit a cleanup that calls `ZREM points:leaderboard {userId}` on account suspension/deletion.

**`.lua` file loading — production build safety:**

```ts
// points-lua-runner.ts
let luaScript: string;
try {
  luaScript = fs.readFileSync(path.join(process.cwd(), "src/lib/lua/award-points.lua"), "utf-8");
} catch (err) {
  throw new Error(
    `award-points.lua not found — check next.config.ts outputFileTracingIncludes: ${err}`,
  );
}
```

`fs.readFileSync` throws `ENOENT` on missing file — never returns `null`. The `if (!luaScript)` guard is dead code and must not be used.

**⚠️ Next.js standalone build:** `next build --output standalone` does NOT trace non-JS files. Add to `next.config.ts`:

```ts
experimental: {
  outputFileTracingIncludes: {
    '/**': ['./src/lib/lua/*.lua'],
  },
}
```

Without this, `award-points.lua` will be absent in `.next/standalone` and the module will crash on load in production. Add `next.config.ts` to files modified in this spike.

**Quality gate definition:**
`QUALITY_GATE_MIN_CHARS = 10` in `src/config/points.ts` applies to **post body character count only**, stripped of leading/trailing whitespace. Title length is not counted. **Enforcement point (Story 8.1):** this check runs in the points handler (TypeScript layer) before calling `awardPoints` — if `content.trim().length < QUALITY_GATE_MIN_CHARS`, skip the award entirely. It is NOT enforced in the Lua script. The constant is exported from `src/config/points.ts` now so Story 8.1 can import it without duplication.

**EventBus payload gaps (to fix — required fields, not optional):**

- `PostReactedEvent`: add `authorId: string` (required — the post author who earns points, not the reactor)
- `EventAttendedEvent`: add `hostId: string` (required — the event creator who earns points)
- `ArticlePublishedEvent`: already has `authorId` ✅ — no change needed
- All emitters of `post.reacted` and `event.attended` must be found and patched before the type change lands. Zero `// @ts-ignore` exceptions.

**UTC date in Lua:** `os.date("!%Y-%m-%d")` — the `!` prefix forces UTC. Used for daily cap key label only (human-readable). The `EXPIREAT` timestamp is computed via `(math.floor(now / 86400) + 1) * 86400` — NOT `math.ceil`, which returns `now` itself at exact midnight boundaries (instant expiry). Requires **Redis ≥ 7.0** — `os.date` was restricted in Redis 6 Lua sandbox. In TypeScript: `new Date().toISOString().slice(0, 10)`.

**`AwardPointsInput` — rename `authorId` to `contentOwnerId`:**
The `repeatKey` is `points:repeat:{actorId}:{contentOwnerId}`. For `post.reacted`, `contentOwnerId = authorId`. For `event.attended`, `contentOwnerId = hostId`. The field must be named `contentOwnerId` in `AwardPointsInput` to be semantically correct across event types. Callers must pass the appropriate value per event type — this must be documented in `redis-lua-spike.md` with one calling example per event type.

**`initPointsLuaCommands` — idempotency guard:**
Before calling `redis.defineCommand('awardPoints', ...)`, check if already registered: `if (!(redis as any).awardPoints) { redis.defineCommand(...) }`. Prevents duplicate registration on Next.js HMR and avoids re-registration if called multiple times. Also resolves unit test mock hoisting: if `vi.mock('@/lib/redis')` is in place before the module evaluates, `getRedisClient()` returns the mock and `defineCommand` is a `vi.fn()` — the module-level IIFE is safe.

## Implementation Plan

### Tasks

- [x] **Task 1: Patch EventBus payload types**
  - File: `src/types/events.ts`
  - Action: Add `authorId: string` to `PostReactedEvent` interface (after `reaction` field). Add `hostId: string` to `EventAttendedEvent` interface (after `userId` field). Both are required — not optional.
  - Notes: TypeScript will immediately surface compile errors at every emit site that omits the new fields. Do not proceed to Task 3/4 until Tasks 1–2 are complete or TS errors are expected.

- [x] **Task 2: Add `getPostAuthorId` DB query**
  - File: `src/db/queries/posts.ts`
  - Action: Add `export async function getPostAuthorId(postId: string): Promise<string | null>`. Implementation: `SELECT creator_id FROM community_posts WHERE id = $1` — return the value or `null` if not found. Follow the same pattern as the existing `getPostGroupId` function in the same file.
  - Notes: Single column SELECT, no JOIN. `creator_id` maps to `communityPosts.creatorId` in the Drizzle schema.

- [x] **Task 3: Patch `post.reacted` emitter**
  - File: `src/services/post-interaction-service.ts`
  - Action: Inside `reactToPost()`, before the `eventBus.emit("post.reacted", ...)` block (currently line 38), add:
    ```ts
    let authorId: string | null = null;
    try {
      authorId = await getPostAuthorId(postId);
    } catch {
      // DB error fetching authorId — skip emit, do not surface to caller
    }
    if (!authorId) {
      /* skip emit */
    }
    ```
    Add `authorId` to the emit payload only when `authorId` is non-null. The structure within the existing function is:
    ```ts
    // OUTSIDE the existing emit try/catch:
    let authorId: string | null = null;
    try { authorId = await getPostAuthorId(postId); }
    catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'post.reacted.authorId-fetch-failed', postId, error: (err as Error).message }));
    }
    if (authorId) {
      try { eventBus.emit("post.reacted", { postId, userId, reaction: result.newReactionType, timestamp: ..., authorId }); }
      catch { /* existing swallow */ }
    }
    ```
  - Notes: Import `getPostAuthorId` from `@/db/queries/posts`. Do NOT use `authorId ?? ''`. **Also update `post-interaction-service.test.ts`**: the existing `vi.mock("@/db/queries/posts", () => ({ ... }))` factory must be updated to add `getPostAuthorId: vi.fn().mockResolvedValue('author-user-id')` — omitting it causes `TypeError: getPostAuthorId is not a function` in all existing `reactToPost` tests.

- [x] **Task 4: Patch `event.attended` emitter**
  - File: `src/services/event-service.ts`
  - Action: In `markAttendance()`, add `hostId: event.creatorId` to the `eventBus.emit("event.attended", ...)` payload at line 426. `event` is already fetched at line 408 — no additional DB call needed.
  - Notes: Trivial one-liner change. Verify TypeScript is satisfied (no cast needed — `event.creatorId` is `string`).

- [x] **Task 5: Create `src/config/points.ts`**
  - File: `src/config/points.ts` (new)
  - Action: Create with the following constants following the `src/config/feed.ts` pattern (`export const X = {} as const`, no imports, no `server-only`):
    ```ts
    export const POINTS_CONFIG = {
      // Sliding window anti-gaming
      RAPID_FIRE_WINDOW_SEC: 60,
      RAPID_FIRE_THRESHOLD: 10, // max reactions per actorId per window
      REPEAT_PAIR_WINDOW_SEC: 600, // 10 minutes
      REPEAT_PAIR_THRESHOLD: 5, // max reactions per actorId:authorId pair per window
      // Quality gate
      QUALITY_GATE_MIN_CHARS: 10, // post body chars stripped of whitespace
      // [REVIEW] validate DAILY_CAP_POINTS value with PO before Story 8.1 ships
      DAILY_CAP_POINTS: 100, // total points earnable per UTC day (not award count)
    } as const;
    export type PointsConfigKey = keyof typeof POINTS_CONFIG;
    ```

- [x] **Task 6: Create `src/lib/lua/award-points.lua`**
  - File: `src/lib/lua/award-points.lua` (new — create directory `src/lib/lua/`)
  - Action: Implement the full atomic 8-step Lua script. Begin the file with a contract comment header (this is the source of truth — Task 7 TypeScript key-building must match exactly):
    ```lua
    -- award-points.lua
    -- KEYS (numberOfKeys = 6):
    --   KEYS[1] = points:idempotency:{compositeKey}
    --   KEYS[2] = points:rapid:{actorId}
    --   KEYS[3] = points:repeat:{actorId}:{contentOwnerId}  (authorId for posts, hostId for events)
    --   KEYS[4] = points:daily:{earnerUserId}   (utcDate appended inside script)
    --   KEYS[5] = points:leaderboard
    --   KEYS[6] = points:user:{earnerUserId}
    -- ARGV:
    --   ARGV[1] = actorId        (string)
    --   ARGV[2] = earnerUserId   (string)
    --   ARGV[3] = amount         (number)
    --   ARGV[4] = rapidThreshold (number)
    --   ARGV[5] = rapidWindowSec (number)
    --   ARGV[6] = repeatThreshold(number)
    --   ARGV[7] = repeatWindowSec(number)
    --   ARGV[8] = dailyCap       (number)
    -- RETURN: flat array {awarded(0|1), reason(string), newTotal(number), leaderboardScore(number)}
    ```
    Then implement: KEYS order (numberOfKeys=6): `KEYS[1]=idempotencyKey`, `KEYS[2]=rapidKey`, `KEYS[3]=repeatKey`, `KEYS[4]=dailyKey`, `KEYS[5]=leaderboardKey`, `KEYS[6]=userKey`. ARGV order: `ARGV[1]=actorId`, `ARGV[2]=earnerUserId`, `ARGV[3]=amount`, `ARGV[4]=rapidThreshold`, `ARGV[5]=rapidWindowSec`, `ARGV[6]=repeatThreshold`, `ARGV[7]=repeatWindowSec`, `ARGV[8]=dailyCap`.
    - **Step 0:** Validate all KEYS and ARGV non-nil/non-empty. If invalid, `return redis.error_reply("invalid args")`.
    - **Step 1:** `local set = redis.call('SET', KEYS[1], '1', 'NX', 'EX', 86400)`. If `set == false` → `return {0, "duplicate", 0, 0}`.
    - **Step 2:** If `ARGV[1] == ARGV[2]` (actorId == earnerUserId) → `return {0, "self", 0, 0}`.
    - **Step 3:** `local now = tonumber(redis.call('TIME')[1])`. `local us = tostring(redis.call('TIME')[2])`. Rapid-fire: `redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, now - tonumber(ARGV[5]))`. If `redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4])` → `return {0, "rapid_fire", 0, 0}`. Else: `redis.call('ZADD', KEYS[2], now, tostring(now)..":"..us)` — unique member via microseconds. `redis.call('EXPIRE', KEYS[2], ARGV[5])`.
    - **Step 4:** Repeat-pair: same pattern with `KEYS[3]`, `ARGV[6]` (threshold), `ARGV[7]` (window), unique member `tostring(now)..":"..us`.
    - **Step 5:** `local utcDate = os.date("!%Y-%m-%d")`. `local dailyCount = tonumber(redis.call('GET', KEYS[4] .. ":" .. utcDate) or 0)`. If `dailyCount >= tonumber(ARGV[8])` → `return {0, "daily_cap", 0, 0}`.
    - **Step 6:** `local newTotal = redis.call('INCRBY', KEYS[6], ARGV[3])`. `redis.call('INCRBY', KEYS[4] .. ":" .. utcDate, ARGV[3])` — INCRBY amount (not INCR 1) so daily cap tracks points, not award count. `local midnight = (math.floor(now / 86400) + 1) * 86400`. `redis.call('EXPIREAT', KEYS[4] .. ":" .. utcDate, midnight)` — always next midnight, never current second.
    - **Step 7:** `local leaderboardScore = tonumber(redis.call('ZINCRBY', KEYS[5], ARGV[3], ARGV[2]))`. `return {1, "ok", newTotal, leaderboardScore}`.
  - Notes: The `KEYS[4]` daily key in the Lua script is the base key prefix (e.g., `points:daily:{earnerUserId}`) — the `:{utcDate}` suffix is appended inside the script using `os.date("!%Y-%m-%d")`. The TS runner must pass `points:daily:{earnerUserId}` as KEYS[4], not the full dated key.

- [x] **Task 7: Create `src/lib/points-lua-runner.ts`**
  - File: `src/lib/points-lua-runner.ts` (new)
  - Action: Implement the prototype runner:
    1. NO `import "server-only"` — follow `src/lib/redis.ts` precedent. Story 8.1 will use this from `eventbus-bridge.ts` (realtime server).
    2. Read Lua script with try/catch (not null guard):
       ```ts
       let luaScript: string;
       try {
         luaScript = fs.readFileSync(
           path.join(process.cwd(), "src/lib/lua/award-points.lua"),
           "utf-8",
         );
       } catch (err) {
         throw new Error(
           `award-points.lua not found — check next.config.ts outputFileTracingIncludes: ${err}`,
         );
       }
       ```
    3. Export `AwardPointsResult` tuple type and `AwardPointsInput` type: `{ idempotencyKey: string; actorId: string; earnerUserId: string; contentOwnerId: string; amount: number }`. Field is `contentOwnerId` (not `authorId`) — caller passes post `authorId` or event `hostId` appropriately.
    4. Module augmentation for `declare module 'ioredis'` with `awardPoints(...)` method typed to `Promise<AwardPointsResult>`.
    5. Export `initPointsLuaCommands(redis: Redis): void` — idempotency guard before registering: `if (!(redis as any).awardPoints) { redis.defineCommand('awardPoints', { numberOfKeys: 6, lua: luaScript }); }`. Prevents double-registration on HMR.
    6. Export `awardPoints(input: AwardPointsInput): Promise<AwardPointsResult>` — builds keys, calls `getRedisClient().awardPoints(6, ...keys, ...argv)`. Check result with `=== 1` (not truthiness) for `awarded` field.
    - Key builder: `idempotencyKey = points:idempotency:${input.idempotencyKey}`, `rapidKey = points:rapid:${input.actorId}`, `repeatKey = points:repeat:${input.actorId}:${input.contentOwnerId}`, `dailyKey = points:daily:${input.earnerUserId}`, `leaderboardKey = points:leaderboard`, `userKey = points:user:${input.earnerUserId}`.
  - Notes: **Verify this key order matches the KEYS contract header in `award-points.lua` exactly — the `.lua` file is the source of truth.** Call `initPointsLuaCommands(getRedisClient())` once at module load (after the try/catch). This prototype is intentionally not wired to EventBus subscribers — Story 8.1 does that.

- [x] **Task 8: Create unit tests**
  - File: `src/lib/points-lua-runner.test.ts` (new)
  - Action: Write ≥10 unit tests with mocked Redis. Mock setup:
    ```ts
    // @vitest-environment node
    const mockAwardPoints = vi.fn();
    vi.mock("@/lib/redis", () => ({
      getRedisClient: () => ({ defineCommand: vi.fn(), awardPoints: mockAwardPoints }),
    }));
    ```
    Required tests: (1) awarded=1 branch — returns parsed `AwardPointsResult`, (2) reason="duplicate" → awarded=0, (3) reason="self" → awarded=0, (4) reason="rapid_fire" → awarded=0, (5) reason="repeat_pair" → awarded=0, (6) reason="daily_cap" → awarded=0, (7) `awardPoints` called with correct KEYS array (6 keys in right order), (8) `awardPoints` called with correct ARGV values from `POINTS_CONFIG`, (9) `AwardPointsResult[2]` (newTotal) is returned as number, (10) `initPointsLuaCommands` calls `defineCommand` exactly once with `numberOfKeys: 6`.
  - Notes: Use `mockAwardPoints.mockResolvedValue([1, 'ok', 100, 150] as AwardPointsResult)` — type assertion enforces contract. `vi.clearAllMocks()` in `beforeEach`.

- [x] **Task 9: Create or update CI for Redis service**
  - File: `.github/workflows/test.yml` (create if absent — `.github/` directory does not currently exist in this repo)
  - Action: If no CI file exists, create `.github/workflows/test.yml` with a minimal Vitest workflow including a Redis service. If a CI file already exists under a different name, add the Redis service to the Vitest job. Minimum required content for new file:
    ```yaml
    name: Test
    on: [push, pull_request]
    jobs:
      test:
        runs-on: ubuntu-latest
        services:
          redis:
            image: redis:7-alpine
            ports:
              - 6379:6379
            options: --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 3s --health-retries 5
        env:
          REDIS_URL: redis://localhost:6379
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: "20" }
          - run: npm ci
          - run: npx vitest run
    ```
  - Notes: **Redis 7-alpine required** — `os.date` in Lua sandbox is only available in Redis ≥ 7.0. Redis 6 will throw `ERR user_script: Script attempted to access nonexistent global variable 'os'`. This is also a production infrastructure constraint — document in `redis-lua-spike.md`.

- [x] **Task 10: Create Lua integration tests**
  - File: `src/lib/lua/award-points-lua.test.ts` (new — double-extension `.lua.test.ts` avoided for editor/tooling compatibility)
  - Action: Write 8 integration tests against real Redis. Guard:
    ```ts
    // @vitest-environment node
    describe.skipIf(!process.env.REDIS_URL)("award-points.lua integration", () => {
      if (!process.env.REDIS_URL)
        console.warn("⚠️  REDIS_URL not set — Lua integration tests skipped");
      // setup: ioredis client, initPointsLuaCommands, flush keys in afterEach
    });
    ```
    Required tests: (1) duplicate idempotency key → `[0, "duplicate", ...]`, (2) actorId === earnerUserId → `[0, "self", ...]`, (3) rapid-fire at threshold (seed 9 entries, 10th passes) — boundary, (4) rapid-fire over threshold (seed 10 entries) → `[0, "rapid_fire", ...]`, (5) repeat-pair at threshold (seed 4, 5th passes) — boundary, (6) repeat-pair over threshold (seed 5) → `[0, "repeat_pair", ...]` — use `redis.zadd` with past timestamps to simulate window, (7) daily cap reached → `[0, "daily_cap", ...]` — seed daily key with cap value, (8) successful award → `[1, "ok", newTotal, leaderboardScore]` — verify `points:user`, `points:leaderboard` and ZSET key has TTL.
  - Notes: **Do NOT use `redis.flushall()` in `afterEach`**. Use unique prefix per describe-block: `const testId = randomUUID()` at top. `afterEach` cleanup — delete all prefixed keys explicitly:
    ```ts
    await redis.del(
      `points:idempotency:reaction:${testPostId}:${actorId}`,
      `points:rapid:${actorId}`,
      `points:repeat:${actorId}:${earnerUserId}`,
      `points:leaderboard`, // use ZREM for ZSET
      `points:user:${earnerUserId}`,
      // Daily cap key includes UTC date suffix appended inside Lua — delete explicitly:
      `points:daily:${earnerUserId}:${new Date().toISOString().slice(0, 10)}`,
    );
    await redis.zrem("points:leaderboard", earnerUserId);
    ```
    Use `redis.zadd` with past timestamps for window seeding. Members must be unique strings (e.g., `'seed-1'`, `'seed-2'`) matching the Lua script's ZADD uniqueness pattern.

- [x] **Task 11: Create `docs/decisions/redis-lua-spike.md`**
  - File: `docs/decisions/redis-lua-spike.md` (new)
  - Action: Write decision doc following the required section structure. Must cover: full key design table, complete ARGV/KEYS contract, return value positional contract, `defineCommand` registration pattern (with code snippet), why deterministic idempotency keys, ZSET TTL hardening rationale, CI Redis service setup, known gaps (leaderboard ghost scores, `streamToBuffer` analogy for large payloads), build config note for `.lua` files.
  - Notes: Follow existing docs style (see `docs/decisions/daily-co-integration.md`). Include a "Do Not" section with anti-patterns: raw EVAL, server-supplied timestamps, SETNX+EXPIRE split, Lua hash table returns.

- [x] **Task 12: Create `docs/decisions/anti-gaming-test-strategy.md`**
  - File: `docs/decisions/anti-gaming-test-strategy.md` (new)
  - Action: Write test strategy doc following the required section structure. Must cover: unit mock contract (type-asserted `AwardPointsResult`), coverage floor (10 unit + 8 integration), ZSET score seeding pattern (code snippet), `vi.useFakeTimers()` scope (TS-layer only, never Lua), `REDIS_URL` guard with `console.warn`, CI YAML snippet, anti-patterns (ioredis-mock doesn't run Lua, `vi.useFakeTimers` for Redis TIME, bare `vi.fn()` without type assertion).

### Acceptance Criteria

- [x] **AC 1:** Given `PostReactedEvent` type is updated, when any emitter calls `eventBus.emit("post.reacted", payload)` without `authorId`, then TypeScript compilation fails with a type error.

- [x] **AC 2:** Given `reactToPost(postId, userId, reactionType)` is called and `getPostAuthorId(postId)` returns `null`, when the reaction toggles successfully, then no `post.reacted` event is emitted and the function returns the reaction result normally.

- [x] **AC 3:** Given `reactToPost` is called and `getPostAuthorId` returns a valid `authorId`, when `post.reacted` is emitted, then the payload includes `authorId` matching the post creator's userId.

- [x] **AC 4:** Given `markAttendance(userId, eventId, source)` completes successfully and the attendee was not previously marked, when `event.attended` is emitted, then the payload includes `hostId` equal to `event.creatorId`.

- [x] **AC 5:** Given `POINTS_CONFIG` is imported, when accessed, then `RAPID_FIRE_WINDOW_SEC === 60`, `RAPID_FIRE_THRESHOLD === 10`, `REPEAT_PAIR_WINDOW_SEC === 600`, `REPEAT_PAIR_THRESHOLD === 5`, `QUALITY_GATE_MIN_CHARS === 10`, `DAILY_CAP_POINTS === 100`.

- [x] **AC 6:** Given `initPointsLuaCommands(redis)` is called, when inspected, then `redis.defineCommand` was called exactly once with `name='awardPoints'` and `numberOfKeys=6`.

- [x] **AC 7 (integration):** Given a unique idempotency key, when `awardPoints` is called twice with the same key within 24h, then the second call returns `[0, "duplicate", 0, 0]` and `points:user:{earnerUserId}` is incremented only once.

- [x] **AC 8 (integration):** Given `actorId === earnerUserId`, when `awardPoints` is called, then it returns `[0, "self", 0, 0]` and no Redis keys are modified.

- [x] **AC 9 (integration):** Given `points:rapid:{actorId}` already contains 10 entries within the last 60s (threshold reached), when `awardPoints` is called, then it returns `[0, "rapid_fire", 0, 0]` — note: test 3 (seed 9, 10th passes) tests the at-threshold boundary; this AC tests over-threshold blocking.

- [x] **AC 10 (integration):** Given `points:repeat:{actorId}:{authorId}` contains 5 entries within the last 10min, when `awardPoints` is called, then it returns `[0, "repeat_pair", 0, 0]`.

- [x] **AC 11 (integration):** Given `points:daily:{earnerUserId}:{utcDate}` equals `DAILY_CAP_POINTS` (100 total points already earned today), when `awardPoints` is called, then it returns `[0, "daily_cap", 0, 0]`. Seed via `redis.set(dailyKey, '100')`.

- [x] **AC 12 (integration):** Given all guards pass and `amount=10`, when `awardPoints` is called, then it returns `[1, "ok", newTotal, leaderboardScore]` where `newTotal` equals the previous `points:user` value plus 10 and `leaderboardScore` equals the previous leaderboard score plus 10.

- [x] **AC 13 (integration):** Given a successful award, when the daily cap key TTL is checked immediately after, then `TTL <= 86400` (expires within 24h) and `TTL > 86400 - 120` (not expiring prematurely — allows 2min test execution slack).

- [x] **AC 14 (integration):** Given `points:rapid:{actorId}` is written during a successful award and `RAPID_FIRE_WINDOW_SEC` seconds elapse with no new entries, when `EXISTS points:rapid:{actorId}` is checked, then it returns `0` (key self-destructed via EXPIRE).

- [x] **AC 15:** Given `REDIS_URL` is not set in the environment, when the Lua integration test suite runs, then integration tests are skipped and a `console.warn` message containing "REDIS_URL not set" is printed.

- [x] **AC 16:** Given `REDIS_URL` is set in CI, when the Vitest suite runs, then all 8 Lua integration tests execute and pass.

- [x] **AC 17:** Given production infrastructure runs Redis 6, when `award-points.lua` is loaded, then it throws `ERR user_script: Script attempted to access nonexistent global variable 'os'` — confirming Redis ≥ 7.0 is a hard infrastructure requirement documented in `redis-lua-spike.md`.

## Additional Context

### Dependencies

- **ioredis 5.9.3** — `defineCommand()` supported since v4. No new packages needed.
- **No DB migration** — this spike has no schema changes. `platform_points_ledger` + `platform_points_rules` is a parallel Winston+Charlie task.
- **No new npm packages** — `fs`, `path` are Node built-ins. Lua 5.1 is embedded in Redis.
- **Redis ≥ 7.0 required** — `os.date("!%Y-%m-%d")` is restricted in Redis 6 Lua sandbox. Production infrastructure must be Redis 7+. CI uses `redis:7-alpine`. Document as hard constraint in `redis-lua-spike.md`.
- **Parallel prep tasks (not blocking this spike):** points ledger schema design (Winston+Charlie), EventBus payload audit for `article.published` content-length gate (Charlie+Dana).
- **Anti-gaming constants source:** Epic 7 retro — self-like block, rapid-fire 60s/10, repeat-pair 10min/5, quality gate 10 chars. Daily cap (`DAILY_CAP_POINTS: 100`) is a new value — review before Story 8.1 ships.

### Testing Strategy

**Hybrid two-layer approach:**

| Layer           | File                                   | Redis              | When runs         | Min tests                                                                                                                                                                                                             |
| --------------- | -------------------------------------- | ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | `src/lib/points-lua-runner.test.ts`    | Mocked             | Always (no deps)  | ~10 — awarded branch, each of 5 rejected-reason branches, mock call shape, return type parsing by index, `server-only` guard                                                                                          |
| Lua integration | `src/lib/lua/award-points-lua.test.ts` | Real (`REDIS_URL`) | CI + local opt-in | 8 — duplicate block, self block, rapid-fire at-threshold, rapid-fire over-threshold, repeat-pair at-threshold, daily cap block, successful award (newTotal + leaderboardScore correct), ZSET key expires after window |

**Unit test mock contract:**
Mock must match the documented positional return contract — enforced with a TypeScript type assertion, not a bare `vi.fn()`:

```ts
const mockAwardPoints = vi.fn().mockResolvedValue([1, "ok", 100, 150] as AwardPointsResult);
```

**Lua integration test — window simulation:**
`vi.useFakeTimers()` does NOT fake `redis.call('TIME')` inside the Lua script. To simulate sliding windows in integration tests, seed ZSET scores directly with past timestamps:

```ts
// Simulate 10 rapid-fire reactions already in window
await redis.zadd(`points:rapid:${actorId}`, now - 30, 'r1', now - 20, 'r2', ...);
```

`vi.useFakeTimers()` is reserved for TypeScript-layer date logic only — e.g., testing UTC date string rollover in `new Date().toISOString().slice(0, 10)`.

**Lua integration test — CI setup:**
Tests guarded with:

```ts
describe.skipIf(!process.env.REDIS_URL)("award-points.lua integration", () => {
  if (!process.env.REDIS_URL) {
    console.warn("⚠️  REDIS_URL not set — Lua integration tests skipped");
  }
  // ...
});
```

CI file to edit: `.github/workflows/test.yml`. Add Redis service:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
env:
  REDIS_URL: redis://localhost:6379
```

**`vi.useFakeTimers()` scope:** TypeScript wrapper tests only (UTC date string, daily cap key format). Never for Lua window logic — use ZSET score seeding instead.

### Notes

- This is a prototype only — `points-lua-runner.ts` will NOT be used by Story 8.1 directly. Story 8.1 will implement production `PointsService`. The prototype proves the pattern and validates the key design.
- `platform_points_ledger` + `platform_points_rules` schema is a parallel prep task (Winston + Charlie) — NOT part of this spike.
- Daily cap key uses UTC date to avoid timezone-dependent rollover inconsistencies across server restarts or deployments.

**`docs/decisions/redis-lua-spike.md` — required section structure:**

```
## Overview
## Redis Key Design
## Lua Script: award-points.lua
### 7-Step Atomic Flow
### ARGV Contract
### Return Value Contract
## defineCommand Pattern
## CI Integration
## Known Gaps & Deferred Items
```

**`docs/decisions/anti-gaming-test-strategy.md` — required section structure:**

```
## Overview
## Layer 1: Unit Tests (Mocked Redis)
### Mock Contract
### Coverage Requirements
## Layer 2: Lua Integration Tests (Real Redis)
### CI Setup
### Window Simulation: ZSET Score Seeding
### vi.useFakeTimers() Scope
## Anti-Patterns to Avoid
```
