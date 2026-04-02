import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { isUserInQuietHours } from "@igbo/db/queries/notification-preferences";
import { ApiError } from "@/lib/api-error";

export const GET = withApiHandler(async (req: Request) => {
  // Extract userId from URL path (withApiHandler doesn't pass Next.js params)
  const userId = new URL(req.url).pathname.split("/").at(-2);
  if (!userId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing userId" });
  }
  const isDnd = await isUserInQuietHours(userId, new Date());
  return successResponse({ isDnd });
});
