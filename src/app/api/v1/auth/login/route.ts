import { z } from "zod/v4";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { initiateLogin } from "@/services/auth-service";
import { env } from "@/env";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const POST = withApiHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid request body" });
  }

  const { email, password } = parsed.data;
  const ip =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = request.headers.get("User-Agent");

  const result = await initiateLogin(email, password, userAgent, ip);

  if (result.status === "locked") {
    throw new ApiError({
      title: "Too Many Requests",
      status: 429,
      detail: `Account temporarily locked. Try again in ${Math.ceil(env.ACCOUNT_LOCKOUT_SECONDS / 60)} minutes or contact support.`,
    });
  }

  if (result.status === "banned") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "banned",
    });
  }

  if (result.status === "suspended") {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: "suspended",
      extensions: {
        until: result.until,
        reason: result.reason,
      },
    });
  }

  if (result.status === "invalid") {
    throw new ApiError({
      title: "Unauthorized",
      status: 401,
      detail: "Invalid credentials",
    });
  }

  return successResponse({
    requiresMfaSetup: result.status === "requires_2fa_setup",
    challengeToken: result.challengeToken,
  });
});
