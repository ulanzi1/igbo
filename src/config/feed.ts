/**
 * Feed algorithm configuration constants.
 *
 * Two-factor score: score = (recency_decay × RECENCY_WEIGHT) + (engagement_normalized × ENGAGEMENT_WEIGHT)
 *
 * recency_decay = exp(-ln(2) / HALF_LIFE_HOURS * hours_since_post)
 *   → 1.0 when just posted, approaches 0.0 asymptotically over 7 days
 *
 * engagement_normalized = (likes + 2×comments + 3×shares) / max_engagement_in_window, capped at 1.0
 */
export const FEED_CONFIG = {
  RECENCY_WEIGHT: 0.6,
  ENGAGEMENT_WEIGHT: 0.4,
  HALF_LIFE_HOURS: 12,
  ENGAGEMENT_WINDOW_DAYS: 7,

  /** Multipliers for engagement signal normalization. */
  LIKE_WEIGHT: 1,
  COMMENT_WEIGHT: 2,
  SHARE_WEIGHT: 3,

  /**
   * Platform-level cold-start threshold.
   * Below this number of total posts, always sort chronologically
   * (engagement scores produce noise with too few data points).
   */
  COLD_START_POST_THRESHOLD: 50,

  /** Default page size for cursor-based pagination. */
  PAGE_SIZE: 20,
} as const;

export type FeedSortMode = "chronological" | "algorithmic";
export type FeedFilter = "all" | "announcements";
