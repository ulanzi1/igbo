import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { getTopPointsEarners, getThrottledUsersReport } from "@igbo/db/queries/points";
import { z } from "zod/v4";

const VALID_ACTIVITY_TYPES = ["like_received", "event_attended", "article_published"] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  activityType: z.enum(VALID_ACTIVITY_TYPES).optional(),
  view: z.enum(["leaderboard", "flagged"]).default("leaderboard"),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid query params",
      status: 400,
    });
  }

  const { page, limit, dateFrom, dateTo, activityType, view } = parsed.data;

  // Validate dateFrom <= dateTo when both provided
  if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
    throw new ApiError({
      title: "Invalid date range",
      detail: "dateFrom must be before or equal to dateTo",
      status: 400,
    });
  }

  if (view === "flagged") {
    const { users, total } = await getThrottledUsersReport({ page, limit });
    return successResponse({ data: users, pagination: { page, limit, total } });
  }

  const { users, total } = await getTopPointsEarners({
    page,
    limit,
    dateFrom,
    dateTo,
    activityType,
  });
  return successResponse({ data: users, pagination: { page, limit, total } });
});
