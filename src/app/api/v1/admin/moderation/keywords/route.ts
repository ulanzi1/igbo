import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { listModerationKeywords, addModerationKeyword } from "@/db/queries/moderation";
import { eventBus } from "@/services/event-bus";
import { z } from "zod/v4";

const addSchema = z.object({
  keyword: z.string().min(1),
  category: z.enum(["hate_speech", "explicit", "spam", "harassment", "other"]),
  severity: z.enum(["low", "medium", "high"]),
  notes: z.string().optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);

  const url = new URL(request.url);
  const isActiveParam = url.searchParams.get("isActive");
  const isActive = isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;

  const keywords = await listModerationKeywords({ isActive });
  return successResponse({ keywords });
});

export const POST = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);

  const body = (await request.json()) as unknown;
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Unprocessable Entity",
      status: 422,
      detail: parsed.error.issues[0]?.message,
    });
  }

  const keyword = await addModerationKeyword({ ...parsed.data, createdBy: adminId });

  try {
    eventBus.emit("moderation.keyword_added", {
      keyword: parsed.data.keyword,
      severity: parsed.data.severity,
      category: parsed.data.category,
      createdBy: adminId,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-critical — keyword already persisted
  }

  return successResponse({ keyword }, undefined, 201);
});
