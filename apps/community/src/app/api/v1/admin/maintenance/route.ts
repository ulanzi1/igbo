// @vitest-environment node
import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { upsertPlatformSetting, getPlatformSetting } from "@igbo/db/queries/platform-settings";
import { logAdminAction } from "@/services/audit-logger";
import { getRedisClient } from "@/lib/redis";
import * as Sentry from "@sentry/nextjs";

const MAINTENANCE_SETTING_KEY = "maintenance_mode";
const MAINTENANCE_REDIS_KEY = "platform:maintenance_mode";

interface MaintenanceSetting {
  enabled: boolean;
  reason: string;
  scheduledStart: string; // ISO
  expectedDuration: number; // minutes
  initiatedBy: string; // userId
}

const enableSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(1).optional(),
  scheduledStart: z.string().optional(), // ISO date string
  expectedDuration: z.number().int().min(1).optional(), // minutes
});

const defaultSetting: MaintenanceSetting = {
  enabled: false,
  reason: "",
  scheduledStart: "",
  expectedDuration: 60,
  initiatedBy: "",
};

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const current = await getPlatformSetting<MaintenanceSetting>(
    MAINTENANCE_SETTING_KEY,
    defaultSetting,
  );

  return successResponse({ maintenance: current });
});

export const POST = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const body = await request.json().catch(() => null);
  if (!body) throw new ApiError({ title: "Invalid JSON", status: 400 });

  const parsed = enableSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
      status: 400,
    });
  }

  const { enabled, reason, scheduledStart, expectedDuration } = parsed.data;

  // Read current setting to detect transitions and track durations
  const current = await getPlatformSetting<MaintenanceSetting>(
    MAINTENANCE_SETTING_KEY,
    defaultSetting,
  );

  // Duration tracking: when disabling, calculate actual duration
  if (!enabled && current.enabled) {
    const startedAt = current.scheduledStart ? new Date(current.scheduledStart).getTime() : null;
    if (startedAt) {
      const actualDurationMinutes = Math.floor((Date.now() - startedAt) / 60_000);
      const expectedMinutes = current.expectedDuration ?? 60;

      if (actualDurationMinutes > expectedMinutes) {
        Sentry.captureMessage(
          `Maintenance exceeded expected duration: actual=${actualDurationMinutes}m expected=${expectedMinutes}m`,
          { level: "warning", tags: { adminId, type: "maintenance_overrun" } },
        );
      }
    }
  }

  const now = new Date().toISOString();
  const newSetting: MaintenanceSetting = {
    enabled,
    reason: reason ?? current.reason ?? "",
    scheduledStart: enabled ? (scheduledStart ?? current.scheduledStart ?? now) : "",
    expectedDuration: expectedDuration ?? current.expectedDuration ?? 60,
    initiatedBy: adminId,
  };

  await upsertPlatformSetting(MAINTENANCE_SETTING_KEY, newSetting, adminId);

  // Sync process.env so middleware enforcement takes effect immediately (same process).
  // LIMITATION: Only affects this container. For multi-instance K8s deployments, add
  // Redis pub/sub broadcast so all instances update in-memory state. Acceptable for
  // current single-server Docker Compose architecture.
  process.env.MAINTENANCE_MODE = enabled ? "true" : "false";

  // Update Redis cache for the client-side banner
  try {
    const redis = getRedisClient();
    await redis.set(MAINTENANCE_REDIS_KEY, JSON.stringify(newSetting));
  } catch {
    // Redis unavailable — DB is authoritative; banner may lag
  }

  // Audit log
  await logAdminAction({
    actorId: adminId,
    action: enabled ? "MAINTENANCE_ENABLED" : "MAINTENANCE_DISABLED",
    details: {
      enabled,
      reason: newSetting.reason,
      scheduledStart: newSetting.scheduledStart,
      expectedDuration: newSetting.expectedDuration,
    },
    ipAddress: request.headers.get("X-Client-IP") ?? undefined,
    traceId: request.headers.get("X-Request-Id") ?? undefined,
  });

  return successResponse({ maintenance: newSetting });
});
