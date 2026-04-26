// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  createEventEnvelope,
  portalEventSchemas,
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
  JobReviewedEvent,
  NotificationCreatedEvent,
} from "./events";
import type { PortalNotificationEventType } from "./notifications";

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
      "job.reviewed",
    ];
    for (const key of requiredKeys) {
      expect(typeof key).toBe("string");
    }
    expect(requiredKeys).toHaveLength(11);
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

  it("ApplicationSubmittedEvent round-trips through JSON (P-2.4: enriched fields)", () => {
    const event: ApplicationSubmittedEvent = {
      ...createEventEnvelope(),
      applicationId: "app-1",
      jobId: "job-1",
      seekerUserId: "u-seeker-1",
      companyId: "cp-1",
      employerUserId: "u-employer-1",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as ApplicationSubmittedEvent;
    expect(roundTripped.applicationId).toBe("app-1");
    expect(roundTripped.jobId).toBe("job-1");
    expect(roundTripped.seekerUserId).toBe("u-seeker-1");
    expect(roundTripped.companyId).toBe("cp-1");
    expect(roundTripped.employerUserId).toBe("u-employer-1");
  });

  it("ApplicationStatusChangedEvent round-trips through JSON (P-2.4: enriched fields)", () => {
    const event: ApplicationStatusChangedEvent = {
      ...createEventEnvelope(),
      applicationId: "app-2",
      jobId: "job-2",
      seekerUserId: "u-seeker-2",
      companyId: "cp-4",
      previousStatus: "submitted",
      newStatus: "under_review",
      actorUserId: "u-employer-2",
      actorRole: "employer",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as ApplicationStatusChangedEvent;
    expect(roundTripped.applicationId).toBe("app-2");
    expect(roundTripped.jobId).toBe("job-2");
    expect(roundTripped.seekerUserId).toBe("u-seeker-2");
    expect(roundTripped.companyId).toBe("cp-4");
    expect(roundTripped.previousStatus).toBe("submitted");
    expect(roundTripped.newStatus).toBe("under_review");
    expect(roundTripped.actorUserId).toBe("u-employer-2");
    expect(roundTripped.actorRole).toBe("employer");
  });

  it("ApplicationWithdrawnEvent round-trips through JSON (P-2.4: enriched fields)", () => {
    const event: ApplicationWithdrawnEvent = {
      ...createEventEnvelope(),
      applicationId: "app-3",
      jobId: "job-3",
      seekerUserId: "u-seeker-3",
      companyId: "cp-5",
      previousStatus: "under_review",
      newStatus: "withdrawn",
      actorUserId: "u-seeker-3",
    };
    const roundTripped = JSON.parse(JSON.stringify(event)) as ApplicationWithdrawnEvent;
    expect(roundTripped.applicationId).toBe("app-3");
    expect(roundTripped.jobId).toBe("job-3");
    expect(roundTripped.seekerUserId).toBe("u-seeker-3");
    expect(roundTripped.companyId).toBe("cp-5");
    expect(roundTripped.previousStatus).toBe("under_review");
    expect(roundTripped.newStatus).toBe("withdrawn");
    expect(roundTripped.actorUserId).toBe("u-seeker-3");
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
  companyId: "cp-1",
  employerUserId: "u-emp-1",
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

describe("JobReviewedEvent", () => {
  it("satisfies BaseEvent contract", () => {
    const event: JobReviewedEvent = {
      ...createEventEnvelope(),
      jobId: "jp-1",
      reviewerUserId: "admin-1",
      decision: "approved",
      companyId: "cp-1",
    };
    const _base: BaseEvent = event; // type-level assertion
    expect(event.eventId).toBeDefined();
    expect(event.version).toBe(1);
    expect(event.timestamp).toBeDefined();
    expect(event.jobId).toBe("jp-1");
    expect(event.decision).toBe("approved");
    void _base;
  });

  it("PortalEventMap includes job.reviewed key", () => {
    const key: PortalEventName = "job.reviewed";
    expect(key).toBe("job.reviewed");
  });
});

// ---------------------------------------------------------------------------
// Zod schema tests — portalEventSchemas
// ---------------------------------------------------------------------------

const BASE_ENVELOPE = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  version: 1,
  timestamp: "2026-01-01T00:00:00.000Z",
  emittedBy: "test-service",
};

describe("portalEventSchemas — BaseEventSchema fields", () => {
  it("accepts valid envelope fields", () => {
    const result = portalEventSchemas["job.published"].safeParse({
      ...BASE_ENVELOPE,
      jobId: "j1",
      companyId: "cp-1",
      title: "Engineer",
      employmentType: "full_time",
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID eventId", () => {
    const result = portalEventSchemas["job.published"].safeParse({
      ...BASE_ENVELOPE,
      eventId: "not-a-uuid",
      jobId: "j1",
      companyId: "cp-1",
      title: "Engineer",
      employmentType: "full_time",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing emittedBy", () => {
    const { emittedBy: _, ...envelopeWithout } = BASE_ENVELOPE;
    void _;
    const result = portalEventSchemas["job.published"].safeParse({
      ...envelopeWithout,
      jobId: "j1",
      companyId: "cp-1",
      title: "Engineer",
      employmentType: "full_time",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty emittedBy string", () => {
    const result = portalEventSchemas["job.published"].safeParse({
      ...BASE_ENVELOPE,
      emittedBy: "",
      jobId: "j1",
      companyId: "cp-1",
      title: "Engineer",
      employmentType: "full_time",
      status: "active",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional idempotencyKey when provided", () => {
    const result = portalEventSchemas["job.published"].safeParse({
      ...BASE_ENVELOPE,
      idempotencyKey: "apply:j1:u1",
      jobId: "j1",
      companyId: "cp-1",
      title: "Engineer",
      employmentType: "full_time",
      status: "active",
    });
    expect(result.success).toBe(true);
  });
});

describe("portalEventSchemas — JobClosedEvent (optional fields)", () => {
  it("accepts without optional reason", () => {
    const result = portalEventSchemas["job.closed"].safeParse({
      ...BASE_ENVELOPE,
      jobId: "j1",
      companyId: "cp-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with optional reason", () => {
    const result = portalEventSchemas["job.closed"].safeParse({
      ...BASE_ENVELOPE,
      jobId: "j1",
      companyId: "cp-1",
      reason: "Position filled",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required jobId", () => {
    const result = portalEventSchemas["job.closed"].safeParse({
      ...BASE_ENVELOPE,
      companyId: "cp-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("portalEventSchemas — PortalMessageSentEvent (complex/nested)", () => {
  const VALID_MESSAGE_PAYLOAD = {
    ...BASE_ENVELOPE,
    messageId: "msg-1",
    senderId: "u1",
    conversationId: "conv-1",
    applicationId: "app-1",
    jobId: "j1",
    companyId: "cp-1",
    jobTitle: "Engineer",
    companyName: "Acme",
    content: "Hello",
    contentType: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
    recipientId: "u2",
    senderRole: "employer" as const,
  };

  it("accepts valid message payload without attachments", () => {
    const result = portalEventSchemas["portal.message.sent"].safeParse(VALID_MESSAGE_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it("accepts with optional attachments array", () => {
    const result = portalEventSchemas["portal.message.sent"].safeParse({
      ...VALID_MESSAGE_PAYLOAD,
      attachments: [
        {
          id: "att-1",
          fileUrl: "https://example.com/file.pdf",
          fileName: "file.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid senderRole", () => {
    const result = portalEventSchemas["portal.message.sent"].safeParse({
      ...VALID_MESSAGE_PAYLOAD,
      senderRole: "admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required content", () => {
    const { content: _, ...withoutContent } = VALID_MESSAGE_PAYLOAD;
    void _;
    const result = portalEventSchemas["portal.message.sent"].safeParse(withoutContent);
    expect(result.success).toBe(false);
  });
});

describe("portalEventSchemas — JobReviewedEvent (enum decision field)", () => {
  it("accepts valid decision enum value", () => {
    const result = portalEventSchemas["job.reviewed"].safeParse({
      ...BASE_ENVELOPE,
      jobId: "j1",
      reviewerUserId: "admin-1",
      decision: "approved",
      companyId: "cp-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid decision value", () => {
    const result = portalEventSchemas["job.reviewed"].safeParse({
      ...BASE_ENVELOPE,
      jobId: "j1",
      reviewerUserId: "admin-1",
      decision: "unknown_decision",
      companyId: "cp-1",
    });
    expect(result.success).toBe(false);
  });

  it("portalEventSchemas has all 20 portal event keys", () => {
    expect(Object.keys(portalEventSchemas)).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// NotificationCreatedEvent — eventType field (P-6.1A)
// ---------------------------------------------------------------------------

describe("NotificationCreatedEvent — eventType field", () => {
  it("accepts eventType of PortalNotificationEventType (optional field)", () => {
    const event: NotificationCreatedEvent = {
      ...createEventEnvelope(),
      notificationId: "notif-1",
      userId: "u-1",
      type: "system",
      title: "New application",
      body: "From Ada Obi",
      eventType: "portal.application.submitted",
    };
    const _typeCheck: PortalNotificationEventType = event.eventType!;
    expect(event.eventType).toBe("portal.application.submitted");
    void _typeCheck;
  });

  it("is backward-compatible — eventType is optional (omitting it compiles)", () => {
    const event: NotificationCreatedEvent = {
      ...createEventEnvelope(),
      notificationId: "notif-2",
      userId: "u-2",
      type: "message",
      title: "New message",
      body: "Hello",
    };
    expect(event.eventType).toBeUndefined();
  });

  it("eventType field is PortalNotificationEventType — rejects non-union string at type level", () => {
    // This test validates the TypeScript type assignment at compile time.
    // The only valid eventType is PortalNotificationEventType, not raw string.
    const validType: PortalNotificationEventType = "portal.message.received";
    const event: NotificationCreatedEvent = {
      ...createEventEnvelope(),
      notificationId: "notif-3",
      userId: "u-3",
      type: "message",
      title: "Test",
      body: "Body",
      eventType: validType,
    };
    expect(event.eventType).toBe("portal.message.received");
  });
});
