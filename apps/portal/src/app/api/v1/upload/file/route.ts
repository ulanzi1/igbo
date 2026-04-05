import "server-only";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@igbo/auth";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { ApiError } from "@/lib/api-error";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) {
    // portal has no @/env module; follows @igbo/auth pattern of direct process.env reads
    _s3Client = new S3Client({
      endpoint: process.env.HETZNER_S3_ENDPOINT, // ci-allow-process-env
      region: process.env.HETZNER_S3_REGION ?? "us-east-1", // ci-allow-process-env
      credentials: {
        accessKeyId: process.env.HETZNER_S3_ACCESS_KEY_ID ?? "", // ci-allow-process-env
        secretAccessKey: process.env.HETZNER_S3_SECRET_ACCESS_KEY ?? "", // ci-allow-process-env
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return _s3Client;
}

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

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `Invalid file type '${file.type}'. Accepted: jpeg, png, webp, gif`,
    });
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: `File too large. Maximum size is 5MB`,
    });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const objectKey = `portal/logos/${session.user.id}/${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const s3Client = getS3Client();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.HETZNER_S3_BUCKET, // ci-allow-process-env
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
      ContentLength: buffer.byteLength,
    }),
  );

  const record = await createFileUpload({
    uploaderId: session.user.id,
    objectKey,
    originalFilename: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  const s3PublicUrl = process.env.HETZNER_S3_PUBLIC_URL; // ci-allow-process-env
  const s3Bucket = process.env.HETZNER_S3_BUCKET; // ci-allow-process-env
  const s3Region = process.env.HETZNER_S3_REGION ?? "us-east-1"; // ci-allow-process-env
  const publicUrl = s3PublicUrl
    ? `${s3PublicUrl}/${objectKey}`
    : `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${objectKey}`;

  return successResponse({ fileUploadId: record.id, objectKey, publicUrl }, undefined, 200);
});
