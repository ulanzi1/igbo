import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { seekerProfileSchema } from "@/lib/validations/seeker-profile";
import {
  createSeekerProfile,
  getSeekerProfileByUserId,
} from "@igbo/db/queries/portal-seeker-profiles";

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const parsed = seekerProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const existing = await getSeekerProfileByUserId(session.user.id);
  if (existing) {
    throw new ApiError({
      title: "Seeker profile already exists",
      status: 409,
      extensions: { code: PORTAL_ERRORS.DUPLICATE_SEEKER_PROFILE },
    });
  }

  const { headline, summary, skills, experience, education } = parsed.data;
  const profile = await createSeekerProfile({
    userId: session.user.id,
    headline,
    summary: summary ?? null,
    skills: skills ?? [],
    experienceJson: experience ?? [],
    educationJson: education ?? [],
  });

  return successResponse(profile, undefined, 201);
});
