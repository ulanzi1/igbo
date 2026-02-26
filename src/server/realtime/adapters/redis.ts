// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "socket.io";

/**
 * Creates and attaches the Redis adapter to the Socket.IO server.
 * Uses two separate ioredis clients (pub/sub) as required by @socket.io/redis-adapter.
 */
export function attachRedisAdapter(io: Server, redisUrl: string): void {
  const pubClient = new Redis(redisUrl, {
    lazyConnect: false,
    connectionName: "igbo:realtime:pub",
    maxRetriesPerRequest: 3,
  });
  const subClient = new Redis(redisUrl, {
    lazyConnect: false,
    connectionName: "igbo:realtime:sub",
    maxRetriesPerRequest: 3,
  });

  pubClient.on("error", (err: Error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "realtime.redis-adapter.pub-error",
        error: err.message,
      }),
    );
  });
  subClient.on("error", (err: Error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "realtime.redis-adapter.sub-error",
        error: err.message,
      }),
    );
  });

  io.adapter(createAdapter(pubClient, subClient));
}
