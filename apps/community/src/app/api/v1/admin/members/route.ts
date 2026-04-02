import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { db } from "@igbo/db";
import { authUsers } from "@igbo/db/schema/auth-users";
import { communityProfiles } from "@igbo/db/schema/community-profiles";
import { eq, isNull, and, ilike, or, sql } from "drizzle-orm";

const ALLOWED_TIERS = ["BASIC", "PROFESSIONAL", "TOP_TIER"] as const;
type AllowedTier = (typeof ALLOWED_TIERS)[number];

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const tierParam = url.searchParams.get("tier");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );
  const search = url.searchParams.get("search")?.trim() ?? "";

  if (tierParam && !ALLOWED_TIERS.includes(tierParam as AllowedTier)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid tier. Allowed values: ${ALLOWED_TIERS.join(", ")}`,
    });
  }

  const offset = (page - 1) * pageSize;

  // Escape LIKE wildcard characters in search input
  const escapedSearch = search.replace(/[%_\\]/g, "\\$&");

  // Build base filter
  const baseFilter = and(
    eq(authUsers.accountStatus, "APPROVED"),
    isNull(authUsers.deletedAt),
    tierParam ? eq(authUsers.membershipTier, tierParam as AllowedTier) : undefined,
    escapedSearch
      ? or(
          ilike(authUsers.email, `%${escapedSearch}%`),
          ilike(communityProfiles.displayName, `%${escapedSearch}%`),
        )
      : undefined,
  );

  const [members, countResult] = await Promise.all([
    db
      .select({
        id: authUsers.id,
        email: authUsers.email,
        name: authUsers.name,
        role: authUsers.role,
        membershipTier: authUsers.membershipTier,
        accountStatus: authUsers.accountStatus,
        createdAt: authUsers.createdAt,
        displayName: communityProfiles.displayName,
      })
      .from(authUsers)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, authUsers.id))
      .where(baseFilter)
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(authUsers)
      .leftJoin(communityProfiles, eq(communityProfiles.userId, authUsers.id))
      .where(baseFilter),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return successResponse(members, { page, pageSize, total });
});
