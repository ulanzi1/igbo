import "server-only";
import { withApiHandler } from "@/lib/api-middleware";
import { requireInternalAuth } from "@/lib/internal-auth";
import { successResponse } from "@/lib/api-response";
import {
  getSavedSearchesForAlerts,
  batchUpdateLastAlertedAt,
} from "@igbo/db/queries/portal-saved-searches";
import { findNewPostingsForAlert } from "@igbo/db/queries/portal-job-search";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { enqueueEmailJob } from "@/services/email-service";
import type { JobSearchRequest } from "@/lib/validations/job-search";

const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global"; // ci-allow-process-env

/**
 * POST /api/v1/internal/saved-searches/send-digests
 * Daily digest cron: evaluates all saved searches and sends one digest
 * email per user listing new matches. Updates last_alerted_at watermarks.
 */
export const POST = withApiHandler(
  async (req) => {
    requireInternalAuth(req);

    const searches = await getSavedSearchesForAlerts();
    if (searches.length === 0) {
      return successResponse({ processed: 0, emailsSent: 0, errors: 0 });
    }

    // Group searches by userId
    const byUser = new Map<string, typeof searches>();
    for (const s of searches) {
      const list = byUser.get(s.userId) ?? [];
      list.push(s);
      byUser.set(s.userId, list);
    }

    let emailsSent = 0;
    let errors = 0;
    const processedSearchIds: string[] = [];
    const now = new Date();

    for (const [userId, userSearches] of byUser) {
      try {
        // Resolve user for locale + email
        const user = await findUserById(userId);
        if (!user?.email) continue;

        const locale = user.languagePreference === "ig" ? "ig" : "en";

        // For each search, find new postings since last_alerted_at (or created_at)
        const sections: Array<{
          name: string;
          newJobs: Array<{ title: string; company: string; location: string; detailUrl: string }>;
        }> = [];

        for (const savedSearch of userSearches) {
          const sinceTimestamp = savedSearch.lastAlertedAt ?? savedSearch.createdAt;
          const searchParams = savedSearch.searchParamsJson as JobSearchRequest;

          const newPostings = await findNewPostingsForAlert(
            { query: searchParams.query, filters: searchParams.filters },
            sinceTimestamp,
          );

          if (newPostings.length > 0) {
            sections.push({
              name: savedSearch.name,
              newJobs: newPostings.map((p) => ({
                title: p.title,
                company: p.companyName ?? "Unknown Company",
                location: p.location ?? "",
                detailUrl: `${PORTAL_BASE_URL}/jobs/${p.id}`,
              })),
            });
            processedSearchIds.push(savedSearch.id);
          }
        }

        if (sections.length === 0) continue;

        // Send single digest email for user
        enqueueEmailJob(`digest-${userId}-${now.toISOString().slice(0, 10)}`, {
          to: user.email,
          templateId: "saved-search-digest",
          data: {
            seekerName: user.name ?? user.email,
            searches: sections,
          },
          locale,
        });
        emailsSent++;
      } catch (err: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "portal.digest.user.error",
            userId,
            error: String(err),
          }),
        );
        errors++;
      }
    }

    // Update last_alerted_at watermarks for all processed searches
    if (processedSearchIds.length > 0) {
      await batchUpdateLastAlertedAt(processedSearchIds, now);
    }

    return successResponse({ processed: searches.length, emailsSent, errors });
  },
  { skipCsrf: true },
);
