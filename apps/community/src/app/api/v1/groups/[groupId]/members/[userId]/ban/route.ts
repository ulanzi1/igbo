// POST /api/v1/groups/[groupId]/members/[userId]/ban — ban a group member
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { banGroupMember } from "@/services/group-membership-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const postHandler = async (request: Request) => {
  const { userId: moderatorId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/members/{userId}/ban
  const groupId = segments.at(-4);
  const targetUserId = segments.at(-2);

  if (!groupId || !uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  if (!targetUserId || !uuidRegex.test(targetUserId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  await banGroupMember(moderatorId, groupId, targetUserId, parsed.data.reason);

  return successResponse({ banned: true });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `group-manage:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_MANAGE,
  },
});
