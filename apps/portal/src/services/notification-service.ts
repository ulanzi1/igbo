import "server-only";
import { portalEventBus } from "@/services/event-bus";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { getSavedSearchById } from "@igbo/db/queries/portal-saved-searches";
import { createNotification } from "@igbo/db/queries/notifications";
import { enqueueEmailJob } from "@/services/email-service";
import { getRedisClient } from "@/lib/redis";
import { evaluateInstantAlert, checkInstantAlerts } from "@/services/saved-search-service";
import type {
  ApplicationSubmittedEvent,
  ApplicationWithdrawnEvent,
  SavedSearchNewResultEvent,
  JobReviewedEvent,
} from "@igbo/config/events";

const NOTIF_DEDUP_TTL_SECONDS = 15 * 60; // 15 minutes

/**
 * Portal notification service — registers EventBus handlers to send
 * post-submission notifications (seeker email + employer in-app notification).
 *
 * All operations are fire-and-forget with structured logging.
 * Notification failures MUST NOT block or fail the application submission.
 *
 * HMR guard: same pattern as community notification-service.
 */

// Guard against duplicate handler registration during Next.js dev-mode hot reloads.
const globalForNotif = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
if (globalForNotif.__portalNotifHandlersRegistered) {
  // Handlers already registered on the HMR-safe portalEventBus — skip re-registration
} else {
  globalForNotif.__portalNotifHandlersRegistered = true;

  portalEventBus.on("application.submitted", async (payload: ApplicationSubmittedEvent) => {
    const { applicationId, jobId, seekerUserId, companyId, employerUserId } = payload;

    // Idempotency: deduplicate using Redis SET NX
    // If Redis is unavailable, log and continue (fail-open for notifications — non-critical path)
    try {
      const redis = getRedisClient();
      const dedupKey = `dedup:portal:notif:app-submitted:${applicationId}`;
      const acquired = await redis.set(dedupKey, "1", "EX", NOTIF_DEDUP_TTL_SECONDS, "NX");
      if (acquired === null) {
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.app_submitted.dedup_skipped",
            applicationId,
          }),
        );
        return;
      }
    } catch (redisErr: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.notification.dedup_check.error",
          applicationId,
          error: String(redisErr),
        }),
      );
      // Proceed without dedup — better to send duplicate notification than drop it
    }

    // Resolve seeker, job, and company data in parallel to minimize latency.
    // Use Promise.allSettled to preserve partial data — if one query fails,
    // the others' results are still available.
    const [seekerResult, postingResult, companyResult] = await Promise.allSettled([
      findUserById(seekerUserId),
      getJobPostingById(jobId),
      getCompanyById(companyId),
    ]);

    const seeker = seekerResult.status === "fulfilled" ? seekerResult.value : null;
    const posting = postingResult.status === "fulfilled" ? postingResult.value : null;
    const company = companyResult.status === "fulfilled" ? companyResult.value : null;

    // Log any individual failures
    for (const [label, result] of [
      ["seeker", seekerResult],
      ["posting", postingResult],
      ["company", companyResult],
    ] as const) {
      if (result.status === "rejected") {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.data_fetch.error",
            applicationId,
            field: label,
            error: String(result.reason),
          }),
        );
      }
    }

    const jobTitle = posting?.title ?? "Unknown Position";
    const companyName = company?.name ?? "Unknown Company";
    const portalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_URL; // ci-allow-process-env
    if (!portalBaseUrl) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "portal.notification.missing_portal_url",
          applicationId,
          hint: "Set NEXT_PUBLIC_PORTAL_URL for absolute email links",
        }),
      );
    }
    const trackingUrl = `${portalBaseUrl ?? "https://portal.igbo.global"}/applications`;

    // ── Seeker confirmation email (fire-and-forget) ──────────────────────────
    if (seeker?.email) {
      try {
        enqueueEmailJob(`app-confirmed-${applicationId}`, {
          to: seeker.email,
          templateId: "application-confirmation",
          data: {
            seekerName: seeker.name ?? seeker.email,
            jobTitle,
            companyName,
            submittedAt: payload.timestamp,
            trackingUrl,
          },
          locale: seeker.languagePreference === "ig" ? "ig" : "en",
        });
      } catch (emailErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.email_enqueue.error",
            applicationId,
            error: String(emailErr),
          }),
        );
      }
    } else {
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.notification.seeker_email.skipped",
          applicationId,
          reason: "no_email",
        }),
      );
    }

    // ── Employer in-app notification ────────────────────────────────────────
    // TODO(P-6.1A): Resolve employer languagePreference and use bilingual
    // notification copy (currently hardcoded English per AC 4 spec).
    if (employerUserId) {
      const seekerName = seeker?.name ?? "a seeker";
      try {
        await createNotification({
          userId: employerUserId,
          type: "system",
          title: `New application for ${jobTitle}`,
          body: `from ${seekerName}`,
          link: `/admin/applications/${applicationId}`,
        });
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.employer_notification.created",
            applicationId,
            employerUserId,
          }),
        );
      } catch (notifErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.employer_notification.error",
            applicationId,
            employerUserId,
            error: String(notifErr),
          }),
        );
        // Error logged — does not propagate (submission already succeeded)
      }
    }
  });

  // ── application.withdrawn handler ────────────────────────────────────────
  portalEventBus.on("application.withdrawn", async (payload: ApplicationWithdrawnEvent) => {
    const { applicationId, jobId, seekerUserId, companyId } = payload;

    // Idempotency: deduplicate using Redis SET NX
    try {
      const redis = getRedisClient();
      const dedupKey = `dedup:portal:notif:app-withdrawn:${applicationId}`;
      const acquired = await redis.set(dedupKey, "1", "EX", NOTIF_DEDUP_TTL_SECONDS, "NX");
      if (acquired === null) {
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.app_withdrawn.dedup_skipped",
            applicationId,
          }),
        );
        return;
      }
    } catch (redisErr: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.notification.dedup_check.error",
          applicationId,
          error: String(redisErr),
        }),
      );
      // Proceed without dedup — fail-open for notifications
    }

    // Resolve seeker, job posting, and company in parallel
    // Employer user ID is derived from company profile ownerUserId (same as application.submitted pattern)
    const [seekerResult, postingResult, companyResult] = await Promise.allSettled([
      findUserById(seekerUserId),
      getJobPostingById(jobId),
      getCompanyById(companyId),
    ]);

    const seeker = seekerResult.status === "fulfilled" ? seekerResult.value : null;
    const posting = postingResult.status === "fulfilled" ? postingResult.value : null;
    const company = companyResult.status === "fulfilled" ? companyResult.value : null;

    for (const [label, result] of [
      ["seeker", seekerResult],
      ["posting", postingResult],
      ["company", companyResult],
    ] as const) {
      if (result.status === "rejected") {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.app_withdrawn.data_fetch.error",
            applicationId,
            field: label,
            error: String(result.reason),
          }),
        );
      }
    }

    // Employer is the company profile owner
    const employerUserId = company?.ownerUserId ?? null;
    if (!employerUserId) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "portal.notification.app_withdrawn.no_employer",
          applicationId,
          jobId,
        }),
      );
      return;
    }

    const seekerName = seeker?.name ?? "A candidate";
    const jobTitle = posting?.title ?? "Unknown Position";

    // TODO(P-6.1A): Hardcoded English per existing application.submitted pattern
    try {
      await createNotification({
        userId: employerUserId,
        type: "system",
        title: "A candidate withdrew their application",
        body: `${seekerName} withdrew from ${jobTitle}`,
        link: `/admin/applications/${applicationId}`,
      });
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.notification.app_withdrawn.employer_notification.created",
          applicationId,
          employerUserId,
        }),
      );
    } catch (notifErr: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.notification.app_withdrawn.employer_notification.error",
          applicationId,
          employerUserId,
          error: String(notifErr),
        }),
      );
      // Error logged — does not propagate (fire-and-forget)
    }
  });

  // ── saved_search.new_result handler ──────────────────────────────────────
  portalEventBus.on("saved_search.new_result", async (payload: SavedSearchNewResultEvent) => {
    const { savedSearchId, userId, jobId, jobTitle, searchName } = payload;

    const savedSearch = await getSavedSearchById(savedSearchId);
    if (!savedSearch) {
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.notification.saved-search.not-found",
          savedSearchId,
        }),
      );
      return;
    }

    const shouldAlert = await evaluateInstantAlert(savedSearch, { id: jobId, title: jobTitle });
    if (!shouldAlert) return;

    const portalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_URL; // ci-allow-process-env
    // TODO(P-6.1A): Use user's languagePreference for bilingual notification text.
    // Currently hardcoded English — same pattern as application.submitted handler.
    try {
      await createNotification({
        userId,
        type: "system",
        title: `New match: ${jobTitle}`,
        body: `Your saved search "${searchName}" has a new result`,
        link: `${portalBaseUrl ?? ""}/jobs/${jobId}`,
      });
      console.info(
        JSON.stringify({
          level: "info",
          message: "portal.notification.saved-search.notification.created",
          savedSearchId,
          userId,
          jobId,
        }),
      );
    } catch (err: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.notification.saved-search.notification.error",
          savedSearchId,
          userId,
          jobId,
          error: String(err),
        }),
      );
    }
  });

  // ── job.reviewed handler — triggers instant alerts for approved postings ──
  portalEventBus.on("job.reviewed", async (payload: JobReviewedEvent) => {
    if (payload.decision !== "approved") return;
    try {
      await checkInstantAlerts(payload.jobId);
    } catch (err: unknown) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "portal.notification.job-reviewed.check-alerts.error",
          jobId: payload.jobId,
          error: String(err),
        }),
      );
    }
  });
}

/**
 * Explicit initialization marker — called from instrumentation.ts.
 * Handler registration happens at module load time via HMR guard above.
 */
export function initPortalNotificationService(): void {
  // Handlers registered at module load — this function exists for explicit startup tracking
}
