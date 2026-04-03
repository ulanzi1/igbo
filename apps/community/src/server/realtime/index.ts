// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Registry, Gauge, Counter } from "prom-client";
import { Server } from "socket.io";
import Redis from "ioredis";
import { attachRedisAdapter } from "./adapters/redis";
import { authMiddleware } from "./middleware/auth";
import { createRateLimiterMiddleware } from "./middleware/rate-limiter";
import { setupNotificationsNamespace } from "./namespaces/notifications";
import { setupChatNamespace } from "./namespaces/chat";
import { setupPortalNamespace } from "./namespaces/portal";
import { startEventBusBridge } from "./subscribers/eventbus-bridge";
import { realtimeLogger } from "./logger";
import {
  REALTIME_PORT,
  REALTIME_CORS_ORIGINS,
  NAMESPACE_NOTIFICATIONS,
  NAMESPACE_CHAT,
} from "@igbo/config/realtime";

// Prometheus metrics for the realtime server (separate registry — no Next.js deps)
const realtimeRegistry = new Registry();
const wsActiveConnections = new Gauge({
  name: "ws_active_connections",
  help: "Active WebSocket connections per namespace",
  labelNames: ["namespace"],
  registers: [realtimeRegistry],
});
const wsMessagesTotal = new Counter({
  name: "ws_messages_total",
  help: "Total WebSocket messages per namespace and event",
  labelNames: ["namespace", "event"],
  registers: [realtimeRegistry],
});

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main(): Promise<void> {
  // HTTP server backing Socket.IO (also exposes GET /health and GET /metrics)
  const httpServer = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.method === "GET" && req.url === "/metrics") {
      const metricsSecret = process.env.METRICS_SECRET ?? "";
      // In production, METRICS_SECRET must be set to prevent exposing infrastructure metrics
      if (!metricsSecret && process.env.NODE_ENV === "production") {
        res.writeHead(503);
        res.end("Metrics endpoint disabled — METRICS_SECRET not configured");
        return;
      }
      const authHeader = req.headers["authorization"] ?? "";
      if (metricsSecret && authHeader !== `Bearer ${metricsSecret}`) {
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
      const metrics = await realtimeRegistry.metrics();
      res.writeHead(200, { "Content-Type": realtimeRegistry.contentType });
      res.end(metrics);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    cors: {
      origin: REALTIME_CORS_ORIGINS,
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
  notificationsNs.on("connection", (socket) => {
    const connectionTraceId = randomUUID();
    socket.data.traceId = connectionTraceId;
    wsActiveConnections.inc({ namespace: NAMESPACE_NOTIFICATIONS });
    realtimeLogger.info("ws.connection", {
      namespace: NAMESPACE_NOTIFICATIONS,
      traceId: connectionTraceId,
    });
    socket.on("disconnect", () => {
      wsActiveConnections.dec({ namespace: NAMESPACE_NOTIFICATIONS });
      realtimeLogger.info("ws.disconnect", {
        namespace: NAMESPACE_NOTIFICATIONS,
        traceId: connectionTraceId,
      });
    });
    socket.onAny((event: string) => {
      wsMessagesTotal.inc({ namespace: NAMESPACE_NOTIFICATIONS, event });
    });
  });

  // /chat namespace
  const chatNs = io.of(NAMESPACE_CHAT);
  chatNs.use(authMiddleware);
  chatNs.use(createRateLimiterMiddleware());
  setupChatNamespace(chatNs, redisPresence);
  chatNs.on("connection", (socket) => {
    const connectionTraceId = randomUUID();
    socket.data.traceId = connectionTraceId;
    wsActiveConnections.inc({ namespace: NAMESPACE_CHAT });
    realtimeLogger.info("ws.connection", { namespace: NAMESPACE_CHAT, traceId: connectionTraceId });
    socket.on("disconnect", () => {
      wsActiveConnections.dec({ namespace: NAMESPACE_CHAT });
      realtimeLogger.info("ws.disconnect", {
        namespace: NAMESPACE_CHAT,
        traceId: connectionTraceId,
      });
    });
    socket.onAny((event: string) => {
      wsMessagesTotal.inc({ namespace: NAMESPACE_CHAT, event });
    });
  });

  // /portal namespace — proof-of-concept for portal Socket.IO support (P-0.6)
  // Full handlers added in Epic 5+; no Prometheus metrics wired yet.
  setupPortalNamespace(io);

  // Start EventBus bridge
  await startEventBusBridge(io, bridgeSubscriber);

  // Start listening
  httpServer.listen(REALTIME_PORT, () => {
    realtimeLogger.info("realtime.server.started", { port: REALTIME_PORT });
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    realtimeLogger.info("realtime.server.shutdown");
    io.close();
    httpServer.close();
    await Promise.allSettled([bridgeSubscriber.quit(), redisPresence.quit()]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

void main().catch((err: Error) => {
  realtimeLogger.error("realtime.server.fatal", { error: err });
  process.exit(1);
});
