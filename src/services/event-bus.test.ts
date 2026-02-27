// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPublish = vi.fn().mockResolvedValue(1);

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (this: {
    publish: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }) {
    this.publish = mockPublish;
    this.quit = vi.fn().mockResolvedValue("OK");
    this.on = vi.fn();
  });
  return { default: MockRedis };
});

describe("EventBus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  async function getEventBus() {
    const { eventBus } = await import("./event-bus");
    return eventBus;
  }

  it("emits events to registered handlers with typed payloads", async () => {
    const bus = await getEventBus();
    const handler = vi.fn();

    bus.on("user.created", handler);
    bus.emit("user.created", { userId: "u1", timestamp: "2026-01-01T00:00:00Z" });

    expect(handler).toHaveBeenCalledWith({
      userId: "u1",
      timestamp: "2026-01-01T00:00:00Z",
    });
  });

  it("supports multiple handlers for the same event", async () => {
    const bus = await getEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on("post.published", handler1);
    bus.on("post.published", handler2);
    bus.emit("post.published", {
      postId: "p1",
      authorId: "a1",
      timestamp: "2026-01-01T00:00:00Z",
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("removes handlers with off()", async () => {
    const bus = await getEventBus();
    const handler = vi.fn();

    bus.on("message.sent", handler);
    bus.off("message.sent", handler);
    bus.emit("message.sent", {
      messageId: "m1",
      senderId: "s1",
      conversationId: "c1",
      timestamp: "2026-01-01T00:00:00Z",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("once() handler fires only once", async () => {
    const bus = await getEventBus();
    const handler = vi.fn();
    const payload = {
      userId: "u1",
      points: 10,
      reason: "login",
      timestamp: "2026-01-01T00:00:00Z",
    };

    bus.once("points.awarded", handler);
    bus.emit("points.awarded", payload);
    bus.emit("points.awarded", payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("publishes events to Redis channel on emit", async () => {
    const bus = await getEventBus();
    const payload = { userId: "u1", timestamp: "2026-01-01T00:00:00Z" };

    bus.emit("user.created", payload);

    expect(mockPublish).toHaveBeenCalledWith("eventbus:user.created", JSON.stringify(payload));
  });

  it("continues in-process delivery even if Redis publish fails", async () => {
    mockPublish.mockImplementationOnce(() => {
      throw new Error("Redis connection lost");
    });

    const bus = await getEventBus();
    const handler = vi.fn();

    bus.on("member.banned", handler);
    const payload = {
      userId: "u1",
      bannedBy: "admin1",
      timestamp: "2026-01-01T00:00:00Z",
    };

    bus.emit("member.banned", payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("removeAllListeners clears all handlers for an event", async () => {
    const bus = await getEventBus();
    const handler = vi.fn();

    bus.on("job.failed", handler);
    expect(bus.listenerCount("job.failed")).toBe(1);

    bus.removeAllListeners("job.failed");
    expect(bus.listenerCount("job.failed")).toBe(0);
  });

  it("listenerCount returns correct count", async () => {
    const bus = await getEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    expect(bus.listenerCount("user.created")).toBe(0);
    bus.on("user.created", h1);
    expect(bus.listenerCount("user.created")).toBe(1);
    bus.on("user.created", h2);
    expect(bus.listenerCount("user.created")).toBe(2);
  });

  it("exports a singleton eventBus instance", async () => {
    const { eventBus: bus1 } = await import("./event-bus");
    const { eventBus: bus2 } = await import("./event-bus");
    expect(bus1).toBe(bus2);
  });
});
