// No "server-only" — consistent with posts.ts, follows.ts, feed.ts.
// This file is used by article-service.ts (server-only) and tests.
import { eq, and, gte, inArray, sql, count, asc, desc } from "drizzle-orm";
import { db } from "../index";
import { communityArticles, communityArticleTags } from "../schema/community-articles";
import { communityProfiles } from "../schema/community-profiles";
import { communityUserBadges } from "../schema/community-badges";
import type { ArticleCategory, ArticleVisibility } from "../schema/community-articles";

export interface CreateArticleData {
  authorId: string;
  title: string;
  titleIgbo?: string | null;
  slug: string;
  content: string;
  contentIgbo?: string | null;
  coverImageUrl?: string | null;
  language: "en" | "ig" | "both";
  visibility: ArticleVisibility;
  category: ArticleCategory;
  readingTimeMinutes: number;
}

export interface UpdateArticleData {
  title?: string;
  titleIgbo?: string | null;
  content?: string;
  contentIgbo?: string | null;
  coverImageUrl?: string | null;
  language?: "en" | "ig" | "both";
  visibility?: ArticleVisibility;
  category?: ArticleCategory;
  readingTimeMinutes?: number;
}

export async function createArticle(
  data: CreateArticleData,
): Promise<{ id: string; slug: string }> {
  const [row] = await db
    .insert(communityArticles)
    .values({
      authorId: data.authorId,
      title: data.title,
      titleIgbo: data.titleIgbo ?? null,
      slug: data.slug,
      content: data.content,
      contentIgbo: data.contentIgbo ?? null,
      coverImageUrl: data.coverImageUrl ?? null,
      language: data.language,
      visibility: data.visibility,
      category: data.category,
      readingTimeMinutes: data.readingTimeMinutes,
    })
    .returning({ id: communityArticles.id, slug: communityArticles.slug });

  return row!;
}

export async function updateArticle(
  articleId: string,
  authorId: string,
  data: UpdateArticleData,
): Promise<{ id: string } | null> {
  const updates: Partial<typeof communityArticles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.title !== undefined) updates.title = data.title;
  if (data.titleIgbo !== undefined) updates.titleIgbo = data.titleIgbo;
  if (data.content !== undefined) updates.content = data.content;
  if (data.contentIgbo !== undefined) updates.contentIgbo = data.contentIgbo;
  if (data.coverImageUrl !== undefined) updates.coverImageUrl = data.coverImageUrl;
  if (data.language !== undefined) updates.language = data.language;
  if (data.visibility !== undefined) updates.visibility = data.visibility;
  if (data.category !== undefined) updates.category = data.category;
  if (data.readingTimeMinutes !== undefined) updates.readingTimeMinutes = data.readingTimeMinutes;

  const [row] = await db
    .update(communityArticles)
    .set(updates)
    .where(
      and(
        eq(communityArticles.id, articleId),
        eq(communityArticles.authorId, authorId),
        inArray(communityArticles.status, ["draft", "revision_requested", "rejected"]),
      ),
    )
    .returning({ id: communityArticles.id });

  return row ?? null;
}

export async function submitArticleForReview(
  articleId: string,
  authorId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .update(communityArticles)
    .set({ status: "pending_review", updatedAt: new Date() })
    .where(
      and(
        eq(communityArticles.id, articleId),
        eq(communityArticles.authorId, authorId),
        inArray(communityArticles.status, ["draft", "revision_requested", "rejected"]),
      ),
    )
    .returning({ id: communityArticles.id });

  return row ?? null;
}

export async function getArticleForEditing(
  articleId: string,
  authorId: string,
): Promise<typeof communityArticles.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(communityArticles)
    .where(
      and(
        eq(communityArticles.id, articleId),
        eq(communityArticles.authorId, authorId),
        sql`${communityArticles.deletedAt} IS NULL`,
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function countWeeklyArticleSubmissions(authorId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityArticles)
    .where(
      and(
        eq(communityArticles.authorId, authorId),
        gte(communityArticles.createdAt, sevenDaysAgo),
        inArray(communityArticles.status, ["pending_review", "published"]),
      ),
    );

  return row?.count ?? 0;
}

export interface PaginatedArticleListOptions {
  page?: number;
  pageSize?: number;
}

export interface AdminArticleListItem {
  id: string;
  title: string;
  authorId: string;
  authorName: string | null;
  language: "en" | "ig" | "both";
  category: "discussion" | "announcement" | "event";
  createdAt: Date;
  slug: string;
  isFeatured: boolean;
  status: "draft" | "pending_review" | "published" | "revision_requested" | "rejected";
}

export async function listPendingArticles(
  options: PaginatedArticleListOptions = {},
): Promise<{ items: AdminArticleListItem[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));

  const [items, [countRow]] = await Promise.all([
    db
      .select({
        id: communityArticles.id,
        title: communityArticles.title,
        authorId: communityArticles.authorId,
        authorName: communityProfiles.displayName,
        language: communityArticles.language,
        category: communityArticles.category,
        createdAt: communityArticles.createdAt,
        slug: communityArticles.slug,
        isFeatured: communityArticles.isFeatured,
        status: communityArticles.status,
      })
      .from(communityArticles)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticles.authorId))
      .where(eq(communityArticles.status, "pending_review"))
      .orderBy(asc(communityArticles.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(communityArticles)
      .where(eq(communityArticles.status, "pending_review")),
  ]);

  return { items, total: countRow?.total ?? 0 };
}

export async function listPublishedArticles(
  options: PaginatedArticleListOptions = {},
): Promise<{ items: AdminArticleListItem[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));

  const [items, [countRow]] = await Promise.all([
    db
      .select({
        id: communityArticles.id,
        title: communityArticles.title,
        authorId: communityArticles.authorId,
        authorName: communityProfiles.displayName,
        language: communityArticles.language,
        category: communityArticles.category,
        createdAt: communityArticles.createdAt,
        slug: communityArticles.slug,
        isFeatured: communityArticles.isFeatured,
        status: communityArticles.status,
      })
      .from(communityArticles)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticles.authorId))
      .where(eq(communityArticles.status, "published"))
      .orderBy(desc(communityArticles.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(communityArticles)
      .where(eq(communityArticles.status, "published")),
  ]);

  return { items, total: countRow?.total ?? 0 };
}

export async function getArticleByIdForAdmin(
  articleId: string,
): Promise<typeof communityArticles.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(communityArticles)
    .where(eq(communityArticles.id, articleId))
    .limit(1);

  return row ?? null;
}

export async function publishArticleById(
  articleId: string,
): Promise<{ id: string; authorId: string; title: string; slug: string } | null> {
  const [row] = await db
    .update(communityArticles)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(communityArticles.id, articleId), eq(communityArticles.status, "pending_review")))
    .returning({
      id: communityArticles.id,
      authorId: communityArticles.authorId,
      title: communityArticles.title,
      slug: communityArticles.slug,
    });

  return row ?? null;
}

export async function rejectArticleById(
  articleId: string,
  feedback: string,
): Promise<{ id: string; authorId: string; title: string } | null> {
  const [row] = await db
    .update(communityArticles)
    .set({ status: "rejected", rejectionFeedback: feedback, updatedAt: new Date() })
    .where(and(eq(communityArticles.id, articleId), eq(communityArticles.status, "pending_review")))
    .returning({
      id: communityArticles.id,
      authorId: communityArticles.authorId,
      title: communityArticles.title,
    });

  return row ?? null;
}

export async function requestRevisionById(
  articleId: string,
  feedback: string,
): Promise<{ id: string; authorId: string; title: string } | null> {
  const [row] = await db
    .update(communityArticles)
    .set({ status: "revision_requested", rejectionFeedback: feedback, updatedAt: new Date() })
    .where(and(eq(communityArticles.id, articleId), eq(communityArticles.status, "pending_review")))
    .returning({
      id: communityArticles.id,
      authorId: communityArticles.authorId,
      title: communityArticles.title,
    });
  return row ?? null;
}

export interface AuthorArticleListItem {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "pending_review" | "published" | "revision_requested" | "rejected";
  category: "discussion" | "announcement" | "event";
  isFeatured: boolean;
  viewCount: number;
  commentCount: number;
  updatedAt: Date;
  createdAt: Date;
}

export async function listArticlesByAuthor(authorId: string): Promise<AuthorArticleListItem[]> {
  return db
    .select({
      id: communityArticles.id,
      title: communityArticles.title,
      slug: communityArticles.slug,
      status: communityArticles.status,
      category: communityArticles.category,
      isFeatured: communityArticles.isFeatured,
      viewCount: communityArticles.viewCount,
      commentCount: communityArticles.commentCount,
      updatedAt: communityArticles.updatedAt,
      createdAt: communityArticles.createdAt,
    })
    .from(communityArticles)
    .where(
      and(eq(communityArticles.authorId, authorId), sql`${communityArticles.deletedAt} IS NULL`),
    )
    .orderBy(desc(communityArticles.updatedAt));
}

export async function toggleArticleFeature(
  articleId: string,
  featured: boolean,
): Promise<{ id: string } | null> {
  const [row] = await db
    .update(communityArticles)
    .set({ isFeatured: featured, updatedAt: new Date() })
    .where(and(eq(communityArticles.id, articleId), eq(communityArticles.status, "published")))
    .returning({ id: communityArticles.id });

  return row ?? null;
}

export interface PublicArticleListItem {
  id: string;
  title: string;
  titleIgbo: string | null;
  slug: string;
  coverImageUrl: string | null;
  language: "en" | "ig" | "both";
  category: "discussion" | "announcement" | "event";
  visibility: "guest" | "members_only";
  isFeatured: boolean;
  readingTimeMinutes: number;
  createdAt: Date;
  authorName: string | null;
}

export async function listPublishedArticlesPublic(
  options: PaginatedArticleListOptions = {},
): Promise<{ items: PublicArticleListItem[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));

  const condition = and(
    eq(communityArticles.status, "published"),
    sql`${communityArticles.deletedAt} IS NULL`,
  );

  const [items, [countRow]] = await Promise.all([
    db
      .select({
        id: communityArticles.id,
        title: communityArticles.title,
        titleIgbo: communityArticles.titleIgbo,
        slug: communityArticles.slug,
        coverImageUrl: communityArticles.coverImageUrl,
        language: communityArticles.language,
        category: communityArticles.category,
        visibility: communityArticles.visibility,
        isFeatured: communityArticles.isFeatured,
        readingTimeMinutes: communityArticles.readingTimeMinutes,
        createdAt: communityArticles.createdAt,
        authorName: communityProfiles.displayName,
      })
      .from(communityArticles)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticles.authorId))
      .where(condition)
      .orderBy(desc(communityArticles.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(communityArticles).where(condition),
  ]);

  return { items, total: countRow?.total ?? 0 };
}

export interface PublicArticleFull {
  id: string;
  title: string;
  titleIgbo: string | null;
  slug: string;
  content: string;
  contentIgbo: string | null;
  coverImageUrl: string | null;
  language: "en" | "ig" | "both";
  visibility: "guest" | "members_only";
  category: "discussion" | "announcement" | "event";
  isFeatured: boolean;
  readingTimeMinutes: number;
  viewCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  authorName: string | null;
  authorId: string;
  authorBadgeType: "blue" | "red" | "purple" | null;
}

export async function getPublishedArticleBySlug(slug: string): Promise<PublicArticleFull | null> {
  const [row] = await db
    .select({
      id: communityArticles.id,
      title: communityArticles.title,
      titleIgbo: communityArticles.titleIgbo,
      slug: communityArticles.slug,
      content: communityArticles.content,
      contentIgbo: communityArticles.contentIgbo,
      coverImageUrl: communityArticles.coverImageUrl,
      language: communityArticles.language,
      visibility: communityArticles.visibility,
      category: communityArticles.category,
      isFeatured: communityArticles.isFeatured,
      readingTimeMinutes: communityArticles.readingTimeMinutes,
      viewCount: communityArticles.viewCount,
      commentCount: communityArticles.commentCount,
      createdAt: communityArticles.createdAt,
      updatedAt: communityArticles.updatedAt,
      authorName: communityProfiles.displayName,
      authorId: communityArticles.authorId,
      authorBadgeType: communityUserBadges.badgeType,
    })
    .from(communityArticles)
    .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticles.authorId))
    .leftJoin(communityUserBadges, eq(communityUserBadges.userId, communityArticles.authorId))
    .where(
      and(
        eq(communityArticles.slug, slug),
        eq(communityArticles.status, "published"),
        sql`${communityArticles.deletedAt} IS NULL`,
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function incrementArticleViewCount(articleId: string): Promise<void> {
  await db
    .update(communityArticles)
    .set({ viewCount: sql`${communityArticles.viewCount} + 1` })
    .where(eq(communityArticles.id, articleId));
}

export interface RelatedArticle {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  readingTimeMinutes: number;
  authorName: string | null;
}

export async function getRelatedArticles(
  articleId: string,
  authorId: string,
  tags: string[],
  limit = 3,
): Promise<RelatedArticle[]> {
  if (tags.length > 0) {
    const tagList = sql.join(
      tags.map((t) => sql`${t}`),
      sql`, `,
    );
    const rows = await db.execute(sql`
      SELECT DISTINCT ca.id, ca.title, ca.slug, ca.cover_image_url,
             ca.reading_time_minutes, cp.display_name AS author_name,
             ca.created_at
      FROM community_articles ca
      LEFT JOIN community_profiles cp ON cp.user_id = ca.author_id
      LEFT JOIN community_article_tags cat ON cat.article_id = ca.id
      WHERE ca.status = 'published'
        AND ca.deleted_at IS NULL
        AND ca.id != ${articleId}
        AND (cat.tag IN (${tagList}) OR ca.author_id = ${authorId})
      ORDER BY ca.created_at DESC
      LIMIT ${limit}
    `);
    return Array.from(rows).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        title: r.title as string,
        slug: r.slug as string,
        coverImageUrl: (r.cover_image_url as string | null) ?? null,
        readingTimeMinutes: r.reading_time_minutes as number,
        authorName: (r.author_name as string | null) ?? null,
      };
    });
  }

  // No tags — return other articles by same author
  const rows = await db
    .select({
      id: communityArticles.id,
      title: communityArticles.title,
      slug: communityArticles.slug,
      coverImageUrl: communityArticles.coverImageUrl,
      readingTimeMinutes: communityArticles.readingTimeMinutes,
      authorName: communityProfiles.displayName,
    })
    .from(communityArticles)
    .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticles.authorId))
    .where(
      and(
        eq(communityArticles.status, "published"),
        sql`${communityArticles.deletedAt} IS NULL`,
        sql`${communityArticles.id} != ${articleId}`,
        eq(communityArticles.authorId, authorId),
      ),
    )
    .orderBy(desc(communityArticles.createdAt))
    .limit(limit);

  return rows;
}

export async function getArticleTagsById(articleId: string): Promise<string[]> {
  const rows = await db
    .select({ tag: communityArticleTags.tag })
    .from(communityArticleTags)
    .where(eq(communityArticleTags.articleId, articleId));
  return rows.map((r) => r.tag);
}

export async function upsertArticleTags(articleId: string, tags: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(communityArticleTags).where(eq(communityArticleTags.articleId, articleId));

    if (tags.length > 0) {
      await tx.insert(communityArticleTags).values(tags.map((tag) => ({ articleId, tag })));
    }
  });
}

/**
 * Get all scannable text content of an article for moderation scanning.
 * Returns EN content + Igbo content concatenated (F3: bilingual scan coverage).
 * Returns null if the article is not found or has been deleted.
 * Note: content columns store Tiptap JSON — caller must extract plain text before scanning.
 */
export async function getArticleContent(articleId: string): Promise<string | null> {
  const [row] = await db
    .select({
      content: communityArticles.content,
      contentIgbo: communityArticles.contentIgbo,
      titleIgbo: communityArticles.titleIgbo,
    })
    .from(communityArticles)
    .where(and(eq(communityArticles.id, articleId), sql`${communityArticles.deletedAt} IS NULL`))
    .limit(1);
  if (!row) return null;
  // Concatenate all text fields; nullish fields are skipped
  const parts = [row.content, row.contentIgbo, row.titleIgbo].filter(Boolean);
  return parts.join(" ");
}

/**
 * Soft-delete an article by admin moderation.
 * Returns the deleted article row or null if not found.
 */
export async function softDeleteArticleByModeration(
  articleId: string,
): Promise<typeof communityArticles.$inferSelect | null> {
  const [updated] = await db
    .update(communityArticles)
    .set({ deletedAt: new Date() })
    .where(and(eq(communityArticles.id, articleId), sql`${communityArticles.deletedAt} IS NULL`))
    .returning();
  return updated ?? null;
}
