import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import {
  listAllPostingsForAdmin,
  PORTAL_JOB_STATUS_VALUES,
} from "@igbo/db/queries/portal-admin-all-postings";
import type { AdminPostingsFilterOptions } from "@igbo/db/queries/portal-admin-all-postings";
import type { PortalJobStatus } from "@igbo/db/queries/portal-admin-all-postings";

const VALID_STATUS_VALUES = new Set<string>([...PORTAL_JOB_STATUS_VALUES, "archived"]);

export const GET = withApiHandler(async (req) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );

  const filters: AdminPostingsFilterOptions = { page, pageSize };

  const status = url.searchParams.get("status");
  if (status && VALID_STATUS_VALUES.has(status)) {
    filters.status = status as PortalJobStatus | "archived";
  }

  const companyId = url.searchParams.get("companyId");
  if (companyId) filters.companyId = companyId;

  const dateFromStr = url.searchParams.get("dateFrom");
  if (dateFromStr) filters.dateFrom = new Date(dateFromStr);

  const dateToStr = url.searchParams.get("dateTo");
  if (dateToStr) filters.dateTo = new Date(dateToStr);

  const result = await listAllPostingsForAdmin(filters);
  return successResponse(result);
});
