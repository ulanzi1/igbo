// GET    /api/v1/events/[eventId] — event detail (public/semi-public)
// PATCH  /api/v1/events/[eventId] — update event (auth + creator)
// DELETE /api/v1/events/[eventId] — cancel event (auth + creator, soft cancel)
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { updateEvent, cancelEvent, UpdateEventSchema } from "@/services/event-service";
import { getEventById } from "@/db/queries/events";
import { getGroupById } from "@/db/queries/groups";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { auth } from "@/server/auth/config";
import { z } from "zod/v4";

const CancelEventSchema = z.object({
  cancellationReason: z.string().min(1, "Cancellation reason is required"),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

const getHandler = async (request: Request) => {
  // No auth required, no rateLimit (public GET — BROWSE preset does not exist)
  const eventId = new URL(request.url).pathname.split("/").at(-1) ?? "";

  const event = await getEventById(eventId);
  if (!event || event.deletedAt !== null) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  // Group visibility check: if private/hidden group event, verify membership
  if (event.groupId && event.eventType === "group") {
    const group = await getGroupById(event.groupId);
    if (group && (group.visibility === "private" || group.visibility === "hidden")) {
      const session = await auth();
      if (!session?.user?.id) {
        // Not authenticated — return 404 (do not leak event existence)
        throw new ApiError({ title: "Not Found", status: 404 });
      }
      const { getGroupMember } = await import("@/db/queries/groups");
      const membership = await getGroupMember(event.groupId, session.user.id);
      if (!membership || membership.status !== "active") {
        throw new ApiError({ title: "Not Found", status: 404 });
      }
    }
  }

  return successResponse({ event });
};

export const GET = withApiHandler(getHandler);

// ─── PATCH ────────────────────────────────────────────────────────────────────

const patchHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const eventId = new URL(request.url).pathname.split("/").at(-1) ?? "";

  const body: unknown = await request.json();
  const parsed = UpdateEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
    });
  }

  const { eventId: updatedId } = await updateEvent(userId, eventId, parsed.data);
  return successResponse({ eventId: updatedId });
};

export const PATCH = withApiHandler(patchHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `event-update:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_UPDATE,
  },
});

// ─── DELETE (soft cancel) ─────────────────────────────────────────────────────

const deleteHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();
  const eventId = new URL(request.url).pathname.split("/").at(-1) ?? "";

  // Parse and validate cancellation reason from JSON body.
  // HTTP DELETE with body is RFC-7230 valid and works with fetch().
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = CancelEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message ?? "Cancellation reason is required",
    });
  }

  // DELETE performs SOFT CANCEL (status='cancelled') — does NOT hard-delete the row.
  // Past events and attendee records are preserved.
  await cancelEvent(userId, eventId, parsed.data.cancellationReason);
  return successResponse({ eventId });
};

export const DELETE = withApiHandler(deleteHandler, {
  rateLimit: {
    key: async () => {
      const { requireAuthenticatedSession: getSession } = await import("@/services/permissions");
      const { userId } = await getSession();
      return `event-cancel:${userId}`;
    },
    ...RATE_LIMIT_PRESETS.EVENT_UPDATE,
  },
});
