import "server-only";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { listSeekerCvs, countSeekerCvs, createSeekerCv } from "@igbo/db/queries/portal-seeker-cvs";
import { createFileUpload } from "@igbo/db/queries/file-uploads";
import { cvLabelSchema } from "@/lib/validations/seeker-cv";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getPortalS3Client } from "@/lib/s3-client";

const ALLOWED_CV_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_CVS_PER_SEEKER = 5;

export const GET = withApiHandler(async (_req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();
  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }
  const cvs = await listSeekerCvs(profile.id);
  return successResponse(cvs);
});

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  const profile = await getSeekerProfileByUserId(session.user.id);
  if (!profile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 404,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }

  const formData = await req.formData().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid form data" });
  });

  const file = formData.get("file");
  const labelRaw = formData.get("label");

  if (!file || !(file instanceof File)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing file field" });
  }

  const labelParsed = cvLabelSchema.safeParse(labelRaw);
  if (!labelParsed.success) {
    throw new ApiError({
      title: "Validation error",
      status: 400,
      detail: labelParsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  if (!ALLOWED_CV_MIME_TYPES.has(file.type)) {
    throw new ApiError({
      title: "Invalid file type",
      status: 400,
      extensions: { code: PORTAL_ERRORS.INVALID_FILE_TYPE },
    });
  }

  if (file.size > MAX_CV_SIZE_BYTES) {
    throw new ApiError({
      title: "File too large",
      status: 400,
      extensions: { code: PORTAL_ERRORS.FILE_TOO_LARGE },
    });
  }

  const count = await countSeekerCvs(profile.id);
  if (count >= MAX_CVS_PER_SEEKER) {
    throw new ApiError({
      title: "CV limit reached",
      status: 409,
      extensions: { code: PORTAL_ERRORS.CV_LIMIT_REACHED },
    });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const objectKey = `portal/cvs/${session.user.id}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // TODO: Wire portal CV scanning — portal/cvs/* keys are not yet processed by the scanner job
  await getPortalS3Client().send(
    new PutObjectCommand({
      Bucket: process.env.HETZNER_S3_BUCKET, // ci-allow-process-env
      Key: objectKey,
      Body: buffer,
      ContentType: file.type,
      ContentLength: buffer.byteLength,
    }),
  );

  const upload = await createFileUpload({
    uploaderId: session.user.id,
    objectKey,
    originalFilename: file.name,
    fileType: file.type,
    fileSize: file.size,
  });

  const cv = await createSeekerCv({
    seekerProfileId: profile.id,
    fileUploadId: upload.id,
    label: labelParsed.data,
    isDefault: count === 0,
  });

  return successResponse(cv, undefined, 201);
});
