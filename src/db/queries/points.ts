// No "server-only" — follows posts.ts / feed.ts pattern (imported by server-only services).
import { eq, and, sum } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { platformPointsLedger, platformPointsRules } from "@/db/schema/platform-points";
import type { PlatformPointsRule } from "@/db/schema/platform-points";

export interface InsertLedgerEntryData {
  userId: string;
  points: number;
  reason: string;
  sourceType: "like_received" | "event_attended" | "article_published";
  sourceId: string;
  multiplierApplied?: number; // defaults to 1
}

export async function insertPointsLedgerEntry(data: InsertLedgerEntryData): Promise<void> {
  await db.insert(platformPointsLedger).values({
    userId: data.userId,
    points: data.points,
    reason: data.reason,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    multiplierApplied: String(data.multiplierApplied ?? 1),
  });
}

export async function getActivePointsRules(): Promise<PlatformPointsRule[]> {
  return db.select().from(platformPointsRules).where(eq(platformPointsRules.isActive, true));
}

export async function getPointsRuleByActivityType(
  activityType: string,
): Promise<PlatformPointsRule | null> {
  const [row] = await db
    .select()
    .from(platformPointsRules)
    .where(
      and(
        eq(platformPointsRules.activityType, activityType),
        eq(platformPointsRules.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getUserPointsTotal(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(platformPointsLedger.points) })
    .from(platformPointsLedger)
    .where(eq(platformPointsLedger.userId, userId));
  return Number(row?.total ?? 0);
}

export async function logPointsThrottle(params: {
  actorId: string; // reactor userId (valid UUID FK)
  earnerUserId: string;
  reason: string; // 'rapid_fire' | 'repeat_pair'
  eventType: string; // 'post.reacted'
  eventId: string; // postId
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: "points_throttled",
    targetUserId: params.earnerUserId,
    details: {
      reason: params.reason,
      eventType: params.eventType,
      eventId: params.eventId,
    },
  });
}
