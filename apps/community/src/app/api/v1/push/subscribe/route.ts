import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import {
  upsertPushSubscription,
  deleteAllUserPushSubscriptions,
} from "@igbo/db/queries/push-subscriptions";
import { z } from "zod/v4";

const subscribeBodySchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const postHandler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Invalid JSON body",
    });
  }

  const parsed = subscribeBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid body",
    });
  }

  await upsertPushSubscription(userId, parsed.data);
  return successResponse({ ok: true }, undefined, 201);
};

const deleteHandler = async () => {
  const { userId } = await requireAuthenticatedSession();
  await deleteAllUserPushSubscriptions(userId);
  return successResponse({ ok: true });
};

export const POST = withApiHandler(postHandler);
export const DELETE = withApiHandler(deleteHandler);
