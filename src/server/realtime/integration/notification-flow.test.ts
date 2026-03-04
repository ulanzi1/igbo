// @vitest-environment node
/**
 * Socket.IO integration test for /notifications namespace — notification delivery flow.
 *
 * Uses a real Socket.IO Server bound to port 0 (OS-assigned) in-process.
 * DB and Redis service layers are mocked — this validates the full delivery path
 * at the real TCP/event level:
 *
 *   Redis pub/sub → EventBus bridge → Socket.IO /notifications → client receipt
 *
 * This is the integration layer that unit tests in eventbus-bridge.test.ts cannot
 * cover (those use mock sockets). The chat parallel lives in chat-message-flow.test.ts.
 *
 * What is NOT tested here (tested elsewhere):
 *   - NotificationService DB write + Redis publish (notification-service.test.ts)
 *   - Bridge routing logic for all event types (eventbus-bridge.test.ts)
 *   - Presence TTL arithmetic and heartbeat (notifications.test.ts)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import type Redis from "ioredis";

// ── Group channels mock (needed because eventbus-bridge now imports listGroupChannels) ──
vi.mock("@/db/queries/group-channels", () => ({
  listGroupChannels: vi.fn().mockResolvedValue([]),
}));

// ── Config mock ────────────────────────────────────────────────────────────────
vi.mock("@/config/realtime", () => ({
  ROOM_USER: (id: string) => `user:${id}`,
  ROOM_PRESENCE: (id: string) => `presence:${id}`,
  REDIS_PRESENCE_KEY: (id: string) => `user:${id}:online`,
  PRESENCE_TTL_SECONDS: 30,
  REPLAY_WINDOW_MS: 3_600_000,
  NAMESPACE_NOTIFICATIONS: "/notifications",
  NAMESPACE_CHAT: "/chat",
}));

// ── DB query mock ──────────────────────────────────────────────────────────────
const mockGetNotifications = vi.hoisted(() => vi.fn());
vi.mock("@/db/queries/notifications", () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  createNotification: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

// ── Server lifecycle ───────────────────────────────────────────────────────────
import { setupNotificationsNamespace } from "../namespaces/notifications";
import { startEventBusBridge } from "../subscribers/eventbus-bridge";

// Mock Redis for presence — presence is non-critical for notification delivery
const mockRedisPresence = {
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  get: vi.fn().mockResolvedValue(null),
} as unknown as Redis;

// Controllable mock subscriber — allows us to manually trigger pmessage events
type PMessageCallback = (pattern: string, channel: string, message: string) => void;
let pmessageCallbacks: PMessageCallback[] = [];

function makeMockSubscriber(): Redis {
  pmessageCallbacks = [];
  return {
    on: vi.fn((event: string, cb: PMessageCallback) => {
      if (event === "pmessage") pmessageCallbacks.push(cb);
    }),
    psubscribe: vi.fn().mockResolvedValue(undefined),
    punsubscribe: vi.fn().mockResolvedValue(undefined),
  } as unknown as Redis;
}

// ── Test constants ─────────────────────────────────────────────────────────────
const TEST_USER_ID = "00000000-0000-4000-a000-000000000001";
const TEST_NOTIF_ID = "00000000-0000-4000-a000-000000000002";

let serverPort: number;
let io: Server;
let httpServer: ReturnType<typeof createServer>;
let client: ClientSocket;

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer, { transports: ["websocket"] });

  const notifNs = io.of("/notifications");

  // Test auth bypass — sets userId without JWT validation
  notifNs.use((socket, next) => {
    socket.data.userId = TEST_USER_ID;
    next();
  });

  setupNotificationsNamespace(notifNs, mockRedisPresence);

  const mockSubscriber = makeMockSubscriber();
  await startEventBusBridge(io, mockSubscriber);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  serverPort = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisPresence.set = vi.fn().mockResolvedValue("OK");
  mockRedisPresence.del = vi.fn().mockResolvedValue(1);
  mockRedisPresence.exists = vi.fn().mockResolvedValue(0);
});

afterEach(() => {
  if (client?.connected) {
    client.disconnect();
  }
});

// ── Helper: connect and wait for socket to be ready ───────────────────────────
function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${serverPort}/notifications`, {
      transports: ["websocket"],
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

// ── Helper: wait for a single event from the socket ───────────────────────────
function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${event}"`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("Socket.IO /notifications integration — connection", () => {
  it("client connects to /notifications without errors", async () => {
    client = await connectClient();
    expect(client.connected).toBe(true);
  });

  it("emits presence:update on connect", async () => {
    const presencePromise = new Promise<{ userId: string; online: boolean }>((resolve, reject) => {
      const socket = ioc(`http://localhost:${serverPort}/notifications`, {
        transports: ["websocket"],
        forceNew: true,
      });
      socket.once("presence:update", (payload) => {
        client = socket;
        resolve(payload as { userId: string; online: boolean });
      });
      socket.once("connect_error", reject);
      setTimeout(() => reject(new Error("presence:update never received")), 2000);
    });

    const presence = await presencePromise;
    expect(presence.online).toBe(true);
    expect(presence.userId).toBe(TEST_USER_ID);
  });
});

describe("Socket.IO /notifications integration — notification:new delivery", () => {
  it("client receives notification:new when bridge processes notification.created Redis message", async () => {
    client = await connectClient();

    const notifPromise = waitForEvent<Record<string, unknown>>(client, "notification:new");

    // Simulate Redis pub/sub delivering a notification.created event
    const payload = {
      userId: TEST_USER_ID,
      notificationId: TEST_NOTIF_ID,
      type: "system",
      title: "notifications.welcome.title",
      body: "notifications.welcome.body",
      link: "/dashboard",
      timestamp: new Date().toISOString(),
    };
    pmessageCallbacks[0]?.("eventbus:*", "eventbus:notification.created", JSON.stringify(payload));

    const received = await notifPromise;
    expect(received).toMatchObject({
      id: TEST_NOTIF_ID,
      userId: TEST_USER_ID,
      type: "system",
      title: "notifications.welcome.title",
      body: "notifications.welcome.body",
      link: "/dashboard",
      isRead: false,
    });
  });

  it("client receives unread:update alongside notification:new", async () => {
    client = await connectClient();

    const unreadPromise = waitForEvent<Record<string, unknown>>(client, "unread:update");

    const payload = {
      userId: TEST_USER_ID,
      notificationId: TEST_NOTIF_ID,
      type: "admin_announcement",
      title: "notifications.announcement.title",
      body: "notifications.announcement.body",
      timestamp: new Date().toISOString(),
    };
    pmessageCallbacks[0]?.("eventbus:*", "eventbus:notification.created", JSON.stringify(payload));

    const unread = await unreadPromise;
    expect(unread).toMatchObject({
      userId: TEST_USER_ID,
      increment: 1,
    });
  });

  it("client does NOT receive notification:new for a different user's notification", async () => {
    client = await connectClient();

    const OTHER_USER_ID = "00000000-0000-4000-a000-000000000099";
    let received = false;
    client.on("notification:new", () => {
      received = true;
    });

    // Emit for a different user
    const payload = {
      userId: OTHER_USER_ID,
      notificationId: TEST_NOTIF_ID,
      type: "system",
      title: "Other user notification",
      body: "Should not be delivered here",
      timestamp: new Date().toISOString(),
    };
    pmessageCallbacks[0]?.("eventbus:*", "eventbus:notification.created", JSON.stringify(payload));

    // Give event loop time to process
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toBe(false);
  });
});

describe("Socket.IO /notifications integration — sync:request", () => {
  it("emits sync:full_refresh when no lastTimestamp provided", async () => {
    mockGetNotifications.mockResolvedValue([]);
    client = await connectClient();

    const syncPromise = waitForEvent<Record<string, unknown>>(client, "sync:full_refresh");
    client.emit("sync:request", {});

    const response = await syncPromise;
    expect(response).toHaveProperty("timestamp");
  });

  it("emits sync:full_refresh when lastTimestamp is invalid", async () => {
    mockGetNotifications.mockResolvedValue([]);
    client = await connectClient();

    const syncPromise = waitForEvent<Record<string, unknown>>(client, "sync:full_refresh");
    client.emit("sync:request", { lastTimestamp: "not-a-date" });

    const response = await syncPromise;
    expect(response).toHaveProperty("timestamp");
  });

  it("replays missed notifications within the replay window", async () => {
    const recentTs = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    const missedNotif = {
      id: "notif-replay-1",
      userId: TEST_USER_ID,
      type: "system" as const,
      title: "Missed",
      body: "You missed this",
      link: null,
      isRead: false,
      createdAt: new Date(recentTs),
    };
    mockGetNotifications.mockResolvedValue([missedNotif]);

    client = await connectClient();

    const replayPromise = waitForEvent<Record<string, unknown>>(client, "notification:new");
    client.emit("sync:request", { lastTimestamp: recentTs });

    const replayed = await replayPromise;
    expect(replayed).toMatchObject({
      id: "notif-replay-1",
      title: "Missed",
    });
  });
});
