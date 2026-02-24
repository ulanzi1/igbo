import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { resetPassword } from "@/services/auth-service";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[a-z]/, "Must contain lowercase")
    .regex(/[0-9]/, "Must contain number")
    .regex(/[^A-Za-z0-9]/, "Must contain special character"),
});

export const POST = withApiHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail:
        "Password must be at least 8 characters with uppercase, lowercase, number, and special character.",
    });
  }

  await resetPassword(parsed.data.token, parsed.data.password);

  return successResponse({ message: "Password reset successfully. Please log in." });
});
