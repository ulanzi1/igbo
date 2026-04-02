import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getPointsLedgerHistory } from "@igbo/db/queries/points";

const VALID_ACTIVITY_TYPES = new Set(["like_received", "event_attended", "article_published"]);

export const GET = withApiHandler(async (request) => {
  const { userId } = await requireAuthenticatedSession();
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20),
  );
  const rawType = url.searchParams.get("type") ?? undefined;
  const activityType = rawType && VALID_ACTIVITY_TYPES.has(rawType) ? rawType : undefined;

  if (rawType && !activityType) {
    return errorResponse({
      type: "about:blank",
      status: 400,
      title: "Invalid activity type filter",
    });
  }

  const { entries, total } = await getPointsLedgerHistory(userId, { page, limit, activityType });
  return successResponse({ entries, total, page, limit });
});
