import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import Redis from "ioredis";
import { env } from "@/env";

export async function GET() {
  const startTime = process.uptime();

  let dbStatus: "connected" | "disconnected" = "disconnected";
  let redisStatus: "connected" | "disconnected" = "disconnected";

  // Check DB connectivity
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  // Check Redis connectivity — quit() in finally to prevent connection leaks on error
  const redis = new Redis(env.REDIS_URL);
  try {
    await redis.ping();
    redisStatus = "connected";
  } catch {
    redisStatus = "disconnected";
  } finally {
    await redis.quit();
  }

  const isHealthy = dbStatus === "connected" && redisStatus === "connected";
  const status = isHealthy ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      db: dbStatus,
      redis: redisStatus,
      uptime: startTime,
    },
    { status: isHealthy ? 200 : 503 },
  );
}
