import "server-only";
import { z } from "zod/v4";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getApplicationsForEmployer } from "@igbo/db/queries/portal-applications";
import {
  EMPLOYER_STATUS_GROUP_MAP,
  EMPLOYER_SORT_WHITELIST,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/employer-application-constants";

const querySchema = z.object({
  status: z.string().optional(),
  sortBy: z.enum(EMPLOYER_SORT_WHITELIST).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export const GET = withApiHandler(async (req: Request) => {
  const session = await requireEmployerRole();
  const company = await getCompanyByOwnerId(session.user.id);
  if (!company) {
    throw new ApiError({ title: "Company not found", status: 404 });
  }

  const url = new URL(req.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation Error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Invalid query parameters",
    });
  }

  const { status, sortBy, sortOrder, page, pageSize } = parsed.data;

  let statusFilter: (typeof EMPLOYER_STATUS_GROUP_MAP)[string] | undefined;
  if (status && status !== "all") {
    const mapped = EMPLOYER_STATUS_GROUP_MAP[status];
    if (!mapped) {
      throw new ApiError({
        title: "Validation Error",
        status: 400,
        detail: `Invalid status group: ${status}`,
      });
    }
    statusFilter = mapped;
  }

  const effectivePage = page ?? 1;
  const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE;

  const result = await getApplicationsForEmployer(company.id, {
    statusFilter,
    sortBy,
    sortOrder,
    page: effectivePage,
    pageSize: effectivePageSize,
  });

  return successResponse(
    { applications: result.applications, total: result.total },
    { page: effectivePage, pageSize: effectivePageSize, total: result.total },
  );
});
