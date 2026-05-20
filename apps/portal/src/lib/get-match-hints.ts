import type { MatchScoreResult } from "@igbo/config";

export interface MatchHint {
  signal: "skills" | "location";
  messageKey: "hintSkills" | "hintLocation";
}

/** Maximum possible skills score from computeMatchScore (60% weight). */
export const SKILLS_MAX_SCORE = 60;

/** Skills overlap >= this threshold shows a checkmark. */
export const SKILLS_CHECKMARK_THRESHOLD = SKILLS_MAX_SCORE * 0.5; // 30

/**
 * Derives 0–2 improvement hints from match signals.
 *
 * Rules:
 * - Skills priority: always included if normalized contribution < 0.5
 * - Remaining slots filled from weakest boolean signals (false = 0.0)
 * - Max 2 hints total
 *
 * Note: employmentTypeMatch is deprecated (always true per PREP-M1 §5.3) and
 * suppressed from hints. Epic 7 hint rewrite (Story 7.1) uses getMatchHintsV2.
 */
export function getMatchHints(signals: MatchScoreResult["signals"]): MatchHint[] {
  const hints: MatchHint[] = [];
  // Skills priority rule — uses same threshold as checkmark display
  if (signals.skillsOverlap < SKILLS_CHECKMARK_THRESHOLD) {
    hints.push({ signal: "skills", messageKey: "hintSkills" });
  }

  // Fill remaining slot from location signal
  if (hints.length < 2 && !signals.locationMatch) {
    hints.push({ signal: "location", messageKey: "hintLocation" });
  }

  return hints;
}
