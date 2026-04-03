// NOTE: No "server-only" — this module runs in both Next.js and standalone server contexts
import Redis from "ioredis";

let generalClient: Redis | null = null;
let publisherClient: Redis | null = null;
let subscriberClient: Redis | null = null;

function createClient(name: string): Redis {
  const client = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    connectionName: `igbo:portal:${name}`,
  });
  client.on("error", (err: Error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: `portal.redis.${name}-error`,
        error: err.message,
      }),
    );
  });
  return client;
}

export function getRedisClient(): Redis {
  if (!generalClient) {
    generalClient = createClient("general");
  }
  return generalClient;
}

export function getRedisPublisher(): Redis {
  if (!publisherClient) {
    publisherClient = createClient("publisher");
  }
  return publisherClient;
}

export function getRedisSubscriber(): Redis {
  if (!subscriberClient) {
    subscriberClient = createClient("subscriber");
  }
  return subscriberClient;
}

export async function closeAllRedisConnections(): Promise<void> {
  const connections = [generalClient, publisherClient, subscriberClient];
  await Promise.all(connections.filter(Boolean).map((conn) => conn!.quit()));
  generalClient = null;
  publisherClient = null;
  subscriberClient = null;
}
