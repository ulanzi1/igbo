import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { updateModerationKeyword, deleteModerationKeyword } from "@igbo/db/queries/moderation";
import { invalidateKeywordCache } from "@/services/moderation-service";
import { z } from "zod/v4";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  keyword: z.string().min(1).optional(),
  category: z.enum(["hate_speech", "explicit", "spam", "harassment", "other"]).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const keywordId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(keywordId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid keyword ID" });
  }

  const body = (await request.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message,
    });
  }

  await updateModerationKeyword(keywordId, parsed.data);
  await invalidateKeywordCache();
  return successResponse({ updated: true });
});

export const DELETE = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const keywordId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (!UUID_RE.test(keywordId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid keyword ID" });
  }

  await deleteModerationKeyword(keywordId);
  await invalidateKeywordCache();
  return successResponse({ deleted: true });
});
