import "server-only";
import { auth } from "@igbo/auth";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { submitReportSchema } from "@/lib/validations/posting-report";
import { submitReport } from "@/services/posting-report-service";

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  // Extract postingId from URL: /api/v1/reports/postings/{postingId}
  const postingId = new URL(req.url).pathname.split("/").at(-1);
  if (!postingId) {
    throw new ApiError({ title: "Missing postingId", status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = submitReportSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const report = await submitReport({
    postingId,
    reporterUserId: session.user.id,
    category: parsed.data.category,
    description: parsed.data.description,
  });

  return successResponse(report, undefined, 201);
});
