import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  getDocumentById,
  updateGovernanceDocument,
  publishGovernanceDocument,
} from "@/services/governance-document-service";
import { z } from "zod/v4";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  contentIgbo: z.string().optional(),
  visibility: z.enum(["public", "admin_only"]).optional(),
});

export const GET = withApiHandler(async (request: Request) => {
  await requireAdminSession(request);
  const documentId = new URL(request.url).pathname.split("/").at(-1)!;
  const doc = await getDocumentById(documentId);
  if (!doc) throw new ApiError({ title: "Not Found", status: 404 });
  return successResponse({ document: doc });
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);
  const documentId = new URL(request.url).pathname.split("/").at(-1)!;

  const body = await request.json().catch(() => null);
  if (!body) throw new ApiError({ title: "Invalid JSON", status: 400 });

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      detail: parsed.error.issues[0]?.message ?? "Invalid input",
      status: 400,
    });
  }

  const doc = await updateGovernanceDocument(adminId, documentId, parsed.data);
  if (!doc) throw new ApiError({ title: "Not Found", status: 404 });
  return successResponse({ document: doc });
});

export const POST = withApiHandler(async (request: Request) => {
  const { adminId } = await requireAdminSession(request);
  const parts = new URL(request.url).pathname.split("/");
  // POST /.../[documentId]/publish — we need to detect action from URL
  // but this route file handles /[documentId] — "publish" is done via this POST
  const documentId = parts.at(-1)!;

  const doc = await publishGovernanceDocument(adminId, documentId);
  if (!doc) throw new ApiError({ title: "Not Found", status: 404 });
  return successResponse({ document: doc });
});
