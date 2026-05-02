// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (referenced in vi.mock factories) ──────────────────────────

const {
  mockCreateNotification,
  mockSendPushNotification,
  mockEnqueueEmailJob,
  mockRedisSet,
  mockRedisPublish,
  mockRedisGet,
  mockRedisDelete,
  mockGetNotificationPreferences,
  mockIsUserInQuietHours,
  mockInvalidateUnreadCount,
  redisNxStore,
} = vi.hoisted(() => {
  // Stateful Redis NX map: first SET NX returns "OK", second returns null
  const redisNxStore = new Map<string, string>();
  const mockRedisSet = vi.fn(
    async (key: string, _value: string, _ex: string, _ttl: number, nx?: string) => {
      if (nx === "NX") {
        if (redisNxStore.has(key)) return null;
        redisNxStore.set(key, "1");
        return "OK";
      }
      redisNxStore.set(key, "1");
      return "OK";
    },
  );
  return {
    mockCreateNotification: vi.fn(),
    mockSendPushNotification: vi.fn(),
    mockEnqueueEmailJob: vi.fn(),
    mockRedisSet,
    mockRedisPublish: vi.fn(),
    mockRedisGet: vi.fn(),
    mockRedisDelete: vi.fn(),
    mockGetNotificationPreferences: vi.fn(),
    mockIsUserInQuietHours: vi.fn(),
    mockInvalidateUnreadCount: vi.fn().mockResolvedValue(undefined),
    redisNxStore,
  };
});

vi.mock("@igbo/db/queries/portal-notifications", () => ({
  createPortalNotification: mockCreateNotification,
}));

vi.mock("@igbo/db/queries/notification-preferences", () => ({
  getNotificationPreferences: mockGetNotificationPreferences,
  isUserInQuietHours: mockIsUserInQuietHours,
}));

vi.mock("@/services/push-service", () => ({
  sendPushNotification: mockSendPushNotification,
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: mockEnqueueEmailJob,
}));

vi.mock("@/services/notification-count-service", () => ({
  invalidateUnreadCount: mockInvalidateUnreadCount,
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    set: mockRedisSet,
    publish: mockRedisPublish,
    get: mockRedisGet,
    del: mockRedisDelete,
  })),
}));

vi.mock("@igbo/config/redis", () => ({
  createRedisKey: (...parts: string[]) => parts.join(":"),
}));

// ── Imports under test ─────────────────────────────────────────────────────────

import {
  resolveChannels,
  applyPriorityRules,
  applyQuietHours,
  checkThrottle,
  dispatchInApp,
  dispatchNotification,
} from "./notification-router";
import type { DispatchOptions } from "./notification-router";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const NOTIF_ID = "notif-abc";
const CREATED_AT = new Date("2026-04-26T10:00:00.000Z");
const BASE_NOTIF = { id: NOTIF_ID, createdAt: CREATED_AT };

function makeOptions(overrides: Partial<DispatchOptions> = {}): DispatchOptions {
  return {
    userId: "user-1",
    eventType: "portal.application.submitted",
    content: { title: "New Application", body: "Ada applied", link: "/admin/applications/app-1" },
    dedupKey: "notif:app-submitted:app-1",
    ...overrides,
  };
}

// ── Step 1: resolveChannels ───────────────────────────────────────────────────

describe("resolveChannels()", () => {
  beforeEach(() => {
    // Clear call counts so "not been called" assertions are accurate
    mockRedisGet.mockClear();
    mockGetNotificationPreferences.mockClear();
    mockRedisSet.mockClear();
    // Default: cache miss → DB returns no saved prefs
    mockRedisGet.mockResolvedValue(null);
    mockGetNotificationPreferences.mockResolvedValue({});
  });

  it("returns catalog defaultChannels for a known high-priority event (no user prefs)", async () => {
    const ch = await resolveChannels("user-1", "portal.application.status_changed");
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("returns catalog defaultChannels for a known system-critical event (no user prefs)", async () => {
    const ch = await resolveChannels("user-1", "portal.application.submitted");
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("returns catalog defaultChannels for a known low-priority event (push: false)", async () => {
    const ch = await resolveChannels("user-1", "portal.saved_search.new_results");
    expect(ch).toEqual({ inApp: true, push: false, email: false });
  });

  it("returns all-disabled for unknown event type (fail-closed)", async () => {
    const ch = await resolveChannels("user-1", "portal.unknown.event");
    expect(ch).toEqual({ inApp: false, push: false, email: false });
  });

  it("returns all-disabled for empty string event type", async () => {
    const ch = await resolveChannels("user-1", "");
    expect(ch).toEqual({ inApp: false, push: false, email: false });
  });

  it("returns user preference when saved — email disabled", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.job.expired": { channelInApp: true, channelPush: true, channelEmail: false },
    });
    const ch = await resolveChannels("user-1", "portal.job.expired");
    expect(ch).toEqual({ inApp: true, push: true, email: false });
  });

  it("returns catalog defaults for event types not in saved prefs", async () => {
    // Only portal.job.expired saved; portal.application.status_changed falls back to catalog
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.job.expired": { channelInApp: true, channelPush: false, channelEmail: false },
    });
    const ch = await resolveChannels("user-1", "portal.application.status_changed");
    // catalog default: { inApp: true, push: true, email: true }
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("returns all-false for unknown event type even with saved prefs (unknown short-circuits before DB)", async () => {
    const ch = await resolveChannels("user-1", "portal.totally.unknown");
    // Unknown event type returns all-false before Redis/DB check
    expect(mockGetNotificationPreferences).not.toHaveBeenCalled();
    expect(ch).toEqual({ inApp: false, push: false, email: false });
  });

  it("uses cached value from Redis when available (no DB call)", async () => {
    const cached = {
      "portal.job.approved": { channelInApp: true, channelPush: false, channelEmail: false },
    };
    mockRedisGet.mockResolvedValue(JSON.stringify(cached));
    const ch = await resolveChannels("user-1", "portal.job.approved");
    expect(mockGetNotificationPreferences).not.toHaveBeenCalled();
    expect(ch).toEqual({ inApp: true, push: false, email: false });
  });

  it("fails-open with catalog defaults when getNotificationPreferences throws", async () => {
    mockGetNotificationPreferences.mockRejectedValue(new Error("DB down"));
    const ch = await resolveChannels("user-1", "portal.application.status_changed");
    // Fail-open: returns catalog defaults
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("fails-open with catalog defaults when Redis.get throws and DB also throws", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis down"));
    mockGetNotificationPreferences.mockRejectedValue(new Error("DB down"));
    const ch = await resolveChannels("user-1", "portal.job.approved");
    // Fail-open: returns catalog defaults
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("partial prefs: only push toggled — inApp+email from catalog", async () => {
    // Only channelPush is changed (false); inApp and email take user saved values
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.application.status_changed": {
        channelInApp: true,
        channelPush: false,
        channelEmail: true,
      },
    });
    const ch = await resolveChannels("user-1", "portal.application.status_changed");
    expect(ch).toEqual({ inApp: true, push: false, email: true });
  });

  // ── Digest-mode enforcement (AC #7) ─────────────────────────────────────────

  it("digest mode: suppresses email for low-priority event with digestMode=daily", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.saved_search.new_results": {
        channelInApp: true,
        channelPush: false,
        channelEmail: true,
        digestMode: "daily",
      },
    });
    const ch = await resolveChannels("user-1", "portal.saved_search.new_results");
    expect(ch).toEqual({ inApp: true, push: false, email: false });
  });

  it("digest mode: suppresses email for low-priority event with digestMode=weekly", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.match.new_recommendations": {
        channelInApp: true,
        channelPush: false,
        channelEmail: true,
        digestMode: "weekly",
      },
    });
    const ch = await resolveChannels("user-1", "portal.match.new_recommendations");
    expect(ch).toEqual({ inApp: true, push: false, email: false });
  });

  it("digest mode: does NOT suppress email for low-priority event with digestMode=none (instant delivery)", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.saved_search.new_results": {
        channelInApp: true,
        channelPush: false,
        channelEmail: true,
        digestMode: "none",
      },
    });
    const ch = await resolveChannels("user-1", "portal.saved_search.new_results");
    expect(ch).toEqual({ inApp: true, push: false, email: true });
  });

  it("digest mode: does NOT suppress email for HIGH-priority event even with digestMode=daily", async () => {
    // High-priority events bypass digest suppression
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.application.status_changed": {
        channelInApp: true,
        channelPush: true,
        channelEmail: true,
        digestMode: "daily",
      },
    });
    const ch = await resolveChannels("user-1", "portal.application.status_changed");
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });
});

// ── Step 2: applyPriorityRules ────────────────────────────────────────────────

describe("applyPriorityRules()", () => {
  it("overrides all channels to enabled for system-critical event", () => {
    const result = applyPriorityRules("portal.application.submitted", {
      inApp: false,
      push: false,
      email: false,
    });
    expect(result).toEqual({ inApp: true, push: true, email: true });
  });

  it("overrides partial channels for system-critical event", () => {
    const result = applyPriorityRules("portal.job.rejected", {
      inApp: true,
      push: false,
      email: false,
    });
    expect(result).toEqual({ inApp: true, push: true, email: true });
  });

  it("does not modify channels for high-priority event", () => {
    const channels = { inApp: true, push: false, email: true };
    const result = applyPriorityRules("portal.application.status_changed", channels);
    expect(result).toEqual(channels);
  });

  it("does not modify channels for unknown event type (fail-open)", () => {
    const channels = { inApp: true, push: true, email: true };
    const result = applyPriorityRules("portal.unknown", channels);
    expect(result).toEqual(channels);
  });
});

// ── Step 2.5: applyQuietHours ─────────────────────────────────────────────────

describe("applyQuietHours()", () => {
  beforeEach(() => {
    mockIsUserInQuietHours.mockResolvedValue(false);
  });

  it("suppresses push and email when user is in quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    const channels = { inApp: true, push: true, email: true };
    const result = await applyQuietHours("user-1", "portal.application.status_changed", channels);
    expect(result).toEqual({ inApp: true, push: false, email: false });
  });

  it("does NOT suppress in-app during quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    const channels = { inApp: true, push: true, email: true };
    const result = await applyQuietHours("user-1", "portal.application.status_changed", channels);
    expect(result.inApp).toBe(true);
  });

  it("does NOT suppress system-critical events during quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    const channels = { inApp: true, push: true, email: true };
    const result = await applyQuietHours("user-1", "portal.application.submitted", channels);
    expect(result).toEqual({ inApp: true, push: true, email: true });
  });

  it("does NOT suppress when user is NOT in quiet hours", async () => {
    mockIsUserInQuietHours.mockResolvedValue(false);
    const channels = { inApp: true, push: true, email: true };
    const result = await applyQuietHours("user-1", "portal.job.approved", channels);
    expect(result).toEqual({ inApp: true, push: true, email: true });
  });

  it("fails-open (no suppression) when isUserInQuietHours throws", async () => {
    mockIsUserInQuietHours.mockRejectedValue(new Error("DB down"));
    const channels = { inApp: true, push: true, email: true };
    const result = await applyQuietHours("user-1", "portal.job.approved", channels);
    expect(result).toEqual({ inApp: true, push: true, email: true });
  });
});

// ── Step 3: checkThrottle ────────────────────────────────────────────────────

describe("checkThrottle()", () => {
  beforeEach(() => {
    redisNxStore.clear();
    mockRedisSet.mockClear();
  });

  it("returns false on first call (key not set → 'OK' → proceed)", async () => {
    const throttled = await checkThrottle("test:key", 30);
    expect(throttled).toBe(false);
  });

  it("returns true on second call (key already set → null → throttled)", async () => {
    await checkThrottle("test:key", 30);
    const throttled = await checkThrottle("test:key", 30);
    expect(throttled).toBe(true);
  });

  it("returns false if Redis throws (fail-open)", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("Redis down"));
    const throttled = await checkThrottle("test:key", 30);
    expect(throttled).toBe(false);
  });

  it("uses SET NX EX with correct params", async () => {
    await checkThrottle("throttle:key", 60);
    expect(mockRedisSet).toHaveBeenCalledWith("throttle:key", "1", "EX", 60, "NX");
  });
});

// ── dispatchInApp ─────────────────────────────────────────────────────────────

describe("dispatchInApp()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateNotification.mockResolvedValue(BASE_NOTIF);
    mockRedisPublish.mockResolvedValue(1);
    mockInvalidateUnreadCount.mockResolvedValue(undefined);
  });

  it("calls createPortalNotification with correct args (portal_notifications table)", async () => {
    await dispatchInApp(
      "user-1",
      "portal.application.submitted",
      { title: "Title", body: "Body", link: "/link" },
      "dedup:key",
    );
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: "user-1",
      eventType: "portal.application.submitted",
      title: "Title",
      body: "Body",
      link: "/link",
      payloadJson: { title: "Title", body: "Body", link: "/link" },
      idempotencyKey: "dedup:key",
    });
  });

  it("publishes to Redis channel 'eventbus:notification.created'", async () => {
    await dispatchInApp("user-1", "portal.application.submitted", { title: "T", body: "B" }, "key");
    expect(mockRedisPublish).toHaveBeenCalledWith(
      "eventbus:notification.created",
      expect.any(String),
    );
  });

  it("published payload includes correct fields (eventbus-bridge contract)", async () => {
    await dispatchInApp(
      "user-1",
      "portal.job.approved",
      { title: "Job Approved", body: "Your job was approved", link: "/jobs/1" },
      "notif:job-reviewed:job-1:approved",
    );
    const raw = mockRedisPublish.mock.calls[0]![1] as string;
    const payload = JSON.parse(raw);
    expect(payload).toMatchObject({
      notificationId: NOTIF_ID,
      userId: "user-1",
      type: "portal.job.approved",
      title: "Job Approved",
      body: "Your job was approved",
      link: "/jobs/1",
      eventType: "portal.job.approved",
    });
    expect(typeof payload.eventId).toBe("string");
    expect(payload.version).toBe(1);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("skips Redis publish when createNotification returns null (DB dedup)", async () => {
    mockCreateNotification.mockResolvedValue(null);
    await dispatchInApp("user-1", "portal.application.submitted", { title: "T", body: "B" }, "k");
    expect(mockRedisPublish).not.toHaveBeenCalled();
  });

  it("payload link is undefined when not provided", async () => {
    await dispatchInApp("user-1", "portal.application.submitted", { title: "T", body: "B" }, "k");
    const raw = mockRedisPublish.mock.calls[0]![1] as string;
    const payload = JSON.parse(raw);
    expect(payload.link).toBeUndefined();
  });

  it("redis.publish failure propagates rejection from dispatchInApp", async () => {
    mockRedisPublish.mockRejectedValueOnce(new Error("Redis publish down"));
    await expect(
      dispatchInApp("user-1", "portal.application.submitted", { title: "T", body: "B" }, "k"),
    ).rejects.toThrow("Redis publish down");
  });
});

// ── publishNotificationCreated absorption regression ──────────────────────────

describe("publishNotificationCreated absorption — channel name + payload contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateNotification.mockResolvedValue(BASE_NOTIF);
    mockRedisPublish.mockResolvedValue(1);
    mockInvalidateUnreadCount.mockResolvedValue(undefined);
  });

  it("always publishes to exact channel 'eventbus:notification.created' (bridge contract)", async () => {
    await dispatchInApp("u", "portal.message.received", { title: "T", body: "B" }, "k");
    expect(mockRedisPublish.mock.calls[0]![0]).toBe("eventbus:notification.created");
  });

  it("payload notificationId matches the created notification id", async () => {
    await dispatchInApp("u", "portal.job.expired", { title: "T", body: "B" }, "k");
    const payload = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(payload.notificationId).toBe(NOTIF_ID);
  });

  it("payload userId matches the recipient", async () => {
    await dispatchInApp("recipient-xyz", "portal.job.approved", { title: "T", body: "B" }, "k");
    const payload = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(payload.userId).toBe("recipient-xyz");
  });

  it("payload type matches eventType (not hardcoded 'system')", async () => {
    await dispatchInApp("u", "portal.application.submitted", { title: "T", body: "B" }, "k");
    const payload = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(payload.type).toBe("portal.application.submitted");
    expect(payload.eventType).toBe("portal.application.submitted");
  });

  it("payload timestamp matches notification createdAt ISO string", async () => {
    await dispatchInApp("u", "portal.application.submitted", { title: "T", body: "B" }, "k");
    const payload = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(payload.timestamp).toBe(CREATED_AT.toISOString());
  });
});

// ── dispatchNotification — full pipeline ─────────────────────────────────────

describe("dispatchNotification()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    redisNxStore.clear();
    // Set up defaults for the new async dependencies
    mockRedisGet.mockResolvedValue(null); // cache miss
    mockGetNotificationPreferences.mockResolvedValue({}); // no saved prefs
    mockIsUserInQuietHours.mockResolvedValue(false); // not in quiet hours
    // Existing defaults
    mockCreateNotification.mockResolvedValue(BASE_NOTIF);
    mockRedisPublish.mockResolvedValue(1);
    mockSendPushNotification.mockResolvedValue(undefined);
    mockEnqueueEmailJob.mockResolvedValue(true);
    mockInvalidateUnreadCount.mockResolvedValue(undefined);
  });

  it("dispatches in-app when channels enable it", async () => {
    await dispatchNotification(makeOptions());
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("skips push when pushPayload is omitted", async () => {
    await dispatchNotification(makeOptions({ pushPayload: undefined }));
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it("dispatches push when pushPayload is provided and channel enabled", async () => {
    await dispatchNotification(
      makeOptions({
        pushPayload: { title: "T", body: "B", link: "/link" },
      }),
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith("user-1", {
      title: "T",
      body: "B",
      link: "/link",
    });
  });

  it("skips email when emailJob is omitted", async () => {
    await dispatchNotification(makeOptions({ emailJob: undefined }));
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("dispatches email when emailJob is provided and channel enabled", async () => {
    const emailJob = {
      name: "email-abc",
      payload: {
        to: "seeker@example.com",
        templateId: "app-confirmation",
        data: {},
      },
    };
    // Use system-critical event so email channel is enabled
    await dispatchNotification(
      makeOptions({
        eventType: "portal.application.submitted",
        emailJob,
      }),
    );
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith("email-abc", emailJob.payload);
  });

  it("push failure does not block in-app (channel isolation)", async () => {
    mockSendPushNotification.mockRejectedValue(new Error("Push VAPID error"));
    await expect(
      dispatchNotification(makeOptions({ pushPayload: { title: "T", body: "B", link: "/" } })),
    ).resolves.not.toThrow();
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("in-app failure + push success — both attempted, no exception propagated", async () => {
    mockCreateNotification.mockRejectedValue(new Error("DB down"));
    await expect(
      dispatchNotification(makeOptions({ pushPayload: { title: "T", body: "B", link: "/" } })),
    ).resolves.not.toThrow();
    expect(mockSendPushNotification).toHaveBeenCalled();
  });

  it("all channels throw — no exception propagated", async () => {
    mockCreateNotification.mockRejectedValue(new Error("DB down"));
    mockSendPushNotification.mockRejectedValue(new Error("Push down"));
    mockEnqueueEmailJob.mockRejectedValue(new Error("Email down"));
    await expect(
      dispatchNotification(
        makeOptions({
          eventType: "portal.application.submitted",
          pushPayload: { title: "T", body: "B", link: "/" },
          emailJob: {
            name: "e",
            payload: { to: "x@x.com", templateId: "t", data: {} },
          },
        }),
      ),
    ).resolves.not.toThrow();
  });

  it("throttle: Redis returns null (throttled) → returns early, no createNotification call", async () => {
    // Pre-set throttle key in store so it returns null
    redisNxStore.set("portal:throttle:notif:user-1:portal.application.status_changed", "1");
    await dispatchNotification(makeOptions({ eventType: "portal.application.status_changed" }));
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("throttle: Redis throws → notification still dispatched (fail-open)", async () => {
    mockRedisSet.mockRejectedValueOnce(new Error("Redis down"));
    await dispatchNotification(makeOptions({ eventType: "portal.application.status_changed" }));
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  it("uses custom throttleKey when provided", async () => {
    await dispatchNotification(
      makeOptions({
        eventType: "portal.message.received",
        throttleKey: "portal:throttle:msg:sender:recip:app-1",
      }),
    );
    // The custom key should be used for throttle check
    expect(mockRedisSet).toHaveBeenCalledWith(
      "portal:throttle:msg:sender:recip:app-1",
      "1",
      "EX",
      120,
      "NX",
    );
  });

  it("uses default throttleKey pattern when throttleKey is absent (userId + eventType)", async () => {
    await dispatchNotification(makeOptions({ eventType: "portal.application.status_changed" }));
    expect(mockRedisSet).toHaveBeenCalledWith(
      "portal:throttle:notif:user-1:portal.application.status_changed",
      "1",
      "EX",
      60,
      "NX",
    );
  });

  it("system-critical event overrides all-disabled channels to enabled (priority override)", async () => {
    // portal.saved_search.new_results has push: false by default
    // But portal.application.submitted is system-critical → push: true
    await dispatchNotification(
      makeOptions({
        eventType: "portal.application.submitted",
        pushPayload: { title: "T", body: "B", link: "/" },
      }),
    );
    expect(mockSendPushNotification).toHaveBeenCalled();
  });

  it("unknown event type → all channels disabled → returns silently without creating notification", async () => {
    await expect(
      dispatchNotification({
        userId: "user-1",
        // @ts-expect-error — intentionally passing unknown type for test
        eventType: "portal.unknown.event",
        content: { title: "T", body: "B" },
        dedupKey: "k",
      }),
    ).resolves.not.toThrow();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("empty channels (portal.saved_search.new_results without push/email) → only in-app dispatched", async () => {
    await dispatchNotification(
      makeOptions({
        eventType: "portal.saved_search.new_results",
        // no pushPayload, no emailJob
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalled();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("event with no throttle window (portal.job.approved) → no Redis SET NX call for throttle", async () => {
    await dispatchNotification(makeOptions({ eventType: "portal.job.approved" }));
    // Only non-NX SET calls (cache warming from resolveChannels) should be present
    const nxCalls = mockRedisSet.mock.calls.filter((c: unknown[]) => c[4] === "NX");
    expect(nxCalls).toHaveLength(0);
  });

  it("Promise.allSettled result — no exception even when rejected", async () => {
    mockCreateNotification.mockRejectedValue(new Error("fail"));
    const result = dispatchNotification(makeOptions());
    await expect(result).resolves.toBeUndefined();
  });

  it("redis.publish failure in dispatchInApp — push channel still dispatched (channel isolation)", async () => {
    mockRedisPublish.mockRejectedValueOnce(new Error("Redis publish down"));
    await expect(
      dispatchNotification(
        makeOptions({
          eventType: "portal.application.submitted",
          pushPayload: { title: "T", body: "B", link: "/" },
        }),
      ),
    ).resolves.not.toThrow();
    expect(mockSendPushNotification).toHaveBeenCalled();
  });

  it("throttle expiry — notification dispatched after throttle key is cleared (simulates TTL expiry)", async () => {
    // First call: sets throttle key → notification dispatched
    await dispatchNotification(makeOptions({ eventType: "portal.application.status_changed" }));
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);

    // Second call: throttle key exists → throttled, no notification
    await dispatchNotification(makeOptions({ eventType: "portal.application.status_changed" }));
    expect(mockCreateNotification).toHaveBeenCalledTimes(1); // still 1

    // Simulate TTL expiry by clearing the NX store
    redisNxStore.clear();

    // Third call: throttle key expired → notification dispatched again
    await dispatchNotification(makeOptions({ eventType: "portal.application.status_changed" }));
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  // ── Async regression tests: confirm await chain is intact ─────────────────

  it("dispatchNotification with unknown event type → zero sender calls (all-false channel set)", async () => {
    await dispatchNotification({
      userId: "user-1",
      // @ts-expect-error intentionally unknown
      eventType: "portal.unknown.xyz",
      content: { title: "T", body: "B" },
      dedupKey: "k",
      pushPayload: { title: "T", body: "B", link: "/" },
      emailJob: { name: "e", payload: { to: "x@x.com", templateId: "t", data: {} } },
    });
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("resolveChannels DB prefs used — email disabled, push+inApp dispatched", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.application.status_changed": {
        channelInApp: true,
        channelPush: true,
        channelEmail: false,
      },
    });
    await dispatchNotification(
      makeOptions({
        eventType: "portal.application.status_changed",
        pushPayload: { title: "T", body: "B", link: "/" },
        emailJob: { name: "e", payload: { to: "x@x.com", templateId: "t", data: {} } },
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalled(); // inApp
    expect(mockSendPushNotification).toHaveBeenCalled(); // push
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled(); // email disabled
  });

  it("resolveChannels DB prefs used — all channels disabled, dispatch returns early", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.job.approved": {
        channelInApp: false,
        channelPush: false,
        channelEmail: false,
      },
    });
    await dispatchNotification(
      makeOptions({
        eventType: "portal.job.approved",
        pushPayload: { title: "T", body: "B", link: "/" },
        emailJob: { name: "e", payload: { to: "x@x.com", templateId: "t", data: {} } },
      }),
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("resolveChannels DB prefs used — only inApp enabled, push+email dispatchers not called", async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      "portal.application.withdrawn": {
        channelInApp: true,
        channelPush: false,
        channelEmail: false,
      },
    });
    await dispatchNotification(
      makeOptions({
        eventType: "portal.application.withdrawn",
        pushPayload: { title: "T", body: "B", link: "/" },
        emailJob: { name: "e", payload: { to: "x@x.com", templateId: "t", data: {} } },
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalled(); // inApp dispatched
    expect(mockSendPushNotification).not.toHaveBeenCalled();
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });

  it("quiet hours: suppresses push+email for high-priority event — in-app still sent", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    await dispatchNotification(
      makeOptions({
        eventType: "portal.application.status_changed",
        pushPayload: { title: "T", body: "B", link: "/" },
        emailJob: { name: "e", payload: { to: "x@x.com", templateId: "t", data: {} } },
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalled(); // in-app delivered
    expect(mockSendPushNotification).not.toHaveBeenCalled(); // push suppressed
    expect(mockEnqueueEmailJob).not.toHaveBeenCalled(); // email suppressed
  });

  it("quiet hours: does NOT suppress system-critical — all channels delivered", async () => {
    mockIsUserInQuietHours.mockResolvedValue(true);
    await dispatchNotification(
      makeOptions({
        eventType: "portal.application.submitted",
        pushPayload: { title: "T", body: "B", link: "/" },
        emailJob: { name: "e", payload: { to: "x@x.com", templateId: "t", data: {} } },
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalled(); // in-app
    expect(mockSendPushNotification).toHaveBeenCalled(); // push not suppressed
    expect(mockEnqueueEmailJob).toHaveBeenCalled(); // email not suppressed
  });
});
