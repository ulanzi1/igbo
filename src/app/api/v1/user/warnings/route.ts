import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@/services/permissions";
import { getActiveWarnings } from "@/db/queries/member-discipline";

export const GET = withApiHandler(async () => {
  const { userId } = await requireAuthenticatedSession();
  const warnings = await getActiveWarnings(userId);
  return successResponse({ warnings });
});
