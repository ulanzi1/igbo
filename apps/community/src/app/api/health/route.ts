import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@igbo/db";
import { getRedisClient } from "@/lib/redis";
import { env } from "@/env";

export async function GET() {
  const startTime = process.uptime();

  let dbStatus: "connected" | "disconnected" = "disconnected";
  let redisStatus: "connected" | "disconnected" = "disconnected";
  let realtimeStatus: "connected" | "disconnected" = "disconnected";

  // Check DB connectivity
  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  // Check Redis connectivity using shared client (no connection leak)
  try {
    await getRedisClient().ping();
    redisStatus = "connected";
  } catch {
    redisStatus = "disconnected";
  }

  // Check realtime server (Socket.IO container health endpoint)
  // Realtime unavailability → "degraded" (not hard "unhealthy") per NFR failure isolation
  try {
    const realtimeUrl = env.REALTIME_INTERNAL_URL ?? "http://localhost:3001";
    const resp = await fetch(`${realtimeUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      realtimeStatus = "connected";
    }
  } catch {
    realtimeStatus = "disconnected";
  }

  const coreHealthy = dbStatus === "connected" && redisStatus === "connected";
  // "healthy" only when all systems connected; "degraded" for any failure
  const status = coreHealthy && realtimeStatus === "connected" ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      db: dbStatus,
      redis: redisStatus,
      realtime: realtimeStatus,
      uptime: startTime,
    },
    { status: coreHealthy ? 200 : 503 },
  );
}
