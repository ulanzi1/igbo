"use server";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limiter";
import { enqueueEmailJob } from "@/services/email-service";
import {
  findUserByEmail,
  createVerificationToken,
  deleteUserVerificationTokens,
} from "@igbo/db/queries/auth-queries";
import { env } from "@/env";
import type { ResendActionResult } from "@/features/auth/types/application";

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const resendSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export async function resendVerification(email: string): Promise<ResendActionResult> {
  const parsed = resendSchema.safeParse({ email });
  if (!parsed.success) {
    return { success: false, error: "Please enter a valid email address." };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  // Rate limit: 3 resends per email per hour
  // community-scope: raw Redis keys — VD-4 trigger not yet reached
  const rateLimitKey = `resend-verify:${normalizedEmail}`; // ci-allow-redis-key
  const rateLimitResult = await checkRateLimit(rateLimitKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rateLimitResult.allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  // Find user — return generic success even if not found (security: don't reveal email existence)
  const user = await findUserByEmail(normalizedEmail);
  if (!user || user.accountStatus !== "PENDING_EMAIL_VERIFICATION") {
    // Return success to prevent email enumeration
    return { success: true };
  }

  // Delete existing tokens and issue a new one
  await deleteUserVerificationTokens(user.id);

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await createVerificationToken({ userId: user.id, tokenHash, expiresAt });

  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/api/v1/auth/verify-email?token=${rawToken}&userId=${user.id}`;

  enqueueEmailJob(`email-resend-${user.id}-${Date.now()}`, {
    to: user.email,
    subject: "Verify your OBIGBO email address",
    templateId: "email-verification",
    data: { name: user.name ?? user.email, verifyUrl },
  });

  return { success: true };
}
