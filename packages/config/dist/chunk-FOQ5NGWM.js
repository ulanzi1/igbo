// src/feed.ts
var FEED_CONFIG = {
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
  PAGE_SIZE: 20
};

export {
  FEED_CONFIG
};
