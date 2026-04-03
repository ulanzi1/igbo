import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@igbo/db";
import { authUsers } from "@igbo/db/schema/auth-users";
import { findUserById } from "@igbo/db/queries/auth-queries";
import {
  findActiveSessionsByUserId,
  deleteAllSessionsForUser,
} from "@igbo/db/queries/auth-sessions";
import { evictAllUserSessions } from "@igbo/auth/session-cache";
import {
  createDisciplineAction,
  getDisciplineActionById,
  listSuspensionsExpiringBefore,
  expireDisciplineAction,
} from "@igbo/db/queries/member-discipline";
import { memberDisciplineActions } from "@igbo/db/schema/member-discipline";
import { logAdminAction } from "@/services/audit-logger";
import { eventBus } from "@/services/event-bus";
import { ApiError } from "@/lib/api-error";
import { invalidateCachedAccountStatus } from "@/lib/account-status-cache";

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
  if (!currentUser) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Target user not found" });
  }
  if (currentUser.accountStatus === "SUSPENDED") {
    throw new ApiError({ title: "Conflict", status: 409, detail: "User is already suspended" });
  }
  const oldStatus = currentUser.accountStatus;

  // Atomic: update account status + insert discipline record in a single transaction.
  // Prevents orphaned SUSPENDED status without a matching discipline record (which the
  // lift-expired-suspensions job relies on to auto-restore the account).
  const result = await db.transaction(async (tx) => {
    await tx
      .update(authUsers)
      .set({ accountStatus: "SUSPENDED", updatedAt: new Date() })
      .where(eq(authUsers.id, targetUserId));

    const rows = await tx
      .insert(memberDisciplineActions)
      .values({
        userId: targetUserId,
        moderationActionId: moderationActionId ?? null,
        sourceType: moderationActionId ? "moderation_action" : "manual",
        actionType: "suspension",
        reason,
        notes: notes ?? null,
        suspensionEndsAt,
        issuedBy: adminId,
        status: "active",
      })
      .returning({ id: memberDisciplineActions.id });

    const id = rows[0]?.id;
    if (!id) throw new Error("Insert returned no id");
    return { id };
  });

  // Invalidate all sessions immediately (outside transaction — Redis is non-transactional)
  await evictUserSessions(targetUserId);
  // Clear middleware account-status cache so stale JWT guard picks up the change immediately
  await invalidateCachedAccountStatus(targetUserId);

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
    previousStatus: oldStatus,
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
  if (!currentUser) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Target user not found" });
  }
  if (currentUser.accountStatus === "BANNED") {
    throw new ApiError({ title: "Conflict", status: 409, detail: "User is already banned" });
  }
  const oldStatus = currentUser.accountStatus;

  // Atomic: update account status + insert discipline record in a single transaction.
  const result = await db.transaction(async (tx) => {
    await tx
      .update(authUsers)
      .set({ accountStatus: "BANNED", updatedAt: new Date() })
      .where(eq(authUsers.id, targetUserId));

    const rows = await tx
      .insert(memberDisciplineActions)
      .values({
        userId: targetUserId,
        moderationActionId: moderationActionId ?? null,
        sourceType: moderationActionId ? "moderation_action" : "manual",
        actionType: "ban",
        reason,
        notes: notes ?? null,
        issuedBy: adminId,
        status: "active",
      })
      .returning({ id: memberDisciplineActions.id });

    const id = rows[0]?.id;
    if (!id) throw new Error("Insert returned no id");
    return { id };
  });

  // Invalidate all sessions immediately (outside transaction — Redis is non-transactional)
  await evictUserSessions(targetUserId);
  await invalidateCachedAccountStatus(targetUserId);

  await logAdminAction({
    actorId: adminId,
    action: "BAN_MEMBER",
    targetUserId,
    details: { disciplineId: result.id, moderationActionId: moderationActionId ?? null },
  });

  eventBus.emit("account.status_changed", {
    userId: targetUserId,
    newStatus: "BANNED",
    previousStatus: oldStatus,
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
    await invalidateCachedAccountStatus(suspension.userId);

    await logAdminAction({
      actorId: "system",
      action: "LIFT_SUSPENSION",
      targetUserId: suspension.userId,
      details: { disciplineId: suspension.id },
    });

    eventBus.emit("account.status_changed", {
      userId: suspension.userId,
      newStatus: "APPROVED",
      previousStatus: "SUSPENDED",
      timestamp: new Date().toISOString(),
    });

    liftedCount++;
  }

  return liftedCount;
}

// ─── Manual early lift ──────────────────────────────────────────────────────

export async function liftSuspensionEarly(params: {
  suspensionId: string;
  adminId: string;
  reason: string;
}): Promise<void> {
  const { suspensionId, adminId, reason } = params;

  // All checks + mutations inside a single transaction to prevent TOCTOU races
  const userId = await db.transaction(async (tx) => {
    // 1. Verify discipline action exists and is an active suspension
    const suspension = await getDisciplineActionById(suspensionId);
    if (!suspension) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "Suspension not found" });
    }
    if (suspension.actionType !== "suspension" || suspension.status !== "active") {
      throw new ApiError({
        title: "Conflict",
        status: 409,
        detail: "Suspension already lifted or expired",
      });
    }

    // 2. Verify user is actually SUSPENDED — never overwrite BANNED/PENDING_DELETION/ANONYMIZED
    const currentUser = await findUserById(suspension.userId);
    if (!currentUser) {
      throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
    }
    if (currentUser.accountStatus !== "SUSPENDED") {
      throw new ApiError({
        title: "Conflict",
        status: 409,
        detail: `Cannot lift: account status is ${currentUser.accountStatus}`,
      });
    }

    // 3. Atomic: restore user + mark discipline as lifted
    await tx
      .update(authUsers)
      .set({ accountStatus: "APPROVED", updatedAt: new Date() })
      .where(eq(authUsers.id, suspension.userId));
    await tx
      .update(memberDisciplineActions)
      .set({ status: "lifted", liftedAt: new Date(), liftedBy: adminId })
      .where(eq(memberDisciplineActions.id, suspensionId));

    return suspension.userId;
  });

  // 4. Side effects outside transaction
  await invalidateCachedAccountStatus(userId);

  await logAdminAction({
    actorId: adminId,
    action: "LIFT_SUSPENSION",
    targetUserId: userId,
    details: { disciplineId: suspensionId, reason },
  });

  eventBus.emit("account.status_changed", {
    userId,
    newStatus: "APPROVED",
    previousStatus: "SUSPENDED",
    timestamp: new Date().toISOString(),
  });

  eventBus.emit("account.discipline_lifted", {
    userId,
    disciplineId: suspensionId,
    reason,
    liftedBy: adminId,
    timestamp: new Date().toISOString(),
  });
}
