import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";
import { communityProfiles } from "@/db/schema/community-profiles";
import { auditLogs } from "@/db/schema/audit-logs";
import { createExportRequest } from "@/db/queries/gdpr";
import { findUserById } from "@/db/queries/auth-queries";
import { verifyPassword } from "@/services/auth-service";
import { getRedisClient } from "@/lib/redis";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";
import { runJob } from "@/server/jobs/job-runner";
import { ApiError } from "@/lib/api-error";

export { findAccountsPendingAnonymization } from "@/db/queries/gdpr";

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CANCELLATION_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function generateExportToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

export async function requestAccountDeletion(userId: string, password: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "User not found" });
  }

  if (!user.passwordHash) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Account has no password set",
    });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Incorrect password" });
  }

  const scheduledDeletionAt = new Date(Date.now() + DELETION_GRACE_PERIOD_MS);

  await db
    .update(authUsers)
    .set({ accountStatus: "PENDING_DELETION", scheduledDeletionAt, updatedAt: new Date() })
    .where(eq(authUsers.id, userId));

  // Generate a cancellation token and store in Redis
  const cancellationToken = randomUUID();
  const redis = getRedisClient();
  await redis.set(`gdpr:cancel:${userId}`, cancellationToken, "EX", CANCELLATION_TOKEN_TTL_SECONDS);

  // Send cancellation email (fire-and-forget)
  enqueueEmailJob(`gdpr-cancel-${userId}`, {
    to: user.email,
    subject: "Account deletion requested — cancel within 30 days",
    templateId: "gdpr-account-deletion",
    data: {
      name: user.name ?? user.email,
      scheduledDeletionAt: scheduledDeletionAt.toISOString(),
      cancellationToken,
    },
  });

  eventBus.emit("member.deletion_requested", {
    userId,
    timestamp: new Date().toISOString(),
  });
}

export async function cancelAccountDeletion(token: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const storedToken = await redis.get(`gdpr:cancel:${userId}`);

  if (!storedToken || storedToken !== token) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Invalid or expired cancellation token",
    });
  }

  await db
    .update(authUsers)
    .set({ accountStatus: "APPROVED", scheduledDeletionAt: null, updatedAt: new Date() })
    .where(eq(authUsers.id, userId));

  await redis.del(`gdpr:cancel:${userId}`);
}

export async function anonymizeAccount(userId: string): Promise<void> {
  // Emit BEFORE scrubbing PII (synchronous in-process listeners execute here)
  eventBus.emit("member.anonymizing", {
    userId,
    timestamp: new Date().toISOString(),
  });

  const now = new Date();

  // Anonymize auth_users PII
  await db
    .update(authUsers)
    .set({
      name: "Former Member",
      email: `deleted-${userId}@anonymized.invalid`,
      phone: null,
      image: null,
      passwordHash: null,
      accountStatus: "ANONYMIZED",
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(authUsers.id, userId));

  // Anonymize community_profiles PII
  await db
    .update(communityProfiles)
    .set({
      displayName: "Former Member",
      bio: null,
      photoUrl: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      locationLat: null,
      locationLng: null,
      interests: [],
      culturalConnections: [],
      languages: [],
      updatedAt: now,
    })
    .where(eq(communityProfiles.userId, userId));

  // Log to audit trail — use userId as actorId (self-service deletion; actorId is UUID NOT NULL FK)
  await db.insert(auditLogs).values({
    actorId: userId,
    action: "member.anonymized",
    targetUserId: userId,
    details: { reason: "GDPR account deletion — 30-day grace period elapsed" },
    ipAddress: null,
  });

  eventBus.emit("member.anonymized", {
    userId,
    timestamp: new Date().toISOString(),
  });
}

export async function requestDataExport(userId: string): Promise<{ requestId: string }> {
  const request = await createExportRequest(userId);

  // Store requestId in Redis so the job handler can find it
  const redis = getRedisClient();
  await redis.set(`gdpr:export:${userId}`, request.id, "EX", 3600);

  // Enqueue the data export job (fire-and-forget)
  void runJob("data-export").catch((err: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "gdpr.export.job.failed",
        userId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });

  return { requestId: request.id };
}
