import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import {
  getPortalNotificationById,
  markPortalNotificationRead,
} from "@igbo/db/queries/portal-notifications";
import { invalidateUnreadCount } from "@/services/notification-count-service";

export const PATCH = withApiHandler(async (req): Promise<Response> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  // Extract notificationId from URL: .../notifications/[notificationId]/read
  const notificationId = new URL(req.url).pathname.split("/").at(-2);
  if (!notificationId) {
    throw new ApiError({ title: "Missing notification ID", status: 400 });
  }

  const notification = await getPortalNotificationById(notificationId, session.user.id);
  if (!notification) {
    throw new ApiError({ title: "Notification not found", status: 404 });
  }

  // Idempotent: COALESCE preserves original readAt if already read
  await markPortalNotificationRead(notificationId, session.user.id);
  await invalidateUnreadCount(session.user.id);

  return successResponse({ ok: true });
});
