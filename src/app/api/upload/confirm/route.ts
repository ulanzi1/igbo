import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { confirmUpload } from "@/services/file-upload-service";
import { z } from "zod/v4";

const confirmSchema = z.object({
  objectKey: z.string().min(1),
});

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = confirmSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  const { objectKey } = result.data;

  await confirmUpload(objectKey, userId);

  return successResponse({ message: "Upload received. Processing will begin shortly." });
};

export const POST = withApiHandler(handler);
