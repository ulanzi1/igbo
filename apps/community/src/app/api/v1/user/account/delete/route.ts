import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { requestAccountDeletion } from "@/services/gdpr-service";
import { z } from "zod/v4";

const schema = z.object({
  password: z.string().min(1),
});

const handler = async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

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

  await requestAccountDeletion(userId, result.data.password);

  return successResponse({ message: "Deletion scheduled. Check email for cancellation link." });
};

export const POST = withApiHandler(handler);
