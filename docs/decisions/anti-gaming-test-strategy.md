# ADR: Anti-Gaming Points Engine Test Strategy

**Date:** 2026-03-07
**Status:** Accepted
**Owner:** Winston (Architect)
**Context:** The points engine uses Redis Lua scripts with sliding-window ZSET logic that cannot be tested with standard `vi.useFakeTimers()` or `ioredis-mock`. This document defines the two-layer hybrid testing approach.

---

## Overview

The points engine test suite uses a **two-layer hybrid approach**:

| Layer           | File                                   | Redis              | When runs         | Min tests |
| --------------- | -------------------------------------- | ------------------ | ----------------- | --------- |
| Unit            | `src/lib/points-lua-runner.test.ts`    | Mocked             | Always (no deps)  | 10        |
| Lua integration | `src/lib/lua/award-points-lua.test.ts` | Real (`REDIS_URL`) | CI + local opt-in | 8         |

---

## Layer 1: Unit Tests (Mocked Redis)

### Mock Contract

The Redis mock must return a type-asserted `AwardPointsResult` — never a bare `vi.fn()` without a return value:

```ts
// @vitest-environment node
const mockAwardPoints = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({ defineCommand: vi.fn(), awardPoints: mockAwardPoints }),
}));

// In tests — always type-assert:
mockAwardPoints.mockResolvedValue([1, "ok", 100, 150] as AwardPointsResult);
```

**Why type assertion?** Enforces the positional return contract at the test boundary. A bare `vi.fn()` returns `undefined`, which breaks TypeScript and hides index-access bugs (e.g., `result[2]` silently returning `undefined` instead of a number).

### Coverage Requirements

Minimum 10 unit tests covering:

1. `awarded=1` branch — returns parsed `AwardPointsResult`
2. `reason="duplicate"` → `awarded=0`
3. `reason="self"` → `awarded=0`
4. `reason="rapid_fire"` → `awarded=0`
5. `reason="repeat_pair"` → `awarded=0`
6. `reason="daily_cap"` → `awarded=0`
7. `awardPoints` called with correct KEYS array (6 keys in right order)
8. `awardPoints` called with correct ARGV values from `POINTS_CONFIG`
9. `AwardPointsResult[2]` (newTotal) returned as number
10. `initPointsLuaCommands` calls `defineCommand` exactly once with `numberOfKeys: 6`

### Mock Reset Policy

Use `vi.clearAllMocks()` in `beforeEach` — **never `vi.resetAllMocks()`**.
`vi.resetAllMocks()` clears the mock return values set inside `vi.mock()` factory functions, breaking all tests that rely on factory-level defaults.

---

## Layer 2: Lua Integration Tests (Real Redis)

### CI Setup

Integration tests require `REDIS_URL` to be set. Guard all tests:

```ts
describe.skipIf(!process.env.REDIS_URL)("award-points.lua integration", () => {
  if (!process.env.REDIS_URL) {
    console.warn("⚠️  REDIS_URL not set — Lua integration tests skipped");
  }
  // ...
});
```

Add to `.github/workflows/test.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine # MUST be 7+; os.date is restricted in Redis 6
    ports:
      - 6379:6379
    options: --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 3s --health-retries 5
env:
  REDIS_URL: redis://localhost:6379
```

### Coverage Requirements

Minimum 8 integration tests:

1. Duplicate idempotency key → `[0, "duplicate", ...]` + points:user incremented only once
2. `actorId === earnerUserId` → `[0, "self", ...]` + no Redis keys modified
3. Rapid-fire at threshold-1 (seed 9 entries, 10th passes) — boundary test
4. Rapid-fire over threshold (seed 10 entries) → `[0, "rapid_fire", ...]`
5. Repeat-pair at threshold-1 (seed 4, 5th passes) — boundary test
6. Repeat-pair over threshold (seed 5) → `[0, "repeat_pair", ...]`
7. Daily cap reached → `[0, "daily_cap", ...]`
8. Successful award → `[1, "ok", newTotal, leaderboardScore]` + TTL check on daily key

### Window Simulation: ZSET Score Seeding

`vi.useFakeTimers()` does **NOT** fake `redis.call('TIME')` inside the Lua script. To simulate full sliding windows in integration tests, seed ZSET scores directly with past timestamps:

```ts
// Simulate 10 rapid-fire reactions already in the window (now - 30s)
const now = Math.floor(Date.now() / 1000);
const members: (string | number)[] = [];
for (let i = 1; i <= 10; i++) {
  members.push(now - 30, `seed-${i}`); // score, member
}
await redis.zadd(`points:rapid:${actorId}`, ...members);
```

Members must be **unique strings** (e.g., `"seed-1"`, `"seed-2"`) to match the Lua script's ZADD uniqueness pattern (`"{now}:{us}"`). Non-unique members would be overwritten by ZADD and produce incorrect ZCARD counts.

### Cleanup Policy

**Do NOT use `redis.flushall()` in `afterEach`** — shared Redis instances may have unrelated keys.

Use a unique `testId = randomUUID().slice(0, 8)` prefix per describe block and delete keys explicitly:

```ts
const testId = randomUUID().slice(0, 8);
const actorId = `actor-${testId}`;
const earnerUserId = `earner-${testId}`;

afterEach(async () => {
  await redis.del(
    `points:idempotency:reaction:${testPostId}:${actorId}`,
    `points:rapid:${actorId}`,
    `points:repeat:${actorId}:${earnerUserId}`,
    `points:user:${earnerUserId}`,
    `points:daily:${earnerUserId}:${new Date().toISOString().slice(0, 10)}`,
  );
  await redis.zrem("points:leaderboard", earnerUserId);
});
```

### `vi.useFakeTimers()` Scope

`vi.useFakeTimers()` is reserved for **TypeScript-layer date logic only** — e.g., testing UTC date string rollover in `new Date().toISOString().slice(0, 10)` or verifying daily key label format.

**Never use `vi.useFakeTimers()` to simulate Redis TIME** — it has no effect on `redis.call('TIME')` inside the Lua sandbox. Use ZSET score seeding (above) instead.

---

## Anti-Patterns to Avoid

| Anti-pattern                                        | Problem                                                  | Correct approach                                           |
| --------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `ioredis-mock` for Lua integration                  | Mock doesn't run Lua — all calls succeed unconditionally | Use real Redis with `REDIS_URL` guard                      |
| `vi.useFakeTimers()` for Redis window logic         | Doesn't affect `redis.call('TIME')`                      | Seed ZSET scores with past timestamps                      |
| Bare `vi.fn()` without type assertion               | `result[0]` silently returns `undefined`                 | `mockResolvedValue([1,'ok',100,150] as AwardPointsResult)` |
| `redis.flushall()` in afterEach                     | Destroys shared state, brittle in parallel test runs     | Delete specific keys by prefix                             |
| Non-unique ZADD members (e.g. same string repeated) | ZADD updates score of existing member, ZCARD stays at 1  | Use unique member strings per entry                        |
| `vi.resetAllMocks()` in `beforeEach`                | Clears factory mock return values                        | Use `vi.clearAllMocks()` instead                           |
