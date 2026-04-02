// GET /api/v1/groups/[groupId]/members — list active members (auth required)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { listActiveGroupMembers } from "@igbo/db/queries/groups";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractGroupId(url: string): string {
  const groupId = new URL(url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  return groupId;
}

const getHandler = async (request: Request) => {
  await requireAuthenticatedSession();
  const groupId = extractGroupId(request.url);

  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 50);

  const members = await listActiveGroupMembers(groupId, cursor, limit);

  const nextCursor =
    members.length === limit ? members[members.length - 1]!.joinedAt.toISOString() : null;

  return successResponse({
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      photoUrl: m.photoUrl,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      mutedUntil: m.mutedUntil?.toISOString() ?? null,
    })),
    nextCursor,
  });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-members:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_DETAIL,
  },
});
