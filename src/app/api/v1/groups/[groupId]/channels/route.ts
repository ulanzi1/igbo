// GET /api/v1/groups/[groupId]/channels — list channels (active members)
// POST /api/v1/groups/[groupId]/channels — create channel (leader/creator only)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getGroupMember } from "@/db/queries/groups";
import { createChannel, listChannelsForGroup } from "@/services/group-channel-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractGroupId(url: string): string {
  const groupId = new URL(url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  return groupId;
}

const createChannelBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const getHandler = async (request: Request) => {
  const session = await requireAuthenticatedSession();
  const userId = session.userId;
  const groupId = extractGroupId(request.url);

  const membership = await getGroupMember(groupId, userId);
  if (!membership || membership.status !== "active") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Must be an active group member",
    });
  }

  const channels = await listChannelsForGroup(groupId);
  return successResponse({ channels });
};

const postHandler = async (request: Request) => {
  const session = await requireAuthenticatedSession();
  const userId = session.userId;
  const groupId = extractGroupId(request.url);

  const body = (await request.json()) as unknown;
  const parsed = createChannelBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const channel = await createChannel(userId, groupId, {
    name: parsed.data.name,
    description: parsed.data.description,
  });

  return successResponse({ channel }, undefined, 201);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-channels:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_DETAIL,
  },
});

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-channel-create:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_CHANNEL,
  },
});
