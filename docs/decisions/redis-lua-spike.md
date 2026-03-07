# ADR: Redis + Lua Spike — Points Engine Pre-Epic-8 Prototype

**Date:** 2026-03-07
**Status:** Accepted
**Owner:** Winston (Architect)
**Context:** Epic 8's points engine requires atomic Redis operations (idempotent increment, sliding-window anti-gaming, daily cap, leaderboard) that the current pipeline-based rate-limiter pattern cannot safely provide. This spike proves the `defineCommand` pattern, key design, and Vitest mock strategy so Story 8.1 can be implemented without discovery work.

---

## Overview

A single Lua script (`award-points.lua`) handles all anti-gaming checks atomically within a single Redis transaction. It is registered on the ioredis client via `defineCommand()` as a named method, so no raw `eval()` call sites exist in production code.

**Hard infrastructure requirement:** Redis ≥ 7.0. `os.date("!%Y-%m-%d")` is restricted in the Redis 6 Lua sandbox (`ERR user_script: Script attempted to access nonexistent global variable 'os'`). CI uses `redis:7-alpine`.

---

## Redis Key Design

| Key                                        | Redis Type | Purpose                                              | TTL                                |
| ------------------------------------------ | ---------- | ---------------------------------------------------- | ---------------------------------- |
| `points:user:{userId}`                     | STRING     | Cumulative all-time counter (INCRBY)                 | none                               |
| `points:leaderboard`                       | ZSET       | All-time rankings (ZINCRBY)                          | none                               |
| `points:idempotency:{compositeKey}`        | STRING     | Dedup flag — deterministic per event type            | 24h                                |
| `points:rapid:{actorId}`                   | ZSET       | Rapid-fire sliding window (timestamps as scores)     | auto via ZREMRANGEBYSCORE + EXPIRE |
| `points:repeat:{actorId}:{contentOwnerId}` | ZSET       | Repeat-pair sliding window — keyed by content owner  | auto via ZREMRANGEBYSCORE + EXPIRE |
| `points:daily:{earnerUserId}:{YYYY-MM-DD}` | STRING     | Daily cap on points EARNED — UTC date, earner userId | EXPIREAT next UTC midnight         |

### Idempotency Key Formulas (deterministic — not random UUIDs)

| Event               | Idempotency key                                  |
| ------------------- | ------------------------------------------------ |
| `post.reacted`      | `points:idempotency:reaction:{postId}:{actorId}` |
| `event.attended`    | `points:idempotency:attended:{eventId}:{userId}` |
| `article.published` | `points:idempotency:article:{articleId}`         |

**Why deterministic?** If the emitter generates a new UUID per emission, a user who unreacts and re-reacts gets a fresh key and bypasses the dedup gate. A composite key derived from stable identifiers prevents re-earning regardless of how many times the event is emitted.

### contentOwnerId semantics

The `repeatKey` is `points:repeat:{actorId}:{contentOwnerId}`. Callers must pass:

- `post.reacted` → `contentOwnerId = authorId` (post author)
- `event.attended` → `contentOwnerId = hostId` (event creator)

---

## Lua Script: award-points.lua

Script location: `src/lib/lua/award-points.lua`
Loaded at module init via `fs.readFileSync`. Included in standalone build via `next.config.ts outputFileTracingIncludes`.

### KEYS/ARGV Contract

```
KEYS[1] = points:idempotency:{compositeKey}
KEYS[2] = points:rapid:{actorId}
KEYS[3] = points:repeat:{actorId}:{contentOwnerId}
KEYS[4] = points:daily:{earnerUserId}  ← utcDate appended INSIDE script
KEYS[5] = points:leaderboard
KEYS[6] = points:user:{earnerUserId}

ARGV[1] = actorId        (string)
ARGV[2] = earnerUserId   (string)
ARGV[3] = amount         (number)
ARGV[4] = rapidThreshold (number)
ARGV[5] = rapidWindowSec (number)
ARGV[6] = repeatThreshold(number)
ARGV[7] = repeatWindowSec(number)
ARGV[8] = dailyCap       (number)
```

### 7-Step Atomic Flow

```
Step 0 — ARGV validation
  All KEYS/ARGV non-nil/non-empty. Return error("invalid args") if any fail.
  No Redis keys are touched if inputs are malformed.

Step 1 — Idempotency
  SET idempotencyKey '1' NX EX 86400
  → nil means key existed → return {0, "duplicate", 0, 0}

Step 2 — Self-award block
  if actorId == earnerUserId → return {0, "self", 0, 0}

Step 3 — Rapid-fire window
  now = TIME[1] (seconds), us = TIME[2] (microseconds)
  ZREMRANGEBYSCORE rapidKey 0 (now - rapidWindowSec)
  if ZCARD >= rapidThreshold → return {0, "rapid_fire", 0, 0}
  ZADD rapidKey now "{now}:{us}"   ← unique member prevents same-second collision
  EXPIRE rapidKey rapidWindowSec   ← ZSET TTL hardening

Step 4 — Repeat-pair window
  Same pattern with repeatKey, repeatThreshold, repeatWindowSec.

Step 5 — Daily cap
  utcDate = os.date("!%Y-%m-%d")   ← "!" forces UTC
  GET daily:{earnerUserId}:{utcDate}
  if count >= dailyCap → return {0, "daily_cap", 0, 0}

Step 6 — Increment
  INCRBY user:{earnerUserId} amount
  INCRBY daily:{earnerUserId}:{utcDate} amount  ← tracks points, not award count
  midnight = (floor(now/86400) + 1) * 86400    ← floor+1, NOT ceil (avoids instant-expiry at midnight boundary)
  EXPIREAT daily key midnight

Step 7 — Leaderboard
  ZINCRBY leaderboard amount earnerUserId
  return {1, "ok", newTotal, leaderboardScore}
```

### Return Value Contract

**Positional flat array — NOT a hash table.**

```
[0] awarded:          0 | 1
[1] reason:           "ok" | "duplicate" | "self" | "rapid_fire" | "repeat_pair" | "daily_cap"
[2] newTotal:         earner's cumulative points:user:{userId} value
[3] leaderboardScore: earner's current points:leaderboard score
```

**Critical:** ioredis parses Lua hash tables (associative arrays) incorrectly as JS objects with numeric string keys. Always use positional flat arrays. TypeScript reads results by index: `result[0]`, `result[1]`, etc.

### ZSET TTL Hardening

After each `ZADD` to a sliding-window ZSET, call `EXPIRE {key} {windowSeconds}`. Keys self-destruct if no new activity arrives within the window. Without this, `points:repeat:{actorId}:{contentOwnerId}` keys grow at O(users²) scale and never expire.

---

## defineCommand Pattern

```ts
// In src/lib/points-lua-runner.ts
import fs from "fs";
import path from "path";

let luaScript: string;
try {
  luaScript = fs.readFileSync(path.join(process.cwd(), "src/lib/lua/award-points.lua"), "utf-8");
} catch (err) {
  throw new Error(
    `award-points.lua not found — check next.config.ts outputFileTracingIncludes: ${err}`,
  );
}

export function initPointsLuaCommands(redis: Redis): void {
  if (!(redis as unknown as Record<string, unknown>).awardPoints) {
    redis.defineCommand("awardPoints", { numberOfKeys: 6, lua: luaScript });
  }
}
```

**Idempotency guard:** Check `if (!(redis as any).awardPoints)` before registering. Prevents duplicate registration on Next.js HMR and multiple module loads.

**TypeScript module augmentation:**

```ts
declare module "ioredis" {
  interface Redis {
    awardPoints(numberOfKeys: number, ...keysAndArgv: unknown[]): Promise<AwardPointsResult>;
  }
}
```

**Calling example — post.reacted:**

```ts
await awardPoints({
  idempotencyKey: `reaction:${postId}:${actorId}`,
  actorId,
  earnerUserId: authorId,
  contentOwnerId: authorId,
  amount: 5,
});
```

**Calling example — event.attended:**

```ts
await awardPoints({
  idempotencyKey: `attended:${eventId}:${userId}`,
  actorId: userId,
  earnerUserId: hostId,
  contentOwnerId: hostId,
  amount: 10,
});
```

---

## CI Integration

Add to `.github/workflows/test.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine # ← MUST be 7+; os.date is restricted in Redis 6
    ports:
      - 6379:6379
    options: --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 3s --health-retries 5
env:
  REDIS_URL: redis://localhost:6379
```

Integration tests are guarded with `describe.skipIf(!process.env.REDIS_URL)` so they pass silently without a Redis connection locally.

---

## Known Gaps & Deferred Items

- **Leaderboard ghost scores:** When a user is suspended or deleted, `points:leaderboard` retains their score. Story 8.1 must emit a `ZREM points:leaderboard {userId}` cleanup on `account.status_changed` and `member.anonymized` events.
- **Production `PointsService`:** This spike is a prototype only — `points-lua-runner.ts` is NOT wired to EventBus subscribers. Story 8.1 implements the production service.
- **`platform_points_ledger` + `platform_points_rules` schema:** Parallel prep task (Winston + Charlie) — not part of this spike.
- **`streamToBuffer` analogy for large payloads:** If points payloads grow (e.g., bulk award), consider batching ARGV via a secondary sorted-set pre-load pattern rather than a single large Lua call.

---

## Do Not

- **Do NOT use raw `eval()`** — use `defineCommand` instead. Raw eval has no script caching and requires managing SHA hashes manually.
- **Do NOT use server-supplied timestamps as ARGV** — always use `redis.call('TIME')` inside Lua to eliminate multi-container clock skew.
- **Do NOT use SETNX + EXPIRE (two commands)** — use `SET key val NX EX seconds` (single atomic command) for idempotency keys. SETNX+EXPIRE has a TOCTOU gap.
- **Do NOT return Lua hash tables** — ioredis parses them incorrectly. Always return positional flat arrays.
- **Do NOT use `math.ceil(now/86400)*86400` for midnight** — at exact UTC midnight, `ceil(n)=n`, causing instant key expiry. Use `(floor(n/86400)+1)*86400`.
