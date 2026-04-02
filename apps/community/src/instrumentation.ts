/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used to register background jobs and event-driven subscribers so they are
 * available before any route handler calls runJob() or the EventBus fires.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    await import("@/server/jobs"); // keep existing — do not remove

    // Restore maintenance mode state from DB so admin toggle survives container restarts
    try {
      const { getPlatformSetting } = await import("@/db/queries/platform-settings");
      const setting = await getPlatformSetting<{ enabled: boolean }>("maintenance_mode", {
        enabled: false,
      });
      process.env.MAINTENANCE_MODE = setting.enabled ? "true" : "false";
    } catch {
      // DB unavailable at startup — fall back to env var or default (off)
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
