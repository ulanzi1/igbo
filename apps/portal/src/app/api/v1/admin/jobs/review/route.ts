import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireJobAdminRole } from "@/lib/portal-permissions";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getReviewQueue } from "@/services/admin-review-service";

export const GET = withApiHandler(async (req: Request) => {
  await requireJobAdminRole();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );
  const verifiedOnly = url.searchParams.get("verifiedOnly") === "true";
  const dateFromStr = url.searchParams.get("dateFrom");
  const dateToStr = url.searchParams.get("dateTo");
  const minRevisionCountStr = url.searchParams.get("minRevisionCount");

  const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
  const dateTo = dateToStr ? new Date(dateToStr) : undefined;
  const minRevisionCount = minRevisionCountStr ? parseInt(minRevisionCountStr, 10) : undefined;

  if (dateFrom && isNaN(dateFrom.getTime())) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid dateFrom parameter" });
  }
  if (dateTo && isNaN(dateTo.getTime())) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid dateTo parameter" });
  }

  const { items, total } = await getReviewQueue({
    page,
    pageSize,
    verifiedOnly: verifiedOnly || undefined,
    dateFrom,
    dateTo,
    minRevisionCount,
  });

  return successResponse({ items, total }, { page, pageSize, total });
});
