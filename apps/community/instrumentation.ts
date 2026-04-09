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

    // Initialize @igbo/auth with the app's Redis client — must happen before any auth
    // operations (setChallenge/getChallenge). Placed before job imports intentionally so
    // a failure in job initialization does not prevent auth from being usable.
    try {
      const { initAuthRedis } = await import("@igbo/auth");
      const { setPermissionDeniedHandler } = await import("@igbo/auth/permissions");
      const { getRedisClient } = await import("@/lib/redis");
      const { eventBus } = await import("@/services/event-bus");
      initAuthRedis(getRedisClient());
      setPermissionDeniedHandler((event) => {
        eventBus.emit("member.permission_denied", event);
      });
      console.info(
        JSON.stringify({ level: "info", message: "instrumentation.auth_redis_initialized" }),
      );
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "instrumentation.auth_redis_init_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      // Re-throw so the process exits rather than silently serving broken auth
      throw err;
    }

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
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
