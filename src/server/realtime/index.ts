// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import { createServer } from "node:http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { attachRedisAdapter } from "./adapters/redis";
import { authMiddleware } from "./middleware/auth";
import { createRateLimiterMiddleware } from "./middleware/rate-limiter";
import { setupNotificationsNamespace } from "./namespaces/notifications";
import { setupChatNamespace } from "./namespaces/chat";
import { startEventBusBridge } from "./subscribers/eventbus-bridge";
import {
  REALTIME_PORT,
  REALTIME_CORS_ORIGIN,
  NAMESPACE_NOTIFICATIONS,
  NAMESPACE_CHAT,
} from "@/config/realtime";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main(): Promise<void> {
  // HTTP server backing Socket.IO (also exposes GET /health)
  const httpServer = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    cors: {
      origin: REALTIME_CORS_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 15_000,
    pingTimeout: 30_000,
  });

  // Attach Redis adapter for multi-instance pub/sub
  attachRedisAdapter(io, REDIS_URL);

  // Redis subscriber client for EventBus bridge
  const bridgeSubscriber = new Redis(REDIS_URL, {
    lazyConnect: false,
    connectionName: "igbo:realtime:bridge",
    maxRetriesPerRequest: 3,
  });

  // Redis general client for presence management
  const redisPresence = new Redis(REDIS_URL, {
    lazyConnect: false,
    connectionName: "igbo:realtime:presence",
    maxRetriesPerRequest: 3,
  });

  // /notifications namespace
  const notificationsNs = io.of(NAMESPACE_NOTIFICATIONS);
  notificationsNs.use(authMiddleware);
  notificationsNs.use(createRateLimiterMiddleware());
  setupNotificationsNamespace(notificationsNs, redisPresence);

  // /chat namespace (skeleton — auth middleware only)
  const chatNs = io.of(NAMESPACE_CHAT);
  chatNs.use(authMiddleware);
  chatNs.use(createRateLimiterMiddleware());
  setupChatNamespace(chatNs, redisPresence);

  // Start EventBus bridge
  await startEventBusBridge(io, bridgeSubscriber);

  // Start listening
  httpServer.listen(REALTIME_PORT, () => {
    console.info(
      JSON.stringify({
        level: "info",
        message: "realtime.server.started",
        port: REALTIME_PORT,
      }),
    );
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.info(JSON.stringify({ level: "info", message: "realtime.server.shutdown" }));
    io.close();
    httpServer.close();
    await Promise.allSettled([bridgeSubscriber.quit(), redisPresence.quit()]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

void main().catch((err: Error) => {
  console.error(
    JSON.stringify({ level: "error", message: "realtime.server.fatal", error: err.message }),
  );
  process.exit(1);
});
