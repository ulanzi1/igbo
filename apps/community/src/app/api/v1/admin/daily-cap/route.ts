import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPlatformSetting, upsertPlatformSetting } from "@igbo/db/queries/platform-settings";
import { logAdminAction } from "@/services/audit-logger";
import { z } from "zod/v4";

const putSchema = z.object({
  value: z.number().int().min(1),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);
  const value = await getPlatformSetting("daily_cap_points", 100);
  return successResponse({ value });
});

export const PUT = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);
  const body = await request.json().catch(() => null);
  if (!body) throw new ApiError({ title: "Invalid JSON", status: 400 });

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
      status: 400,
    });
  }

  await upsertPlatformSetting("daily_cap_points", parsed.data.value, adminId);

  await logAdminAction({
    actorId: adminId,
    action: "SETTINGS_UPDATED",
    details: { entity: "daily_cap", changes: { value: parsed.data.value } },
  });

  return successResponse({ value: parsed.data.value });
});
