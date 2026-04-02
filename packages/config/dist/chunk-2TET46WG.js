// src/points.ts
var POINTS_CONFIG = {
  // Sliding window anti-gaming
  RAPID_FIRE_WINDOW_SEC: 60,
  RAPID_FIRE_THRESHOLD: 10,
  // max reactions per actorId per window
  REPEAT_PAIR_WINDOW_SEC: 600,
  // 10 minutes
  REPEAT_PAIR_THRESHOLD: 5,
  // max reactions per actorId:contentOwnerId pair per window
  // Quality gate — post body chars stripped of whitespace (enforced in TS layer, not Lua)
  QUALITY_GATE_MIN_CHARS: 10,
  // Default fallback — runtime value read from platform_settings key "daily_cap_points"
  DAILY_CAP_POINTS: 100
  // total points earnable per UTC day (not award count)
};
var BADGE_MULTIPLIERS = {
  blue: 3,
  red: 6,
  purple: 10
};

export {
  POINTS_CONFIG,
  BADGE_MULTIPLIERS
};
