// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@igbo/config/events", () => ({
  COMMUNITY_CROSS_APP_EVENTS: ["user.verified", "user.role_changed", "user.suspended"],
  createEventEnvelope: () => ({
    eventId: "generated-envelope-id",
    version: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
  }),
}));

const mockEmitLocal = vi.fn();
const mockEmit = vi.fn();
vi.mock("./event-bus", () => ({
  portalEventBus: {
    emitLocal: (...args: unknown[]) => mockEmitLocal(...args),
    emit: (...args: unknown[]) => mockEmit(...args),
  },
}));

import { startPortalEventBridge } from "./event-bridge";
import type Redis from "ioredis";

function makeSubscriber(): {
  subscriber: Redis;
  messageCallbacks: ((channel: string, message: string) => void)[];
  subscribeMock: ReturnType<typeof vi.fn>;
} {
  const messageCallbacks: ((channel: string, message: string) => void)[] = [];
  const subscribeMock = vi.fn().mockResolvedValue(3);
  const subscriber = {
    subscribe: subscribeMock,
    on: vi.fn((event: string, cb: (channel: string, message: string) => void) => {
      if (event === "message") messageCallbacks.push(cb);
    }),
  } as unknown as Redis;
  return { subscriber, messageCallbacks, subscribeMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startPortalEventBridge", () => {
  it("subscribes to all COMMUNITY_CROSS_APP_EVENTS channels", () => {
    const { subscriber, subscribeMock } = makeSubscriber();
    startPortalEventBridge(subscriber);
    expect(subscribeMock).toHaveBeenCalledWith(
      "eventbus:user.verified",
      "eventbus:user.role_changed",
      "eventbus:user.suspended",
    );
  });

  it("re-emits received message via portalEventBus.emitLocal() with parsed payload", () => {
    const { subscriber, messageCallbacks } = makeSubscriber();
    startPortalEventBridge(subscriber);

    const payload = {
      userId: "u1",
      eventId: "e1",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    messageCallbacks[0]?.("eventbus:user.verified", JSON.stringify(payload));

    // Caller-provided envelope fields override generated envelope
    expect(mockEmitLocal).toHaveBeenCalledWith(
      "user.verified",
      expect.objectContaining({
        userId: "u1",
        eventId: "e1",
        version: 1,
      }),
    );
  });

  it("injects envelope fields when community payload lacks eventId/version", () => {
    const { subscriber, messageCallbacks } = makeSubscriber();
    startPortalEventBridge(subscriber);

    // Community event without envelope fields (backward compat)
    const payload = { userId: "u1", timestamp: "2026-01-01T00:00:00.000Z" };
    messageCallbacks[0]?.("eventbus:user.verified", JSON.stringify(payload));

    // createEventEnvelope() injects generated eventId + version
    expect(mockEmitLocal).toHaveBeenCalledWith(
      "user.verified",
      expect.objectContaining({
        userId: "u1",
        eventId: "generated-envelope-id",
        version: 1,
      }),
    );
  });

  it("skips unknown event names not in COMMUNITY_CROSS_APP_EVENTS", () => {
    const { subscriber, messageCallbacks } = makeSubscriber();
    startPortalEventBridge(subscriber);

    messageCallbacks[0]?.("eventbus:unknown.event", JSON.stringify({ foo: "bar" }));
    expect(mockEmitLocal).not.toHaveBeenCalled();
  });

  it("calls emitLocal NOT emit — Redis must NOT be re-published (no infinite loop)", () => {
    const { subscriber, messageCallbacks } = makeSubscriber();
    startPortalEventBridge(subscriber);

    const payload = {
      userId: "u1",
      eventId: "e1",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    messageCallbacks[0]?.("eventbus:user.role_changed", JSON.stringify(payload));

    expect(mockEmitLocal).toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("silently skips malformed JSON message — no throw, emitLocal not called", () => {
    const { subscriber, messageCallbacks } = makeSubscriber();
    startPortalEventBridge(subscriber);

    expect(() => {
      messageCallbacks[0]?.("eventbus:user.verified", "not-valid-json{{{");
    }).not.toThrow();
    expect(mockEmitLocal).not.toHaveBeenCalled();
  });

  it("subscribe error is handled without crashing", async () => {
    const subscribeMock = vi.fn().mockRejectedValue(new Error("Redis connection refused"));
    const subscriber = {
      subscribe: subscribeMock,
      on: vi.fn(),
    } as unknown as Redis;

    expect(() => startPortalEventBridge(subscriber)).not.toThrow();

    // Wait for the rejected promise to be caught by the .catch() handler
    await new Promise((r) => setTimeout(r, 10));
    // Test passes if no unhandled promise rejection
  });

  it("strips eventbus: prefix from channel name when calling emitLocal", () => {
    const { subscriber, messageCallbacks } = makeSubscriber();
    startPortalEventBridge(subscriber);

    const payload = {
      userId: "u1",
      eventId: "e1",
      version: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    messageCallbacks[0]?.("eventbus:user.suspended", JSON.stringify(payload));

    // emitLocal receives "user.suspended" NOT "eventbus:user.suspended"
    expect(mockEmitLocal).toHaveBeenCalledWith(
      "user.suspended",
      expect.objectContaining({ userId: "u1" }),
    );
  });
});
