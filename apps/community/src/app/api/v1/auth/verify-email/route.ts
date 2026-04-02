import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withApiHandler } from "@/server/api/middleware";
import {
  consumeVerificationToken,
  findTokenByHash,
  transitionUserToApprovalPending,
} from "@/db/queries/auth-queries";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";
import { env } from "@/env";

const DEFAULT_LOCALE = "en";

function getLocaleFromRequest(request: Request): string {
  const acceptLang = request.headers.get("Accept-Language");
  if (acceptLang?.startsWith("ig")) return "ig";
  return DEFAULT_LOCALE;
}

function redirect(request: Request, path: string): Response {
  const locale = getLocaleFromRequest(request);
  return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL}/${locale}${path}`);
}

export const GET = withApiHandler(async (request: Request) => {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");
  const userId = url.searchParams.get("userId");

  if (!rawToken || !userId) {
    return redirect(request, "/apply?status=token-invalid");
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  // Atomically consume the token (prevents replay attacks)
  const token = await consumeVerificationToken(tokenHash);

  if (!token) {
    // Token not found, already used, or expired — check which case
    const existing = await findTokenByHash(tokenHash);
    if (!existing) {
      return redirect(request, "/apply?status=token-invalid");
    }
    // Token was found but already used or expired → show resend option
    return redirect(request, "/apply?status=token-expired");
  }

  // Verify the userId matches the token's userId for consistency
  if (token.userId !== userId) {
    return redirect(request, "/apply?status=token-invalid");
  }

  // Transition user to PENDING_APPROVAL and set email_verified timestamp
  const user = await transitionUserToApprovalPending(userId);
  if (!user) {
    return redirect(request, "/apply?status=token-invalid");
  }

  // Emit domain event
  eventBus.emit("user.email_verified", {
    userId: user.id,
    timestamp: new Date().toISOString(),
  });

  // Enqueue delayed status notification email (non-blocking)
  enqueueEmailJob(`email-status-notify-${user.id}`, {
    to: user.email,
    subject: "Your OBIGBO application is under review",
    templateId: "application-received",
    data: { name: user.name ?? user.email },
  });

  return redirect(request, "/apply?status=email-verified");
});
