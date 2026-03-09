import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { getAllPostingLimits, updatePostingLimit } from "@/db/queries/points";
import { logAdminAction } from "@/services/audit-logger";
import { z } from "zod/v4";

const patchSchema = z.object({
  id: z.string().uuid(),
  baseLimit: z.number().int().min(0).optional(),
  bonusLimit: z.number().int().min(0).optional(),
  pointsThreshold: z.number().int().min(0).optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);
  const limits = await getAllPostingLimits();
  return successResponse({ limits });
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

  const updated = await updatePostingLimit(id, changes);
  if (!updated) {
    throw new ApiError({ title: "Not found", status: 404 });
  }

  await logAdminAction({
    actorId: adminId,
    action: "SETTINGS_UPDATED",
    details: { entity: "posting_limit", tier: updated.tier, changes },
  });

  return successResponse({ limit: updated });
});
