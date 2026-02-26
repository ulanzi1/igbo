// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/config/realtime", () => ({
  SOCKET_RATE_LIMITS: {
    GLOBAL: { maxEvents: 3, windowMs: 1_000 },
    TYPING_START: { maxEvents: 1, windowMs: 2_000 },
    MESSAGE_SEND: { maxEvents: 2, windowMs: 60_000 },
    REACTION_ADD: { maxEvents: 1, windowMs: 10_000 },
  },
}));

import { createRateLimiterMiddleware } from "./rate-limiter";
import type { Socket } from "socket.io";

function makeSocket(): {
  socket: Socket;
  emitMock: ReturnType<typeof vi.fn>;
  useCallbacks: ((packet: unknown[], next: (err?: Error) => void) => void)[];
} {
  const emitMock = vi.fn();
  const useCallbacks: ((packet: unknown[], next: (err?: Error) => void) => void)[] = [];
  const socket = {
    data: {},
    emit: emitMock,
    use: vi.fn((cb: (packet: unknown[], next: (err?: Error) => void) => void) => {
      useCallbacks.push(cb);
    }),
  } as unknown as Socket;
  return { socket, emitMock, useCallbacks };
}

/** Helper: simulate an incoming event packet through the socket.use middleware */
function simulateEvent(
  useCallbacks: ((packet: unknown[], next: (err?: Error) => void) => void)[],
  eventName: string,
): { blocked: boolean; error?: Error } {
  let blocked = false;
  let capturedError: Error | undefined;
  const packetNext = (err?: Error) => {
    if (err) {
      blocked = true;
      capturedError = err;
    }
  };
  useCallbacks[0]?.([eventName], packetNext);
  return { blocked, error: capturedError };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRateLimiterMiddleware", () => {
  it("initializes rateLimits on socket.data and calls next()", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.rateLimits).toEqual({});
  });

  it("registers a socket.use packet middleware", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    expect(socket.use as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it("allows events within global rate limit", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket, emitMock, useCallbacks } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    // Fire 3 events (at global limit of 3)
    for (let i = 0; i < 3; i++) {
      const result = simulateEvent(useCallbacks, "some:event");
      expect(result.blocked).toBe(false);
    }

    expect(emitMock).not.toHaveBeenCalled();
  });

  it("blocks events and emits rate_limit:exceeded when global limit is exceeded", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket, emitMock, useCallbacks } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    // Fire 4 events (global limit is 3)
    for (let i = 0; i < 3; i++) {
      simulateEvent(useCallbacks, "some:event");
    }
    const result = simulateEvent(useCallbacks, "some:event");

    expect(result.blocked).toBe(true);
    expect(emitMock).toHaveBeenCalledWith(
      "rate_limit:exceeded",
      expect.objectContaining({ event: "some:event", reason: "global" }),
    );
  });

  it("blocks typing:start when specific limit exceeded", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket, emitMock, useCallbacks } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    // First typing:start — allowed
    const first = simulateEvent(useCallbacks, "typing:start");
    expect(first.blocked).toBe(false);

    // Second typing:start — exceeds 1/2s limit
    const second = simulateEvent(useCallbacks, "typing:start");
    expect(second.blocked).toBe(true);

    const rateLimitCalls = emitMock.mock.calls.filter(
      (c) => c[0] === "rate_limit:exceeded" && c[1]?.reason === "typing:start",
    );
    expect(rateLimitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks message:send when specific limit exceeded", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket, emitMock, useCallbacks } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    // Send 2 messages (at limit)
    simulateEvent(useCallbacks, "message:send");
    // Still within global limit (3), so second should be allowed
    const second = simulateEvent(useCallbacks, "message:send");
    expect(second.blocked).toBe(false);

    // Third message:send — exceeds 2/60s limit
    const third = simulateEvent(useCallbacks, "message:send");
    expect(third.blocked).toBe(true);

    const rateLimitCalls = emitMock.mock.calls.filter(
      (c) => c[0] === "rate_limit:exceeded" && c[1]?.reason === "message:send",
    );
    expect(rateLimitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks reaction:add when specific limit exceeded", () => {
    const middleware = createRateLimiterMiddleware();
    const { socket, emitMock, useCallbacks } = makeSocket();
    const next = vi.fn();

    middleware(socket, next);

    // First reaction — allowed
    const first = simulateEvent(useCallbacks, "reaction:add");
    expect(first.blocked).toBe(false);

    // Second reaction — exceeds 1/10s limit
    const secondResult = simulateEvent(useCallbacks, "reaction:add");
    expect(secondResult.blocked).toBe(true);

    const rateLimitCalls = emitMock.mock.calls.filter(
      (c) => c[0] === "rate_limit:exceeded" && c[1]?.reason === "reaction:add",
    );
    expect(rateLimitCalls.length).toBeGreaterThanOrEqual(1);
  });
});
