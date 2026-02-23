import "server-only";
import { registerJob, runJob } from "@/server/jobs/job-runner";

export interface EmailPayload {
  to: string;
  subject: string;
  templateId: string;
  data: Record<string, unknown>;
}

// TODO: Story 1.17 replaces this stub body with a real email provider (Resend / Postmark / SendGrid).
export const emailService = {
  send: async (payload: EmailPayload): Promise<void> => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email-stub]", JSON.stringify(payload));
    }
  },
};

/**
 * Enqueue an email send as a non-blocking background job.
 * Fire-and-forget per architecture rules — never blocks the request.
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
