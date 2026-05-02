import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { getUnreadNotificationCount } from "@igbo/db";

// TODO P-6.7: switch to portal_notifications when available
export const GET = withApiHandler(async (): Promise<Response> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const count = await getUnreadNotificationCount(session.user.id);
  return successResponse({ count });
});
