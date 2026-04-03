// POST /api/v1/events/[eventId]/recording/preserve — preserve recording permanently
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { preserveRecording } from "@/services/event-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  // URL: /api/v1/events/[eventId]/recording/preserve — at(-3) gives [eventId]
  const eventId = new URL(request.url).pathname.split("/").at(-3) ?? "";
  await preserveRecording(userId, eventId);
  return successResponse({ preserved: true });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `event-recording-preserve:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_UPDATE,
  },
});
