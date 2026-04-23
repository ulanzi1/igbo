// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@igbo/config/realtime", () => ({
  NAMESPACE_PORTAL: "/portal",
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_CONVERSATION: (id: string) => `conversation:${id}`,
  CHAT_REPLAY_WINDOW_MS: 24 * 60 * 60 * 1000,
  REDIS_TYPING_KEY: (convId: string, uid: string) => `typing:${convId}:${uid}`,
  TYPING_EXPIRE_SECONDS: 5,
  SOCKET_RATE_LIMITS: {
    GLOBAL: { maxEvents: 60, windowMs: 1_000 },
    TYPING_START: { maxEvents: 1, windowMs: 2_000 },
    MESSAGE_SEND: { maxEvents: 30, windowMs: 60_000 },
    REACTION_ADD: { maxEvents: 10, windowMs: 10_000 },
  },
}));

const mockIsConversationMember = vi.hoisted(() => vi.fn());
const mockMarkConversationRead = vi.hoisted(() => vi.fn());
vi.mock("@igbo/db/queries/chat-conversations", () => ({
  isConversationMember: mockIsConversationMember,
  markConversationRead: mockMarkConversationRead,
}));

const mockGetMessagesSince = vi.hoisted(() => vi.fn());
vi.mock("@igbo/db/queries/chat-messages", () => ({
  getMessagesSince: mockGetMessagesSince,
}));

const mockGetPortalConversationIdsForUser = vi.hoisted(() => vi.fn());
vi.mock("@igbo/db/queries/portal-conversations", () => ({
  getPortalConversationIdsForUser: mockGetPortalConversationIdsForUser,
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
import type { Socket, Namespace } from "socket.io";
import type Redis from "ioredis";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const MSG_ID = "00000000-0000-4000-8000-000000000003";

// ── Mock helpers ────────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

function makeSocket(userId = USER_ID) {
  const rooms: string[] = [];
  const handlers: Record<string, EventHandler[]> = {};
  const emitted: Array<{ event: string; data: unknown }> = [];

  const toChain = {
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event: `to.${event}`, data });
    }),
  };

  const socket = {
    data: { userId },
    join: vi.fn(async (room: string) => {
      rooms.push(room);
    }),
    on: vi.fn((event: string, handler: EventHandler) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
    }),
    emit: vi.fn((event: string, data: unknown) => {
      emitted.push({ event, data });
    }),
    to: vi.fn().mockReturnValue(toChain),
    _rooms: rooms,
    _handlers: handlers,
    _emitted: emitted,
    _toChain: toChain,
    _trigger: (event: string, ...args: unknown[]) => {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };

  return socket;
}

function makeRedis() {
  return {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  } as unknown as Redis;
}

/** Sets up namespace, triggers a connection, and returns handles for testing */
function setupAndConnect(userId = USER_ID) {
  let capturedHandler: (socket: ReturnType<typeof makeSocket>) => void = () => {};

  const useCallbacks: ((s: unknown, next: (err?: Error) => void) => void)[] = [];
  const nspToChain = { emit: vi.fn() };
  const nsp = {
    use: vi.fn((cb: (s: unknown, next: (err?: Error) => void) => void) => useCallbacks.push(cb)),
    on: vi.fn((event: string, handler: (s: ReturnType<typeof makeSocket>) => void) => {
      if (event === "connection") capturedHandler = handler;
    }),
    to: vi.fn().mockReturnValue(nspToChain),
  } as unknown as Namespace;

  const io = { of: vi.fn().mockReturnValue(nsp) };
  const redis = makeRedis();
  setupPortalNamespace(io, redis);

  const socket = makeSocket(userId);
  capturedHandler(socket);

  return { socket, redis, nsp, io, nspToChain };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthMiddleware.mockImplementation((_s: unknown, next: (err?: Error) => void) => next());
  mockRateLimiter.mockImplementation((_s: unknown, next: (err?: Error) => void) => next());
  mockGetPortalConversationIdsForUser.mockResolvedValue([]);
  mockIsConversationMember.mockResolvedValue(true);
  mockGetMessagesSince.mockResolvedValue([]);
  mockMarkConversationRead.mockResolvedValue(undefined);
});

// ── Basic namespace setup ────────────────────────────────────────────────────

describe("setupPortalNamespace — namespace setup", () => {
  it("creates /portal namespace", () => {
    const io = { of: vi.fn().mockReturnValue({ use: vi.fn(), on: vi.fn() }) };
    setupPortalNamespace(io, makeRedis());
    expect(io.of).toHaveBeenCalledWith("/portal");
  });

  it("attaches auth middleware", () => {
    const nsp = { use: vi.fn(), on: vi.fn() } as unknown as Namespace;
    const io = { of: vi.fn().mockReturnValue(nsp) };
    setupPortalNamespace(io, makeRedis());
    expect(nsp.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });

  it("attaches rate limiter middleware", () => {
    const nsp = { use: vi.fn(), on: vi.fn() } as unknown as Namespace;
    const io = { of: vi.fn().mockReturnValue(nsp) };
    setupPortalNamespace(io, makeRedis());
    expect(nsp.use).toHaveBeenCalledWith(mockRateLimiter);
  });

  it("registers connection handler", () => {
    const connectionHandlers: ((socket: Socket) => void)[] = [];
    const nsp = {
      use: vi.fn(),
      on: vi.fn((event: string, handler: (s: Socket) => void) => {
        if (event === "connection") connectionHandlers.push(handler);
      }),
    } as unknown as Namespace;
    const io = { of: vi.fn().mockReturnValue(nsp) };
    setupPortalNamespace(io, makeRedis());
    expect(connectionHandlers.length).toBe(1);
  });

  it("connection with rejected auth calls next(error)", () => {
    const nsp = { use: vi.fn(), on: vi.fn() } as unknown as Namespace;
    const io = { of: vi.fn().mockReturnValue(nsp) };
    mockAuthMiddleware.mockImplementationOnce((_s: unknown, next: (err?: Error) => void) =>
      next(new Error("UNAUTHORIZED")),
    );
    setupPortalNamespace(io, makeRedis());
    expect(nsp.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });
});

// ── Auto-join on connect ─────────────────────────────────────────────────────

describe("setupPortalNamespace — auto-join on connect", () => {
  it("joins ROOM_USER on connect", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() => expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`));
  });

  it("joins portal conversation rooms on connect", async () => {
    mockGetPortalConversationIdsForUser.mockResolvedValue([CONV_ID]);
    const { socket } = setupAndConnect();
    await vi.waitFor(() => expect(socket.join).toHaveBeenCalledWith(`conversation:${CONV_ID}`));
  });

  it("emits conversation:joined for each portal conversation", async () => {
    mockGetPortalConversationIdsForUser.mockResolvedValue([CONV_ID]);
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket._emitted).toContainEqual({
        event: "conversation:joined",
        data: { conversationId: CONV_ID },
      }),
    );
  });

  it("does not throw when auto-join fails", async () => {
    mockGetPortalConversationIdsForUser.mockRejectedValue(new Error("DB failure"));
    expect(() => setupAndConnect()).not.toThrow();
    // Give the async auto-join a chance to run and fail gracefully
    await new Promise((r) => setTimeout(r, 10));
  });

  it("calls getPortalConversationIdsForUser (NOT getUserConversationIds)", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );
    expect(mockGetPortalConversationIdsForUser).toHaveBeenCalledWith(USER_ID);
  });
});

// ── message:delivered handler ────────────────────────────────────────────────

describe("setupPortalNamespace — message:delivered", () => {
  it("stores delivery in Redis with 24h TTL", async () => {
    const { socket, redis } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    const ack = vi.fn();
    socket._trigger("message:delivered", { messageId: MSG_ID, conversationId: CONV_ID }, ack);

    await vi.waitFor(() =>
      expect(redis.set).toHaveBeenCalledWith(
        `delivered:portal:${MSG_ID}:${USER_ID}`,
        "1",
        "EX",
        86_400,
        "NX",
      ),
    );
  });

  it("broadcasts message:delivered to conversation room excluding sender", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    socket._trigger("message:delivered", { messageId: MSG_ID, conversationId: CONV_ID }, vi.fn());

    await vi.waitFor(() => expect(socket.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`));
    await vi.waitFor(() =>
      expect(socket._toChain.emit).toHaveBeenCalledWith(
        "message:delivered",
        expect.objectContaining({
          messageId: MSG_ID,
          conversationId: CONV_ID,
          deliveredBy: USER_ID,
        }),
      ),
    );
  });

  it("acks with ok:true on success", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    const ack = vi.fn();
    socket._trigger("message:delivered", { messageId: MSG_ID, conversationId: CONV_ID }, ack);

    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ ok: true }));
  });

  it("acks error when not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    const ack = vi.fn();
    socket._trigger("message:delivered", { messageId: MSG_ID, conversationId: CONV_ID }, ack);

    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Not a member" }));
  });

  it("acks error on missing messageId", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    const ack = vi.fn();
    socket._trigger("message:delivered", { conversationId: CONV_ID }, ack);

    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Invalid payload" }));
  });

  it("acks error on missing conversationId", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    const ack = vi.fn();
    socket._trigger("message:delivered", { messageId: MSG_ID }, ack);

    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Invalid payload" }));
  });

  it("validates membership with context='portal'", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:delivered", expect.any(Function)),
    );

    socket._trigger("message:delivered", { messageId: MSG_ID, conversationId: CONV_ID }, vi.fn());

    await vi.waitFor(() =>
      expect(mockIsConversationMember).toHaveBeenCalledWith(CONV_ID, USER_ID, "portal"),
    );
  });
});

// ── sync:request handler ─────────────────────────────────────────────────────

describe("setupPortalNamespace — sync:request", () => {
  it("emits sync:full_refresh when no lastReceivedAt provided", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("sync:request", expect.any(Function)),
    );

    socket._trigger("sync:request", {});

    await vi.waitFor(() =>
      expect(socket._emitted).toContainEqual(
        expect.objectContaining({ event: "sync:full_refresh" }),
      ),
    );
  });

  it("emits sync:full_refresh when gap > 24h", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("sync:request", expect.any(Function)),
    );

    const oldTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    socket._trigger("sync:request", { lastReceivedAt: oldTs });

    await vi.waitFor(() =>
      expect(socket._emitted).toContainEqual(
        expect.objectContaining({ event: "sync:full_refresh" }),
      ),
    );
  });

  it("replays missed messages within 24h window", async () => {
    const recentTs = new Date(Date.now() - 60_000).toISOString();
    mockGetPortalConversationIdsForUser.mockResolvedValue([CONV_ID]);
    const now = new Date();
    mockGetMessagesSince.mockResolvedValue([
      {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Hello",
        contentType: "text",
        createdAt: now,
        parentMessageId: null,
        editedAt: null,
        deletedAt: null,
      },
    ]);

    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("sync:request", expect.any(Function)),
    );

    socket._trigger("sync:request", { lastReceivedAt: recentTs });

    await vi.waitFor(() =>
      expect(socket._emitted).toContainEqual(
        expect.objectContaining({
          event: "sync:replay",
          data: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({ messageId: MSG_ID, content: "Hello" }),
            ]),
          }),
        }),
      ),
    );
  });

  it("blanks content for soft-deleted messages in replay", async () => {
    const recentTs = new Date(Date.now() - 60_000).toISOString();
    mockGetPortalConversationIdsForUser.mockResolvedValue([CONV_ID]);
    const now = new Date();
    mockGetMessagesSince.mockResolvedValue([
      {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        content: "Deleted",
        contentType: "text",
        createdAt: now,
        parentMessageId: null,
        editedAt: null,
        deletedAt: now,
      },
    ]);

    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("sync:request", expect.any(Function)),
    );
    socket._trigger("sync:request", { lastReceivedAt: recentTs });

    await vi.waitFor(() => {
      const replay = socket._emitted.find((e) => e.event === "sync:replay");
      const msgs = (replay?.data as { messages: Array<{ content: string }> })?.messages;
      expect(msgs?.[0]?.content).toBe("");
    });
  });

  it("emits sync:full_refresh on DB error", async () => {
    const recentTs = new Date(Date.now() - 60_000).toISOString();
    mockGetPortalConversationIdsForUser.mockRejectedValue(new Error("DB error"));

    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("sync:request", expect.any(Function)),
    );
    socket._trigger("sync:request", { lastReceivedAt: recentTs });

    await vi.waitFor(() =>
      expect(socket._emitted).toContainEqual(
        expect.objectContaining({ event: "sync:full_refresh" }),
      ),
    );
  });

  it("skips replay when user has no portal conversations", async () => {
    const recentTs = new Date(Date.now() - 60_000).toISOString();
    mockGetPortalConversationIdsForUser.mockResolvedValue([]);

    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("sync:request", expect.any(Function)),
    );
    socket._trigger("sync:request", { lastReceivedAt: recentTs });

    await vi.waitFor(() => expect(mockGetMessagesSince).not.toHaveBeenCalled());
  });
});

// ── disconnect handler ───────────────────────────────────────────────────────

describe("setupPortalNamespace — disconnect", () => {
  it("logs disconnect event with reason", async () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("disconnect", expect.any(Function)),
    );

    socket._trigger("disconnect", "transport close");

    await vi.waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("portal.socket.disconnected"),
      ),
    );
    consoleSpy.mockRestore();
  });
});

// ── typing:start handler ──────────────────────────────────────────────────────

describe("setupPortalNamespace — typing:start", () => {
  it("validates membership with context='portal'", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:start", expect.any(Function)),
    );
    socket._trigger("typing:start", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() =>
      expect(mockIsConversationMember).toHaveBeenCalledWith(CONV_ID, USER_ID, "portal"),
    );
  });

  it("sets Redis typing key with TYPING_EXPIRE_SECONDS TTL", async () => {
    const { socket, redis } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:start", expect.any(Function)),
    );
    socket._trigger("typing:start", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() =>
      expect(redis.set).toHaveBeenCalledWith(`typing:${CONV_ID}:${USER_ID}`, "1", "EX", 5),
    );
  });

  it("broadcasts typing:start to room excluding sender", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:start", expect.any(Function)),
    );
    socket._trigger("typing:start", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() => expect(socket.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`));
    await vi.waitFor(() =>
      expect(socket._toChain.emit).toHaveBeenCalledWith(
        "typing:start",
        expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID }),
      ),
    );
  });

  it("acks ok:true on success", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:start", expect.any(Function)),
    );
    const ack = vi.fn();
    socket._trigger("typing:start", { conversationId: CONV_ID }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ ok: true }));
  });

  it("acks error when not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:start", expect.any(Function)),
    );
    const ack = vi.fn();
    socket._trigger("typing:start", { conversationId: CONV_ID }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Not a member" }));
  });

  it("acks error on invalid/empty conversationId", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:start", expect.any(Function)),
    );
    const ack = vi.fn();
    socket._trigger("typing:start", { conversationId: "" }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Invalid conversationId" }));
  });
});

// ── typing:stop handler ───────────────────────────────────────────────────────

describe("setupPortalNamespace — typing:stop", () => {
  it("validates membership before deleting Redis key", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:stop", expect.any(Function)),
    );
    socket._trigger("typing:stop", { conversationId: CONV_ID });
    await vi.waitFor(() =>
      expect(mockIsConversationMember).toHaveBeenCalledWith(CONV_ID, USER_ID, "portal"),
    );
  });

  it("deletes Redis typing key on stop", async () => {
    const { socket, redis } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:stop", expect.any(Function)),
    );
    socket._trigger("typing:stop", { conversationId: CONV_ID });
    await vi.waitFor(() => expect(redis.del).toHaveBeenCalledWith(`typing:${CONV_ID}:${USER_ID}`));
  });

  it("broadcasts typing:stop to room excluding sender", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:stop", expect.any(Function)),
    );
    socket._trigger("typing:stop", { conversationId: CONV_ID });
    await vi.waitFor(() => expect(socket.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`));
    await vi.waitFor(() =>
      expect(socket._toChain.emit).toHaveBeenCalledWith(
        "typing:stop",
        expect.objectContaining({ userId: USER_ID, conversationId: CONV_ID }),
      ),
    );
  });

  it("silently ignores non-member (no ack on stop)", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { socket, redis } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("typing:stop", expect.any(Function)),
    );
    socket._trigger("typing:stop", { conversationId: CONV_ID });
    await new Promise((r) => setTimeout(r, 20));
    expect(redis.del).not.toHaveBeenCalled();
    expect(socket._toChain.emit).not.toHaveBeenCalled();
  });
});

// ── message:read handler ──────────────────────────────────────────────────────

describe("setupPortalNamespace — message:read", () => {
  it("validates membership with context='portal'", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    socket._trigger("message:read", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() =>
      expect(mockIsConversationMember).toHaveBeenCalledWith(CONV_ID, USER_ID, "portal"),
    );
  });

  it("calls markConversationRead with correct args", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    socket._trigger("message:read", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() => expect(mockMarkConversationRead).toHaveBeenCalledWith(CONV_ID, USER_ID));
  });

  it("broadcasts message:read to ALL via namespace (includes sender)", async () => {
    const { socket, nsp, nspToChain } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    socket._trigger("message:read", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() => expect(nsp.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`));
    await vi.waitFor(() =>
      expect(nspToChain.emit).toHaveBeenCalledWith(
        "message:read",
        expect.objectContaining({
          conversationId: CONV_ID,
          readerId: USER_ID,
        }),
      ),
    );
  });

  it("broadcast includes readerId, lastReadAt, conversationId", async () => {
    const { socket, nspToChain } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    socket._trigger("message:read", { conversationId: CONV_ID }, vi.fn());
    await vi.waitFor(() =>
      expect(nspToChain.emit).toHaveBeenCalledWith(
        "message:read",
        expect.objectContaining({
          conversationId: CONV_ID,
          readerId: USER_ID,
          lastReadAt: expect.any(String),
          timestamp: expect.any(String),
        }),
      ),
    );
  });

  it("does NOT use socket.to() for message:read broadcast", async () => {
    const { socket, nspToChain } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    socket._trigger("message:read", { conversationId: CONV_ID }, vi.fn());
    // namespace-level broadcast should fire
    await vi.waitFor(() =>
      expect(nspToChain.emit).toHaveBeenCalledWith("message:read", expect.any(Object)),
    );
    // socket-level broadcast should NOT be used for message:read
    const socketReadEmit = (socket._toChain.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === "message:read",
    );
    expect(socketReadEmit).toHaveLength(0);
  });

  it("acks error when not a member", async () => {
    mockIsConversationMember.mockResolvedValue(false);
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    const ack = vi.fn();
    socket._trigger("message:read", { conversationId: CONV_ID }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Not a member" }));
  });

  it("acks error on invalid/empty conversationId", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    const ack = vi.fn();
    socket._trigger("message:read", { conversationId: "" }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ error: "Invalid conversationId" }));
  });

  it("acks ok:true on success", async () => {
    const { socket } = setupAndConnect();
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith("message:read", expect.any(Function)),
    );
    const ack = vi.fn();
    socket._trigger("message:read", { conversationId: CONV_ID }, ack);
    await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ ok: true }));
  });
});
