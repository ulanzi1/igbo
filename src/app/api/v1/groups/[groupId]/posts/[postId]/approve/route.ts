// POST /api/v1/groups/[groupId]/posts/[postId]/approve — leader approves pending group post
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getGroupById, getGroupMember } from "@/db/queries/groups";
import { approveGroupPost } from "@/db/queries/posts";
import { eventBus } from "@/services/event-bus";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const postHandler = async (request: Request) => {
  const { userId: leaderId } = await requireAuthenticatedSession();

  const segments = new URL(request.url).pathname.split("/");
  // .../groups/{groupId}/posts/{postId}/approve
  const groupId = segments.at(-4);
  const postId = segments.at(-2);

  if (!groupId || !uuidRegex.test(groupId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid group ID" });
  }
  if (!postId || !uuidRegex.test(postId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid post ID" });
  }

  const group = await getGroupById(groupId);
  if (!group) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Group not found" });
  }

  const membership = await getGroupMember(groupId, leaderId);
  if (!membership || (membership.role !== "creator" && membership.role !== "leader")) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "Only group creators or leaders can approve posts",
    });
  }

  const approved = await approveGroupPost(postId, groupId);
  if (!approved) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: "Pending post not found in this group",
    });
  }

  // Emit post.published now that the post is active
  try {
    await eventBus.emit("post.published", {
      postId,
      authorId: "", // authorId not critical for existing subscribers
      groupId,
      category: "discussion",
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical
  }

  return successResponse({ approved: true });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `group-manage:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_MANAGE,
  },
});
