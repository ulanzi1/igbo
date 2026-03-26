import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  getAdminUserPointsProfile,
  getPointsSummaryStats,
  getPointsLedgerHistory,
  getUserThrottleHistory,
} from "@/db/queries/points";
import { z } from "zod/v4";

const VALID_ACTIVITY_TYPES = ["like_received", "event_attended", "article_published"] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  activityType: z.enum(VALID_ACTIVITY_TYPES).optional(),
  throttlePage: z.coerce.number().int().min(1).default(1),
  throttleLimit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  // Extract [userId] — segment at position -2 in /admin/members/[userId]/points
  const userId = url.pathname.split("/").at(-2) ?? "";

  const uuidParsed = z.string().uuid().safeParse(userId);
  if (!uuidParsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: uuidParsed.error.issues[0]?.message ?? "Invalid userId",
      status: 400,
    });
  }

  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid query params",
      status: 400,
    });
  }

  const { page, limit, activityType, throttlePage, throttleLimit } = parsed.data;

  const [profile, summary, ledger, throttleHistory] = await Promise.all([
    getAdminUserPointsProfile(userId),
    getPointsSummaryStats(userId),
    getPointsLedgerHistory(userId, { page, limit, activityType }),
    getUserThrottleHistory(userId, { page: throttlePage, limit: throttleLimit }),
  ]);

  if (!profile) {
    return errorResponse({
      type: "about:blank",
      title: "Not Found",
      detail: "Member not found",
      status: 404,
    });
  }

  return successResponse({ profile, summary, ledger, throttleHistory });
});
