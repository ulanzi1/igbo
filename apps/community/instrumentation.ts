export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initAuthRedis } = await import("@igbo/auth");
    const { setPermissionDeniedHandler } = await import("@igbo/auth/permissions");
    const { getRedisClient } = await import("@/lib/redis");
    const { eventBus } = await import("@/services/event-bus");

    // Initialize @igbo/auth with the app's Redis client
    initAuthRedis(getRedisClient());

    // Wire EventBus to receive permission denied events from @igbo/auth
    setPermissionDeniedHandler((event) => eventBus.emit("member.permission_denied", event));
  }
}
