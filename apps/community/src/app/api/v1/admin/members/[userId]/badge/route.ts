import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { getRedisClient } from "@/lib/redis";
import { upsertUserBadge, deleteUserBadge, invalidateBadgeCache } from "@/db/queries/badges";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { authUsers } from "@/db/schema/auth-users";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const badgeSchema = z.object({
  badgeType: z.enum(["blue", "red", "purple"]),
});

async function userExists(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return !!row;
}

function extractUserId(request: Request): string {
  // URL: /api/v1/admin/members/[id]/badge  — [id] is at position -2
  return new URL(request.url).pathname.split("/").at(-2) ?? "";
}

export const PATCH = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const userId = extractUserId(request);
  if (!userId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "User ID required" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = badgeSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Invalid badge type",
    });
  }

  const { badgeType } = result.data;

  const exists = await userExists(userId);
  if (!exists) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
  }

  const redis = getRedisClient();
  await upsertUserBadge(userId, badgeType, adminId);
  await invalidateBadgeCache(userId, redis);

  await db.insert(auditLogs).values({
    actorId: adminId,
    targetUserId: userId,
    action: "badge.assign",
    details: { badgeType },
  });

  return successResponse({ userId, badgeType });
});

export const DELETE = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const userId = extractUserId(request);
  if (!userId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "User ID required" });
  }

  const exists = await userExists(userId);
  if (!exists) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
  }

  const deleted = await deleteUserBadge(userId);
  if (!deleted) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User has no badge to remove" });
  }

  const redis = getRedisClient();
  await invalidateBadgeCache(userId, redis);

  await db.insert(auditLogs).values({
    actorId: adminId,
    targetUserId: userId,
    action: "badge.remove",
    details: {},
  });

  return successResponse({ userId, removed: true });
});
