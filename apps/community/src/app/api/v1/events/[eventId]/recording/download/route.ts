// POST /api/v1/events/[eventId]/recording/download — generate 1h presigned download URL
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getRecordingDownloadUrl } from "@/services/event-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  // URL: /api/v1/events/[eventId]/recording/download — at(-3) gives [eventId]
  const eventId = new URL(request.url).pathname.split("/").at(-3) ?? "";
  const downloadUrl = await getRecordingDownloadUrl(userId, eventId);
  return successResponse({ downloadUrl });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `event-recording-download:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_UPDATE,
  },
});
