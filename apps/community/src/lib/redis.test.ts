// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (
    this: { quit: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> },
    _url: string,
    options?: { connectionName?: string },
  ) {
    this.quit = mockQuit;
    this.on = vi.fn();
    Object.assign(this, { connectionName: options?.connectionName });
  });
  return { default: MockRedis };
});

describe("Redis connection manager", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset singletons by re-importing fresh module
    vi.resetModules();
    // redis.ts reads process.env.REDIS_URL directly (not @/env)
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  it("getRedisClient returns a singleton instance", async () => {
    const { getRedisClient } = await import("./redis");
    const client1 = getRedisClient();
    const client2 = getRedisClient();
    expect(client1).toBe(client2);
  });

  it("getRedisPublisher returns a singleton instance", async () => {
    const { getRedisPublisher } = await import("./redis");
    const pub1 = getRedisPublisher();
    const pub2 = getRedisPublisher();
    expect(pub1).toBe(pub2);
  });

  it("getRedisSubscriber returns a singleton instance", async () => {
    const { getRedisSubscriber } = await import("./redis");
    const sub1 = getRedisSubscriber();
    const sub2 = getRedisSubscriber();
    expect(sub1).toBe(sub2);
  });

  it("returns separate instances for client, publisher, and subscriber", async () => {
    const { getRedisClient, getRedisPublisher, getRedisSubscriber } = await import("./redis");
    const client = getRedisClient();
    const publisher = getRedisPublisher();
    const subscriber = getRedisSubscriber();

    expect(client).not.toBe(publisher);
    expect(client).not.toBe(subscriber);
    expect(publisher).not.toBe(subscriber);
  });

  it("closeAllRedisConnections quits all active connections", async () => {
    const { getRedisClient, getRedisPublisher, getRedisSubscriber, closeAllRedisConnections } =
      await import("./redis");

    getRedisClient();
    getRedisPublisher();
    getRedisSubscriber();

    await closeAllRedisConnections();
    expect(mockQuit).toHaveBeenCalledTimes(3);
  });

  it("closeAllRedisConnections resets singletons so new instances are created", async () => {
    const { getRedisClient, closeAllRedisConnections } = await import("./redis");

    const client1 = getRedisClient();
    await closeAllRedisConnections();
    const client2 = getRedisClient();

    expect(client1).not.toBe(client2);
  });

  it("closeAllRedisConnections handles no active connections gracefully", async () => {
    const { closeAllRedisConnections } = await import("./redis");
    await expect(closeAllRedisConnections()).resolves.toBeUndefined();
    expect(mockQuit).not.toHaveBeenCalled();
  });
});
