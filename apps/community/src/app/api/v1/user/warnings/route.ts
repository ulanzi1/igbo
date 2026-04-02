import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getActiveWarnings } from "@igbo/db/queries/member-discipline";

export const GET = withApiHandler(async () => {
  const { userId } = await requireAuthenticatedSession();
  const warnings = await getActiveWarnings(userId);
  return successResponse({ warnings });
});
