// POST /api/v1/articles — create a new article draft
import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { canPublishArticle } from "@igbo/auth/permissions";
import { saveDraft } from "@/services/article-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  titleIgbo: z.string().max(255).nullable().optional(),
  contentIgbo: z.string().nullable().optional(),
  category: z.enum(["discussion", "announcement", "event"]),
  visibility: z.enum(["guest", "members_only"]),
  coverImageUrl: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const permission = await canPublishArticle(userId);
  if (!permission.allowed) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: permission.reason ?? "Articles.permissions.notEligible",
    });
  }

  const body: unknown = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const { articleId, slug } = await saveDraft(userId, {
    title: parsed.data.title,
    titleIgbo: parsed.data.titleIgbo ?? null,
    content: parsed.data.content,
    contentIgbo: parsed.data.contentIgbo ?? null,
    category: parsed.data.category,
    visibility: parsed.data.visibility,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    tags: parsed.data.tags,
  });

  return successResponse({ articleId, slug }, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `article-create:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_CREATE,
  },
});
