import "server-only";
import { auth } from "@igbo/auth";
import { ApiError } from "@/lib/api-error";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { submitVerificationSchema } from "@/lib/validations/employer-verification";
import {
  submitVerificationRequest,
  getVerificationStatus,
} from "@/services/employer-verification-service";

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const companyId = new URL(req.url).pathname.split("/").at(-2);
  if (!companyId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing companyId" });
  }

  const body = await req.json().catch(() => {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  });

  const parsed = submitVerificationSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: "Validation error",
      status: 400,
      detail: parsed.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const verification = await submitVerificationRequest(
    companyId,
    session.user.id,
    parsed.data.documents,
  );

  return successResponse(verification, undefined, 201);
});

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const companyId = new URL(req.url).pathname.split("/").at(-2);
  if (!companyId) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Missing companyId" });
  }

  const status = await getVerificationStatus(companyId);
  return successResponse(status);
});
