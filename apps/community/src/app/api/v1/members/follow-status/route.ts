import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { batchIsFollowing } from "@igbo/db/queries/follows";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// GET /api/v1/members/follow-status?userIds=id1,id2,...
// Returns { data: Record<userId, boolean> }
// Maximum 50 userIds per request.

const MAX_USER_IDS = 50;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
    const { userId } = await getSession();
    return `follow-status-batch:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.FOLLOW_STATUS_BATCH,
};

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const raw = url.searchParams.get("userIds") ?? "";

  if (!raw) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "userIds query param is required",
    });
  }

  const userIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "At least one userId is required",
    });
  }

  if (userIds.length > MAX_USER_IDS) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Maximum ${MAX_USER_IDS} userIds per request`,
    });
  }

  const invalid = userIds.filter((id) => !uuidRegex.test(id));
  if (invalid.length > 0) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid user IDs: ${invalid.join(", ")}`,
    });
  }

  const statuses = await batchIsFollowing(userId, userIds);
  return successResponse(statuses);
};

export const GET = withApiHandler(getHandler, { rateLimit: rateLimitConfig });
