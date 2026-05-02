import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { ApiError } from "@/lib/api-error";
import { getPortalNotifications, encodeCursor } from "@igbo/db/queries/portal-notifications";

const PAGE_SIZE = 20;

export const GET = withApiHandler(async (req): Promise<Response> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const notifications = await getPortalNotifications(session.user.id, {
    cursor,
    limit: PAGE_SIZE,
  });

  const nextCursor =
    notifications.length === PAGE_SIZE
      ? encodeCursor(notifications[notifications.length - 1]!)
      : null;

  return Response.json({
    data: notifications,
    meta: { nextCursor },
  });
});
