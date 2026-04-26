// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// Reusable minimal payloads matching enriched event interfaces (include emittedBy for validation)
const JOB_PUBLISHED_PAYLOAD = {
  jobId: "j1",
  companyId: "cp-1",
  title: "Engineer",
  employmentType: "full_time",
  status: "active",
  emittedBy: "test",
};
const JOB_UPDATED_PAYLOAD = {
  jobId: "j1",
  companyId: "cp-1",
  changes: { title: "New" },
  emittedBy: "test",
};
const JOB_CLOSED_PAYLOAD = { jobId: "j1", companyId: "cp-1", emittedBy: "test" };
const APP_SUBMITTED_PAYLOAD = {
  applicationId: "a1",
  jobId: "j1",
  seekerUserId: "u1",
  companyId: "cp-1",
  employerUserId: "u-emp-1",
  emittedBy: "test",
};

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
    bus.emit("job.published", JOB_PUBLISHED_PAYLOAD);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ jobId: "j1" }));
    bus.removeAllListeners();
  });

  it("auto-injects eventId (UUID format) when caller omits it", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", JOB_PUBLISHED_PAYLOAD);
    const payload = handler.mock.calls[0]![0] as { eventId: string };
    expect(payload.eventId).toMatch(UUID_REGEX);
    bus.removeAllListeners();
  });

  it("auto-injects version=1 when caller omits it", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", JOB_PUBLISHED_PAYLOAD);
    const payload = handler.mock.calls[0]![0] as { version: number };
    expect(payload.version).toBe(1);
    bus.removeAllListeners();
  });

  it("auto-injects ISO 8601 timestamp when caller omits it", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", JOB_PUBLISHED_PAYLOAD);
    const payload = handler.mock.calls[0]![0] as { timestamp: string };
    expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    bus.removeAllListeners();
  });

  it("preserves caller-provided eventId if explicitly passed", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    // Must be a valid UUID since schemas enforce z.string().uuid()
    const customEventId = "550e8400-e29b-41d4-a716-446655440000";
    bus.emit("job.published", { ...JOB_PUBLISHED_PAYLOAD, eventId: customEventId });
    const payload = handler.mock.calls[0]![0] as { eventId: string };
    expect(payload.eventId).toBe(customEventId);
    bus.removeAllListeners();
  });

  it("preserves caller-provided version if explicitly passed", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    bus.emit("job.published", { ...JOB_PUBLISHED_PAYLOAD, version: 2 });
    const payload = handler.mock.calls[0]![0] as { version: number };
    expect(payload.version).toBe(2);
    bus.removeAllListeners();
  });

  it("preserves caller-provided timestamp if explicitly passed", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    const ts = "2026-01-01T00:00:00.000Z";
    bus.emit("job.published", { ...JOB_PUBLISHED_PAYLOAD, timestamp: ts });
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

    bus.emit("job.published", JOB_PUBLISHED_PAYLOAD);

    expect(mockPublish).toHaveBeenCalledWith(
      "eventbus:job.published",
      expect.stringContaining('"companyId":"cp-1"'),
    );
    bus.removeAllListeners();
  });

  it("works without Redis (before setPublisher is called) — local handlers still fire", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);

    // No setPublisher() called — should not throw
    expect(() => bus.emit("job.published", JOB_PUBLISHED_PAYLOAD)).not.toThrow();
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
    expect(() => bus.emit("job.published", JOB_PUBLISHED_PAYLOAD)).not.toThrow();
    // Local handler still fires
    expect(handler).toHaveBeenCalled();
    bus.removeAllListeners();
  });

  it("emit('job.published', { jobId }) is type-safe without envelope fields", async () => {
    const bus = await getBus();
    // TypeScript compilation success = this test passing at type-level
    bus.emit("job.published", JOB_PUBLISHED_PAYLOAD); // no eventId/version/timestamp
    bus.emit("application.submitted", APP_SUBMITTED_PAYLOAD);
    // Test passes if TypeScript doesn't complain (no runtime assertion needed)
    expect(true).toBe(true);
  });
});

describe("on() and off()", () => {
  it("correctly registers and unregisters handlers", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.updated", handler);
    bus.emit("job.updated", JOB_UPDATED_PAYLOAD);
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off("job.updated", handler);
    bus.emit("job.updated", { ...JOB_UPDATED_PAYLOAD, jobId: "j2" });
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — not called again
    bus.removeAllListeners();
  });
});

describe("once()", () => {
  it("fires handler only once", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.once("job.closed", handler);
    bus.emit("job.closed", JOB_CLOSED_PAYLOAD);
    bus.emit("job.closed", { ...JOB_CLOSED_PAYLOAD, jobId: "j2" });
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
      ...JOB_PUBLISHED_PAYLOAD,
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

describe("emit() — Zod validation", () => {
  it("succeeds with valid payload including emittedBy", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    expect(() => bus.emit("job.published", JOB_PUBLISHED_PAYLOAD)).not.toThrow();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ emittedBy: "test" }));
    bus.removeAllListeners();
  });

  it("throws ZodError when emittedBy is missing", async () => {
    const bus = await getBus();
    expect(() =>
      bus.emit("job.published", {
        jobId: "j1",
        companyId: "cp-1",
        title: "Engineer",
        employmentType: "full_time",
        status: "active",
        // emittedBy intentionally omitted
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow();
    bus.removeAllListeners();
  });

  it("throws ZodError when required field has wrong type (number instead of string)", async () => {
    const bus = await getBus();
    expect(() =>
      bus.emit("job.published", {
        jobId: 42, // should be string
        companyId: "cp-1",
        title: "Engineer",
        employmentType: "full_time",
        status: "active",
        emittedBy: "test",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow();
    bus.removeAllListeners();
  });

  it("throws ZodError when required field is missing entirely", async () => {
    const bus = await getBus();
    expect(() =>
      bus.emit("application.submitted", {
        // missing applicationId
        jobId: "j1",
        seekerUserId: "u1",
        companyId: "cp-1",
        employerUserId: "u-emp-1",
        emittedBy: "test",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow();
    bus.removeAllListeners();
  });

  it("emitLocal does NOT validate — accepts payload without emittedBy", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);

    // Payload without emittedBy — would fail emit() validation but emitLocal skips it
    const payload = {
      jobId: "j1",
      companyId: "cp-1",
      title: "Engineer",
      employmentType: "full_time",
      status: "active",
      eventId: "00000000-0000-4000-8000-000000000001",
      version: 1 as const,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => bus.emitLocal("job.published", payload as any)).not.toThrow();
    expect(handler).toHaveBeenCalledWith(payload);
    bus.removeAllListeners();
  });

  it("BaseEvent interface accepts emittedBy as optional (backward compat)", async () => {
    // Type-level test: BaseEvent with optional emittedBy compiles without emittedBy present
    const envelope = await import("@igbo/config/events").then((m) => m.createEventEnvelope());
    // emittedBy is optional — not set by createEventEnvelope
    expect(envelope.emittedBy).toBeUndefined();
    // idempotencyKey is optional too
    expect(envelope.idempotencyKey).toBeUndefined();
  });

  it("portalEventSchemas has an entry for all 20 portal event types", async () => {
    const { portalEventSchemas } = await import("@igbo/config/events");
    const expectedKeys = [
      "job.published",
      "job.updated",
      "job.closed",
      "job.expired",
      "job.expiry_warning",
      "application.submitted",
      "application.status_changed",
      "application.withdrawn",
      "job.viewed",
      "job.shared_to_community",
      "job.reviewed",
      "job.flagged",
      "posting.reported",
      "employer.verification_submitted",
      "employer.verification_approved",
      "employer.verification_rejected",
      "saved_search.new_result",
      "portal.message.sent",
      "portal.message.edited",
      "portal.message.deleted",
    ];
    for (const key of expectedKeys) {
      expect(portalEventSchemas).toHaveProperty(key);
    }
    expect(Object.keys(portalEventSchemas)).toHaveLength(20);
  });
});

describe("validate() — pre-transaction payload check", () => {
  it("succeeds with valid payload (does not emit)", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    expect(() => bus.validate("job.published", JOB_PUBLISHED_PAYLOAD)).not.toThrow();
    // validate() should NOT emit — handler should not be called
    expect(handler).not.toHaveBeenCalled();
    bus.removeAllListeners();
  });

  it("throws ZodError for invalid payload (does not emit)", async () => {
    const bus = await getBus();
    const handler = vi.fn();
    bus.on("job.published", handler);
    expect(() =>
      bus.validate("job.published", {
        jobId: "j1",
        companyId: "cp-1",
        title: "Engineer",
        employmentType: "full_time",
        status: "active",
        // emittedBy missing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow();
    expect(handler).not.toHaveBeenCalled();
    bus.removeAllListeners();
  });
});
