import { withApiHandler } from "@/server/api/middleware";
import { metricsRegistry } from "@/lib/metrics";
import { env } from "@/env";

export const GET = withApiHandler(
  async (request: Request) => {
    const metricsSecret = env.METRICS_SECRET;

    // In production, METRICS_SECRET must be set to prevent exposing infrastructure metrics
    if (!metricsSecret && env.NODE_ENV === "production") {
      return new Response("Metrics endpoint disabled — METRICS_SECRET not configured", {
        status: 503,
      });
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    if (metricsSecret && authHeader !== `Bearer ${metricsSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const metrics = await metricsRegistry.metrics();
    return new Response(metrics, {
      status: 200,
      headers: { "Content-Type": metricsRegistry.contentType },
    });
  },
  { skipCsrf: true },
);
