// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── VAPID env setup — must run before push-service module is imported ────────
// vi.hoisted() runs before all imports in Vitest.

vi.hoisted(() => {
  process.env.VAPID_CONTACT_EMAIL = "mailto:admin@test.com";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
});

// ─── web-push mock ────────────────────────────────────────────────────────────

const mockSetVapidDetails = vi.hoisted(() => vi.fn());
const mockSendNotification = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

// ─── DB queries mock ──────────────────────────────────────────────────────────

const mockGetUserPushSubscriptions = vi.hoisted(() => vi.fn());
const mockDeletePushSubscriptionByEndpoint = vi.hoisted(() => vi.fn());

vi.mock("@igbo/db/queries/push-subscriptions", () => ({
  getUserPushSubscriptions: (...args: unknown[]) => mockGetUserPushSubscriptions(...args),
  deletePushSubscriptionByEndpoint: (...args: unknown[]) =>
    mockDeletePushSubscriptionByEndpoint(...args),
}));

// ─── Redis mock ───────────────────────────────────────────────────────────────

const mockRedisSet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    set: mockRedisSet,
  })),
}));

import { sendPushNotification, _resetVapidForTests } from "./push-service";

const USER_ID = "user-1";
const ENDPOINT = "https://push.example.com/sub/abc123";

const mockSub = {
  endpoint: ENDPOINT,
  keys_p256dh: "p256dhkey",
  keys_auth: "authkey",
};

const PAYLOAD = {
  title: "Chike Obi",
  body: "New message about Software Engineer: Hello there",
  link: "/conversations/app-123",
  tag: "msg:app-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Reset lazy VAPID init so each test starts fresh
  _resetVapidForTests();
  // Restore default VAPID env vars (may be cleared in specific tests)
  process.env.VAPID_CONTACT_EMAIL = "mailto:admin@test.com";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  mockGetUserPushSubscriptions.mockResolvedValue([]);
  mockDeletePushSubscriptionByEndpoint.mockResolvedValue(undefined);
  mockSendNotification.mockResolvedValue({});
  // Default: Redis NX key not yet set — proceeds with send
  mockRedisSet.mockReset();
  mockRedisSet.mockResolvedValue("OK");
});

describe("sendPushNotification", () => {
  it("VAPID keys not configured → logs warning and returns early (no push sent)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.VAPID_CONTACT_EMAIL;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledOnce();
    const logArg = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as { message: string };
    expect(logArg.message).toBe("portal.push-service.vapid_not_configured");
    consoleSpy.mockRestore();
  });

  it("returns early when user has no subscriptions (no sendNotification call)", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([]);

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("sends push to all user subscriptions with exact payload shape", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockSendNotification).toHaveBeenCalledOnce();
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: ENDPOINT, keys: { p256dh: "p256dhkey", auth: "authkey" } },
      JSON.stringify(PAYLOAD),
    );
  });

  it("push payload includes title, body, link, and tag fields", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    await sendPushNotification(USER_ID, PAYLOAD);

    const sentPayload = JSON.parse(
      (mockSendNotification.mock.calls[0] as [unknown, string])[1],
    ) as typeof PAYLOAD;
    expect(sentPayload.title).toBe(PAYLOAD.title);
    expect(sentPayload.body).toBe(PAYLOAD.body);
    expect(sentPayload.link).toBe(PAYLOAD.link);
    expect(sentPayload.tag).toBe(PAYLOAD.tag);
  });

  it("sends to multiple subscriptions (fan-out)", async () => {
    const sub2 = {
      endpoint: "https://push2.example.com/sub/xyz",
      keys_p256dh: "p256dh2",
      keys_auth: "auth2",
    };
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub, sub2]);

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("handles invalid subscription (410 response) → removes subscription via deletePushSubscriptionByEndpoint", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledWith(ENDPOINT);
  });

  it("handles 404 response → removes subscription", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);
    mockSendNotification.mockRejectedValueOnce({ statusCode: 404 });

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledWith(ENDPOINT);
  });

  it("3 subscriptions, middle one returns 410 → middle removed, other two succeed", async () => {
    const sub1 = { endpoint: "https://push1.example.com/1", keys_p256dh: "k1", keys_auth: "a1" };
    const sub2 = { endpoint: "https://push2.example.com/2", keys_p256dh: "k2", keys_auth: "a2" };
    const sub3 = { endpoint: "https://push3.example.com/3", keys_p256dh: "k3", keys_auth: "a3" };
    mockGetUserPushSubscriptions.mockResolvedValue([sub1, sub2, sub3]);
    mockSendNotification
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({});

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockSendNotification).toHaveBeenCalledTimes(3);
    expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledTimes(1);
    expect(mockDeletePushSubscriptionByEndpoint).toHaveBeenCalledWith(sub2.endpoint);
  });

  it("handles 400/401/403 response → logged as misconfiguration error (not as subscription cleanup)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);
    mockSendNotification.mockRejectedValueOnce({ statusCode: 400 });

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockDeletePushSubscriptionByEndpoint).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledOnce();
    const logArg = JSON.parse(consoleSpy.mock.calls[0]![0] as string) as {
      message: string;
    };
    expect(logArg.message).toBe("portal.push-service.vapid_misconfiguration");
    consoleSpy.mockRestore();
  });

  it("handles network error → logs and continues (does not throw)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sub2 = {
      endpoint: "https://push2.example.com/sub/xyz",
      keys_p256dh: "p256dh2",
      keys_auth: "auth2",
    };
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub, sub2]);
    mockSendNotification
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({});

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  // ── Redis NX dedup tests ──────────────────────────────────────────────────

  it("first call with userId+tag returns true (sent)", async () => {
    mockRedisSet.mockResolvedValue("OK"); // NX acquired
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    const result = await sendPushNotification(USER_ID, PAYLOAD);

    expect(result).toBe(true);
    expect(mockSendNotification).toHaveBeenCalledOnce();
  });

  it("second call with same userId+tag returns false (deduped)", async () => {
    mockRedisSet.mockResolvedValue(null); // null = key already exists → deduped

    const result = await sendPushNotification(USER_ID, PAYLOAD);

    expect(result).toBe(false);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("call with different tag returns true (dedup is key-scoped, not global)", async () => {
    mockRedisSet.mockResolvedValueOnce(null).mockResolvedValueOnce("OK");

    await sendPushNotification(USER_ID, PAYLOAD); // deduped (first tag)
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);
    const result = await sendPushNotification(USER_ID, { ...PAYLOAD, tag: "msg:app-different" });

    expect(result).toBe(true);
  });

  it("Redis throws → returns true (fail-open: proceed with send)", async () => {
    mockRedisSet.mockRejectedValue(new Error("Redis unavailable"));
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    const result = await sendPushNotification(USER_ID, PAYLOAD);

    expect(result).toBe(true);
    expect(mockSendNotification).toHaveBeenCalledOnce();
  });

  it("tag is undefined → Redis dedup is skipped entirely (no NX check)", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    await sendPushNotification(USER_ID, { ...PAYLOAD, tag: undefined });

    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockSendNotification).toHaveBeenCalledOnce();
  });

  it("dedup key uses portal:dedup:push:<userId>:<tag> format", async () => {
    mockGetUserPushSubscriptions.mockResolvedValue([mockSub]);

    await sendPushNotification(USER_ID, PAYLOAD);

    expect(mockRedisSet).toHaveBeenCalledWith(
      `portal:dedup:push:${USER_ID}:${PAYLOAD.tag}`,
      "1",
      "EX",
      900,
      "NX",
    );
  });
});
