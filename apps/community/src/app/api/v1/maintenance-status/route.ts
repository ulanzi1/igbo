// @vitest-environment node
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { getRedisClient } from "@/lib/redis";

export interface MaintenanceStatus {
  enabled: boolean;
  scheduledStart: string | null;
  expectedDuration: number | null; // minutes
  reason: string | null;
}

// community-scope: raw Redis keys — VD-4 trigger not yet reached
const MAINTENANCE_REDIS_KEY = "platform:maintenance_mode"; // ci-allow-redis-key

export const GET = withApiHandler(
  async () => {
    try {
      const redis = getRedisClient();
      const raw = await redis.get(MAINTENANCE_REDIS_KEY);

      if (!raw) {
        return successResponse<MaintenanceStatus>({
          enabled: false,
          scheduledStart: null,
          expectedDuration: null,
          reason: null,
        });
      }

      const data = JSON.parse(raw) as {
        enabled?: boolean;
        scheduledStart?: string;
        expectedDuration?: number;
        reason?: string;
      };

      return successResponse<MaintenanceStatus>({
        enabled: data.enabled ?? false,
        scheduledStart: data.scheduledStart ?? null,
        expectedDuration: data.expectedDuration ?? null,
        reason: data.reason ?? null,
      });
    } catch {
      // Redis unavailable — return safe default (no maintenance)
      return successResponse<MaintenanceStatus>({
        enabled: false,
        scheduledStart: null,
        expectedDuration: null,
        reason: null,
      });
    }
  },
  { skipCsrf: true },
);
