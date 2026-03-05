import "server-only";
import { ApiError } from "@/lib/api-error";
import { generateSlug } from "@/lib/slug";
import { eventBus } from "@/services/event-bus";
import { PERMISSION_MATRIX } from "@/services/permissions";
import {
  createArticle,
  updateArticle,
  submitArticleForReview,
  getArticleForEditing,
  countWeeklyArticleSubmissions,
  upsertArticleTags,
} from "@/db/queries/articles";
import { getUserMembershipTier } from "@/db/queries/auth-permissions";
import type { MembershipTier } from "@/db/queries/auth-permissions";
import type { ArticleCategory, ArticleVisibility } from "@/db/schema/community-articles";

/** Map DB visibility enum values to PERMISSION_MATRIX values for validation. */
const VISIBILITY_DB_TO_MATRIX: Record<string, string> = {
  guest: "PUBLIC",
  members_only: "MEMBERS_ONLY",
};

function validateVisibility(
  tier: MembershipTier,
  visibility: ArticleVisibility,
): ArticleVisibility {
  const matrixValue = VISIBILITY_DB_TO_MATRIX[visibility];
  const allowedValues = PERMISSION_MATRIX[tier].articleVisibility as readonly string[];
  if (matrixValue && allowedValues.includes(matrixValue)) {
    return visibility;
  }
  // Force members_only when requested visibility is not allowed for this tier
  return "members_only";
}

export interface SaveDraftInput {
  articleId?: string; // present when updating an existing draft
  title?: string; // required for create; optional for update
  titleIgbo?: string | null;
  content?: string; // Tiptap JSON stringified; required for create; optional for update
  contentIgbo?: string | null;
  coverImageUrl?: string | null;
  category?: ArticleCategory;
  visibility?: ArticleVisibility;
  tags?: string[];
}

/** Compute reading time from plain-text word count (~200 wpm). */
function computeReadingTime(tiptapJsonStr: string): number {
  try {
    const json = JSON.parse(tiptapJsonStr) as { content?: unknown[] };
    const text = extractText(json);
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount / 200));
  } catch {
    return 1;
  }
}

function extractText(node: { text?: string; content?: unknown[] }): string {
  let result = "";
  if (node.text) result += node.text + " ";
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      result += extractText(child as { text?: string; content?: unknown[] });
    }
  }
  return result;
}

/** Derive language field from English + Igbo content presence. */
function deriveLanguage(content: string, contentIgbo?: string | null): "en" | "ig" | "both" {
  const hasIgbo =
    contentIgbo && contentIgbo !== '{"type":"doc","content":[]}' && contentIgbo.trim().length > 0;
  return hasIgbo ? "both" : "en";
}

export async function saveDraft(
  authorId: string,
  input: SaveDraftInput,
): Promise<{ articleId: string; slug: string }> {
  const tier = await getUserMembershipTier(authorId);
  if (!PERMISSION_MATRIX[tier].canPublishArticle) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Articles.permissions.notEligible",
    });
  }

  if (input.articleId) {
    // Update existing draft — all fields optional
    const updateData: Parameters<typeof updateArticle>[2] = {};
    if (input.title !== undefined) updateData.title = input.title;
    if ("titleIgbo" in input) updateData.titleIgbo = input.titleIgbo ?? null;
    if (input.content !== undefined) {
      updateData.content = input.content;
      updateData.language = deriveLanguage(input.content, input.contentIgbo);
      updateData.readingTimeMinutes = computeReadingTime(input.content);
    }
    if ("contentIgbo" in input) updateData.contentIgbo = input.contentIgbo ?? null;
    if ("coverImageUrl" in input) updateData.coverImageUrl = input.coverImageUrl ?? null;
    if (input.visibility !== undefined)
      updateData.visibility = validateVisibility(tier, input.visibility);
    if (input.category !== undefined) updateData.category = input.category;

    const updated = await updateArticle(input.articleId, authorId, updateData);

    if (!updated) {
      throw new ApiError({
        title: "Not Found",
        status: 404,
        detail: "Article not found or not editable",
      });
    }

    if (input.tags !== undefined) {
      await upsertArticleTags(input.articleId, input.tags.slice(0, 10));
    }

    const article = await getArticleForEditing(input.articleId, authorId);
    return { articleId: input.articleId, slug: article!.slug };
  } else {
    // Create new draft — title and content are required
    if (!input.title || !input.content) {
      throw new ApiError({
        title: "Unprocessable Entity",
        status: 422,
        detail: "Articles.validation.englishRequired",
      });
    }
    const language = deriveLanguage(input.content, input.contentIgbo);
    const readingTimeMinutes = computeReadingTime(input.content);
    const slug = generateSlug(input.title);
    const created = await createArticle({
      authorId,
      title: input.title,
      titleIgbo: input.titleIgbo ?? null,
      slug,
      content: input.content,
      contentIgbo: input.contentIgbo ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      language,
      visibility: validateVisibility(tier, input.visibility ?? "members_only"),
      category: input.category ?? "discussion",
      readingTimeMinutes,
    });

    if (input.tags && input.tags.length > 0) {
      await upsertArticleTags(created.id, input.tags.slice(0, 10));
    }

    return { articleId: created.id, slug: created.slug };
  }
}

export async function submitArticle(
  authorId: string,
  articleId: string,
): Promise<{ articleId: string }> {
  const tier = await getUserMembershipTier(authorId);
  if (!PERMISSION_MATRIX[tier].canPublishArticle) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Articles.permissions.notEligible",
    });
  }

  const weeklyCount = await countWeeklyArticleSubmissions(authorId);
  const maxPerWeek = PERMISSION_MATRIX[tier].maxArticlesPerWeek;
  if (weeklyCount >= maxPerWeek) {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Articles.permissions.weeklyLimitReached",
    });
  }

  const submitted = await submitArticleForReview(articleId, authorId);
  if (!submitted) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "Article not found or not in draft status",
    });
  }

  await eventBus.emit("article.submitted", {
    articleId,
    authorId,
    timestamp: new Date().toISOString(),
  });

  return { articleId };
}

export async function getArticleForEditingService(
  authorId: string,
  articleId: string,
): Promise<typeof import("@/db/schema/community-articles").communityArticles.$inferSelect> {
  const article = await getArticleForEditing(articleId, authorId);
  if (!article) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Article not found" });
  }
  return article;
}
