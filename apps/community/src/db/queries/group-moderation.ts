// No "server-only" — consistent with other query files
import { db } from "@/db";
import { communityGroupModerationLogs } from "@/db/schema/group-moderation-logs";
import type {
  GroupModerationAction,
  GroupModerationTargetType,
} from "@/db/schema/group-moderation-logs";

export type { GroupModerationAction, GroupModerationTargetType };

export interface LogModerationParams {
  groupId: string;
  moderatorId: string;
  targetUserId?: string | null;
  targetType: GroupModerationTargetType;
  targetId?: string | null;
  action: GroupModerationAction;
  reason?: string | null;
  expiresAt?: Date | null;
}

/**
 * Write a group moderation log entry.
 * Used by all moderation actions (mute, ban, remove_post, etc.).
 */
export async function logModerationEntry(params: LogModerationParams): Promise<void> {
  await db.insert(communityGroupModerationLogs).values({
    groupId: params.groupId,
    moderatorId: params.moderatorId,
    targetUserId: params.targetUserId ?? null,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    action: params.action,
    reason: params.reason ?? null,
    expiresAt: params.expiresAt ?? null,
  });
}
