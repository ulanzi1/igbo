import "server-only";
import {
  getExistingActiveReportForUser,
  resolveReportsForPosting,
  dismissReportsForPosting,
  getReporterUserIdsForPosting,
} from "@igbo/db/queries/portal-posting-reports";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getOpenFlagForPosting } from "@igbo/db/queries/portal-admin-flags";
import { createNotification } from "@igbo/db/queries/notifications";
import { db } from "@igbo/db";
import { portalPostingReports } from "@igbo/db/schema/portal-posting-reports";
import { portalJobPostings } from "@igbo/db/schema/portal-job-postings";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { eq, and, inArray, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-error";
import {
  PORTAL_ERRORS,
  REPORT_PRIORITY_THRESHOLDS,
  type ReportCategory,
} from "@/lib/portal-errors";
import { portalEventBus } from "@/services/event-bus";
import type { PortalPostingReport } from "@igbo/db/schema/portal-posting-reports";

export type { PortalPostingReport };

export interface SubmitReportInput {
  postingId: string;
  reporterUserId: string;
  category: ReportCategory;
  description: string;
}

/**
 * Submit a user report for a job posting.
 * Enforces deduplication via partial unique index and auto-pauses at 5+ active reports.
 */
export async function submitReport(input: SubmitReportInput): Promise<PortalPostingReport> {
  const { postingId, reporterUserId, category, description } = input;

  // Validate posting exists and is reportable
  const context = await getJobPostingWithCompany(postingId);
  if (!context) {
    throw new ApiError({
      title: "Posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
  if (!["active", "paused"].includes(context.posting.status)) {
    throw new ApiError({
      title: "Posting cannot be reported in its current state",
      status: 409,
      extensions: { code: PORTAL_ERRORS.INVALID_STATUS_TRANSITION },
    });
  }

  // Prevent users from reporting their own posting
  if (context.company.ownerUserId === reporterUserId) {
    throw new ApiError({
      title: "Cannot report your own posting",
      status: 403,
      extensions: { code: PORTAL_ERRORS.CANNOT_REPORT_OWN_POSTING },
    });
  }

  // Deduplication: one active report per user per posting
  const existing = await getExistingActiveReportForUser(postingId, reporterUserId);
  if (existing) {
    throw new ApiError({
      title: "You have already submitted a report for this posting",
      status: 409,
      extensions: { code: PORTAL_ERRORS.ALREADY_REPORTED },
    });
  }

  // Transaction: insert report + count + auto-pause atomically
  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(portalPostingReports)
      .values({
        postingId,
        reporterUserId,
        category,
        description: description.trim(),
      })
      .returning();
    if (!inserted) throw new Error("submitReport: no row returned");

    // Count active reports inside tx for accuracy
    const [countResult] = await tx
      .select({ cnt: sql<number>`count(${portalPostingReports.id})::int` })
      .from(portalPostingReports)
      .where(
        and(
          eq(portalPostingReports.postingId, postingId),
          inArray(portalPostingReports.status, ["open", "investigating"]),
        ),
      );
    const reportCount = countResult?.cnt ?? 0;

    let autoPaused = false;
    if (reportCount >= REPORT_PRIORITY_THRESHOLDS.URGENT && context.posting.status === "active") {
      // Race-safe: only pause if posting is still active
      const [paused] = await tx
        .update(portalJobPostings)
        .set({ status: "paused" })
        .where(and(eq(portalJobPostings.id, postingId), eq(portalJobPostings.status, "active")))
        .returning({ id: portalJobPostings.id });
      autoPaused = !!paused;
    }

    // Audit log
    await tx.insert(auditLogs).values({
      actorId: reporterUserId,
      action: "portal.report.submit",
      targetType: "portal_posting_report",
      details: {
        reportId: inserted.id,
        postingId,
        category,
        reportCount,
        autoPaused,
      },
    });

    return { report: inserted, reportCount, autoPaused };
  });

  const priorityEscalated = result.reportCount >= REPORT_PRIORITY_THRESHOLDS.ELEVATED;

  // Emit event for downstream handlers (notifications, analytics)
  portalEventBus.emit("posting.reported", {
    jobId: postingId,
    reportId: result.report.id,
    reporterUserId,
    category,
    reportCount: result.reportCount,
    priorityEscalated,
    autoPaused: result.autoPaused,
  });

  return result.report;
}

/**
 * Resolve all active reports for a posting with an admin action (e.g., "reject").
 * Writes audit log and notifies all reporters via in-app notification.
 */
export async function resolveReportsWithAction(
  postingId: string,
  data: {
    resolvedByUserId: string;
    resolutionAction: string;
    resolutionNote: string;
  },
): Promise<number> {
  const count = await resolveReportsForPosting(postingId, data);

  if (count > 0) {
    // Audit log
    await db.insert(auditLogs).values({
      actorId: data.resolvedByUserId,
      action: "portal.report.resolve",
      targetType: "portal_posting_report",
      details: {
        postingId,
        resolutionAction: data.resolutionAction,
        resolvedCount: count,
      },
    });

    const reporterIds = await getReporterUserIdsForPosting(postingId);
    await notifyReporters(reporterIds, {
      title: "Your report has been reviewed",
      body: "An admin has reviewed and actioned the posting you reported.",
    });
  }

  return count;
}

/**
 * Dismiss all active reports for a posting (no violation found).
 * Un-pauses the posting if it was auto-paused by report volume (and no open admin flag exists).
 * Writes audit log and notifies all reporters via in-app notification.
 */
export async function dismissReports(
  postingId: string,
  data: {
    resolvedByUserId: string;
    resolutionNote: string;
  },
): Promise<number> {
  // Capture pre-dismiss state for un-pause logic
  const context = await getJobPostingWithCompany(postingId);
  const wasReportPaused = context?.posting.status === "paused";

  const count = await dismissReportsForPosting(postingId, data);

  if (count > 0) {
    // Un-pause the posting if it was paused by report count and no admin flag is open
    if (wasReportPaused) {
      const openFlag = await getOpenFlagForPosting(postingId);
      if (!openFlag) {
        // Race-safe: only un-pause if still paused
        await db
          .update(portalJobPostings)
          .set({ status: "active" })
          .where(and(eq(portalJobPostings.id, postingId), eq(portalJobPostings.status, "paused")));
      }
    }

    // Audit log
    await db.insert(auditLogs).values({
      actorId: data.resolvedByUserId,
      action: "portal.report.dismiss",
      targetType: "portal_posting_report",
      details: {
        postingId,
        dismissedCount: count,
      },
    });

    const reporterIds = await getReporterUserIdsForPosting(postingId);
    await notifyReporters(reporterIds, {
      title: "Update on your report",
      body: "An admin has reviewed the posting you reported and found no violations.",
    });
  }

  return count;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function notifyReporters(
  reporterIds: string[],
  message: { title: string; body: string },
): Promise<void> {
  await Promise.allSettled(
    reporterIds.map((userId) =>
      createNotification({
        userId,
        type: "system",
        title: message.title,
        body: message.body,
        link: "/jobs",
      }),
    ),
  );
}
