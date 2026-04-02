import "server-only";
import { db } from "@igbo/db";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { logModerationEntry } from "@igbo/db/queries/group-moderation";
import type {
  GroupModerationAction,
  GroupModerationTargetType,
} from "@igbo/db/schema/group-moderation-logs";

export type AdminAction =
  | "APPROVE_APPLICATION"
  | "REQUEST_INFO"
  | "REJECT_APPLICATION"
  | "UNDO_ACTION"
  | "RESET_2FA"
  | "MEMBER_TIER_CHANGED"
  | "RECORDING_LOST"
  | "RECORDING_EXPIRED_CLEANUP"
  | "FLAG_CONTENT"
  | "UNFLAG_CONTENT"
  | "HIDE_CONTENT"
  | "UNHIDE_CONTENT"
  | "WARN_MEMBER"
  | "SUSPEND_MEMBER"
  | "BAN_MEMBER"
  | "LIFT_SUSPENSION"
  | "VIEW_DISPUTE_CONVERSATION"
  | "BADGE_ASSIGNED"
  | "BADGE_REVOKED"
  | "SETTINGS_UPDATED"
  | "GOVERNANCE_CREATED"
  | "GOVERNANCE_PUBLISHED"
  | "GOVERNANCE_UPDATED"
  | "ARTICLE_REJECTED"
  | "ARTICLE_REVISION_REQUESTED"
  | "MAINTENANCE_ENABLED"
  | "MAINTENANCE_DISABLED";

interface AuditParams {
  actorId: string;
  action: AdminAction;
  /** Legacy alias; maps to targetId. At least one of targetUserId or targetId should be provided. */
  targetUserId?: string;
  /** Generic target ID (UUID or string). Takes precedence over targetUserId when provided. */
  targetId?: string;
  /** Discriminator for the target entity (e.g. "user", "article", "governance_document"). */
  targetType?: string;
  details?: Record<string, unknown>; // IDs only — no PII
  ipAddress?: string;
  traceId?: string;
}

/**
 * Writes an admin action to the audit log.
 * Never logs PII: only IDs in details.
 */
export async function logAdminAction(params: AuditParams): Promise<void> {
  const resolvedTargetId = params.targetId ?? params.targetUserId ?? null;
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    action: params.action,
    targetUserId: resolvedTargetId,
    targetType: params.targetType ?? null,
    traceId: params.traceId ?? null,
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
