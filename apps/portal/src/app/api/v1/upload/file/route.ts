import "server-only";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@igbo/auth";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { ApiError } from "@/lib/api-error";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { getPortalS3Client } from "@/lib/s3-client";

// Logo category: images only (existing behaviour)
const LOGO_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Message category: professional documents + images + plain text
const MESSAGE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
const MESSAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const MESSAGE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const formData = await req.formData().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid form data" });
  });

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing file field" });
  }

  const category = (formData.get("category") as string | null) ?? "logo";
  if (category !== "logo" && category !== "message") {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid upload category '${category}'. Accepted: logo, message`,
    });
  }
  const isMessageCategory = category === "message";

  if (isMessageCategory) {
    if (!MESSAGE_ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `Invalid file type '${file.type}'. Accepted: pdf, doc, docx, jpeg, png, webp, txt`,
      });
    }
    if (file.size > MESSAGE_MAX_SIZE_BYTES) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `File too large. Maximum size is 10MB`,
      });
    }
  } else {
    // Default: logo category (backwards-compatible)
    if (!LOGO_ALLOWED_MIME_TYPES.has(file.type)) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `Invalid file type '${file.type}'. Accepted: jpeg, png, webp, gif`,
      });
    }
    if (file.size > LOGO_MAX_SIZE_BYTES) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `File too large. Maximum size is 5MB`,
      });
    }
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const objectKey = isMessageCategory
    ? `portal/messages/${session.user.id}/${randomUUID()}.${ext}`
    : `portal/logos/${session.user.id}/${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  // Set ContentDisposition: "attachment" for non-image message files (security: prevent inline rendering)
  const contentDisposition =
    isMessageCategory && !MESSAGE_IMAGE_TYPES.has(file.type) ? "attachment" : "inline";

  const s3Client = getPortalS3Client();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.HETZNER_S3_BUCKET, // ci-allow-process-env
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
      ContentLength: buffer.byteLength,
      ContentDisposition: contentDisposition,
    }),
  );

  const record = await createFileUpload({
    uploaderId: session.user.id,
    objectKey,
    originalFilename: file.name,
    fileType: file.type,
    fileSize: file.size,
    // Message uploads are immediately usable — no async processing pipeline in portal.
    // Logo uploads keep the schema default ("processing") for backwards compatibility.
    ...(isMessageCategory ? { status: "ready" as const } : {}),
  });

  const s3PublicUrl = process.env.HETZNER_S3_PUBLIC_URL; // ci-allow-process-env
  const s3Bucket = process.env.HETZNER_S3_BUCKET; // ci-allow-process-env
  const s3Region = process.env.HETZNER_S3_REGION ?? "us-east-1"; // ci-allow-process-env
  const publicUrl = s3PublicUrl
    ? `${s3PublicUrl}/${objectKey}`
    : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${objectKey}`;

  return successResponse({ fileUploadId: record.id, objectKey, publicUrl }, undefined, 200);
});
