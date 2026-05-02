import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { dismissPortalNotification } from "@igbo/db/queries/portal-notifications";
import { invalidateUnreadCount } from "@/services/notification-count-service";

export const DELETE = withApiHandler(async (req): Promise<Response> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const notificationId = new URL(req.url).pathname.split("/").at(-1);
  if (!notificationId) {
    throw new ApiError({ title: "Missing notification ID", status: 400 });
  }

  const dismissed = await dismissPortalNotification(notificationId, session.user.id);
  if (!dismissed) {
    throw new ApiError({ title: "Notification not found", status: 404 });
  }

  // Invalidate cache if notification was unread
  if (!dismissed.readAt) {
    await invalidateUnreadCount(session.user.id);
  }

  return successResponse({ ok: true });
});
