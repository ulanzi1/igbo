import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { getApplicationsList } from "@/services/admin-approval-service";
import type { ApplicationStatus } from "@igbo/db/queries/admin-approvals";
import { ApiError } from "@/lib/api-error";

const ALLOWED_STATUSES: ApplicationStatus[] = [
  "PENDING_APPROVAL",
  "APPROVED",
  "INFO_REQUESTED",
  "REJECTED",
];

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "PENDING_APPROVAL";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );

  if (!ALLOWED_STATUSES.includes(statusParam as ApplicationStatus)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
    });
  }

  const result = await getApplicationsList(request, {
    status: statusParam as ApplicationStatus,
    page,
    pageSize,
  });

  return successResponse(result.data, result.meta);
});
