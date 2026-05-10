# PREP-M2b: Operational Observability Contract

**Date:** 2026-05-10
**Author:** Dana (QA Lead) + Charlie (Senior Dev) + Dev (Project Lead)
**Status:** Canonical operational reference for Epic 7 implementation
**Dependencies:** PREP-M1 (Scoring Engine Design), PREP-M1b (Score Versioning Policy), PREP-M2 (Batch Testing Spike)

---

## 1. Overview

This document defines the observability contract for Epic 7's scoring engine. It covers three concerns: what to measure (metric catalog), how to log (structured log events), and when to alert (thresholds and escalation). The contract spans all three execution modes from PREP-M1 section 1: batch recompute, event-driven staleness, and real-time scoring.

**Monitoring approach:** The project has an existing Prometheus/Grafana/Alertmanager stack (`monitoring/`) with scrape targets configured but no application-level metrics endpoint implemented yet. This contract defines metrics in two tiers:

- **Tier A (Log-derived):** Structured JSON log events that work immediately with Docker log queries. No new dependencies. Available from Story 7.1.
- **Tier B (Prometheus-native):** Counter/histogram/gauge metrics requiring a `/api/metrics` endpoint with `prom-client`. Deferred to a dedicated instrumentation story (Epic 7 or Epic 12 -- Ask First item). Tier A log events can be promoted to Tier B counters when the endpoint exists.

**Naming convention:** Metric catalog uses dot-notation (`scoring.batch.duration_ms`). Prometheus metric names use underscore-notation per Prometheus convention (`scoring_batch_duration_ms`). The mapping is mechanical: replace dots with underscores. Counters append `_total` suffix per Prometheus naming best practices.

---

## 2. Metric Catalog

### 2.1 Batch Recompute Metrics

| Metric Name | Type | Tier | Source | Update Frequency | Story |
|-------------|------|------|--------|-----------------|-------|
| `scoring.batch.duration_ms` | histogram | B (log-derived until then) | `portal.scoring.batch_completed` log event | Per batch cycle (every 5 min) | 7.7 |
| `scoring.batch.pairs_processed` | counter | B (log-derived until then) | `portal.scoring.batch_completed` log event | Per batch cycle | 7.7 |
| `scoring.batch.pairs_failed` | counter | B (log-derived until then) | `portal.scoring.batch_completed` log event | Per batch cycle | 7.7 |
| `scoring.batch.pairs_skipped` | counter | B (log-derived until then) | `portal.scoring.batch_completed` log event | Per batch cycle | 7.7 |
| `scoring.batch.chunk_size` | gauge | A (log-derived) | `portal.scoring.batch_started` log event | Per batch cycle | 7.7 |
| `scoring.batch.last_cycle_timestamp` | gauge | B | Set to `Date.now()` on every cycle completion (including noop) | Per batch cycle | 7.7 |

### 2.2 Staleness Metrics

| Metric Name | Type | Tier | Source | Update Frequency | Story |
|-------------|------|------|--------|-----------------|-------|
| `scoring.stale.event_driven_count` | gauge | A (query-derived) | SQL: `SELECT COUNT(*) FROM portal_job_match_scores WHERE stale = true` | On-demand (operational query) | 7.7 |
| `scoring.stale.version_driven_count` | gauge | A (query-derived) | SQL: `SELECT COUNT(*) FROM portal_job_match_scores WHERE scoring_version < $1 AND stale = false` | On-demand (operational query) | 7.7 |
| `scoring.stale.both_axes_count` | gauge | A (query-derived) | SQL: `SELECT COUNT(*) FROM portal_job_match_scores WHERE stale = true AND scoring_version < $1` | On-demand (operational query) | 7.7 |
| `scoring.stale.total_pending` | gauge | A (query-derived) | SQL: `SELECT COUNT(*) FROM portal_job_match_scores WHERE stale = true OR scoring_version < $1` | On-demand (operational query) | 7.7 |

**Set relationships:** `event_driven_count` includes rows that are also version-outdated (the `both_axes` overlap). `version_driven_count` excludes the overlap (version-outdated only, not also stale). `total_pending` = `event_driven_count` + `version_driven_count` (no double-counting). Use `total_pending` for alerting; use the axis-specific counts for diagnosis.

**Prometheus exposure:** These query-derived gauges are Tier A (on-demand SQL). To power Prometheus alerts (e.g., `ScoringStaleQueueBacklog`), the Tier B instrumentation story must either: (a) add a Prometheus recording rule that executes the SQL via an exporter, or (b) have the batch worker emit these counts as gauge values on each cycle. Option (b) is simpler -- the batch worker already queries staleness for its detection query (PREP-M1b §5.1) and can emit the counts as part of `batch_started`.

### 2.3 Version Migration Metrics

| Metric Name | Type | Tier | Source | Update Frequency | Story |
|-------------|------|------|--------|-----------------|-------|
| `scoring.version.migration_progress` | gauge | A (query-derived) | SQL from PREP-M1b section 7.3 | On-demand (after version bump) | 7.7 |
| `scoring.version.current` | config reference (not a Prometheus metric) | A | `CURRENT_SCORING_VERSION` from `@igbo/config/match` | Deploy-time | 7.1 |

### 2.4 Real-Time Scoring Metrics

| Metric Name | Type | Tier | Source | Update Frequency | Story |
|-------------|------|------|--------|-----------------|-------|
| `scoring.realtime.duration_ms` | histogram | B (log-derived until then) | `portal.scoring.realtime_computed` log event | Per request | 7.3 |
| `scoring.realtime.errors` | counter | B (log-derived until then) | `portal.scoring.realtime_error` log event | Per error | 7.3 |

---

## 3. Structured Log Event Contracts

All events follow the established convention: `console.{level}(JSON.stringify({ level, message, ...context }))`. Namespace: `portal.scoring.*`.

### 3.1 Batch Events

**`portal.scoring.batch_started`** -- Level: `info`

```json
{
  "level": "info",
  "message": "portal.scoring.batch_started",
  "batchId": "uuid",
  "chunkSize": 100,
  "staleCount": 47,
  "versionOutdatedCount": 0
}
```

Emitted at the start of each batch cycle. `batchId` is a `randomUUID()` generated at cycle start, shared with the corresponding `batch_completed` event for log correlation. `staleCount` and `versionOutdatedCount` are the row counts claimed for this cycle (not total pending).

**`portal.scoring.batch_completed`** -- Level: `info`

```json
{
  "level": "info",
  "message": "portal.scoring.batch_completed",
  "batchId": "uuid",
  "processed": 95,
  "failed": 3,
  "skipped": 2,
  "durationMs": 1847
}
```

Emitted at the end of each batch cycle. `skipped` counts pairs where `assembleMatchInputs` returned null (consent revoked, job inactive, etc.). `failed` counts pairs where scoring or DB write threw an error.

**`portal.scoring.batch_noop`** -- Level: `info`

```json
{
  "level": "info",
  "message": "portal.scoring.batch_noop"
}
```

Emitted when a batch cycle finds zero stale/outdated rows. Confirms the poller is running. Do NOT emit `batch_started` + `batch_completed` with zero counts -- use this dedicated event to distinguish "nothing to do" from "processed zero successfully."

### 3.2 Per-Pair Error Events

**`portal.scoring.pair_failed`** -- Level: `error`

```json
{
  "level": "error",
  "message": "portal.scoring.pair_failed",
  "seekerUserId": "uuid",
  "jobId": "uuid",
  "retryCount": 1,
  "error": "Error message string"
}
```

Emitted per failed pair. Follows the `outbox-poller.ts` error pattern. `retryCount` is the current retry attempt.

**`portal.scoring.pair_skipped`** -- Level: `warn`

```json
{
  "level": "warn",
  "message": "portal.scoring.pair_skipped",
  "seekerUserId": "uuid",
  "jobId": "uuid",
  "reason": "consent_revoked"
}
```

Emitted when `assembleMatchInputs` returns null for a pair that was marked stale. `reason` values: `consent_revoked`, `job_inactive`, `job_deadline_passed`, `seeker_not_found`, `job_not_found`.

### 3.3 Event-Driven Stale Trigger Events

**`portal.scoring.stale_trigger_emitted`** -- Level: `info`

```json
{
  "level": "info",
  "message": "portal.scoring.stale_trigger_emitted",
  "trigger": "seeker_profile_update",
  "userId": "uuid",
  "rowsMarkedStale": 12
}
```

Emitted when an event handler marks score rows as stale. `trigger` values: `seeker_profile_update`, `job_posting_update`, `endorsement_change`. `userId` is the actor whose change triggered staleness -- the seeker for profile/endorsement triggers, the employer for job posting triggers (intentionally not `seekerUserId` since the trigger actor varies by event type). `rowsMarkedStale` is the count of rows affected by the UPDATE.

### 3.4 Version Mismatch Detection

**`portal.scoring.version_mismatch_detected`** -- Level: `info`

```json
{
  "level": "info",
  "message": "portal.scoring.version_mismatch_detected",
  "currentVersion": 2,
  "outdatedRowCount": 4823
}
```

Emitted once per batch cycle when the worker detects rows with `scoring_version < CURRENT_SCORING_VERSION`. Not per-row -- aggregated count. Helps track version migration progress in logs.

### 3.5 Real-Time Scoring Events

**`portal.scoring.realtime_computed`** -- Level: `info`

```json
{
  "level": "info",
  "message": "portal.scoring.realtime_computed",
  "seekerUserId": "uuid",
  "jobId": "uuid",
  "score": 72,
  "tier": "good",
  "durationMs": 8
}
```

Emitted on successful real-time score computation (job detail page). Do NOT emit for every pair in search results -- only for on-demand fresh computation in the real-time path.

**`portal.scoring.realtime_error`** -- Level: `error`

```json
{
  "level": "error",
  "message": "portal.scoring.realtime_error",
  "seekerUserId": "uuid",
  "jobId": "uuid",
  "durationMs": 28003,
  "error": "Error message string"
}
```

Includes `durationMs` to distinguish timeout failures (high duration) from immediate failures (low duration).

---

## 4. Alerting Thresholds

### 4.1 Proposed Prometheus Alert Rules

These rules assume Tier B metrics are available. Until `/api/metrics` is implemented, use log-based monitoring (section 4.2).

```yaml
groups:
  - name: igbo-scoring-alerts
    rules:
      - alert: ScoringBatchHighFailureRate
        expr: |
          rate(scoring_batch_pairs_failed_total[5m]) /
          (rate(scoring_batch_pairs_processed_total[5m]) + rate(scoring_batch_pairs_failed_total[5m]) + 0.001)
          > 0.10
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Scoring batch failure rate above 10%"
          description: "More than 10% of batch scoring pairs are failing over 3+ batch cycles."

      - alert: ScoringBatchHighFailureRateCritical
        expr: |
          rate(scoring_batch_pairs_failed_total[5m]) /
          (rate(scoring_batch_pairs_processed_total[5m]) + rate(scoring_batch_pairs_failed_total[5m]) + 0.001)
          > 0.25
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "Scoring batch failure rate above 25%"
          description: "More than 25% of batch scoring pairs are failing over 6+ batch cycles. Batch scoring may be broken."

      - alert: ScoringBatchWorkerDead
        expr: |
          time() - scoring_batch_last_cycle_timestamp > 900
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Scoring batch worker not running"
          description: "No batch cycle has completed in over 15 minutes (3 expected cycles). The batch worker may have crashed or the cron route is not being called."

      - alert: ScoringStaleQueueBacklog
        expr: |
          scoring_stale_total_pending > 500
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Stale score queue backlog growing"
          description: "More than 500 scores pending recompute for over 30 minutes. Batch worker may be falling behind."

      - alert: ScoringBatchDurationHigh
        expr: |
          histogram_quantile(0.95, rate(scoring_batch_duration_ms_bucket[30m])) > 30000
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Scoring batch p95 duration above 30 seconds"
          description: "Batch chunks are taking over 30 seconds at p95. Investigate DB load or chunk size."

      - alert: ScoringVersionMigrationStalled
        expr: |
          scoring_stale_version_driven_count > 100
          and delta(scoring_stale_version_driven_count[1h]) >= 0
        for: 4h
        labels:
          severity: warning
        annotations:
          summary: "Version migration not progressing"
          description: "More than 100 outdated-version scores have not decreased in 4 hours. Batch worker may not be processing version-driven recompute. Note: slow progress is expected immediately after a version bump (see PREP-M1b §5.3)."
```

**Notes on alert design:**
- `ScoringBatchHighFailureRate` uses a 5-minute rate window with a 15-minute `for:` duration. The short window detects degradation within one batch cycle; the `for:` duration confirms persistence across 3 cycles before firing.
- `ScoringBatchWorkerDead` is a liveness alert that catches complete worker death — a failure mode invisible to rate-based alerts (which return NaN when no data flows). Requires the batch worker to emit a `scoring_batch_last_cycle_timestamp` gauge on every cycle (including `batch_noop`).
- `ScoringVersionMigrationStalled` uses a minimum threshold of 100 rows and a 4-hour `for:` duration to avoid false positives on normal slow backfill after a version bump (PREP-M1b §5.3 estimates 42 hours for full backfill at default chunk size).

### 4.2 Log-Based Monitoring (Tier A -- Available Immediately)

Until Prometheus counters exist, ops can monitor using Docker log queries:

```bash
# Batch health: recent failures
docker logs web --since 15m 2>&1 | grep portal.scoring.pair_failed | wc -l

# Batch health: recent completions
docker logs web --since 15m 2>&1 | grep portal.scoring.batch_completed

# Batch liveness: confirm poller is running
docker logs web --since 10m 2>&1 | grep -E "portal.scoring.batch_(completed|noop)"

# Stale queue depth (run against DB)
psql -c "SELECT
  CASE
    WHEN stale = true AND scoring_version < $CURRENT THEN 'stale+outdated'
    WHEN stale = true THEN 'stale'
    WHEN scoring_version < $CURRENT THEN 'outdated'
    ELSE 'fresh'
  END AS status,
  COUNT(*)
FROM portal_job_match_scores
GROUP BY 1;"
```

### 4.3 Escalation Rules

| Alert | Initial Action | Escalation (if persists 1h+) |
|-------|---------------|------------------------------|
| ScoringBatchHighFailureRate (warning) | Check `portal.scoring.pair_failed` logs for common error pattern | Investigate DB connectivity / schema issues |
| ScoringBatchHighFailureRateCritical | Page on-call. Check DB health. Review recent deploys. | Pause batch worker if scoring data integrity at risk |
| ScoringBatchWorkerDead | Page on-call. Check if cron route is reachable. Check Docker container health. | Restart batch worker. If cron scheduler is down, investigate scheduler infrastructure. |
| ScoringStaleQueueBacklog | Check batch worker liveness via `batch_noop`/`batch_completed` logs | Increase chunk size temporarily or run manual recompute script |
| ScoringBatchDurationHigh | Check DB slow query log. Review EXPLAIN on staleness detection query | Add/tune indexes per PREP-M1b section 5.1 |
| ScoringVersionMigrationStalled | Verify batch worker is running. Check if event-driven stale rows are preempting version backfill | Run one-time migration script with larger chunk size (per PREP-M1b section 5.3) |

---

## 5. Batch Cron Route Response Contract

Following the established pattern from `POST /api/v1/internal/digest/send`, the scoring batch route should return:

```typescript
// POST /api/v1/internal/scoring/recompute
return successResponse({
  processed: number,   // pairs scored successfully
  failed: number,      // pairs that threw errors
  skipped: number,     // pairs where assembleMatchInputs returned null
  durationMs: number,  // wall-clock time for the batch cycle
});
```

The external scheduler uses HTTP 200 as the liveness signal. The response body provides operational counts for logging by the scheduler.

---

## 6. Operational Queries

### 6.1 Staleness Overview (extends PREP-M1b section 7.4)

```sql
SELECT
  CASE
    WHEN stale = true AND scoring_version < $1 THEN 'stale+outdated'
    WHEN stale = true THEN 'stale'
    WHEN scoring_version < $1 THEN 'outdated'
    ELSE 'fresh'
  END AS status,
  COUNT(*),
  MIN(computed_at) AS oldest,
  MAX(computed_at) AS newest
FROM portal_job_match_scores
GROUP BY 1
ORDER BY 1;
```

### 6.2 Batch Health (last N cycles from logs)

```bash
# Parse last 10 batch_completed events
docker logs web --since 1h 2>&1 \
  | grep portal.scoring.batch_completed \
  | tail -10 \
  | jq -r '[.processed, .failed, .skipped, .durationMs] | @tsv'
```

### 6.3 Score Distribution by Version

```sql
SELECT scoring_version, tier, COUNT(*), ROUND(AVG(score), 1) AS avg_score
FROM portal_job_match_scores
GROUP BY scoring_version, tier
ORDER BY scoring_version, tier;
```

### 6.4 Failure Investigation (per-pair errors)

```bash
# Find all failed pairs in the last hour with error messages
docker logs web --since 1h 2>&1 \
  | grep portal.scoring.pair_failed \
  | jq '{seekerUserId, jobId, error, retryCount}'
```

### 6.5 Score Drift Audit (manual, not active monitoring)

To verify the Matching Consistency Rule (PREP-M1 section 8), compare a stored batch score against a fresh real-time computation for the same pair:

```sql
-- Find a recently-computed batch score
SELECT seeker_user_id, job_id, score, tier, scoring_version, computed_at
FROM portal_job_match_scores
WHERE stale = false AND scoring_version = $CURRENT
ORDER BY computed_at DESC
LIMIT 5;

-- Then call the real-time scoring API for the same pair and compare
-- GET /api/v1/jobs/{jobId}/match-score (as the seeker)
```

This is a manual audit procedure, not an automated check. Score drift from DB state changes between batch and real-time is expected and acceptable per PREP-M1 section 8.2.

---

## 7. Grafana Dashboard Panels

Extend `monitoring/grafana/dashboards/igbo-overview.json` with a "Scoring Engine" row containing these panels (Tier B -- requires `/api/metrics`):

| Panel | Type | Query | Purpose |
|-------|------|-------|---------|
| Batch Throughput | Time series | `rate(scoring_batch_pairs_processed_total[5m])` | Pairs scored per second |
| Batch Failure Rate | Time series | `rate(scoring_batch_pairs_failed_total[5m]) / (rate(scoring_batch_pairs_processed_total[5m]) + rate(scoring_batch_pairs_failed_total[5m]) + 0.001)` | Failure percentage |
| Stale Score Queue | Gauge | `scoring_stale_total_pending` | Current backlog depth |
| Batch Duration p95 | Time series | `histogram_quantile(0.95, rate(scoring_batch_duration_ms_bucket[5m]))` | Batch cycle latency |
| Version Migration | Bar gauge | `scoring_version_migration_progress` | Rows per version |
| Real-Time Scoring p95 | Time series | `histogram_quantile(0.95, rate(scoring_realtime_duration_ms_bucket[5m]))` | On-demand scoring latency |

---

## 8. Story Implementation Mapping

| Story | Observability Deliverables |
|-------|---------------------------|
| 7.1 | `CURRENT_SCORING_VERSION` constant in `@igbo/config/match` |
| 7.3 | `realtime_computed` and `realtime_error` log events in the real-time scoring path |
| 7.7 | All batch log events (`batch_started`, `batch_completed`, `batch_noop`, `pair_failed`, `pair_skipped`), stale trigger events (`stale_trigger_emitted`), version mismatch detection (`version_mismatch_detected`), batch cron route response contract |
| Future | `/api/metrics` endpoint, Prometheus alert rules, Grafana dashboard panels |

---

## 9. Cross-Reference

| Source Document | Section | What This Contract Covers |
|----------------|---------|--------------------------|
| PREP-M1 §1 | Three execution modes | Metrics and log events for all three modes (§2, §3) |
| PREP-M1 §7 | `portal_job_match_scores` schema | All query-derived metrics use this schema (§2.2, §6) |
| PREP-M1 §8 | Consistency invariant | Score drift audit procedure (§6.5) |
| PREP-M1b §4 | Two-axis staleness model | Staleness metrics split by axis (§2.2), log events per axis (§3.3, §3.4) |
| PREP-M1b §5 | Detection query, priority ordering | Alerting thresholds for queue backlog and migration stalls (§4.1) |
| PREP-M1b §7.3-7.4 | Analytics queries | Operational queries extend these (§6.1, §6.3) |
| PREP-M2 §4 | Batch integration tests | Log events defined here become assertions in PREP-M2 Layer 2 tests |
| Existing alerts | `monitoring/prometheus/alert-rules.yml` | Scoring alerts follow same YAML format (§4.1) |
| Outbox poller | `apps/portal/src/services/outbox-poller.ts` | Log event schema follows `portal.outbox.*` convention (§3) |
