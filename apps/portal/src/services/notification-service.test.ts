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

const mockRedisSet = vi.fn();
vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({ set: mockRedisSet })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getHandler(): Promise<(payload: unknown) => Promise<void>> {
  // Reset HMR guard so the module re-registers
  const global = globalThis as unknown as { __portalNotifHandlersRegistered?: boolean };
  global.__portalNotifHandlersRegistered = false;
  mockPortalEventBusOn.mockClear();
  // Re-import to trigger handler registration
  vi.resetModules();
  await import("./notification-service");
  const call = mockPortalEventBusOn.mock.calls.find(([event]) => event === "application.submitted");
  if (!call) throw new Error("application.submitted handler not registered");
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
    // Default DB data
    mockFindUserById.mockResolvedValue({
      id: "seeker-789",
      email: "seeker@example.com",
      name: "Ada Obi",
      languagePreference: "en",
    });
    mockGetJobPostingById.mockResolvedValue({ id: "job-456", title: "Senior Engineer" });
    mockGetCompanyById.mockResolvedValue({ id: "company-abc", name: "Igbo Tech" });
    mockCreateNotification.mockResolvedValue({ id: "notif-1" });
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
      `dedup:portal:notif:app-submitted:${BASE_PAYLOAD.applicationId}`,
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
