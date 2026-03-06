// POST /api/v1/events/[eventId]/join-token — issue Daily meeting token for authenticated RSVP'd attendee
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getJoinToken } from "@/services/event-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  // URL: /api/v1/events/[eventId]/join-token — at(-2) gives [eventId]
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const { token, roomUrl } = await getJoinToken(userId, eventId);
  return successResponse({ token, roomUrl });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `event-join-token:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_RSVP,
  },
});
