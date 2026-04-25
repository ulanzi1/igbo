// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPortalEventBusOn = vi.fn();
vi.mock("@/services/event-bus", () => ({
  portalEventBus: { on: mockPortalEventBusOn },
}));

const mockFindUserById = vi.fn();
vi.mock("@igbo/db/queries/auth-queries", () => ({
  findUserById: mockFindUserById,
}));

const mockGetJobPostingById = vi.fn();
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: mockGetJobPostingById,
}));

const mockGetCompanyById = vi.fn();
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: mockGetCompanyById,
}));

const mockCreateNotification = vi.fn();
vi.mock("@igbo/db/queries/notifications", () => ({
  createNotification: mockCreateNotification,
}));

const mockEnqueueEmailJob = vi.fn();
vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: mockEnqueueEmailJob,
}));

// Push service mock
const mockSendPushNotification = vi.fn();
vi.mock("@/services/push-service", () => ({
  sendPushNotification: mockSendPushNotification,
}));

const mockRedisSet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();
const mockRedisPublish = vi.fn();
const mockPipelineExec = vi.fn();
const mockPipeline = vi.fn(() => ({
  incr: mockRedisIncr,
  expire: mockRedisExpire,
  exec: mockPipelineExec,
}));
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    set: mockRedisSet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    publish: mockRedisPublish,
    pipeline: mockPipeline,
  })),
}));

const mockGetSavedSearchById = vi.fn();
vi.mock("@igbo/db/queries/portal-saved-searches", () => ({
  getSavedSearchById: mockGetSavedSearchById,
}));

const mockEvaluateInstantAlert = vi.fn();
const mockCheckInstantAlerts = vi.fn();
vi.mock("@/services/saved-search-service", () => ({
  evaluateInstantAlert: mockEvaluateInstantAlert,
  checkInstantAlerts: mockCheckInstantAlerts,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

type EventName =
  | "application.submitted"
  | "application.withdrawn"
  | "saved_search.new_result"
  | "job.reviewed"
  | "portal.message.sent";

async function getHandler(
  eventName: EventName = "application.submitted",
): Promise<(payload: unknown) => Promise<void>> {
  // Reset HMR guard so the module re-registers
  const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
  global.__portalNotifHandlersRegistered = false;
  mockPortalEventBusOn.mockClear();
  // Re-import to trigger handler registration
  vi.resetModules();
  await import("./notification-service");
  const call = mockPortalEventBusOn.mock.calls.find(([event]) => event === eventName);
  if (!call) throw new Error(`${eventName} handler not registered`);
  return call[1] as (payload: unknown) => Promise<void>;
}

const BASE_PAYLOAD = {
  eventId: "evt-001",
  version: 1,
  timestamp: "2026-04-09T10:00:00.000Z",
  applicationId: "app-123",
  jobId: "job-456",
  seekerUserId: "seeker-789",
  companyId: "company-abc",
  employerUserId: "employer-xyz",
};

describe("notification-service — application.submitted handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: Redis dedup key is new (not already set)
    mockRedisSet.mockResolvedValue("OK");
    mockRedisPublish.mockResolvedValue(1);
    // Default DB data
    mockFindUserById.mockResolvedValue({
      id: "seeker-789",
      email: "seeker@example.com",
      name: "Ada Obi",
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue({ id: "job-456", title: "Senior Engineer" });
    mockGetCompanyById.mockResolvedValue({ id: "company-abc", name: "Igbo Tech" });
    mockCreateNotification.mockResolvedValue({
      id: "notif-1",
      createdAt: new Date("2026-04-09T10:00:00.000Z"),
    });
    mockEnqueueEmailJob.mockImplementation(() => undefined);
  });

  afterEach(() => {
    const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    global.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on application.submitted event", async () => {
    const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    global.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith(
      "application.submitted",
      expect.any(Function),
    );
  });

  it("sends seeker confirmation email", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      `app-confirmed-${BASE_PAYLOAD.applicationId}`,
      expect.objectContaining({
        to: "seeker@example.com",
        templateId: "application-confirmation",
        locale: "en",
        data: expect.objectContaining({
          seekerName: "Ada Obi",
          jobTitle: "Senior Engineer",
          companyName: "Igbo Tech",
        }),
      }),
    );
  });

  it("sends Igbo email when seeker languagePreference is ig", async () => {
    mockFindUserById.mockResolvedValue({
      id: "seeker-789",
      email: "seeker@example.com",
      name: "Emeka Eze",
      languagePreference: "ig",
    });
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ locale: "ig" }),
    );
  });

  it("creates employer in-app notification", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BASE_PAYLOAD.employerUserId,
        type: "system",
        title: expect.stringContaining("Senior Engineer"),
        body: expect.stringContaining("Ada Obi"),
        link: `/admin/applications/${BASE_PAYLOAD.applicationId}`,
      }),
    );
  });

  it("publishes notification.created to Redis after employer notification (real-time delivery)", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockRedisPublish).toHaveBeenCalledWith(
      "eventbus:notification.created",
      expect.stringContaining('"notificationId":"notif-1"'),
    );
    // Verify payload shape
    const publishArg = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(publishArg).toMatchObject({
      notificationId: "notif-1",
      userId: BASE_PAYLOAD.employerUserId,
      type: "system",
      title: expect.stringContaining("Senior Engineer"),
    });
  });

  it("publish failure does not throw (fire-and-forget)", async () => {
    mockRedisPublish.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler();
    await expect(handler(BASE_PAYLOAD)).resolves.not.toThrow();
    // createNotification should still have been called
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("skips email if seeker has no email", async () => {
    mockFindUserById.mockResolvedValue({ id: "seeker-789", email: null, name: "Ada" });
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    // But notification should still be created
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("does not throw when email service fails (error isolation)", async () => {
    mockEnqueueEmailJob.mockImplementation(() => {
      throw new Error("Email service down");
    });
    const handler = await getHandler();
    // Should not throw
    await expect(handler(BASE_PAYLOAD)).resolves.not.toThrow();
  });

  it("creates notification even when email fails (error isolation)", async () => {
    mockEnqueueEmailJob.mockImplementation(() => {
      throw new Error("Email service down");
    });
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("sends email even when notification creation fails (error isolation)", async () => {
    mockCreateNotification.mockRejectedValue(new Error("DB error"));
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalled();
  });

  it("skips processing on dedup key already set (idempotency)", async () => {
    mockRedisSet.mockResolvedValue(null); // null = key already exists
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("processes again for different applicationId (idempotency not cross-app)", async () => {
    mockRedisSet.mockResolvedValue("OK");
    const handler = await getHandler();
    await handler({ ...BASE_PAYLOAD, applicationId: "app-different" });

    expect(mockEnqueueEmailJob).toHaveBeenCalled();
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    // Should still attempt email and notification
    expect(mockEnqueueEmailJob).toHaveBeenCalled();
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("uses fallback values when DB queries return null", async () => {
    mockFindUserById.mockResolvedValue({
      id: "seeker-789",
      email: "seeker@example.com",
      name: null,
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue(null);
    mockGetCompanyById.mockResolvedValue(null);
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New application for Unknown Position",
        body: "from a seeker",
      }),
    );
  });

  it("preserves partial data when one query fails (Promise.allSettled)", async () => {
    // Company query fails, but seeker and posting succeed
    mockGetCompanyById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    // Seeker email should still be sent (seeker data was resolved)
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        to: "seeker@example.com",
        data: expect.objectContaining({
          seekerName: "Ada Obi",
          jobTitle: "Senior Engineer",
          companyName: "Unknown Company", // fallback for failed query
        }),
      }),
    );
    // Employer notification should use resolved job title
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New application for Senior Engineer",
      }),
    );
  });

  it("uses absolute tracking URL from NEXT_PUBLIC_PORTAL_URL", async () => {
    process.env.NEXT_PUBLIC_PORTAL_URL = "https://jobs.igbo.global";
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: expect.objectContaining({
          trackingUrl: "https://jobs.igbo.global/applications",
        }),
      }),
    );
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
  });

  it("falls back to default portal URL when NEXT_PUBLIC_PORTAL_URL not set", async () => {
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: expect.objectContaining({
          trackingUrl: "https://portal.igbo.global/applications",
        }),
      }),
    );
  });

  it("uses same dedup key for both email and notification (single idempotency key)", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledTimes(1);
    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:app-submitted:${BASE_PAYLOAD.applicationId}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("HMR guard prevents duplicate handler registration", async () => {
    const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    global.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    mockPortalEventBusOn.mockClear();

    // Import twice
    await import("./notification-service");
    await import("./notification-service");

    // Handler should only be registered once
    const appSubmittedCalls = mockPortalEventBusOn.mock.calls.filter(
      ([event]) => event === "application.submitted",
    );
    expect(appSubmittedCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// application.withdrawn handler
// ---------------------------------------------------------------------------

const WITHDRAWN_PAYLOAD = {
  eventId: "evt-wd-001",
  version: 1,
  timestamp: "2026-04-09T12:00:00.000Z",
  applicationId: "app-wd-123",
  jobId: "job-wd-456",
  seekerUserId: "seeker-wd-789",
  companyId: "company-wd-abc",
  previousStatus: "submitted",
  newStatus: "withdrawn",
  actorUserId: "seeker-wd-789",
};

describe("notification-service — application.withdrawn handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockRedisPublish.mockResolvedValue(1);
    mockFindUserById.mockResolvedValue({
      id: "seeker-wd-789",
      email: "seeker@example.com",
      name: "Ada Obi",
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue({ id: "job-wd-456", title: "Senior Engineer" });
    mockGetCompanyById.mockResolvedValue({
      id: "company-wd-abc",
      ownerUserId: "employer-wd-xyz",
      name: "Igbo Tech",
    });
    mockCreateNotification.mockResolvedValue({
      id: "notif-wd-1",
      createdAt: new Date("2026-04-09T12:00:00.000Z"),
    });
  });

  afterEach(() => {
    const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    global.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on application.withdrawn event", async () => {
    const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    global.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith(
      "application.withdrawn",
      expect.any(Function),
    );
  });

  it("creates employer in-app notification with correct args", async () => {
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "employer-wd-xyz",
        type: "system",
        title: "A candidate withdrew their application",
        body: "Ada Obi withdrew from Senior Engineer",
        link: `/admin/applications/${WITHDRAWN_PAYLOAD.applicationId}`,
      }),
    );
  });

  it("publishes notification.created to Redis after withdrawn notification", async () => {
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockRedisPublish).toHaveBeenCalledWith(
      "eventbus:notification.created",
      expect.stringContaining('"notificationId":"notif-wd-1"'),
    );
    const publishArg = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(publishArg).toMatchObject({
      notificationId: "notif-wd-1",
      userId: "employer-wd-xyz",
      type: "system",
    });
  });

  it("publish failure for withdrawn does not throw (fire-and-forget)", async () => {
    mockRedisPublish.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("application.withdrawn");
    await expect(handler(WITHDRAWN_PAYLOAD)).resolves.not.toThrow();
  });

  it("uses Redis SET NX dedup key for app-withdrawn", async () => {
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:app-withdrawn:${WITHDRAWN_PAYLOAD.applicationId}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("skips notification if dedup key already set", async () => {
    mockRedisSet.mockResolvedValue(null); // key already exists
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("does not throw when notification creation fails (fire-and-forget)", async () => {
    mockCreateNotification.mockRejectedValue(new Error("DB error"));
    const handler = await getHandler("application.withdrawn");
    await expect(handler(WITHDRAWN_PAYLOAD)).resolves.not.toThrow();
  });

  it("logs warning and skips notification when company has no ownerUserId", async () => {
    mockGetCompanyById.mockResolvedValue({ id: "company-wd-abc", ownerUserId: null, name: "Inc" });
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("logs warning and skips notification when company lookup returns null", async () => {
    mockGetCompanyById.mockResolvedValue(null);
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("creates notification with fallback values when seeker lookup fails", async () => {
    mockFindUserById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "A candidate withdrew from Senior Engineer",
      }),
    );
  });

  it("creates notification with fallback job title when posting lookup fails", async () => {
    mockGetJobPostingById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Ada Obi withdrew from Unknown Position",
      }),
    );
  });
});

// ── saved_search.new_result handler ──────────────────────────────────────────

const SAVED_SEARCH_PAYLOAD = {
  eventId: "evt-ss-001",
  version: 1,
  timestamp: "2026-04-18T10:00:00.000Z",
  savedSearchId: "ss-abc",
  userId: "user-123",
  jobId: "job-456",
  jobTitle: "Senior Engineer",
  searchName: "Lagos Engineers",
};

const MOCK_SAVED_SEARCH = {
  id: "ss-abc",
  userId: "user-123",
  name: "Lagos Engineers",
  searchParamsJson: {},
  alertFrequency: "instant" as const,
  lastAlertedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("notification-service — saved_search.new_result handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSavedSearchById.mockResolvedValue(MOCK_SAVED_SEARCH);
    mockEvaluateInstantAlert.mockResolvedValue(true);
    mockCreateNotification.mockResolvedValue({
      id: "notif-ss-1",
      createdAt: new Date("2026-04-18T10:00:00.000Z"),
    });
    mockRedisPublish.mockResolvedValue(1);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on saved_search.new_result event", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith(
      "saved_search.new_result",
      expect.any(Function),
    );
  });

  it("creates notification when evaluateInstantAlert returns true", async () => {
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockGetSavedSearchById).toHaveBeenCalledWith("ss-abc");
    expect(mockEvaluateInstantAlert).toHaveBeenCalledWith(MOCK_SAVED_SEARCH, {
      id: "job-456",
      title: "Senior Engineer",
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        type: "system",
        title: "New match: Senior Engineer",
      }),
    );
  });

  it("publishes notification.created to Redis after saved-search notification", async () => {
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockRedisPublish).toHaveBeenCalledWith(
      "eventbus:notification.created",
      expect.stringContaining('"notificationId":"notif-ss-1"'),
    );
    const publishArg = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(publishArg).toMatchObject({
      notificationId: "notif-ss-1",
      userId: "user-123",
      type: "system",
    });
  });

  it("publish failure for saved-search does not throw (fire-and-forget)", async () => {
    mockRedisPublish.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("saved_search.new_result");
    await expect(handler(SAVED_SEARCH_PAYLOAD)).resolves.not.toThrow();
  });

  it("skips notification when evaluateInstantAlert returns false", async () => {
    mockEvaluateInstantAlert.mockResolvedValue(false);
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("skips notification when savedSearch not found in DB", async () => {
    mockGetSavedSearchById.mockResolvedValue(null);
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockEvaluateInstantAlert).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("handles createNotification error gracefully", async () => {
    mockCreateNotification.mockRejectedValue(new Error("DB error"));
    const handler = await getHandler("saved_search.new_result");
    await expect(handler(SAVED_SEARCH_PAYLOAD)).resolves.not.toThrow();
  });
});

// ── job.reviewed handler ──────────────────────────────────────────────────────

const JOB_REVIEWED_PAYLOAD = {
  eventId: "evt-jr-001",
  version: 1,
  timestamp: "2026-04-18T10:00:00.000Z",
  jobId: "job-789",
  decision: "approved" as const,
  reviewerId: "admin-1",
  postingId: "job-789",
};

describe("notification-service — job.reviewed handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckInstantAlerts.mockResolvedValue(undefined);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on job.reviewed event", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith("job.reviewed", expect.any(Function));
  });

  it("calls checkInstantAlerts when decision is approved", async () => {
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockCheckInstantAlerts).toHaveBeenCalledWith("job-789");
  });

  it("skips checkInstantAlerts when decision is not approved", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "rejected" });

    expect(mockCheckInstantAlerts).not.toHaveBeenCalled();
  });

  it("handles checkInstantAlerts error gracefully", async () => {
    mockCheckInstantAlerts.mockRejectedValue(new Error("Service error"));
    const handler = await getHandler("job.reviewed");
    await expect(handler(JOB_REVIEWED_PAYLOAD)).resolves.not.toThrow();
  });
});

// ── portal.message.sent handler ───────────────────────────────────────────────

const MSG_PAYLOAD = {
  eventId: "evt-msg-001",
  version: 1,
  timestamp: "2026-04-24T10:00:00.000Z",
  messageId: "msg-111",
  senderId: "sender-aaa",
  recipientId: "recipient-bbb",
  conversationId: "conv-222",
  applicationId: "app-333",
  jobId: "job-444",
  companyId: "company-555",
  jobTitle: "Software Engineer",
  companyName: "Igbo Tech",
  content: "Hello, I wanted to follow up on your application.",
  contentType: "text",
  createdAt: "2026-04-24T10:00:00.000Z",
  senderName: "Chike Obi",
  senderRole: "employer" as const,
  attachments: [],
};

describe("notification-service — portal.message.sent handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: dedup key is new
    mockRedisSet.mockResolvedValue("OK");
    // Default: first message in window — pipeline returns [[null, 1], [null, 1]]
    mockPipelineExec.mockResolvedValue([
      [null, 1],
      [null, 1],
    ]);
    mockRedisIncr.mockReturnThis();
    mockRedisExpire.mockReturnThis();
    mockRedisPublish.mockResolvedValue(1);
    mockCreateNotification.mockResolvedValue({
      id: "notif-msg-1",
      createdAt: new Date("2026-04-24T10:00:00.000Z"),
    });
    mockSendPushNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on portal.message.sent event", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith("portal.message.sent", expect.any(Function));
  });

  it("handler is not registered twice (HMR guard)", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    mockPortalEventBusOn.mockClear();
    await import("./notification-service");
    await import("./notification-service");
    const msgCalls = mockPortalEventBusOn.mock.calls.filter(
      ([event]) => event === "portal.message.sent",
    );
    expect(msgCalls).toHaveLength(1);
  });

  it("creates notification for recipientId", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "recipient-bbb" }),
    );
  });

  it("notification title includes senderName and jobTitle", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Chike Obi sent you a message about Software Engineer",
      }),
    );
  });

  it("notification body — content exactly 50 chars → stored as-is", async () => {
    const content50 = "a".repeat(50);
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, content: content50 });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: content50 }),
    );
  });

  it("notification body — content 51+ chars → truncated to 50 chars", async () => {
    const content51 = "a".repeat(51);
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, content: content51 });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: "a".repeat(50) }),
    );
  });

  it("notification body — empty content → handled gracefully (empty string)", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, content: "" });

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ body: "" }));
  });

  it("notification link is /conversations/applicationId", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ link: `/conversations/${MSG_PAYLOAD.applicationId}` }),
    );
  });

  it("notification type is 'message'", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message" }),
    );
  });

  it("self-exclusion — when recipientId === senderId, createNotification is NOT called", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, recipientId: MSG_PAYLOAD.senderId });

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("dedup — second event with same messageId is skipped (atomic SET NX returns null)", async () => {
    mockRedisSet.mockResolvedValue(null); // key already exists
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("dedup — uses atomic SET NX EX (single command)", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:msg:${MSG_PAYLOAD.messageId}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("dedup — Redis unavailable → proceeds with notification anyway (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("throttle — first message creates notification (pipeline INCR returns 1); EXPIRE piped atomically", async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 1],
      [null, 1],
    ]);
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalled();
    // Pipeline should include both incr and expire
    expect(mockRedisIncr).toHaveBeenCalledWith(
      `portal:throttle:msg:${MSG_PAYLOAD.senderId}:${MSG_PAYLOAD.recipientId}:${MSG_PAYLOAD.applicationId}`,
    );
    expect(mockRedisExpire).toHaveBeenCalledWith(
      `portal:throttle:msg:${MSG_PAYLOAD.senderId}:${MSG_PAYLOAD.recipientId}:${MSG_PAYLOAD.applicationId}`,
      30,
    );
  });

  it("throttle — second message within 30s window is suppressed (pipeline INCR returns 2)", async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 2],
      [null, 1],
    ]);
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("throttle — message after window expiry creates new notification (pipeline INCR returns 1 again)", async () => {
    mockPipelineExec.mockResolvedValue([
      [null, 1],
      [null, 1],
    ]); // window expired, fresh counter
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("throttle — two different senders to same recipient within 30s both create notifications", async () => {
    // Throttle keys differ by senderId — separate windows
    mockPipelineExec.mockResolvedValue([
      [null, 1],
      [null, 1],
    ]);
    const handler = await getHandler("portal.message.sent");

    await handler(MSG_PAYLOAD); // sender-aaa
    await handler({ ...MSG_PAYLOAD, senderId: "sender-ccc", messageId: "msg-222" }); // sender-ccc

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it("createNotification failure is logged but does not throw (fire-and-forget)", async () => {
    mockCreateNotification.mockRejectedValue(new Error("DB error"));
    const handler = await getHandler("portal.message.sent");
    await expect(handler(MSG_PAYLOAD)).resolves.not.toThrow();
    // Push must NOT be called when in-app notification creation failed
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("senderName is null → notification uses 'Someone' fallback", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, senderName: undefined });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Someone sent you a message about Software Engineer",
      }),
    );
  });

  it("after createNotification, publishes notification.created to Redis eventbus:notification.created channel", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockRedisPublish).toHaveBeenCalledWith(
      "eventbus:notification.created",
      expect.stringContaining('"notificationId":"notif-msg-1"'),
    );
    const publishArg = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(publishArg).toMatchObject({
      notificationId: "notif-msg-1",
      userId: "recipient-bbb",
      type: "message",
    });
  });

  it("Redis publish failure is logged but does not throw (fire-and-forget)", async () => {
    mockRedisPublish.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("portal.message.sent");
    await expect(handler(MSG_PAYLOAD)).resolves.not.toThrow();
    // createNotification should still have been called
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("push notification is called after in-app notification", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    // sendPushNotification is called (fire-and-forget)
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      "recipient-bbb",
      expect.objectContaining({
        tag: `msg:${MSG_PAYLOAD.applicationId}`,
      }),
    );
  });

  it("push notification failure does not affect in-app notification", async () => {
    mockSendPushNotification.mockRejectedValue(new Error("Push failed"));
    const handler = await getHandler("portal.message.sent");
    await expect(handler(MSG_PAYLOAD)).resolves.not.toThrow();
    // in-app notification should still be created
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("does NOT call enqueueEmailJob (email is intentionally OFF for messages)", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("senderName contains multibyte Igbo characters → content truncation does not corrupt", async () => {
    // Igbo content with multi-byte chars — slice(0, 50) is safe for ASCII-range Igbo
    const igboContent = "Ọzụzụ ọrụ dị mma, anyị ga-eme ihe niile ka ị nwee ọrụ ọma nke ukwuu!";
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, content: igboContent });

    const truncated = igboContent.slice(0, 50);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: truncated }),
    );
  });
});
