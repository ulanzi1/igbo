// NOTE: No "server-only" — used by both Next.js and the standalone realtime server
import { eq, and, desc, gt, count as sqlCount } from "drizzle-orm";
import { db } from "@/db";
import { platformNotifications } from "@/db/schema/platform-notifications";

export type {
  PlatformNotification,
  NewPlatformNotification,
  NotificationType,
} from "@/db/schema/platform-notifications";
import type {
  PlatformNotification,
  NewPlatformNotification,
} from "@/db/schema/platform-notifications";

const PAGE_SIZE = 20;

export async function createNotification(
  data: NewPlatformNotification,
): Promise<PlatformNotification> {
  const [record] = await db.insert(platformNotifications).values(data).returning();
  if (!record) throw new Error("Insert returned no record");
  return record;
}

export async function getNotifications(
  userId: string,
  options: { since?: Date; limit?: number } = {},
): Promise<PlatformNotification[]> {
  const limit = options.limit ?? PAGE_SIZE;
  const conditions = [eq(platformNotifications.userId, userId)];
  if (options.since) {
    conditions.push(gt(platformNotifications.createdAt, options.since));
  }
  return db
    .select()
    .from(platformNotifications)
    .where(and(...conditions))
    .orderBy(desc(platformNotifications.createdAt))
    .limit(limit);
}

export async function getNotificationById(id: string): Promise<PlatformNotification | null> {
  const [record] = await db
    .select()
    .from(platformNotifications)
    .where(eq(platformNotifications.id, id))
    .limit(1);
  return record ?? null;
}

export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  const result = await db
    .update(platformNotifications)
    .set({ isRead: true })
    .where(and(eq(platformNotifications.id, id), eq(platformNotifications.userId, userId)))
    .returning({ id: platformNotifications.id });
  return result.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(platformNotifications)
    .set({ isRead: true })
    .where(and(eq(platformNotifications.userId, userId), eq(platformNotifications.isRead, false)));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ value: sqlCount() })
    .from(platformNotifications)
    .where(and(eq(platformNotifications.userId, userId), eq(platformNotifications.isRead, false)));
  return Number(result?.value ?? 0);
}
