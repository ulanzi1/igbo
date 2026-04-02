// GET /api/v1/groups/[groupId]/posts — group feed (member-only)
// POST /api/v1/groups/[groupId]/posts — create group post
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getGroupMember } from "@igbo/db/queries/groups";
import { getGroupFeedPosts } from "@igbo/db/queries/feed";
import { listPendingGroupPosts } from "@igbo/db/queries/posts";
import { createGroupPost } from "@/services/post-service";
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

const createPostSchema = z.object({
  content: z.string().max(10_000),
  contentType: z.enum(["text", "rich_text", "media"]),
  category: z.enum(["discussion", "event", "announcement"]),
  fileUploadIds: z.array(z.string().uuid()).max(4).optional(),
  mediaTypes: z
    .array(z.enum(["image", "video", "audio"]))
    .max(4)
    .optional(),
});

const getHandler = async (request: Request) => {
  const session = await requireAuthenticatedSession();
  const userId = session.userId;
  const groupId = extractGroupId(request.url);

  // Only active group members can see the group feed
  const membership = await getGroupMember(groupId, userId);
  if (!membership || membership.status !== "active") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Must be an active group member",
    });
  }

  const searchParams = new URL(request.url).searchParams;

  // Leaders/creators can request pending posts via ?pending=true
  if (searchParams.get("pending") === "true") {
    const isLeaderOrCreator = membership.role === "creator" || membership.role === "leader";
    if (!isLeaderOrCreator) {
      throw new ApiError({
        title: "Forbidden",
        status: 403,
        detail: "Only group creators or leaders can view pending posts",
      });
    }
    const cursor = searchParams.get("cursor") ?? undefined;
    const limitParam = parseInt(searchParams.get("limit") ?? "10", 10);
    const limit = Math.min(isNaN(limitParam) ? 10 : limitParam, 20);
    const result = await listPendingGroupPosts(groupId, { cursor, limit });
    return successResponse(result);
  }

  const cursor = searchParams.get("cursor") ?? undefined;
  const limitParam = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 20);

  const result = await getGroupFeedPosts(groupId, { cursor, limit, viewerId: userId });
  return successResponse(result);
};

const postHandler = async (request: Request) => {
  const session = await requireAuthenticatedSession();
  const userId = session.userId;
  const groupId = extractGroupId(request.url);

  // Verify active membership
  const membership = await getGroupMember(groupId, userId);
  if (!membership || membership.status !== "active") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Must be an active group member",
    });
  }

  const body = (await request.json()) as unknown;
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const result = await createGroupPost({
    authorId: userId,
    groupId,
    content: parsed.data.content,
    contentType: parsed.data.contentType,
    category: parsed.data.category,
    fileUploadIds: parsed.data.fileUploadIds,
    mediaTypes: parsed.data.mediaTypes,
  });

  if (!result.success) {
    throw new ApiError({ title: "Forbidden", status: 403, detail: result.reason });
  }

  return successResponse(
    { postId: result.postId, status: result.status ?? "active" },
    undefined,
    201,
  );
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-feed:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.FEED_READ,
  },
});

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `post-create:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.POST_CREATE,
  },
});
