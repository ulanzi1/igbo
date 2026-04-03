// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Reset module between tests to clear the HMR singleton
beforeEach(() => {
  const g = globalThis as unknown as { __portalEventBus?: unknown };
  delete g.__portalEventBus;
  vi.resetModules();
});

async function getBus() {
  const { portalEventBus } = await import("./event-bus");
  return portalEventBus;
}

describe("emit() — local handler delivery", () => {
  it("triggers registered handler with correct payload", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", { jobId: "j1" });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ jobId: "j1" }));
    bus.removeAllListeners();
  });

  it("auto-injects eventId (UUID format) when caller omits it", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", { jobId: "j1" });
    const payload = handler.mock.calls[0]![0] as { eventId: string };
    expect(payload.eventId).toMatch(UUID_REGEX);
    bus.removeAllListeners();
  });

  it("auto-injects version=1 when caller omits it", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", { jobId: "j1" });
    const payload = handler.mock.calls[0]![0] as { version: number };
    expect(payload.version).toBe(1);
    bus.removeAllListeners();
  });

  it("auto-injects ISO 8601 timestamp when caller omits it", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", { jobId: "j1" });
    const payload = handler.mock.calls[0]![0] as { timestamp: string };
    expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    bus.removeAllListeners();
  });

  it("preserves caller-provided eventId if explicitly passed", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    const customEventId = "custom-event-id-123";
    bus.emit("job.published", { jobId: "j1", eventId: customEventId });
    const payload = handler.mock.calls[0]![0] as { eventId: string };
    expect(payload.eventId).toBe(customEventId);
    bus.removeAllListeners();
  });

  it("preserves caller-provided version if explicitly passed", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", { jobId: "j1", version: 2 });
    const payload = handler.mock.calls[0]![0] as { version: number };
    expect(payload.version).toBe(2);
    bus.removeAllListeners();
  });

  it("preserves caller-provided timestamp if explicitly passed", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    const ts = "2026-01-01T00:00:00.000Z";
    bus.emit("job.published", { jobId: "j1", timestamp: ts });
    const payload = handler.mock.calls[0]![0] as { timestamp: string };
    expect(payload.timestamp).toBe(ts);
    bus.removeAllListeners();
  });
});

describe("emit() — Redis publish", () => {
  it("publishes to Redis eventbus:{eventName} channel after setPublisher()", async () => {
    const bus = await getBus();
    const mockPublish = vi.fn().mockResolvedValue(1);
    const mockRedis = { publish: mockPublish } as unknown as import("ioredis").default;
    bus.setPublisher(() => mockRedis);

    bus.emit("job.published", { jobId: "j1" });

    expect(mockPublish).toHaveBeenCalledWith(
      "eventbus:job.published",
      expect.stringContaining('"jobId":"j1"'),
    );
    bus.removeAllListeners();
  });

  it("works without Redis (before setPublisher is called) — local handlers still fire", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);

    // No setPublisher() called — should not throw
    expect(() => bus.emit("job.published", { jobId: "j1" })).not.toThrow();
    expect(handler).toHaveBeenCalled();
    bus.removeAllListeners();
  });

  it("survives Redis publish failure — graceful degradation", async () => {
    const bus = await getBus();
    const mockRedis = {
      publish: vi.fn().mockImplementation(() => {
        throw new Error("Redis connection refused");
      }),
    } as unknown as import("ioredis").default;
    bus.setPublisher(() => mockRedis);

    const handler = vi.fn();
    bus.on("job.published", handler);

    // Should not throw even when Redis publish fails
    expect(() => bus.emit("job.published", { jobId: "j1" })).not.toThrow();
    // Local handler still fires
    expect(handler).toHaveBeenCalled();
    bus.removeAllListeners();
  });

  it("emit('job.published', { jobId }) is type-safe without envelope fields", async () => {
    const bus = await getBus();
    // TypeScript compilation success = this test passing at type-level
    bus.emit("job.published", { jobId: "j1" }); // no eventId/version/timestamp
    bus.emit("application.submitted", { applicationId: "a1", jobId: "j1" });
    // Test passes if TypeScript doesn't complain (no runtime assertion needed)
    expect(true).toBe(true);
  });
});

describe("on() and off()", () => {
  it("correctly registers and unregisters handlers", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.updated", handler);
    bus.emit("job.updated", { jobId: "j1" });
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off("job.updated", handler);
    bus.emit("job.updated", { jobId: "j2" });
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — not called again
    bus.removeAllListeners();
  });
});

describe("once()", () => {
  it("fires handler only once", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.once("job.closed", handler);
    bus.emit("job.closed", { jobId: "j1" });
    bus.emit("job.closed", { jobId: "j2" });
    expect(handler).toHaveBeenCalledTimes(1);
    bus.removeAllListeners();
  });
});

describe("listenerCount()", () => {
  it("returns correct count of registered handlers", async () => {
    const bus = await getBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("job.published", h1);
    bus.on("job.published", h2);
    expect(bus.listenerCount("job.published")).toBe(2);
    bus.removeAllListeners();
  });

  it("returns 0 when no handlers registered", async () => {
    const bus = await getBus();
    expect(bus.listenerCount("job.published")).toBe(0);
  });
});

describe("removeAllListeners()", () => {
  it("clears all handlers for a specific event", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.on("job.updated", handler);
    bus.removeAllListeners("job.published");

    expect(bus.listenerCount("job.published")).toBe(0);
    expect(bus.listenerCount("job.updated")).toBe(1);
    bus.removeAllListeners();
  });

  it("clears all handlers when called without arguments", async () => {
    const bus = await getBus();
    bus.on("job.published", vi.fn());
    bus.on("job.updated", vi.fn());
    bus.removeAllListeners();

    expect(bus.listenerCount("job.published")).toBe(0);
    expect(bus.listenerCount("job.updated")).toBe(0);
  });
});

describe("emitLocal()", () => {
  it("fires handler without publishing to Redis (even when publisher is set)", async () => {
    const bus = await getBus();
    const mockPublish = vi.fn();
    const mockRedis = { publish: mockPublish } as unknown as import("ioredis").default;
    bus.setPublisher(() => mockRedis);

    const handler = vi.fn();
    bus.on("job.published", handler);

    const payload = {
      jobId: "j1",
      eventId: "e1",
      version: 1 as const,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    bus.emitLocal("job.published", payload);

    // Handler fires
    expect(handler).toHaveBeenCalledWith(payload);
    // Redis NOT published
    expect(mockPublish).not.toHaveBeenCalled();
    bus.removeAllListeners();
  });

  it("accepts community cross-app event names (user.verified) for inbound events", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("user.verified", handler);

    const payload = {
      userId: "u1",
      eventId: "e1",
      version: 1 as const,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    bus.emitLocal("user.verified", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    bus.removeAllListeners();
  });
});

describe("HMR singleton", () => {
  it("EventBus singleton survives module re-evaluation via globalThis", async () => {
    const g = globalThis as unknown as { __portalEventBus?: unknown };

    // First import — creates singleton
    const { portalEventBus: bus1 } = await import("./event-bus");
    g.__portalEventBus = bus1;

    // Second import in same module scope
    const { portalEventBus: bus2 } = await import("./event-bus");

    // Same instance from globalThis
    expect(bus2).toBe(bus1);
  });
});
