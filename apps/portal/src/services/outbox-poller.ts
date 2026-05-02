import "server-only";
import { withHandlerGuard } from "@igbo/config/handler-guard";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import {
  claimPendingOutboxEvents,
  markOutboxEventProcessed,
  incrementOutboxRetryCount,
  cleanupProcessedOutboxEvents,
} from "@igbo/db/queries/portal-outbox";
import { dispatchNotification } from "@/services/notification-router";
import type { PortalOutboxEvent } from "@igbo/db/schema/portal-outbox";

const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global"; // ci-allow-process-env

// Server-side i18n strings for notification content (bilingual)
const VIEWED_STRINGS = {
  en: {
    title: (companyName: string) => `${companyName} viewed your application`,
    body: (jobTitle: string) => `Your application for ${jobTitle} was viewed by an employer`,
  },
  ig: {
    title: (companyName: string) => `${companyName} hụrụ arịọ gị`,
    body: (jobTitle: string) => `Onye ọrụ hụrụ arịọ gị maka ${jobTitle}`,
  },
} as const;

/** HMR guard — prevents duplicate poller starts on Next.js dev hot-reloads */
const globalForPoller = globalThis as unknown as {
  __outboxPollerStarted?: boolean;
  __outboxPollerCleanup?: () => void;
};

/**
 * Processes one batch of pending outbox events.
 * Uses atomic UPDATE...SET status='processing'...RETURNING to claim rows —
 * concurrent pollers claim different rows without long-held transactions.
 */
export const processOutboxBatch = withHandlerGuard("notif:outbox.process", async () => {
  const events = await claimPendingOutboxEvents(100);

  for (const event of events) {
    try {
      await processOutboxEvent(event);
      await markOutboxEventProcessed(event.id);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.outbox.event_processing_failed",
          eventId: event.id,
          eventType: event.eventType,
          retryCount: event.retryCount,
          error: String(err),
        }),
      );
      await incrementOutboxRetryCount(event.id).catch((retryErr: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.outbox.retry_count_increment_failed",
            eventId: event.id,
            error: String(retryErr),
          }),
        );
      });
    }
  }
});

/**
 * Processes a single outbox event by dispatching the appropriate notification.
 */
async function processOutboxEvent(event: PortalOutboxEvent): Promise<void> {
  if (event.eventType === "portal.application.viewed") {
    await processApplicationViewedEvent(event);
    return;
  }

  console.warn(
    JSON.stringify({
      level: "warn",
      message: "portal.outbox.unknown_event_type",
      eventType: event.eventType,
      eventId: event.id,
    }),
  );
}

async function processApplicationViewedEvent(event: PortalOutboxEvent): Promise<void> {
  const payload = event.payload as {
    applicationId: string;
    jobId: string;
    seekerUserId: string;
    employerUserId: string;
    companyId: string;
    timestamp: string;
  };

  // Look up names for notification content
  const [seekerResult, jobResult] = await Promise.allSettled([
    findUserById(payload.seekerUserId),
    getJobPostingById(payload.jobId),
  ]);

  const seeker = seekerResult.status === "fulfilled" ? seekerResult.value : null;
  const job = jobResult.status === "fulfilled" ? jobResult.value : null;

  // Guard: if seeker no longer exists (deleted/anonymized), consume the event silently
  if (!seeker) {
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "portal.outbox.seeker_not_found",
        eventId: event.id,
        seekerUserId: payload.seekerUserId,
      }),
    );
    return;
  }

  // Use payload.companyId (captured at event-creation time) — avoids an extra job lookup
  // and stays accurate even if the job posting was reassigned or deleted after the view
  const company = await getCompanyById(payload.companyId).catch(() => null);

  const companyName = company?.name ?? "An employer";
  const jobTitle = job?.title ?? "your position";
  const applicationUrl = `${PORTAL_BASE_URL}/applications/${payload.applicationId}`;
  const seekerLocale: "en" | "ig" = seeker?.languagePreference === "ig" ? "ig" : "en";

  const emailJob = seeker?.email
    ? {
        name: `app-viewed-${payload.applicationId}:${payload.employerUserId}`,
        payload: {
          to: seeker.email,
          templateId: "application-viewed",
          data: {
            seekerName: seeker.name ?? seeker.email,
            companyName,
            jobTitle,
            applicationUrl,
            portalBaseUrl: PORTAL_BASE_URL,
          },
          locale: seekerLocale,
        },
      }
    : undefined;

  const strings = VIEWED_STRINGS[seekerLocale];

  await dispatchNotification({
    userId: payload.seekerUserId,
    eventType: "portal.application.viewed",
    content: {
      title: strings.title(companyName),
      body: strings.body(jobTitle),
      link: `/applications/${payload.applicationId}`,
    },
    dedupKey: `viewed:${payload.applicationId}:${payload.employerUserId}`,
    pushPayload: {
      title: strings.title(companyName),
      body: strings.body(jobTitle),
      link: `/applications/${payload.applicationId}`,
      tag: `app-viewed-${payload.applicationId}`,
    },
    emailJob,
  });
}

/**
 * Starts a polling interval for processing outbox events.
 * Includes HMR guard to prevent duplicate interval creation.
 * Returns a cleanup function.
 *
 * NOTE: In development, use the internal API route POST /api/v1/internal/outbox/process
 * instead of relying on this interval, to avoid HMR duplicate dispatches.
 * Set intervalMs to a minimum of 30000 in dev.
 */
export function startOutboxPoller(intervalMs = 1000): () => void {
  if (globalForPoller.__outboxPollerStarted) {
    return globalForPoller.__outboxPollerCleanup ?? (() => {});
  }

  globalForPoller.__outboxPollerStarted = true;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      await (processOutboxBatch as () => Promise<void>)();
    } catch (err: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.outbox.poller_cycle_error",
          error: String(err),
        }),
      );
    }
    if (!stopped) {
      timeoutHandle = setTimeout(poll, intervalMs);
    }
  }

  timeoutHandle = setTimeout(poll, intervalMs);

  const cleanup = () => {
    stopped = true;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    globalForPoller.__outboxPollerStarted = false;
    globalForPoller.__outboxPollerCleanup = undefined;
  };

  globalForPoller.__outboxPollerCleanup = cleanup;
  return cleanup;
}

export { cleanupProcessedOutboxEvents };
