import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { getUserMembershipTier } from "@igbo/db/queries/auth-permissions";
import { getUserPointsTotal, getEffectiveArticleLimit } from "@igbo/db/queries/points";
import { countWeeklyArticleSubmissions } from "@igbo/db/queries/articles";
import { db } from "@igbo/db";
import { platformPostingLimits } from "@igbo/db/schema/platform-posting-limits";
import { eq, asc } from "drizzle-orm";

export const GET = withApiHandler(async () => {
  const { userId } = await requireAuthenticatedSession();
  const tier = await getUserMembershipTier(userId);

  if (tier === "BASIC") {
    const currentPoints = await getUserPointsTotal(userId);
    return successResponse({
      effectiveLimit: 0,
      weeklyUsed: 0,
      currentPoints,
      nextThreshold: null,
      nextEffectiveLimit: null,
    });
  }

  const [currentPoints, weeklyUsed] = await Promise.all([
    getUserPointsTotal(userId),
    countWeeklyArticleSubmissions(userId),
  ]);
  const effectiveLimit = await getEffectiveArticleLimit(userId, tier, currentPoints);

  // Find the next posting limit row above the member's current points
  const allRows = await db
    .select()
    .from(platformPostingLimits)
    .where(eq(platformPostingLimits.tier, tier as string))
    .orderBy(asc(platformPostingLimits.pointsThreshold));

  const nextRow = allRows.find((row) => row.pointsThreshold > currentPoints) ?? null;

  return successResponse({
    effectiveLimit,
    weeklyUsed,
    currentPoints,
    nextThreshold: nextRow?.pointsThreshold ?? null,
    nextEffectiveLimit: nextRow ? nextRow.baseLimit + nextRow.bonusLimit : null,
  });
});
