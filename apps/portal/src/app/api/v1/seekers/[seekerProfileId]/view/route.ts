import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { auth } from "@igbo/auth";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { getSeekerProfileById } from "@igbo/db/queries/portal-seeker-profiles";
import { recordSeekerProfileView } from "@/services/seeker-analytics-service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withApiHandler(async (req) => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  // Extract seekerProfileId from URL: /api/v1/seekers/[seekerProfileId]/view
  const segments = new URL(req.url).pathname.split("/");
  const seekerProfileId = segments.at(-2);
  if (!seekerProfileId || !UUID_RE.test(seekerProfileId)) {
    throw new ApiError({ title: "Invalid seeker profile ID", status: 400 });
  }

  // Look up profile to get userId for self-view check
  const profile = await getSeekerProfileById(seekerProfileId);
  if (!profile) {
    throw new ApiError({ title: "Seeker profile not found", status: 404 });
  }

  // Self-view excluded
  if (session.user.id === profile.userId) {
    return successResponse({ recorded: false });
  }

  const recorded = await recordSeekerProfileView(seekerProfileId, session.user.id);
  return successResponse({ recorded });
});
