// DELETE /api/v1/groups/[groupId]/channels/[channelId] — delete channel (leader/creator only)
import { withApiHandler } from "@/server/api/middleware";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { deleteChannel } from "@/services/group-channel-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractIds(url: string): { groupId: string; channelId: string } {
  // /api/v1/groups/{groupId}/channels/{channelId}
  const parts = new URL(url).pathname.split("/");
  const groupId = parts.at(-3) ?? "";
  const channelId = parts.at(-1) ?? "";
  if (!uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  if (!uuidRegex.test(channelId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid channel ID" });
  }
  return { groupId, channelId };
}

const deleteHandler = async (request: Request) => {
  const session = await requireAuthenticatedSession();
  const userId = session.userId;
  const { groupId, channelId } = extractIds(request.url);

  await deleteChannel(userId, groupId, channelId);

  return new Response(null, { status: 204 });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-channel-delete:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_CHANNEL,
  },
});
