// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ─── web-push mock ───────────────────────────────────────────────────────────

const mockSetVapidDetails = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

// ─── DB queries mock ─────────────────────────────────────────────────────────

const mockGetUserPushSubscriptions = vi.hoisted(() => vi.fn());
const mockDeletePushSubscriptionByEndpoint = vi.hoisted(() => vi.fn());

vi.mock("@igbo/db/queries/push-subscriptions", () => ({
  getUserPushSubscriptions: (...args: unknown[]) => mockGetUserPushSubscriptions(...args),
  deletePushSubscriptionByEndpoint: (...args: unknown[]) =>
    mockDeletePushSubscriptionByEndpoint(...args),
}));

// ─── env mock ────────────────────────────────────────────────────────────────

vi.mock("@/env", () => ({
  env: {
    VAPID_CONTACT_EMAIL: "mailto:admin@test.com",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test-public-key",
    VAPID_PRIVATE_KEY: "test-private-key",
  },
}));

import { sendPushNotifications } from "./push-service";

const USER_ID = "user-1";
const ENDPOINT = "https://push.example.com/sub/abc123";

const mockSub = {
  endpoint: ENDPOINT,
  keys_p256dh: "p256dhkey",
  keys_auth: "authkey",
};

const PAYLOAD = {
  title: "Test",
  body: "Test body",
  icon: "/icon-192.png",
  link: "/dashboard",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserPushSubscriptions.mockResolvedValue([]);
  mockDeletePushSubscriptionByEndpoint.mockResolvedValue(undefined);
  mockSendNotification.mockResolvedValue({});
});

// ─── sendPushNotifications ───────────────────────────────────────────────────

describe("sendPushNotifications", () => {
  it("returns early when user has no subscriptions (no sendNotification call)", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([]);

    await sendPushNotifications(USER_ID, PAYLOAD);

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends notification to a single subscription", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    await sendPushNotifications(USER_ID, PAYLOAD);

    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: ENDPOINT, keys: { p256dh: "p256dhkey", auth: "authkey" } },
      JSON.stringify(PAYLOAD),
    );
  });

  it("sends to multiple subscriptions (fan-out)", async () => {
    const sub2 = {
      endpoint: "https://push2.example.com/sub/xyz",
      keys_p256dh: "p256dh2",
      keys_auth: "auth2",
    };
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub, sub2]);

    await sendPushNotifications(USER_ID, PAYLOAD);

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("deletes subscription on 410 error", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });

    await sendPushNotifications(USER_ID, PAYLOAD);

    expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledWith(ENDPOINT);
  });

  it("deletes subscription on 404 error", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);
    mockSendNotification.mockRejectedValueOnce({ statusCode: 404 });

    await sendPushNotifications(USER_ID, PAYLOAD);

    expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledWith(ENDPOINT);
  });

  it("logs error and continues on non-410 error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sub2 = {
      endpoint: "https://push2.example.com/sub/xyz",
      keys_p256dh: "p256dh2",
      keys_auth: "auth2",
    };
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub, sub2]);
    mockSendNotification.mockRejectedValueOnce({ statusCode: 500 }).mockResolvedValueOnce({});

    await sendPushNotifications(USER_ID, PAYLOAD);

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });
});
