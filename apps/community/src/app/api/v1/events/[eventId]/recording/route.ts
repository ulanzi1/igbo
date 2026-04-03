// GET /api/v1/events/[eventId]/recording — recording playback metadata
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getRecordingPlaybackUrl } from "@/services/event-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const recording = await getRecordingPlaybackUrl(userId, eventId);
  return successResponse(recording);
};

export const GET = withApiHandler(getHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `event-recording:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_DETAIL,
  },
});
