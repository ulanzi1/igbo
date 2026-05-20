# PREP-M9: Failure Mode & Recovery Contract

**Version:** 1.0
**Date:** 2026-05-17
**Status:** Approved
**Supersedes:** Nothing (new contract)
**Applies to:** Epic 7 Stories 7.1, 7.3, 7.4, 7.5, 7.7 (scoring engine, ranking surfaces, batch worker)
**Owners:** Charlie (Senior Dev) + Dana (QA Lead)

---

## 1. Overview

This document defines the failure governance contract for Epic 7's scoring engine. It covers three concerns: how the system fails (failure taxonomy), how it recovers (retry, circuit breaker, fallback), and how operators diagnose and resolve failures (alert mapping, recovery runbook).

The scoring engine has three execution modes (PREP-M1 §1): batch recompute (every 5 min), event-driven staleness triggers, and real-time on-demand scoring. Unlike reactive systems where failure affects a single user action, scoring failures silently degrade platform trust -- stale scores surface wrong recommendations, failed batches create growing backlogs, and incomplete inputs produce misleading tier assignments.

**Key constraint:** `computeMatchScore` is a pure, synchronous function with zero side effects (PREP-M1 §4). It cannot fail. All failure governance applies to `assembleMatchInputs` (DB reads), batch orchestration (SKIP LOCKED claims, chunk processing), and score persistence (DB writes).

**Relationship to other contracts:**

| Contract | Relationship |
|----------|-------------|
| PREP-M1 (Scoring Engine Design) | Defines the architecture this contract protects. §3 (`assembleMatchInputs` gates), §6 (degradation matrix), §8 (consistency invariant) |
| PREP-M1b (Score Versioning Policy) | Defines the staleness model (§4 two-axis staleness) this contract's batch retry and race resolution extend |
| PREP-M2 (Batch Testing Spike) | Defines the test strategy (§4.3 retry tests, §4.4 idempotency, §4.5 SKIP LOCKED) that validates this contract's specifications |
| PREP-M2b (Operational Observability) | Defines the metrics and alerts this contract maps to recovery procedures |

---

## 2. Failure Taxonomy

### 2.1 Failure Mode x Execution Mode Matrix

Each cell specifies the documented behavior. Every cell must have a corresponding implementation path verified during PR review.

| Failure Mode | Batch (SKIP LOCKED) | Event-Driven (withHandlerGuard) | Real-Time (On-Demand API) | Section |
|---|---|---|---|---|
| `assembleMatchInputs` → null | Skip pair, increment retry_count, log `pair_skipped` | Handler swallows error, stale flag persists for next batch | Return last-persisted score or null/"pending" | §9.1, §6.2.6 |
| DB read/write timeout | Retry next cycle (pair stays claimed until `BATCH_CLAIM_TIMEOUT_MS`) | N/A (no writes in event handler) | N/A (real-time reads only; DB read timeout returns null/"pending") | §5.2.4, §6.2.6 |
| DB write constraint violation | Upsert no-op (idempotent, `computed_at <` guard) | N/A | N/A | §5.2.1 |
| SKIP LOCKED claim failure | No rows claimed; cycle is no-op; counts toward circuit breaker | N/A | N/A | §3.1 |
| Redis unavailable | N/A (batch doesn't use Redis) | N/A | Fail-open to DB read | §6.2.1 |
| 100% null skip rate (cascade) | Counts as batch failure for circuit breaker | N/A | N/A | §7.2.3 |
| Staleness trigger during batch compute | Score written; `stale` may be re-set true; pair re-enters next cycle | Sets `stale = true` (normal operation) | N/A | §8.2.4 |
| Consent revoked during batch compute | Write-time guard rejects; no-op | Sets status='revoked', deletes score | Return null/"pending" (pair excluded) | §10.2.1, §10.2.3 |
| Worker crash mid-batch | Unclaimed rows released after timeout; scored rows idempotent on replay | N/A | N/A | §5.2.4 |
| Retry exhaustion (retry_count >= 10) | Mark pair `failed`, exclude from selection | N/A | Return null/"pending" (no score exists) | §9.2 |

### 2.2 Failure Classification

| Class | Examples | Retry? | Resolution |
|-------|----------|--------|------------|
| **Data-dependent (permanent)** | Missing profile, revoked consent, inactive job, deadline passed | No (skip) | Pair becomes ineligible; `assembleMatchInputs` returns null per PREP-M1 §3.2 |
| **Data-dependent (transient)** | Profile not yet synced, stale cache | Yes (next cycle) | Pair retries on next batch cycle; retry_count tracks attempts |
| **Infrastructure (transient)** | DB timeout, Redis unavailable, network partition | Yes (next cycle or fail-open) | Batch retries next cycle; real-time falls back to DB; event handlers fail-open |
| **Infrastructure (persistent)** | DB down, schema corruption | Circuit breaker | Batch pauses after 5 consecutive failures; auto-reset probe after cooldown |

---

## 3. Circuit Breaker -- Batch Scoring Pause

### 3.1 Trigger Condition

The batch scorer MUST track consecutive batch-level failures using an **in-memory** counter (`consecutive_failure_count`). A "batch failure" is defined as any batch invocation that terminates without successfully writing at least one scored result.

**Counter reset rule:** Any batch cycle that successfully writes at least one score resets `consecutive_failure_count` to `0`. The counter only increments on consecutive failures -- a single success breaks the streak.

**Scope:** Global -- one circuit for the entire batch scorer process. The batch scorer is a single poller; if infrastructure is degraded, all pairs are affected equally. There is no per-surface circuit.

**State storage:** In-memory only. Worker restart clears the circuit (resets to `CLOSED`, counter to `0`). This is intentional -- if the worker restarted, the infrastructure issue may have resolved.

| Constant | Value | Overridable |
|----------|-------|-------------|
| `CB_FAILURE_THRESHOLD` | `5` | env `BATCH_SCORER_CB_THRESHOLD` |
| `CB_COOLDOWN_MIN_MS` | `1_800_000` (30 min) | env `BATCH_SCORER_CB_COOLDOWN_MIN_MS` |
| `CB_COOLDOWN_MAX_MS` | `3_600_000` (60 min) | env `BATCH_SCORER_CB_COOLDOWN_MAX_MS` |

### 3.2 Behavior When Tripped

1. Set internal state to `PAUSED`.
2. Emit metric `batch_scorer_paused` = `1` (gauge). _(Cross-ref: PREP-M2b §3.2 operational metrics.)_
3. Fire alert `batch_scorer_circuit_open` at severity `warn`. _(Cross-ref: PREP-M2b §4.1 alert rules.)_
4. All subsequent batch invocations MUST short-circuit with a structured log at level `warn`:
   ```json
   { "event": "batch_scorer_skipped", "reason": "circuit_open", "paused_at": "<ISO>" }
   ```
5. No partial work is attempted -- the batch exits before acquiring any `SKIP LOCKED` rows.

### 3.3 Auto-Reset

After `CB_COOLDOWN_MIN_MS` elapses, the next scheduled batch tick MUST attempt a single **probe batch** (standard batch size, no special treatment). Outcome:

- **Probe succeeds:** Reset `consecutive_failure_count` to `0`, set state to `CLOSED`, emit `batch_scorer_paused` = `0`.
- **Probe fails:** Add `CB_COOLDOWN_MIN_MS` to the current cooldown duration (capped at `CB_COOLDOWN_MAX_MS`), remain `PAUSED`, log at `error`. Cooldown progression: 30min -> 60min -> 60min (capped).

### 3.4 Manual Override

Ops may force-close the circuit by setting env `BATCH_SCORER_FORCE_CLOSE=true` and restarting the worker. On startup, if this flag is set, reset state to `CLOSED`, clear the counter, and immediately `delete process.env.BATCH_SCORER_FORCE_CLOSE` to prevent the flag from persisting across subsequent in-process restarts. Operators MUST also remove the env var from the deployment configuration (Docker Compose, Kubernetes, etc.) after use.

### 3.5 Observability

| Metric | Type | Labels | Emitted When |
|--------|------|--------|--------------|
| `batch_scorer_paused` | gauge | `service=batch_scorer` | State change |
| `batch_scorer_consecutive_failures` | gauge | `service=batch_scorer` | Each batch completion |
| `batch_scorer_circuit_reset_total` | counter | `trigger={auto,manual}` | Circuit closes |

---

## 4. Stale Score Ranking Policy

### 4.1 Definitions

- **Score age**: `now() - computed_at` in milliseconds, where `computed_at` is the timestamp the score was last computed (PREP-M1 §7.1 schema column).
- **Stale threshold**: The age in milliseconds beyond which decay begins. Configurable per surface.
- **Cold-start**: A scoreable pair with no existing score row (`computed_at IS NULL`).

### 4.2 Decay Function

Stale scores are deprioritized in ranking via a multiplicative decay factor applied at query time:

```
decay_factor = score_age <= 0
  ? 1.0                          // guard: clock skew (negative age)
  : score_age <= stale_threshold
    ? 1.0
    : max(DECAY_FLOOR, 1.0 - DECAY_RATE * ((score_age - stale_threshold) / stale_threshold))

effective_score = raw_score * decay_factor
```

All values are in milliseconds. `score_age` and `stale_threshold` must use the same unit. The `score_age <= 0` guard prevents clock-skew from inflating scores above their raw value.

| Constant | Value | Overridable |
|----------|-------|-------------|
| `DECAY_RATE` | `0.3` | per-surface config |
| `DECAY_FLOOR` | `0.4` | per-surface config |

The floor guarantees stale scores are **never suppressed** -- they rank lower but always appear in results.

### 4.3 Per-Surface Configuration

Each surface declares its staleness parameters in the surface config registry:

```typescript
interface StalenessConfig {
  stale_threshold_ms: number;   // default: 86_400_000 (24h)
  decay_rate: number;           // default: 0.3
  decay_floor: number;          // default: 0.4
}
```

Surfaces without explicit config inherit the defaults. Config validation enforces:
- `decay_floor` >= `0.1` (prevents suppression)
- `stale_threshold_ms` >= `60_000` (1 min minimum; prevents division-by-near-zero in decay formula)

Validation failure at startup is a fatal error -- the application MUST NOT start with invalid staleness config.

### 4.4 Cold-Start Behavior

When a pair has no existing score (`computed_at IS NULL`):

1. The scoring query MUST return `score: null` for that pair.
2. The API response includes `"score_status": "pending"` alongside the null value.
3. Frontend consumers MUST render a "pending" placeholder (skeleton / "Score calculating...") -- never a zero or blank.
4. Cold-start pairs rank **below** all scored pairs (including fully-decayed ones) but remain in the result set. Sort key: `COALESCE(effective_score, -1)` -- cold-start pairs get `-1` for ordering, placing them after score-0 pairs.

### 4.5 API Response Contract

All scoring API responses MUST include `computed_at` (ISO 8601 timestamp) alongside the score value. The DB column is `computed_at` (PREP-M1 §7.1); the API field uses the same name for consistency.

Response shape:

```typescript
interface ScoreResponse {
  score: number | null;
  score_status: "fresh" | "stale" | "pending";
  computed_at: string | null;  // ISO 8601, null for cold-start
}
```

`score_status` is derived server-side: `"fresh"` when `score_age <= stale_threshold`, `"stale"` when decay is applied, `"pending"` when `computed_at IS NULL`.

### 4.6 Hard Suppression -- Explicitly Prohibited (v1)

No score, regardless of age, may be removed from results solely due to staleness. This constraint applies to all surfaces in v1. Future versions may introduce opt-in suppression via separate contract amendment.

### 4.7 Observability

| Metric | Type | Labels | Emitted When |
|--------|------|--------|--------------|
| `score_decay_applied_total` | counter | `surface` | Decay factor < 1.0 applied |
| `score_cold_start_total` | counter | `surface` | Null score returned |
| `score_age_seconds` | histogram | `surface` | Each score read at query time |

_(Cross-ref: PREP-M2b §3.1 for histogram bucket boundaries; §4.2 for staleness alert at p95 age > 2x threshold.)_

---

## 5. Partial Batch Completion & Idempotent Score Writes

### 5.1 Scenario

Batch worker claims N rows via `SKIP LOCKED`, processes K < N, then crashes. The K processed rows already have scores written. Next cycle re-claims the remaining N-K rows (lock released on connection death). Some of the K rows may also be re-claimed if the transaction did not commit.

### 5.2 Specification

5.2.1. Score writes MUST use upsert semantics: `INSERT ... ON CONFLICT (pair_id) DO UPDATE SET score = $1, computed_at = $2 WHERE computed_at < $2`.

5.2.2. The `WHERE computed_at < $2` guard ensures a replay of an older computation never overwrites a newer score. This makes score writes fully idempotent and last-writer-wins by timestamp.

5.2.3. Batch worker MUST commit score writes per-chunk of <=10 rows, NOT in a single transaction spanning the full claimed set. This bounds the blast radius of a crash to at most 10 uncommitted scores.

5.2.4. The `claimed_at` column on batch queue rows acts as a timeout lease. Rows claimed longer than `BATCH_CLAIM_TIMEOUT_MS = 60_000` (60s) are treated as abandoned and become visible to the next `SKIP LOCKED` query. _(Pattern: `portal-outbox.ts`)_

5.2.5. No deduplication token is required. Idempotency is structural: same `pair_id` + newer `computed_at` always wins; same `pair_id` + equal/older `computed_at` is a no-op.

---

## 6. Redis Failure in Real-Time Scoring Path

### 6.1 Scenario

Real-time scoring (on-demand API for portal display) attempts to read a cached score from Redis. Redis is unavailable.

### 6.2 Specification

6.2.1. Real-time scoring MUST implement **fail-open** on Redis read failure: fall through to direct database read of the `match_scores` table.

6.2.2. Latency budget: Real-time scoring has a soft ceiling of 200ms. DB fallback is acceptable because `match_scores` is a single-row lookup by `pair_id` (indexed). Expected DB latency: <10ms.

6.2.3. On Redis read failure, the system MUST NOT attempt a full recompute via `computeMatchScore`. Real-time path returns the last-persisted score or `null` if no score exists.

6.2.4. On Redis write failure (cache population after DB read), the failure is logged at `warn` level and swallowed. Next request retries cache population.

6.2.5. Redis connection errors MUST be caught within `withHandlerGuard` (ref: `packages/config/src/handler-guard.ts`). They MUST NOT propagate to the caller.

6.2.6. If no persisted score exists AND Redis is down, return `{ score: null, score_status: "pending", computed_at: null }`. The portal UI handles null scores per §4.4 (displays "Calculating...").

---

## 7. Cascade Detection: Infrastructure vs. Data Failure

### 7.1 Scenario

`assembleMatchInputs` returns `null` for a high percentage of pairs in a single batch chunk, indicating possible infrastructure failure rather than independent data issues.

### 7.2 Specification

7.2.1. Batch worker MUST track per-cycle skip rate: `skipped_count / total_claimed_count`.

7.2.2. If skip rate >= `CASCADE_THRESHOLD = 0.5` (50%) AND `total_claimed_count >= 5`, the batch worker MUST:
- Emit structured log at `error` level: `{ "event": "cascade_detected", "skip_rate": <float>, "total_claimed": <int>, "cycle_id": <string> }`
- Increment metric `batch_scorer_cascade_detected_total`

7.2.3. If skip rate = `1.0` (100%) AND `total_claimed_count >= 5`, additionally:
- Count the cycle as a batch failure for circuit breaker purposes (§3.1). A 100% skip cycle is treated as infrastructure failure, not N independent data failures.

7.2.4. Individual pair skips due to `assembleMatchInputs` returning `null` are still governed by PREP-M1 §6 degradation matrix. Cascade detection is an aggregate-level concern layered on top.

7.2.5. Cascade detection does NOT abort the current cycle. All pairs are still processed (skipped or scored). The circuit breaker evaluates after the cycle completes.

---

## 8. Staleness Trigger + Batch Recompute Race

### 8.1 Scenario

An event handler sets `stale = true` on a score row (PREP-M1 §7.1, PREP-M1b §4) while the batch worker is mid-computation for that same pair (already read inputs, computing score).

### 8.2 Specification

8.2.1. The batch worker's score write uses the upsert from §5.2.1. The `computed_at` timestamp is captured at the moment computation begins (before `computeMatchScore` is called).

8.2.2. After the batch worker writes the score (setting `stale = false` in the upsert), the event handler's concurrent `UPDATE SET stale = true` may arrive before or after the batch write, depending on transaction ordering.

8.2.3. On next batch cycle, the pair selection query (PREP-M1b §5.1) includes: `WHERE stale = true OR scoring_version < $CURRENT_SCORING_VERSION`. The `FRESHNESS_WINDOW_HOURS` fallback catches rows missed by both axes: `OR computed_at < NOW() - INTERVAL '${FRESHNESS_WINDOW_HOURS} hours'`.

8.2.4. **Net effect:** If the event handler's `stale = true` wins the race (committed after the batch write), the pair is recomputed next cycle. If the batch write wins (committed after the event handler), the score is fresh -- but the underlying data may have changed, and the next stale event for that data change will re-trigger. No data is lost, no coordination is needed.

8.2.5. The batch worker's score write sets `stale = false` as part of the upsert (§10.2.1 SQL). The batch worker's **pair-selection step** claims the row via `SELECT ... FOR UPDATE SKIP LOCKED WHERE stale = true`. This ensures:
- If a new stale event arrives during computation, it sets `stale = true` again and the pair is picked up on the next cycle.
- The SKIP LOCKED claim prevents concurrent batch workers (if any) from processing the same row.
- The `FRESHNESS_WINDOW_HOURS` fallback catches any rows where the stale flag was missed due to race timing.

| Constant | Value | Overridable |
|----------|-------|-------------|
| `FRESHNESS_WINDOW_HOURS` | `24` | env `BATCH_SCORER_FRESHNESS_WINDOW_HOURS` |

---

## 9. Pair Lifecycle State Transitions

### 9.1 Skip on Null Inputs (assembleMatchInputs -> null)

- Increment `retry_count` on the pair row.
- Leave status as `pending`.
- Row remains eligible for next cycle.
- Log `pair_skipped` per PREP-M2b §3.2.
- Rationale: Transient data issues (profile not yet synced) resolve on retry. Matches outbox pattern (`MAX_RETRIES` in `portal-outbox.ts`).

### 9.2 Retry Exhaustion (retry_count >= MAX_RETRIES)

- Set status to `failed`.
- Emit structured log: `{ "event": "pair_retry_exhausted", "pair_id": <string>, "retry_count": 10 }`.
- Row is excluded from batch selection (`WHERE status NOT IN ('failed', 'revoked')`).
- Failed pairs can be manually re-queued via admin action (reset `retry_count = 0, status = 'pending'`).

| Constant | Value | Source |
|----------|-------|--------|
| `MAX_RETRIES` | `10` | Aligned with `portal-outbox.ts` |

### 9.3 Successful Score Write

- Set `retry_count = 0`.
- Set `status = 'scored'`.
- Set `computed_at = NOW()`.
- `stale` set to `false` by the upsert (§8.2.5).

### 9.4 Clear Stale (Event-Driven Recompute Trigger)

- Set `stale = true` on the score row (PREP-M1 §7.1, PREP-M1b §4).
- Do NOT delete the score row. Do NOT null the existing score.
- The existing score remains available for real-time reads until replaced.
- Pair re-enters batch selection on next cycle via `WHERE stale = true` (PREP-M1b §5.1).

### 9.5 State Machine

```
pending ──[score written]──────────> scored
pending ──[null inputs]────────────> pending (retry_count++)
pending ──[retry_count >= 10]──────> failed
scored  ──[stale event]────────────> scored (stale = true, re-enters batch selection)
scored  ──[stale recompute, null inputs]──> scored (stale persists, retry_count++, existing score preserved)
scored  ──[consent revoked]────────> deleted (score row hard-deleted, §10)
failed  ──[admin reset]────────────> pending (retry_count = 0)
```

**Note on `scored + null inputs`:** When a previously-scored pair is reprocessed (due to staleness) and `assembleMatchInputs` returns null, the existing score is preserved (not deleted). The `stale` flag remains true, and `retry_count` is incremented. The pair will be retried on subsequent cycles. If `retry_count` reaches `MAX_RETRIES`, the pair is marked `failed` -- but the existing score row persists for real-time reads until explicitly cleaned up.

---

## 10. Consent Revocation Race

### 10.1 Scenario

A pair's consent is revoked (one party withdraws) while the batch worker has already claimed the row and is mid-computation or about to write.

### 10.2 Specification

10.2.1. Score write MUST include a consent check as a write-time guard. The guard must apply to **both** the INSERT and UPDATE branches of the upsert. Use a CTE to gate the entire operation:

```sql
WITH consent_gate AS (
  SELECT 1
  FROM portal_seeker_profiles psp
  WHERE psp.user_id = $1 AND psp.consent_matching = true
)
INSERT INTO portal_job_match_scores (seeker_user_id, job_id, score, tier, signals, scoring_version, computed_at)
SELECT $1, $2, $3, $4, $5, $6, $7
WHERE EXISTS (SELECT 1 FROM consent_gate)
ON CONFLICT (seeker_user_id, job_id) DO UPDATE
  SET score = $3, tier = $4, signals = $5, scoring_version = $6, computed_at = $7, stale = false
  WHERE portal_job_match_scores.computed_at < $7
```

This uses the `portal_job_match_scores` table and columns from PREP-M1 §7.1. The CTE checks `consent_matching` on `portal_seeker_profiles` per PREP-M1 §3.2 gate #2. If consent is revoked, the `WHERE EXISTS` prevents both INSERT and UPDATE -- the entire statement is a no-op.

10.2.2. If consent was revoked, the `WHERE EXISTS` check fails and neither INSERT nor UPDATE executes. No error is raised; the worker moves to the next pair.

10.2.3. Consent revocation handler (event-driven) MUST execute both operations **in a single transaction**:
- Set `portal_seeker_profiles.consent_matching = false`.
- DELETE the corresponding row from `portal_job_match_scores` (hard delete). Revoked pairs must not have persisted scores.
- Mark all `portal_job_match_scores` rows for that seeker as stale (`stale = true`) if not deleted (covers partial consent scenarios).

The transactional requirement prevents a window where scores exist for a revoked-consent seeker.

10.2.4. Batch pair selection query MUST exclude revoked pairs: `WHERE status NOT IN ('failed', 'revoked')`.

10.2.5. **Race window analysis:** Between the batch worker reading inputs and executing the write, consent may be revoked. The write-time guard in §10.2.1 closes this window. The cost is one wasted computation (pure function, no side effects per PREP-M1 §4). Acceptable.

10.2.6. If the score was already written in a previous cycle and consent is subsequently revoked, the consent revocation handler (§10.2.3) handles cleanup. No batch-side logic needed for historical scores.

---

## 11. Constants Summary

| Constant | Value | Section | Overridable |
|----------|-------|---------|-------------|
| `CB_FAILURE_THRESHOLD` | `5` | §3 | env |
| `CB_COOLDOWN_MIN_MS` | `1_800_000` (30 min) | §3 | env |
| `CB_COOLDOWN_MAX_MS` | `3_600_000` (60 min) | §3 | env |
| `DECAY_RATE` | `0.3` | §4 | per-surface config |
| `DECAY_FLOOR` | `0.4` | §4 | per-surface config |
| `BATCH_CLAIM_TIMEOUT_MS` | `60_000` (60s) | §5 | env |
| `CASCADE_THRESHOLD` | `0.5` (50%) | §7 | env |
| `FRESHNESS_WINDOW_HOURS` | `24` | §8 | env |
| `MAX_RETRIES` | `10` | §9 | -- (aligned with outbox) |

---

## 12. Alert-to-Recovery Mapping

Every PREP-M2b alert has a corresponding recovery procedure in this contract.

### 12.1 PREP-M2b Alerts (defined in M2b §4.1)

| PREP-M2b Alert | Trigger | Recovery Procedure | Runbook |
|---|---|---|---|
| `ScoringBatchHighFailureRate` | >10% batch failure rate for 15min | Check pair_failed logs for common error -> investigate DB connectivity / schema | §13.2 |
| `ScoringBatchHighFailureRateCritical` | >25% batch failure rate for 30min | Page on-call -> check DB health -> review recent deploys -> pause batch if data integrity at risk | §13.2 |
| `ScoringBatchWorkerDead` | No batch cycle completed in 15min | Check container health -> check cron route reachability -> restart container | §13.1 |
| `ScoringStaleQueueBacklog` | >500 scores pending recompute for 30min | Check batch liveness -> check circuit breaker state -> increase chunk size temporarily | §13.4 |
| `ScoringBatchDurationHigh` | p95 batch duration >30s for 15min | Check DB slow query log -> EXPLAIN on staleness detection query -> tune indexes per PREP-M1b §5.1 | §13.4 |
| `ScoringVersionMigrationStalled` | >100 outdated-version rows not decreasing for 4h | Verify batch worker running -> check if event-stale preempts version backfill -> run migration script | §13.5 |

### 12.2 Extended Alerts (defined by this contract)

| Alert | Trigger | Recovery Procedure | Runbook |
|---|---|---|---|
| `ScoringBatchCascadeDetected` | Skip rate >= 50% in a cycle with >= 5 claimed rows | Check `assembleMatchInputs` dependencies (profile service, DB connectivity) -> resolve -> pairs retry next cycle | §13.3 |
| `ScoringPairRetryExhausted` | Pair reaches MAX_RETRIES=10 | Investigate pair data (missing profile? revoked consent?) -> fix data -> admin reset to pending | §13.8 |
| `ScoringRealTimeLatencyHigh` | p95 real-time scoring > 200ms | Check Redis availability -> if down, DB fallback active (expected latency increase) -> restore Redis | §13.6 |
| `ScoringStalenessBudgetExceeded` | p95 score age > 2x stale_threshold | Check batch worker health -> check circuit breaker state -> if paused, investigate root cause | §13.4 |
| `ScoringConsentRevocationBacklog` | Revoked pairs with persisted scores > 0 for > 5min | Check consent revocation handler -> verify hard-delete executing -> manual cleanup if handler stuck | §13.7 |

---

## 13. Recovery Runbook

### 13.1 Batch Worker Not Running (ScoringBatchWorkerDead -- PREP-M2b §4.1)

1. Check Docker container health: `docker ps | grep web`
2. Check if cron route is reachable: `curl -s http://localhost:3000/api/v1/internal/scoring/recompute`
3. Check recent logs: `docker logs web --since 15m 2>&1 | grep -E "portal.scoring.batch_(completed|noop)"`
4. If no recent `batch_completed` or `batch_noop` events, the poller is not running.
5. Restart the container. If cron scheduler is down, investigate scheduler infrastructure.

### 13.2 Circuit Breaker Tripped (ScoringBatchHighFailureRate)

1. Check circuit breaker state in logs: `docker logs web --since 30m 2>&1 | grep batch_scorer_skipped`
2. Check DB health: `psql -c "SELECT 1"` against the portal database.
3. Check recent pair failures: `docker logs web --since 1h 2>&1 | grep portal.scoring.pair_failed | jq '{error, retryCount}'`
4. If DB is healthy and errors are data-specific, wait for auto-reset probe (30 min cooldown).
5. If infra issue resolved, force-close: set env `BATCH_SCORER_FORCE_CLOSE=true`, restart worker.
6. After restart, monitor first batch cycle for success.

### 13.3 Cascade Detected (ScoringBatchCascadeDetected)

1. Check cascade log: `docker logs web --since 30m 2>&1 | grep cascade_detected`
2. Check `assembleMatchInputs` dependency health:
   - Seeker profiles table: `psql -c "SELECT COUNT(*) FROM portal_seeker_profiles"`
   - Job postings table: `psql -c "SELECT COUNT(*) FROM portal_job_postings WHERE status = 'active'"`
3. If 100% skip rate, the cycle counted toward circuit breaker -- check §13.2.
4. If < 100% skip rate, pairs will retry next cycle. Monitor next 2-3 cycles for improvement.

### 13.4 Stale Queue Backlog (ScoringStaleQueueBacklog -- PREP-M2b §4.1)

1. Check stale queue depth:
   ```sql
   SELECT
     CASE
       WHEN stale = true AND scoring_version < $CURRENT THEN 'stale+outdated'
       WHEN stale = true THEN 'stale'
       WHEN scoring_version < $CURRENT THEN 'outdated'
       ELSE 'fresh'
     END AS status,
     COUNT(*)
   FROM portal_job_match_scores
   GROUP BY 1;
   ```
2. Check batch worker liveness (§13.1).
3. Check circuit breaker state (§13.2).
4. If worker is running but backlog growing, consider temporarily increasing chunk size.

### 13.5 Version Migration Stalled (ScoringVersionMigrationStalled -- PREP-M2b §4.1)

1. Verify batch worker is running (§13.1).
2. Check if event-driven stale rows are preempting version backfill (event-stale has higher priority per PREP-M1b §5.2).
3. Run version migration progress query (PREP-M2b §6.3).
4. If needed, run one-time migration script with larger chunk size (per PREP-M1b §5.3).

### 13.6 Real-Time Latency High (ScoringRealTimeLatencyHigh)

1. Check Redis availability: `redis-cli ping`
2. If Redis is down, DB fallback is active -- latency increase is expected.
3. Check `match_scores` index health: `EXPLAIN ANALYZE SELECT * FROM portal_job_match_scores WHERE seeker_user_id = $1 AND job_id = $2`
4. Restore Redis. Cache repopulates automatically on next reads.

### 13.7 Consent Revocation Backlog (ScoringConsentRevocationBacklog)

1. Check for score rows belonging to seekers who revoked consent:
   ```sql
   SELECT pjms.seeker_user_id, pjms.job_id, pjms.score, pjms.computed_at
   FROM portal_job_match_scores pjms
   JOIN portal_seeker_profiles psp ON psp.user_id = pjms.seeker_user_id
   WHERE psp.consent_matching = false;
   ```
2. If rows exist, the consent revocation handler is stuck or failed.
3. Manual cleanup:
   ```sql
   DELETE FROM portal_job_match_scores
   WHERE seeker_user_id IN (
     SELECT user_id FROM portal_seeker_profiles WHERE consent_matching = false
   );
   ```
4. Investigate why the event handler did not execute the hard delete (§10.2.3).

### 13.8 Retry-Exhausted Pairs (ScoringPairRetryExhausted)

1. Check `pair_retry_exhausted` log events: `docker logs web --since 24h 2>&1 | grep pair_retry_exhausted | jq '{seekerUserId, jobId, retryCount}'`
2. Investigate root cause per pair -- check if seeker profile exists, consent status, job posting status.
3. Fix underlying data issue.
4. The pair will be retried on the next batch cycle after the underlying data issue is resolved (the batch worker re-evaluates `assembleMatchInputs` on each cycle).

---

## 14. Story Implementation Mapping

| Story | Deliverables from This Contract |
|-------|--------------------------------|
| 7.1 | `ScoreResponse` interface (§4.5), `StalenessConfig` interface (§4.3), circuit breaker constants in `@igbo/config/match` (§11) |
| 7.3 | Redis fail-open for real-time scoring (§6), `score_status` derivation in API response (§4.5), cold-start "pending" return (§4.4) |
| 7.4 | Stale score decay function in recommendation queries (§4.2), cold-start ranking (§4.4) |
| 7.5 | Stale score decay function in candidate ranking queries (§4.2) |
| 7.7 | Circuit breaker (§3), batch idempotent writes (§5), cascade detection (§7), staleness race resolution (§8), pair lifecycle state machine (§9), consent revocation write-time guard (§10), all alert-to-recovery mappings (§12) |

---

## 15. Cross-Reference

| This Contract | PREP-M1 | PREP-M1b | PREP-M2 | PREP-M2b |
|--------------|---------|----------|---------|----------|
| §2.1 Failure taxonomy | §6 Degradation matrix | §4 Two-axis staleness | §4.3 Retry tests | §4.1 Alert rules |
| §3 Circuit breaker | §1 Three execution modes | -- | §4.3.4 (retry exhaustion) | §4.1 `ScoringBatchWorkerDead` |
| §4 Stale score ranking | -- | §4 Two-axis staleness, §5.2 Priority | -- | §2.2 Staleness metrics |
| §5 Idempotent writes | §7 Schema (UNIQUE constraint) | -- | §4.4 Idempotency tests | §3.1 `batch_completed` log |
| §6 Redis fail-open | §1 Real-time execution mode | -- | §4.8 Real-time path tests | §3.5 `realtime_error` log |
| §7 Cascade detection | §3.2 Consent/eligibility gates | -- | §4.3 Retry tests | §3.2 `pair_skipped` log |
| §8 Staleness race | §8 Consistency invariant | §4 Two-axis staleness | §5.3 Cross-mode equiv | §3.3 `stale_trigger_emitted` |
| §9 Pair lifecycle | §3.2 Null return gates | §5.2 Priority ordering | §4.3 Retry tests | §3.2 `pair_failed`, `pair_skipped` |
| §10 Consent revocation | §3.2 Gate #2 (consentMatching) | -- | -- | -- |
| §12 Alert mapping | -- | -- | -- | §4.1 All alert rules, §4.3 Escalation |
| §13 Recovery runbook | -- | §5.3 Version migration | -- | §4.2 Log-based monitoring, §6 Operational queries |
