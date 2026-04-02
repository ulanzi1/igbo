// GET /api/v1/events/[eventId]/attendees — list attendees for check-in UI (creator only)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { listEventAttendees } from "@/services/event-service";
import { getEventById } from "@igbo/db/queries/events";
import { ApiError } from "@/lib/api-error";

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  // URL: /api/v1/events/[eventId]/attendees — at(-2) gives [eventId]
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";

  const event = await getEventById(eventId);
  if (!event) {
    throw new ApiError({ title: "Event not found", status: 404 });
  }
  if (event.creatorId !== userId) {
    throw new ApiError({ title: "Only the event creator can view the attendee list", status: 403 });
  }

  const attendees = await listEventAttendees(eventId);
  return successResponse({ attendees });
};

export const GET = withApiHandler(getHandler);
