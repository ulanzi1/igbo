/**
 * Formats an application deadline ISO string into a human-readable countdown.
 *
 * Returns null when deadline is null or when the deadline is past (expired
 * postings shouldn't appear in search results, but we handle defensively).
 *
 * Severity levels:
 *   - "critical": < 24 hours remaining
 *   - "warning":  < 7 days remaining
 *   - "normal":   all other cases
 *
 * Text format (consumer uses i18n keys):
 *   - "today":    < 24 hours remaining
 *   - "inDays":   between 1 and 13 days (inclusive) remaining
 *   - "absolute": 14+ days — returns formatted date string in locale-aware format
 */

export type DeadlineSeverity = "normal" | "warning" | "critical";

export interface DeadlineCountdown {
  /** The i18n key variant to use: "today", "inDays", or "absolute" */
  variant: "today" | "inDays" | "absolute";
  /** Number of days remaining (only set when variant = "inDays") */
  days?: number;
  /** Formatted date string (only set when variant = "absolute") */
  date?: string;
  severity: DeadlineSeverity;
}

/**
 * @param isoDeadline - ISO 8601 date string from the API, or null.
 * @param locale      - BCP47 locale for date formatting (e.g. "en", "ig").
 * @returns           DeadlineCountdown info, or null when no deadline or past.
 */
export function formatDeadlineCountdown(
  isoDeadline: string | null | undefined,
  locale: string,
): DeadlineCountdown | null {
  if (!isoDeadline) return null;

  const deadline = new Date(isoDeadline);
  if (isNaN(deadline.getTime())) return null;

  const now = new Date();
  const msRemaining = deadline.getTime() - now.getTime();

  // Past — expired
  if (msRemaining <= 0) return null;

  const hoursRemaining = msRemaining / (1000 * 60 * 60);
  const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

  // < 24 hours
  if (hoursRemaining < 24) {
    return { variant: "today", severity: "critical" };
  }

  // < 7 days
  if (daysRemaining < 7) {
    return {
      variant: "inDays",
      days: Math.ceil(daysRemaining),
      severity: "warning",
    };
  }

  // < 14 days — still show "inDays" but with normal severity
  if (daysRemaining < 14) {
    return {
      variant: "inDays",
      days: Math.ceil(daysRemaining),
      severity: "normal",
    };
  }

  // 14+ days — show absolute date
  const dateFormatter = new Intl.DateTimeFormat(locale === "ig" ? "en" : locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return {
    variant: "absolute",
    date: dateFormatter.format(deadline),
    severity: "normal",
  };
}
