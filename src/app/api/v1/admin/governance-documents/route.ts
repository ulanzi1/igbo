import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import { listAllDocuments, createGovernanceDocument } from "@/services/governance-document-service";
import { z } from "zod/v4";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  content: z.string().min(1),
  contentIgbo: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
  visibility: z.enum(["public", "admin_only"]).optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);
  const docs = await listAllDocuments();
  return successResponse({ documents: docs });
});

export const POST = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);
  const body = await request.json().catch(() => null);
  if (!body) throw new ApiError({ title: "Invalid JSON", status: 400 });

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
      status: 400,
    });
  }

  const doc = await createGovernanceDocument(adminId, parsed.data);
  return successResponse({ document: doc }, undefined, 201);
});
