import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { getDisciplineActionById } from "@igbo/db/queries/member-discipline";
import { liftSuspensionEarly } from "@/services/member-discipline-service";
import { z } from "zod/v4";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const liftSchema = z.object({
  suspensionId: z.string().uuid(),
  reason: z.string().min(1),
});

export const POST = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  // /admin/discipline/{userId}/lift → .at(-2) = userId
  const userId = new URL(request.url).pathname.split("/").at(-2) ?? "";
  if (!UUID_RE.test(userId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid user ID" });
  }

  const body = (await request.json()) as unknown;
  const parsed = liftSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message,
    });
  }

  const { suspensionId, reason } = parsed.data;

  // Verify the suspension belongs to this user
  const suspension = await getDisciplineActionById(suspensionId);
  if (!suspension || suspension.userId !== userId) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Suspension does not belong to this user",
    });
  }

  await liftSuspensionEarly({ suspensionId, adminId, reason });

  return successResponse({ lifted: true });
});
