import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { listPortalAdminAuditLogs } from "@igbo/db/queries/portal-admin-audit-logs";
import type { AuditLogFilters } from "@igbo/db/queries/audit-logs";

export const GET = withApiHandler(async (req) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10)),
  );

  const filters: AuditLogFilters = {};
  const action = url.searchParams.get("action");
  if (action) filters.action = action;
  const actorId = url.searchParams.get("actorId");
  if (actorId) filters.actorId = actorId;
  const targetType = url.searchParams.get("targetType");
  if (targetType) filters.targetType = targetType;
  const dateFrom = url.searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = url.searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const result = await listPortalAdminAuditLogs(page, pageSize, filters);
  return successResponse(result);
});
