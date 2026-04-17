import "server-only";
import { getMatchTier } from "@igbo/config";
import type { MatchScoreResult } from "@igbo/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeekerProfile {
  skills: string[];
}

interface SeekerPreferences {
  locations: string[];
  workModes: string[];
}

interface JobPosting {
  requirements: string | null;
  location: string | null;
  employmentType: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tokenizes a string into lowercase words by splitting on whitespace and punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((t) => t.length > 0);
}

/**
 * Computes the skills overlap score (0–60).
 *
 * For each seeker skill (lowercased), check if any requirement token contains
 * the skill or the skill contains any token (substring match, case-insensitive).
 * matchCount = number of seeker skills with at least one hit.
 * Points = Math.min(60, Math.round((matchCount / Math.max(skills.length, 1)) * 60))
 */
function computeSkillsScore(skills: string[], requirements: string | null): number {
  if (skills.length === 0 || !requirements) return 0;

  const tokens = tokenize(requirements);
  let matchCount = 0;

  for (const skill of skills) {
    const skillLower = skill.toLowerCase().trim();
    if (!skillLower) continue;
    const hasHit = tokens.some((token) => token.includes(skillLower) || skillLower.includes(token));
    if (hasHit) matchCount++;
  }

  return Math.min(60, Math.round((matchCount / Math.max(skills.length, 1)) * 60));
}

/**
 * Computes the location match score (0, 15, or 25).
 *
 * 25: any seeker location entry is a substring of job location or vice versa (exact city match).
 * 15: any word from any seeker location appears in job location words (region/country match).
 * 0: no match.
 */
function computeLocationScore(locations: string[], jobLocation: string | null): number {
  if (!jobLocation || locations.length === 0) return 0;

  const jobLower = jobLocation.toLowerCase();

  // Check exact substring match (25 points)
  for (const loc of locations) {
    const locLower = loc.toLowerCase().trim();
    if (!locLower) continue;
    if (jobLower.includes(locLower) || locLower.includes(jobLower)) {
      return 25;
    }
  }

  // Check common region word match (15 points) — split on whitespace/commas
  const jobWords = new Set(jobLower.split(/[\s,./]+/).filter((w) => w.length > 2));

  for (const loc of locations) {
    const locWords = loc
      .toLowerCase()
      .split(/[\s,./]+/)
      .filter((w) => w.length > 2);
    for (const word of locWords) {
      if (jobWords.has(word)) {
        return 15;
      }
    }
  }

  return 0;
}

/**
 * Computes the employment type match score (0, 10, or 15).
 *
 * PLACEHOLDER: Epic 7 replaces this workModes→employmentType mapping.
 *
 * AC #2 specifies a workModes→employmentType compatibility mapping, but workModes
 * (remote/onsite/hybrid = work flexibility) and employmentType (full_time/contract/etc. =
 * contract type) are orthogonal concepts. All combinations are valid in practice
 * (e.g., "full_time remote", "contract onsite"). Rather than implement a mapping that
 * would produce false negatives, this placeholder treats all known workModes as compatible
 * with all employment types. jobEmploymentType is intentionally unused until Epic 7
 * introduces a proper matching engine.
 *
 * Scoring: Empty workModes → 10 (no preference, benefit of the doubt).
 * Any known workMode (remote/onsite/hybrid) → 15.
 * Unknown workMode → 0 (mismatch).
 */
function computeEmploymentTypeScore(
  workModes: string[] | null | undefined,
  _jobEmploymentType: string,
): number {
  // PLACEHOLDER: Epic 7 replaces this workModes→employmentType mapping
  if (!workModes || workModes.length === 0) return 10;

  const knownModes = new Set(["remote", "onsite", "hybrid"]);
  const hasKnownMode = workModes.some((m) => knownModes.has(m.toLowerCase()));

  if (hasKnownMode) return 15;

  // Unknown mode — treat as mismatch
  return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a lightweight placeholder match score for a seeker against a job posting.
 *
 * Pure function — no DB access, no side effects, no async.
 * Score = skillsOverlap (0–60) + locationMatch (0–25) + employmentTypeMatch (0–15), capped at 100.
 *
 * This is a placeholder heuristic. Epic 7 replaces the computation logic but preserves
 * the MatchScoreResult shape exactly.
 */
export function computeMatchScore(
  seekerProfile: SeekerProfile,
  seekerPreferences: SeekerPreferences | null,
  jobPosting: JobPosting,
): MatchScoreResult {
  const skillsOverlap = computeSkillsScore(seekerProfile.skills, jobPosting.requirements);
  const locationPoints = computeLocationScore(
    seekerPreferences?.locations ?? [],
    jobPosting.location,
  );
  const employmentTypePoints = computeEmploymentTypeScore(
    seekerPreferences?.workModes,
    jobPosting.employmentType,
  );

  const score = Math.min(100, skillsOverlap + locationPoints + employmentTypePoints);
  const tier = getMatchTier(score);

  return {
    score,
    tier,
    signals: {
      skillsOverlap,
      locationMatch: locationPoints > 0,
      employmentTypeMatch: employmentTypePoints > 0,
    },
  };
}
