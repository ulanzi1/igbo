import { type NextRequest } from "next/server";
import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { requireAuthenticatedSession } from "@/services/permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { setQuietHours, isUserInQuietHours } from "@/db/queries/notification-preferences";
import { getRedisClient } from "@/lib/redis";

const quietHoursSchema = z.object({
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  quietHoursTimezone: z.string().min(1).max(64),
});

export const PUT = withApiHandler(async (req: NextRequest) => {
  const session = await requireAuthenticatedSession();
  const body: unknown = await req.json();
  const parsed = quietHoursSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request",
    });
  }
  const { quietHoursStart, quietHoursEnd, quietHoursTimezone } = parsed.data;
  await setQuietHours(session.userId, quietHoursStart, quietHoursEnd, quietHoursTimezone);

  // Sync Redis DnD key based on current time
  const nowInQh = await isUserInQuietHours(session.userId, new Date());
  const redis = getRedisClient();
  if (nowInQh) {
    await redis.set(`dnd:${session.userId}`, "1", { ex: 5400 }); // 90 min TTL
  } else {
    await redis.del(`dnd:${session.userId}`);
  }

  return successResponse({ ok: true });
});

export const DELETE = withApiHandler(async (_req: NextRequest) => {
  const session = await requireAuthenticatedSession();
  await setQuietHours(session.userId, null, null, "UTC");

  // Clear Redis DnD key
  const redis = getRedisClient();
  await redis.del(`dnd:${session.userId}`);

  return successResponse({ ok: true });
});
