import "server-only";
import { portalEventBus } from "@/services/event-bus";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { getJobPostingById } from "@igbo/db/queries/portal-job-postings";
import { getCompanyById } from "@igbo/db/queries/portal-companies";
import { getSavedSearchById } from "@igbo/db/queries/portal-saved-searches";
import { createNotification } from "@igbo/db/queries/notifications";
import { enqueueEmailJob } from "@/services/email-service";
import { sendPushNotification } from "@/services/push-service";
import { getRedisClient } from "@/lib/redis";
import { evaluateInstantAlert, checkInstantAlerts } from "@/services/saved-search-service";
import { createRedisKey } from "@igbo/config/redis";
import { withHandlerGuard } from "@igbo/config/handler-guard";
import type {
  ApplicationSubmittedEvent,
  ApplicationWithdrawnEvent,
  SavedSearchNewResultEvent,
  JobReviewedEvent,
  PortalMessageSentEvent,
  NotificationCreatedEvent,
} from "@igbo/config/events";

const NOTIF_DEDUP_TTL_SECONDS = 15 * 60; // 15 minutes
const MSG_THROTTLE_TTL_SECONDS = 30; // 30-second fixed window

/**
 * Publishes a notification.created event to Redis pub/sub for real-time delivery.
 * The eventbus-bridge routes "eventbus:notification.created" → /notifications:notification:new.
 *
 * createNotification() is a bare db.insert() — it does NOT auto-publish.
 * Every notification handler must call this after createNotification() resolves.
 */
async function publishNotificationCreated(
  notifId: string,
  userId: string,
  type: string,
  title: string,
  body: string,
  link: string | undefined,
  timestamp: string,
): Promise<void> {
  const payload: NotificationCreatedEvent = {
    eventId: notifId, // re-use notifId as unique eventId for this publish
    version: 1,
    timestamp,
    notificationId: notifId,
    userId,
    type,
    title,
    body,
    link,
  };
  const redis = getRedisClient();
  await redis.publish("eventbus:notification.created", JSON.stringify(payload));
}

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

      // Idempotency: deduplicate using Redis SET NX
      // If Redis is unavailable, log and continue (fail-open for notifications — non-critical path)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:app-submitted:${applicationId}`);
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
      // Runs before employer notification so DB-level dedup on the employer side
      // does not suppress the seeker email on replay (enqueueEmailJob has its own
      // Redis NX dedup to prevent actual duplicate sends).
      if (seeker?.email) {
        // enqueueEmailJob is async fire-and-forget with internal error handling
        // (Redis NX dedup + send error catch) — no outer try/catch needed.
        void enqueueEmailJob(`app-confirmed-${applicationId}`, {
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
        const notifTitle = `New application for ${jobTitle}`;
        const notifBody = `from ${seekerName}`;
        const notifLink = `/admin/applications/${applicationId}`;
        try {
          const notif = await createNotification({
            userId: employerUserId,
            type: "system",
            title: notifTitle,
            body: notifBody,
            link: notifLink,
            idempotencyKey: `app-submitted:${applicationId}`,
          });
          if (!notif) {
            // DB-level dedup: employer notification already created for this applicationId.
            // Skip employer downstream work (publish). Seeker email already sent above.
            console.info(
              JSON.stringify({
                level: "info",
                message: "portal.notification.app_submitted.db_dedup_skipped",
                applicationId,
              }),
            );
            return;
          }
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.employer_notification.created",
              applicationId,
              employerUserId,
            }),
          );
          // Publish for real-time delivery via eventbus-bridge → /notifications:notification:new
          try {
            await publishNotificationCreated(
              notif.id,
              employerUserId,
              "system",
              notifTitle,
              notifBody,
              notifLink,
              notif.createdAt.toISOString(),
            );
          } catch (publishErr: unknown) {
            console.error(
              JSON.stringify({
                level: "error",
                message: "portal.notification.app_submitted.publish.error",
                applicationId,
                error: String(publishErr),
              }),
            );
          }
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
        }
      }
    }),
  );

  // ── application.withdrawn handler ────────────────────────────────────────
  portalEventBus.on(
    "application.withdrawn",
    withHandlerGuard("notif:application.withdrawn", async (payload: ApplicationWithdrawnEvent) => {
      const { applicationId, jobId, seekerUserId, companyId } = payload;

      // Idempotency: deduplicate using Redis SET NX
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:app-withdrawn:${applicationId}`);
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
      const notifTitle = "A candidate withdrew their application";
      const notifBody = `${seekerName} withdrew from ${jobTitle}`;
      const notifLink = `/admin/applications/${applicationId}`;

      // TODO(P-6.1A): Hardcoded English per existing application.submitted pattern
      try {
        const notif = await createNotification({
          userId: employerUserId,
          type: "system",
          title: notifTitle,
          body: notifBody,
          link: notifLink,
          idempotencyKey: `app-withdrawn:${applicationId}`,
        });
        if (!notif) {
          // DB-level dedup: notification already created for this applicationId.
          // Skip all downstream work (publish, push).
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.app_withdrawn.db_dedup_skipped",
              applicationId,
            }),
          );
          return;
        }
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.app_withdrawn.employer_notification.created",
            applicationId,
            employerUserId,
          }),
        );
        // Publish for real-time delivery via eventbus-bridge → /notifications:notification:new
        try {
          await publishNotificationCreated(
            notif.id,
            employerUserId,
            "system",
            notifTitle,
            notifBody,
            notifLink,
            notif.createdAt.toISOString(),
          );
        } catch (publishErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.app_withdrawn.publish.error",
              applicationId,
              error: String(publishErr),
            }),
          );
        }
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
    }),
  );

  // ── saved_search.new_result handler ──────────────────────────────────────
  portalEventBus.on(
    "saved_search.new_result",
    withHandlerGuard(
      "notif:saved_search.new_result",
      async (payload: SavedSearchNewResultEvent) => {
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
        const notifTitle = `New match: ${jobTitle}`;
        const notifBody = `Your saved search "${searchName}" has a new result`;
        const notifLink = `${portalBaseUrl ?? ""}/jobs/${jobId}`;
        // TODO(P-6.1A): Use user's languagePreference for bilingual notification text.
        // Currently hardcoded English — same pattern as application.submitted handler.
        try {
          const notif = await createNotification({
            userId,
            type: "system",
            title: notifTitle,
            body: notifBody,
            link: notifLink,
            idempotencyKey: `search-alert:${savedSearchId}:${jobId}`,
          });
          if (!notif) {
            // DB-level dedup: notification already created for this savedSearchId+jobId combo.
            // Skip all downstream work (publish, push).
            console.info(
              JSON.stringify({
                level: "info",
                message: "portal.notification.saved-search.db_dedup_skipped",
                savedSearchId,
                userId,
                jobId,
              }),
            );
            return;
          }
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.saved-search.notification.created",
              savedSearchId,
              userId,
              jobId,
            }),
          );
          // Publish for real-time delivery via eventbus-bridge → /notifications:notification:new
          try {
            await publishNotificationCreated(
              notif.id,
              userId,
              "system",
              notifTitle,
              notifBody,
              notifLink,
              notif.createdAt.toISOString(),
            );
          } catch (publishErr: unknown) {
            console.error(
              JSON.stringify({
                level: "error",
                message: "portal.notification.saved-search.publish.error",
                savedSearchId,
                userId,
                error: String(publishErr),
              }),
            );
          }
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
      },
    ),
  );

  // ── job.reviewed handler — triggers instant alerts for approved postings ──
  portalEventBus.on(
    "job.reviewed",
    withHandlerGuard("notif:job.reviewed", async (payload: JobReviewedEvent) => {
      if (payload.decision !== "approved") return;
      // Idempotency note: this handler does NOT call createNotification directly.
      // It delegates to checkInstantAlerts → evaluateInstantAlert → emits saved_search.new_result
      // events per matched search. Idempotency for those notifications is inherited through
      // the saved_search.new_result handler (idempotencyKey: "search-alert:{savedSearchId}:{jobId}").
      await checkInstantAlerts(payload.jobId);
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

      // 1. Dedup by messageId (atomic SET NX EX — single command avoids race condition)
      try {
        const redis = getRedisClient();
        const dedupKey = createRedisKey("portal", "dedup", `notif:msg:${messageId}`);
        const acquired = await redis.set(dedupKey, "1", "EX", NOTIF_DEDUP_TTL_SECONDS, "NX");
        if (acquired === null) {
          // Key already existed — this event was already processed
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
        // Proceed without dedup — fail-open (better to send duplicate than drop)
      }

      // 2. Throttle: fixed 30-second window per (senderId, recipientId, applicationId)
      //    First message in window: count=1, create notification + set TTL.
      //    Subsequent messages: count>1, suppress notification (unread badge handles count UX).
      let throttleCount = 0;
      try {
        const redis = getRedisClient();
        const throttleKey = createRedisKey(
          "portal",
          "throttle",
          `msg:${senderId}:${recipientId}:${applicationId}`,
        );
        // Pipeline makes INCR+EXPIRE atomic — if EXPIRE fails after INCR, the key
        // would persist forever, permanently suppressing notifications for this triple.
        const pipeline = redis.pipeline();
        pipeline.incr(throttleKey);
        pipeline.expire(throttleKey, MSG_THROTTLE_TTL_SECONDS);
        const results = await pipeline.exec();
        // pipeline.exec() returns [[err, result], [err, result]] or null
        throttleCount = (results?.[0]?.[1] as number) ?? 1;
      } catch (throttleErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.msg.throttle_check.error",
            messageId,
            error: String(throttleErr),
          }),
        );
        // Proceed with notification on Redis failure — fail-open
        throttleCount = 1;
      }

      if (throttleCount > 1) {
        // Within 30s window — suppress additional notifications
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.msg.throttled",
            messageId,
            senderId,
            recipientId,
            applicationId,
            throttleCount,
          }),
        );
        return;
      }

      // 3. Create in-app notification (no DB lookups — payload is already denormalized)
      // TODO(P-6.1A): Resolve recipient's languagePreference for bilingual notification text.
      const resolvedSenderName = senderName ?? "Someone";
      const resolvedJobTitle = jobTitle ?? "a job posting";
      const safeContent = content ?? "";
      const notifTitle = `${resolvedSenderName} sent you a message about ${resolvedJobTitle}`;
      const notifBody = safeContent.slice(0, 50);
      const notifLink = applicationId ? `/conversations/${applicationId}` : "/conversations";

      try {
        const notif = await createNotification({
          userId: recipientId,
          type: "message",
          title: notifTitle,
          body: notifBody,
          link: notifLink,
          idempotencyKey: `msg:${messageId}`,
        });
        if (!notif) {
          // DB-level dedup: notification already created for this messageId.
          // Skip all downstream work (publish, push).
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.msg.db_dedup_skipped",
              messageId,
            }),
          );
          return;
        }
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.msg.notification.created",
            messageId,
            recipientId,
            applicationId,
          }),
        );

        // 4. Publish for real-time delivery via eventbus-bridge → /notifications:notification:new
        try {
          await publishNotificationCreated(
            notif.id,
            recipientId,
            "message",
            notifTitle,
            notifBody,
            notifLink,
            notif.createdAt.toISOString(),
          );
        } catch (publishErr: unknown) {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.msg.publish.error",
              messageId,
              error: String(publishErr),
            }),
          );
          // Fire-and-forget — publish failure does not affect in-app notification
        }

        // 5. Push notification (fire-and-forget, non-blocking)
        //    Always send push — browser/OS suppresses if app is in foreground (AC #2, Option B)
        // Strip HTML tags for plain-text push body (lock-screen safe)
        const plainPreview = safeContent.replace(/<[^>]*>/g, "").slice(0, 50);
        sendPushNotification(recipientId, {
          title: resolvedSenderName,
          body: `New message about ${resolvedJobTitle}: ${plainPreview}`,
          link: notifLink,
          tag: `msg:${applicationId}`,
        }).catch((pushErr: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "portal.notification.msg.push.error",
              messageId,
              recipientId,
              error: String(pushErr),
            }),
          );
        });
      } catch (notifErr: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.notification.msg.notification.error",
            messageId,
            recipientId,
            error: String(notifErr),
          }),
        );
        // Error logged — does not propagate (fire-and-forget)
      }
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
