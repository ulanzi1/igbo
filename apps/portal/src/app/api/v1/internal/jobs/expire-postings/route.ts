import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import {
  getExpiredPostings,
  getExpiringPostings,
  batchExpirePostings,
  getJobPostingWithCompany,
} from "@igbo/db/queries/portal-job-postings";
import { portalEventBus } from "@/services/event-bus";

export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);

    // Step 1: Find and expire postings past their expires_at
    const expiredPostings = await getExpiredPostings();
    const expiredIds = expiredPostings.map((p) => p.id);
    const expiredCount = await batchExpirePostings(expiredIds);

    // Emit job.expired event for each expired posting
    // Promise.allSettled — one failed emit must NOT prevent other postings from being processed
    // Resolve employer user IDs via company join (portalCompanyProfiles.ownerUserId)
    await Promise.allSettled(
      expiredPostings.map(async (posting) => {
        const result = await getJobPostingWithCompany(posting.id);
        const employerUserId = result?.company?.ownerUserId ?? posting.companyId;
        portalEventBus.emit("job.expired", {
          jobId: posting.id,
          companyId: posting.companyId,
          title: posting.title,
          employerUserId,
        });
      }),
    );

    // Step 2: Emit 3-day expiry warnings for postings approaching expiry (not yet expired)
    const expiringPostings = await getExpiringPostings(3);
    await Promise.allSettled(
      expiringPostings.map(async (posting) => {
        const expiresAt = posting.expiresAt!;
        const msRemaining = expiresAt.getTime() - Date.now();
        const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
        const result = await getJobPostingWithCompany(posting.id);
        const employerUserId = result?.company?.ownerUserId ?? posting.companyId;
        portalEventBus.emit("job.expiry_warning", {
          jobId: posting.id,
          companyId: posting.companyId,
          title: posting.title,
          employerUserId,
          expiresAt: expiresAt.toISOString(),
          daysRemaining,
        });
      }),
    );

    return successResponse({ expired: expiredCount, warnings: expiringPostings.length });
  },
  { skipCsrf: true },
);
