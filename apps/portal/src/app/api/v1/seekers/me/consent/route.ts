import "server-only";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import {
  getSeekerProfileByUserId,
  updateSeekerConsent,
} from "@igbo/db/queries/portal-seeker-profiles";
import { seekerConsentSchema } from "@/lib/validations/seeker-visibility";
import { PORTAL_ERRORS } from "@/lib/portal-errors";

export const PATCH = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  const body = await req.json().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  });

  const parsed = seekerConsentSchema.safeParse(body);
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

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const auditEntries: Array<{
    actorId: string;
    action: string;
    targetUserId: string;
    targetType: string;
    details: Record<string, unknown>;
    ipAddress: string | null;
    traceId: null;
  }> = [];

  // Build patch and audit entries ONLY for fields whose value actually changes (AC8)
  const patch: { consentMatching?: boolean; consentEmployerView?: boolean } = {};

  if (
    parsed.data.consentMatching !== undefined &&
    parsed.data.consentMatching !== profile.consentMatching
  ) {
    patch.consentMatching = parsed.data.consentMatching;
    auditEntries.push({
      actorId: session.user.id,
      targetUserId: session.user.id,
      action: "portal.seeker.consent.matching.changed",
      targetType: "portal_seeker_profile",
      details: {
        from: profile.consentMatching,
        to: parsed.data.consentMatching,
        seekerProfileId: profile.id,
      },
      ipAddress,
      traceId: null,
    });
  }

  if (
    parsed.data.consentEmployerView !== undefined &&
    parsed.data.consentEmployerView !== profile.consentEmployerView
  ) {
    patch.consentEmployerView = parsed.data.consentEmployerView;
    auditEntries.push({
      actorId: session.user.id,
      targetUserId: session.user.id,
      action: "portal.seeker.consent.employer_view.changed",
      targetType: "portal_seeker_profile",
      details: {
        from: profile.consentEmployerView,
        to: parsed.data.consentEmployerView,
        seekerProfileId: profile.id,
      },
      ipAddress,
      traceId: null,
    });
  }

  // If nothing actually changed, return the profile as-is
  if (Object.keys(patch).length === 0) {
    return successResponse(profile);
  }

  const updated = await updateSeekerConsent(session.user.id, patch, auditEntries);

  if (!updated) {
    throw new ApiError({ title: "Update failed", status: 500 });
  }

  return successResponse(updated);
});
