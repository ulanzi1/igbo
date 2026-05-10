---
title: 'PREP-M2b: Operational Observability Contract'
type: 'chore'
created: '2026-05-09'
status: 'done'
baseline_commit: '2dddb9e1'
context:
  - '_bmad-output/implementation-artifacts/prep-m1-scoring-engine-design.md'
  - '_bmad-output/implementation-artifacts/prep-m1b-score-versioning-policy.md'
  - '_bmad-output/implementation-artifacts/prep-m2-batch-testing-spike.md'
---

<frozen-after-approval reason="human-owned intent -- do not modify unless human renegotiates">

## Intent

**Problem:** Epic 7 introduces a batch recompute worker, event-driven staleness triggers, and version-driven recompute -- continuous computation with failure modes that don't exist in the reactive system. Without a pre-defined observability contract, the team will discover monitoring gaps in production. The Epic 6 retro explicitly requires: "Continuous systems require failure governance" and PREP-M2b was gated as Tier 1 before batch implementation.

**Approach:** Produce an observability contract document (`_bmad-output/implementation-artifacts/prep-m2b-operational-observability-contract.md`) defining: (1) the metric catalog -- recompute queue depth, stale score count by axis, batch duration, failure rate, score drift incidents, version migration progress, (2) structured log event contracts for the batch scoring pipeline, (3) alerting thresholds and escalation rules, (4) the monitoring approach using existing infrastructure (Prometheus/Grafana stack + structured JSON logging). No code or metric instrumentation is produced -- this is the canonical operational reference for Epic 7 stories.

## Boundaries & Constraints

**Always:**
- Metric definitions must align with the two-axis staleness model from PREP-M1b section 4 (event-driven `stale` + version-driven `scoring_version < CURRENT`)
- Log event contracts must follow established `portal.<service>.<event>` namespace convention with JSON schema (`{ level, message, ...context }`)
- Alerting thresholds must be expressible using existing Prometheus alert rule format (`monitoring/prometheus/alert-rules.yml`)
- The contract must cover all three execution modes (batch, event-driven, real-time) from PREP-M1 section 1
- Batch metrics must be derivable from the `portal_job_match_scores` schema in PREP-M1 section 7 (no schema changes)
- The document must identify which metrics require a `/api/metrics` endpoint (Prometheus counters) vs which are log-derived vs which are query-derived

**Ask First:**
- Whether to implement the `/api/metrics` Prometheus endpoint as part of Epic 7 or defer to Epic 12 (monitoring story)
- Whether score drift detection (same inputs producing different scores across modes) should be active monitoring or a manual audit query

**Never:**
- Do not implement any code -- this is a contract document only
- Do not add new dependencies (prom-client, OpenTelemetry, etc.) -- document the contract; implementation is a separate story
- Do not define SLAs -- define thresholds and alerts; SLA commitments are a product decision
- Do not duplicate the failure mode analysis from PREP-M9 (if/when it exists) -- reference it

</frozen-after-approval>

## Code Map

- `monitoring/prometheus/alert-rules.yml` -- Existing alert rules (5 alerts); scoring alerts will be added here
- `monitoring/prometheus/prometheus.yml` -- Scrape config; already targets `web:3000/api/metrics`
- `monitoring/grafana/dashboards/igbo-overview.json` -- Existing Grafana dashboard; scoring panels will extend it
- `apps/portal/src/services/outbox-poller.ts` -- Canonical batch logging pattern (portal.outbox.* namespace)
- `apps/portal/src/services/match-scoring-service.ts` -- Current scoring service; Epic 7 replaces internals
- `packages/config/src/match.ts` -- `CURRENT_SCORING_VERSION`, `MATCH_TIERS`, `getMatchTier`
- `apps/portal/src/app/api/v1/internal/` -- Internal cron route pattern (auth, response shape)
- `apps/portal/src/app/api/v1/internal/digest/send/route.ts` -- Best response shape example: `{ processed, emailsSent, skipped, errors }`

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/implementation-artifacts/prep-m2b-operational-observability-contract.md` -- Create observability contract document covering: (1) Metric catalog -- define each metric with name, type (counter/gauge/histogram), source (Prometheus counter, log-derived, SQL query), update frequency, and which story implements it. Required metrics: `scoring.batch.duration_ms` (histogram), `scoring.batch.pairs_processed` (counter), `scoring.batch.pairs_failed` (counter), `scoring.batch.pairs_skipped` (counter), `scoring.stale.count` by axis (gauge, query-derived), `scoring.version.migration_progress` (gauge, query-derived), `scoring.realtime.duration_ms` (histogram), `scoring.realtime.errors` (counter). (2) Log event contracts -- define `portal.scoring.*` namespace events: `batch_started`, `batch_completed`, `pair_failed`, `pair_skipped`, `realtime_computed`, `stale_trigger_emitted`, `version_mismatch_detected`. Each event with required fields, log level, and example JSON. (3) Alerting thresholds -- define Prometheus alert rules: batch failure rate > 10% for 3 cycles, stale score count exceeds threshold, batch duration exceeds ceiling, version migration stalled. (4) Grafana dashboard panel definitions -- scoring batch throughput, stale score queue depth, failure rate, version migration progress. (5) Operational queries -- SQL queries for manual investigation: staleness overview (from PREP-M1b section 7.4), batch health, score distribution by version

**Acceptance Criteria:**
- Given the metric catalog, when a developer implements Story 7.1 or 7.7, then every log line and counter has a pre-defined name, schema, and level -- no ad-hoc invention
- Given the alerting thresholds, when the batch system degrades, then the alert rule fires before users notice stale scores
- Given the document references PREP-M1 and PREP-M1b, when cross-referenced, then every staleness axis and execution mode has at least one metric covering it

## Verification

**Manual checks:**
- Document covers all 3 execution modes from PREP-M1 section 1 (batch, event-driven, real-time)
- Document covers both staleness axes from PREP-M1b section 4 (event-driven, version-driven)
- Log event namespace follows established `portal.<service>.<event>` convention (cross-check with outbox-poller.ts)
- Alert rules follow existing Prometheus YAML format (cross-check with alert-rules.yml)
- No code, no schema changes, no new dependencies

## Suggested Review Order

- Tier A/B monitoring approach and naming convention (sets mental model for entire doc)
  [`prep-m2b-operational-observability-contract.md:1`](prep-m2b-operational-observability-contract.md#L1)

- Metric catalog: batch, staleness, version, real-time — all metrics with types and sources
  [`prep-m2b-operational-observability-contract.md:24`](prep-m2b-operational-observability-contract.md#L24)

- Log event contracts: 9 `portal.scoring.*` events with JSON schemas and field semantics
  [`prep-m2b-operational-observability-contract.md:62`](prep-m2b-operational-observability-contract.md#L62)

- Alert rules: 6 Prometheus alerts including liveness check, in `groups:` wrapper format
  [`prep-m2b-operational-observability-contract.md:206`](prep-m2b-operational-observability-contract.md#L206)

- Escalation table and log-based monitoring fallbacks (Tier A)
  [`prep-m2b-operational-observability-contract.md:301`](prep-m2b-operational-observability-contract.md#L301)

- Operational queries: staleness overview, batch health, failure investigation, drift audit
  [`prep-m2b-operational-observability-contract.md:331`](prep-m2b-operational-observability-contract.md#L331)

- Story implementation mapping: which story delivers which observability artifacts
  [`prep-m2b-operational-observability-contract.md:415`](prep-m2b-operational-observability-contract.md#L415)

- Cross-reference table: traceability back to PREP-M1, M1b, M2, and existing infra
  [`prep-m2b-operational-observability-contract.md:426`](prep-m2b-operational-observability-contract.md#L426)
