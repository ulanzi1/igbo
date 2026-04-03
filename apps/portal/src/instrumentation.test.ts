// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dynamic imports used by register()
const mockInitAuthRedis = vi.fn();
const mockGetRedisClient = vi.fn().mockReturnValue({ _name: "general" });
const mockGetRedisPublisher = vi.fn().mockReturnValue({ _name: "publisher" });
const mockGetRedisSubscriber = vi.fn().mockReturnValue({ _name: "subscriber" });
const mockSetPublisher = vi.fn();
const mockStartPortalEventBridge = vi.fn();

vi.mock("@igbo/auth", () => ({
  initAuthRedis: (...args: unknown[]) => mockInitAuthRedis(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
  getRedisPublisher: () => mockGetRedisPublisher(),
  getRedisSubscriber: () => mockGetRedisSubscriber(),
}));

vi.mock("@/services/event-bus", () => ({
  portalEventBus: {
    setPublisher: (...args: unknown[]) => mockSetPublisher(...args),
  },
}));

vi.mock("@/services/event-bridge", () => ({
  startPortalEventBridge: (...args: unknown[]) => mockStartPortalEventBridge(...args),
}));

import { register } from "./instrumentation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("register()", () => {
  it("calls initAuthRedis with Redis client from @/lib/redis", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    const expectedClient = mockGetRedisClient();
    expect(mockInitAuthRedis).toHaveBeenCalledWith(expectedClient);
  });

  it("calls portalEventBus.setPublisher() with a function returning the Redis publisher", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();

    expect(mockSetPublisher).toHaveBeenCalledWith(expect.any(Function));

    // Verify the getter function returns the publisher
    const getter = mockSetPublisher.mock.calls[0]?.[0] as () => unknown;
    const result = getter();
    expect(mockGetRedisPublisher).toHaveBeenCalled();
    expect(result).toEqual(mockGetRedisPublisher.mock.results[0]?.value);
  });

  it("calls startPortalEventBridge() with the Redis subscriber", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    const expectedSubscriber = mockGetRedisSubscriber();
    expect(mockStartPortalEventBridge).toHaveBeenCalledWith(expectedSubscriber);
  });

  it("is a no-op when NEXT_RUNTIME is not 'nodejs'", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await register();

    expect(mockInitAuthRedis).not.toHaveBeenCalled();
    expect(mockSetPublisher).not.toHaveBeenCalled();
    expect(mockStartPortalEventBridge).not.toHaveBeenCalled();

    delete process.env.NEXT_RUNTIME;
  });
});
