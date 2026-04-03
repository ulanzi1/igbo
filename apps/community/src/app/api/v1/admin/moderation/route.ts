import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { listFlaggedContent } from "@igbo/db/queries/moderation";

const VALID_STATUSES = ["pending", "reviewed", "dismissed"] as const;
const VALID_CONTENT_TYPES = ["post", "article", "message"] as const;

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const contentTypeParam = url.searchParams.get("contentType");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
  );

  const status = VALID_STATUSES.includes(statusParam as (typeof VALID_STATUSES)[number])
    ? (statusParam as (typeof VALID_STATUSES)[number])
    : undefined;

  const contentType = VALID_CONTENT_TYPES.includes(
    contentTypeParam as (typeof VALID_CONTENT_TYPES)[number],
  )
    ? (contentTypeParam as (typeof VALID_CONTENT_TYPES)[number])
    : undefined;

  const { items, total } = await listFlaggedContent({ status, contentType, page, pageSize });

  return successResponse({ items }, { page, pageSize, total });
});
