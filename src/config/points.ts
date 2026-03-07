// NOTE: Key names were changed from the pre-spike prototype during the Redis+Lua spike (2026-03-07):
//   RAPID_FIRE_WINDOW_MS  → RAPID_FIRE_WINDOW_SEC  (Lua scripts use seconds, not milliseconds)
//   RAPID_FIRE_MAX_REACTIONS → RAPID_FIRE_THRESHOLD
//   REPEAT_PAIR_WINDOW_MS → REPEAT_PAIR_WINDOW_SEC
//   REPEAT_PAIR_MAX_POSTS → REPEAT_PAIR_THRESHOLD
//   MIN_CONTENT_LENGTH_FOR_POINTS → QUALITY_GATE_MIN_CHARS
//   BLOCK_SELF_ACTION removed — self-block is enforced directly in the Lua script (Step 1)
//   DAILY_CAP_POINTS added (new — review value with PO before Story 8.1)
// Any Story 8.1 planning artifacts referencing the old names must be updated.
export const POINTS_CONFIG = {
  // Sliding window anti-gaming
  RAPID_FIRE_WINDOW_SEC: 60,
  RAPID_FIRE_THRESHOLD: 10, // max reactions per actorId per window
  REPEAT_PAIR_WINDOW_SEC: 600, // 10 minutes
  REPEAT_PAIR_THRESHOLD: 5, // max reactions per actorId:contentOwnerId pair per window
  // Quality gate — post body chars stripped of whitespace (enforced in TS layer, not Lua)
  QUALITY_GATE_MIN_CHARS: 10,
  // [REVIEW] validate DAILY_CAP_POINTS value with PO before Story 8.1 ships
  DAILY_CAP_POINTS: 100, // total points earnable per UTC day (not award count)
} as const;

export type PointsConfigKey = keyof typeof POINTS_CONFIG;
