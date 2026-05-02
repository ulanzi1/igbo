// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (referenced in vi.mock factories) ──────────────────────────

const {
  mockCreateNotification,
  mockSendPushNotification,
  mockEnqueueEmailJob,
  mockRedisSet,
  mockRedisPublish,
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
    redisNxStore,
  };
});

vi.mock("@igbo/db/queries/notifications", () => ({
  createNotification: mockCreateNotification,
}));

vi.mock("@/services/push-service", () => ({
  sendPushNotification: mockSendPushNotification,
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: mockEnqueueEmailJob,
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    set: mockRedisSet,
    publish: mockRedisPublish,
  })),
}));

vi.mock("@igbo/config/redis", () => ({
  createRedisKey: (...parts: string[]) => parts.join(":"),
}));

// ── Imports under test ─────────────────────────────────────────────────────────

import {
  resolveChannels,
  applyPriorityRules,
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
  it("returns catalog defaultChannels for a known high-priority event", () => {
    const ch = resolveChannels("user-1", "portal.application.status_changed");
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("returns catalog defaultChannels for a known system-critical event", () => {
    const ch = resolveChannels("user-1", "portal.application.submitted");
    expect(ch).toEqual({ inApp: true, push: true, email: true });
  });

  it("returns catalog defaultChannels for a known low-priority event (push: false)", () => {
    const ch = resolveChannels("user-1", "portal.saved_search.new_results");
    expect(ch).toEqual({ inApp: true, push: false, email: false });
  });

  it("returns all-disabled for unknown event type (fail-closed)", () => {
    const ch = resolveChannels("user-1", "portal.unknown.event");
    expect(ch).toEqual({ inApp: false, push: false, email: false });
  });

  it("returns all-disabled for empty string event type", () => {
    const ch = resolveChannels("user-1", "");
    expect(ch).toEqual({ inApp: false, push: false, email: false });
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
  });

  it("calls createNotification with correct args", async () => {
    await dispatchInApp(
      "user-1",
      "portal.application.submitted",
      { title: "Title", body: "Body", link: "/link" },
      "dedup:key",
    );
    expect(mockCreateNotification).toHaveBeenCalledWith({
      userId: "user-1",
      type: "system",
      title: "Title",
      body: "Body",
      link: "/link",
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
      type: "system",
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

  it("payload type is always 'system'", async () => {
    await dispatchInApp("u", "portal.application.submitted", { title: "T", body: "B" }, "k");
    const payload = JSON.parse(mockRedisPublish.mock.calls[0]![1] as string);
    expect(payload.type).toBe("system");
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
    mockCreateNotification.mockResolvedValue(BASE_NOTIF);
    mockRedisPublish.mockResolvedValue(1);
    mockSendPushNotification.mockResolvedValue(undefined);
    mockEnqueueEmailJob.mockResolvedValue(true);
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

  it("event with no throttle window (portal.job.approved) → no Redis SET call for throttle", async () => {
    await dispatchNotification(makeOptions({ eventType: "portal.job.approved" }));
    // Redis SET is only called by dispatchInApp (in-app) or throttle.
    // portal.job.approved has no throttle window, so SET is only for createNotification (none directly).
    // Actually createNotification doesn't call Redis directly — the throttle check doesn't run.
    // mockRedisSet should NOT be called for throttle (it would be in store for dedupKey but not via router).
    // Since this event has no THROTTLE_WINDOWS entry, no SET NX for throttle.
    // (createNotification is mocked, so no Redis there either)
    expect(mockRedisSet).not.toHaveBeenCalled();
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
});
