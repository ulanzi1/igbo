import "server-only";
import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { getNotificationPreferences, setQuietHours } from "@igbo/db";

// Accept HH:MM or HH:MM:SS — seconds are stripped before storing
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const putSchema = z
  .object({
    start: z.string().regex(TIME_REGEX, "Invalid time (HH:MM, 00:00-23:59)").nullable(),
    end: z.string().regex(TIME_REGEX, "Invalid time (HH:MM, 00:00-23:59)").nullable(),
    timezone: z.string().min(1).refine(isValidTimezone, "Unsupported timezone"),
  })
  .refine((data) => (data.start === null) === (data.end === null), {
    message: "Both start and end must be set, or both must be null",
  });

export const GET = withApiHandler(async (): Promise<Response> => {
  const { userId } = await requireAuthenticatedSession();

  // Quiet hours are stored per-preference-row (all rows share the same values).
  // Known limitation: if user has no preference rows yet, we return null (cold-start case).
  // Future remediation: dedicated user_quiet_hours table (candidate for P-6.6).
  const prefs = await getNotificationPreferences(userId);
  const firstPref = Object.values(prefs)[0];

  if (!firstPref) {
    return successResponse({ start: null, end: null, timezone: null });
  }

  return successResponse({
    start: firstPref.quietHoursStart ?? null,
    end: firstPref.quietHoursEnd ?? null,
    timezone: firstPref.quietHoursTimezone ?? null,
  });
});

export const PUT = withApiHandler(async (req: Request): Promise<Response> => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError({ title: "Invalid JSON body", status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  const { start, end, timezone } = parsed.data;

  // Normalize to HH:MM — strip seconds if present (from old browser inputs that stored HH:MM:SS)
  const normalizedStart = start ? start.slice(0, 5) : null;
  const normalizedEnd = end ? end.slice(0, 5) : null;

  await setQuietHours(userId, normalizedStart, normalizedEnd, timezone);

  return successResponse({ updated: true });
});
