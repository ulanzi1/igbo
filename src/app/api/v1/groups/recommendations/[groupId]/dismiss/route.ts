import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { dismissGroupRecommendation } from "@/db/queries/recommendations";
import { invalidateRecommendationCache } from "@/services/recommendation-service";

const uuidSchema = z.string().uuid();

const postHandler = async (req: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const groupId = new URL(req.url).pathname.split("/").at(-2);
  const parsed = uuidSchema.safeParse(groupId);
  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }

  await dismissGroupRecommendation(userId, parsed.data);
  await invalidateRecommendationCache(userId);

  return successResponse({ dismissed: true });
};

export const POST = withApiHandler(postHandler);
