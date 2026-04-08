import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import {
  getSeekerCvById,
  updateSeekerCv,
  setDefaultCv,
  deleteSeekerCvWithFile,
} from "@igbo/db/queries/portal-seeker-cvs";
import { cvUpdateSchema } from "@/lib/validations/seeker-cv";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();
  const cvId = new URL(req.url).pathname.split("/").at(-1)!;

  const body = await req.json().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  });

  const parsed = cvUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }

  const cv = await getSeekerCvById(cvId);
  if (!cv || cv.seekerProfileId !== profile.id) {
    throw new ApiError({
      title: "Not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  if (parsed.data.isDefault === true) {
    await setDefaultCv(profile.id, cvId);
  }

  if (parsed.data.label !== undefined) {
    await updateSeekerCv(cvId, { label: parsed.data.label });
  }

  const updated = await getSeekerCvById(cvId);
  return successResponse(updated);
});

export const DELETE = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();
  const cvId = new URL(req.url).pathname.split("/").at(-1)!;

  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }

  const cv = await getSeekerCvById(cvId);
  if (!cv || cv.seekerProfileId !== profile.id) {
    throw new ApiError({
      title: "Not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  await deleteSeekerCvWithFile(cvId);
  return new Response(null, { status: 204 });
});
