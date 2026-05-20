/**
 * Match scoring types and utilities — shared contract for P-4.5 placeholder heuristic
 * and Epic 7 full matching engine.
 *
 * The MatchScoreResult shape is the forward-compatibility contract:
 * Epic 7 replaces computeMatchScore() internals but preserves this type exactly.
 */

/**
 * @deprecated Use MatchScoreResultV2 for Epic 7+ consumers.
 * V1 shape retained for backward compatibility during transition.
 * Will be removed once all consumers migrate to V2.
 */
export interface MatchScoreResult {
  score: number;
  tier: "strong" | "good" | "fair" | "none";
  signals: {
    skillsOverlap: number;
    locationMatch: boolean;
    /** @deprecated Epic 7 — always true. Suppressed from hints and popover. Remove when all consumers migrate to MatchScoreResultV2. */
    employmentTypeMatch: boolean;
  };
}

/**
 * Single source of truth for tier boundaries.
 * Epic 7 may adjust these values; all consumers should import from here.
 */
export const MATCH_TIERS = {
  STRONG: { min: 75, label: "strong" as const },
  GOOD: { min: 50, label: "good" as const },
  FAIR: { min: 30, label: "fair" as const },
  NONE: { min: 0, label: "none" as const },
} as const;

/**
 * Maps a numeric score (0–100) to a tier label.
 * Uses MATCH_TIERS boundaries as the single source of truth.
 */
export function getMatchTier(score: number): MatchScoreResult["tier"] {
  if (score >= MATCH_TIERS.STRONG.min) return "strong";
  if (score >= MATCH_TIERS.GOOD.min) return "good";
  if (score >= MATCH_TIERS.FAIR.min) return "fair";
  return "none";
}

// ============================================================
// Epic 7 — V2 Scoring Contract
// ============================================================

/**
 * Signal weights for match scoring. Single source of truth.
 * Values represent max points per signal. Total MUST equal 100.
 * Score range: 0–100 (weighted sum of normalized signals × weights).
 */
export const MATCH_SIGNAL_WEIGHTS = {
  skills: 50,
  location: 20,
  experience: 15,
  salary: 10,
  culturalFit: 5,
} as const satisfies Record<string, number>;

/** Union of all active signal keys, derived from MATCH_SIGNAL_WEIGHTS. */
export type MatchSignalKey = keyof typeof MATCH_SIGNAL_WEIGHTS;

/** Display order for signal breakdowns (highest weight first). */
export const MATCH_SIGNAL_ORDER: readonly MatchSignalKey[] = [
  "skills",
  "location",
  "experience",
  "salary",
  "culturalFit",
] as const;

/**
 * V2 per-signal scores. Each field is a normalized ratio in [0, 1]
 * representing how well the candidate matches on that dimension.
 *
 * Final composite score = Σ(signal × weight) across all keys, yielding 0–100.
 *
 * @invariant All values are in the range [0, 1] inclusive.
 * @invariant Keys must exactly match `MatchSignalKey` (compile-time enforced).
 */
export interface MatchSignalsV2 {
  /** Jaccard or weighted overlap of skill tags. */
  skills: number;
  /** Geo/remote proximity score (replaces V1 boolean). */
  location: number;
  /** Years-of-experience fit curve. */
  experience: number;
  /** Salary band overlap ratio. */
  salary: number;
  /**
   * Culture-tag overlap or verification indicator.
   * Returns 0.5 (neutral) when profile verification data is incomplete.
   */
  culturalFit: number;
}

export interface MatchScoreResultV2 {
  /** Weighted composite score, 0–100. */
  score: number;
  /** Tier derived from score via MATCH_TIERS boundaries. */
  tier: "strong" | "good" | "fair" | "none";
  /** Normalized per-signal scores. */
  signals: MatchSignalsV2;
}

// Compile-time key-sync assertion: TypeScript errors if MatchSignalsV2 and MatchSignalKey diverge.
// Uses a const binding so the check is evaluated at compile time (bare type aliases are not enforced).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertSignalWeightSync: [keyof MatchSignalsV2] extends [MatchSignalKey]
  ? [MatchSignalKey] extends [keyof MatchSignalsV2]
    ? true
    : never
  : never = true;

// ============================================================
// Epic 7 — Hint System Contract (Story 7.1 implementation scope)
// ============================================================

/** Role context for hint/signal rendering. */
export type MatchRole = "seeker" | "employer";

/**
 * V2 hint shape. Replaces V1 `MatchHint` when `getMatchHints` is rewritten in Story 7.1.
 * - Seeker hints: actionable wording, no interpolation params.
 * - Employer hints: informational wording, may include interpolation params.
 */
export interface MatchHintV2 {
  signal: MatchSignalKey;
  /** i18n message key relative to the role namespace (e.g., "hintSkills" → Portal.match.seeker.hintSkills). */
  messageKey: string;
  /** Normalized signal score, [0, 1]. */
  value: number;
  /** Max points from MATCH_SIGNAL_WEIGHTS for this signal. */
  weight: number;
  /** Interpolation params for employer-facing strings (e.g., { matched: 3, required: 6 }). */
  params?: Record<string, string | number>;
}

/**
 * V2 hint derivation — Story 7.1 implementation scope.
 * Returns hints sorted by improvement impact (lowest signal value × weight first).
 *
 * @param signals - Normalized V2 signals from MatchScoreResultV2
 * @param role - "seeker" for actionable hints, "employer" for informational signals
 * @param maxHints - Max hints (default: 2 for seeker, 3 for employer)
 */
export declare function getMatchHintsV2(
  signals: MatchSignalsV2,
  role: MatchRole,
  maxHints?: number,
): MatchHintV2[];
