import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import {
  getSeekerPreferencesByProfileId,
  upsertSeekerPreferences,
} from "@igbo/db/queries/portal-seeker-preferences";
import { seekerPreferencesSchema } from "@/lib/validations/seeker-preferences";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

export const GET = withApiHandler(async (_req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();
  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }
  const prefs = await getSeekerPreferencesByProfileId(profile.id);
  return successResponse(prefs ?? null);
});

export const PUT = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  const body = await req.json().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  });

  const parsed = seekerPreferencesSchema.safeParse(body);
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

  const updated = await upsertSeekerPreferences(profile.id, {
    desiredRoles: parsed.data.desiredRoles ?? [],
    salaryMin: parsed.data.salaryMin ?? null,
    salaryMax: parsed.data.salaryMax ?? null,
    salaryCurrency: parsed.data.salaryCurrency ?? "NGN",
    locations: parsed.data.locations ?? [],
    workModes: parsed.data.workModes ?? [],
  });

  return successResponse(updated);
});
