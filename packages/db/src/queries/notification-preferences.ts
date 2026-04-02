import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { toZonedTime } from "date-fns-tz";
import { db } from "../index";
import { platformNotificationPreferences } from "../schema/platform-notification-preferences";
import { platformNotifications } from "../schema/platform-notifications";
export type { NotificationTypeKey, ChannelPrefs } from "@igbo/config/notifications";
import type { ChannelPrefs } from "@igbo/config/notifications";
import { NOTIFICATION_TYPES, DEFAULT_PREFERENCES } from "@igbo/config/notifications";
export { NOTIFICATION_TYPES, DEFAULT_PREFERENCES };

export async function getNotificationPreferences(
  userId: string,
): Promise<Record<string, ChannelPrefs>> {
  const rows = await db
    .select()
    .from(platformNotificationPreferences)
    .where(eq(platformNotificationPreferences.userId, userId));

  const result: Record<string, ChannelPrefs> = {};
  for (const row of rows) {
    result[row.notificationType] = {
      channelInApp: row.channelInApp,
      channelEmail: row.channelEmail,
      channelPush: row.channelPush,
      digestMode: row.digestMode,
      quietHoursStart: row.quietHoursStart ?? null,
      quietHoursEnd: row.quietHoursEnd ?? null,
      quietHoursTimezone: row.quietHoursTimezone,
      lastDigestAt: row.lastDigestAt ?? null,
    };
  }
  return result;
}

export async function upsertNotificationPreference(
  userId: string,
  notificationType: string,
  prefs: Partial<Omit<ChannelPrefs, "lastDigestAt">>,
): Promise<void> {
  await db
    .insert(platformNotificationPreferences)
    .values({
      userId,
      notificationType,
      channelInApp: prefs.channelInApp ?? true,
      channelEmail: prefs.channelEmail ?? false,
      channelPush: prefs.channelPush ?? false,
      digestMode: prefs.digestMode ?? "none",
      quietHoursTimezone: prefs.quietHoursTimezone ?? "UTC",
    })
    .onConflictDoUpdate({
      target: [
        platformNotificationPreferences.userId,
        platformNotificationPreferences.notificationType,
      ],
      set: {
        ...(prefs.channelInApp !== undefined && { channelInApp: prefs.channelInApp }),
        ...(prefs.channelEmail !== undefined && { channelEmail: prefs.channelEmail }),
        ...(prefs.channelPush !== undefined && { channelPush: prefs.channelPush }),
        ...(prefs.digestMode !== undefined && { digestMode: prefs.digestMode }),
        ...(prefs.quietHoursStart !== undefined && { quietHoursStart: prefs.quietHoursStart }),
        ...(prefs.quietHoursEnd !== undefined && { quietHoursEnd: prefs.quietHoursEnd }),
        ...(prefs.quietHoursTimezone !== undefined && {
          quietHoursTimezone: prefs.quietHoursTimezone,
        }),
        updatedAt: new Date(),
      },
    });
}

export async function setQuietHours(
  userId: string,
  start: string | null,
  end: string | null,
  timezone: string,
): Promise<void> {
  // First try UPDATE on existing rows
  const updateResult = await db
    .update(platformNotificationPreferences)
    .set({
      quietHoursStart: start,
      quietHoursEnd: end,
      quietHoursTimezone: timezone,
      updatedAt: new Date(),
    })
    .where(eq(platformNotificationPreferences.userId, userId));

  // If no rows were updated (new user), insert default rows for all notification types
  // so quiet hours are persisted. Check via a SELECT since Drizzle UPDATE doesn't return rowCount reliably.
  const existingRows = await db
    .select({ notificationType: platformNotificationPreferences.notificationType })
    .from(platformNotificationPreferences)
    .where(eq(platformNotificationPreferences.userId, userId));

  if (existingRows.length === 0) {
    const now = new Date();
    const defaultValues = NOTIFICATION_TYPES.map((type) => {
      const defaults = DEFAULT_PREFERENCES[type];
      return {
        userId,
        notificationType: type,
        channelInApp: defaults.inApp,
        channelEmail: defaults.email,
        channelPush: defaults.push,
        digestMode: "none" as const,
        quietHoursStart: start,
        quietHoursEnd: end,
        quietHoursTimezone: timezone,
        updatedAt: now,
      };
    });
    await db.insert(platformNotificationPreferences).values(defaultValues);
  }
}

function isInQuietHours(
  nowUtc: Date,
  start: string, // "HH:MM"
  end: string, // "HH:MM"
  timezone: string,
): boolean {
  try {
    const zonedNow = toZonedTime(nowUtc, timezone);
    const currentMinutes = zonedNow.getHours() * 60 + zonedNow.getMinutes();

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
    const endMinutes = (eh ?? 0) * 60 + (em ?? 0);

    if (startMinutes <= endMinutes) {
      // Same-day window: e.g. 22:00–23:59
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight window: e.g. 22:00–08:00
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

export async function getUsersInQuietHours(nowUtc: Date): Promise<string[]> {
  const rows = await db
    .select({
      userId: platformNotificationPreferences.userId,
      quietHoursStart: platformNotificationPreferences.quietHoursStart,
      quietHoursEnd: platformNotificationPreferences.quietHoursEnd,
      quietHoursTimezone: platformNotificationPreferences.quietHoursTimezone,
    })
    .from(platformNotificationPreferences)
    .where(isNotNull(platformNotificationPreferences.quietHoursStart))
    .orderBy(asc(platformNotificationPreferences.userId));

  // Deduplicate by userId — rows are ordered and filtered to have quietHoursStart NOT NULL
  const seen = new Set<string>();
  const result: string[] = [];

  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    if (row.quietHoursStart && row.quietHoursEnd) {
      if (isInQuietHours(nowUtc, row.quietHoursStart, row.quietHoursEnd, row.quietHoursTimezone)) {
        result.push(row.userId);
      }
    }
  }

  return result;
}

export interface DigestDueUser {
  userId: string;
  digestTypes: string[];
}

export async function getUsersWithDigestDue(nowUtc: Date): Promise<DigestDueUser[]> {
  const rows = await db
    .select()
    .from(platformNotificationPreferences)
    .where(ne(platformNotificationPreferences.digestMode, "none"));

  const userMap = new Map<string, string[]>();

  for (const row of rows) {
    const isDue = isDigestDue(
      nowUtc,
      row.digestMode,
      row.lastDigestAt ?? null,
      row.quietHoursTimezone,
    );
    if (isDue) {
      if (!userMap.has(row.userId)) userMap.set(row.userId, []);
      userMap.get(row.userId)!.push(row.notificationType);
    }
  }

  return Array.from(userMap.entries()).map(([userId, digestTypes]) => ({ userId, digestTypes }));
}

function isDigestDue(
  nowUtc: Date,
  digestMode: string,
  lastDigestAt: Date | null,
  timezone: string,
): boolean {
  try {
    const zonedNow = toZonedTime(nowUtc, timezone);
    const currentHour = zonedNow.getHours();

    if (digestMode === "daily") {
      if (currentHour !== 8) return false;
      if (!lastDigestAt) return true;
      const zonedLast = toZonedTime(lastDigestAt, timezone);
      return zonedLast.toDateString() !== zonedNow.toDateString();
    }

    if (digestMode === "weekly") {
      if (currentHour !== 8 || zonedNow.getDay() !== 1) return false;
      if (!lastDigestAt) return true;
      const zonedLast = toZonedTime(lastDigestAt, timezone);
      return zonedLast.toDateString() !== zonedNow.toDateString();
    }

    return false;
  } catch {
    return false;
  }
}

export async function getUndigestedNotifications(userId: string, type: string, since: Date) {
  return db
    .select()
    .from(platformNotifications)
    .where(
      and(
        eq(platformNotifications.userId, userId),
        eq(platformNotifications.type, type as never),
        gt(platformNotifications.createdAt, since),
      ),
    );
}

export async function markDigestSent(userId: string, types: string[], sentAt: Date): Promise<void> {
  if (types.length === 0) return;
  await db
    .update(platformNotificationPreferences)
    .set({ lastDigestAt: sentAt, updatedAt: new Date() })
    .where(
      and(
        eq(platformNotificationPreferences.userId, userId),
        inArray(platformNotificationPreferences.notificationType, types),
      ),
    );
}

/** Check if a given user is currently in quiet hours (used by dnd-status API). */
export async function isUserInQuietHours(userId: string, nowUtc: Date): Promise<boolean> {
  const rows = await db
    .select({
      quietHoursStart: platformNotificationPreferences.quietHoursStart,
      quietHoursEnd: platformNotificationPreferences.quietHoursEnd,
      quietHoursTimezone: platformNotificationPreferences.quietHoursTimezone,
    })
    .from(platformNotificationPreferences)
    .where(
      and(
        eq(platformNotificationPreferences.userId, userId),
        isNotNull(platformNotificationPreferences.quietHoursStart),
      ),
    )
    .limit(1);

  if (rows.length === 0) return false;
  const row = rows[0]!;
  if (!row.quietHoursStart || !row.quietHoursEnd) return false;
  return isInQuietHours(nowUtc, row.quietHoursStart, row.quietHoursEnd, row.quietHoursTimezone);
}
