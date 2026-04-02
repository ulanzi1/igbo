import { describe, it, expect } from "vitest";
import { MAX_GROUP_MEMBERS } from "./chat";
import { FEED_CONFIG, type FeedSortMode, type FeedFilter } from "./feed";
import { POINTS_CONFIG, BADGE_MULTIPLIERS } from "./points";
import { UPLOAD_SIZE_LIMITS, UPLOAD_ALLOWED_MIME_TYPES } from "./upload";
import { NOTIFICATION_TYPES, DEFAULT_PREFERENCES } from "./notifications";

describe("@igbo/config — constants", () => {
  describe("chat", () => {
    it("MAX_GROUP_MEMBERS is 50", () => {
      expect(MAX_GROUP_MEMBERS).toBe(50);
    });
  });

  describe("feed", () => {
    it("FEED_CONFIG has expected shape", () => {
      expect(FEED_CONFIG.RECENCY_WEIGHT).toBe(0.6);
      expect(FEED_CONFIG.ENGAGEMENT_WEIGHT).toBe(0.4);
      expect(FEED_CONFIG.PAGE_SIZE).toBe(20);
    });

    it("RECENCY_WEIGHT + ENGAGEMENT_WEIGHT = 1.0", () => {
      expect(FEED_CONFIG.RECENCY_WEIGHT + FEED_CONFIG.ENGAGEMENT_WEIGHT).toBeCloseTo(1.0);
    });

    it("FeedSortMode type exists (type-level, value import check)", () => {
      const mode: FeedSortMode = "chronological";
      expect(["chronological", "algorithmic"]).toContain(mode);
    });

    it("FeedFilter type exists", () => {
      const filter: FeedFilter = "all";
      expect(["all", "announcements"]).toContain(filter);
    });
  });

  describe("points", () => {
    it("POINTS_CONFIG has expected anti-gaming windows", () => {
      expect(POINTS_CONFIG.RAPID_FIRE_WINDOW_SEC).toBe(60);
      expect(POINTS_CONFIG.REPEAT_PAIR_WINDOW_SEC).toBe(600);
    });

    it("BADGE_MULTIPLIERS are ordered blue < red < purple", () => {
      expect(BADGE_MULTIPLIERS.blue).toBeLessThan(BADGE_MULTIPLIERS.red);
      expect(BADGE_MULTIPLIERS.red).toBeLessThan(BADGE_MULTIPLIERS.purple);
    });
  });

  describe("upload", () => {
    it("profile_photo limit is 5MB", () => {
      expect(UPLOAD_SIZE_LIMITS.profile_photo).toBe(5 * 1024 * 1024);
    });

    it("video limit is 100MB", () => {
      expect(UPLOAD_SIZE_LIMITS.video).toBe(100 * 1024 * 1024);
    });

    it("UPLOAD_ALLOWED_MIME_TYPES includes common image types", () => {
      expect(UPLOAD_ALLOWED_MIME_TYPES).toContain("image/jpeg");
      expect(UPLOAD_ALLOWED_MIME_TYPES).toContain("image/png");
      expect(UPLOAD_ALLOWED_MIME_TYPES).toContain("image/webp");
    });
  });

  describe("notifications", () => {
    it("NOTIFICATION_TYPES contains 7 types", () => {
      expect(NOTIFICATION_TYPES).toHaveLength(7);
    });

    it("DEFAULT_PREFERENCES has an entry for each notification type", () => {
      for (const type of NOTIFICATION_TYPES) {
        expect(DEFAULT_PREFERENCES[type]).toBeDefined();
        expect(typeof DEFAULT_PREFERENCES[type]!.inApp).toBe("boolean");
        expect(typeof DEFAULT_PREFERENCES[type]!.email).toBe("boolean");
        expect(typeof DEFAULT_PREFERENCES[type]!.push).toBe("boolean");
      }
    });

    it("message notifications have all channels enabled by default", () => {
      expect(DEFAULT_PREFERENCES.message).toEqual({ inApp: true, email: true, push: true });
    });
  });
});
