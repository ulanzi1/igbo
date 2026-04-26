// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  PORTAL_NOTIFICATION_CATALOG,
  PORTAL_NOTIFICATION_EVENT_TYPES,
  isSystemCritical,
  isHighPriority,
  isLowPriority,
} from "./notifications";
import type {
  PortalNotificationEventType,
  NotificationPriorityTier,
  PortalNotificationCatalogEntry,
  PortalApplicationSubmittedNotification,
  PortalApplicationStatusChangedNotification,
  PortalApplicationViewedNotification,
  PortalMessageReceivedNotification,
  PortalJobApprovedNotification,
  PortalJobRejectedNotification,
  PortalJobChangesRequestedNotification,
  PortalJobExpiredNotification,
  PortalReferralStatusChangedNotification,
  PortalMatchNewRecommendationsNotification,
  PortalSavedSearchNewResultsNotification,
} from "./notifications";

// ---------------------------------------------------------------------------
// Catalog completeness
// ---------------------------------------------------------------------------

describe("PORTAL_NOTIFICATION_CATALOG", () => {
  it("has exactly 11 entries", () => {
    expect(Object.keys(PORTAL_NOTIFICATION_CATALOG)).toHaveLength(11);
  });

  it("system-critical events are exactly portal.application.submitted and portal.job.rejected (2 entries)", () => {
    const systemCritical = Object.entries(PORTAL_NOTIFICATION_CATALOG)
      .filter(([, entry]) => entry.priorityTier === "system-critical")
      .map(([key]) => key);

    expect(systemCritical).toHaveLength(2);
    expect(systemCritical).toContain("portal.application.submitted");
    expect(systemCritical).toContain("portal.job.rejected");
  });

  it("high-priority events are exactly 7 entries (includes portal.application.viewed)", () => {
    const highPriority = Object.entries(PORTAL_NOTIFICATION_CATALOG)
      .filter(([, entry]) => entry.priorityTier === "high")
      .map(([key]) => key);

    expect(highPriority).toHaveLength(7);
    expect(highPriority).toContain("portal.application.viewed");
    expect(highPriority).toContain("portal.application.status_changed");
    expect(highPriority).toContain("portal.message.received");
    expect(highPriority).toContain("portal.job.approved");
    expect(highPriority).toContain("portal.job.changes_requested");
    expect(highPriority).toContain("portal.job.expired");
    expect(highPriority).toContain("portal.referral.status_changed");
  });

  it("low-priority events are exactly 2 entries", () => {
    const lowPriority = Object.entries(PORTAL_NOTIFICATION_CATALOG)
      .filter(([, entry]) => entry.priorityTier === "low")
      .map(([key]) => key);

    expect(lowPriority).toHaveLength(2);
    expect(lowPriority).toContain("portal.match.new_recommendations");
    expect(lowPriority).toContain("portal.saved_search.new_results");
  });

  it("all system-critical entries have inApp: true, push: true, email: true", () => {
    const systemCritical = Object.values(PORTAL_NOTIFICATION_CATALOG).filter(
      (entry) => entry.priorityTier === "system-critical",
    );

    for (const entry of systemCritical) {
      expect(entry.defaultChannels.inApp).toBe(true);
      expect(entry.defaultChannels.push).toBe(true);
      expect(entry.defaultChannels.email).toBe(true);
    }
  });

  it("low-priority entries have push: false", () => {
    const lowPriority = Object.values(PORTAL_NOTIFICATION_CATALOG).filter(
      (entry) => entry.priorityTier === "low",
    );

    for (const entry of lowPriority) {
      expect(entry.defaultChannels.push).toBe(false);
    }
  });

  it("all entries have a non-empty description", () => {
    for (const [key, entry] of Object.entries(PORTAL_NOTIFICATION_CATALOG)) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
      expect(key).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Reserved flag
// ---------------------------------------------------------------------------

describe("PORTAL_NOTIFICATION_CATALOG — reserved flag", () => {
  it("portal.referral.status_changed has reserved: true (future event — Portal Epic 9)", () => {
    expect(PORTAL_NOTIFICATION_CATALOG["portal.referral.status_changed"].reserved).toBe(true);
  });

  it("portal.match.new_recommendations has reserved: true (future event — Portal Epic 7)", () => {
    expect(PORTAL_NOTIFICATION_CATALOG["portal.match.new_recommendations"].reserved).toBe(true);
  });

  it("portal.application.submitted does NOT have reserved flag (has active emitter)", () => {
    expect(PORTAL_NOTIFICATION_CATALOG["portal.application.submitted"].reserved).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isSystemCritical
// ---------------------------------------------------------------------------

describe("isSystemCritical()", () => {
  it("returns true for portal.application.submitted", () => {
    expect(isSystemCritical("portal.application.submitted")).toBe(true);
  });

  it("returns true for portal.job.rejected", () => {
    expect(isSystemCritical("portal.job.rejected")).toBe(true);
  });

  it("returns false for high-priority event portal.application.status_changed", () => {
    expect(isSystemCritical("portal.application.status_changed")).toBe(false);
  });

  it("returns false for low-priority event portal.match.new_recommendations", () => {
    expect(isSystemCritical("portal.match.new_recommendations")).toBe(false);
  });

  it("returns false for unknown event type string", () => {
    expect(isSystemCritical("portal.nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHighPriority
// ---------------------------------------------------------------------------

describe("isHighPriority()", () => {
  it("returns true for portal.application.status_changed", () => {
    expect(isHighPriority("portal.application.status_changed")).toBe(true);
  });

  it("returns true for portal.application.viewed", () => {
    expect(isHighPriority("portal.application.viewed")).toBe(true);
  });

  it("returns true for portal.message.received", () => {
    expect(isHighPriority("portal.message.received")).toBe(true);
  });

  it("returns false for system-critical event portal.application.submitted", () => {
    expect(isHighPriority("portal.application.submitted")).toBe(false);
  });

  it("returns false for low-priority event portal.saved_search.new_results", () => {
    expect(isHighPriority("portal.saved_search.new_results")).toBe(false);
  });

  it("returns false for unknown event type string", () => {
    expect(isHighPriority("portal.nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLowPriority
// ---------------------------------------------------------------------------

describe("isLowPriority()", () => {
  it("returns true for portal.match.new_recommendations", () => {
    expect(isLowPriority("portal.match.new_recommendations")).toBe(true);
  });

  it("returns true for portal.saved_search.new_results", () => {
    expect(isLowPriority("portal.saved_search.new_results")).toBe(true);
  });

  it("returns false for system-critical event portal.job.rejected", () => {
    expect(isLowPriority("portal.job.rejected")).toBe(false);
  });

  it("returns false for high-priority event portal.message.received", () => {
    expect(isLowPriority("portal.message.received")).toBe(false);
  });

  it("returns false for unknown event type string", () => {
    expect(isLowPriority("portal.nonexistent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PortalNotificationEventType union / runtime array
// ---------------------------------------------------------------------------

const EXPECTED_EVENT_TYPES: PortalNotificationEventType[] = [
  "portal.application.submitted",
  "portal.application.status_changed",
  "portal.application.viewed",
  "portal.message.received",
  "portal.job.approved",
  "portal.job.rejected",
  "portal.job.changes_requested",
  "portal.job.expired",
  "portal.referral.status_changed",
  "portal.match.new_recommendations",
  "portal.saved_search.new_results",
];

describe("PORTAL_NOTIFICATION_EVENT_TYPES runtime array", () => {
  it("has exactly 11 entries matching PortalNotificationEventType union", () => {
    expect(PORTAL_NOTIFICATION_EVENT_TYPES).toHaveLength(11);
    expect(PORTAL_NOTIFICATION_EVENT_TYPES).toHaveLength(EXPECTED_EVENT_TYPES.length);
  });

  it("includes all 11 expected event type strings", () => {
    for (const eventType of EXPECTED_EVENT_TYPES) {
      expect(PORTAL_NOTIFICATION_EVENT_TYPES).toContain(eventType);
    }
  });

  it("catalog keys match the runtime array exactly", () => {
    const catalogKeys = Object.keys(PORTAL_NOTIFICATION_CATALOG).sort();
    const arrayTypes = [...PORTAL_NOTIFICATION_EVENT_TYPES].sort();
    expect(catalogKeys).toEqual(arrayTypes);
  });
});

// ---------------------------------------------------------------------------
// Mutual exclusivity — for every event type, exactly ONE tier function returns true
// ---------------------------------------------------------------------------

describe("priority tier mutual exclusivity", () => {
  it.each(PORTAL_NOTIFICATION_EVENT_TYPES)(
    "%s — exactly one of isSystemCritical/isHighPriority/isLowPriority returns true",
    (eventType) => {
      const critical = isSystemCritical(eventType);
      const high = isHighPriority(eventType);
      const low = isLowPriority(eventType);

      const trueCount = [critical, high, low].filter(Boolean).length;
      expect(trueCount).toBe(1);
    },
  );

  it("unknown event type — all three tier functions return false", () => {
    const unknown = "portal.nonexistent";
    expect(isSystemCritical(unknown)).toBe(false);
    expect(isHighPriority(unknown)).toBe(false);
    expect(isLowPriority(unknown)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TypeScript interface type assertions (compile-time checks)
// ---------------------------------------------------------------------------

describe("PortalNotificationEventType — TypeScript type-level assertions", () => {
  it("PortalNotificationEventType union is assignable from all 11 string literals", () => {
    // If any string literal is wrong, TypeScript compilation fails
    const _types: PortalNotificationEventType[] = EXPECTED_EVENT_TYPES;
    expect(_types).toHaveLength(11);
    void _types;
  });

  it("NotificationPriorityTier type accepts valid tier strings", () => {
    const _systemCritical: NotificationPriorityTier = "system-critical";
    const _high: NotificationPriorityTier = "high";
    const _low: NotificationPriorityTier = "low";
    expect(_systemCritical).toBe("system-critical");
    expect(_high).toBe("high");
    expect(_low).toBe("low");
  });

  it("PortalNotificationCatalogEntry interface accepts valid entry shapes", () => {
    const _entry: PortalNotificationCatalogEntry = {
      priorityTier: "high",
      defaultChannels: { inApp: true, push: false, email: true },
      description: "test",
    };
    expect(_entry.priorityTier).toBe("high");
    void _entry;
  });
});

// ---------------------------------------------------------------------------
// Notification interface type assertions (Tasks 1.1–1.3)
// Each interface must extend BaseEvent — TypeScript compilation validates this
// ---------------------------------------------------------------------------

describe("Portal notification event interfaces — type structure", () => {
  it("PortalApplicationSubmittedNotification includes all required fields", () => {
    const _n: PortalApplicationSubmittedNotification = {
      eventId: "evt-1",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      applicationId: "app-1",
      jobId: "job-1",
      jobTitle: "Engineer",
      seekerUserId: "u-seeker",
      seekerName: "Ada Obi",
      employerUserId: "u-employer",
      companyName: "Igbo Tech",
    };
    expect(_n.applicationId).toBe("app-1");
    expect(_n.seekerName).toBe("Ada Obi");
    void _n;
  });

  it("PortalApplicationStatusChangedNotification includes fromStatus/toStatus", () => {
    const _n: PortalApplicationStatusChangedNotification = {
      eventId: "evt-2",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      applicationId: "app-2",
      jobId: "job-2",
      jobTitle: "Analyst",
      fromStatus: "submitted",
      toStatus: "under_review",
      actorUserId: "u-actor",
      actorRole: "employer",
    };
    expect(_n.fromStatus).toBe("submitted");
    expect(_n.toStatus).toBe("under_review");
    void _n;
  });

  it("PortalApplicationViewedNotification includes seekerUserId and employerUserId", () => {
    const _n: PortalApplicationViewedNotification = {
      eventId: "evt-3",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      applicationId: "app-3",
      jobId: "job-3",
      jobTitle: "Designer",
      seekerUserId: "u-seeker",
      employerUserId: "u-employer",
    };
    expect(_n.seekerUserId).toBe("u-seeker");
    void _n;
  });

  it("PortalMessageReceivedNotification includes messagePreview", () => {
    const _n: PortalMessageReceivedNotification = {
      eventId: "evt-4",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      conversationId: "conv-1",
      applicationId: "app-4",
      jobTitle: "PM",
      senderUserId: "u-sender",
      senderName: "Chike Obi",
      messagePreview: "Hello there...",
    };
    expect(_n.messagePreview).toBe("Hello there...");
    void _n;
  });

  it("PortalJobRejectedNotification includes reason", () => {
    const _n: PortalJobRejectedNotification = {
      eventId: "evt-5",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      jobId: "job-5",
      jobTitle: "SRE",
      companyName: "Igbo Corp",
      employerUserId: "u-emp",
      reason: "Violates guidelines",
    };
    expect(_n.reason).toBe("Violates guidelines");
    void _n;
  });

  it("PortalJobChangesRequestedNotification includes requestedChanges", () => {
    const _n: PortalJobChangesRequestedNotification = {
      eventId: "evt-6",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      jobId: "job-6",
      jobTitle: "DevOps",
      companyName: "Igbo Corp",
      employerUserId: "u-emp",
      requestedChanges: "Please clarify salary range",
    };
    expect(_n.requestedChanges).toBe("Please clarify salary range");
    void _n;
  });

  it("PortalJobExpiredNotification includes expiredAt", () => {
    const _n: PortalJobExpiredNotification = {
      eventId: "evt-7",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      jobId: "job-7",
      jobTitle: "QA",
      companyName: "Igbo Corp",
      employerUserId: "u-emp",
      expiredAt: "2026-05-01T00:00:00.000Z",
    };
    expect(_n.expiredAt).toBe("2026-05-01T00:00:00.000Z");
    void _n;
  });

  it("PortalReferralStatusChangedNotification includes referralId and newStatus", () => {
    const _n: PortalReferralStatusChangedNotification = {
      eventId: "evt-8",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      referralId: "ref-1",
      jobId: "job-8",
      jobTitle: "Accountant",
      referrerUserId: "u-referrer",
      seekerName: "Emeka",
      newStatus: "hired",
    };
    expect(_n.referralId).toBe("ref-1");
    expect(_n.newStatus).toBe("hired");
    void _n;
  });

  it("PortalMatchNewRecommendationsNotification includes jobIds[] and matchScores[]", () => {
    const _n: PortalMatchNewRecommendationsNotification = {
      eventId: "evt-9",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      seekerUserId: "u-seeker",
      jobIds: ["job-1", "job-2"],
      matchScores: [85, 72],
    };
    expect(_n.jobIds).toHaveLength(2);
    expect(_n.matchScores[0]).toBe(85);
    void _n;
  });

  it("PortalSavedSearchNewResultsNotification includes newJobIds[]", () => {
    const _n: PortalSavedSearchNewResultsNotification = {
      eventId: "evt-10",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      savedSearchId: "ss-1",
      seekerUserId: "u-seeker",
      searchName: "Lagos Engineers",
      newJobIds: ["job-a", "job-b"],
    };
    expect(_n.newJobIds).toHaveLength(2);
    void _n;
  });

  it("PortalJobApprovedNotification satisfies base event contract", () => {
    const _n: PortalJobApprovedNotification = {
      eventId: "evt-11",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      jobId: "job-11",
      jobTitle: "Data Scientist",
      companyName: "Igbo Corp",
      employerUserId: "u-emp",
    };
    expect(_n.eventId).toBe("evt-11");
    expect(_n.version).toBe(1);
    void _n;
  });
});
