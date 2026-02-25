import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAuthenticatedSession } from "@/services/permissions";
import { updateLanguagePreference } from "@/db/queries/auth-queries";
import { z } from "zod/v4";

const languageSchema = z.object({
  locale: z.enum(["en", "ig"]),
});

export const PATCH = withApiHandler(async (request: Request) => {
  const { userId } = await requireAuthenticatedSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = languageSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Invalid locale value",
    });
  }

  const { locale } = result.data;

  await updateLanguagePreference(userId, locale);

  return successResponse({ locale });
});
