import "server-only";
import {
  getUsersWithDigestDue,
  getUndigestedPortalNotifications,
  markDigestSent,
  getNotificationPreferences,
} from "@igbo/db/queries/notification-preferences";
import { findUserById } from "@igbo/db/queries/auth-queries";
import { enqueueEmailJob } from "@/services/email-service";

const PORTAL_BASE_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.igbo.global"; // ci-allow-process-env

export interface DigestResult {
  processed: number;
  emailsSent: number;
  skipped: number;
  errors: number;
}

export interface DigestNotificationItem {
  title: string;
  body: string;
  link: string | null;
}

interface DigestSections {
  recommendations: DigestNotificationItem[];
  savedSearches: DigestNotificationItem[];
  activity: DigestNotificationItem[];
}

/** idempotencyKey prefixes that map to the "saved searches" section */
const SAVED_SEARCH_DEDUP_PREFIX = "search-alert:";

/** idempotencyKey prefixes that map to the "recommendations" section (reserved for P-7.x) */
const RECOMMENDATION_DEDUP_PREFIX = "match-rec:";

/**
 * Deduplicate notifications by their entity link (or id as fallback).
 * Keeps the first occurrence (notifications are ordered by createdAt asc from DB).
 */
function deduplicateByEntity(
  items: Array<{ id: string; title: string; body: string; link: string | null }>,
): DigestNotificationItem[] {
  const seen = new Set<string>();
  const result: DigestNotificationItem[] = [];
  for (const item of items) {
    const entityKey = item.link ?? item.id;
    if (seen.has(entityKey)) continue;
    seen.add(entityKey);
    result.push({ title: item.title, body: item.body, link: item.link });
  }
  return result;
}

/**
 * Classify a notification into a digest section based on its idempotencyKey prefix.
 *
 * Portal notifications are stored in portal_notifications with an eventType column.
 * The idempotencyKey carries the event origin:
 *   - "search-alert:*" → saved search results
 *   - "match-rec:*"    → job recommendations (reserved for P-7.x)
 *   - everything else  → activity summary
 */
function classifySection(
  idempotencyKey: string | null,
): "recommendations" | "savedSearches" | "activity" {
  if (!idempotencyKey) return "activity";
  if (idempotencyKey.startsWith(SAVED_SEARCH_DEDUP_PREFIX)) return "savedSearches";
  if (idempotencyKey.startsWith(RECOMMENDATION_DEDUP_PREFIX)) return "recommendations";
  return "activity";
}

/**
 * Group and deduplicate notifications into digest sections.
 */
function groupIntoSections(
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    link: string | null;
    idempotencyKey: string | null;
  }>,
): DigestSections {
  const recommendations: Array<{ id: string; title: string; body: string; link: string | null }> =
    [];
  const savedSearches: Array<{ id: string; title: string; body: string; link: string | null }> = [];
  const activity: Array<{ id: string; title: string; body: string; link: string | null }> = [];

  for (const notif of notifications) {
    const section = classifySection(notif.idempotencyKey);
    const item = { id: notif.id, title: notif.title, body: notif.body, link: notif.link };
    if (section === "recommendations") recommendations.push(item);
    else if (section === "savedSearches") savedSearches.push(item);
    else activity.push(item);
  }

  return {
    recommendations: deduplicateByEntity(recommendations),
    savedSearches: deduplicateByEntity(savedSearches),
    activity: deduplicateByEntity(activity),
  };
}

/**
 * Sends pending digest emails to all users whose digest is due.
 *
 * For each eligible user:
 * 1. Computes the earliest lastDigestAt across all due notification types
 * 2. Fetches ALL undigested portal (type="system") notifications since that watermark
 * 3. Classifies into sections by idempotencyKey prefix
 * 4. Deduplicates by entity link within each section
 * 5. Enqueues digest email if there are any items
 * 6. Always advances the lastDigestAt watermark via markDigestSent
 *
 * Returns aggregate stats: { processed, emailsSent, skipped, errors }
 */
export async function sendPendingDigests(nowUtc: Date): Promise<DigestResult> {
  const dueUsers = await getUsersWithDigestDue(nowUtc);

  let emailsSent = 0;
  let skipped = 0;
  let errors = 0;

  for (const { userId, digestTypes } of dueUsers) {
    try {
      // Resolve user for email + locale
      const user = await findUserById(userId);
      if (!user?.email) {
        skipped++;
        continue;
      }

      const locale: "en" | "ig" = user.languagePreference === "ig" ? "ig" : "en";
      const seekerName = user.name ?? user.email;

      // Get preferences to read per-type lastDigestAt watermarks
      const prefs = await getNotificationPreferences(userId);

      // Compute earliest watermark across all due digest types
      let earliestSince = new Date();
      for (const notifType of digestTypes) {
        const since = prefs[notifType]?.lastDigestAt ?? new Date(0);
        if (since < earliestSince) earliestSince = since;
      }

      // Fetch ALL undigested portal notifications since the earliest watermark.
      // After P-6.7, portal notifications are in portal_notifications (not platform_notifications).
      const allNotifs = await getUndigestedPortalNotifications(userId, earliestSince);

      // Always advance the watermark — even for empty digests (AC #4)
      await markDigestSent(userId, digestTypes, nowUtc);

      // Classify and group into sections by idempotencyKey prefix, then deduplicate
      const sections = groupIntoSections(
        allNotifs.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          link: n.link ?? null,
          idempotencyKey: n.idempotencyKey ?? null,
        })),
      );
      const totalItems =
        sections.recommendations.length + sections.savedSearches.length + sections.activity.length;

      if (totalItems === 0) {
        skipped++;
        continue;
      }

      // Enqueue digest email (dedup key prevents duplicate sends on retry)
      const dateStr = nowUtc.toISOString().slice(0, 10);
      await enqueueEmailJob(`digest-${userId}-${dateStr}`, {
        to: user.email,
        templateId: "notification-digest",
        data: {
          seekerName,
          recommendations: sections.recommendations,
          savedSearches: sections.savedSearches,
          activity: sections.activity,
          preferencesUrl: `${PORTAL_BASE_URL}/settings/notifications`,
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

  return { processed: dueUsers.length, emailsSent, skipped, errors };
}
