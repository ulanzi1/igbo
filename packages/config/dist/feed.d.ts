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
declare const FEED_CONFIG: {
  readonly RECENCY_WEIGHT: 0.6;
  readonly ENGAGEMENT_WEIGHT: 0.4;
  readonly HALF_LIFE_HOURS: 12;
  readonly ENGAGEMENT_WINDOW_DAYS: 7;
  /** Multipliers for engagement signal normalization. */
  readonly LIKE_WEIGHT: 1;
  readonly COMMENT_WEIGHT: 2;
  readonly SHARE_WEIGHT: 3;
  /**
   * Platform-level cold-start threshold.
   * Below this number of total posts, always sort chronologically
   * (engagement scores produce noise with too few data points).
   */
  readonly COLD_START_POST_THRESHOLD: 50;
  /** Default page size for cursor-based pagination. */
  readonly PAGE_SIZE: 20;
};
type FeedSortMode = "chronological" | "algorithmic";
type FeedFilter = "all" | "announcements";

export { FEED_CONFIG, type FeedFilter, type FeedSortMode };
