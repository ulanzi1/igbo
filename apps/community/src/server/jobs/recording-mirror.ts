import "server-only";
import { Readable } from "node:stream";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { registerJob } from "@/server/jobs/job-runner";
import { eventBus } from "@/services/event-bus";
import { getS3Client } from "@/lib/s3-client";
import { env } from "@/env";
import {
  listPendingMirrorRetries,
  setRecordingMirror,
  markRecordingLost,
  updateMirrorRetrySchedule,
} from "@igbo/db/queries/events";
import { logAdminAction } from "@/services/audit-logger";

const MAX_RETRY_COUNT = 20; // ~5 days at 6h intervals
const RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const RECORDING_EXPIRY_DAYS = 90;
const SYSTEM_ACTOR = "system";

async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

registerJob("recording-mirror", async () => {
  const pending = await listPendingMirrorRetries();

  for (const event of pending) {
    if (!event.recordingUrl) continue;

    const retryCount = event.recordingMirrorRetryCount;

    try {
      // Download from Daily source URL
      const response = await fetch(event.recordingUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch recording: HTTP ${response.status}`);
      }

      const buffer = await streamToBuffer(response.body!);
      const sizeBytes = buffer.length;

      // Upload to Hetzner Object Storage
      const objectKey = `recordings/${event.id}/recording.mp4`;
      const s3 = getS3Client();

      await s3.send(
        new PutObjectCommand({
          Bucket: env.HETZNER_S3_BUCKET,
          Key: objectKey,
          Body: buffer,
          ContentType: "video/mp4",
          ContentLength: sizeBytes,
        }),
      );

      const mirrorUrl = `${env.HETZNER_S3_PUBLIC_URL}/${env.HETZNER_S3_BUCKET}/${objectKey}`;
      const expiresAt = new Date(Date.now() + RECORDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await setRecordingMirror(event.id, mirrorUrl, sizeBytes, expiresAt);

      await eventBus.emit("recording.ready", {
        eventId: event.id,
        recordingUrl: mirrorUrl,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const nextCount = retryCount + 1;

      if (nextCount >= MAX_RETRY_COUNT) {
        // Final failure — mark as lost
        await markRecordingLost(event.id);

        await eventBus.emit("recording.mirror_failed", {
          eventId: event.id,
          reason: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });

        await logAdminAction({
          actorId: SYSTEM_ACTOR,
          action: "RECORDING_LOST",
          targetUserId: event.creatorId,
          details: { eventId: event.id, reason: err instanceof Error ? err.message : String(err) },
        });
      } else {
        // Schedule extended retry
        const nextRetryAt = new Date(Date.now() + RETRY_INTERVAL_MS);
        await updateMirrorRetrySchedule(event.id, nextRetryAt, nextCount);
      }
    }
  }
});
