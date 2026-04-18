import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerPreferencesByProfileId } from "@igbo/db/queries/portal-seeker-preferences";
import { getJobPostingsForMatching } from "@igbo/db/queries/portal-job-search";
import { computeMatchScore } from "@/services/match-scoring-service";
import type { MatchScoreResult } from "@igbo/config";

const MAX_JOB_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/jobs/match-scores?jobIds=id1,id2,...
 *
 * Returns per-user match scores for the requested job IDs.
 *
 * Authentication: requires authenticated JOB_SEEKER with a seeker profile and
 * matching consent. All other callers receive empty scores (not an error).
 *
 * - Unauthenticated → 401
 * - Non-seeker role → { scores: {} }
 * - No seeker profile → { scores: {} }
 * - consentMatching: false → { scores: {} }
 * - Missing jobIds param → 400
 * - More than 50 job IDs → 400
 * - Invalid UUID format → 400
 *
 * skipCsrf: GET endpoint, no side effects.
 */
export const GET = withApiHandler(
  async (req) => {
    // Auth check — return 401 for unauthenticated
    const session = await auth();
    if (!session?.user) {
      throw new ApiError({ title: "Unauthorized", status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobIdsParam = searchParams.get("jobIds");

    if (!jobIdsParam || !jobIdsParam.trim()) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: "jobIds query parameter is required",
      });
    }

    const jobIds = jobIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (jobIds.length === 0) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: "jobIds must contain at least one ID",
      });
    }

    if (jobIds.length > MAX_JOB_IDS) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: `jobIds must contain at most ${MAX_JOB_IDS} IDs`,
      });
    }

    const invalidId = jobIds.find((id) => !UUID_RE.test(id));
    if (invalidId) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: `Invalid UUID format: ${invalidId}`,
      });
    }

    // Non-seeker roles return empty scores (not an error)
    if (session.user.activePortalRole !== "JOB_SEEKER") {
      return successResponse({ scores: {} as Record<string, MatchScoreResult> });
    }

    // Seeker must have a profile
    const profile = await getSeekerProfileByUserId(session.user.id);
    if (!profile) {
      return successResponse({ scores: {} as Record<string, MatchScoreResult> });
    }

    // Seeker must have matching consent
    if (!profile.consentMatching) {
      return successResponse({ scores: {} as Record<string, MatchScoreResult> });
    }

    // Load preferences (optional — null if not yet set)
    const preferences = await getSeekerPreferencesByProfileId(profile.id);

    // Load job postings minimal projection
    const postings = await getJobPostingsForMatching(jobIds);

    // Compute scores
    const seekerProfile = { skills: (profile.skills as string[]) ?? [] };
    const seekerPrefs = preferences
      ? {
          locations: (preferences.locations as string[]) ?? [],
          workModes: (preferences.workModes as string[]) ?? [],
        }
      : null;

    const scores: Record<string, MatchScoreResult> = {};
    for (const posting of postings) {
      scores[posting.id] = computeMatchScore(seekerProfile, seekerPrefs, {
        requirements: posting.requirements,
        location: posting.location,
        employmentType: posting.employmentType,
      });
    }

    return successResponse({ scores });
  },
  { skipCsrf: true },
);
