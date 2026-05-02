import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { renderTemplate } from "@/templates/email";
import { getRedisClient } from "@/lib/redis";
import { createRedisKey } from "@igbo/config/redis";

export interface EmailPayload {
  to: string;
  /** Subject is resolved from the template — only pass to override. */
  subject?: string;
  templateId: string;
  data: Record<string, unknown>;
  locale?: "en" | "ig";
  /** Override the default noreply from address. */
  from?: string;
}

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

// Lazy initialization — do NOT instantiate at module top level.
let _resend: Resend | null = null;
function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY!; // ci-allow-process-env (validated before entry)
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRY_DELAYS_MS = [1000, 5000, 30000] as const; // 1s, 5s, 30s

/**
 * Renders and sends a single email attempt via Resend. Throws on error.
 */
async function sendOnce(payload: EmailPayload): Promise<void> {
  const rendered = renderTemplate(payload.templateId, payload.data, payload.locale ?? "en");
  const fromName = process.env.EMAIL_FROM_NAME ?? "OBIGBO Job Portal"; // ci-allow-process-env
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "noreply@igbo.global"; // ci-allow-process-env

  const { data: resendData, error } = await getResend().emails.send({
    from: payload.from ?? `${fromName} <${fromAddress}>`,
    to: payload.to,
    subject: payload.subject ?? rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (error) {
    throw new Error(`Resend API error [${payload.templateId}]: ${error.message}`);
  }

  const toHash = hashEmail(payload.to);
  console.info(
    JSON.stringify({
      level: "info",
      message: "portal.email.send.success",
      templateId: payload.templateId,
      toHash,
      locale: payload.locale ?? "en",
      resendId: resendData?.id,
    }),
  );
}

/**
 * Sends an email with exponential-backoff retry (up to 3 attempts: 1s, 5s, 30s delays).
 *
 * Note: Retry durability is within-process only. If the Node.js process restarts during
 * a delay window, the retry is silently lost. This is an accepted limitation until the
 * outbox pattern lands in Story 6.5.
 */
async function sendWithRetry(payload: EmailPayload): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await sendOnce(payload);
      return; // Success
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < RETRY_DELAYS_MS.length) {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.email.send.retry",
            templateId: payload.templateId,
            attempt: attempt + 1,
            nextDelayMs: RETRY_DELAYS_MS[attempt],
            error: lastError.message,
          }),
        );
        await delay(RETRY_DELAYS_MS[attempt]!);
      }
    }
  }

  // All retries exhausted
  console.error(
    JSON.stringify({
      level: "error",
      message: "portal.email.send.retries_exhausted",
      templateId: payload.templateId,
      totalAttempts: RETRY_DELAYS_MS.length + 1,
    }),
  );
  throw lastError ?? new Error("sendWithRetry: all attempts failed");
}

export const emailService = {
  send: async (payload: EmailPayload): Promise<void> => {
    const emailDisabled = process.env.ENABLE_EMAIL_SENDING === "false"; // ci-allow-process-env
    if (emailDisabled) {
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.email.send.skipped",
          templateId: payload.templateId,
          reason: "ENABLE_EMAIL_SENDING=false",
        }),
      );
      return;
    }

    // Validate configuration before entering retry loop — config errors are not retryable.
    const apiKey = process.env.RESEND_API_KEY; // ci-allow-process-env
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set but ENABLE_EMAIL_SENDING=true");
    }

    const toHash = hashEmail(payload.to);

    try {
      await sendWithRetry(payload);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.email.send.error",
          templateId: payload.templateId,
          toHash,
          error: String(err),
        }),
      );
      throw err;
    }
  },
};

/**
 * Enqueue an email send as a non-blocking fire-and-forget operation.
 * Failures are logged and swallowed — never block the caller.
 *
 * Includes Redis NX dedup to prevent duplicate sends on event replay.
 * Returns true when the email was sent, false when deduped.
 * Fail-open: if Redis is unavailable, proceeds with the send.
 */
export async function enqueueEmailJob(name: string, payload: EmailPayload): Promise<boolean> {
  // Redis NX dedup — prevent duplicate sends on event replay
  try {
    const redis = getRedisClient();
    const dedupKey = createRedisKey("portal", "dedup", `email:${name}`);
    const acquired = await redis.set(dedupKey, "1", "EX", 15 * 60, "NX");
    if (acquired === null) {
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.email.dedup_skipped",
          jobName: name,
        }),
      );
      return false;
    }
  } catch (redisErr: unknown) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.email.dedup_check.error",
        jobName: name,
        error: String(redisErr),
      }),
    );
    // Fail-open — proceed with send
  }

  void emailService.send(payload).catch((err: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "portal.email.job.failed",
        jobName: name,
        error: String(err),
      }),
    );
  });
  return true;
}
