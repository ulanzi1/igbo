"use server";

import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { toggleBookmark } from "@/services/bookmark-service";

const schema = z.object({
  postId: z.string().uuid(),
});

export async function toggleBookmarkAction(
  rawData: unknown,
): Promise<
  { bookmarked: boolean } | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
> {
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
  }

  const rateLimit = await applyRateLimit(
    `post-bookmark:${userId}`,
    RATE_LIMIT_PRESETS.POST_BOOKMARK,
  );
  if (!rateLimit.allowed) {
    return { success: false, errorCode: "VALIDATION_ERROR", reason: "Rate limit exceeded" };
  }

  const parsed = schema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  return toggleBookmark(userId, parsed.data.postId);
}
