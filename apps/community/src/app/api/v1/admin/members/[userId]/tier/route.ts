import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { changeMemberTier } from "@/services/tier-service";
import { z } from "zod/v4";

const changeTierSchema = z.object({
  tier: z.enum(["BASIC", "PROFESSIONAL", "TOP_TIER"]),
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const userId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  if (!userId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "User ID required" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = changeTierSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Invalid tier value",
    });
  }

  const { tier } = result.data;

  try {
    await changeMemberTier(userId, tier, adminId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("User not found")) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
    }
    throw error;
  }

  return successResponse({ userId, tier, updatedAt: new Date().toISOString() });
});
