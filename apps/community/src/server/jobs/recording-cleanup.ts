import "server-only";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { registerJob } from "@/server/jobs/job-runner";
import { eventBus } from "@/services/event-bus";
import { getS3Client } from "@/lib/s3-client";
import { env } from "@/env";
import {
  listExpiredRecordings,
  listExpiringRecordings,
  markRecordingWarningSent,
} from "@/db/queries/events";
import { logAdminAction } from "@/services/audit-logger";
import { db } from "@/db";
import { communityEvents } from "@/db/schema/community-events";
import { eq } from "drizzle-orm";

const SYSTEM_ACTOR = "system";
const WARNING_WINDOW_DAYS = 14;

registerJob("recording-cleanup", async () => {
  const s3 = getS3Client();

  // ── 1. Clean up expired recordings ──────────────────────────────────────────

  const expired = await listExpiredRecordings();

  for (const event of expired) {
    if (!event.recordingMirrorUrl) continue;

    // Extract object key from mirror URL
    const objectKey = event.recordingMirrorUrl.replace(
      new RegExp(
        `^https?://${env.HETZNER_S3_PUBLIC_URL.replace(/^https?:\/\//, "").replace(/\./g, "\\.")}/${env.HETZNER_S3_BUCKET}/`,
      ),
      "",
    );

    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: env.HETZNER_S3_BUCKET,
          Key: objectKey,
        }),
      );
    } catch (err) {
      // S3 delete failed — skip DB cleanup to avoid orphaning the object with no reference
      console.warn(`[recording-cleanup] Failed to delete S3 object for event ${event.id}:`, err);
      continue;
    }

    // Null out URLs in DB only after successful S3 deletion
    await db
      .update(communityEvents)
      .set({ recordingUrl: null, recordingMirrorUrl: null, updatedAt: new Date() })
      .where(eq(communityEvents.id, event.id));

    await eventBus.emit("recording.expired", {
      recordingId: event.id,
      eventId: event.id,
      timestamp: new Date().toISOString(),
    });

    await logAdminAction({
      actorId: SYSTEM_ACTOR,
      action: "RECORDING_EXPIRED_CLEANUP",
      targetUserId: event.creatorId,
      details: { eventId: event.id, mirrorUrl: event.recordingMirrorUrl },
    });
  }

  // ── 2. Send 14-day expiry warnings ──────────────────────────────────────────

  const expiring = await listExpiringRecordings(WARNING_WINDOW_DAYS);

  for (const event of expiring) {
    await eventBus.emit("recording.expiring_warning", {
      eventId: event.id,
      expiresAt: event.recordingExpiresAt!.toISOString(),
      title: event.title,
      timestamp: new Date().toISOString(),
    });

    await markRecordingWarningSent(event.id, new Date());
  }
});
