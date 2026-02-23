import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema/audit-logs";

export type AdminAction =
  | "APPROVE_APPLICATION"
  | "REQUEST_INFO"
  | "REJECT_APPLICATION"
  | "UNDO_ACTION";

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
