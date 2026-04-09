export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Initialize Redis client for auth
    const { initAuthRedis } = await import("@igbo/auth");
    const { getRedisClient, getRedisPublisher, getRedisSubscriber } = await import("@/lib/redis");
    initAuthRedis(getRedisClient());

    // Initialize portal EventBus with Redis publisher
    const { portalEventBus } = await import("@/services/event-bus");
    portalEventBus.setPublisher(() => getRedisPublisher());

    // Start event bridge for community→portal events
    const { startPortalEventBridge } = await import("@/services/event-bridge");
    startPortalEventBridge(getRedisSubscriber());

    // Register portal notification handlers (seeker email + employer in-app notification)
    await import("@/services/notification-service");
  }
}
