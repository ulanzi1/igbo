// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const registeredJobs = vi.hoisted(() => new Map<string, () => Promise<void>>());
const mockRegisterJob = vi.hoisted(() =>
  vi.fn((name: string, handler: () => Promise<void>) => {
    registeredJobs.set(name, handler);
  }),
);
const mockRunJob = vi.hoisted(() => vi.fn());
vi.mock("./job-runner", () => ({
  registerJob: (...args: unknown[]) => mockRegisterJob(...(args as [string, () => Promise<void>])),
  runJob: (...args: unknown[]) => mockRunJob(...args),
}));

const mockGetRedisSet = vi.hoisted(() => vi.fn().mockResolvedValue("OK"));
const mockGetRedisClient = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockGetRedisSet }));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

const mockGetUsersInQuietHours = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockGetUsersWithDigestDue = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockGetNotificationPreferences = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockGetUndigestedNotifications = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockMarkDigestSent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/db/queries/notification-preferences", () => ({
  getUsersInQuietHours: (...args: unknown[]) => mockGetUsersInQuietHours(...args),
  getUsersWithDigestDue: (...args: unknown[]) => mockGetUsersWithDigestDue(...args),
  getNotificationPreferences: (...args: unknown[]) => mockGetNotificationPreferences(...args),
  getUndigestedNotifications: (...args: unknown[]) => mockGetUndigestedNotifications(...args),
  markDigestSent: (...args: unknown[]) => mockMarkDigestSent(...args),
  DEFAULT_PREFERENCES: {
    message: { inApp: true, email: true, push: true },
  },
}));

const mockGetUserById = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: (...args: unknown[]) => mockGetUserById(...args),
  findUserByEmail: vi.fn(),
}));

const mockEnqueueEmailJob = vi.hoisted(() => vi.fn());
vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: (...args: unknown[]) => mockEnqueueEmailJob(...args),
  emailService: { send: vi.fn() },
}));

vi.mock("@/env", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    DATABASE_URL: "postgres://localhost/test",
    DATABASE_POOL_SIZE: 1,
  },
}));

// Import after mocks are set up
import { sendDigestForUser } from "./notification-digest";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRedisClient.mockReturnValue({ set: mockGetRedisSet });
  mockGetUsersInQuietHours.mockResolvedValue([]);
  mockGetUsersWithDigestDue.mockResolvedValue([]);
  mockGetNotificationPreferences.mockResolvedValue({});
  mockGetUndigestedNotifications.mockResolvedValue([]);
  mockMarkDigestSent.mockResolvedValue(undefined);
  mockGetUserById.mockResolvedValue(null);
  mockEnqueueEmailJob.mockImplementation(() => undefined);
});

describe("notification-digest job registration", () => {
  it("registers the notification-digest job on module import", () => {
    expect(registeredJobs.has("notification-digest")).toBe(true);
  });
});

describe("sendDigestForUser", () => {
  it("does NOT send email when no undigested notifications", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      message: {
        channelInApp: true,
        channelEmail: true,
        channelPush: false,
        digestMode: "daily",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });
    mockGetUndigestedNotifications.mockResolvedValue([]);

    await sendDigestForUser("user-1", ["message"], new Date());

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
    expect(mockMarkDigestSent).not.toHaveBeenCalled();
  });

  it("sends email and marks digest sent when notifications exist", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      message: {
        channelInApp: true,
        channelEmail: true,
        channelPush: false,
        digestMode: "daily",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });
    mockGetUndigestedNotifications.mockResolvedValue([
      {
        id: "n1",
        type: "message",
        title: "Test",
        body: "Body",
        userId: "user-1",
        createdAt: new Date(),
        isRead: false,
        link: null,
      },
    ]);
    mockGetUserById.mockResolvedValue({ email: "user@example.com", languagePreference: "en" });

    const now = new Date();
    await sendDigestForUser("user-1", ["message"], now);

    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining("digest-user-1"),
      expect.objectContaining({ to: "user@example.com", templateId: "notification-digest" }),
    );
    expect(mockMarkDigestSent).toHaveBeenCalledWith("user-1", ["message"], now);
  });

  it("does NOT send email when user has no email address", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      message: {
        channelInApp: true,
        channelEmail: true,
        channelPush: false,
        digestMode: "daily",
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: "UTC",
        lastDigestAt: null,
      },
    });
    mockGetUndigestedNotifications.mockResolvedValue([
      {
        id: "n1",
        type: "message",
        title: "Test",
        body: "Body",
        userId: "user-1",
        createdAt: new Date(),
        isRead: false,
        link: null,
      },
    ]);
    mockGetUserById.mockResolvedValue({ email: null });

    await sendDigestForUser("user-1", ["message"], new Date());

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("DnD sync: sets Redis key for users in quiet hours", async () => {
    mockGetUsersInQuietHours.mockResolvedValue(["user-qh-1", "user-qh-2"]);
    mockGetUsersWithDigestDue.mockResolvedValue([]);

    const jobHandler = registeredJobs.get("notification-digest");
    expect(jobHandler).toBeDefined();
    if (jobHandler) {
      await jobHandler();
      expect(mockGetRedisSet).toHaveBeenCalledWith("dnd:user-qh-1", "1", { ex: 5400 });
      expect(mockGetRedisSet).toHaveBeenCalledWith("dnd:user-qh-2", "1", { ex: 5400 });
    }
  });
});
