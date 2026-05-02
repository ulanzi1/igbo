import "server-only";
import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { getNotificationPreferences, upsertNotificationPreference } from "@igbo/db";
import { markDigestSent } from "@igbo/db/queries/notification-preferences";
import { getRedisClient } from "@/lib/redis";
import { createRedisKey } from "@igbo/config/redis";
import {
  PORTAL_NOTIFICATION_CATALOG,
  PORTAL_NOTIFICATION_EVENT_TYPES,
  isSystemCritical,
  isLowPriority,
} from "@igbo/config/notifications";
import type { PortalNotificationEventType } from "@igbo/config/notifications";

const DIGEST_MODES = ["none", "daily", "weekly"] as const;

const putSchema = z.object({
  eventType: z.enum(
    PORTAL_NOTIFICATION_EVENT_TYPES as [
      PortalNotificationEventType,
      ...PortalNotificationEventType[],
    ],
  ),
  channelInApp: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  channelEmail: z.boolean().optional(),
  digestMode: z.enum(DIGEST_MODES).optional(),
});

export const GET = withApiHandler(async (): Promise<Response> => {
  const { userId } = await requireAuthenticatedSession();
  const userPrefs = await getNotificationPreferences(userId);

  // Build merged view: every event type from catalog, with user overrides where present
  const preferences: Record<
    string,
    {
      channelInApp: boolean;
      channelEmail: boolean;
      channelPush: boolean;
      digestMode: string;
    }
  > = {};

  for (const eventType of PORTAL_NOTIFICATION_EVENT_TYPES) {
    const catalogEntry = PORTAL_NOTIFICATION_CATALOG[eventType];
    const userPref = userPrefs[eventType];

    preferences[eventType] = {
      channelInApp: userPref?.channelInApp ?? catalogEntry.defaultChannels.inApp,
      channelEmail: userPref?.channelEmail ?? catalogEntry.defaultChannels.email,
      channelPush: userPref?.channelPush ?? catalogEntry.defaultChannels.push,
      digestMode: userPref?.digestMode ?? "none",
    };
  }

  return successResponse({ preferences, catalog: PORTAL_NOTIFICATION_CATALOG });
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

  const { eventType, channelInApp, channelPush, channelEmail, digestMode } = parsed.data;

  // Server does NOT enforce at-least-one-channel — that is client-side only by design
  // (see story AC #3). Document via test name "server does NOT enforce at-least-one-channel".

  if (isSystemCritical(eventType)) {
    throw new ApiError({
      title: "Cannot modify system-critical notification preferences",
      status: 400,
      detail: `Event type '${eventType}' is system-critical and cannot be disabled`,
    });
  }

  // Validate digestMode is only set for low-priority events
  if (digestMode !== undefined && !isLowPriority(eventType)) {
    throw new ApiError({
      title: "digestMode can only be set for low-priority notification categories",
      status: 400,
    });
  }

  // Detect watermark advance need (AC #6):
  // When digestMode changes between "none" and a cadence value (in either direction),
  // atomically advance lastDigestAt to bound the pending digest window.
  let shouldAdvanceWatermark = false;
  if (digestMode !== undefined) {
    const currentPrefs = await getNotificationPreferences(userId);
    const currentDigestMode = currentPrefs[eventType]?.digestMode ?? null;
    // Only advance watermark if there's an existing row AND digestMode is actually changing
    // AND the change involves "none" (i.e., instant ↔ cadence transition)
    if (
      currentDigestMode !== null &&
      currentDigestMode !== digestMode &&
      (digestMode === "none" || currentDigestMode === "none")
    ) {
      shouldAdvanceWatermark = true;
    }
  }

  await upsertNotificationPreference(userId, eventType, {
    ...(channelInApp !== undefined && { channelInApp }),
    ...(channelPush !== undefined && { channelPush }),
    ...(channelEmail !== undefined && { channelEmail }),
    ...(digestMode !== undefined && { digestMode }),
  });

  // Advance lastDigestAt watermark when switching between instant and digest cadence (AC #6).
  // This bounds the digest window cleanly from the mode-switch moment.
  if (shouldAdvanceWatermark) {
    await markDigestSent(userId, [eventType], new Date());
  }

  // Invalidate the preferences cache for this user
  try {
    const redis = getRedisClient();
    await redis.del(createRedisKey("portal", "notif-prefs", userId));
  } catch {
    // Cache invalidation failure is non-fatal
  }

  return successResponse({ updated: true });
});
