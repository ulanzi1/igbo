/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Merged content from both root and src/instrumentation.ts (Task 6, P-0.3B):
 * - Sentry registration
 * - Background jobs + event subscribers
 * - Maintenance mode restore from DB
 * - @igbo/auth Redis initialization + EventBus wiring
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    await import("@/server/jobs"); // keep existing — do not remove

    // Restore maintenance mode state from DB so admin toggle survives container restarts
    try {
      const { getPlatformSetting } = await import("@igbo/db/queries/platform-settings");
      const setting = await getPlatformSetting<{ enabled: boolean }>("maintenance_mode", {
        enabled: false,
      });
      process.env.MAINTENANCE_MODE = setting.enabled ? "true" : "false";
    } catch {
      // DB unavailable at startup — fall back to env var or default (off)
    }

    // Initialize @igbo/auth with the app's Redis client
    const { initAuthRedis } = await import("@igbo/auth");
    const { setPermissionDeniedHandler } = await import("@igbo/auth/permissions");
    const { getRedisClient } = await import("@/lib/redis");
    const { eventBus } = await import("@/services/event-bus");
    initAuthRedis(getRedisClient());
    setPermissionDeniedHandler((event) => {
      eventBus.emit("member.permission_denied", event);
    });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
