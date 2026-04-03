import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { db } from "@igbo/db";
import { authUsers } from "@igbo/db/schema/auth-users";
import { gte, lte, and } from "drizzle-orm";

const handler = async (request: Request) => {
  await requireAdminSession();

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  if (!since || !until) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Query parameters 'since' and 'until' (ISO date) are required",
    });
  }

  const sinceDate = new Date(since);
  const untilDate = new Date(until);

  if (isNaN(sinceDate.getTime()) || isNaN(untilDate.getTime())) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid date format. Use ISO 8601 (e.g. 2024-01-15T00:00:00Z)",
    });
  }

  const members = await db
    .select({
      id: authUsers.id,
      email: authUsers.email,
      name: authUsers.name,
      accountStatus: authUsers.accountStatus,
      createdAt: authUsers.createdAt,
    })
    .from(authUsers)
    .where(and(gte(authUsers.createdAt, sinceDate), lte(authUsers.createdAt, untilDate)));

  return successResponse({ members, count: members.length });
};

export const GET = withApiHandler(handler);
