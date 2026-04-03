import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getUserPointsBalance } from "@/services/points-engine";
import { getPointsSummaryStats } from "@igbo/db/queries/points";

export const GET = withApiHandler(async () => {
  const { userId } = await requireAuthenticatedSession();
  const [balance, summary] = await Promise.all([
    getUserPointsBalance(userId),
    getPointsSummaryStats(userId),
  ]);
  return successResponse({ balance, summary });
});
