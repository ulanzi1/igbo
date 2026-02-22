import "server-only";
import Redis from "ioredis";
import { env } from "@/env";

let redisClient: Redis | null = null;
let redisPublisher: Redis | null = null;
let redisSubscriber: Redis | null = null;

function createRedisInstance(name: string): Redis {
  const instance = new Redis(env.REDIS_URL, {
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
