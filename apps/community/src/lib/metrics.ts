import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from "prom-client";

export const metricsRegistry = new Registry();

// HMR guard: only initialize once
if (!metricsRegistry.getSingleMetric("http_request_duration_seconds")) {
  collectDefaultMetrics({ register: metricsRegistry });
}

// Custom HTTP metrics
export const httpDuration: Histogram<string> =
  (metricsRegistry.getSingleMetric("http_request_duration_seconds") as Histogram<string>) ??
  new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    registers: [metricsRegistry],
  });

export const httpRequestsTotal: Counter<string> =
  (metricsRegistry.getSingleMetric("http_requests_total") as Counter<string>) ??
  new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [metricsRegistry],
  });

export const wsActiveConnections: Gauge<string> =
  (metricsRegistry.getSingleMetric("ws_active_connections") as Gauge<string>) ??
  new Gauge({
    name: "ws_active_connections",
    help: "Active WebSocket connections per namespace",
    labelNames: ["namespace"],
    registers: [metricsRegistry],
  });

export const wsMessagesTotal: Counter<string> =
  (metricsRegistry.getSingleMetric("ws_messages_total") as Counter<string>) ??
  new Counter({
    name: "ws_messages_total",
    help: "Total WebSocket messages per namespace and event",
    labelNames: ["namespace", "event"],
    registers: [metricsRegistry],
  });

export const appErrorsTotal: Counter<string> =
  (metricsRegistry.getSingleMetric("app_errors_total") as Counter<string>) ??
  new Counter({
    name: "app_errors_total",
    help: "Total application errors",
    labelNames: ["type"],
    registers: [metricsRegistry],
  });
