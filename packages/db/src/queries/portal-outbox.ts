import { db } from "../index";
import { portalOutbox } from "../schema/portal-outbox";
import type { PortalOutboxEvent } from "../schema/portal-outbox";
import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

const MAX_RETRIES = 10;

/**
 * Inserts a new outbox event within a transaction.
 * Called atomically alongside the view dedup + viewed_at update.
 */
export async function insertOutboxEvent(
  tx: PgTransaction<any, any, any>,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<PortalOutboxEvent> {
  const [row] = await tx.insert(portalOutbox).values({ eventType, payload }).returning();
  if (!row) throw new Error("Failed to insert outbox event");
  return row;
}

/**
 * Atomically claims pending outbox events by setting status='processing'.
 * Uses UPDATE...RETURNING so rows are claimed in a single statement —
 * no long-held transaction needed and concurrent pollers claim different rows.
 *
 * Note: Drizzle ORM does not support FOR UPDATE SKIP LOCKED natively.
 * db.execute() returns raw rows — we map to camelCase before returning.
 */
export async function claimPendingOutboxEvents(limit = 100): Promise<PortalOutboxEvent[]> {
  const rows = await db.execute(sql`
    UPDATE portal_outbox
    SET status = 'processing'
    WHERE id IN (
      SELECT id FROM portal_outbox
      WHERE status = 'pending'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    AND status = 'pending'
    RETURNING id, event_type, payload, status, retry_count, created_at, processed_at
  `);
  return Array.from(rows).map((row: any) => ({
    id: row.id as string,
    eventType: row.event_type as string,
    payload: row.payload as Record<string, unknown>,
    status: row.status as string,
    retryCount: row.retry_count as number,
    createdAt: row.created_at as Date,
    processedAt: row.processed_at as Date | null,
  }));
}

/**
 * Marks a single outbox event as processed with the current timestamp.
 */
export async function markOutboxEventProcessed(id: string): Promise<void> {
  await db
    .update(portalOutbox)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(portalOutbox.id, id));
}

/**
 * Atomically increments retry_count and sets status back to 'pending' (for retry)
 * or 'failed' (if MAX_RETRIES reached). Uses SQL expressions for race-safe increment.
 */
export async function incrementOutboxRetryCount(id: string): Promise<void> {
  await db.execute(sql`
    UPDATE portal_outbox
    SET retry_count = retry_count + 1,
        status = CASE WHEN retry_count + 1 >= ${MAX_RETRIES} THEN 'failed' ELSE 'pending' END
    WHERE id = ${id}
  `);
}

/**
 * Deletes processed outbox events older than `olderThanDays` days.
 * Returns the number of deleted rows.
 */
export async function cleanupProcessedOutboxEvents(olderThanDays: number): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM portal_outbox
    WHERE status = 'processed'
      AND processed_at < now() - interval '1 day' * ${olderThanDays}
  `);
  // postgres.js returns an object with rowCount on delete statements
  return (result as any).count ?? 0;
}
