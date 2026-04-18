import "server-only";
import { eq, ne, asc, desc, sql } from "drizzle-orm";
import { db } from "../index";
import { portalSavedSearches } from "../schema/portal-saved-searches";
import type { PortalSavedSearch, NewPortalSavedSearch } from "../schema/portal-saved-searches";

export type {
  PortalSavedSearch,
  NewPortalSavedSearch,
  PortalAlertFrequency,
} from "../schema/portal-saved-searches";

/**
 * Returns all saved searches for a user, ordered by created_at DESC.
 */
export async function getSavedSearchesByUserId(userId: string) {
  return db
    .select()
    .from(portalSavedSearches)
    .where(eq(portalSavedSearches.userId, userId))
    .orderBy(desc(portalSavedSearches.createdAt));
}

/**
 * Returns a single saved search by ID, or null if not found.
 */
export async function getSavedSearchById(id: string) {
  const [record] = await db
    .select()
    .from(portalSavedSearches)
    .where(eq(portalSavedSearches.id, id))
    .limit(1);
  return record ?? null;
}

/**
 * Returns the count of saved searches for a user.
 */
export async function countSavedSearchesByUserId(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(portalSavedSearches)
    .where(eq(portalSavedSearches.userId, userId));
  return result?.count ?? 0;
}

/**
 * Inserts a new saved search and returns the created record.
 */
export async function insertSavedSearch(data: NewPortalSavedSearch) {
  const [record] = await db.insert(portalSavedSearches).values(data).returning();
  if (!record) throw new Error("Insert returned no record");
  return record;
}

/**
 * Updates a saved search by ID and returns the updated record, or null if not found.
 */
export async function updateSavedSearch(
  id: string,
  data: Partial<Pick<PortalSavedSearch, "name" | "alertFrequency" | "lastAlertedAt">>,
) {
  const [record] = await db
    .update(portalSavedSearches)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(portalSavedSearches.id, id))
    .returning();
  return record ?? null;
}

/**
 * Deletes a saved search by ID. Returns true if a row was deleted.
 */
export async function deleteSavedSearch(id: string): Promise<boolean> {
  const result = await db
    .delete(portalSavedSearches)
    .where(eq(portalSavedSearches.id, id))
    .returning({ id: portalSavedSearches.id });
  return result.length > 0;
}

/**
 * Returns all saved searches where alert_frequency != 'off', ordered by user_id for digest grouping.
 */
export async function getSavedSearchesForAlerts() {
  return db
    .select()
    .from(portalSavedSearches)
    .where(ne(portalSavedSearches.alertFrequency, "off"))
    .orderBy(asc(portalSavedSearches.userId), asc(portalSavedSearches.createdAt));
}

/**
 * Returns all saved searches where alert_frequency = 'instant'.
 */
export async function getInstantAlertSearches() {
  return db
    .select()
    .from(portalSavedSearches)
    .where(eq(portalSavedSearches.alertFrequency, "instant"));
}

/**
 * Bulk updates last_alerted_at for the given search IDs.
 */
export async function batchUpdateLastAlertedAt(ids: string[], timestamp: Date): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(portalSavedSearches)
    .set({ lastAlertedAt: timestamp, updatedAt: new Date() })
    .where(sql`id = ANY(${ids}::uuid[])`);
}
