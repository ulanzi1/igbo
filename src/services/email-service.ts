import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { env } from "@/env";
import { renderTemplate } from "@/templates/email";
import { registerJob, runJob } from "@/server/jobs/job-runner";

export interface EmailPayload {
  to: string;
  /** Subject is resolved from the template — only pass to override. */
  subject?: string;
  templateId: string;
  data: Record<string, unknown>;
  locale?: "en" | "ig";
  /** Override the default noreply from address (e.g. use support@ for reply-able emails). */
  from?: string;
}

function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

// Lazy initialization — do NOT instantiate at module top level.
// Avoids "env not ready" errors during module import in tests.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set but ENABLE_EMAIL_SENDING=true");
  }
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

export const emailService = {
  send: async (payload: EmailPayload): Promise<void> => {
    if (env.ENABLE_EMAIL_SENDING === "false") {
      console.info(
        JSON.stringify({
          level: "info",
          message: "email.send.skipped",
          templateId: payload.templateId,
          reason: "ENABLE_EMAIL_SENDING=false",
        }),
      );
      return;
    }

    const toHash = hashEmail(payload.to);

    try {
      const rendered = renderTemplate(payload.templateId, payload.data, payload.locale ?? "en");

      const { data: resendData, error } = await getResend().emails.send({
        from: payload.from ?? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
        to: payload.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (error) {
        throw new Error(`Resend API error [${payload.templateId}]: ${error.message}`);
      }

      console.info(
        JSON.stringify({
          level: "info",
          message: "email.send.success",
          templateId: payload.templateId,
          toHash,
          locale: payload.locale ?? "en",
          resendId: resendData?.id,
        }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "email.send.error",
          templateId: payload.templateId,
          toHash,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }
  },
};

/**
 * Enqueue an email send as a non-blocking background job.
 * Fire-and-forget per architecture rules — never blocks the request.
 * TODO: Epic 9 — clean up one-shot jobs after completion
 */
export function enqueueEmailJob(name: string, payload: EmailPayload): void {
  registerJob(name, async () => {
    await emailService.send(payload);
  });
  void runJob(name).catch((err: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "email.job.failed",
        jobName: name,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}
