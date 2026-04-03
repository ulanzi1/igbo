// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  const MockRedis = vi.fn(function (
    this: { quit: typeof mockQuit; on: ReturnType<typeof vi.fn> },
    _url: string,
    _options?: { connectionName?: string },
  ) {
    this.quit = mockQuit;
    this.on = vi.fn().mockReturnThis();
  });
  return { default: MockRedis };
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.REDIS_URL = "redis://localhost:6379";
});

describe("getRedisClient", () => {
  it("returns same instance on repeated calls (singleton)", async () => {
    const { getRedisClient } = await import("./redis");
    const a = getRedisClient();
    const b = getRedisClient();
    expect(a).toBe(b);
  });

  it("creates instance with igbo:portal:general connection name", async () => {
    const ioredis = await import("ioredis");
    const MockRedis = vi.mocked(ioredis.default);
    const { getRedisClient } = await import("./redis");
    getRedisClient();
    expect(MockRedis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connectionName: "igbo:portal:general" }),
    );
  });
});

describe("getRedisPublisher", () => {
  it("returns different instance from getRedisClient", async () => {
    const { getRedisClient, getRedisPublisher } = await import("./redis");
    const client = getRedisClient();
    const publisher = getRedisPublisher();
    expect(publisher).not.toBe(client);
  });

  it("returns same publisher instance on repeated calls (singleton)", async () => {
    const { getRedisPublisher } = await import("./redis");
    const a = getRedisPublisher();
    const b = getRedisPublisher();
    expect(a).toBe(b);
  });

  it("creates instance with igbo:portal:publisher connection name", async () => {
    const ioredis = await import("ioredis");
    const MockRedis = vi.mocked(ioredis.default);
    const { getRedisPublisher } = await import("./redis");
    getRedisPublisher();
    const calls = MockRedis.mock.calls;
    const publisherCall = calls.find(
      (args) =>
        ((args as unknown[])[1] as { connectionName?: string } | undefined)?.connectionName ===
        "igbo:portal:publisher",
    );
    expect(publisherCall).toBeDefined();
  });
});

describe("getRedisSubscriber", () => {
  it("returns different instance from getRedisPublisher", async () => {
    const { getRedisPublisher, getRedisSubscriber } = await import("./redis");
    const publisher = getRedisPublisher();
    const subscriber = getRedisSubscriber();
    expect(subscriber).not.toBe(publisher);
  });

  it("returns same subscriber instance on repeated calls (singleton)", async () => {
    const { getRedisSubscriber } = await import("./redis");
    const a = getRedisSubscriber();
    const b = getRedisSubscriber();
    expect(a).toBe(b);
  });

  it("creates instance with igbo:portal:subscriber connection name", async () => {
    const ioredis = await import("ioredis");
    const MockRedis = vi.mocked(ioredis.default);
    const { getRedisSubscriber } = await import("./redis");
    getRedisSubscriber();
    const calls = MockRedis.mock.calls;
    const subscriberCall = calls.find(
      (args) =>
        ((args as unknown[])[1] as { connectionName?: string } | undefined)?.connectionName ===
        "igbo:portal:subscriber",
    );
    expect(subscriberCall).toBeDefined();
  });
});

describe("closeAllRedisConnections", () => {
  it("calls quit() on all active clients", async () => {
    const { getRedisClient, getRedisPublisher, getRedisSubscriber, closeAllRedisConnections } =
      await import("./redis");

    getRedisClient();
    getRedisPublisher();
    getRedisSubscriber();

    await closeAllRedisConnections();

    expect(mockQuit).toHaveBeenCalledTimes(3);
  });

  it("resets singleton references so new instances are created after close", async () => {
    const { getRedisClient, closeAllRedisConnections } = await import("./redis");

    const before = getRedisClient();
    await closeAllRedisConnections();
    const after = getRedisClient();

    expect(after).not.toBe(before);
  });

  it("only calls quit() on clients that were created", async () => {
    const { getRedisClient, closeAllRedisConnections } = await import("./redis");

    // Only create general client — publisher and subscriber not created
    getRedisClient();
    await closeAllRedisConnections();

    // Only 1 quit call (for general client)
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });
});
