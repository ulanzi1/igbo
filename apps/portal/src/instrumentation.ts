export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initAuthRedis } = await import("@igbo/auth");
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      connectionName: "igbo:portal",
    });
    redis.on("error", (err: Error) => console.error("[portal] Redis error:", err.message));
    initAuthRedis(redis);
  }
}
