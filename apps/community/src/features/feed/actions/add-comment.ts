"use server";

import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@igbo/auth/permissions";
import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { addComment } from "@/services/post-interaction-service";
import type { AddCommentResult, AddCommentError } from "@/services/post-interaction-service";

const schema = z.object({
  postId: z.string().uuid(),
  content: z.string().min(1, "Comment cannot be empty").max(2_000),
  parentCommentId: z.string().uuid().nullable().optional(),
});

export async function addCommentAction(
  rawData: unknown,
): Promise<
  | AddCommentResult
  | AddCommentError
  | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
> {
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
  }

  // Rate limit (comment spam guard)
  const rateLimit = await applyRateLimit(`post-comment:${userId}`, RATE_LIMIT_PRESETS.POST_COMMENT);
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

  return addComment(parsed.data.postId, userId, parsed.data.content, parsed.data.parentCommentId);
}
