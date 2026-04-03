import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { searchMembersForAdmin } from "@igbo/db/queries/points";
import { z } from "zod/v4";

const querySchema = z.object({
  q: z.string().min(2),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());

  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Query must be at least 2 characters",
      status: 400,
    });
  }

  const results = await searchMembersForAdmin(parsed.data.q, 10);
  return successResponse({ results });
});
