import "server-only";
import { auth } from "@igbo/auth";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { seekerProfileSchema } from "@/lib/validations/seeker-profile";
import { getSeekerProfileById, updateSeekerProfile } from "@igbo/db/queries/portal-seeker-profiles";
import { getSeekerTrustSignals } from "@igbo/db/queries/cross-app";

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const seekerProfileId = new URL(req.url).pathname.split("/").at(-1);
  if (!seekerProfileId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing seeker profile ID" });
  }

  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const { activePortalRole } = session.user;
  if (activePortalRole !== "EMPLOYER" && activePortalRole !== "JOB_ADMIN") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }

  const profile = await getSeekerProfileById(seekerProfileId);
  if (!profile) {
    throw new ApiError({
      title: "Not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const trustSignals = await getSeekerTrustSignals(profile.userId);

  return successResponse({ ...profile, trustSignals });
});

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const seekerProfileId = new URL(req.url).pathname.split("/").at(-1);
  if (!seekerProfileId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing seeker profile ID" });
  }

  const session = await requireJobSeekerRole();

  const profile = await getSeekerProfileById(seekerProfileId);
  if (!profile) {
    throw new ApiError({
      title: "Not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (profile.userId !== session.user.id) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "You do not own this seeker profile",
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = seekerProfileSchema.partial().safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const { headline, summary, skills, experience, education } = parsed.data;
  const patch: Record<string, unknown> = {};
  if (headline !== undefined) patch.headline = headline;
  if (summary !== undefined) patch.summary = summary;
  if (skills !== undefined) patch.skills = skills;
  if (experience !== undefined) patch.experienceJson = experience;
  if (education !== undefined) patch.educationJson = education;

  const updated = await updateSeekerProfile(seekerProfileId, patch);

  return successResponse(updated);
});
