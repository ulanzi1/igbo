/**
 * Formats a job posting's `createdAt` ISO string into a human-readable age string.
 *
 * - < 7 days old: relative ("2 days ago", "1 day ago")
 * - ≥ 7 days old: absolute ("Apr 10, 2026")
 *
 * Returns a plain string. The component is responsible for using the appropriate
 * i18n key (Portal.search.card.postingAgeRelative / postingAgeAbsolute).
 *
 * Note: relative is computed once at render — no live ticker. This avoids layout
 * shift from live updates (UX spec §2843).
 */

export type PostingAgeResult =
  | { variant: "relative"; days: number }
  | { variant: "absolute"; date: string };

/**
 * @param isoCreatedAt - ISO 8601 date string from the API.
 * @param locale       - BCP47 locale for absolute date formatting.
 */
export function formatPostingAge(isoCreatedAt: string, locale: string): PostingAgeResult {
  const created = new Date(isoCreatedAt);
  const now = new Date();

  const msAge = now.getTime() - created.getTime();
  const daysAge = msAge / (1000 * 60 * 60 * 24);

  if (daysAge < 7) {
    // Clamp negative ages (future-dated createdAt due to clock skew) to 0
    // so the card renders "Posted 0 days ago" rather than "-1 days ago" (review fix M4).
    return { variant: "relative", days: Math.max(0, Math.floor(daysAge)) };
  }

  const dateFormatter = new Intl.DateTimeFormat(locale === "ig" ? "en" : locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { variant: "absolute", date: dateFormatter.format(created) };
}
