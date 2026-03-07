// NO "server-only" — this module is used by eventbus-bridge.ts in the standalone
// realtime server. Adding server-only here would crash that process.
import fs from "fs";
import path from "path";
import type Redis from "ioredis";
import { getRedisClient } from "@/lib/redis";
import { POINTS_CONFIG } from "@/config/points";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Positional return tuple from the award-points Lua script.
 * Index contract (flat array — NOT a hash table):
 *   [0] awarded:          0 | 1
 *   [1] reason:           "ok" | "duplicate" | "self" | "rapid_fire" | "repeat_pair" | "daily_cap"
 *   [2] newTotal:         earner's cumulative points:user:{userId} value
 *   [3] leaderboardScore: earner's current points:leaderboard score
 */
export type AwardPointsResult = [
  awarded: 0 | 1,
  reason: string,
  newTotal: number,
  leaderboardScore: number,
];

/**
 * Input to awardPoints().
 * contentOwnerId is semantically "the user whose content triggered the award":
 *   - post.reacted  → authorId (post author)
 *   - event.attended → hostId  (event creator)
 */
export interface AwardPointsInput {
  idempotencyKey: string; // caller-supplied composite key (e.g. "reaction:postId:actorId")
  actorId: string; // user who performed the action
  earnerUserId: string; // user who earns the points
  contentOwnerId: string; // used for repeat-pair key (authorId or hostId)
  amount: number;
}

// ─── ioredis module augmentation ──────────────────────────────────────────────

declare module "ioredis" {
  interface Redis {
    awardPoints(
      // KEYS (numberOfKeys = 6, set in defineCommand — do NOT pass at call time)
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

// ─── Lua script loading ───────────────────────────────────────────────────────

let luaScript: string;
try {
  luaScript = fs.readFileSync(path.join(process.cwd(), "src/lib/lua/award-points.lua"), "utf-8");
} catch (err) {
  throw new Error(
    `award-points.lua not found — check next.config.ts outputFileTracingIncludes: ${err}`,
  );
}

// ─── Command registration ─────────────────────────────────────────────────────

/**
 * Register the awardPoints Lua command on a Redis instance.
 * Idempotent — safe to call on HMR and multiple module loads.
 */
export function initPointsLuaCommands(redis: Redis): void {
  if (!(redis as unknown as Record<string, unknown>).awardPoints) {
    redis.defineCommand("awardPoints", {
      numberOfKeys: 6,
      lua: luaScript,
    });
  }
}

// ─── Key builder ──────────────────────────────────────────────────────────────

/**
 * Build the Redis key set for a given AwardPointsInput.
 * Exported so integration tests can derive expected keys without duplicating logic.
 * Note: dailyBaseKey is the prefix passed as KEYS[4]; the Lua script appends :{utcDate} internally.
 */
export function buildPointsKeys(input: AwardPointsInput) {
  return {
    idempotencyKey: `points:idempotency:${input.idempotencyKey}`,
    rapidKey: `points:rapid:${input.actorId}`,
    repeatKey: `points:repeat:${input.actorId}:${input.contentOwnerId}`,
    dailyBaseKey: `points:daily:${input.earnerUserId}`, // Lua appends :{utcDate} suffix internally
    leaderboardKey: "points:leaderboard",
    userKey: `points:user:${input.earnerUserId}`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Atomically award points via the Redis Lua script.
 * Lazily initializes the awardPoints command on first call (idempotent).
 * Returns the full AwardPointsResult — callers should check result[0] === 1 for success.
 */
export async function awardPoints(input: AwardPointsInput): Promise<AwardPointsResult> {
  const redis = getRedisClient();
  // Lazy, idempotent — safe to call on every invocation; no-op if already registered.
  initPointsLuaCommands(redis);

  const { idempotencyKey, rapidKey, repeatKey, dailyBaseKey, leaderboardKey, userKey } =
    buildPointsKeys(input);

  const result = await redis.awardPoints(
    idempotencyKey,
    rapidKey,
    repeatKey,
    dailyBaseKey,
    leaderboardKey,
    userKey,
    input.actorId,
    input.earnerUserId,
    input.amount,
    POINTS_CONFIG.RAPID_FIRE_THRESHOLD,
    POINTS_CONFIG.RAPID_FIRE_WINDOW_SEC,
    POINTS_CONFIG.REPEAT_PAIR_THRESHOLD,
    POINTS_CONFIG.REPEAT_PAIR_WINDOW_SEC,
    POINTS_CONFIG.DAILY_CAP_POINTS,
  );

  return result;
}
