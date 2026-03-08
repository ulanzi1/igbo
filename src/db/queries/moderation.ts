import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformModerationKeywords, platformModerationActions } from "@/db/schema/moderation";
import type { Keyword } from "@/lib/moderation-scanner";

/**
 * Fetch all active keywords for content scanning.
 * Returns only the fields needed by scanContent() (keyword, category, severity).
 */
export async function getActiveKeywords(): Promise<Keyword[]> {
  const rows = await db
    .select({
      keyword: platformModerationKeywords.keyword,
      category: platformModerationKeywords.category,
      severity: platformModerationKeywords.severity,
    })
    .from(platformModerationKeywords)
    .where(eq(platformModerationKeywords.isActive, true));
  return rows;
}

export interface InsertModerationActionParams {
  contentType: "post" | "article" | "message";
  contentId: string;
  contentAuthorId: string;
  contentPreview: string | null;
  flagReason: string;
  keywordMatched: string | null;
  autoFlagged?: boolean;
}

/**
 * Insert a moderation flag record.
 * Uses ON CONFLICT DO NOTHING — one flag per content item.
 * Returns { id } of inserted row, or null when a flag already exists (conflict).
 */
export async function insertModerationAction(
  params: InsertModerationActionParams,
): Promise<{ id: string } | null> {
  const rows = await db
    .insert(platformModerationActions)
    .values({
      contentType: params.contentType,
      contentId: params.contentId,
      contentAuthorId: params.contentAuthorId,
      contentPreview: params.contentPreview,
      flagReason: params.flagReason,
      keywordMatched: params.keywordMatched,
      autoFlagged: params.autoFlagged ?? true,
    })
    .onConflictDoNothing()
    .returning({ id: platformModerationActions.id });

  return rows[0] ?? null;
}
