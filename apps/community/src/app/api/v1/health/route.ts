// @vitest-environment node
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { db } from "@igbo/db";
import { sql } from "drizzle-orm";
import { getRedisClient } from "@/lib/redis";

type ComponentStatus = "ok" | "down" | "unknown";

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  components: {
    db: ComponentStatus;
    redis: ComponentStatus;
    realtime: ComponentStatus;
  };
  timestamp: string;
}

export const GET = withApiHandler(
  async () => {
    const timestamp = new Date().toISOString();

    // DB health check
    let dbStatus: ComponentStatus = "down";
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "ok";
    } catch {
      dbStatus = "down";
    }

    // Redis health check
    let redisStatus: ComponentStatus = "down";
    try {
      const redis = getRedisClient();
      const pong = await redis.ping();
      redisStatus = pong === "PONG" ? "ok" : "down";
    } catch {
      redisStatus = "down";
    }

    // Realtime health: use Redis connectivity as proxy.
    // If Redis is ok, realtime is likely up (shares same Redis adapter).
    // If Redis is down, we cannot determine realtime state.
    const realtimeStatus: ComponentStatus = redisStatus === "ok" ? "ok" : "unknown";

    const allOk = dbStatus === "ok" && redisStatus === "ok";
    const overallStatus: HealthResponse["status"] = allOk ? "ok" : "degraded";

    return successResponse<HealthResponse>({
      status: overallStatus,
      components: {
        db: dbStatus,
        redis: redisStatus,
        realtime: realtimeStatus,
      },
      timestamp,
    });
  },
  { skipCsrf: true },
);
