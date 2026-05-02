import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { markAllPortalNotificationsRead } from "@igbo/db/queries/portal-notifications";
import { invalidateUnreadCount } from "@/services/notification-count-service";

export const POST = withApiHandler(async (): Promise<Response> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const updated = await markAllPortalNotificationsRead(session.user.id);
  await invalidateUnreadCount(session.user.id);

  return successResponse({ updated });
});
