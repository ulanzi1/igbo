import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requestPasswordReset } from "@/services/auth-service";

const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const POST = withApiHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Valid email required" });
  }

  // Always returns success — prevent enumeration
  await requestPasswordReset(parsed.data.email);

  return successResponse({
    message: "If an account with that email exists, a reset link has been sent.",
  });
});
