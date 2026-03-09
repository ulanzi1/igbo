import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";
import { findUserById } from "@/db/queries/auth-queries";
import { findActiveSessionsByUserId, deleteAllSessionsForUser } from "@/db/queries/auth-sessions";
import { evictAllUserSessions } from "@/server/auth/redis-session-cache";
import {
  createDisciplineAction,
  listSuspensionsExpiringBefore,
  expireDisciplineAction,
} from "@/db/queries/member-discipline";
import { logAdminAction } from "@/services/audit-logger";
import { eventBus } from "@/services/event-bus";

// ─── Session eviction helper ──────────────────────────────────────────────────

async function evictUserSessions(userId: string): Promise<void> {
  const sessions = await findActiveSessionsByUserId(userId);
  const tokens = sessions.map((s) => s.sessionToken);
  await evictAllUserSessions(tokens);
  await deleteAllSessionsForUser(userId);
}

// ─── Discipline actions ───────────────────────────────────────────────────────

export interface IssueDisciplineParams {
  targetUserId: string;
  moderationActionId?: string | null;
  adminId: string;
  reason: string;
  notes?: string | null;
}

export async function issueWarning(params: IssueDisciplineParams): Promise<{ id: string }> {
  const { targetUserId, moderationActionId, adminId, reason, notes } = params;

  const result = await createDisciplineAction({
    userId: targetUserId,
    moderationActionId: moderationActionId ?? null,
    sourceType: moderationActionId ? "moderation_action" : "manual",
    actionType: "warning",
    reason,
    notes: notes ?? null,
    issuedBy: adminId,
  });

  await logAdminAction({
    actorId: adminId,
    action: "WARN_MEMBER",
    targetUserId,
    details: { disciplineId: result.id, moderationActionId: moderationActionId ?? null },
  });

  // Notify member of warning via notification pipeline
  eventBus.emit("account.discipline_issued", {
    userId: targetUserId,
    disciplineType: "warning",
    reason,
    disciplineId: result.id,
    timestamp: new Date().toISOString(),
  });

  return result;
}

export async function issueSuspension(
  params: IssueDisciplineParams & { durationHours: 24 | 168 | 720 },
): Promise<{ id: string }> {
  const { targetUserId, moderationActionId, adminId, reason, notes, durationHours } = params;

  const suspensionEndsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  // Get current status before change for event payload
  const currentUser = await findUserById(targetUserId);
  const oldStatus = currentUser?.accountStatus ?? "APPROVED";

  // Update account status to SUSPENDED
  await db
    .update(authUsers)
    .set({ accountStatus: "SUSPENDED", updatedAt: new Date() })
    .where(eq(authUsers.id, targetUserId));

  // Invalidate all sessions immediately
  await evictUserSessions(targetUserId);

  const result = await createDisciplineAction({
    userId: targetUserId,
    moderationActionId: moderationActionId ?? null,
    sourceType: moderationActionId ? "moderation_action" : "manual",
    actionType: "suspension",
    reason,
    notes: notes ?? null,
    suspensionEndsAt,
    issuedBy: adminId,
  });

  await logAdminAction({
    actorId: adminId,
    action: "SUSPEND_MEMBER",
    targetUserId,
    details: {
      disciplineId: result.id,
      moderationActionId: moderationActionId ?? null,
      durationHours,
      suspensionEndsAt: suspensionEndsAt.toISOString(),
    },
  });

  eventBus.emit("account.status_changed", {
    userId: targetUserId,
    newStatus: "SUSPENDED",
    oldStatus,
    timestamp: new Date().toISOString(),
  });

  eventBus.emit("account.discipline_issued", {
    userId: targetUserId,
    disciplineType: "suspension",
    reason,
    disciplineId: result.id,
    suspensionEndsAt: suspensionEndsAt.toISOString(),
    timestamp: new Date().toISOString(),
  });

  return result;
}

export async function issueBan(params: IssueDisciplineParams): Promise<{ id: string }> {
  const { targetUserId, moderationActionId, adminId, reason, notes } = params;

  const currentUser = await findUserById(targetUserId);
  const oldStatus = currentUser?.accountStatus ?? "APPROVED";

  // Update account status to BANNED
  await db
    .update(authUsers)
    .set({ accountStatus: "BANNED", updatedAt: new Date() })
    .where(eq(authUsers.id, targetUserId));

  // Invalidate all sessions immediately
  await evictUserSessions(targetUserId);

  const result = await createDisciplineAction({
    userId: targetUserId,
    moderationActionId: moderationActionId ?? null,
    sourceType: moderationActionId ? "moderation_action" : "manual",
    actionType: "ban",
    reason,
    notes: notes ?? null,
    issuedBy: adminId,
  });

  await logAdminAction({
    actorId: adminId,
    action: "BAN_MEMBER",
    targetUserId,
    details: { disciplineId: result.id, moderationActionId: moderationActionId ?? null },
  });

  eventBus.emit("account.status_changed", {
    userId: targetUserId,
    newStatus: "BANNED",
    oldStatus,
    timestamp: new Date().toISOString(),
  });

  eventBus.emit("account.discipline_issued", {
    userId: targetUserId,
    disciplineType: "ban",
    reason,
    disciplineId: result.id,
    timestamp: new Date().toISOString(),
  });

  return result;
}

// ─── Automated suspension lift job ───────────────────────────────────────────

export async function liftExpiredSuspensions(now: Date): Promise<number> {
  const expiring = await listSuspensionsExpiringBefore(now);
  let liftedCount = 0;

  for (const suspension of expiring) {
    // Re-check current status — never overwrite BANNED, PENDING_DELETION, or ANONYMIZED
    const currentUser = await findUserById(suspension.userId);
    if (!currentUser) continue;

    const safeStatuses = ["SUSPENDED"];
    if (!safeStatuses.includes(currentUser.accountStatus)) continue;

    // Restore to APPROVED
    await db
      .update(authUsers)
      .set({ accountStatus: "APPROVED", updatedAt: new Date() })
      .where(eq(authUsers.id, suspension.userId));

    await expireDisciplineAction(suspension.id);

    await logAdminAction({
      actorId: "system",
      action: "LIFT_SUSPENSION",
      targetUserId: suspension.userId,
      details: { disciplineId: suspension.id },
    });

    eventBus.emit("account.status_changed", {
      userId: suspension.userId,
      newStatus: "APPROVED",
      oldStatus: "SUSPENDED",
      timestamp: new Date().toISOString(),
    });

    liftedCount++;
  }

  return liftedCount;
}
