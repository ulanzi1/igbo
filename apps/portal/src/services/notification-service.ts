import "server-only";
import { portalEventBus } from "@/services/event-bus";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { getJobPostingById, getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { getSavedSearchById } from "@igbo/db/queries/portal-saved-searches";
import { enqueueEmailJob } from "@/services/email-service";
import { getRedisClient } from "@/lib/redis";
import { evaluateInstantAlert, checkInstantAlerts } from "@/services/saved-search-service";
import { createRedisKey } from "@igbo/config/redis";
import { withHandlerGuard } from "@igbo/config/handler-guard";
import { getDedupTtlSeconds } from "@igbo/config/notifications";
import { dispatchNotification } from "@/services/notification-router";
import type {
  ApplicationSubmittedEvent,
  ApplicationWithdrawnEvent,
  ApplicationStatusChangedEvent,
  SavedSearchNewResultEvent,
  JobReviewedEvent,
  JobExpiredEvent,
  PortalMessageSentEvent,
} from "@igbo/config/events";

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

  portalEventBus.on(
    "application.submitted",
    withHandlerGuard("notif:application.submitted", async (payload: ApplicationSubmittedEvent) => {
      const { applicationId, jobId, seekerUserId, companyId, employerUserId } = payload;

      // Step 1: Redis NX dedup (MUST BE FIRST)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:app-submitted:${applicationId}`);
        const acquired = await redis.set(
          dedupKey,
          "1",
          "EX",
          getDedupTtlSeconds("portal.application.submitted"),
          "NX",
        );
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

      // Step 2: DB lookups (fail-open via Promise.allSettled)
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
      // Targets a different user (seekerUserId) and is a confirmation, not a notification
      // event — stays inline and does NOT flow through the routing pipeline.
      if (seeker?.email) {
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
        }).catch((err) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.seeker_email.enqueue_failed",
              applicationId,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
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

      // ── Employer in-app notification via routing pipeline ────────────────────
      if (employerUserId) {
        const seekerName = seeker?.name ?? "a seeker";
        await dispatchNotification({
          userId: employerUserId,
          eventType: "portal.application.submitted",
          content: {
            title: `New application for ${jobTitle}`,
            body: `from ${seekerName}`,
            link: `/admin/applications/${applicationId}`,
          },
          dedupKey: `app-submitted:${applicationId}`,
        }).catch((err: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.employer_notification.error",
              applicationId,
              employerUserId,
              error: String(err),
            }),
          );
        });
      }
    }),
  );

  // ── application.withdrawn handler ────────────────────────────────────────
  portalEventBus.on(
    "application.withdrawn",
    withHandlerGuard("notif:application.withdrawn", async (payload: ApplicationWithdrawnEvent) => {
      const { applicationId, jobId, seekerUserId, companyId } = payload;

      // Step 1: Redis NX dedup (MUST BE FIRST)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:app-withdrawn:${applicationId}`);
        const acquired = await redis.set(
          dedupKey,
          "1",
          "EX",
          getDedupTtlSeconds("portal.application.withdrawn"),
          "NX",
        );
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

      // Step 2: DB lookups
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

      await dispatchNotification({
        userId: employerUserId,
        eventType: "portal.application.withdrawn",
        content: {
          title: "A candidate withdrew their application",
          body: `${seekerName} withdrew from ${jobTitle}`,
          link: `/admin/applications/${applicationId}`,
        },
        dedupKey: `app-withdrawn:${applicationId}`,
      }).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.app_withdrawn.employer_notification.error",
            applicationId,
            employerUserId,
            error: String(err),
          }),
        );
      });
    }),
  );

  // ── saved_search.new_result handler ──────────────────────────────────────
  portalEventBus.on(
    "saved_search.new_result",
    withHandlerGuard(
      "notif:saved_search.new_result",
      async (payload: SavedSearchNewResultEvent) => {
        const { savedSearchId, userId, jobId, jobTitle, searchName } = payload;

        // Step 1: Redis NX dedup (MUST BE FIRST — backfill per Pattern Assessment binding constraint)
        try {
          const redis = getRedisClient();
          const dedupKey = createRedisKey(
            "portal",
            "dedup",
            `notif:search-alert:${savedSearchId}:${jobId}`,
          );
          const acquired = await redis.set(
            dedupKey,
            "1",
            "EX",
            getDedupTtlSeconds("portal.saved_search.new_results"),
            "NX",
          );
          if (acquired === null) {
            console.info(
              JSON.stringify({
                level: "info",
                message: "portal.notification.saved-search.dedup_skipped",
                savedSearchId,
                jobId,
              }),
            );
            return;
          }
        } catch (redisErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.saved-search.dedup_check.error",
              savedSearchId,
              error: String(redisErr),
            }),
          );
          // Proceed without dedup — fail-open
        }

        let savedSearch: Awaited<ReturnType<typeof getSavedSearchById>>;
        try {
          savedSearch = await getSavedSearchById(savedSearchId);
        } catch (dbErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.saved-search.lookup_error",
              savedSearchId,
              error: String(dbErr),
            }),
          );
          return;
        }
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

        await dispatchNotification({
          userId,
          eventType: "portal.saved_search.new_results",
          content: {
            title: `New match: ${jobTitle}`,
            body: `Your saved search "${searchName}" has a new result`,
            link: `${portalBaseUrl ?? ""}/jobs/${jobId}`,
          },
          dedupKey: `search-alert:${savedSearchId}:${jobId}`,
        }).catch((err: unknown) => {
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
        });
      },
    ),
  );

  // ── job.reviewed handler — triggers instant alerts + employer notification ──
  portalEventBus.on(
    "job.reviewed",
    withHandlerGuard("notif:job.reviewed", async (payload: JobReviewedEvent) => {
      const { jobId, decision } = payload;

      // Step 1: Redis NX dedup (MUST BE FIRST — backfill per Pattern Assessment binding constraint)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey(
          "portal",
          "dedup",
          `notif:job-reviewed:${jobId}:${decision}`,
        );
        const eventTypeForDedup =
          decision === "rejected"
            ? "portal.job.rejected"
            : decision === "changes_requested"
              ? "portal.job.changes_requested"
              : "portal.job.approved";
        const acquired = await redis.set(
          dedupKey,
          "1",
          "EX",
          getDedupTtlSeconds(eventTypeForDedup),
          "NX",
        );
        if (acquired === null) {
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.job_reviewed.dedup_skipped",
              jobId,
              decision,
            }),
          );
          return;
        }
      } catch (redisErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.job_reviewed.dedup_check.error",
            jobId,
            error: String(redisErr),
          }),
        );
        // Proceed without dedup — fail-open
      }

      // Trigger instant alerts for approved postings (fire-and-forget — independent of employer notification)
      if (decision === "approved") {
        checkInstantAlerts(jobId).catch((err: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.job_reviewed.instant_alerts_error",
              jobId,
              error: String(err),
            }),
          );
        });
      }

      // Employer notification for all 3 decisions
      // DB lookup required — JobReviewedEvent does NOT carry employerUserId or title
      const [postingWithCompanyResult] = await Promise.allSettled([
        getJobPostingWithCompany(jobId),
      ]);

      if (postingWithCompanyResult.status === "rejected" || !postingWithCompanyResult.value) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.job_reviewed.lookup_failed",
            jobId,
            error:
              postingWithCompanyResult.status === "rejected"
                ? String(postingWithCompanyResult.reason)
                : "not_found",
          }),
        );
        return;
      }

      const { posting, company } = postingWithCompanyResult.value;
      const jobTitle = posting.title;
      const employerUserId = company.ownerUserId;
      const companyName = company.name;

      if (!employerUserId) {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.notification.job_reviewed.no_employer",
            jobId,
          }),
        );
        return;
      }

      let eventType: "portal.job.approved" | "portal.job.rejected" | "portal.job.changes_requested";
      let notifTitle: string;
      let notifBody: string;

      switch (decision) {
        case "approved":
          eventType = "portal.job.approved";
          notifTitle = `Your job posting was approved`;
          notifBody = `"${jobTitle}" at ${companyName} is now live`;
          break;
        case "rejected":
          eventType = "portal.job.rejected";
          notifTitle = `Your job posting was rejected`;
          notifBody = `"${jobTitle}" at ${companyName} was not approved`;
          break;
        case "changes_requested":
          eventType = "portal.job.changes_requested";
          notifTitle = `Changes requested for your job posting`;
          notifBody = `Please update "${jobTitle}" at ${companyName} and resubmit`;
          break;
      }

      await dispatchNotification({
        userId: employerUserId,
        eventType,
        content: {
          title: notifTitle,
          body: notifBody,
          link: `/jobs/${jobId}`,
        },
        dedupKey: `job-reviewed:${jobId}:${decision}`,
      }).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.job_reviewed.dispatch_error",
            jobId,
            decision,
            error: String(err),
          }),
        );
      });
    }),
  );

  // ── portal.message.sent handler ──────────────────────────────────────────
  portalEventBus.on(
    "portal.message.sent",
    withHandlerGuard("notif:portal.message.sent", async (payload: PortalMessageSentEvent) => {
      const { messageId, recipientId, senderId, senderName, jobTitle, applicationId, content } =
        payload;

      // 0. Self-exclusion guard — defensive, do not rely solely on upstream contract
      if (recipientId === senderId) return;

      // 1. Dedup by messageId (atomic SET NX EX — MUST BE FIRST)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:msg:${messageId}`);
        const acquired = await redis.set(
          dedupKey,
          "1",
          "EX",
          getDedupTtlSeconds("portal.message.received"),
          "NX",
        );
        if (acquired === null) {
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.msg.dedup_skipped",
              messageId,
            }),
          );
          return;
        }
      } catch (redisErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.msg.dedup_check.error",
            messageId,
            error: String(redisErr),
          }),
        );
        // Proceed without dedup — fail-open
      }

      // 2. Build notification content (no DB lookups — payload is already denormalized)
      const resolvedSenderName = senderName ?? "Someone";
      const resolvedJobTitle = jobTitle ?? "a job posting";
      const safeContent = content ?? "";
      const notifTitle = `${resolvedSenderName} sent you a message about ${resolvedJobTitle}`;
      const notifBody = safeContent.slice(0, 50);
      const notifLink = applicationId ? `/conversations/${applicationId}` : "/conversations";

      // Strip HTML tags for plain-text push body (lock-screen safe)
      const plainPreview = safeContent.replace(/<[^>]*>/g, "").slice(0, 50);

      // Custom throttle key: preserves existing per-(sender, recipient, application) format
      const throttleKey = createRedisKey(
        "portal",
        "throttle",
        `msg:${senderId}:${recipientId}:${applicationId}`,
      );

      // 3. Dispatch via routing pipeline
      // THROTTLE_WINDOWS["portal.message.received"] = 120s (router reads automatically)
      await dispatchNotification({
        userId: recipientId,
        eventType: "portal.message.received",
        content: {
          title: notifTitle,
          body: notifBody,
          link: notifLink,
        },
        dedupKey: `msg:${messageId}`,
        pushPayload: {
          title: resolvedSenderName,
          body: `New message about ${resolvedJobTitle}: ${plainPreview}`,
          link: notifLink,
          tag: `msg:${applicationId}`,
        },
        throttleKey,
      }).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.msg.notification.error",
            messageId,
            recipientId,
            error: String(err),
          }),
        );
      });
    }),
  );

  // ── application.status_changed handler ───────────────────────────────────
  portalEventBus.on(
    "application.status_changed",
    withHandlerGuard(
      "notif:application.status_changed",
      async (payload: ApplicationStatusChangedEvent) => {
        const { applicationId, jobId, seekerUserId, newStatus } = payload;

        // Step 1: Redis NX dedup (MUST BE FIRST)
        try {
          const redis = getRedisClient();
          const dedupKey = createRedisKey(
            "portal",
            "dedup",
            `notif:status-changed:${applicationId}:${newStatus}`,
          );
          const acquired = await redis.set(
            dedupKey,
            "1",
            "EX",
            getDedupTtlSeconds("portal.application.status_changed"),
            "NX",
          );
          if (acquired === null) {
            console.info(
              JSON.stringify({
                level: "info",
                message: "portal.notification.app_status_changed.dedup_skipped",
                applicationId,
                newStatus,
              }),
            );
            return;
          }
        } catch (redisErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.app_status_changed.dedup_check.error",
              applicationId,
              error: String(redisErr),
            }),
          );
          // Proceed without dedup — fail-open
        }

        // Step 2: DB lookup for jobTitle (fail-open — use fallback on error)
        const [postingResult] = await Promise.allSettled([getJobPostingById(jobId)]);
        if (postingResult.status === "rejected") {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.app_status_changed.lookup_failed",
              applicationId,
              jobId,
              error: String(postingResult.reason),
            }),
          );
        }
        const jobTitle =
          postingResult.status === "fulfilled"
            ? (postingResult.value?.title ?? "Unknown Position")
            : "Unknown Position";

        // Step 3: Dispatch via routing pipeline
        await dispatchNotification({
          userId: seekerUserId,
          eventType: "portal.application.status_changed",
          content: {
            title: `Your application status changed`,
            body: `Your application for "${jobTitle}" is now ${newStatus}`,
            link: `/applications/${applicationId}`,
          },
          dedupKey: `status-changed:${applicationId}:${newStatus}`,
        }).catch((err: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.app_status_changed.dispatch_error",
              applicationId,
              error: String(err),
            }),
          );
        });
      },
    ),
  );

  // ── job.expired handler ───────────────────────────────────────────────────
  portalEventBus.on(
    "job.expired",
    withHandlerGuard("notif:job.expired", async (payload: JobExpiredEvent) => {
      const { jobId, employerUserId, title: jobTitle } = payload;

      // Step 1: Redis NX dedup (MUST BE FIRST)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:job-expired:${jobId}`);
        const acquired = await redis.set(
          dedupKey,
          "1",
          "EX",
          getDedupTtlSeconds("portal.job.expired"),
          "NX",
        );
        if (acquired === null) {
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.job_expired.dedup_skipped",
              jobId,
            }),
          );
          return;
        }
      } catch (redisErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.job_expired.dedup_check.error",
            jobId,
            error: String(redisErr),
          }),
        );
        // Proceed without dedup — fail-open
      }

      // Step 2: No DB lookup needed — JobExpiredEvent carries employerUserId and title
      await dispatchNotification({
        userId: employerUserId,
        eventType: "portal.job.expired",
        content: {
          title: `Your job posting has expired`,
          body: `"${jobTitle}" has expired and is no longer accepting applications`,
          link: `/jobs/${jobId}`,
        },
        dedupKey: `job-expired:${jobId}`,
      }).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.job_expired.dispatch_error",
            jobId,
            error: String(err),
          }),
        );
      });
    }),
  );
}

/**
 * Explicit initialization marker — called from instrumentation.ts.
 * Handler registration happens at module load time via HMR guard above.
 */
export function initPortalNotificationService(): void {
  // Handlers registered at module load — this function exists for explicit startup tracking
}
