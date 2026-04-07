import "server-only";
import { db } from "../index";
import { portalScreeningKeywords } from "../schema/portal-screening-keywords";
import type {
  NewPortalScreeningKeyword,
  PortalScreeningKeyword,
} from "../schema/portal-screening-keywords";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export type { PortalScreeningKeyword, NewPortalScreeningKeyword };

export interface ListScreeningKeywordsOptions {
  limit?: number;
  offset?: number;
  category?: string;
}

export async function listScreeningKeywords(
  options: ListScreeningKeywordsOptions = {},
): Promise<{ items: PortalScreeningKeyword[]; total: number }> {
  const { limit = 50, offset = 0, category } = options;

  const conditions = [isNull(portalScreeningKeywords.deletedAt)];
  if (category) {
    conditions.push(eq(portalScreeningKeywords.category, category));
  }
  const whereClause = and(...conditions);

  const [items, countRows] = await Promise.all([
    db
      .select()
      .from(portalScreeningKeywords)
      .where(whereClause)
      .orderBy(desc(portalScreeningKeywords.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(portalScreeningKeywords)
      .where(whereClause),
  ]);

  return { items, total: countRows[0]?.total ?? 0 };
}

export async function getScreeningKeywordById(id: string): Promise<PortalScreeningKeyword | null> {
  const [row] = await db
    .select()
    .from(portalScreeningKeywords)
    .where(and(eq(portalScreeningKeywords.id, id), isNull(portalScreeningKeywords.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function insertScreeningKeyword(
  data: NewPortalScreeningKeyword,
): Promise<PortalScreeningKeyword> {
  const [inserted] = await db.insert(portalScreeningKeywords).values(data).returning();
  if (!inserted) throw new Error("insertScreeningKeyword: no row returned");
  return inserted;
}

export async function updateScreeningKeyword(
  id: string,
  patch: Partial<Pick<NewPortalScreeningKeyword, "phrase" | "category" | "notes">>,
): Promise<PortalScreeningKeyword | null> {
  const [updated] = await db
    .update(portalScreeningKeywords)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(portalScreeningKeywords.id, id), isNull(portalScreeningKeywords.deletedAt)))
    .returning();
  return updated ?? null;
}

export async function softDeleteScreeningKeyword(id: string): Promise<boolean> {
  const [deleted] = await db
    .update(portalScreeningKeywords)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(portalScreeningKeywords.id, id), isNull(portalScreeningKeywords.deletedAt)))
    .returning({ id: portalScreeningKeywords.id });
  return !!deleted;
}

/** Returns the active (non-deleted) phrases as lowercased strings for engine consumption. */
export async function getActiveBlocklistPhrases(): Promise<string[]> {
  const rows = await db
    .select({ phrase: portalScreeningKeywords.phrase })
    .from(portalScreeningKeywords)
    .where(isNull(portalScreeningKeywords.deletedAt));
  return rows.map((r) => r.phrase.toLowerCase());
}
