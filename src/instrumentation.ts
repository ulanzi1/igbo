/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used to register background jobs and event-driven subscribers so they are
 * available before any route handler calls runJob() or the EventBus fires.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge or client)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/server/jobs");
  }
}
