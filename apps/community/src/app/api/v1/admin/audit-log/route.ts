import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { listAuditLogs } from "@igbo/db/queries/audit-logs";
import { z } from "zod/v4";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  actorId: z.string().uuid().optional(),
  targetType: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(raw);

  if (!parsed.success) {
    throw new ApiError({
      title: "Invalid query parameters",
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
      status: 400,
    });
  }

  const { page, limit, action, actorId, targetType, dateFrom, dateTo } = parsed.data;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiError({
      title: "Invalid date range",
      detail: "dateFrom must be before or equal to dateTo",
      status: 400,
    });
  }

  const result = await listAuditLogs(page, limit, {
    action,
    actorId,
    targetType,
    dateFrom,
    dateTo,
  });

  return successResponse(result);
});
