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
      const baseUrl = portalBaseUrl ?? "https://portal.igbo.global";
      const trackingUrl = `${baseUrl}/applications`;

      // ── Seeker confirmation email (fire-and-forget) ──────────────────────────
      // Targets seekerUserId — a DIFFERENT user than the routing pipeline target below.
      // Two-recipient scenario: seeker gets a confirmation email (inline, here), employer
      // gets a new-application notification via the routing pipeline (with emailJob below).
      // Do NOT remove or merge these — they serve different recipients with different templates.
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
        // Step 3: Employer user lookup for email + locale (separate from seeker batch — P-6.2)
        // Fail-open: if lookup fails, in-app notification still dispatches without emailJob.
        let employer: Awaited<ReturnType<typeof findUserById>> | null = null;
        try {
          employer = await findUserById(employerUserId);
        } catch (lookupErr: unknown) {
          console.warn(
            JSON.stringify({
              level: "warn",
              message: "portal.notification.employer_lookup.failed",
              applicationId,
              employerUserId,
              error: String(lookupErr),
            }),
          );
        }

        const seekerName = seeker?.name ?? "a seeker";
        const employerLocale: "en" | "ig" = employer?.languagePreference === "ig" ? "ig" : "en";

        // Fail-open on missing employer email: emailJob omitted, in-app dispatched regardless
        const employerEmailJob = employer?.email
          ? {
              name: `app-submitted-employer-${applicationId}`,
              payload: {
                to: employer.email,
                templateId: "application-submitted-employer",
                data: {
                  jobTitle,
                  seekerName: seeker?.name ?? seeker?.email ?? "a candidate",
                  companyName,
                  applicationDetailUrl: `${baseUrl}/admin/applications/${applicationId}`,
                  portalBaseUrl: baseUrl,
                },
                locale: employerLocale,
              },
            }
          : undefined;

        if (!employer?.email) {
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.employer_email.skipped",
              applicationId,
              reason: "no_email",
            }),
          );
        }

        await dispatchNotification({
          userId: employerUserId,
          eventType: "portal.application.submitted",
          content: {
            title: `New application for ${jobTitle}`,
            body: `from ${seekerName}`,
            link: `/admin/applications/${applicationId}`,
          },
          dedupKey: `app-submitted:${applicationId}`,
          pushPayload: {
            title: `New application for ${jobTitle}`,
            body: `from ${seekerName}`,
            link: `/admin/applications/${applicationId}`,
            tag: `app-submitted:${applicationId}`,
          },
          ...(employerEmailJob ? { emailJob: employerEmailJob } : {}),
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
          title: "Application withdrawn",
          body: `${seekerName} withdrew from ${jobTitle}`,
          link: `/admin/applications/${applicationId}`,
        },
        dedupKey: `app-withdrawn:${applicationId}`,
        pushPayload: {
          title: "Application withdrawn",
          body: `${seekerName} withdrew from ${jobTitle}`,
          link: `/admin/applications/${applicationId}`,
          tag: `app-withdrawn:${applicationId}`,
        },
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

      // Step 2: Employer user lookup for email + locale (fail-open)
      const [employerResult] = await Promise.allSettled([findUserById(employerUserId)]);
      const employer = employerResult.status === "fulfilled" ? employerResult.value : null;

      if (employerResult.status === "rejected") {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.notification.job_reviewed.employer_lookup.failed",
            jobId,
            employerUserId,
            error: String(employerResult.reason),
          }),
        );
      }

      const portalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global"; // ci-allow-process-env
      const employerLocale: "en" | "ig" = employer?.languagePreference === "ig" ? "ig" : "en";

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

      // Build emailJob based on decision — job-rejected has no CTA URL
      const reviewedEmailJob = employer?.email
        ? {
            name: `job-${decision}-${jobId}`,
            payload: {
              to: employer.email,
              templateId:
                decision === "approved"
                  ? "job-approved"
                  : decision === "rejected"
                    ? "job-rejected"
                    : "job-changes-requested",
              data: {
                jobTitle,
                companyName,
                portalBaseUrl,
                ...(decision === "approved"
                  ? { jobDetailUrl: `${portalBaseUrl}/jobs/${jobId}` }
                  : decision === "changes_requested"
                    ? { jobEditUrl: `${portalBaseUrl}/jobs/${jobId}/edit` }
                    : {}), // job-rejected: no CTA URL
              },
              locale: employerLocale,
            },
          }
        : undefined;

      if (!employer?.email) {
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.job_reviewed.employer_email.skipped",
            jobId,
            decision,
            reason: "no_email",
          }),
        );
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
        pushPayload: {
          title: notifTitle,
          body: notifBody,
          link: `/jobs/${jobId}`,
          tag: `job-reviewed:${jobId}:${decision}`,
        },
        ...(reviewedEmailJob ? { emailJob: reviewedEmailJob } : {}),
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

  // ── portal.message.sent handler ──────────────────────────────────────────────
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
      // NOTE: email is intentionally OFF for portal.message.received per catalog defaults
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

        // Step 2: DB lookups for jobTitle + companyName (via JOIN) and seeker email
        const [postingResult, seekerResult] = await Promise.allSettled([
          getJobPostingWithCompany(jobId),
          findUserById(seekerUserId),
        ]);

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

        if (seekerResult.status === "rejected") {
          console.warn(
            JSON.stringify({
              level: "warn",
              message: "portal.notification.app_status_changed.seeker_lookup.failed",
              applicationId,
              seekerUserId,
              error: String(seekerResult.reason),
            }),
          );
        }

        const postingWithCompany =
          postingResult.status === "fulfilled" ? postingResult.value : null;
        const seeker = seekerResult.status === "fulfilled" ? seekerResult.value : null;

        const jobTitle = postingWithCompany?.posting.title ?? "Unknown Position";
        const companyName = postingWithCompany?.company?.name ?? "Unknown Company";

        const portalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global"; // ci-allow-process-env
        const seekerLocale: "en" | "ig" = seeker?.languagePreference === "ig" ? "ig" : "en";

        // Status filter: only send email for meaningful transitions (not under_review —
        // too noisy, no seeker action required at that stage)
        const EMAIL_ELIGIBLE_STATUSES = new Set([
          "shortlisted",
          "interviewing",
          "offered",
          "hired",
          "rejected",
        ]);
        const shouldEmailSeeker = EMAIL_ELIGIBLE_STATUSES.has(newStatus) && !!seeker?.email;

        // Fail-open on missing seeker email: emailJob omitted, in-app dispatched regardless
        const statusEmailJob = shouldEmailSeeker
          ? {
              name: `status-changed-${applicationId}-${newStatus}`,
              payload: {
                to: seeker!.email!,
                templateId: "application-status-changed",
                data: {
                  seekerName: seeker!.name ?? seeker!.email,
                  jobTitle,
                  newStatus,
                  companyName,
                  applicationUrl: `${portalBaseUrl}/applications/${applicationId}`,
                  portalBaseUrl,
                },
                locale: seekerLocale,
              },
            }
          : undefined;

        if (!shouldEmailSeeker) {
          console.info(
            JSON.stringify({
              level: "info",
              message: "portal.notification.app_status_changed.seeker_email.skipped",
              applicationId,
              newStatus,
              reason: !EMAIL_ELIGIBLE_STATUSES.has(newStatus) ? "status_not_eligible" : "no_email",
            }),
          );
        }

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
          pushPayload: {
            title: "Application update",
            body: `Your application for "${jobTitle}" is now ${newStatus}`,
            link: `/applications/${applicationId}`,
            tag: `status-changed:${applicationId}:${newStatus}`,
          },
          ...(statusEmailJob ? { emailJob: statusEmailJob } : {}),
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
      const { jobId, employerUserId, title: jobTitle, companyId } = payload;

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

      // Step 2: Look up employer (for email + locale) and company (for companyName)
      const [employerResult, companyResult] = await Promise.allSettled([
        findUserById(employerUserId),
        getCompanyById(companyId),
      ]);

      const employer = employerResult.status === "fulfilled" ? employerResult.value : null;
      const company = companyResult.status === "fulfilled" ? companyResult.value : null;

      if (employerResult.status === "rejected") {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.notification.job_expired.employer_lookup.failed",
            jobId,
            employerUserId,
            error: String(employerResult.reason),
          }),
        );
      }

      if (companyResult.status === "rejected") {
        console.warn(
          JSON.stringify({
            level: "warn",
            message: "portal.notification.job_expired.company_lookup.failed",
            jobId,
            companyId,
            error: String(companyResult.reason),
          }),
        );
      }

      const companyName = company?.name ?? "Unknown Company";
      const portalBaseUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global"; // ci-allow-process-env
      const employerLocale: "en" | "ig" = employer?.languagePreference === "ig" ? "ig" : "en";

      // Fail-open on missing employer email: emailJob omitted, in-app dispatched regardless
      const expiredEmailJob = employer?.email
        ? {
            name: `job-expired-${jobId}`,
            payload: {
              to: employer.email,
              templateId: "job-expired",
              data: {
                jobTitle,
                companyName,
                renewUrl: `${portalBaseUrl}/jobs/new`,
                portalBaseUrl,
              },
              locale: employerLocale,
            },
          }
        : undefined;

      if (!employer?.email) {
        console.info(
          JSON.stringify({
            level: "info",
            message: "portal.notification.job_expired.employer_email.skipped",
            jobId,
            reason: "no_email",
          }),
        );
      }

      await dispatchNotification({
        userId: employerUserId,
        eventType: "portal.job.expired",
        content: {
          title: `Your job posting has expired`,
          body: `"${jobTitle}" has expired and is no longer accepting applications`,
          link: `/jobs/${jobId}`,
        },
        dedupKey: `job-expired:${jobId}`,
        pushPayload: {
          title: "Job posting expired",
          body: `"${jobTitle}" has expired`,
          link: `/jobs/${jobId}`,
          tag: `job-expired:${jobId}`,
        },
        ...(expiredEmailJob ? { emailJob: expiredEmailJob } : {}),
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
