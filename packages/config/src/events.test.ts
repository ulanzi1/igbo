// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createEventEnvelope,
  PORTAL_CROSS_APP_EVENTS,
  COMMUNITY_CROSS_APP_EVENTS,
  EVENT_DEDUP_KEY,
  EVENT_DEDUP_TTL_SECONDS,
} from "./events";
import type {
  BaseEvent,
  PortalEventMap,
  PortalEventName,
  PortalAllEventMap,
  PortalAllEventName,
  CommunityCrossAppEventMap,
  JobPublishedEvent,
  JobUpdatedEvent,
  JobClosedEvent,
  JobExpiredEvent,
  JobExpiryWarningEvent,
  ApplicationSubmittedEvent,
  ApplicationStatusChangedEvent,
  ApplicationWithdrawnEvent,
  JobViewedEvent,
  JobSharedToCommunityEvent,
} from "./events";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("BaseEvent", () => {
  it("requires eventId, version, and timestamp fields", () => {
    const envelope = createEventEnvelope();
    const _typeCheck: BaseEvent = envelope; // type-level assertion
    expect(typeof envelope.eventId).toBe("string");
    expect(typeof envelope.version).toBe("number");
    expect(typeof envelope.timestamp).toBe("string");
  });
});

describe("createEventEnvelope", () => {
  it("returns valid UUID eventId", () => {
    const { eventId } = createEventEnvelope();
    expect(eventId).toMatch(UUID_REGEX);
  });

  it("returns version 1 by default", () => {
    const { version } = createEventEnvelope();
    expect(version).toBe(1);
  });

  it("returns version 2 when explicitly requested", () => {
    const { version } = createEventEnvelope(2);
    expect(version).toBe(2);
  });

  it("returns ISO 8601 timestamp", () => {
    const { timestamp } = createEventEnvelope();
    expect(timestamp).toMatch(ISO_8601_REGEX);
  });

  it("generates unique eventIds on each call", () => {
    const a = createEventEnvelope();
    const b = createEventEnvelope();
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe("PortalEventMap keys", () => {
  it("includes all required portal events (including P-1.7 analytics events)", () => {
    // TypeScript compile-time check — verified via type assertions below
    const requiredKeys: PortalEventName[] = [
      "job.published",
      "job.updated",
      "job.closed",
      "job.expired",
      "job.expiry_warning",
      "application.submitted",
      "application.status_changed",
      "application.withdrawn",
      "job.viewed",
      "job.shared_to_community",
    ];
    for (const key of requiredKeys) {
      expect(typeof key).toBe("string");
    }
    expect(requiredKeys).toHaveLength(10);
  });

  it("job.expired and job.expiry_warning are NOT in PORTAL_CROSS_APP_EVENTS (employer-only events)", () => {
    expect(PORTAL_CROSS_APP_EVENTS).not.toContain("job.expired");
    expect(PORTAL_CROSS_APP_EVENTS).not.toContain("job.expiry_warning");
  });
});

describe("PORTAL_CROSS_APP_EVENTS", () => {
  it("entries are valid PortalEventName values", () => {
    const valid: PortalEventName[] = [
      "job.published",
      "job.updated",
      "job.closed",
      "application.submitted",
      "application.status_changed",
      "application.withdrawn",
    ];
    for (const event of PORTAL_CROSS_APP_EVENTS) {
      expect(valid).toContain(event);
    }
  });

  it("contains job.published, application.submitted, and application.status_changed", () => {
    expect(PORTAL_CROSS_APP_EVENTS).toContain("job.published");
    expect(PORTAL_CROSS_APP_EVENTS).toContain("application.submitted");
    expect(PORTAL_CROSS_APP_EVENTS).toContain("application.status_changed");
  });
});

describe("COMMUNITY_CROSS_APP_EVENTS", () => {
  it("entries are known community event names", () => {
    expect(COMMUNITY_CROSS_APP_EVENTS).toContain("user.verified");
    expect(COMMUNITY_CROSS_APP_EVENTS).toContain("user.role_changed");
    expect(COMMUNITY_CROSS_APP_EVENTS).toContain("user.suspended");
  });

  it("has exactly 3 entries", () => {
    expect(COMMUNITY_CROSS_APP_EVENTS).toHaveLength(3);
  });
});

describe("Serialization contract", () => {
  it("JobPublishedEvent round-trips through JSON without data loss", () => {
    const event: JobPublishedEvent = {
      ...createEventEnvelope(),
      jobId: "job-123",
      companyId: "cp-1",
      title: "Software Engineer",
      employmentType: "full_time",
      status: "active",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as JobPublishedEvent;
    expect(roundTripped.eventId).toBe(event.eventId);
    expect(roundTripped.version).toBe(event.version);
    expect(roundTripped.timestamp).toBe(event.timestamp);
    expect(roundTripped.jobId).toBe("job-123");
    expect(roundTripped.companyId).toBe("cp-1");
    expect(roundTripped.title).toBe("Software Engineer");
    expect(roundTripped.employmentType).toBe("full_time");
    expect(roundTripped.status).toBe("active");
  });

  it("JobUpdatedEvent round-trips through JSON", () => {
    const event: JobUpdatedEvent = {
      ...createEventEnvelope(),
      jobId: "job-456",
      companyId: "cp-2",
      changes: { title: "New Title" },
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as JobUpdatedEvent;
    expect(roundTripped.jobId).toBe("job-456");
    expect(roundTripped.companyId).toBe("cp-2");
    expect(roundTripped.changes).toEqual({ title: "New Title" });
  });

  it("JobClosedEvent round-trips through JSON", () => {
    const event: JobClosedEvent = {
      ...createEventEnvelope(),
      jobId: "job-789",
      companyId: "cp-3",
      reason: "Position filled",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as JobClosedEvent;
    expect(roundTripped.jobId).toBe("job-789");
    expect(roundTripped.companyId).toBe("cp-3");
    expect(roundTripped.reason).toBe("Position filled");
  });

  it("JobClosedEvent round-trips without optional reason", () => {
    const event: JobClosedEvent = {
      ...createEventEnvelope(),
      jobId: "job-790",
      companyId: "cp-3",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as JobClosedEvent;
    expect(roundTripped.jobId).toBe("job-790");
    expect(roundTripped.reason).toBeUndefined();
  });

  it("ApplicationSubmittedEvent round-trips through JSON", () => {
    const event: ApplicationSubmittedEvent = {
      ...createEventEnvelope(),
      applicationId: "app-1",
      jobId: "job-1",
      seekerUserId: "u-seeker-1",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as ApplicationSubmittedEvent;
    expect(roundTripped.applicationId).toBe("app-1");
    expect(roundTripped.jobId).toBe("job-1");
    expect(roundTripped.seekerUserId).toBe("u-seeker-1");
  });

  it("ApplicationStatusChangedEvent round-trips through JSON", () => {
    const event: ApplicationStatusChangedEvent = {
      ...createEventEnvelope(),
      applicationId: "app-2",
      seekerUserId: "u-seeker-2",
      companyId: "cp-4",
      previousStatus: "submitted",
      newStatus: "under_review",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as ApplicationStatusChangedEvent;
    expect(roundTripped.applicationId).toBe("app-2");
    expect(roundTripped.seekerUserId).toBe("u-seeker-2");
    expect(roundTripped.companyId).toBe("cp-4");
    expect(roundTripped.previousStatus).toBe("submitted");
    expect(roundTripped.newStatus).toBe("under_review");
  });

  it("ApplicationWithdrawnEvent round-trips through JSON", () => {
    const event: ApplicationWithdrawnEvent = {
      ...createEventEnvelope(),
      applicationId: "app-3",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as ApplicationWithdrawnEvent;
    expect(roundTripped.applicationId).toBe("app-3");
  });

  it("JobExpiredEvent round-trips through JSON", () => {
    const event: JobExpiredEvent = {
      ...createEventEnvelope(),
      jobId: "job-exp-1",
      companyId: "cp-5",
      title: "Expired Role",
      employerUserId: "user-emp-1",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as JobExpiredEvent;
    expect(roundTripped.jobId).toBe("job-exp-1");
    expect(roundTripped.companyId).toBe("cp-5");
    expect(roundTripped.title).toBe("Expired Role");
    expect(roundTripped.employerUserId).toBe("user-emp-1");
  });

  it("JobExpiryWarningEvent round-trips through JSON", () => {
    const event: JobExpiryWarningEvent = {
      ...createEventEnvelope(),
      jobId: "job-warn-1",
      companyId: "cp-6",
      title: "Expiring Role",
      employerUserId: "user-emp-2",
      expiresAt: "2026-05-01T00:00:00.000Z",
      daysRemaining: 3,
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as JobExpiryWarningEvent;
    expect(roundTripped.jobId).toBe("job-warn-1");
    expect(roundTripped.expiresAt).toBe("2026-05-01T00:00:00.000Z");
    expect(roundTripped.daysRemaining).toBe(3);
  });
});

describe("EVENT_DEDUP_KEY", () => {
  it('returns "event:dedup:{eventId}"', () => {
    expect(EVENT_DEDUP_KEY("abc")).toBe("event:dedup:abc");
  });

  it("works with UUID eventIds", () => {
    const eventId = "550e8400-e29b-41d4-a716-446655440000";
    expect(EVENT_DEDUP_KEY(eventId)).toBe(`event:dedup:${eventId}`);
  });
});

describe("EVENT_DEDUP_TTL_SECONDS", () => {
  it("is 86400 (24 hours)", () => {
    expect(EVENT_DEDUP_TTL_SECONDS).toBe(86400);
  });
});

describe("CommunityCrossAppEventMap", () => {
  it("includes user.verified, user.role_changed, user.suspended", () => {
    // Type-level assertions — compilation success = passing
    const _verified: CommunityCrossAppEventMap["user.verified"] = {
      ...createEventEnvelope(),
      userId: "u1",
    };
    const _roleChanged: CommunityCrossAppEventMap["user.role_changed"] = {
      ...createEventEnvelope(),
      userId: "u1",
    };
    const _suspended: CommunityCrossAppEventMap["user.suspended"] = {
      ...createEventEnvelope(),
      userId: "u1",
    };
    void _verified;
    void _roleChanged;
    void _suspended;
    expect(true).toBe(true);
  });
});

describe("PortalAllEventMap", () => {
  it("includes both portal and community cross-app events", () => {
    // Type-level: PortalAllEventName includes portal + community events
    const portalEvent: PortalAllEventName = "job.published";
    const communityEvent: PortalAllEventName = "user.verified";
    expect(typeof portalEvent).toBe("string");
    expect(typeof communityEvent).toBe("string");
  });

  it("PortalAllEventMap[community event] has userId field", () => {
    const event: PortalAllEventMap["user.verified"] = {
      ...createEventEnvelope(),
      userId: "u1",
    };
    expect(event.userId).toBe("u1");
    expect(event.eventId).toBeDefined();
  });
});

// Type-level test: PortalEventMap type structure
// These compile-time assertions confirm the type system is correct
const _jobPublished: PortalEventMap["job.published"] = {
  ...createEventEnvelope(),
  jobId: "j1",
  companyId: "cp-1",
  title: "Engineer",
  employmentType: "full_time",
  status: "active",
};
const _appSubmitted: PortalEventMap["application.submitted"] = {
  ...createEventEnvelope(),
  applicationId: "a1",
  jobId: "j1",
  seekerUserId: "u1",
};
// Suppress "unused variable" lint errors
void _jobPublished;
void _appSubmitted;

describe("JobViewedEvent", () => {
  it("satisfies BaseEvent contract", () => {
    const event: JobViewedEvent = {
      ...createEventEnvelope(),
      jobId: "jp-1",
      userId: "user-1",
      isNewView: true,
    };
    const _base: BaseEvent = event; // type-level assertion
    expect(event.eventId).toBeDefined();
    expect(event.version).toBe(1);
    expect(event.jobId).toBe("jp-1");
    expect(event.isNewView).toBe(true);
    void _base;
  });

  it("PortalEventMap includes job.viewed key", () => {
    const key: PortalEventName = "job.viewed";
    expect(key).toBe("job.viewed");
  });
});

describe("JobSharedToCommunityEvent", () => {
  it("satisfies BaseEvent contract", () => {
    const event: JobSharedToCommunityEvent = {
      ...createEventEnvelope(),
      jobId: "jp-1",
      companyId: "cp-1",
      communityPostId: "comm-post-1",
      employerUserId: "user-emp-1",
    };
    const _base: BaseEvent = event; // type-level assertion
    expect(event.eventId).toBeDefined();
    expect(event.communityPostId).toBe("comm-post-1");
    expect(event.employerUserId).toBe("user-emp-1");
    void _base;
  });

  it("PortalEventMap includes job.shared_to_community key", () => {
    const key: PortalEventName = "job.shared_to_community";
    expect(key).toBe("job.shared_to_community");
  });
});
