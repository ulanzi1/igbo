// POST /api/v1/events/[eventId]/attended — mark attendance (self via video or host manual check-in)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { markAttendance } from "@/services/event-service";
import { ApiError } from "@/lib/api-error";
import { z } from "zod/v4";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

const MarkAttendedSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("video") }),
  z.object({ source: z.literal("manual"), userId: z.string().uuid() }),
]);

const postHandler = async (request: Request) => {
  const { userId: callerId } = await requireAuthenticatedSession();
  // URL: /api/v1/events/[eventId]/attended — at(-2) gives [eventId]
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";

  const raw = await request.json();
  const parsed = MarkAttendedSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError({ title: "Invalid request body", status: 422 });
  }

  const body = parsed.data;
  if (body.source === "video") {
    await markAttendance(callerId, eventId, "video");
  } else {
    // Manual check-in: callerId is the host, body.userId is the attendee
    await markAttendance(body.userId, eventId, "manual", callerId);
  }

  return successResponse({ success: true });
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `event-attended:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_RSVP,
  },
});
