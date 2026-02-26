// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Namespace, Socket } from "socket.io";
import Redis from "ioredis";
import {
  ROOM_USER,
  REDIS_PRESENCE_KEY,
  PRESENCE_TTL_SECONDS,
  REPLAY_WINDOW_MS,
} from "@/config/realtime";
import { getNotifications } from "@/db/queries/notifications";

const HEARTBEAT_INTERVAL_MS = (PRESENCE_TTL_SECONDS / 2) * 1000; // refresh at half TTL

/**
 * Sets up the /notifications namespace handlers:
 * - Join personal user room on connect
 * - Presence management (Redis SET with TTL + heartbeat)
 * - Reconnection gap sync (replay vs full refresh)
 *
 * NOTE: Presence updates are emitted to the user's personal room. For presence
 * to be visible to OTHER users, the client must subscribe to presence via REST
 * or a dedicated presence room (deferred to Epic 2/3 when contacts exist).
 */
export function setupNotificationsNamespace(ns: Namespace, redis: Redis): void {
  ns.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;

    // Join personal room
    void socket.join(ROOM_USER(userId));

    // Set presence
    void setPresence(redis, userId);

    // Start heartbeat to keep presence alive
    const heartbeat = setInterval(() => {
      void setPresence(redis, userId);
    }, HEARTBEAT_INTERVAL_MS);

    // Notify room of presence update
    ns.to(ROOM_USER(userId)).emit("presence:update", {
      userId,
      online: true,
      timestamp: new Date().toISOString(),
    });

    // Handle reconnection gap sync
    socket.on("sync:request", async (payload: { lastTimestamp?: string }) => {
      try {
        const lastTs = payload?.lastTimestamp ? new Date(payload.lastTimestamp) : null;

        if (!lastTs || isNaN(lastTs.getTime())) {
          socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
          return;
        }

        const gapMs = Date.now() - lastTs.getTime();
        if (gapMs > REPLAY_WINDOW_MS) {
          // Gap too large — tell client to do REST fetch
          socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
          return;
        }

        // Replay missed notifications
        const missed = await getNotifications(userId, { since: lastTs, limit: 50 });
        for (const notif of missed.reverse()) {
          socket.emit("notification:new", {
            ...notif,
            timestamp: notif.createdAt.toISOString(),
          });
        }
      } catch (err: unknown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "sync.request.failed",
            userId,
            error: String(err),
          }),
        );
        socket.emit("sync:full_refresh", { timestamp: new Date().toISOString() });
      }
    });

    socket.on("disconnect", () => {
      clearInterval(heartbeat);
      void clearPresence(redis, userId);
      ns.to(ROOM_USER(userId)).emit("presence:update", {
        userId,
        online: false,
        timestamp: new Date().toISOString(),
      });
    });
  });
}

async function setPresence(redis: Redis, userId: string): Promise<void> {
  try {
    await redis.set(REDIS_PRESENCE_KEY(userId), "1", "EX", PRESENCE_TTL_SECONDS);
  } catch {
    // Non-critical
  }
}

async function clearPresence(redis: Redis, userId: string): Promise<void> {
  try {
    await redis.del(REDIS_PRESENCE_KEY(userId));
  } catch {
    // Non-critical
  }
}
