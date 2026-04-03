// PATCH /api/v1/articles/[articleId] — update an existing article draft
import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { saveDraft } from "@/services/article-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  titleIgbo: z.string().max(255).nullable().optional(),
  contentIgbo: z.string().nullable().optional(),
  category: z.enum(["discussion", "announcement", "event"]).optional(),
  visibility: z.enum(["guest", "members_only"]).optional(),
  coverImageUrl: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const articleId = new URL(request.url).pathname.split("/").at(-1);
  if (!articleId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing articleId" });
  }

  const body: unknown = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const { articleId: updatedId } = await saveDraft(userId, {
    articleId,
    ...parsed.data,
  });

  return successResponse({ articleId: updatedId });
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `article-update:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.PROFILE_UPDATE,
  },
});
