declare const POINTS_CONFIG: {
  readonly RAPID_FIRE_WINDOW_SEC: 60;
  readonly RAPID_FIRE_THRESHOLD: 10;
  readonly REPEAT_PAIR_WINDOW_SEC: 600;
  readonly REPEAT_PAIR_THRESHOLD: 5;
  readonly QUALITY_GATE_MIN_CHARS: 10;
  readonly DAILY_CAP_POINTS: 100;
};
type PointsConfigKey = keyof typeof POINTS_CONFIG;
/** Badge multipliers — single source of truth for points-engine and VerificationBadge tooltip */
declare const BADGE_MULTIPLIERS: {
  readonly blue: 3;
  readonly red: 6;
  readonly purple: 10;
};
type BadgeMultiplierKey = keyof typeof BADGE_MULTIPLIERS;

export { BADGE_MULTIPLIERS, type BadgeMultiplierKey, POINTS_CONFIG, type PointsConfigKey };
