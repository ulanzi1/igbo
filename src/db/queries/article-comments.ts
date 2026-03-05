// No "server-only" — consistent with articles.ts, posts.ts.
// This file is used by article-comment-service.ts (server-only) and tests.
import { eq, and, isNull, sql, count, asc } from "drizzle-orm";
import { db } from "@/db";
import { communityArticleComments } from "@/db/schema/community-article-comments";
import { communityArticles } from "@/db/schema/community-articles";
import { communityProfiles } from "@/db/schema/community-profiles";

export interface ArticleCommentItem {
  id: string;
  articleId: string;
  authorId: string;
  authorName: string | null;
  authorPhotoUrl: string | null;
  content: string;
  parentCommentId: string | null;
  createdAt: Date;
}

export interface AddArticleCommentData {
  articleId: string;
  authorId: string;
  content: string;
  parentCommentId?: string | null;
}

export async function addArticleComment(
  data: AddArticleCommentData,
): Promise<{ id: string; articleId: string; authorId: string; content: string; createdAt: Date }> {
  return db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(communityArticleComments)
      .values({
        articleId: data.articleId,
        authorId: data.authorId,
        content: data.content,
        parentCommentId: data.parentCommentId ?? null,
      })
      .returning({
        id: communityArticleComments.id,
        articleId: communityArticleComments.articleId,
        authorId: communityArticleComments.authorId,
        content: communityArticleComments.content,
        createdAt: communityArticleComments.createdAt,
      });

    await tx
      .update(communityArticles)
      .set({ commentCount: sql`${communityArticles.commentCount} + 1` })
      .where(eq(communityArticles.id, data.articleId));

    return comment!;
  });
}

export async function listArticleComments(
  articleId: string,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ items: ArticleCommentItem[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));

  const condition = and(
    eq(communityArticleComments.articleId, articleId),
    isNull(communityArticleComments.parentCommentId),
    isNull(communityArticleComments.deletedAt),
  );

  const [items, [countRow]] = await Promise.all([
    db
      .select({
        id: communityArticleComments.id,
        articleId: communityArticleComments.articleId,
        authorId: communityArticleComments.authorId,
        authorName: communityProfiles.displayName,
        authorPhotoUrl: communityProfiles.photoUrl,
        content: communityArticleComments.content,
        parentCommentId: communityArticleComments.parentCommentId,
        createdAt: communityArticleComments.createdAt,
      })
      .from(communityArticleComments)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, communityArticleComments.authorId))
      .where(condition)
      .orderBy(asc(communityArticleComments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(communityArticleComments).where(condition),
  ]);

  return { items, total: countRow?.total ?? 0 };
}
