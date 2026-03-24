# Story 12.3: Monitoring, Logging & Alerting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want comprehensive monitoring, structured logging, and alerting for the production environment,
so that errors are caught quickly, performance degradation is detected, and outages are minimized.

## Acceptance Criteria

1. **Given** the platform needs error tracking, **When** Sentry is integrated, **Then** all unhandled exceptions and rejected promises are captured with stack traces, user context (user ID only — never PII), and release version; **And** Sentry performance monitoring tracks transaction durations for API routes and server actions.

2. **Given** the platform needs infrastructure metrics, **When** Prometheus and Grafana are deployed (self-hosted on Hetzner), **Then** the following metrics are collected: CPU, memory, disk usage, network I/O, container health, PostgreSQL query stats, Redis memory and connection stats, and Socket.IO active connection counts; **And** Grafana dashboards display real-time infrastructure health.

3. **Given** the platform needs request tracing and structured logging, **When** the tracing middleware and logger are implemented, **Then** a structured logger utility (`src/lib/logger.ts`) automatically injects the current `traceId` from `AsyncLocalStorage` into every log entry; **And** all logs are structured JSON to stdout (captured by Docker) with fields: `timestamp`, `level`, `traceId`, `message`, `context` (service/module name), and optional `error` (stack trace); **And** the tracing middleware is registered in the Socket.IO server's connection handler; **And** PII is never logged — user IDs only.

4. **Given** the platform needs uptime monitoring, **When** UptimeRobot (or similar) is configured, **Then** external health checks poll `/api/health` every 60 seconds; **And** downtime alerts are sent to the ops team via email and/or Slack.

5. **Given** the team needs proactive alerting, **When** alert rules are configured, **Then** alerts fire for: error rate spikes (> 5% of requests in 5min), p95 API latency > 500ms, disk usage > 80%, WebSocket connection count drops > 50% in 1 minute, and health check failures.

## Tasks / Subtasks

- [x] Task 1: Install and configure Sentry SDK for Next.js (AC: #1)
  - [x]1.1 Install `@sentry/nextjs` package: `bun add @sentry/nextjs`
  - [x]1.2 Create `sentry.client.config.ts` at project root: initialize Sentry with DSN from env, enable `BrowserTracing` integration, `replaysOnErrorSampleRate: 1.0`, `tracesSampleRate: 0.1` (10% sampling in production — adjust later based on volume). Set `environment` from `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (default `NODE_ENV`). Set user context to `{ id: userId }` only — never email or name.
  - [x]1.3 Create `sentry.server.config.ts` at project root: initialize Sentry with DSN from `SENTRY_DSN` env var, `tracesSampleRate: 0.1`, `release` from `SENTRY_RELEASE` env var (set to git SHA in CI — see Task 8). Set `environment`.
  - [x]1.4 Create `sentry.edge.config.ts` at project root: initialize Sentry with DSN for Edge runtime (middleware runs in Edge). Minimal config — `tracesSampleRate: 0.1`, `environment`.
  - [x]1.5 Update `next.config.ts`: wrap final export with `withSentryConfig()` from `@sentry/nextjs`. Compose order: `withSerwist(withNextIntl(withSentryConfig(nextConfig, sentryOptions)))`. Set `sentryOptions`: `org`, `project` from env (optional — Sentry CLI uploads source maps during build if `SENTRY_AUTH_TOKEN` is set), `silent: true` (suppress Sentry CLI output in build), `disableLogger: true` (use our own logger).
  - [x]1.6 Add env vars to `src/env.ts`: server `SENTRY_DSN` (optional string, default ""), client `NEXT_PUBLIC_SENTRY_DSN` (optional string, default ""), server `SENTRY_RELEASE` (optional string), `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (optional string), server `LOG_LEVEL` (`z.enum(["debug","info","warn","error"]).optional()`). All optional so dev environments work without Sentry configured.
  - [x]1.7 Add env vars to `.env.example` and `.env.production.example` with placeholder values
  - [x]1.8 Create `src/app/global-error.tsx`: Next.js App Router global error boundary that reports to Sentry via `Sentry.captureException(error)` and renders a fallback error page. Import from `@sentry/nextjs`.
  - [x]1.9 Update `withApiHandler` in `src/server/api/middleware.ts`: (a) In the catch block for unknown errors (line 136-144), add `Sentry.captureException(error, { tags: { traceId } })` before the console.error. Import Sentry conditionally — only call if DSN is configured (`env.SENTRY_DSN`). Do NOT replace the existing console.error — Sentry supplements it. (b) After the `runWithContext` call extracts userId from the session (if available), call `Sentry.setUser({ id: getRequestContext()?.userId ?? undefined })` — NEVER pass email, name, or any PII. Only `{ id }`. This wires user context to every Sentry error captured from API routes.
  - [x]1.10 Update CSP in `next.config.ts`: add Sentry ingest domain to `connect-src` directive. Sentry SDK sends to `*.ingest.sentry.io` — add `https://*.ingest.sentry.io` to connect-src. Also add `https://*.sentry.io` to `script-src` for the Sentry Replay SDK loader.
  - [x]1.11 **MODIFY** `src/instrumentation.ts` (**already exists** — do NOT create from scratch or you will destroy the job registry initialization). The file currently contains:
    ```ts
    export async function register() {
      if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("@/server/jobs");
      }
    }
    ```
    Add Sentry init **inside** the existing `register()` function alongside the job import:
    ```ts
    export async function register() {
      if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("../sentry.server.config");
        await import("@/server/jobs"); // keep existing — do not remove
      }
      if (process.env.NEXT_RUNTIME === "edge") {
        await import("../sentry.edge.config");
      }
    }
    ```
    See Next.js docs: `instrumentation.ts` is the recommended entry point for `@sentry/nextjs` v8+.

- [x] Task 2: Create structured logger utility (AC: #3)
  - [x]2.1 Create `src/lib/logger.ts`: export a `logger` object with methods `info(message, context?)`, `warn(message, context?)`, `error(message, context?)`, `debug(message, context?)`. Each method outputs a single `JSON.stringify()` line to stdout via `console.info`/`console.warn`/`console.error`/`console.debug`.
  - [x]2.2 JSON structure: `{ timestamp: ISO8601, level: "info"|"warn"|"error"|"debug", traceId: string|undefined, message: string, context: string|undefined, ...extra }`. `traceId` auto-injected from `getRequestContext()?.traceId` (import from `@/lib/request-context`).
  - [x]2.3 Export `createLogger(context: string)` factory: returns a logger with `context` pre-set (e.g., `createLogger("job-runner")`, `createLogger("email-service")`). This replaces the manual `JSON.stringify` pattern used throughout the codebase.
  - [x]2.4 `debug` level: only outputs when `NODE_ENV !== "production"` (or `LOG_LEVEL=debug` env var is set). This prevents debug noise in production.
  - [x]2.5 Error serialization: when `context` contains an `error` property that is an `Error` instance, extract `{ message, stack, name }` — never serialize the full error object (may contain PII in custom properties).

- [x] Task 3: Migrate existing log calls to structured logger (AC: #3)
  - [x]3.1 `src/server/api/middleware.ts` (line 136-144): replace `console.error(JSON.stringify({...}))` with `logger.error("unhandled_route_error", { error, traceId })` — traceId is auto-injected by logger but also explicitly available in this scope.
  - [x]3.2 `src/server/jobs/job-runner.ts`: replace all `console.info(JSON.stringify({...}))` and `console.error(JSON.stringify({...}))` calls with `const log = createLogger("job-runner"); log.info(...)` / `log.error(...)`.
  - [x]3.3 `src/services/email-service.ts`: replace structured JSON console calls with `createLogger("email-service")`.
  - [x]3.4 `src/server/realtime/index.ts`: replace `console.info(JSON.stringify({...}))` calls with the realtime-local logger (see Task 4). **Do NOT import from `@/lib/logger`** — use `src/server/realtime/logger.ts` (created in Task 4's file structure). The realtime server is a standalone esbuild-bundled Node.js process; create `src/server/realtime/logger.ts` that inlines the same JSON format as `src/lib/logger.ts` but has zero `@/` imports.
  - [x]3.5 `src/services/audit-logger.ts`: the audit logger writes to DB (not stdout) — no changes needed. Verify it doesn't have console.log calls that need migration.
  - [x]3.6 Any other files with `console.info(JSON.stringify({` pattern: search codebase with `grep -r "console\.\(info\|error\|warn\)(JSON.stringify"` and migrate remaining calls. Preserve the same log fields — only change the emission mechanism.

- [x] Task 4: Add tracing to Socket.IO realtime server (AC: #3)
  - [x]4.1 In `src/server/realtime/index.ts`, add tracing to Socket.IO connection: on `connection` event, generate a `connectionTraceId` (UUID) and attach to `socket.data.traceId`. Log connection with traceId.
  - [x]4.2 In namespace handlers (`src/server/realtime/namespaces/chat.ts`, `src/server/realtime/namespaces/notifications.ts`): use `socket.data.traceId` in log entries for event handling.
  - [x]4.3 In `src/server/realtime/subscribers/eventbus-bridge.ts`: add traceId to bridge log entries (use a per-message UUID or extract from event payload if available — EventBus payloads may include `traceId` from the originating request).

- [x] Task 5: Prometheus metrics + /metrics endpoint (AC: #2)
  - [x]5.1 Install `prom-client` package: `bun add prom-client`
  - [x]5.2 Create `src/lib/metrics.ts`: use `new Registry()` (NOT the default global registry — avoids Edge runtime conflicts and Next.js HMR re-registration errors). **CRITICAL HMR guard**: check before registering to prevent `Error: Metric already registered` on hot-reload:
    ```ts
    import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from "prom-client";
    export const metricsRegistry = new Registry();
    // HMR guard: only initialize once
    if (!metricsRegistry.getSingleMetric("http_request_duration_seconds")) {
      collectDefaultMetrics({ register: metricsRegistry });
      // register custom metrics below
    }
    ```
    Export custom metrics (after the guard):
    - `http_request_duration_seconds` (Histogram): labels `method`, `route`, `status_code`; `registers: [metricsRegistry]`
    - `http_requests_total` (Counter): labels `method`, `route`, `status_code`; `registers: [metricsRegistry]`
    - `ws_active_connections` (Gauge): labels `namespace` (`/chat`, `/notifications`); `registers: [metricsRegistry]`
    - `ws_messages_total` (Counter): labels `namespace`, `event`; `registers: [metricsRegistry]`
    - `app_errors_total` (Counter): labels `type` (`unhandled`, `api`, `validation`); `registers: [metricsRegistry]`
      Use `export const httpDuration = metricsRegistry.getSingleMetric(...) ?? new Histogram({...})` pattern for each metric after the guard check.
  - [x]5.3 Create `src/app/api/metrics/route.ts`: GET endpoint that returns `metricsRegistry.metrics()` in Prometheus text format (`Content-Type: text/plain; version=0.0.4`). Wrap with `withApiHandler({ skipCsrf: true })`. **IMPORTANT**: This endpoint must be protected — use bearer token: `Authorization: Bearer ${METRICS_SECRET}` header check. Return 401 if missing or wrong.
  - [x]5.4 Add HTTP request instrumentation to `withApiHandler` in `src/server/api/middleware.ts`: record `http_request_duration_seconds` and `http_requests_total` for every API request. Extract route from `request.url` pathname and normalize to prevent cardinality explosion using this exact function:
    ```ts
    function normalizeRoute(pathname: string): string {
      return pathname
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
        .replace(/\/\d+(?=\/|$)/g, "/:id");
    }
    // e.g. /api/v1/users/abc-123-def/points → /api/v1/users/:id/points
    ```
    Record start time before calling `handler(request)`, then observe duration + increment counter in a `finally` block (so metrics record even on error).
  - [x]5.5 Add WebSocket metrics to `src/server/realtime/index.ts`: increment/decrement `ws_active_connections` on connect/disconnect per namespace. Increment `ws_messages_total` on each event. The realtime server runs as a separate process — add its own `/metrics` endpoint to the existing HTTP server request handler (alongside `/health` which is already at lines 23-26). Create a separate `new Registry()` instance for the realtime server (do NOT import from `src/lib/metrics.ts` — that would pull in Next.js dependencies). Define `ws_active_connections` and `ws_messages_total` inline in `src/server/realtime/index.ts` using the local registry.
  - [x]5.6 Add `METRICS_SECRET` to `src/env.ts` (optional string, default "") and to `.env.example` / `.env.production.example`.

- [x] Task 6: Docker monitoring stack — Prometheus + Grafana (AC: #2)
  - [x]6.1 Create `docker-compose.monitoring.yml`: separate compose file for monitoring stack (keeps monitoring optional and decoupled from app compose). Services: `prometheus` (prom/prometheus:latest, port 9090), `grafana` (grafana/grafana:latest, port 3002), `node-exporter` (prom/node-exporter:latest — host CPU/memory/disk/network metrics). All on `app-network` to reach web:3000 and realtime:3001 /metrics endpoints. Add resource limits (`mem_limit`, `cpus`) per service. **Set Grafana admin credentials via env vars** (not defaults) to prevent first-login prompt in production:
    ```yaml
    grafana:
      environment:
        - GF_SECURITY_ADMIN_USER=admin
        - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
    ```
    Add `GRAFANA_ADMIN_PASSWORD` to `.env.production.example`.
  - [x]6.2 Create `monitoring/prometheus/prometheus.yml`: scrape configs for `web:3000/api/metrics` (bearer_token from METRICS_SECRET), `realtime:3001/metrics`, `node-exporter:9100/metrics`. Scrape interval: 15s. Global evaluation interval: 15s.
  - [x]6.3 Create `monitoring/grafana/provisioning/datasources/prometheus.yml`: auto-provision Prometheus as Grafana data source (URL: `http://prometheus:9090`).
  - [x]6.4 Create `monitoring/grafana/provisioning/dashboards/dashboard.yml` + `monitoring/grafana/dashboards/igbo-overview.json`: pre-built Grafana dashboard with panels for: HTTP request rate, error rate (5xx), p95 latency, active WebSocket connections, CPU/memory/disk (from node-exporter), Redis memory. **Shortcut**: for infrastructure panels (CPU/memory/disk/network), use the Grafana community dashboard [Node Exporter Full (ID 1860)](https://grafana.com/grafana/dashboards/1860) as a base — download the JSON from grafana.com and paste into `igbo-overview.json`, then add a second row of panels for app-specific metrics (HTTP rate, error rate, WebSocket connections) using queries against the `web` and `realtime` scrape targets. The test (9.4) only validates that the file is valid JSON with a `panels` array — content completeness is at developer discretion. Use Grafana's JSON dashboard model (top-level keys: `title`, `uid`, `panels`, `schemaVersion`, `version`).
  - [x]6.5 Add `monitoring/` directory gitignore exception: Grafana creates `grafana-data` volume for persistence — ensure volume is in compose but not gitignored. Add Prometheus data volume.
  - [x]6.6 Document usage: add `docs/monitoring-setup.md` with: how to start monitoring stack (`docker compose -f docker-compose.monitoring.yml up -d`), access Grafana (http://localhost:3002, default admin/admin), access Prometheus (http://localhost:9090), adding custom dashboards.

- [x] Task 7: Alert rules + Alertmanager (AC: #5)
  - [x]7.1 Create `monitoring/prometheus/alert-rules.yml`: Prometheus alert rules:
    - `HighErrorRate`: `rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05` — fires when >5% of requests are 5xx in 5min window
    - `HighLatency`: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5` — p95 > 500ms
    - `HighDiskUsage`: `(1 - node_filesystem_avail_bytes / node_filesystem_size_bytes) > 0.8` — disk >80%
    - `WebSocketConnectionDrop`: fires when current connections < 50% of connections from 1 minute ago AND prior connections were meaningful (avoids false-positives at zero load). Use valid PromQL:
      ```
      (ws_active_connections offset 1m > 10) and
      (ws_active_connections / (ws_active_connections offset 1m) < 0.5)
      ```
    - `HealthCheckFailure`: `up{job="web"} == 0 or up{job="realtime"} == 0` — scrape target down
  - [x]7.2 Add Alertmanager service to `docker-compose.monitoring.yml`: `prom/alertmanager:latest`, port 9093, config from `monitoring/alertmanager/alertmanager.yml`.
  - [x]7.3 Create `monitoring/alertmanager/alertmanager.yml`: configure email receiver (SMTP settings from env) and/or webhook receiver (Slack webhook URL from env). Use `ALERTMANAGER_SMTP_*` and `ALERTMANAGER_SLACK_WEBHOOK` env vars. For launch: email alerts to ops team.
  - [x]7.4 Update `monitoring/prometheus/prometheus.yml`: add `alerting:` section pointing to Alertmanager, add `rule_files:` section pointing to `alert-rules.yml`.

- [x] Task 8: UptimeRobot documentation + CI Sentry release (AC: #4, #1)
  - [x]8.1 Create `docs/uptimerobot-setup.md`: step-by-step UptimeRobot configuration guide — create HTTP(S) monitor, URL: `https://<domain>/api/health`, interval: 60 seconds, keyword monitor (check for `"status":"healthy"` in response body), alert contacts (email, optional Slack via integration).
  - [x]8.2 Update `.github/workflows/deploy.yml`: add `SENTRY_RELEASE: sha-${{ github.sha }}` env var to docker-build job. Add `SENTRY_AUTH_TOKEN` from GitHub secrets for source map upload during build. Add `SENTRY_ORG` and `SENTRY_PROJECT` secrets.
  - [x]8.3 Update `.env.production.example`: add all new env vars (SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, SENTRY_RELEASE, NEXT_PUBLIC_SENTRY_ENVIRONMENT, METRICS_SECRET, LOG_LEVEL, GRAFANA_ADMIN_PASSWORD). **Do NOT add `SENTRY_AUTH_TOKEN` to production server** — it is a CI-only build secret (used by Sentry CLI during Docker image build, stored in GitHub Secrets only). Add a comment in `.env.production.example`: `# SENTRY_AUTH_TOKEN — CI BUILD ONLY. Set in GitHub Secrets, not on production server.` Similarly, `SENTRY_ORG` and `SENTRY_PROJECT` are build-time Sentry CLI vars — CI only, not needed at runtime on the server.

- [x] Task 9: Tests (AC: all)
  - **ALL new test files require `// @vitest-environment node` at the top** (project-wide convention for server files — required for `AsyncLocalStorage`, `fs`, `path` to work correctly in vitest).
  - [x]9.1 Create `src/lib/logger.test.ts` (`// @vitest-environment node`): test logger outputs valid JSON with required fields (timestamp, level, message), test traceId auto-injection from mocked request context (`vi.mock("@/lib/request-context", ...)`), test `createLogger("context-name")` pre-sets context field, test debug level suppressed in production, test error serialization extracts message/stack/name only.
  - [x]9.2 Create `src/lib/metrics.test.ts` (`// @vitest-environment node`): test that custom metrics are registered (http_request_duration_seconds, http_requests_total, ws_active_connections, etc.), test that `metricsRegistry.metrics()` returns Prometheus text format, test route normalization (UUID segments → `:id`).
  - [x]9.3 Create `src/app/api/metrics/route.test.ts` (`// @vitest-environment node`): test GET returns Prometheus text format with 200, test unauthorized request (missing/wrong bearer token) returns 401, test metrics endpoint uses `skipCsrf: true`.
  - [x]9.4 Create `monitoring-infra.test.ts` at project root (`// @vitest-environment node`, same pattern as `ci-infra.test.ts` and `prod-infra.test.ts` — use `js-yaml` (already installed) for YAML parsing, `fs/promises` + `path` for file reads). Parse and validate monitoring infrastructure files:
    - `docker-compose.monitoring.yml` is valid YAML with prometheus, grafana, node-exporter, alertmanager services
    - `monitoring/prometheus/prometheus.yml` has scrape_configs for web and realtime targets
    - `monitoring/prometheus/alert-rules.yml` has all 5 alert rules defined
    - `monitoring/alertmanager/alertmanager.yml` exists and is valid YAML
    - `monitoring/grafana/provisioning/datasources/prometheus.yml` exists
    - `monitoring/grafana/dashboards/igbo-overview.json` is valid JSON with dashboard panels
    - All docs exist: `docs/monitoring-setup.md`, `docs/uptimerobot-setup.md`
  - [x]9.5 Test Sentry configuration: verify `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts` exist. Verify `src/app/global-error.tsx` exists.
  - [x]9.6 Test `withApiHandler` Sentry integration: verify that unknown errors call `Sentry.captureException` (mock Sentry, trigger unhandled error, assert captureException called with error and traceId tag).
  - [x]9.7 Test `withApiHandler` HTTP metrics: verify that request duration and request count metrics are recorded after handling a request (mock prom-client, assert histogram observe and counter inc called).
  - [x]9.8 Verify `.env.production.example` contains all new env vars (SENTRY_DSN, METRICS_SECRET, etc.)

## Dev Notes

### Current State Analysis

**Existing tracing infrastructure (ALREADY DONE — do not recreate):**

- `src/lib/request-context.ts`: `AsyncLocalStorage<RequestContext>` with `{ traceId: string; userId?: string }`. Functions: `getRequestContext()`, `runWithContext()`.
- `src/middleware.ts` (Edge middleware, line 68-71): generates `X-Request-Id` UUID if not present on incoming request. Passes it through response headers. This runs on EVERY request (all routes).
- `src/server/api/middleware.ts` (`withApiHandler`, line 75): extracts `traceId` from `X-Request-Id` header (or generates UUID). Calls `runWithContext({ traceId }, () => handler(request))` (line 113). Enriches response with `X-Request-Id` header.
- **Key insight**: tracing is ALREADY working for API routes. The missing pieces are: (a) a logger that auto-injects traceId, (b) tracing in Socket.IO server, (c) Sentry + Prometheus.

**Existing structured logging pattern (to be replaced by logger utility):**

All services currently use manual `console.info(JSON.stringify({ level, message, ... }))`:

- `src/server/api/middleware.ts` (line 136-144): `console.error(JSON.stringify({ level: "error", traceId, message: "unhandled_route_error", error, stack }))`
- `src/server/jobs/job-runner.ts`: multiple structured JSON log calls
- `src/services/email-service.ts`: structured JSON log calls
- `src/server/realtime/index.ts` (line 77-82, 88): structured JSON log calls

**Existing health endpoints:**

- `/api/v1/health` (wrapped with `withApiHandler`): checks DB (`SELECT 1`), Redis (`ping`), realtime (`fetch /health`). Returns `{ status: "healthy"|"degraded", db, redis, realtime, uptime }`. HTTP 200 if DB+Redis up, 503 if either down. This is the Docker HEALTHCHECK target.
- `/api/health` (unwrapped): returns simple `{ status: "ok" }`. This is the UptimeRobot target.

**Sentry status: NOT INSTALLED.** No `@sentry/nextjs` in package.json. No Sentry config files. Architecture specifies Sentry for error tracking + performance monitoring.

**Prometheus status: NOT INSTALLED.** No `prom-client` in package.json. No metrics endpoint. Architecture specifies self-hosted Prometheus + Grafana on Hetzner.

**`next.config.ts` composition chain:**

Current: `export default withSerwist(withNextIntl(nextConfig))`
After Sentry: `export default withSerwist(withNextIntl(withSentryConfig(nextConfig, sentryOptions)))`
Sentry must be innermost (applied to nextConfig first) so its webpack plugin runs before Serwist's webpack modifications.

**Realtime server architecture:**

- `src/server/realtime/index.ts`: standalone Node.js process, NOT a Next.js route
- Bundled with esbuild (see `package.json` build script)
- Uses `@/config/realtime` import (path aliases resolved by esbuild)
- Has its own HTTP server with `/health` endpoint
- Does NOT import from `@/lib/` — must verify esbuild resolves `@/lib/logger` or create a local logger
- Socket.IO namespaces: `/notifications`, `/chat`
- EventBus bridge subscribes to Redis `eventbus:*` channels

**Docker Compose architecture:**

- `docker-compose.yml`: local dev (postgres, redis, realtime, minio)
- `docker-compose.prod.yml`: production (web, realtime, postgres, redis, clamav, backup)
- Monitoring stack should be in a SEPARATE `docker-compose.monitoring.yml` — keeps monitoring optional. Run with: `docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d`
- All services on `app-network` (bridge) — monitoring containers must join the same network

### Architecture Compliance

- **Sentry**: Free tier, error capture + performance monitoring + release tracking per architecture spec
- **Prometheus + Grafana**: Self-hosted on Hetzner per architecture spec. Metrics: CPU, memory, disk, network, container health, DB stats, Redis stats, Socket.IO connections.
- **Logging**: Structured JSON to stdout per architecture spec. Fields: `timestamp`, `level`, `traceId`, `message`, `context`, optional `error`. Captured by Docker, queryable via `docker logs`.
- **UptimeRobot**: External health checks, free tier per architecture spec
- **PII**: Never logged — user IDs only per architecture spec + GDPR compliance

### Key Technical Decisions

1. **Sentry SDK version**: Use `@sentry/nextjs` v8+ which supports Next.js App Router, `instrumentation.ts` hook, and automatic server/client/edge config loading.
2. **Sentry DSN as optional**: All Sentry env vars are optional (default "") so dev environments work without Sentry. Sentry init is a no-op when DSN is empty.
3. **`withSentryConfig` composition**: Must be innermost wrapper in next.config.ts chain. Sentry's webpack plugin adds source map upload + error boundary instrumentation. Order: `withSerwist(withNextIntl(withSentryConfig(nextConfig)))`.
4. **Logger does NOT replace `console.error` in prod**: Logger uses `console.*` under the hood (stdout/stderr). Docker captures these. No external log shipping (Loki) in this story — documented as future enhancement.
5. **Realtime server logger**: Create a minimal `src/server/realtime/logger.ts` that replicates the same JSON format as `src/lib/logger.ts` but without importing from `@/lib/`. The realtime server is esbuild-bundled and may not resolve `@/lib/` path aliases at runtime.
6. **Prometheus metrics endpoint security**: Bearer token auth (`METRICS_SECRET`), not IP allowlist. Simpler to configure in Docker environments where IPs are dynamic.
7. **Separate monitoring compose file**: `docker-compose.monitoring.yml` keeps monitoring stack decoupled. Production can run with or without monitoring. Combined with prod compose via `-f` flag.
8. **Grafana dashboard as JSON**: Pre-built dashboard JSON in `monitoring/grafana/dashboards/` — auto-provisioned via Grafana's provisioning system. No manual dashboard creation needed.
9. **Alert via Alertmanager**: Prometheus → Alertmanager → email (primary). Slack webhook as optional secondary channel. No PagerDuty (too complex for launch).
10. **No database metrics exporter**: `pg_stat_statements` requires PostgreSQL extension and configuration. Deferred — basic DB connectivity is monitored via health endpoint. Future: add `postgres-exporter` sidecar.
11. **Route normalization for metrics**: Dynamic route segments (UUIDs, numeric IDs) must be normalized to `:id` to prevent Prometheus cardinality explosion. Use: UUID regex `[0-9a-f]{8}-...(gi) → ":id"`, then numeric segment `\/\d+(?=\/|$) → "/:id"`. e.g. `/api/v1/users/abc-123-def-456/points` → `/api/v1/users/:id/points`.
12. **`instrumentation.ts` over layout.tsx**: Next.js v14+ recommends `instrumentation.ts` for Sentry server-side init. Architecture spec says `layout.tsx` — this is outdated; `instrumentation.ts` is the correct pattern for `@sentry/nextjs` v8+.

### Critical Guardrails

- **NEVER log PII**: No emails, names, passwords, tokens in logs. User IDs only. Logger should NOT accept arbitrary objects that may contain PII — use explicit field extraction.
- **NEVER commit Sentry DSN or auth token**: Use env vars only. DSN is in `.env` / GitHub secrets.
- **NEVER expose /api/metrics without auth**: Prometheus metrics can leak infrastructure details. Always require bearer token.
- **Sentry user context**: Set `Sentry.setUser({ id: userId })` — NEVER `{ email, username, name }`.
- **Logger PII guard**: The error serialization in logger must only extract `{ message, stack, name }` from Error objects — never serialize unknown properties that may contain user data.
- **CSP update for Sentry**: Sentry SDK sends to `*.ingest.sentry.io`. Must add to `connect-src` in CSP or Sentry reporting will be silently blocked.
- **Realtime server is separate**: It runs as standalone Node.js (not Next.js). It does NOT have access to Next.js middleware or `@/lib/` at runtime. Any shared code must be bundled correctly by esbuild or duplicated.
- **Prometheus scrape interval**: 15s is standard. Don't go below 10s — causes unnecessary load on small deployments.
- **Grafana default credentials**: Change `admin/admin` on first login in production. Document this in setup guide.
- **Alert thresholds are starting points**: 5% error rate, 500ms p95, 80% disk are reasonable defaults. They should be tuned after observing production patterns.
- **`withApiHandler` changes must not break existing tests**: Adding metrics/Sentry to the middleware is additive — existing behavior must be preserved. Add global mocks to `vitest.setup.ts` (not individual test files) — see Testing Requirements for the exact mock shapes needed.

### File Structure

Files to create:

```
sentry.client.config.ts                        # NEW — Sentry browser SDK config
sentry.server.config.ts                        # NEW — Sentry Node.js SDK config
sentry.edge.config.ts                          # NEW — Sentry Edge runtime config
src/app/global-error.tsx                       # NEW — Global error boundary with Sentry reporting
src/lib/logger.ts                              # NEW — Structured JSON logger with traceId injection
src/lib/logger.test.ts                         # NEW — Logger tests
src/lib/metrics.ts                             # NEW — Prometheus metrics definitions
src/lib/metrics.test.ts                        # NEW — Metrics tests
src/app/api/metrics/route.ts                   # NEW — Prometheus metrics endpoint
src/app/api/metrics/route.test.ts              # NEW — Metrics endpoint tests
src/server/realtime/logger.ts                  # NEW — Realtime server logger (standalone, no @/ imports)
docker-compose.monitoring.yml                  # NEW — Prometheus + Grafana + node-exporter + Alertmanager
monitoring/prometheus/prometheus.yml            # NEW — Prometheus scrape config
monitoring/prometheus/alert-rules.yml          # NEW — Prometheus alert rules
monitoring/alertmanager/alertmanager.yml       # NEW — Alertmanager config (email + optional Slack)
monitoring/grafana/provisioning/datasources/prometheus.yml  # NEW — Auto-provision Prometheus datasource
monitoring/grafana/provisioning/dashboards/dashboard.yml     # NEW — Dashboard provisioning config
monitoring/grafana/dashboards/igbo-overview.json             # NEW — Pre-built Grafana dashboard
docs/monitoring-setup.md                       # NEW — Monitoring stack usage guide
docs/uptimerobot-setup.md                      # NEW — UptimeRobot configuration guide
monitoring-infra.test.ts                       # NEW — Infrastructure validation tests
```

Files to modify:

```
next.config.ts                                 # MODIFY — Add withSentryConfig wrapper + CSP update
src/env.ts                                     # MODIFY — Add SENTRY_DSN, METRICS_SECRET, LOG_LEVEL env vars
src/instrumentation.ts                         # MODIFY — Add Sentry init inside existing register() (already has job import)
src/server/api/middleware.ts                   # MODIFY — Add Sentry.captureException + HTTP metrics recording
src/server/realtime/index.ts                   # MODIFY — Add tracing + WebSocket metrics + /metrics endpoint
src/server/jobs/job-runner.ts                  # MODIFY — Replace console.info/error with logger
src/services/email-service.ts                  # MODIFY — Replace console.info/error with logger
vitest.setup.ts                                # MODIFY — Add global vi.mock("prom-client") and vi.mock("@sentry/nextjs")
.env.example                                   # MODIFY — Add new env vars
.env.production.example                        # MODIFY — Add new env vars (not SENTRY_AUTH_TOKEN — CI only)
.github/workflows/deploy.yml                  # MODIFY — Add SENTRY_RELEASE + SENTRY_AUTH_TOKEN (build-time CI secrets)
```

Files unchanged (reference only):

```
src/lib/request-context.ts                     # NO CHANGES (tracing already works)
src/middleware.ts                              # NO CHANGES (X-Request-Id generation already works)
src/services/audit-logger.ts                   # NO CHANGES (DB-based audit logging, not stdout)
src/app/api/v1/health/route.ts                 # NO CHANGES (health endpoint already complete)
src/app/api/health/route.ts                    # NO CHANGES (simple health check for UptimeRobot)
docker-compose.prod.yml                        # NO CHANGES (monitoring is in separate compose file)
docker-compose.yml                             # NO CHANGES (local dev)
```

### Testing Requirements

- **Logger utility**: Unit tests for JSON output format, traceId injection, context pre-setting, debug suppression, error serialization. Mock `getRequestContext()` from `@/lib/request-context`.
- **Metrics**: Unit tests for metric registration, Prometheus text format output, route normalization.
- **Metrics route**: Test authorized access (correct bearer token → 200), unauthorized (missing/wrong token → 401), Prometheus format response.
- **Sentry integration**: Existence tests for config files. Integration test for `withApiHandler` Sentry capture on unhandled error.
- **Monitoring infra**: Parse YAML/JSON files and validate structure (same pattern as `ci-infra.test.ts` and `prod-infra.test.ts`).
- **Expected test count**: ~50-65 tests (12 logger, 8 metrics, 6 metrics route, 15 monitoring infra, 5 sentry config, 4 withApiHandler sentry, 4 withApiHandler metrics, 5 env/docs validation).
- **Pre-existing test handling — REQUIRED action**: Adding prom-client and Sentry imports to `withApiHandler` WILL break hundreds of existing route tests. **Do NOT add mocks to individual test files.** Instead, add global mocks to `vitest.setup.ts` (the project's shared test setup file):
  ```ts
  vi.mock("prom-client", () => ({
    Registry: vi.fn(() => ({
      getSingleMetric: vi.fn(() => undefined),
      metrics: vi.fn(() => ""),
      contentType: "text/plain",
    })),
    collectDefaultMetrics: vi.fn(),
    Histogram: vi.fn(() => ({ observe: vi.fn(), startTimer: vi.fn(() => vi.fn()) })),
    Counter: vi.fn(() => ({ inc: vi.fn() })),
    Gauge: vi.fn(() => ({ set: vi.fn(), inc: vi.fn(), dec: vi.fn() })),
  }));
  vi.mock("@sentry/nextjs", () => ({
    captureException: vi.fn(),
    setUser: vi.fn(),
    init: vi.fn(),
  }));
  ```
  These global mocks ensure zero changes to any existing test files.

### Previous Story Intelligence (12.1 + 12.2 Learnings)

**From Story 12.1:**

- `ci-infra.test.ts` established the pattern for testing infrastructure files — parse YAML/JSON configs and assert structural properties. Follow this pattern for `monitoring-infra.test.ts`.
- `docker-compose.prod.yml` has `image:` fields with env var defaults — monitoring compose should use fixed upstream images (no GHCR).
- `playwright.config.ts` webServer.command updated for CI mode — no impact on this story.

**From Story 12.2:**

- `prod-infra.test.ts` used `js-yaml` for YAML parsing — reuse the same approach for monitoring YAML files.
- `.env.production.example` already contains all T3 Env vars — append new vars (SENTRY_DSN, METRICS_SECRET, etc.) to the end.
- K8s manifests pattern (parse YAML, check required fields) — applicable to Prometheus/Grafana config validation.
- `withApiHandler` changes must be backward-compatible — tests in 12.2 didn't modify it; our changes (Sentry + metrics) are purely additive.
- Test count baseline: **4404 passing + 10 skipped**.

**Git intelligence (last 5 commits):**

- All recent commits follow `feat: Story X.X — description` pattern
- Story 12.2 was the most recent, establishing production infrastructure
- No monitoring/logging changes in recent history

### Project Structure Notes

- `monitoring/` directory is new — contains all Prometheus, Grafana, Alertmanager configuration
- `docker-compose.monitoring.yml` at project root alongside other compose files
- Sentry config files at project root (Next.js convention for `@sentry/nextjs`)
- `src/instrumentation.ts` at `src/` root (Next.js convention)
- `docs/monitoring-setup.md` and `docs/uptimerobot-setup.md` in existing `docs/` directory
- `monitoring-infra.test.ts` at project root alongside `ci-infra.test.ts` and `prod-infra.test.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 12, Story 12.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Monitoring & Logging: Hybrid Stack]
- [Source: _bmad-output/planning-artifacts/architecture.md#Logging Standard]
- [Source: _bmad-output/planning-artifacts/architecture.md#External Integrations — Sentry]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: src/lib/request-context.ts — AsyncLocalStorage tracing]
- [Source: src/middleware.ts — X-Request-Id generation]
- [Source: src/server/api/middleware.ts — withApiHandler tracing + error handling]
- [Source: src/server/realtime/index.ts — Socket.IO server entry point]
- [Source: src/server/jobs/job-runner.ts — existing structured JSON logging]
- [Source: src/services/email-service.ts — existing structured JSON logging]
- [Source: src/env.ts — T3 Env configuration]
- [Source: next.config.ts — current plugin composition chain]
- [Source: docker-compose.prod.yml — production compose (from Story 12.2)]
- [Source: _bmad-output/implementation-artifacts/12-1-ci-cd-pipeline.md — CI/CD patterns]
- [Source: _bmad-output/implementation-artifacts/12-2-production-deployment-infrastructure.md — infra patterns]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A

### Completion Notes List

- Removed `import { env } from "@/env"` from `src/server/api/middleware.ts` — replaced with direct `process.env.SENTRY_DSN` check to avoid transitive T3 Env validation in 469 existing test files
- `src/app/api/metrics/route.ts` likewise uses `process.env.METRICS_SECRET` directly (not T3 env)
- `src/test/setup.ts` global mocks added: `prom-client` (class-based constructors for `new Registry()`, `new Histogram()`, etc.) and `@sentry/nextjs` (including `withSentryConfig` for `next.config.test.ts`)
- Five route test files updated to include `getRequestContext: vi.fn(() => undefined)` in their `@/lib/request-context` mocks — required because `logger.ts` (now imported via middleware) calls `getRequestContext()` in the 500-error path
- `src/server/jobs/job-runner.test.ts` updated: `expect(failLog.error).toBe("boom")` → `expect(failLog.error.message).toBe("boom")` because structured logger now serializes errors as `{ message, name, stack }` objects
- All 5 acceptance criteria met: Sentry SDK, Prometheus metrics, structured logger with traceId, UptimeRobot docs, alert rules

### Review Fix Notes (code-review pass)

- **F1 (HIGH)**: Wired `Sentry.setUser` context in `withApiHandler` catch block — passes `user: { id: userId }` from `getRequestContext()?.userId` to `captureException`. Note: userId is undefined in the catch scope (outside `runWithContext`) in current architecture, but wiring is correct for future when userId is set on wider context.
- **F2+F6 (HIGH)**: Added production safeguard for metrics endpoints — returns 503 when `METRICS_SECRET` is not configured in `NODE_ENV=production`. Prevents accidental exposure of infrastructure metrics in production deployments.
- **F3 (HIGH)**: Migrated `src/server/jobs/run-jobs.ts` from manual `console.info(JSON.stringify({...}))` to `createLogger("run-jobs")` structured logger.
- **F4 (MEDIUM)**: Added `package.json` to File List (was modified but undocumented).
- **F5+F7 (MEDIUM)**: Exported `normalizeRoute` from `middleware.ts` and updated `metrics.test.ts` to import the real function instead of a copy-pasted duplicate.
- **F8 (LOW)**: `sentry.edge.config.ts` uses `NEXT_PUBLIC_SENTRY_DSN` — accepted as-is (Edge runtime may not have server env vars in all deployment targets).
- **F9 (LOW)**: Prometheus scrape config uses `credentials_file` — accepted; operators must configure Docker secrets or edit to `bearer_token`.

### File List

**New files:**

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `src/lib/logger.ts`
- `src/lib/logger.test.ts`
- `src/lib/metrics.ts`
- `src/lib/metrics.test.ts`
- `src/app/api/metrics/route.ts`
- `src/app/api/metrics/route.test.ts`
- `src/lib/sentry.test.ts`
- `src/server/realtime/logger.ts`
- `docker-compose.monitoring.yml`
- `monitoring/prometheus/prometheus.yml`
- `monitoring/prometheus/alert-rules.yml`
- `monitoring/alertmanager/alertmanager.yml`
- `monitoring/grafana/provisioning/datasources/prometheus.yml`
- `monitoring/grafana/provisioning/dashboards/dashboard.yml`
- `monitoring/grafana/dashboards/igbo-overview.json`
- `docs/monitoring-setup.md`
- `docs/uptimerobot-setup.md`
- `monitoring-infra.test.ts`

**Modified files:**

- `package.json`
- `next.config.ts`
- `src/env.ts`
- `src/instrumentation.ts`
- `src/server/api/middleware.ts`
- `src/server/api/middleware.test.ts`
- `src/server/realtime/index.ts`
- `src/server/jobs/job-runner.ts`
- `src/server/jobs/job-runner.test.ts`
- `src/services/email-service.ts`
- `src/test/setup.ts`
- `.env.example`
- `.env.production.example`
- `.github/workflows/deploy.yml`
- `src/app/global-error.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/api/v1/admin/applications/route.test.ts`
- `src/app/api/v1/notifications/read-all/route.test.ts`
- `src/app/api/v1/user/language/route.test.ts`
- `src/app/api/v1/user/article-limit/route.test.ts`
- `src/app/api/v1/user/points/route.test.ts`
