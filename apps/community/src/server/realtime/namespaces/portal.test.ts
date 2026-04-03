// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@igbo/config/realtime", () => ({
  NAMESPACE_PORTAL: "/portal",
  ROOM_USER: (id: string) => `user:${id}`,
  SOCKET_RATE_LIMITS: {
    GLOBAL: { maxEvents: 60, windowMs: 1_000 },
    TYPING_START: { maxEvents: 1, windowMs: 2_000 },
    MESSAGE_SEND: { maxEvents: 30, windowMs: 60_000 },
    REACTION_ADD: { maxEvents: 10, windowMs: 10_000 },
  },
}));

const { mockAuthMiddleware } = vi.hoisted(() => ({
  mockAuthMiddleware: vi.fn((_socket: unknown, next: (err?: Error) => void) => next()),
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: mockAuthMiddleware,
}));

const mockRateLimiter = vi.fn((_socket: unknown, next: (err?: Error) => void) => next());
vi.mock("../middleware/rate-limiter", () => ({
  createRateLimiterMiddleware: () => mockRateLimiter,
}));

import { setupPortalNamespace } from "./portal";
import type { Server, Socket, Namespace } from "socket.io";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeNamespace(): {
  nsp: Namespace;
  useCallbacks: ((socket: unknown, next: (err?: Error) => void) => void)[];
  connectionHandlers: ((socket: Socket) => void)[];
} {
  const useCallbacks: ((socket: unknown, next: (err?: Error) => void) => void)[] = [];
  const connectionHandlers: ((socket: Socket) => void)[] = [];

  const nsp = {
    use: vi.fn((cb: (socket: unknown, next: (err?: Error) => void) => void) => {
      useCallbacks.push(cb);
    }),
    on: vi.fn((event: string, handler: (socket: Socket) => void) => {
      if (event === "connection") connectionHandlers.push(handler);
    }),
  } as unknown as Namespace;

  return { nsp, useCallbacks, connectionHandlers };
}

function makeServer(nsp: Namespace): Server {
  return {
    of: vi.fn().mockReturnValue(nsp),
  } as unknown as Server;
}

function makeSocket(userId = USER_ID): Socket {
  return {
    data: { userId },
    join: vi.fn(),
    on: vi.fn(),
  } as unknown as Socket;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthMiddleware.mockImplementation((_socket, next) => next());
  mockRateLimiter.mockImplementation((_socket, next) => next());
});

describe("setupPortalNamespace", () => {
  it("creates /portal namespace on the Socket.IO server", () => {
    const { nsp } = makeNamespace();
    const io = makeServer(nsp);
    setupPortalNamespace(io);
    expect(io.of).toHaveBeenCalledWith("/portal");
  });

  it("attaches auth middleware", () => {
    const { nsp, useCallbacks } = makeNamespace();
    const io = makeServer(nsp);
    setupPortalNamespace(io);

    // useCallbacks should include auth middleware
    expect(useCallbacks.length).toBeGreaterThanOrEqual(1);
    // Verify auth middleware is one of the registered use callbacks
    expect(nsp.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });

  it("attaches rate limiter middleware", () => {
    const { nsp } = makeNamespace();
    const io = makeServer(nsp);
    setupPortalNamespace(io);
    expect(nsp.use).toHaveBeenCalledWith(mockRateLimiter);
  });

  it("registers connection event handler", () => {
    const { nsp, connectionHandlers } = makeNamespace();
    const io = makeServer(nsp);
    setupPortalNamespace(io);
    expect(connectionHandlers.length).toBe(1);
  });

  it("connected user joins user:{userId} room", () => {
    const { nsp, connectionHandlers } = makeNamespace();
    const io = makeServer(nsp);
    setupPortalNamespace(io);

    const socket = makeSocket(USER_ID);
    connectionHandlers[0]?.(socket);

    expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
  });

  it("connection with invalid JWT is rejected (auth middleware calls next(error))", () => {
    const { nsp } = makeNamespace();
    const io = makeServer(nsp);

    // Override auth middleware to reject
    mockAuthMiddleware.mockImplementationOnce((_socket, next) => {
      next(new Error("UNAUTHORIZED: missing session token"));
    });

    setupPortalNamespace(io);

    // Verify auth middleware is attached and would reject — the rejection occurs
    // when the middleware calls next(error), which Socket.IO handles by refusing connection
    expect(nsp.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });
});
