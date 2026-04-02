import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { requireAuthenticatedSession } from "@/services/permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import {
  getNotificationPreferences,
  upsertNotificationPreference,
} from "@igbo/db/queries/notification-preferences";

const upsertSchema = z.object({
  notificationType: z.enum([
    "message",
    "mention",
    "group_activity",
    "event_reminder",
    "post_interaction",
    "admin_announcement",
    "system",
  ]),
  channelEmail: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  digestMode: z.enum(["none", "daily", "weekly"]).optional(),
});

export const GET = withApiHandler(async (_req: Request) => {
  const session = await requireAuthenticatedSession();
  const preferences = await getNotificationPreferences(session.userId);
  return successResponse({ preferences });
});

export const PUT = withApiHandler(async (req: Request) => {
  const session = await requireAuthenticatedSession();
  const body: unknown = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid request",
    });
  }
  const { notificationType, ...prefs } = parsed.data;
  await upsertNotificationPreference(session.userId, notificationType, prefs);
  return successResponse({ ok: true });
});
