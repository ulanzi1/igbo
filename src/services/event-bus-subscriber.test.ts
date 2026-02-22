// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPsubscribe = vi.fn().mockResolvedValue(undefined);
const mockPunsubscribe = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();
const mockPublish = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue("OK");

// Store pmessage handler so tests can simulate incoming messages
let pmessageHandler: ((pattern: string, channel: string, message: string) => void) | null = null;

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (this: {
    psubscribe: ReturnType<typeof vi.fn>;
    punsubscribe: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  }) {
    this.psubscribe = mockPsubscribe;
    this.punsubscribe = mockPunsubscribe;
    this.on = vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === "pmessage") {
        pmessageHandler = handler as typeof pmessageHandler;
      }
    });
    this.publish = mockPublish;
    this.quit = mockQuit;
  });
  return { default: MockRedis };
});

vi.mock("@/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

describe("EventBus Subscriber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    pmessageHandler = null;
  });

  it("subscribes to eventbus:* pattern on start", async () => {
    const { startEventBusSubscriber } = await import("./event-bus-subscriber");
    await startEventBusSubscriber();

    expect(mockPsubscribe).toHaveBeenCalledWith("eventbus:*");
  });

  it("re-emits parsed messages on local EventBus", async () => {
    const { startEventBusSubscriber } = await import("./event-bus-subscriber");
    const { eventBus } = await import("./event-bus");
    const handler = vi.fn();

    eventBus.on("user.created", handler);
    await startEventBusSubscriber();

    // Simulate a Redis pmessage
    expect(pmessageHandler).not.toBeNull();
    pmessageHandler!(
      "eventbus:*",
      "eventbus:user.created",
      JSON.stringify({ userId: "u1", timestamp: "2026-01-01T00:00:00Z" }),
    );

    expect(handler).toHaveBeenCalledWith({
      userId: "u1",
      timestamp: "2026-01-01T00:00:00Z",
    });
  });

  it("ignores malformed messages without throwing", async () => {
    const { startEventBusSubscriber } = await import("./event-bus-subscriber");
    await startEventBusSubscriber();

    expect(pmessageHandler).not.toBeNull();
    expect(() => {
      pmessageHandler!("eventbus:*", "eventbus:user.created", "not-json{{{");
    }).not.toThrow();
  });

  it("unsubscribes on stop", async () => {
    const { startEventBusSubscriber, stopEventBusSubscriber } =
      await import("./event-bus-subscriber");
    await startEventBusSubscriber();
    await stopEventBusSubscriber();

    expect(mockPunsubscribe).toHaveBeenCalledWith("eventbus:*");
  });

  it("stopEventBusSubscriber is safe to call when not started", async () => {
    const { stopEventBusSubscriber } = await import("./event-bus-subscriber");
    await expect(stopEventBusSubscriber()).resolves.toBeUndefined();
    expect(mockPunsubscribe).not.toHaveBeenCalled();
  });
});
