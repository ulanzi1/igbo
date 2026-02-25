import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { cancelAccountDeletion } from "@/services/gdpr-service";
import { z } from "zod/v4";

const schema = z.object({
  token: z.string().min(1),
  userId: z.string().min(1),
});

const handler = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Validation failed",
    });
  }

  await cancelAccountDeletion(result.data.token, result.data.userId);

  return successResponse({ message: "Account deletion cancelled." });
};

export const POST = withApiHandler(handler, {
  rateLimit: {
    key: async (req) => {
      return `gdpr-cancel:${req.headers.get("x-client-ip") ?? "anonymous"}`;
    },
    maxRequests: 5,
    windowMs: 900_000, // 5 attempts per 15 minutes per IP
  },
});
