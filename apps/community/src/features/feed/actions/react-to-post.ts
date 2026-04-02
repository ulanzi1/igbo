"use server";

import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { reactToPost } from "@/services/post-interaction-service";
import type { ReactToPostResult } from "@/services/post-interaction-service";

const schema = z.object({
  postId: z.string().uuid(),
  reactionType: z.enum(["like", "love", "celebrate", "insightful", "funny"]),
});

/**
 * Toggle a reaction on a post.
 *
 * IMPORTANT — Asymmetric return type:
 *   On success: returns `ReactToPostResult` = `{ newReactionType, countDelta }` (NO `success` field).
 *   On error:   returns `{ success: false, errorCode, reason }`.
 * Callers detect errors via `"errorCode" in result`, NOT `!result.success`.
 */
export async function reactToPostAction(
  rawData: unknown,
): Promise<ReactToPostResult | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }> {
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
  }

  // Rate limit (reaction spam guard)
  const rateLimit = await applyRateLimit(`post-react:${userId}`, RATE_LIMIT_PRESETS.POST_REACT);
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

  return reactToPost(parsed.data.postId, userId, parsed.data.reactionType);
}
