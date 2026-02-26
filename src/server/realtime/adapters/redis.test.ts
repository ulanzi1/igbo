// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const mockCreateAdapter = vi.hoisted(() => vi.fn().mockReturnValue("mock-adapter"));
const mockRedisOn = vi.hoisted(() => vi.fn());
const MockRedis = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { on: mockRedisOn };
  }),
);

vi.mock("@socket.io/redis-adapter", () => ({
  createAdapter: (...args: unknown[]) => mockCreateAdapter(...args),
}));

vi.mock("ioredis", () => ({ default: MockRedis }));

import { attachRedisAdapter } from "./redis";
import type { Server } from "socket.io";

describe("attachRedisAdapter", () => {
  it("creates two Redis instances and attaches adapter to the server", () => {
    const mockAdapter = vi.fn();
    const io = { adapter: mockAdapter } as unknown as Server;

    attachRedisAdapter(io, "redis://localhost:6379");

    // Two Redis clients: pub + sub
    expect(MockRedis).toHaveBeenCalledTimes(2);
    expect(MockRedis).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({ connectionName: "igbo:realtime:pub" }),
    );
    expect(MockRedis).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({ connectionName: "igbo:realtime:sub" }),
    );

    // Error handlers registered
    expect(mockRedisOn).toHaveBeenCalledWith("error", expect.any(Function));

    // Adapter attached
    expect(mockAdapter).toHaveBeenCalledWith("mock-adapter");
  });
});
