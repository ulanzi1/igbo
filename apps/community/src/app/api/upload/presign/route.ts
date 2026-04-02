import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { generatePresignedUploadUrl } from "@/services/file-upload-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  category: z.enum(["image", "video", "document", "audio", "media", "profile_photo"]),
});

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = presignSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Invalid request body",
    });
  }

  const { filename, mimeType, sizeBytes, category } = result.data;

  const data = await generatePresignedUploadUrl({
    uploaderId: userId,
    filename,
    mimeType,
    sizeBytes,
    category,
  });

  return successResponse(data);
};

export const POST = withApiHandler(handler, {
  rateLimit: {
    // Use IP for rate limit key; auth is enforced inside the handler via requireAuthenticatedSession()
    key: async (req) => {
      const ip = req.headers.get("x-client-ip") ?? "anonymous";
      return `file-upload-presign:${ip}`;
    },
    ...RATE_LIMIT_PRESETS.FILE_UPLOAD_PRESIGN,
  },
});
