import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { admin2faReset } from "@/services/auth-service";
import { logAdminAction } from "@/services/audit-logger";
import { findUserById } from "@igbo/db/queries/auth-queries";

export const POST = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const targetUserId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  if (!targetUserId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "User ID required" });
  }

  if (targetUserId === adminId) {
    throw new ApiError({ title: "Forbidden", status: 403, detail: "Cannot reset your own 2FA" });
  }

  const target = await findUserById(targetUserId);
  if (!target) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
  }
  if (target.accountStatus !== "APPROVED") {
    throw new ApiError({
      title: "Conflict",
      status: 409,
      detail: "Can only reset 2FA for approved members",
    });
  }

  await admin2faReset(targetUserId, adminId);

  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    undefined;

  await logAdminAction({
    actorId: adminId,
    action: "RESET_2FA",
    targetUserId,
    details: { targetUserId },
    ipAddress: ip,
  });

  return successResponse({ message: "2FA reset successfully. Member notified by email." });
});
