// NOTE: No "server-only" — may be used by standalone services
import { eq, and, isNull, desc, lt, sql, count as sqlCount } from "drizzle-orm";
import { db } from "../index";
import { portalNotifications } from "../schema/portal-notifications";
import type { PortalNotification, NewPortalNotification } from "../schema/portal-notifications";

export type { PortalNotification, NewPortalNotification };

const PAGE_SIZE = 20;

// --- Cursor helpers ---

export function encodeCursor(notif: { createdAt: Date; id: string }): string {
  return Buffer.from(`${notif.createdAt.toISOString()}|${notif.id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString();
    const separatorIdx = decoded.indexOf("|");
    if (separatorIdx === -1) return null;
    const iso = decoded.slice(0, separatorIdx);
    const id = decoded.slice(separatorIdx + 1);
    if (!id) return null;
    const createdAt = new Date(iso);
    if (isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// --- Query functions ---

/**
 * Insert a portal notification with idempotency support.
 * Returns the row on success, or null if a duplicate idempotencyKey already exists.
 */
export async function createPortalNotification(
  data: NewPortalNotification,
): Promise<PortalNotification | null> {
  if (data.idempotencyKey) {
    const [record] = await db
      .insert(portalNotifications)
      .values(data)
      .onConflictDoNothing({ target: portalNotifications.idempotencyKey })
      .returning();
    return record ?? null;
  }
  const [record] = await db.insert(portalNotifications).values(data).returning();
  if (!record) throw new Error("Insert returned no record");
  return record;
}

/**
 * List portal notifications for a user, cursor-based pagination.
 * Dismissed notifications excluded. Ordered by createdAt DESC, id DESC.
 */
export async function getPortalNotifications(
  userId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<PortalNotification[]> {
  const limit = options.limit ?? PAGE_SIZE;

  if (options.cursor) {
    const parsed = decodeCursor(options.cursor);
    if (!parsed) {
      // Invalid cursor — return first page instead of crashing
      return db
        .select()
        .from(portalNotifications)
        .where(and(eq(portalNotifications.userId, userId), isNull(portalNotifications.dismissedAt)))
        .orderBy(desc(portalNotifications.createdAt), desc(portalNotifications.id))
        .limit(limit);
    }
    const { createdAt: cursorDate, id: cursorId } = parsed;
    return db
      .select()
      .from(portalNotifications)
      .where(
        and(
          eq(portalNotifications.userId, userId),
          isNull(portalNotifications.dismissedAt),
          sql`(${portalNotifications.createdAt}, ${portalNotifications.id}) < (${cursorDate}, ${cursorId})`,
        ),
      )
      .orderBy(desc(portalNotifications.createdAt), desc(portalNotifications.id))
      .limit(limit);
  }

  return db
    .select()
    .from(portalNotifications)
    .where(and(eq(portalNotifications.userId, userId), isNull(portalNotifications.dismissedAt)))
    .orderBy(desc(portalNotifications.createdAt), desc(portalNotifications.id))
    .limit(limit);
}

/**
 * Get a single notification by id, scoped by userId for security.
 */
export async function getPortalNotificationById(
  id: string,
  userId: string,
): Promise<PortalNotification | null> {
  const [record] = await db
    .select()
    .from(portalNotifications)
    .where(and(eq(portalNotifications.id, id), eq(portalNotifications.userId, userId)))
    .limit(1);
  return record ?? null;
}

/**
 * Mark a single notification as read. No-op if already read.
 * Returns the row if found (regardless of whether readAt was updated), null if not found for this user.
 */
export async function markPortalNotificationRead(
  id: string,
  userId: string,
): Promise<PortalNotification | null> {
  const [record] = await db
    .update(portalNotifications)
    .set({ readAt: sql`COALESCE(${portalNotifications.readAt}, now())` })
    .where(and(eq(portalNotifications.id, id), eq(portalNotifications.userId, userId)))
    .returning();
  return record ?? null;
}

/**
 * Mark all unread, non-dismissed notifications as read for a user.
 * Returns the number of rows updated.
 */
export async function markAllPortalNotificationsRead(userId: string): Promise<number> {
  const result = await db
    .update(portalNotifications)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(portalNotifications.userId, userId),
        isNull(portalNotifications.readAt),
        isNull(portalNotifications.dismissedAt),
      ),
    )
    .returning({ id: portalNotifications.id });
  return result.length;
}

/**
 * Dismiss a notification (soft delete). Sets dismissedAt.
 * Returns the row if found, null if not found for this user.
 */
export async function dismissPortalNotification(
  id: string,
  userId: string,
): Promise<PortalNotification | null> {
  const [record] = await db
    .update(portalNotifications)
    .set({ dismissedAt: sql`now()` })
    .where(and(eq(portalNotifications.id, id), eq(portalNotifications.userId, userId)))
    .returning();
  return record ?? null;
}

/**
 * Count unread, non-dismissed notifications for a user.
 */
export async function getPortalUnreadCount(userId: string): Promise<number> {
  const [result] = await db
    .select({ value: sqlCount() })
    .from(portalNotifications)
    .where(
      and(
        eq(portalNotifications.userId, userId),
        isNull(portalNotifications.readAt),
        isNull(portalNotifications.dismissedAt),
      ),
    );
  return Number(result?.value ?? 0);
}

/**
 * Hard-delete notifications older than a given date.
 * Returns count of deleted rows.
 */
export async function deleteOldPortalNotifications(olderThan: Date): Promise<number> {
  const result = await db
    .delete(portalNotifications)
    .where(lt(portalNotifications.createdAt, olderThan))
    .returning({ id: portalNotifications.id });
  return result.length;
}
