import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { listPortalAdminAuditLogsForExport } from "@igbo/db/queries/portal-admin-audit-logs";
import type { AuditLogFilters } from "@igbo/db/queries/audit-logs";

function escapeCsvField(value: string): string {
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const GET = withApiHandler(async (req) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
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

  const logs = await listPortalAdminAuditLogsForExport(filters);

  const headers = ["Timestamp", "Admin", "Action", "Target Type", "Details"];
  const rows = logs.map((log) => [
    log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    log.actorName ?? "Unknown",
    log.action,
    log.targetType ?? "",
    JSON.stringify(log.details ?? {}),
  ]);

  const csv = [headers, ...rows].map((r) => r.map(escapeCsvField).join(",")).join("\n");

  const dateFromStr = url.searchParams.get("dateFrom") ?? "all";
  const dateToStr = url.searchParams.get("dateTo") ?? "all";
  const today = new Date().toISOString().split("T")[0];
  const filename = `igbo_admin_audit_log_${dateFromStr}_${dateToStr}_${today}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
