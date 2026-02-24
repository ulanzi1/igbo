import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getChallenge } from "@/server/auth/config";
import { sendEmailOtp, verifyEmailOtp } from "@/services/auth-service";

const requestSchema = z.object({
  challengeToken: z.string().min(1),
});

const verifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().length(6),
});

// POST: Request email OTP
export const POST = withApiHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);

  // Distinguish request vs verify by presence of code field
  if (body && typeof body === "object" && "code" in body) {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid request body" });
    }

    const challenge = await getChallenge(parsed.data.challengeToken);
    if (!challenge) {
      throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid challenge token" });
    }

    const result = await verifyEmailOtp(
      parsed.data.challengeToken,
      challenge.userId,
      parsed.data.code,
    );

    if (result.status === "invalid") {
      throw new ApiError({ title: "Unauthorized", status: 401, detail: "Invalid OTP code" });
    }

    return successResponse({ challengeToken: result.challengeToken });
  }

  // Request OTP
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "challengeToken required" });
  }

  const challenge = await getChallenge(parsed.data.challengeToken);
  if (!challenge) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid challenge token" });
  }

  await sendEmailOtp(challenge.userId, parsed.data.challengeToken);
  return successResponse({ sent: true });
});
