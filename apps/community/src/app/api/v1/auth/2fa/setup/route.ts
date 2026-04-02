import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { getChallenge } from "@/server/auth/config";
import { generate2faSecret, verify2faAndComplete } from "@/services/auth-service";
import { findUserById } from "@/db/queries/auth-queries";
import { checkRateLimit } from "@/lib/rate-limiter";

const setupInitSchema = z.object({
  challengeToken: z.string().min(1),
});

const setupVerifySchema = z.object({
  challengeToken: z.string().min(1),
  secret: z.string().min(1),
  code: z.string().length(6),
});

// GET: Generate TOTP secret + QR code for a given challenge token
export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const challengeToken = url.searchParams.get("challengeToken");

  const parsed = setupInitSchema.safeParse({ challengeToken });
  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "challengeToken required" });
  }

  const challenge = await getChallenge(parsed.data.challengeToken);
  if (!challenge || challenge.mfaVerified) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid challenge token" });
  }

  // Rate limit secret generation per challenge token (5 per 15 min)
  const rl = await checkRateLimit(`2fa_setup:${parsed.data.challengeToken}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    throw new ApiError({ title: "Too Many Requests", status: 429, detail: "Rate limit exceeded" });
  }

  const user = await findUserById(challenge.userId);
  if (!user || user.accountStatus !== "APPROVED") {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }

  const { secret, otpauthUri, qrCodeDataUrl } = await generate2faSecret(user.id, user.email);

  return successResponse({ secret, otpauthUri, qrCodeDataUrl });
});

// POST: Verify TOTP code + complete 2FA setup
export const POST = withApiHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = setupVerifySchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid request body" });
  }

  const { challengeToken, secret, code } = parsed.data;

  const challenge = await getChallenge(challengeToken);
  if (!challenge || challenge.mfaVerified) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid challenge token" });
  }

  const { recoveryCodes } = await verify2faAndComplete(
    challenge.userId,
    secret,
    code,
    challengeToken,
  );

  return successResponse({ recoveryCodes, challengeToken });
});
