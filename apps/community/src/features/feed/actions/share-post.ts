"use server";

import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { repostToFeed, shareToConversation } from "@/services/post-interaction-service";
import { env } from "@/env";

const repostSchema = z.object({
  originalPostId: z.string().uuid(),
  commentText: z.string().max(2_000).optional(),
});

const shareToConvSchema = z.object({
  postId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

export async function repostAction(rawData: unknown) {
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { success: false, errorCode: "VALIDATION_ERROR" as const, reason: "Unauthorized" };
  }

  // Rate limit (share spam guard)
  const rateLimit = await applyRateLimit(`post-share:${userId}`, RATE_LIMIT_PRESETS.POST_SHARE);
  if (!rateLimit.allowed) {
    return {
      success: false,
      errorCode: "VALIDATION_ERROR" as const,
      reason: "Rate limit exceeded",
    };
  }

  const parsed = repostSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      errorCode: "VALIDATION_ERROR" as const,
      reason: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  return repostToFeed(parsed.data.originalPostId, userId, parsed.data.commentText);
}

export async function shareToConversationAction(rawData: unknown) {
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { success: false, reason: "Unauthorized" };
  }

  // Rate limit (share spam guard — same preset for repost + share-to-DM)
  const rateLimit = await applyRateLimit(`post-share:${userId}`, RATE_LIMIT_PRESETS.POST_SHARE);
  if (!rateLimit.allowed) {
    return { success: false, reason: "Rate limit exceeded" };
  }

  const parsed = shareToConvSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, reason: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return shareToConversation(
    parsed.data.postId,
    userId,
    parsed.data.conversationId,
    env.NEXT_PUBLIC_APP_URL,
  );
}
