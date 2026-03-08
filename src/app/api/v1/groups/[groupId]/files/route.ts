// GET /api/v1/groups/[groupId]/files — list shared files (active members only)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getGroupMember } from "@/db/queries/groups";
import { listGroupFiles } from "@/db/queries/group-channels";
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

  const searchParams = new URL(request.url).searchParams;
  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;
  const limitParam = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 50);

  const files = await listGroupFiles(groupId, cursor, limit);

  const nextCursor = files.length === limit ? (cursor ?? 0) + limit : null;

  return successResponse({
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      fileUrl: f.fileUrl,
      fileType: f.fileType,
      fileSize: f.fileSize,
      uploadedAt: f.uploadedAt.toISOString(),
      uploaderName: f.uploaderName,
      messageId: f.messageId,
      conversationId: f.conversationId,
    })),
    nextCursor,
  });
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async (request: Request) => {
      const session = await requireAuthenticatedSession();
      return `group-files:${session.userId}`;
    },
    ...RATE_LIMIT_PRESETS.GROUP_DETAIL,
  },
});
