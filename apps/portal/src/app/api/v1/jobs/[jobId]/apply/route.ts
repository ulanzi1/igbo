import "server-only";
import { z } from "zod/v4";
import { requireJobSeekerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { submit } from "@/services/application-submission-service";

const applySchema = z.object({
  selectedCvId: z.string().uuid().nullable().optional(),
  coverLetterText: z.string().max(2000).optional(),
  portfolioLinks: z.array(z.url()).max(3).optional(),
});

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireJobSeekerRole();

  // Extract jobId from URL: /api/v1/jobs/{jobId}/apply
  const jobId = new URL(req.url).pathname.split("/").at(-2);
  if (!jobId) {
    throw new ApiError({ title: "Missing jobId", status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const idempotencyKeyRaw = req.headers.get("Idempotency-Key");
  const idempotencyKey =
    idempotencyKeyRaw && idempotencyKeyRaw.length > 0 && idempotencyKeyRaw.length <= 128
      ? idempotencyKeyRaw
      : null;

  if (idempotencyKeyRaw && !idempotencyKey) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "applications.submit.idempotency_key_invalid",
        jobId,
        reason: "length_out_of_range",
      }),
    );
  }

  const { replayed, application } = await submit({
    jobId,
    seekerUserId: session.user.id,
    selectedCvId: parsed.data.selectedCvId ?? null,
    coverLetterText: parsed.data.coverLetterText ?? null,
    portfolioLinks: parsed.data.portfolioLinks ?? [],
    idempotencyKey,
  });

  return successResponse(application, undefined, replayed ? 200 : 201);
});
