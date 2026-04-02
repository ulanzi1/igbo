import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { muteMember, unmuteMember, isUserMuted } from "@/services/block-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// POST   /api/v1/members/[userId]/mute  → mute targetUserId
// DELETE /api/v1/members/[userId]/mute  → unmute targetUserId
// GET    /api/v1/members/[userId]/mute  → returns { isMuted: boolean }

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractTargetUserId(request: Request): string {
  // Path: /api/v1/members/{targetUserId}/mute
  // .at(-1) = "mute", .at(-2) = targetUserId
  const targetUserId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  if (!uuidRegex.test(targetUserId)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid user ID",
    });
  }
  return targetUserId;
}

const rateLimitConfig = {
  key: async () => {
    const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
    const { userId } = await getSession();
    return `block-mute:${userId}`;
  },
  ...RATE_LIMIT_PRESETS.BLOCK_MUTE,
};

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const targetUserId = extractTargetUserId(request);

  if (targetUserId === userId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Cannot mute yourself" });
  }

  await muteMember(userId, targetUserId);
  return successResponse({ ok: true });
};

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const targetUserId = extractTargetUserId(request);

  await unmuteMember(userId, targetUserId);
  return successResponse({ ok: true });
};

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const targetUserId = extractTargetUserId(request);

  const muted = await isUserMuted(userId, targetUserId);
  return successResponse({ isMuted: muted });
};

export const POST = withApiHandler(postHandler, { rateLimit: rateLimitConfig });
export const DELETE = withApiHandler(deleteHandler, { rateLimit: rateLimitConfig });
export const GET = withApiHandler(getHandler, { rateLimit: rateLimitConfig });
