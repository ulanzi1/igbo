/**
 * Match scoring types and utilities — shared contract for P-4.5 placeholder heuristic
 * and Epic 7 full matching engine.
 *
 * The MatchScoreResult shape is the forward-compatibility contract:
 * Epic 7 replaces computeMatchScore() internals but preserves this type exactly.
 */

export interface MatchScoreResult {
  score: number;
  tier: "strong" | "good" | "fair" | "none";
  signals: {
    skillsOverlap: number;
    locationMatch: boolean;
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
