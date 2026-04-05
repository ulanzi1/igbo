import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import { getArchivablePostings, archivePosting } from "@igbo/db/queries/portal-job-postings";

const ARCHIVE_GRACE_PERIOD_DAYS = 30;

export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);

    const archivablePostings = await getArchivablePostings(ARCHIVE_GRACE_PERIOD_DAYS);

    let archivedCount = 0;
    for (const posting of archivablePostings) {
      const count = await archivePosting(posting.id);
      archivedCount += count;
    }

    return successResponse({ archived: archivedCount });
  },
  { skipCsrf: true },
);
