// POST /api/v1/webhooks/daily/recording-ready — Daily.co cloud recording webhook
// Security: authenticated via HMAC SHA-256 signature (X-Webhook-Signature header)
// This is a machine-to-machine endpoint — no user session or user-scoped rate limit.
import { createHmac, timingSafeEqual } from "node:crypto";
import { withApiHandler } from "@/server/api/middleware";
import { successResponse, errorResponse } from "@/lib/api-response";
import { env } from "@/env";
import { z } from "zod/v4";
import { getEventByRoomName, setRecordingSourceUrl } from "@/db/queries/events";
import { runJob } from "@/server/jobs/job-runner";

const WebhookPayloadSchema = z.object({
  type: z.string(),
  room_name: z.string(),
  download_link: z.url().optional(),
});

function verifyDailySignature(body: string, signature: string, secret: string): boolean {
  if (!secret) {
    // Fail closed: missing secret means we cannot verify — reject all requests.
    // An empty DAILY_WEBHOOK_SECRET is a misconfiguration, not a valid "skip verification" state.
    console.error(
      "[webhook] DAILY_WEBHOOK_SECRET is not set — rejecting all webhook requests. Set it in production.",
    );
    return false;
  }
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

const postHandler = async (request: Request) => {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature") ?? "";

  if (!verifyDailySignature(rawBody, signature, env.DAILY_WEBHOOK_SECRET)) {
    return errorResponse({ title: "Invalid webhook signature", status: 401 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse({ title: "Invalid JSON body", status: 400 });
  }

  const parsed = WebhookPayloadSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return errorResponse({
      title: parsed.error.issues[0]?.message ?? "Invalid payload",
      status: 400,
    });
  }

  const { type, room_name, download_link } = parsed.data;

  // Only process recording.ready-to-download events
  if (type !== "recording.ready-to-download") {
    return successResponse({ received: true });
  }

  if (!download_link) {
    return errorResponse({ title: "Missing download_link in payload", status: 400 });
  }

  // Reverse-map room_name to event
  const event = await getEventByRoomName(room_name);
  if (!event) {
    return errorResponse({ title: "Event not found for room", status: 404 });
  }

  // Idempotency: if recording_url already set, skip re-enqueue
  if (event.recordingUrl) {
    return successResponse({ received: true, skipped: true });
  }

  await setRecordingSourceUrl(event.id, download_link);

  // Enqueue mirror job (non-blocking — fire and forget)
  runJob("recording-mirror").catch(() => {
    // Job runner errors are logged internally
  });

  return successResponse({ received: true });
};

// skipCsrf: true — machine-to-machine endpoint; HMAC signature provides authentication
export const POST = withApiHandler(postHandler, { skipCsrf: true });
