import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { renderTemplate } from "@/templates/email";

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
  const apiKey = process.env.RESEND_API_KEY; // ci-allow-process-env
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set but ENABLE_EMAIL_SENDING=true");
  }
  if (!_resend) _resend = new Resend(apiKey);
  return _resend;
}

export const emailService = {
  send: async (payload: EmailPayload): Promise<void> => {
    if (process.env.ENABLE_EMAIL_SENDING === "false") {
      // ci-allow-process-env
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

    const toHash = hashEmail(payload.to);

    try {
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
 */
export function enqueueEmailJob(name: string, payload: EmailPayload): void {
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
}
