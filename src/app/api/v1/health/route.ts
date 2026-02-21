import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";

export const GET = withApiHandler(async () => {
  return successResponse({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});
