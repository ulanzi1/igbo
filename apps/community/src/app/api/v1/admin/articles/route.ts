import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import {
  listPendingArticlesForAdmin,
  listPublishedArticlesForAdmin,
} from "@/services/article-review-service";

const ALLOWED_STATUSES = ["pending_review", "published"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const statusParam = (url.searchParams.get("status") ?? "pending_review") as AllowedStatus;
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );

  if (!(ALLOWED_STATUSES as readonly string[]).includes(statusParam)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
    });
  }

  const result =
    statusParam === "published"
      ? await listPublishedArticlesForAdmin(request, { page, pageSize })
      : await listPendingArticlesForAdmin(request, { page, pageSize });

  return successResponse(result);
});
