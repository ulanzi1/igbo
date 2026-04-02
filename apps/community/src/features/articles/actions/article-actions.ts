"use server";

import { saveDraft, submitArticle } from "@/services/article-service";
import { requireAuthenticatedSession } from "@/services/permissions";
import type { ArticleCategory, ArticleVisibility } from "@igbo/db/schema/community-articles";

interface SaveDraftActionInput {
  articleId?: string;
  title: string;
  titleIgbo?: string | null;
  content: string;
  contentIgbo?: string | null;
  category: ArticleCategory;
  visibility: ArticleVisibility;
  coverImageUrl?: string | null;
  tags?: string[];
}

type SaveDraftResult =
  | { success: true; articleId: string; slug: string }
  | { success: false; error: string };

export async function saveDraftAction(input: SaveDraftActionInput): Promise<SaveDraftResult> {
  try {
    const { userId } = await requireAuthenticatedSession();
    const result = await saveDraft(userId, {
      articleId: input.articleId,
      title: input.title,
      titleIgbo: input.titleIgbo ?? null,
      content: input.content,
      contentIgbo: input.contentIgbo ?? null,
      category: input.category,
      visibility: input.visibility,
      coverImageUrl: input.coverImageUrl ?? null,
      tags: input.tags,
    });
    return { success: true, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save draft";
    return { success: false, error: msg };
  }
}

interface SubmitArticleActionInput {
  articleId: string;
}

type SubmitArticleResult = { success: true } | { success: false; error: string };

export async function submitArticleAction(
  input: SubmitArticleActionInput,
): Promise<SubmitArticleResult> {
  try {
    const { userId } = await requireAuthenticatedSession();
    await submitArticle(userId, input.articleId);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit article";
    return { success: false, error: msg };
  }
}
