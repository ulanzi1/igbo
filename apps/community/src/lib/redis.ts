// NOTE: No "server-only" — this is used by both Next.js server code and the standalone realtime server
import Redis from "ioredis";

// Use process.env directly so this module works in both Next.js and the standalone realtime server
// (importing @/env would trigger full env validation which fails outside Next.js)
function getRedisUrl(): string {
  const url = process.env.REDIS_URL; // ci-allow-process-env — shared with standalone realtime server
  if (!url) throw new Error("REDIS_URL environment variable is required");
  return url;
}

let redisClient: Redis | null = null;
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

function createRedisInstance(name: string): Redis {
  const instance = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    connectionName: name,
  });
  instance.on("error", (err: Error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "redis.connection-error",
        connectionName: name,
        error: err.message,
      }),
    );
  });
  return instance;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisInstance("igbo:general");
  }
  return redisClient;
}

export function getRedisPublisher(): Redis {
  if (!redisPublisher) {
    redisPublisher = createRedisInstance("igbo:publisher");
  }
  return redisPublisher;
}

export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    redisSubscriber = createRedisInstance("igbo:subscriber");
  }
  return redisSubscriber;
}

export async function closeAllRedisConnections(): Promise<void> {
  const connections = [redisClient, redisPublisher, redisSubscriber];
  await Promise.all(connections.filter(Boolean).map((conn) => conn!.quit()));
  redisClient = null;
  redisPublisher = null;
  redisSubscriber = null;
}
