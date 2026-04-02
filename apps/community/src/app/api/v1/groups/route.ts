// GET /api/v1/groups — list groups (paginated, filterable by name)
// ?directory=true → includes public + private groups (for directory view)
// Without directory param → public groups only (default)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { listGroups, listGroupsForDirectory, batchGetGroupMemberships } from "@/db/queries/groups";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);
  const nameFilter = url.searchParams.get("name") ?? undefined;
  const isDirectory = url.searchParams.get("directory") === "true";

  if (isDirectory) {
    const groups = await listGroupsForDirectory({ cursor, limit, nameFilter });
    const nextCursor =
      groups.length === limit ? (groups[groups.length - 1]?.createdAt ?? null) : null;

    // Batch-fetch viewer memberships for all visible groups
    const groupIds = groups.map((g) => g.id);
    const memberships = await batchGetGroupMemberships(userId, groupIds);

    return successResponse({ groups, nextCursor, total: groups.length, memberships });
  }

  const groups = await listGroups({ cursor, limit, nameFilter });
  const nextCursor =
    groups.length === limit ? (groups[groups.length - 1]?.createdAt ?? null) : null;

  return successResponse({ groups, nextCursor, total: groups.length });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `group-list:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_LIST,
  },
});
