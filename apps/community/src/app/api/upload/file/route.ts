import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { proxyUpload } from "@/services/file-upload-service";
import { RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { z } from "zod/v4";
// Side-effect: registers the file-processing job so runJob("file-processing") works
import "@/server/jobs/file-processing";

const categorySchema = z.enum(["image", "video", "document", "audio", "media", "profile_photo"]);

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid form data" });
  }

  // Next.js App Router returns File (extends Blob) for multipart uploads.
  // Checking instanceof Blob is more robust across Node.js versions than instanceof File.
  const fileField = formData.get("file");
  if (!(fileField instanceof Blob)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "No file provided" });
  }
  const file = fileField as File;

  const parsed = categorySchema.safeParse(formData.get("category"));
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid or missing category",
    });
  }

  const data = await proxyUpload({ uploaderId: userId, file, category: parsed.data });

  return successResponse(data);
};

export const POST = withApiHandler(handler, {
  rateLimit: {
    key: async (req) => {
      const ip = req.headers.get("x-client-ip") ?? "anonymous";
      return `file-upload:${ip}`;
    },
    ...RATE_LIMIT_PRESETS.FILE_UPLOAD_PRESIGN,
  },
});
