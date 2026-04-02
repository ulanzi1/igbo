// GET /api/v1/events  — public event listing (no auth required)
// POST /api/v1/events — create event (auth required)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { createEvent, CreateEventSchema } from "@/services/event-service";
import { listUpcomingEvents, listPastEvents, listMyRsvps } from "@igbo/db/queries/events";
import { errorResponse } from "@/lib/api-response";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { auth } from "@igbo/auth";

// ─── GET ──────────────────────────────────────────────────────────────────────

const getHandler = async (request: Request) => {
  // Public route — no auth required, no rateLimit
  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId") ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const offset = (page - 1) * limit;
  const view = url.searchParams.get("view"); // "past" | "my-rsvps" | null

  // Optional auth: auth() returns null when unauthenticated, never throws
  const session = await auth();
  const userId = session?.user?.id;

  if (view === "past") {
    const events = await listPastEvents({ userId, groupId, limit, offset });
    return successResponse({ events, total: events.length, page, limit });
  }

  if (view === "my-rsvps") {
    if (!userId) {
      return errorResponse({ type: "about:blank", status: 401, title: "Authentication required" });
    }
    const events = await listMyRsvps(userId, { limit, offset });
    return successResponse({ events, total: events.length, page, limit });
  }

  // Default: listUpcomingEvents (existing behavior)
  const events = await listUpcomingEvents({ userId, groupId, limit, offset });
  return successResponse({ events, total: events.length, page, limit });
};

export const GET = withApiHandler(getHandler);

// ─── POST ─────────────────────────────────────────────────────────────────────

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  const body: unknown = await request.json();
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const { eventId } = await createEvent(userId, parsed.data);
  return successResponse({ eventId }, undefined, 201);
};

export const POST = withApiHandler(postHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@igbo/auth/permissions");
      const { userId } = await getSession();
      return `event-create:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_CREATE,
  },
});
