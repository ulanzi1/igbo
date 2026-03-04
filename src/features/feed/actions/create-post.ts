"use server";

import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { createFeedPost, createGroupPost } from "@/services/post-service";
import type { CreateFeedPostResponse } from "@/services/post-service";

const createPostSchema = z
  .object({
    content: z.string().max(10_000),
    contentType: z.enum(["text", "rich_text", "media"]),
    category: z.enum(["discussion", "event", "announcement"]),
    fileUploadIds: z.array(z.string().uuid()).max(4).optional(),
    mediaTypes: z
      .array(z.enum(["image", "video", "audio"]))
      .max(4)
      .optional(),
    groupId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      const ids = data.fileUploadIds?.length ?? 0;
      const types = data.mediaTypes?.length ?? 0;
      return ids === types;
    },
    { message: "fileUploadIds and mediaTypes must have matching lengths" },
  )
  .refine(
    (data) => {
      // Require either text content or media attachments
      return data.content.trim().length > 0 || (data.fileUploadIds?.length ?? 0) > 0;
    },
    { message: "Post must have text content or media attachments" },
  );

export async function createPost(
  rawData: unknown,
): Promise<
  CreateFeedPostResponse | { success: false; errorCode: "VALIDATION_ERROR"; reason: string }
> {
  // Auth check
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { success: false, errorCode: "VALIDATION_ERROR", reason: "Unauthorized" };
  }

  // Rate limit (abuse guard — separate from weekly tier limit)
  const rateLimit = await applyRateLimit(`post-create:${userId}`, RATE_LIMIT_PRESETS.POST_CREATE);
  if (!rateLimit.allowed) {
    return { success: false, errorCode: "VALIDATION_ERROR", reason: "Rate limit exceeded" };
  }

  // Validate input
  const parsed = createPostSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      errorCode: "VALIDATION_ERROR",
      reason: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Route to group post or general feed post
  if (parsed.data.groupId) {
    return createGroupPost({
      authorId: userId,
      groupId: parsed.data.groupId,
      content: parsed.data.content,
      contentType: parsed.data.contentType,
      category: parsed.data.category,
      fileUploadIds: parsed.data.fileUploadIds,
      mediaTypes: parsed.data.mediaTypes,
    });
  }

  return createFeedPost({
    authorId: userId,
    content: parsed.data.content,
    contentType: parsed.data.contentType,
    category: parsed.data.category,
    fileUploadIds: parsed.data.fileUploadIds,
    mediaTypes: parsed.data.mediaTypes,
  });
}
