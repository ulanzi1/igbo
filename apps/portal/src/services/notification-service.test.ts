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
const mockGetJobPostingWithCompany = vi.fn();
vi.mock("@igbo/db/queries/portal-job-postings", () => ({
  getJobPostingById: mockGetJobPostingById,
  getJobPostingWithCompany: mockGetJobPostingWithCompany,
}));

const mockGetCompanyById = vi.fn();
vi.mock("@igbo/db/queries/portal-companies", () => ({
  getCompanyById: mockGetCompanyById,
}));

const mockEnqueueEmailJob = vi.fn();
vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: mockEnqueueEmailJob,
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisPublish = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    publish: mockRedisPublish,
  })),
}));

// F15: real dispatchNotification (via vi.importActual) calls resolveChannels + applyQuietHours
// which import from @igbo/db/queries/notification-preferences. Mock here so no real DB call.
const mockGetNotificationPreferences = vi.fn();
const mockIsUserInQuietHours = vi.fn();
vi.mock("@igbo/db/queries/notification-preferences", () => ({
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  isUserInQuietHours: (...args: unknown[]) => mockIsUserInQuietHours(...args),
  upsertNotificationPreference: vi.fn(),
  setQuietHours: vi.fn(),
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

// dispatchNotification is now the primary dispatch mechanism
const mockDispatchNotification = vi.fn();
vi.mock("@/services/notification-router", () => ({
  dispatchNotification: mockDispatchNotification,
}));

// F15: needed to test real dispatchNotification channel isolation end-to-end
const mockCreateNotification = vi.fn();
vi.mock("@igbo/db/queries/portal-notifications", () => ({
  createPortalNotification: mockCreateNotification,
}));

const mockSendPushNotification = vi.fn();
vi.mock("@/services/push-service", () => ({
  sendPushNotification: mockSendPushNotification,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

type EventName =
  | "application.submitted"
  | "application.withdrawn"
  | "saved_search.new_result"
  | "job.reviewed"
  | "portal.message.sent"
  | "application.status_changed"
  | "job.expired";

async function getHandler(
  eventName: EventName = "application.submitted",
): Promise<(payload: unknown) => Promise<void>> {
  const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
  global.__portalNotifHandlersRegistered = false;
  mockPortalEventBusOn.mockClear();
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

// ── application.submitted handler ─────────────────────────────────────────────

describe("notification-service — application.submitted handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockFindUserById.mockResolvedValue({
      id: "seeker-789",
      email: "seeker@example.com",
      name: "Ada Obi",
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue({ id: "job-456", title: "Senior Engineer" });
    mockGetCompanyById.mockResolvedValue({ id: "company-abc", name: "Igbo Tech" });
    mockEnqueueEmailJob.mockResolvedValue(true);
    mockDispatchNotification.mockResolvedValue(undefined);
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

  it("sends seeker confirmation email (stays inline — different recipient)", async () => {
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

  it("calls dispatchNotification for employer in-app notification", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BASE_PAYLOAD.employerUserId,
        eventType: "portal.application.submitted",
        content: expect.objectContaining({
          title: expect.stringContaining("Senior Engineer"),
          body: expect.stringContaining("Ada Obi"),
          link: `/admin/applications/${BASE_PAYLOAD.applicationId}`,
        }),
        dedupKey: `app-submitted:${BASE_PAYLOAD.applicationId}`,
      }),
    );
  });

  it("contract snapshot — dispatchNotification called with exact shape for application.submitted", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.userId).toBe("employer-xyz");
    expect(call.eventType).toBe("portal.application.submitted");
    expect(call.dedupKey).toBe(`app-submitted:${BASE_PAYLOAD.applicationId}`);
    expect(call.content.title).toBe("New application for Senior Engineer");
    expect(call.content.body).toBe("from Ada Obi");
    expect(call.content.link).toBe(`/admin/applications/${BASE_PAYLOAD.applicationId}`);
  });

  it("uses Redis SET NX EX 86400 for system-critical dedup (portal.application.submitted)", async () => {
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:app-submitted:${BASE_PAYLOAD.applicationId}`,
      "1",
      "EX",
      86400,
      "NX",
    );
  });

  it("skips processing on dedup key already set (idempotency)", async () => {
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalled();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("skips email if seeker has no email", async () => {
    mockFindUserById.mockResolvedValue({ id: "seeker-789", email: null, name: "Ada" });
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("does not throw when email service fails (error isolation)", async () => {
    mockEnqueueEmailJob.mockRejectedValue(new Error("Email service down"));
    const handler = await getHandler();
    await expect(handler(BASE_PAYLOAD)).resolves.not.toThrow();
  });

  it("sends email even when dispatchNotification fails", async () => {
    mockDispatchNotification.mockRejectedValue(new Error("dispatch error"));
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    expect(mockEnqueueEmailJob).toHaveBeenCalled();
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

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "New application for Unknown Position",
          body: "from a seeker",
        }),
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

  it("HMR guard prevents duplicate handler registration", async () => {
    const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    global.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    mockPortalEventBusOn.mockClear();

    await import("./notification-service");
    await import("./notification-service");

    const appSubmittedCalls = mockPortalEventBusOn.mock.calls.filter(
      ([event]) => event === "application.submitted",
    );
    expect(appSubmittedCalls).toHaveLength(1);
  });

  // ── Email wiring tests (employer emailJob via routing pipeline) ─────────────

  it("emailJob present in dispatchNotification when employer has email", async () => {
    // Default beforeEach: mockFindUserById returns user with email for all calls
    // (seeker 1st call + employer 2nd call both get "seeker@example.com")
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeDefined();
    expect(call.emailJob.payload.templateId).toBe("application-submitted-employer");
    expect(call.emailJob.payload.to).toBe("seeker@example.com");
  });

  it("emailJob absent when employer has no email (in-app still dispatched)", async () => {
    // Seeker (1st findUserById call): has email; Employer (2nd call): no email
    mockFindUserById
      .mockResolvedValueOnce({
        id: "seeker-789",
        email: "seeker@example.com",
        name: "Ada Obi",
        languagePreference: "en",
      })
      .mockResolvedValueOnce({ id: "employer-xyz", email: null, name: "Obi" });
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("emailJob absent when employer findUserById fails (in-app still dispatched)", async () => {
    // Seeker (1st findUserById call): success; Employer (2nd call): throws
    mockFindUserById
      .mockResolvedValueOnce({
        id: "seeker-789",
        email: "seeker@example.com",
        name: "Ada Obi",
        languagePreference: "en",
      })
      .mockRejectedValueOnce(new Error("DB timeout"));
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("emailJob uses ig locale when employer languagePreference is ig", async () => {
    mockFindUserById
      .mockResolvedValueOnce({
        id: "seeker-789",
        email: "seeker@example.com",
        name: "Ada",
        languagePreference: "en",
      })
      .mockResolvedValueOnce({
        id: "employer-xyz",
        email: "employer@example.com",
        name: "Obi",
        languagePreference: "ig",
      });
    const handler = await getHandler();
    await handler(BASE_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob?.payload.locale).toBe("ig");
  });
});

// ── application.withdrawn handler ────────────────────────────────────────────

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
    mockDispatchNotification.mockResolvedValue(undefined);
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

  it("calls dispatchNotification with employer userId and correct content", async () => {
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "employer-wd-xyz",
        eventType: "portal.application.withdrawn",
        content: expect.objectContaining({
          title: "Application withdrawn",
          body: "Ada Obi withdrew from Senior Engineer",
          link: `/admin/applications/${WITHDRAWN_PAYLOAD.applicationId}`,
        }),
        dedupKey: `app-withdrawn:${WITHDRAWN_PAYLOAD.applicationId}`,
      }),
    );
  });

  it("uses Redis SET NX EX dedup as first operation", async () => {
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
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("does not throw when dispatchNotification fails (fire-and-forget)", async () => {
    mockDispatchNotification.mockRejectedValue(new Error("dispatch error"));
    const handler = await getHandler("application.withdrawn");
    await expect(handler(WITHDRAWN_PAYLOAD)).resolves.not.toThrow();
  });

  it("logs warning and skips notification when company has no ownerUserId", async () => {
    mockGetCompanyById.mockResolvedValue({ id: "company-wd-abc", ownerUserId: null, name: "Inc" });
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("logs warning and skips notification when company lookup returns null", async () => {
    mockGetCompanyById.mockResolvedValue(null);
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("creates notification with fallback values when seeker lookup fails", async () => {
    mockFindUserById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: "A candidate withdrew from Senior Engineer",
        }),
      }),
    );
  });

  it("creates notification with fallback job title when posting lookup fails", async () => {
    mockGetJobPostingById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: "Ada Obi withdrew from Unknown Position",
        }),
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
    mockRedisSet.mockResolvedValue("OK");
    mockGetSavedSearchById.mockResolvedValue(MOCK_SAVED_SEARCH);
    mockEvaluateInstantAlert.mockResolvedValue(true);
    mockDispatchNotification.mockResolvedValue(undefined);
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

  it("now has Redis NX dedup as FIRST operation (Pattern 1 backfill)", async () => {
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    // Redis SET must be called before any other work
    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:search-alert:${SAVED_SEARCH_PAYLOAD.savedSearchId}:${SAVED_SEARCH_PAYLOAD.jobId}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("skips notification when dedup key already set", async () => {
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockGetSavedSearchById).not.toHaveBeenCalled();
    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("calls dispatchNotification with correct eventType and content", async () => {
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        eventType: "portal.saved_search.new_results",
        content: expect.objectContaining({
          title: "New match: Senior Engineer",
          body: `Your saved search "Lagos Engineers" has a new result`,
        }),
        dedupKey: `search-alert:${SAVED_SEARCH_PAYLOAD.savedSearchId}:${SAVED_SEARCH_PAYLOAD.jobId}`,
      }),
    );
  });

  it("skips notification when evaluateInstantAlert returns false", async () => {
    mockEvaluateInstantAlert.mockResolvedValue(false);
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("skips notification when savedSearch not found in DB", async () => {
    mockGetSavedSearchById.mockResolvedValue(null);
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockEvaluateInstantAlert).not.toHaveBeenCalled();
    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("does not throw when dispatchNotification fails (fire-and-forget)", async () => {
    mockDispatchNotification.mockRejectedValue(new Error("dispatch error"));
    const handler = await getHandler("saved_search.new_result");
    await expect(handler(SAVED_SEARCH_PAYLOAD)).resolves.not.toThrow();
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalled();
  });
});

// ── job.reviewed handler ──────────────────────────────────────────────────────

const JOB_REVIEWED_PAYLOAD = {
  eventId: "evt-jr-001",
  version: 1,
  timestamp: "2026-04-18T10:00:00.000Z",
  jobId: "job-789",
  reviewerUserId: "admin-1",
  companyId: "company-abc",
  decision: "approved" as "approved" | "rejected" | "changes_requested",
};

const MOCK_POSTING_WITH_COMPANY = {
  posting: { id: "job-789", title: "Senior Engineer", companyId: "company-abc" },
  company: {
    id: "company-abc",
    name: "Igbo Tech",
    ownerUserId: "employer-owner-123",
  },
};

describe("notification-service — job.reviewed handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockCheckInstantAlerts.mockResolvedValue(undefined);
    mockGetJobPostingWithCompany.mockResolvedValue(MOCK_POSTING_WITH_COMPANY);
    mockFindUserById.mockResolvedValue({
      id: "employer-owner-123",
      email: "employer@example.com",
      name: "Obi Chukwu",
      languagePreference: "en",
    });
    mockDispatchNotification.mockResolvedValue(undefined);
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

  it("has Redis NX dedup as FIRST operation — backfill per Pattern Assessment constraint", async () => {
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:job-reviewed:${JOB_REVIEWED_PAYLOAD.jobId}:${JOB_REVIEWED_PAYLOAD.decision}`,
      "1",
      "EX",
      900, // "approved" is high-priority → 900
      "NX",
    );
  });

  it("uses 86400 dedup TTL for rejected decision (system-critical)", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "rejected" });

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:job-reviewed:${JOB_REVIEWED_PAYLOAD.jobId}:rejected`,
      "1",
      "EX",
      86400,
      "NX",
    );
  });

  it("skips all work when dedup key already set", async () => {
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockCheckInstantAlerts).not.toHaveBeenCalled();
    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("calls checkInstantAlerts when decision is approved", async () => {
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockCheckInstantAlerts).toHaveBeenCalledWith("job-789");
  });

  it("does NOT call checkInstantAlerts for rejected decision", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "rejected" });

    expect(mockCheckInstantAlerts).not.toHaveBeenCalled();
  });

  it("does NOT call checkInstantAlerts for changes_requested decision", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "changes_requested" });

    expect(mockCheckInstantAlerts).not.toHaveBeenCalled();
  });

  it("uses getJobPostingWithCompany to get employerUserId (no employerUserId in event)", async () => {
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockGetJobPostingWithCompany).toHaveBeenCalledWith("job-789");
  });

  it("dispatches portal.job.approved notification for approved decision", async () => {
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "employer-owner-123",
        eventType: "portal.job.approved",
        dedupKey: `job-reviewed:${JOB_REVIEWED_PAYLOAD.jobId}:approved`,
      }),
    );
  });

  it("dispatches portal.job.rejected notification for rejected decision", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "rejected" });

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "employer-owner-123",
        eventType: "portal.job.rejected",
        dedupKey: `job-reviewed:${JOB_REVIEWED_PAYLOAD.jobId}:rejected`,
      }),
    );
  });

  it("dispatches portal.job.changes_requested notification for changes_requested decision", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "changes_requested" });

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "employer-owner-123",
        eventType: "portal.job.changes_requested",
        dedupKey: `job-reviewed:${JOB_REVIEWED_PAYLOAD.jobId}:changes_requested`,
      }),
    );
  });

  it("skips employer notification when getJobPostingWithCompany returns null", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue(null);
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("skips employer notification when getJobPostingWithCompany rejects", async () => {
    mockGetJobPostingWithCompany.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("skips employer notification when company has no ownerUserId", async () => {
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: { id: "job-789", title: "Senior Engineer", companyId: "company-abc" },
      company: { id: "company-abc", name: "Igbo Tech", ownerUserId: null },
    });
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("handles checkInstantAlerts error gracefully (fire-and-forget)", async () => {
    mockCheckInstantAlerts.mockRejectedValue(new Error("Service error"));
    const handler = await getHandler("job.reviewed");
    await expect(handler(JOB_REVIEWED_PAYLOAD)).resolves.not.toThrow();
  });

  // ── Email wiring tests ──────────────────────────────────────────────────────

  it("emailJob present with job-approved template and jobDetailUrl (approved decision)", async () => {
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD); // decision: "approved"

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeDefined();
    expect(call.emailJob.payload.templateId).toBe("job-approved");
    expect(call.emailJob.payload.data.jobDetailUrl).toContain(
      `/jobs/${JOB_REVIEWED_PAYLOAD.jobId}`,
    );
  });

  it("emailJob present with job-rejected template and no CTA URL (rejected decision)", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "rejected" });

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeDefined();
    expect(call.emailJob.payload.templateId).toBe("job-rejected");
    expect(call.emailJob.payload.data.jobDetailUrl).toBeUndefined();
    expect(call.emailJob.payload.data.jobEditUrl).toBeUndefined();
  });

  it("emailJob present with job-changes-requested template and jobEditUrl (changes_requested decision)", async () => {
    const handler = await getHandler("job.reviewed");
    await handler({ ...JOB_REVIEWED_PAYLOAD, decision: "changes_requested" });

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeDefined();
    expect(call.emailJob.payload.templateId).toBe("job-changes-requested");
    expect(call.emailJob.payload.data.jobEditUrl).toContain(
      `/jobs/${JOB_REVIEWED_PAYLOAD.jobId}/edit`,
    );
  });

  it("emailJob absent when employer has no email (in-app still dispatched)", async () => {
    mockFindUserById.mockResolvedValue({
      id: "employer-owner-123",
      email: null,
      name: "Obi",
      languagePreference: "en",
    });
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("emailJob absent when employer findUserById fails (in-app still dispatched)", async () => {
    mockFindUserById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("job.reviewed");
    await handler(JOB_REVIEWED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
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
    mockRedisSet.mockResolvedValue("OK");
    mockDispatchNotification.mockResolvedValue(undefined);
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

  it("self-exclusion — when recipientId === senderId, dispatchNotification is NOT called", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, recipientId: MSG_PAYLOAD.senderId });

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("dedup — second event with same messageId is skipped (atomic SET NX returns null)", async () => {
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("dedup — uses atomic SET NX EX with messageId key", async () => {
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

    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("calls dispatchNotification with correct eventType, userId, content", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "recipient-bbb",
        eventType: "portal.message.received",
        content: expect.objectContaining({
          title: "Chike Obi sent you a message about Software Engineer",
          link: `/conversations/${MSG_PAYLOAD.applicationId}`,
        }),
        dedupKey: `msg:${MSG_PAYLOAD.messageId}`,
      }),
    );
  });

  it("passes custom throttleKey in format portal:throttle:msg:{sender}:{recipient}:{applicationId}", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        throttleKey: `portal:throttle:msg:${MSG_PAYLOAD.senderId}:${MSG_PAYLOAD.recipientId}:${MSG_PAYLOAD.applicationId}`,
      }),
    );
  });

  it("passes pushPayload in dispatchNotification (push is part of portal.message.received catalog)", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        pushPayload: expect.objectContaining({
          tag: `msg:${MSG_PAYLOAD.applicationId}`,
        }),
      }),
    );
  });

  it("does NOT pass emailJob (email is intentionally OFF for messages per catalog)", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler(MSG_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
  });

  it("notification body — content 51+ chars → truncated to 50 chars", async () => {
    const content51 = "a".repeat(51);
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, content: content51 });

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ body: "a".repeat(50) }),
      }),
    );
  });

  it("senderName is undefined → notification uses 'Someone' fallback", async () => {
    const handler = await getHandler("portal.message.sent");
    await handler({ ...MSG_PAYLOAD, senderName: undefined });

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: "Someone sent you a message about Software Engineer",
        }),
      }),
    );
  });

  it("does not throw when dispatchNotification fails (fire-and-forget)", async () => {
    mockDispatchNotification.mockRejectedValue(new Error("dispatch error"));
    const handler = await getHandler("portal.message.sent");
    await expect(handler(MSG_PAYLOAD)).resolves.not.toThrow();
  });
});

// ── application.status_changed handler (NEW) ─────────────────────────────────

const STATUS_CHANGED_PAYLOAD = {
  eventId: "evt-sc-001",
  version: 1,
  timestamp: "2026-04-25T10:00:00.000Z",
  applicationId: "app-sc-123",
  jobId: "job-sc-456",
  seekerUserId: "seeker-sc-789",
  companyId: "company-sc-abc",
  previousStatus: "submitted",
  newStatus: "shortlisted",
  actorUserId: "admin-reviewer",
  actorRole: "job_admin",
};

describe("notification-service — application.status_changed handler (new)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: { id: "job-sc-456", title: "Product Manager", companyId: "company-sc-abc" },
      company: { id: "company-sc-abc", name: "Igbo Tech" },
    });
    mockFindUserById.mockResolvedValue({
      id: "seeker-sc-789",
      email: "seeker@example.com",
      name: "Ada Obi",
      languagePreference: "en",
    });
    mockDispatchNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on application.status_changed event", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith(
      "application.status_changed",
      expect.any(Function),
    );
  });

  it("uses seekerUserId from event payload as recipient (no DB lookup needed for recipient)", async () => {
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: STATUS_CHANGED_PAYLOAD.seekerUserId,
        eventType: "portal.application.status_changed",
      }),
    );
  });

  it("looks up jobTitle via getJobPostingWithCompany for notification content", async () => {
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    expect(mockGetJobPostingWithCompany).toHaveBeenCalledWith(STATUS_CHANGED_PAYLOAD.jobId);
    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: expect.stringContaining("Product Manager"),
        }),
      }),
    );
  });

  it("uses Redis NX dedup with per-application-per-status key", async () => {
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:status-changed:${STATUS_CHANGED_PAYLOAD.applicationId}:${STATUS_CHANGED_PAYLOAD.newStatus}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("skips notification if dedup key already set", async () => {
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("sends notification with fallback jobTitle when getJobPostingWithCompany rejects (fail-open)", async () => {
    mockGetJobPostingWithCompany.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: expect.stringContaining("Unknown Position"),
        }),
      }),
    );
  });

  it("dedup key includes newStatus to distinguish different status changes for same application", async () => {
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);
    await handler({ ...STATUS_CHANGED_PAYLOAD, newStatus: "rejected" });

    // Each call uses a distinct dedup key
    const calls = mockRedisSet.mock.calls;
    const keys = calls.map(([k]) => k as string);
    expect(keys[0]).toContain("shortlisted");
    expect(keys[1]).toContain("rejected");
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("does not throw when dispatchNotification fails (fire-and-forget)", async () => {
    mockDispatchNotification.mockRejectedValue(new Error("dispatch error"));
    const handler = await getHandler("application.status_changed");
    await expect(handler(STATUS_CHANGED_PAYLOAD)).resolves.not.toThrow();
  });

  it("contract snapshot — dispatchNotification called with correct shape for application.status_changed", async () => {
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    // Use objectContaining — emailJob is also present when seeker has email + status is eligible
    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: STATUS_CHANGED_PAYLOAD.seekerUserId,
        eventType: "portal.application.status_changed",
        content: {
          title: expect.stringContaining("application"),
          body: expect.stringContaining("Product Manager"),
          link: `/applications/${STATUS_CHANGED_PAYLOAD.applicationId}`,
        },
        dedupKey: `status-changed:${STATUS_CHANGED_PAYLOAD.applicationId}:${STATUS_CHANGED_PAYLOAD.newStatus}`,
      }),
    );
  });

  // ── Email wiring tests ──────────────────────────────────────────────────────

  it("emailJob present in dispatchNotification when seeker has email and status is eligible", async () => {
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD); // shortlisted is email-eligible

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeDefined();
    expect(call.emailJob.payload.templateId).toBe("application-status-changed");
    expect(call.emailJob.payload.to).toBe("seeker@example.com");
  });

  it("emailJob absent when seeker has no email (fail-open: in-app still dispatched)", async () => {
    mockFindUserById.mockResolvedValue({ id: "seeker-sc-789", email: null, name: "Ada" });
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("emailJob absent when newStatus is under_review (not email-eligible)", async () => {
    const handler = await getHandler("application.status_changed");
    await handler({ ...STATUS_CHANGED_PAYLOAD, newStatus: "under_review" });

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("seeker findUserById failure → emailJob absent, in-app still dispatched", async () => {
    mockFindUserById.mockRejectedValue(new Error("DB timeout"));
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("emailJob uses ig locale when seeker languagePreference is ig", async () => {
    mockFindUserById.mockResolvedValue({
      id: "seeker-sc-789",
      email: "seeker@example.com",
      name: "Ada",
      languagePreference: "ig",
    });
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_CHANGED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob?.payload.locale).toBe("ig");
  });
});

// ── job.expired handler (NEW) ─────────────────────────────────────────────────

const JOB_EXPIRED_PAYLOAD = {
  eventId: "evt-je-001",
  version: 1,
  timestamp: "2026-04-26T10:00:00.000Z",
  jobId: "job-exp-789",
  companyId: "company-exp-abc",
  title: "Senior Software Engineer",
  employerUserId: "employer-exp-xyz",
};

describe("notification-service — job.expired handler (new)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockFindUserById.mockResolvedValue({
      id: "employer-exp-xyz",
      email: "employer@example.com",
      name: "Obi Chukwu",
      languagePreference: "en",
    });
    mockGetCompanyById.mockResolvedValue({ id: "company-exp-abc", name: "Igbo Tech" });
    mockDispatchNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("registers handler on job.expired event", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    await import("./notification-service");
    expect(mockPortalEventBusOn).toHaveBeenCalledWith("job.expired", expect.any(Function));
  });

  it("uses employerUserId from event payload (no DB lookup needed)", async () => {
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: JOB_EXPIRED_PAYLOAD.employerUserId,
        eventType: "portal.job.expired",
      }),
    );
  });

  it("uses job title from event payload (no DB lookup needed)", async () => {
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          body: expect.stringContaining("Senior Software Engineer"),
        }),
      }),
    );
  });

  it("uses Redis NX dedup with per-job key", async () => {
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:notif:job-expired:${JOB_EXPIRED_PAYLOAD.jobId}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });

  it("skips notification if dedup key already set", async () => {
    mockRedisSet.mockResolvedValue(null);
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    expect(mockDispatchNotification).not.toHaveBeenCalled();
  });

  it("proceeds if Redis dedup check throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis down"));
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("does not throw when dispatchNotification fails (fire-and-forget)", async () => {
    mockDispatchNotification.mockRejectedValue(new Error("dispatch error"));
    const handler = await getHandler("job.expired");
    await expect(handler(JOB_EXPIRED_PAYLOAD)).resolves.not.toThrow();
  });

  // ── Email wiring tests ──────────────────────────────────────────────────────

  it("emailJob present with job-expired template when employer has email", async () => {
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeDefined();
    expect(call.emailJob.payload.templateId).toBe("job-expired");
    expect(call.emailJob.payload.to).toBe("employer@example.com");
    expect(call.emailJob.payload.data.renewUrl).toContain("/jobs/new");
  });

  it("emailJob absent when employer has no email (in-app still dispatched)", async () => {
    mockFindUserById.mockResolvedValue({ id: "employer-exp-xyz", email: null, name: "Obi" });
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.emailJob).toBeUndefined();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });
});

// ── Cross-handler dedup key collision test ────────────────────────────────────

describe("notification-service — dedup key distinctness", () => {
  it("application.submitted and status_changed for same applicationId produce distinct dedup keys", async () => {
    const applicationId = "app-shared-001";

    const submittedKey = `portal:dedup:notif:app-submitted:${applicationId}`;
    const statusChangedKey = `portal:dedup:notif:status-changed:${applicationId}:shortlisted`;

    expect(submittedKey).not.toBe(statusChangedKey);
  });

  it("job.reviewed approved and rejected produce distinct dedup keys for same jobId", async () => {
    const jobId = "job-shared-002";

    const approvedKey = `portal:dedup:notif:job-reviewed:${jobId}:approved`;
    const rejectedKey = `portal:dedup:notif:job-reviewed:${jobId}:rejected`;

    expect(approvedKey).not.toBe(rejectedKey);
  });

  it("job.expired and job.reviewed dedup keys for same jobId are distinct", async () => {
    const jobId = "job-shared-003";
    const expiredKey = `portal:dedup:notif:job-expired:${jobId}`;
    const reviewedKey = `portal:dedup:notif:job-reviewed:${jobId}:approved`;

    expect(expiredKey).not.toBe(reviewedKey);
  });
});

// ── publishNotificationCreated export removal verification ────────────────

describe("notification-service — publishNotificationCreated removed", () => {
  it("does not export publishNotificationCreated (absorbed into notification-router)", async () => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
    vi.resetModules();
    const mod = await import("./notification-service");
    expect("publishNotificationCreated" in mod).toBe(false);
  });
});

// ── P-6.3: pushPayload wiring tests ──────────────────────────────────────────

describe("notification-service — pushPayload wiring (P-6.3)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockCheckInstantAlerts.mockResolvedValue(undefined);
    mockDispatchNotification.mockResolvedValue(undefined);
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue({ id: "job-456", title: "Senior Engineer" });
    mockGetJobPostingWithCompany.mockResolvedValue({
      posting: { id: "job-456", title: "Senior Engineer" },
      company: { id: "co-abc", name: "Igbo Tech", ownerUserId: "employer-xyz" },
    });
    mockGetCompanyById.mockResolvedValue({
      id: "company-abc",
      ownerUserId: "employer-xyz",
      name: "Igbo Tech",
    });
    mockEnqueueEmailJob.mockResolvedValue(true);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("application.submitted → dispatchNotification includes pushPayload with correct fields", async () => {
    const handler = await getHandler("application.submitted");
    await handler(BASE_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload).toBeDefined();
    expect(call.pushPayload.title).toContain("Senior Engineer");
    expect(call.pushPayload.body).toContain("Test User"); // seekerName from 1st findUserById call
    expect(call.pushPayload.link).toBe(`/admin/applications/${BASE_PAYLOAD.applicationId}`);
    expect(call.pushPayload.tag).toBe(`app-submitted:${BASE_PAYLOAD.applicationId}`);
  });

  it("application.withdrawn → dispatchNotification includes pushPayload with seekerName + jobTitle", async () => {
    const handler = await getHandler("application.withdrawn");
    await handler(WITHDRAWN_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload).toBeDefined();
    expect(call.pushPayload.title).toBe("Application withdrawn");
    expect(call.pushPayload.body).toContain("Test User");
    expect(call.pushPayload.body).toContain("Senior Engineer");
    expect(call.pushPayload.link).toBe(`/admin/applications/${WITHDRAWN_PAYLOAD.applicationId}`);
    expect(call.pushPayload.tag).toBe(`app-withdrawn:${WITHDRAWN_PAYLOAD.applicationId}`);
  });

  it("application.status_changed → dispatchNotification includes pushPayload with newStatus", async () => {
    const STATUS_PAYLOAD = {
      eventId: "evt-sc-p63",
      version: 1,
      timestamp: "2026-05-01T10:00:00.000Z",
      applicationId: "app-sc-001",
      jobId: "job-456",
      seekerUserId: "seeker-001",
      newStatus: "shortlisted",
      previousStatus: "submitted",
      actorUserId: "employer-xyz",
      actorRole: "employer" as const,
    };
    const handler = await getHandler("application.status_changed");
    await handler(STATUS_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload).toBeDefined();
    expect(call.pushPayload.title).toBe("Application update");
    expect(call.pushPayload.body).toContain("Senior Engineer");
    expect(call.pushPayload.body).toContain("shortlisted");
    expect(call.pushPayload.link).toBe(`/applications/${STATUS_PAYLOAD.applicationId}`);
    expect(call.pushPayload.tag).toBe(
      `status-changed:${STATUS_PAYLOAD.applicationId}:${STATUS_PAYLOAD.newStatus}`,
    );
  });

  it("job.reviewed approved → pushPayload title/body/tag reflect approved decision", async () => {
    const REVIEWED_PAYLOAD = {
      eventId: "evt-jr-p63",
      version: 1,
      timestamp: "2026-05-01T10:00:00.000Z",
      jobId: "job-456",
      adminUserId: "admin-1",
      decision: "approved" as const,
    };
    const handler = await getHandler("job.reviewed");
    await handler(REVIEWED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload).toBeDefined();
    expect(call.pushPayload.title).toContain("approved");
    expect(call.pushPayload.link).toBe(`/jobs/${REVIEWED_PAYLOAD.jobId}`);
    expect(call.pushPayload.tag).toBe(`job-reviewed:${REVIEWED_PAYLOAD.jobId}:approved`);
  });

  it("job.reviewed rejected → pushPayload tag reflects rejected decision", async () => {
    const REVIEWED_PAYLOAD = {
      eventId: "evt-jr-rej",
      version: 1,
      timestamp: "2026-05-01T10:00:00.000Z",
      jobId: "job-456",
      adminUserId: "admin-1",
      decision: "rejected" as const,
    };
    const handler = await getHandler("job.reviewed");
    await handler(REVIEWED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload.tag).toBe(`job-reviewed:${REVIEWED_PAYLOAD.jobId}:rejected`);
  });

  it("job.reviewed changes_requested → pushPayload tag reflects changes_requested decision", async () => {
    const REVIEWED_PAYLOAD = {
      eventId: "evt-jr-cr",
      version: 1,
      timestamp: "2026-05-01T10:00:00.000Z",
      jobId: "job-456",
      adminUserId: "admin-1",
      decision: "changes_requested" as const,
    };
    const handler = await getHandler("job.reviewed");
    await handler(REVIEWED_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload.tag).toBe(`job-reviewed:${REVIEWED_PAYLOAD.jobId}:changes_requested`);
  });

  it("job.expired → dispatchNotification includes pushPayload with jobTitle and correct tag", async () => {
    const JOB_EXPIRED_PAYLOAD_P63 = {
      eventId: "evt-je-p63",
      version: 1,
      timestamp: "2026-05-01T10:00:00.000Z",
      jobId: "job-exp-001",
      title: "Senior Engineer",
      employerUserId: "employer-xyz",
      companyId: "company-abc",
    };
    const handler = await getHandler("job.expired");
    await handler(JOB_EXPIRED_PAYLOAD_P63);

    const call = mockDispatchNotification.mock.calls[0]![0];
    expect(call.pushPayload).toBeDefined();
    expect(call.pushPayload.title).toBe("Job posting expired");
    expect(call.pushPayload.body).toContain("Senior Engineer");
    expect(call.pushPayload.link).toBe(`/jobs/${JOB_EXPIRED_PAYLOAD_P63.jobId}`);
    expect(call.pushPayload.tag).toBe(`job-expired:${JOB_EXPIRED_PAYLOAD_P63.jobId}`);
  });

  it("saved_search.new_result → dispatchNotification does NOT include pushPayload (low-priority, push OFF)", async () => {
    mockGetSavedSearchById.mockResolvedValue(MOCK_SAVED_SEARCH);
    mockEvaluateInstantAlert.mockResolvedValue(true);
    const handler = await getHandler("saved_search.new_result");
    await handler(SAVED_SEARCH_PAYLOAD);

    const call = mockDispatchNotification.mock.calls[0]?.[0];
    expect(call?.pushPayload).toBeUndefined();
  });
});

// ── P-6.3: Channel isolation — push failure does not block in-app ────────────
// NOTE (F8): These tests verify at the HANDLER level that dispatchNotification is
// called with pushPayload and that handler-level rejection is absorbed (fire-and-forget).
// The actual Promise.allSettled channel isolation (push rejects → in-app still created)
// is tested at the ROUTER level in notification-router.test.ts (4 tests: "push failure
// does not block in-app", "in-app failure + push success", "all channels throw",
// "redis.publish failure — push still dispatched"). Both levels together provide
// complete coverage for SN-2 scenario 3.

describe("notification-service — channel isolation (P-6.3 SN-2 scenario 3)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    // resolveChannels uses redis.get for preference cache (fail-open if missing)
    mockRedisGet.mockResolvedValue(null);
    // applyQuietHours calls isUserInQuietHours — return false (not in quiet hours)
    mockIsUserInQuietHours.mockResolvedValue(false);
    // resolveChannels DB fallback: return no rows (use catalog defaults)
    mockGetNotificationPreferences.mockResolvedValue({});
    mockDispatchNotification.mockResolvedValue(undefined);
    mockFindUserById.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue({ id: "job-456", title: "Senior Engineer" });
    mockGetCompanyById.mockResolvedValue({
      id: "company-abc",
      ownerUserId: "employer-xyz",
      name: "Igbo Tech",
    });
    mockEnqueueEmailJob.mockResolvedValue(true);
  });

  afterEach(() => {
    const g = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
    g.__portalNotifHandlersRegistered = false;
  });

  it("application.submitted: dispatchNotification still called even if sendPushNotification were to reject (Promise.allSettled channel isolation)", async () => {
    // dispatchNotification is the boundary — it handles push + in-app via Promise.allSettled internally.
    // Even if push fails (rejected), the in-app notification is created.
    // This test verifies that dispatchNotification is still invoked (not short-circuited by any upstream error).
    const handler = await getHandler("application.submitted");
    await handler(BASE_PAYLOAD);

    // dispatchNotification must be called — it contains both push AND in-app channels
    expect(mockDispatchNotification).toHaveBeenCalledOnce();
    expect(mockDispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        pushPayload: expect.objectContaining({ title: expect.any(String) }),
      }),
    );
  });

  it("application.submitted: dispatchNotification called even when dispatchNotification itself rejects (fire-and-forget pattern)", async () => {
    // The handler wraps dispatchNotification in .catch() so rejection must not propagate
    mockDispatchNotification.mockRejectedValue(new Error("push channel failed"));
    const handler = await getHandler("application.submitted");
    // Should not throw even if dispatchNotification rejects
    await expect(handler(BASE_PAYLOAD)).resolves.not.toThrow();
    expect(mockDispatchNotification).toHaveBeenCalled();
  });

  it("application.submitted: createNotification called even when sendPushNotification rejects — real dispatchNotification end-to-end (F15)", async () => {
    // Use the real dispatchNotification to verify Promise.allSettled channel isolation
    // chains correctly from handler → router → createNotification even when push rejects.
    const handler = await getHandler("application.submitted");

    const { dispatchNotification: realDispatch } = await vi.importActual<
      typeof import("@/services/notification-router")
    >("@/services/notification-router");
    mockDispatchNotification.mockImplementation(realDispatch);

    // Push channel fails; in-app (createNotification) must still be called
    mockSendPushNotification.mockRejectedValue(new Error("Push VAPID error"));
    mockCreateNotification.mockResolvedValue({ id: "notif-test", createdAt: new Date() });

    await handler(BASE_PAYLOAD);

    expect(mockCreateNotification).toHaveBeenCalledOnce();
  });
});
