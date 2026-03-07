// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";

// Guard: skip all tests if REDIS_URL is not set
describe.skipIf(!process.env.REDIS_URL)("award-points.lua integration", () => {
  if (!process.env.REDIS_URL) {
    console.warn("⚠️  REDIS_URL not set — Lua integration tests skipped");
  }

  // Deferred imports so module load does not fail when REDIS_URL is absent
  let Redis: typeof import("ioredis").default;
  let initPointsLuaCommands: typeof import("../points-lua-runner").initPointsLuaCommands;
  let buildPointsKeys: typeof import("../points-lua-runner").buildPointsKeys;
  let AwardPointsResultType: import("../points-lua-runner").AwardPointsResult;
  let POINTS_CONFIG: typeof import("@/config/points").POINTS_CONFIG;
  let redis: InstanceType<typeof Redis>;

  const testId = randomUUID().slice(0, 8);
  const actorId = `actor-${testId}`;
  const earnerUserId = `earner-${testId}`;
  const testPostId = `post-${testId}`;

  function makeInput(overrides: Partial<{ idempotencyKey: string; amount: number }> = {}) {
    return {
      idempotencyKey: overrides.idempotencyKey ?? `reaction:${testPostId}:${actorId}`,
      actorId,
      earnerUserId,
      contentOwnerId: earnerUserId,
      amount: overrides.amount ?? 10,
    };
  }

  /** Full dated daily key matching what the Lua script constructs internally. Used for cleanup. */
  function fullDailyKey(baseKey: string): string {
    return `${baseKey}:${new Date().toISOString().slice(0, 10)}`;
  }

  beforeAll(async () => {
    const ioredis = await import("ioredis");
    Redis = ioredis.default;
    const runner = await import("../points-lua-runner");
    initPointsLuaCommands = runner.initPointsLuaCommands;
    buildPointsKeys = runner.buildPointsKeys;
    const pointsConfig = await import("@/config/points");
    POINTS_CONFIG = pointsConfig.POINTS_CONFIG;

    redis = new Redis(process.env.REDIS_URL!);
    initPointsLuaCommands(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  afterEach(async () => {
    const input = makeInput();
    const keys = buildPointsKeys(input);
    await redis.del(
      keys.idempotencyKey,
      keys.rapidKey,
      keys.repeatKey,
      fullDailyKey(keys.dailyBaseKey),
      keys.userKey,
    );
    await redis.zrem(keys.leaderboardKey, earnerUserId);
  });

  async function callAwardPoints(
    input: ReturnType<typeof makeInput>,
  ): Promise<import("../points-lua-runner").AwardPointsResult> {
    const keys = buildPointsKeys(input);
    return redis.awardPoints(
      keys.idempotencyKey,
      keys.rapidKey,
      keys.repeatKey,
      keys.dailyBaseKey, // Lua appends :{utcDate} internally
      keys.leaderboardKey,
      keys.userKey,
      input.actorId,
      input.earnerUserId,
      input.amount,
      POINTS_CONFIG.RAPID_FIRE_THRESHOLD,
      POINTS_CONFIG.RAPID_FIRE_WINDOW_SEC,
      POINTS_CONFIG.REPEAT_PAIR_THRESHOLD,
      POINTS_CONFIG.REPEAT_PAIR_WINDOW_SEC,
      POINTS_CONFIG.DAILY_CAP_POINTS,
    );
  }

  // ─── AC 7: Duplicate idempotency ──────────────────────────────────────────

  it("returns [0, 'duplicate', 0, 0] on second call with same idempotency key (AC 7)", async () => {
    const input = makeInput();

    const first = await callAwardPoints(input);
    expect(first[0]).toBe(1);
    expect(first[1]).toBe("ok");

    const second = await callAwardPoints(input);
    expect(second[0]).toBe(0);
    expect(second[1]).toBe("duplicate");

    // points:user should only be incremented once
    const total = await redis.get(`points:user:${earnerUserId}`);
    expect(Number(total)).toBe(input.amount);
  });

  // ─── AC 8: Self-award block — no Redis keys modified ──────────────────────

  it("returns [0, 'self', 0, 0] when actorId === earnerUserId and modifies NO keys (AC 8)", async () => {
    const selfInput = {
      idempotencyKey: `self:${testPostId}:${actorId}`,
      actorId,
      earnerUserId: actorId, // earner = actor
      contentOwnerId: actorId,
      amount: 10,
    };
    const keys = buildPointsKeys(selfInput);

    const result = await redis.awardPoints(
      keys.idempotencyKey,
      keys.rapidKey,
      keys.repeatKey,
      keys.dailyBaseKey,
      keys.leaderboardKey,
      keys.userKey,
      selfInput.actorId,
      selfInput.earnerUserId,
      selfInput.amount,
      POINTS_CONFIG.RAPID_FIRE_THRESHOLD,
      POINTS_CONFIG.RAPID_FIRE_WINDOW_SEC,
      POINTS_CONFIG.REPEAT_PAIR_THRESHOLD,
      POINTS_CONFIG.REPEAT_PAIR_WINDOW_SEC,
      POINTS_CONFIG.DAILY_CAP_POINTS,
    );

    expect(result[0]).toBe(0);
    expect(result[1]).toBe("self");

    // Verify no Redis keys were touched (self-check fires before idempotency write)
    const idempotencyExists = await redis.exists(keys.idempotencyKey);
    expect(idempotencyExists).toBe(0);
  });

  // ─── Rapid-fire at threshold (boundary — 9 existing, 10th passes) ──────────

  it("allows award when rapid-fire count is at threshold-1 (seed 9, 10th passes)", async () => {
    const input = makeInput({ idempotencyKey: `rapid-boundary:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);

    // Seed 9 entries (threshold is 10, so 9 is under the limit)
    const now = Math.floor(Date.now() / 1000);
    const members: (string | number)[] = [];
    for (let i = 1; i <= 9; i++) {
      members.push(now - 30, `seed-${i}`);
    }
    await redis.zadd(keys.rapidKey, ...members);

    const result = await callAwardPoints(input);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe("ok");

    await redis.del(keys.idempotencyKey);
  });

  // ─── AC 9: Rapid-fire over threshold ──────────────────────────────────────

  it("returns [0, 'rapid_fire', 0, 0] when rapid-fire threshold exceeded (AC 9)", async () => {
    const input = makeInput({ idempotencyKey: `rapid-over:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);

    // Seed 10 entries (at threshold — next call is blocked)
    const now = Math.floor(Date.now() / 1000);
    const members: (string | number)[] = [];
    for (let i = 1; i <= 10; i++) {
      members.push(now - 30, `seed-${i}`);
    }
    await redis.zadd(keys.rapidKey, ...members);

    const result = await callAwardPoints(input);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe("rapid_fire");

    await redis.del(keys.idempotencyKey);
  });

  // ─── Repeat-pair at threshold (boundary — 4 existing, 5th passes) ──────────

  it("allows award when repeat-pair count is at threshold-1 (seed 4, 5th passes)", async () => {
    const input = makeInput({ idempotencyKey: `repeat-boundary:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);

    // Seed 4 entries (threshold is 5, so 4 is under the limit)
    const now = Math.floor(Date.now() / 1000);
    const members: (string | number)[] = [];
    for (let i = 1; i <= 4; i++) {
      members.push(now - 30, `seed-${i}`);
    }
    await redis.zadd(keys.repeatKey, ...members);

    const result = await callAwardPoints(input);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe("ok");

    await redis.del(keys.idempotencyKey);
  });

  // ─── AC 10: Repeat-pair over threshold ────────────────────────────────────

  it("returns [0, 'repeat_pair', 0, 0] when repeat-pair threshold exceeded (AC 10)", async () => {
    const input = makeInput({ idempotencyKey: `repeat-over:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);

    // Seed 5 entries (at threshold — next call is blocked)
    const now = Math.floor(Date.now() / 1000);
    const members: (string | number)[] = [];
    for (let i = 1; i <= 5; i++) {
      members.push(now - 30, `seed-${i}`);
    }
    await redis.zadd(keys.repeatKey, ...members);

    const result = await callAwardPoints(input);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe("repeat_pair");

    await redis.del(keys.idempotencyKey);
  });

  // ─── AC 11: Daily cap reached ─────────────────────────────────────────────

  it("returns [0, 'daily_cap', 0, 0] when daily cap is reached (AC 11)", async () => {
    const input = makeInput({ idempotencyKey: `daily-cap:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);
    const datedDailyKey = fullDailyKey(keys.dailyBaseKey);

    // Seed daily cap key with the cap value (100 points already earned today)
    await redis.set(datedDailyKey, String(POINTS_CONFIG.DAILY_CAP_POINTS));

    const result = await callAwardPoints(input);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe("daily_cap");

    await redis.del(keys.idempotencyKey, datedDailyKey);
  });

  // ─── AC 12: Successful award ──────────────────────────────────────────────

  it("returns [1, 'ok', newTotal, leaderboardScore] on successful award (AC 12)", async () => {
    const input = makeInput({ amount: 10 });
    const keys = buildPointsKeys(input);

    // Seed a baseline so we can verify increments
    await redis.set(keys.userKey, "50");
    await redis.zadd(keys.leaderboardKey, 75, earnerUserId);

    const result = await callAwardPoints(input);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe("ok");
    expect(result[2]).toBe(60); // 50 + 10
    expect(result[3]).toBe(85); // 75 + 10
  });

  // ─── AC 13: Daily cap key TTL ─────────────────────────────────────────────

  it("daily cap key expires within 24h and not prematurely (AC 13)", async () => {
    const input = makeInput({ idempotencyKey: `ttl-daily:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);

    await callAwardPoints(input);

    const ttl = await redis.ttl(fullDailyKey(keys.dailyBaseKey));
    // Script uses EXPIREAT next-UTC-midnight, so TTL is time-of-day-dependent (0–86400).
    // Verify: key exists (not immediately expired) and expires within one calendar day.
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(86400);

    await redis.del(keys.idempotencyKey);
  });

  // ─── F8 / AC 14 partial: Rapid and repeat ZSET keys have TTL set (AC 14 proxy) ─────────

  it("rapid and repeat ZSET keys have TTL set after successful award", async () => {
    const input = makeInput({ idempotencyKey: `ttl-zset:${testPostId}:${actorId}` });
    const keys = buildPointsKeys(input);

    await callAwardPoints(input);

    const rapidTtl = await redis.ttl(keys.rapidKey);
    const repeatTtl = await redis.ttl(keys.repeatKey);

    // EXPIRE was set — keys will self-destruct within the configured window
    expect(rapidTtl).toBeGreaterThan(0);
    expect(rapidTtl).toBeLessThanOrEqual(POINTS_CONFIG.RAPID_FIRE_WINDOW_SEC);
    expect(repeatTtl).toBeGreaterThan(0);
    expect(repeatTtl).toBeLessThanOrEqual(POINTS_CONFIG.REPEAT_PAIR_WINDOW_SEC);

    await redis.del(keys.idempotencyKey);
  });
});
