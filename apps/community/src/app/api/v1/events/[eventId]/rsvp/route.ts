// GET  /api/v1/events/[eventId]/rsvp - check user's current RSVP status (auth required)
// POST /api/v1/events/[eventId]/rsvp - RSVP to event (auth required)
// DELETE /api/v1/events/[eventId]/rsvp - cancel RSVP (auth required)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { rsvpToEvent, cancelEventRsvp } from "@/services/event-service";
import { getAttendeeStatus } from "@/db/queries/events";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";

// ─── GET ──────────────────────────────────────────────────────────────────────

const getHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  // URL path: /api/v1/events/[eventId]/rsvp — at(-2) gives [eventId]
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const result = await getAttendeeStatus(eventId, userId);
  return successResponse({
    status: result?.status ?? null,
    waitlistPosition: result?.waitlistPosition ?? null,
  });
};

export const GET = withApiHandler(getHandler);

// ─── POST ─────────────────────────────────────────────────────────────────────

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  const { status, waitlistPosition, attendeeCount } = await rsvpToEvent(userId, eventId);
  return successResponse({ status, waitlistPosition, attendeeCount }, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `event-rsvp:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_RSVP,
  },
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const eventId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  await cancelEventRsvp(userId, eventId);
  return successResponse({ success: true });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `event-rsvp-cancel:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_RSVP,
  },
});
