"use server";

import { z } from "zod/v4";
import { requireAuthenticatedSession } from "@/services/permissions";
import { applyRateLimit, RATE_LIMIT_PRESETS } from "@/services/rate-limiter";
import { createGroupForUser } from "@/services/group-service";

// ─── Validation Schema ────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().max(1000, "Description must be 1000 characters or less").optional(),
  bannerUrl: z.string().optional(),
  visibility: z.enum(["public", "private", "hidden"]),
  joinType: z.enum(["open", "approval"]),
  postingPermission: z.enum(["all_members", "leaders_only", "moderated"]),
  commentingPermission: z.enum(["open", "members_only", "disabled"]),
  memberLimit: z.number().int().positive().optional(),
});

// ─── Return Types ─────────────────────────────────────────────────────────────

type CreateGroupSuccess = { groupId: string };
type CreateGroupError = {
  errorCode: "UNAUTHORIZED" | "PERMISSION_DENIED" | "VALIDATION_ERROR" | "RATE_LIMIT_EXCEEDED";
  reason: string;
};

export type CreateGroupResult = CreateGroupSuccess | CreateGroupError;

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Create a new group. Shape B: returns { groupId } on success, { errorCode, reason } on failure.
 * Error detection: "errorCode" in result.
 */
export async function createGroupAction(rawData: unknown): Promise<CreateGroupResult> {
  let userId: string;
  try {
    const session = await requireAuthenticatedSession();
    userId = session.userId;
  } catch {
    return { errorCode: "UNAUTHORIZED", reason: "Authentication required" };
  }

  const rateLimit = await applyRateLimit(`group-create:${userId}`, RATE_LIMIT_PRESETS.GROUP_CREATE);
  if (!rateLimit.allowed) {
    return {
      errorCode: "RATE_LIMIT_EXCEEDED",
      reason: "Too many requests. Please try again later.",
    };
  }

  const parsed = createGroupSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      errorCode: "VALIDATION_ERROR",
      reason: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const group = await createGroupForUser(userId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      bannerUrl: parsed.data.bannerUrl ?? null,
      visibility: parsed.data.visibility,
      joinType: parsed.data.joinType,
      postingPermission: parsed.data.postingPermission,
      commentingPermission: parsed.data.commentingPermission,
      memberLimit: parsed.data.memberLimit ?? null,
    });
    return { groupId: group.id };
  } catch (error: unknown) {
    if (error !== null && typeof error === "object" && "status" in error && error.status === 403) {
      return {
        errorCode: "PERMISSION_DENIED",
        reason: "Group creation requires TOP_TIER membership",
      };
    }
    const message = error instanceof Error ? error.message : "Failed to create group";
    return { errorCode: "VALIDATION_ERROR", reason: message };
  }
}
