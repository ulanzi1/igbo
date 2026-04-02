// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@igbo/config/realtime", () => ({
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_PRESENCE: (id: string) => `presence:${id}`,
  REDIS_PRESENCE_KEY: (id: string) => `user:${id}:online`,
  PRESENCE_TTL_SECONDS: 30,
  REPLAY_WINDOW_MS: 3_600_000,
}));

const mockGetNotifications = vi.fn();
vi.mock("@/db/queries/notifications", () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
}));

import { setupNotificationsNamespace } from "./notifications";
import type { Namespace, Socket } from "socket.io";
import type Redis from "ioredis";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeSocket(userId: string = USER_ID): {
  socket: Socket;
  events: Record<string, ((...args: unknown[]) => void)[]>;
} {
  const events: Record<string, ((...args: unknown[]) => void)[]> = {};
  const socket = {
    data: { userId },
    join: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      events[event] = events[event] ?? [];
      events[event]!.push(cb);
    }),
  } as unknown as Socket;
  return { socket, events };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeNamespace(_socket: Socket): {
  ns: Namespace;
  connectionCallbacks: ((s: Socket) => void)[];
} {
  const connectionCallbacks: ((s: Socket) => void)[] = [];
  const ns = {
    on: vi.fn((event: string, cb: (s: Socket) => void) => {
      if (event === "connection") connectionCallbacks.push(cb);
    }),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Namespace;
  return { ns, connectionCallbacks };
}

function makeRedis(onlineUserIds: string[] = []): Redis {
  return {
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn((key: string) => {
      const online = onlineUserIds.some((id) => key === `user:${id}:online`);
      return Promise.resolve(online ? 1 : 0);
    }),
  } as unknown as Redis;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setupNotificationsNamespace", () => {
  it("registers a connection handler", () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);

    expect(ns.on).toHaveBeenCalledWith("connection", expect.any(Function));
    expect(connectionCallbacks).toHaveLength(1);
  });

  it("joins the user personal room on connection", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
  });

  it("sets presence in Redis on connection", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    expect(redis.set).toHaveBeenCalledWith(`user:${USER_ID}:online`, "1", "EX", 30);
  });

  it("emits presence:update on connection", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    expect(ns.to).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect((ns as unknown as { emit: ReturnType<typeof vi.fn> }).emit).toHaveBeenCalledWith(
      "presence:update",
      expect.objectContaining({ userId: USER_ID, online: true }),
    );
  });

  it("registers disconnect handler", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    expect(events["disconnect"]).toBeDefined();
  });

  it("clears presence on disconnect", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["disconnect"]![0]!();

    expect(redis.del).toHaveBeenCalledWith(`user:${USER_ID}:online`);
  });

  it("replays missed notifications when gap is within window", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    const recentTime = new Date(Date.now() - 60_000); // 1 min ago — within 1h window
    const mockNotif = {
      id: "notif-1",
      userId: USER_ID,
      type: "system",
      title: "Hello",
      body: "World",
      link: null,
      isRead: false,
      createdAt: recentTime,
    };
    mockGetNotifications.mockResolvedValue([mockNotif]);

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastTimestamp: recentTime.toISOString() });

    expect(mockGetNotifications).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ since: expect.any(Date), limit: 50 }),
    );
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "notification:new",
      expect.objectContaining({ id: "notif-1" }),
    );
  });

  it("emits sync:full_refresh when gap exceeds replay window", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    const oldTime = new Date(Date.now() - 2 * 3_600_000); // 2h ago — exceeds 1h window
    await events["sync:request"]![0]!({ lastTimestamp: oldTime.toISOString() });

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
  });

  it("emits sync:full_refresh when no lastTimestamp provided", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({});

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
  });

  it("emits sync:full_refresh for invalid (NaN) lastTimestamp", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["sync:request"]![0]!({ lastTimestamp: "not-a-date" });

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
    expect(mockGetNotifications).not.toHaveBeenCalled();
  });

  it("emits sync:full_refresh when getNotifications throws", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    mockGetNotifications.mockRejectedValue(new Error("DB down"));

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    const recentTime = new Date(Date.now() - 60_000);
    await events["sync:request"]![0]!({ lastTimestamp: recentTime.toISOString() });

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "sync:full_refresh",
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
  });

  it("emits presence:update to ROOM_PRESENCE on connection", async () => {
    const { socket } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    const nsMock = ns as unknown as {
      to: ReturnType<typeof vi.fn>;
      emit: ReturnType<typeof vi.fn>;
    };
    const toCallArgs = nsMock.to.mock.calls.map((c) => c[0]);
    expect(toCallArgs).toContain(`presence:${USER_ID}`);
  });

  it("emits presence:update { online: false } to ROOM_PRESENCE on disconnect", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["disconnect"]![0]!();

    const nsMock = ns as unknown as {
      to: ReturnType<typeof vi.fn>;
      emit: ReturnType<typeof vi.fn>;
    };
    const presenceEmitCalls = nsMock.emit.mock.calls.filter(
      (c) => c[0] === "presence:update" && c[1].online === false,
    );
    // Should have emitted to both ROOM_USER and ROOM_PRESENCE
    const toCallArgs = nsMock.to.mock.calls
      .slice(nsMock.to.mock.calls.findIndex((c) => c[0] === `presence:${USER_ID}`))
      .map((c) => c[0]);
    expect(toCallArgs).toContain(`presence:${USER_ID}`);
    expect(presenceEmitCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("presence:subscribe joins socket to presence rooms and emits current state", async () => {
    const OTHER_ID = "00000000-0000-4000-8000-000000000099";
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis([OTHER_ID]); // OTHER_ID is online

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["presence:subscribe"]![0]!({ userIds: [OTHER_ID] });

    expect(socket.join).toHaveBeenCalledWith(`presence:${OTHER_ID}`);
    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "presence:update",
      expect.objectContaining({ userId: OTHER_ID, online: true }),
    );
  });

  it("presence:subscribe emits online=false when user is offline", async () => {
    const OTHER_ID = "00000000-0000-4000-8000-000000000099";
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis([]); // nobody online

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["presence:subscribe"]![0]!({ userIds: [OTHER_ID] });

    expect(socket.emit as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "presence:update",
      expect.objectContaining({ userId: OTHER_ID, online: false }),
    );
  });

  it("presence:subscribe ignores invalid payload", async () => {
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    // Should not throw for invalid payload
    await events["presence:subscribe"]![0]!({ userIds: "not-an-array" });
    expect(socket.join).not.toHaveBeenCalledWith(expect.stringContaining("presence:"));
  });

  it("presence:unsubscribe leaves presence rooms", async () => {
    const OTHER_ID = "00000000-0000-4000-8000-000000000099";
    const { socket, events } = makeSocket();
    const { ns, connectionCallbacks } = makeNamespace(socket);
    const redis = makeRedis();

    const mockLeave = vi.fn().mockResolvedValue(undefined);
    (socket as unknown as { leave: typeof mockLeave }).leave = mockLeave;

    setupNotificationsNamespace(ns, redis);
    await connectionCallbacks[0]!(socket);

    await events["presence:unsubscribe"]![0]!({ userIds: [OTHER_ID] });

    expect(mockLeave).toHaveBeenCalledWith(`presence:${OTHER_ID}`);
  });
});
