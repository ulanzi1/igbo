import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";
import { logModerationEntry } from "@/db/queries/group-moderation";
import type {
  GroupModerationAction,
  GroupModerationTargetType,
} from "@/db/schema/group-moderation-logs";

export type AdminAction =
  | "APPROVE_APPLICATION"
  | "REQUEST_INFO"
  | "REJECT_APPLICATION"
  | "UNDO_ACTION"
  | "RESET_2FA"
  | "MEMBER_TIER_CHANGED";

interface AuditParams {
  actorId: string;
  action: AdminAction;
  targetUserId: string;
  details?: Record<string, unknown>; // IDs only — no PII
  ipAddress?: string;
}

/**
 * Writes an admin action to the audit log.
 * Never logs PII: only IDs in details.
 */
export async function logAdminAction(params: AuditParams): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: params.action,
    targetUserId: params.targetUserId,
    details: params.details ?? null,
    ipAddress: params.ipAddress ?? null,
  });
}

export interface GroupModerationParams {
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
 * Writes a group moderation action to the group_moderation_logs table.
 * Group leaders are NOT platform admins — this is a separate audit trail.
 * Never logs PII: only IDs.
 */
export async function logGroupModerationAction(params: GroupModerationParams): Promise<void> {
  await logModerationEntry(params);
}
