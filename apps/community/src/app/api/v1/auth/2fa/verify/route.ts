import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { verify2fa } from "@/services/auth-service";

const verifySchema = z.object({
  challengeToken: z.string().uuid(),
  code: z.string().min(6).max(16),
});

export const POST = withApiHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid request body" });
  }

  const { challengeToken, code } = parsed.data;
  const result = await verify2fa(challengeToken, code);

  if (result.status === "invalid") {
    throw new ApiError({ title: "Unauthorized", status: 401, detail: "Invalid 2FA code" });
  }

  return successResponse({ challengeToken: result.challengeToken });
});
