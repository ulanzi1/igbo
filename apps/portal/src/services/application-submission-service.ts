import "server-only";
import { db } from "@igbo/db";
import { portalApplications, canAcceptApplications } from "@igbo/db/schema/portal-applications";
import type { PortalApplication } from "@igbo/db/schema/portal-applications";
import { getJobPostingForApply } from "@igbo/db/queries/portal-job-postings";
import { getExistingActiveApplication } from "@igbo/db/queries/portal-applications";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import { listSeekerCvs } from "@igbo/db/queries/portal-seeker-cvs";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getRedisClient } from "@/lib/redis";
import { portalEventBus } from "@/services/event-bus";

const IDEMPOTENCY_TTL_SECONDS = 15 * 60; // 15 minutes

export interface SubmitApplicationInput {
  jobId: string;
  seekerUserId: string;
  selectedCvId: string | null;
  coverLetterText: string | null;
  portfolioLinks: string[];
  idempotencyKey: string | null;
}

export interface SubmitApplicationResult {
  application: PortalApplication;
  replayed: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export async function submit(input: SubmitApplicationInput): Promise<SubmitApplicationResult> {
  const start = Date.now();
  const { jobId, seekerUserId, selectedCvId, coverLetterText, portfolioLinks, idempotencyKey } =
    input;

  console.info(
    JSON.stringify({ level: "info", message: "applications.submit.invoked", jobId, seekerUserId }),
  );

  // Step 1: Seeker profile precondition (AC-7)
  const seekerProfile = await getSeekerProfileByUserId(seekerUserId);
  if (!seekerProfile) {
    throw new ApiError({
      title: "Seeker profile required",
      status: 409,
      extensions: { code: PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED },
    });
  }

  // Step 2: Job posting precondition
  const job = await getJobPostingForApply(jobId);
  if (!job) {
    throw new ApiError({
      title: "Job posting not found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Step 3: Job status guard (AC-4)
  if (!canAcceptApplications(job.status)) {
    throw new ApiError({
      title: "Job posting is not accepting applications",
      status: 409,
      extensions: {
        code: PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION,
        reason: "job_not_active",
        jobStatus: job.status,
      },
    });
  }

  // Step 4: Application deadline guard (AC-5)
  if (job.applicationDeadline !== null && job.applicationDeadline <= new Date()) {
    throw new ApiError({
      title: "Application deadline has passed",
      status: 409,
      extensions: {
        code: PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION,
        reason: "deadline_passed",
      },
    });
  }

  // Step 5: CV ownership check
  if (selectedCvId !== null) {
    const cvs = await listSeekerCvs(seekerProfile.id);
    const ownsCv = cvs.some((cv) => cv.id === selectedCvId);
    if (!ownsCv) {
      throw new ApiError({ title: "Invalid CV selection", status: 400 });
    }
  }

  // Step 6: Idempotency key check via atomic SET NX (AC-6)
  if (idempotencyKey) {
    const redis = getRedisClient();
    const redisKey = `dedup:portal:apply:${jobId}:${seekerUserId}:${idempotencyKey}`;
    const acquired = await redis.set(redisKey, "pending", "EX", IDEMPOTENCY_TTL_SECONDS, "NX");
    if (acquired === null) {
      // Key already exists — this is a replay of a previous request
      const existingApp = await getExistingActiveApplication(jobId, seekerUserId);
      if (existingApp) {
        console.info(
          JSON.stringify({
            level: "info",
            message: "applications.submit.duplicate_skipped",
            jobId,
            seekerUserId,
            reason: "idempotency_replay",
          }),
        );
        return { application: existingApp, replayed: true };
      }
      // Key set but no row found — fall through to insert (handles edge case)
    }
  }

  // Step 7: Insert inside db.transaction, catching unique violation (AC-3, AC-6)
  let application: PortalApplication;
  try {
    application = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(portalApplications)
        .values({
          jobId,
          seekerUserId,
          selectedCvId,
          coverLetterText,
          portfolioLinksJson: portfolioLinks,
        })
        .returning();
      if (!row) throw new Error("Failed to insert application");
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      console.info(
        JSON.stringify({
          level: "info",
          message: "applications.submit.duplicate_skipped",
          jobId,
          seekerUserId,
          reason: "unique_violation",
        }),
      );
      throw new ApiError({
        title: "You have already applied to this position",
        status: 409,
        extensions: { code: PORTAL_ERRORS.DUPLICATE_APPLICATION },
      });
    }
    console.error(
      JSON.stringify({
        level: "error",
        message: "applications.submit.failed",
        jobId,
        seekerUserId,
      }),
    );
    throw err;
  }

  // Step 8: Update Redis key with application ID (overwrite "pending" → actual ID)
  if (idempotencyKey) {
    const redis = getRedisClient();
    const redisKey = `dedup:portal:apply:${jobId}:${seekerUserId}:${idempotencyKey}`;
    await redis.set(redisKey, application.id, "EX", IDEMPOTENCY_TTL_SECONDS);
  }

  // Step 9: Emit event AFTER transaction commits (AC-3)
  portalEventBus.emit("application.submitted", {
    applicationId: application.id,
    jobId,
    seekerUserId,
    companyId: job.companyId,
    employerUserId: job.employerUserId,
  });

  const durationMs = Date.now() - start;
  console.info(
    JSON.stringify({
      level: "info",
      message: "applications.submit.succeeded",
      applicationId: application.id,
      durationMs,
    }),
  );

  return { application, replayed: false };
}
