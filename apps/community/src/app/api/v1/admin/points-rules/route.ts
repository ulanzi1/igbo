import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { getAllPointsRules, updatePointsRule } from "@/db/queries/points";
import { logAdminAction } from "@/services/audit-logger";
import { z } from "zod/v4";

const patchSchema = z.object({
  id: z.string().uuid(),
  basePoints: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);
  const rules = await getAllPointsRules();
  return successResponse({ rules });
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);
  const body = await request.json().catch(() => null);
  if (!body) throw new ApiError({ title: "Invalid JSON", status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
      status: 400,
    });
  }

  const { id, ...changes } = parsed.data;

  const updated = await updatePointsRule(id, changes);
  if (!updated) {
    throw new ApiError({ title: "Not found", status: 404 });
  }

  await logAdminAction({
    actorId: adminId,
    action: "SETTINGS_UPDATED",
    details: { entity: "points_rule", activityType: updated.activityType, changes },
  });

  return successResponse({ rule: updated });
});
