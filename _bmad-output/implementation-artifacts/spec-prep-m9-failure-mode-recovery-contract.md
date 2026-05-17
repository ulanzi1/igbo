---
title: 'PREP-M9: Failure Mode & Recovery Contract'
type: 'chore'
created: '2026-05-17'
status: 'done'
baseline_commit: 'e01dc3bc'
context:
  - '_bmad-output/implementation-artifacts/prep-m1-scoring-engine-design.md'
  - '_bmad-output/implementation-artifacts/prep-m2-batch-testing-spike.md'
  - '_bmad-output/implementation-artifacts/prep-m2b-operational-observability-contract.md'
  - '_bmad-output/implementation-artifacts/spec-prep-m1b-score-versioning-policy.md'
---

<frozen-after-approval reason="human-owned intent -- do not modify unless human renegotiates">

## Intent

**Problem:** Epic 7 introduces continuous batch computation (5-min recompute cycles), event-driven staleness triggers, and real-time on-demand scoring. Unlike reactive systems (notifications, outbox polling) where failure affects a single user action, scoring failures silently degrade platform trust -- stale scores surface wrong recommendations, failed batches create growing backlogs, and incomplete inputs produce misleading tier assignments. Without a pre-defined failure governance contract, each story will independently invent retry, fallback, and degradation behaviors, producing inconsistent resilience across the three execution modes.

**Approach:** Produce a failure mode & recovery contract document (`_bmad-output/implementation-artifacts/prep-m9-failure-mode-recovery-contract.md`) that defines: (1) per-execution-mode failure taxonomy, (2) retry strategies aligned with existing codebase patterns (outbox poller SKIP LOCKED, sendWithRetry exponential backoff, withHandlerGuard isolation), (3) degradation policy for incomplete scoring inputs vs infrastructure failures, (4) fallback score policy (when to show stale vs suppress vs show nothing), (5) alert threshold integration with PREP-M2b observability contract, (6) recovery runbook for each failure class.

## Boundaries & Constraints

**Always:**
- Align retry patterns with existing codebase conventions: outbox poller (SKIP LOCKED + retry counter), withHandlerGuard (error isolation, never re-throw), email service (exponential backoff)
- Distinguish data-dependent failures (permanent -- missing profile, revoked consent) from infrastructure failures (transient -- DB timeout, Redis unavailable)
- Scoring failures must never surface as unhandled exceptions to end users -- all three modes return graceful responses
- Alert thresholds must reference PREP-M2b metric names and Prometheus alert rules exactly
- `computeMatchScore` is pure and cannot fail (PREP-M1 §4) -- all failure governance applies to `assembleMatchInputs`, batch orchestration, and DB writes only

**Ask First (RESOLVED):**
- ~~Whether to define a "circuit breaker" pattern for batch scoring~~ → **DECIDED: Yes.** 5 consecutive failures → pause + alert, auto-reset after 30min cooldown. In-memory state (resets on worker restart). Global scope (single poller process). See §4.
- ~~Whether stale scores older than a configurable threshold should be suppressed~~ → **DECIDED: Deprioritize, never suppress (v1).** Multiplicative decay function applied at query time. No hard suppression cliff. Configurable per-surface. Cold-start pairs return null with "pending" status. See §5.

**Never:**
- Do not implement any code -- this is a contract document only
- Do not modify existing PREP-M1, M1b, M2, or M2b contracts -- reference them, don't amend them
- Do not define new metrics or log events -- reference PREP-M2b catalog exclusively
- Do not change scoring logic, weights, or tier boundaries

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/prep-m1-scoring-engine-design.md` -- Scoring engine architecture, three execution modes, assembleMatchInputs contract, degradation matrix (§6)
- `_bmad-output/implementation-artifacts/prep-m2-batch-testing-spike.md` -- Batch test strategy: retry tests (§4.3), idempotency tests (§4.4), SKIP LOCKED tests (§4.5)
- `_bmad-output/implementation-artifacts/prep-m2b-operational-observability-contract.md` -- Metric catalog, alert rules, escalation table, log event contracts
- `_bmad-output/implementation-artifacts/spec-prep-m1b-score-versioning-policy.md` -- Staleness model, version migration, recompute path
- `packages/db/src/queries/portal-outbox.ts` -- SKIP LOCKED pattern, MAX_RETRIES=10, retry counter increment
- `apps/portal/src/services/outbox-poller.ts` -- withHandlerGuard wrapping, structured error logging, retry-on-failure
- `apps/portal/src/services/email-service.ts` -- sendWithRetry exponential backoff [1s, 5s, 30s], Redis NX dedup fail-open
- `packages/config/src/handler-guard.ts` -- Error isolation wrapper: catch-all, never re-throw, structured logging
- `apps/portal/src/services/digest-sender.ts` -- Per-item error counting, aggregate stats, HTTP 200 with error counts
- `apps/portal/src/services/match-scoring-service.ts` -- Current placeholder scoring (pure function, no error paths)

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/implementation-artifacts/prep-m9-failure-mode-recovery-contract.md` -- Write the failure mode & recovery contract covering: failure taxonomy (per execution mode), retry strategy (batch pair retry with counter, real-time no-retry, event handler idempotent replay), degradation policy (data-absent vs infrastructure-absent), fallback score policy (stale score display rules per surface), alert-to-action mapping (extending M2b escalation table with recovery procedures), recovery runbook (batch worker restart, manual recompute, version migration recovery, consent-revocation cleanup)

**Acceptance Criteria:**
- Given the contract document, when a developer implements Story 7.7 batch worker, then every batch failure path (DB timeout, pair scoring error, chunk claim failure, stale detection query failure) has an explicit retry/skip/abort decision documented
- Given the contract document, when the real-time scoring path (Story 7.3) encounters an error, then the documented fallback behavior specifies what the API returns (cached stale score, null, or error response) and under what conditions each applies
- Given the contract document, when an event-driven stale trigger handler (Story 7.7) fails, then the documented behavior confirms the handler is wrapped in withHandlerGuard (never re-throws) and the score row remains stale for the next batch cycle to pick up
- Given the PREP-M2b alert `ScoringBatchHighFailureRate` firing, when an operator reads the contract, then they find the exact recovery steps: what to check first, what to escalate, and when to pause the batch worker
- Given the contract document, when `assembleMatchInputs` returns null for a stale-marked pair during batch processing, then the documented behavior specifies: skip the pair, log `pair_skipped` (PREP-M2b §3.2), and clear the stale flag (the pair is ineligible, not failed)
- Given the contract document, when reviewed alongside PREP-M2b, then every alert in M2b's escalation table (§4.3) has a corresponding recovery procedure in this contract's runbook
- Given the contract document, when infrastructure (DB or Redis) is degraded, then each execution mode has a documented degradation behavior: batch pauses or retries, real-time returns stale/null, event handlers fail-open per withHandlerGuard

## §4. Circuit Breaker — Batch Scoring Pause

### 4.1 Trigger Condition

The batch scorer MUST track consecutive batch-level failures using an **in-memory** counter (`consecutive_failure_count`). A "batch failure" is defined as any batch invocation that terminates without successfully writing at least one scored result.

**Scope:** Global — one circuit for the entire batch scorer process. The batch scorer is a single poller; if infrastructure is degraded, all pairs are affected equally. There is no per-surface circuit.

**State storage:** In-memory only. Worker restart clears the circuit (resets to `CLOSED`, counter to `0`). This is intentional — if the worker restarted, the infrastructure issue may have resolved.

| Constant | Value | Overridable |
|----------|-------|-------------|
| `CB_FAILURE_THRESHOLD` | `5` | env `BATCH_SCORER_CB_THRESHOLD` |
| `CB_COOLDOWN_MIN_MS` | `1_800_000` (30 min) | env `BATCH_SCORER_CB_COOLDOWN_MIN_MS` |
| `CB_COOLDOWN_MAX_MS` | `3_600_000` (60 min) | env `BATCH_SCORER_CB_COOLDOWN_MAX_MS` |

### 4.2 Behavior When Tripped

1. Set internal state to `PAUSED`.
2. Emit metric `batch_scorer_paused` = `1` (gauge). _(Cross-ref: PREP-M2b §3.2 operational metrics.)_
3. Fire alert `batch_scorer_circuit_open` at severity `warn`. _(Cross-ref: PREP-M2b §4.1 alert rules.)_
4. All subsequent batch invocations MUST short-circuit with a structured log at level `warn`:
   ```json
   { "event": "batch_scorer_skipped", "reason": "circuit_open", "paused_at": "<ISO>" }
   ```
5. No partial work is attempted — the batch exits before acquiring any `SKIP LOCKED` rows.

### 4.3 Auto-Reset

After `CB_COOLDOWN_MIN_MS` elapses, the next scheduled batch tick MUST attempt a single **probe batch** (standard batch size, no special treatment). Outcome:

- **Probe succeeds:** Reset `consecutive_failure_count` to `0`, set state to `CLOSED`, emit `batch_scorer_paused` = `0`.
- **Probe fails:** Increment cooldown by `CB_COOLDOWN_MIN_MS` (capped at `CB_COOLDOWN_MAX_MS`), remain `PAUSED`, log at `error`.

### 4.4 Manual Override

Ops may force-close the circuit by setting env `BATCH_SCORER_FORCE_CLOSE=true` and restarting the worker. On startup, if this flag is set, reset state to `CLOSED` and clear the counter. The flag is consumed once and MUST NOT persist across subsequent restarts.

### 4.5 Observability

| Metric | Type | Labels | Emitted When |
|--------|------|--------|--------------|
| `batch_scorer_paused` | gauge | `service=batch_scorer` | State change |
| `batch_scorer_consecutive_failures` | gauge | `service=batch_scorer` | Each batch completion |
| `batch_scorer_circuit_reset_total` | counter | `trigger={auto,manual}` | Circuit closes |

---

## §5. Stale Score Ranking Policy

### 5.1 Definitions

- **Score age**: `now() - scored_at` where `scored_at` is the timestamp the score was last computed.
- **Stale threshold**: The age beyond which decay begins. Configurable per surface.
- **Cold-start**: A scoreable pair with no existing score row (`scored_at IS NULL`).

### 5.2 Decay Function

Stale scores are deprioritized in ranking via a multiplicative decay factor applied at query time:

```
decay_factor = score_age <= stale_threshold
  ? 1.0
  : max(DECAY_FLOOR, 1.0 - DECAY_RATE * ((score_age - stale_threshold) / stale_threshold))

effective_score = raw_score * decay_factor
```

| Constant | Value | Overridable |
|----------|-------|-------------|
| `DECAY_RATE` | `0.3` | per-surface config |
| `DECAY_FLOOR` | `0.4` | per-surface config |

The floor guarantees stale scores are **never suppressed** — they rank lower but always appear in results.

### 5.3 Per-Surface Configuration

Each surface declares its staleness parameters in the surface config registry:

```typescript
interface StalenessConfig {
  stale_threshold_ms: number;   // default: 86_400_000 (24h)
  decay_rate: number;           // default: 0.3
  decay_floor: number;          // default: 0.4
}
```

Surfaces without explicit config inherit the defaults. No surface may set `decay_floor` below `0.1` — enforced at config validation time.

### 5.4 Cold-Start Behavior

When a pair has no existing score (`scored_at IS NULL`):

1. The scoring query MUST return `score: null` for that pair.
2. The API response includes `"score_status": "pending"` alongside the null value.
3. Frontend consumers MUST render a "pending" placeholder (skeleton / "Score calculating...") — never a zero or blank.
4. Cold-start pairs rank **below** all scored pairs (including fully-decayed ones) but remain in the result set.

### 5.5 API Response Contract

All scoring API responses MUST include `scored_at` (ISO 8601 timestamp) alongside the score value. This enables:
- Frontend age indicators (optional, per-surface UX decision)
- Client-side staleness awareness without additional API calls
- Debug visibility for developers

Response shape:
```typescript
interface ScoreResponse {
  score: number | null;
  score_status: "fresh" | "stale" | "pending";
  scored_at: string | null;  // ISO 8601, null for cold-start
}
```

`score_status` is derived server-side: `"fresh"` when `score_age <= stale_threshold`, `"stale"` when decay is applied, `"pending"` when `scored_at IS NULL`.

### 5.6 Hard Suppression — Explicitly Prohibited (v1)

No score, regardless of age, may be removed from results solely due to staleness. This constraint applies to all surfaces in v1. Future versions may introduce opt-in suppression via separate contract amendment.

### 5.7 Observability

| Metric | Type | Labels | Emitted When |
|--------|------|--------|--------------|
| `score_decay_applied_total` | counter | `surface` | Decay factor < 1.0 applied |
| `score_cold_start_total` | counter | `surface` | Null score returned |
| `score_age_seconds` | histogram | `surface` | Each score read at query time |

_(Cross-ref: PREP-M2b §3.1 for histogram bucket boundaries; §4.2 for staleness alert at p95 age > 2× threshold.)_

---

## §6. Partial Batch Completion & Idempotent Score Writes

### 6.1 Scenario

Batch worker claims N rows via `SKIP LOCKED`, processes K < N, then crashes. The K processed rows already have scores written. Next cycle re-claims the remaining N-K rows (lock released on connection death). Some of the K rows may also be re-claimed if the transaction did not commit.

### 6.2 Specification

6.2.1. Score writes MUST use upsert semantics: `INSERT ... ON CONFLICT (pair_id) DO UPDATE SET score = $1, scored_at = $2 WHERE scored_at < $2`.

6.2.2. The `WHERE scored_at < $2` guard ensures a replay of an older computation never overwrites a newer score. This makes score writes fully idempotent and last-writer-wins by timestamp.

6.2.3. Batch worker MUST commit score writes per-chunk of ≤10 rows, NOT in a single transaction spanning the full claimed set. This bounds the blast radius of a crash to at most 10 uncommitted scores.

6.2.4. The `claimed_at` column on batch queue rows acts as a timeout lease. Rows claimed longer than `BATCH_CLAIM_TIMEOUT_MS = 60_000` (60s) are treated as abandoned and become visible to the next `SKIP LOCKED` query. _(Pattern: `portal-outbox.ts`)_

6.2.5. No deduplication token is required. Idempotency is structural: same `pair_id` + newer `scored_at` always wins; same `pair_id` + equal/older `scored_at` is a no-op.

---

## §7. Redis Failure in Real-Time Scoring Path

### 7.1 Scenario

Real-time scoring (on-demand API for portal display) attempts to read a cached score from Redis. Redis is unavailable.

### 7.2 Specification

7.2.1. Real-time scoring MUST implement **fail-open** on Redis read failure: fall through to direct database read of the `match_scores` table.

7.2.2. Latency budget: Real-time scoring has a soft ceiling of 200ms. DB fallback is acceptable because `match_scores` is a single-row lookup by `pair_id` (indexed). Expected DB latency: <10ms.

7.2.3. On Redis read failure, the system MUST NOT attempt a full recompute via `computeMatchScore`. Real-time path returns the last-persisted score or `null` if no score exists.

7.2.4. On Redis write failure (cache population after DB read), the failure is logged at `warn` level and swallowed. Next request retries cache population.

7.2.5. Redis connection errors MUST be caught within `withHandlerGuard` (ref: `packages/config/src/handler-guard.ts`). They MUST NOT propagate to the caller.

7.2.6. If no persisted score exists AND Redis is down, return `{ score: null, score_status: "pending", scored_at: null }`. The portal UI handles null scores per §5.4 (displays "Calculating...").

---

## §8. Cascade Detection: Infrastructure vs. Data Failure

### 8.1 Scenario

`assembleMatchInputs` returns `null` for a high percentage of pairs in a single batch chunk, indicating possible infrastructure failure rather than independent data issues.

### 8.2 Specification

8.2.1. Batch worker MUST track per-cycle skip rate: `skipped_count / total_claimed_count`.

8.2.2. If skip rate ≥ `CASCADE_THRESHOLD = 0.5` (50%) AND `total_claimed_count ≥ 10`, the batch worker MUST:
- Emit structured log at `error` level: `{ "event": "cascade_detected", "skip_rate": <float>, "total_claimed": <int>, "cycle_id": <string> }`
- Increment metric `batch_scorer_cascade_detected_total`

8.2.3. If skip rate = `1.0` (100%) AND `total_claimed_count ≥ 5`, additionally:
- Count the cycle as a batch failure for circuit breaker purposes (§4.1). A 100% skip cycle is treated as infrastructure failure, not N independent data failures.

8.2.4. Individual pair skips due to `assembleMatchInputs` returning `null` are still governed by PREP-M1 §6 degradation matrix. Cascade detection is an aggregate-level concern layered on top.

8.2.5. Cascade detection does NOT abort the current cycle. All pairs are still processed (skipped or scored). The circuit breaker evaluates after the cycle completes.

---

## §9. Staleness Trigger + Batch Recompute Race

### 9.1 Scenario

An event handler sets `stale_at = NOW()` on a pair while the batch worker is mid-computation for that same pair (already read inputs, computing score).

### 9.2 Specification

9.2.1. The batch worker's score write uses the upsert from §6.2.1. The `scored_at` timestamp is captured at the moment computation begins (before `computeMatchScore` is called).

9.2.2. After the batch worker writes the score, the `stale_at` column remains set (written concurrently by the event handler).

9.2.3. On next batch cycle, the pair selection query includes: `WHERE stale_at IS NOT NULL OR scored_at IS NULL OR scored_at < NOW() - INTERVAL '${FRESHNESS_WINDOW_HOURS} hours'`.

9.2.4. **Net effect:** The "stale" pair is recomputed next cycle. The write from the current cycle is valid for the inputs it saw; the stale flag ensures it will be refreshed with newer inputs. No data is lost, no coordination is needed.

9.2.5. The score write MUST NOT clear `stale_at`. Only the batch worker's **pair-selection step** clears it: `UPDATE match_pairs SET stale_at = NULL WHERE id = $1` immediately before beginning computation for that row. This ensures:
- If a new stale event arrives during computation, it re-sets `stale_at` and the pair is picked up again next cycle.
- The clear + compute is NOT atomic (intentional). The window for a missed stale event is acceptable because stale events are also picked up by the `FRESHNESS_WINDOW_HOURS` fallback.

| Constant | Value | Overridable |
|----------|-------|-------------|
| `FRESHNESS_WINDOW_HOURS` | `24` | env `BATCH_SCORER_FRESHNESS_WINDOW_HOURS` |

---

## §10. Pair Lifecycle State Transitions

### 10.1 Skip on Null Inputs (assembleMatchInputs → null)

- Increment `retry_count` on the pair row.
- Leave status as `pending`.
- Row remains eligible for next cycle.
- Log `pair_skipped` per PREP-M2b §3.2.
- Rationale: Transient data issues (profile not yet synced) resolve on retry. Matches outbox pattern (`MAX_RETRIES` in `portal-outbox.ts`).

### 10.2 Retry Exhaustion (retry_count >= MAX_RETRIES)

- Set status to `failed`.
- Emit structured log: `{ "event": "pair_retry_exhausted", "pair_id": <string>, "retry_count": 10 }`.
- Row is excluded from batch selection (`WHERE status NOT IN ('failed', 'revoked')`).
- Failed pairs can be manually re-queued via admin action (reset `retry_count = 0, status = 'pending'`).

| Constant | Value | Source |
|----------|-------|--------|
| `MAX_RETRIES` | `10` | Aligned with `portal-outbox.ts` |

### 10.3 Successful Score Write

- Set `retry_count = 0`.
- Set `status = 'scored'`.
- Set `scored_at = NOW()`.
- `stale_at` already cleared at selection time (§9.2.5).

### 10.4 Clear Stale (Event-Driven Recompute Trigger)

- Set `stale_at = NOW()` on the pair row.
- Do NOT delete the score row. Do NOT null the existing score.
- The existing score remains available for real-time reads until replaced.
- Pair re-enters batch selection on next cycle.

### 10.5 State Machine

```
pending ──[score written]──────────► scored
pending ──[null inputs]────────────► pending (retry_count++)
pending ──[retry_count >= 10]──────► failed
scored  ──[stale event]────────────► scored (stale_at set, re-enters batch selection)
scored  ──[consent revoked]────────► revoked (score row deleted, §11)
failed  ──[admin reset]────────────► pending (retry_count = 0)
```

---

## §11. Consent Revocation Race

### 11.1 Scenario

A pair's consent is revoked (one party withdraws) while the batch worker has already claimed the row and is mid-computation or about to write.

### 11.2 Specification

11.2.1. Score write MUST include a consent check as a write-time guard:

```sql
INSERT INTO match_scores (pair_id, score, scored_at)
VALUES ($1, $2, $3)
ON CONFLICT (pair_id) DO UPDATE
  SET score = $2, scored_at = $3
  WHERE match_scores.scored_at < $3
    AND EXISTS (
      SELECT 1 FROM match_pairs mp
      WHERE mp.id = $1 AND mp.consent_status = 'active'
    )
```

11.2.2. If consent was revoked, the `EXISTS` check fails and the write is a no-op. No error is raised; the worker moves to the next pair.

11.2.3. Consent revocation handler (event-driven) MUST also:
- Set `match_pairs.status = 'revoked'`.
- DELETE the corresponding row from `match_scores` (hard delete). Revoked pairs must not have persisted scores.

11.2.4. Batch pair selection query MUST exclude revoked pairs: `WHERE status NOT IN ('failed', 'revoked')`.

11.2.5. **Race window analysis:** Between the batch worker reading inputs and executing the write, consent may be revoked. The write-time guard in §11.2.1 closes this window. The cost is one wasted computation (pure function, no side effects per PREP-M1 §4). Acceptable.

11.2.6. If the score was already written in a previous cycle and consent is subsequently revoked, the consent revocation handler (§11.2.3) handles cleanup. No batch-side logic needed for historical scores.

---

## §12. Constants Summary

| Constant | Value | Section | Overridable |
|----------|-------|---------|-------------|
| `CB_FAILURE_THRESHOLD` | `5` | §4 | env |
| `CB_COOLDOWN_MIN_MS` | `1_800_000` (30 min) | §4 | env |
| `CB_COOLDOWN_MAX_MS` | `3_600_000` (60 min) | §4 | env |
| `DECAY_RATE` | `0.3` | §5 | per-surface config |
| `DECAY_FLOOR` | `0.4` | §5 | per-surface config |
| `BATCH_CLAIM_TIMEOUT_MS` | `60_000` (60s) | §6 | env |
| `CASCADE_THRESHOLD` | `0.5` (50%) | §8 | env |
| `FRESHNESS_WINDOW_HOURS` | `24` | §9 | env |
| `MAX_RETRIES` | `10` | §10 | — (aligned with outbox) |

---

## Design Notes

**Failure taxonomy rationale:** Failures in the scoring engine split into two orthogonal axes: *what failed* (data assembly, score computation, DB write, infrastructure) and *which mode* (batch, event-driven, real-time). The contract defines behavior at each intersection. `computeMatchScore` is pure and infallible per PREP-M1 -- so the failure surface is limited to `assembleMatchInputs` (DB reads), batch orchestration (SKIP LOCKED claims, chunk processing), and score persistence (DB writes).

**Stale score as fallback (v1 — deprioritize, never suppress):** When real-time scoring fails, showing a stale stored score is better than showing nothing -- the user sees an approximation rather than a broken UI. Rather than a hard suppression cliff (which creates disorienting flicker for users), v1 uses a multiplicative decay function that gradually deprioritizes stale scores in ranking. Cold-start pairs (no prior score) return null with a "pending" status for frontend placeholder rendering.

**Retry alignment:** Batch pair retries follow the outbox poller pattern (counter increment, max retries, permanent failure marking) rather than the email pattern (in-process exponential backoff). Batch pairs are DB-backed and polled -- exponential backoff within a batch cycle would block other pairs. The outbox pattern lets failed pairs retry on the next cycle naturally.

## Verification

### Failure Mode × Execution Mode Matrix

Each cell indicates documented behavior. Reviewer MUST verify each cell has a corresponding implementation path.

| Failure Mode | Batch (SKIP LOCKED) | Event-Driven (withHandlerGuard) | Real-Time (On-Demand API) | Documented In |
|---|---|---|---|---|
| `assembleMatchInputs` → null | Skip pair, increment retry_count, log `pair_skipped` | Handler swallows error, stale flag persists for next batch | Return last-persisted score or null/"pending" | §10.1, §7.2.6 |
| DB write timeout | Retry next cycle (pair stays claimed until `BATCH_CLAIM_TIMEOUT_MS`) | N/A (no writes in event handler) | Return stale score from cache/DB read | §6.2.4 |
| DB write constraint violation | Upsert no-op (idempotent, `scored_at <` guard) | N/A | N/A | §6.2.1 |
| SKIP LOCKED claim failure | No rows claimed; cycle is no-op; counts toward circuit breaker | N/A | N/A | §4.1 |
| Redis unavailable | N/A (batch doesn't use Redis) | N/A | Fail-open to DB read | §7.2.1 |
| 100% null skip rate (cascade) | Counts as batch failure for circuit breaker | N/A | N/A | §8.2.3 |
| Staleness trigger during batch compute | Score written; stale_at persists; pair re-enters next cycle | Sets stale_at (normal operation) | N/A | §9.2.4 |
| Consent revoked during batch compute | Write-time guard rejects; no-op | Sets status='revoked', deletes score | Return null/"pending" (pair excluded) | §11.2.1, §11.2.3 |
| Worker crash mid-batch | Unclaimed rows released after timeout; scored rows idempotent on replay | N/A | N/A | §6.2.4 |
| Retry exhaustion (retry_count >= 10) | Mark pair `failed`, exclude from selection | N/A | Return null/"pending" (no score exists) | §10.2 |

### Alert-to-Recovery Mapping

Every PREP-M2b alert MUST have a corresponding recovery procedure in this contract.

| PREP-M2b Alert | Trigger | Recovery Procedure | Contract Section |
|---|---|---|---|
| `ScoringBatchHighFailureRate` | Circuit breaker tripped (5 consecutive failures) | Check DB/Redis health → resolve infra → wait for auto-reset probe or manual `FORCE_CLOSE` | §4.3, §4.4 |
| `ScoringBatchCascadeDetected` | Skip rate ≥ 50% in a cycle | Check `assembleMatchInputs` dependencies (profile service, DB connectivity) → resolve → pairs retry next cycle | §8.2.2 |
| `ScoringPairRetryExhausted` | Pair reaches MAX_RETRIES=10 | Investigate pair data (missing profile? revoked consent?) → fix data → admin reset to pending | §10.2 |
| `ScoringRealTimeLatencyHigh` | p95 real-time scoring > 200ms | Check Redis availability → if down, DB fallback active (expected latency increase) → restore Redis | §7.2.2 |
| `ScoringStalenessBudgetExceeded` | p95 score age > 2× stale_threshold | Check batch worker health → check circuit breaker state → if paused, investigate root cause | §5.7, §4 |
| `ScoringConsentRevocationBacklog` | Revoked pairs with persisted scores > 0 for > 5min | Check consent revocation handler → verify hard-delete executing → manual cleanup if handler stuck | §11.2.3 |

### Verification Ownership & Timing

| Area | Owner | Timing | Blocks |
|---|---|---|---|
| Matrix cell validation (each row has implementation path) | Implementing developer + reviewer | PR review for Stories 7.3, 7.7 | PR merge |
| Alert-to-recovery mapping completeness | QA + Ops | Before Story 7.7 starts | Story 7.7 kickoff |
| Cross-ref PREP-M1 §6 degradation matrix | Implementing developer | During Story 7.3 implementation | Story completion |
| Cross-ref PREP-M2 batch test cases (§4.3) | QA | During test plan review | Test plan approval |
| Constants alignment audit (this contract vs code) | Implementing developer | PR review | PR merge |

### Recovery Path Test Requirements (PREP-M2 Suite Extension)

The PREP-M2 test suite MUST extend beyond retry mechanics to validate post-recovery state consistency:

**CircuitBreakerRecovery:**
- Force 5 consecutive failures → verify circuit opens → wait cooldown → verify probe fires → verify system resumes
- Verify no `SKIP LOCKED` rows acquired while circuit is open

**PartialBatchRecovery:**
- Process 100 pairs, kill worker at pair 40 → verify remaining 60 re-claimable next cycle → verify 40 already-written scores survive (idempotent replay)
- Verify `scored_at` guard prevents stale overwrites on replay

**CascadeDetection:**
- Mock `assembleMatchInputs` to return null for 100% of a 10-pair chunk → verify counts as circuit breaker failure
- Mock 50% null rate → verify log emitted but cycle continues and circuit breaker NOT tripped (single occurrence)

**RaceConditionRecovery:**
- Set `stale_at` concurrently during batch computation → verify score is written AND pair re-enters next cycle
- Revoke consent during batch computation → verify write-time guard rejects → verify no persisted score for revoked pair

**RedisFailover:**
- Real-time scoring with Redis down → verify DB fallback returns correct score → verify no error surfaced to caller
- Redis recovers → verify cache repopulates on next read (no manual intervention)

## Spec Change Log

- **2026-05-17:** Resolved Ask First items. Added §4 (Circuit Breaker) and §5 (Stale Score Ranking Policy). Decisions: circuit breaker YES (5 failures, in-memory, global scope, auto-reset 30min); stale scores deprioritize via decay function, never suppress in v1; cold-start returns null/"pending"; API returns `scored_at` timestamp.
- **2026-05-17:** Added §6-§12 addressing validation gaps: partial batch idempotency (§6), Redis fail-open for real-time (§7), cascade detection (§8), staleness/batch race resolution (§9), pair lifecycle state machine (§10), consent revocation race guard (§11), constants summary (§12). Replaced Verification section with full failure mode × execution mode matrix, alert-to-recovery mapping, ownership table, and recovery path test requirements.

## Suggested Review Order

**Failure taxonomy and core contracts**

- Entry point: failure mode x execution mode matrix covering all 10 failure paths
  [`prep-m9-failure-mode-recovery-contract.md:37`](prep-m9-failure-mode-recovery-contract.md#L37)

- Circuit breaker: 5-failure threshold, in-memory state, auto-reset probe with cooldown progression
  [`prep-m9-failure-mode-recovery-contract.md:63`](prep-m9-failure-mode-recovery-contract.md#L63)

- Consent revocation race: CTE-guarded upsert protecting both INSERT and UPDATE branches
  [`prep-m9-failure-mode-recovery-contract.md:348`](prep-m9-failure-mode-recovery-contract.md#L348)

**Score lifecycle and resilience**

- Stale score decay function with clock-skew guard and per-surface config
  [`prep-m9-failure-mode-recovery-contract.md:115`](prep-m9-failure-mode-recovery-contract.md#L115)

- Idempotent score writes: upsert with `computed_at <` guard, per-chunk commits
  [`prep-m9-failure-mode-recovery-contract.md:207`](prep-m9-failure-mode-recovery-contract.md#L207)

- Pair lifecycle state machine with `scored + null inputs` transition added post-review
  [`prep-m9-failure-mode-recovery-contract.md:332`](prep-m9-failure-mode-recovery-contract.md#L332)

**Race conditions and detection**

- Staleness trigger + batch recompute race: aligned with PREP-M1 `stale` boolean schema
  [`prep-m9-failure-mode-recovery-contract.md:268`](prep-m9-failure-mode-recovery-contract.md#L268)

- Cascade detection: threshold aligned at >= 5 rows to match circuit breaker trigger
  [`prep-m9-failure-mode-recovery-contract.md:247`](prep-m9-failure-mode-recovery-contract.md#L247)

- Redis fail-open for real-time path: DB fallback within 200ms latency budget
  [`prep-m9-failure-mode-recovery-contract.md:231`](prep-m9-failure-mode-recovery-contract.md#L231)

**Alert mapping and operations**

- Alert-to-recovery mapping: all 6 M2b alerts + 5 extended alerts with runbook cross-refs
  [`prep-m9-failure-mode-recovery-contract.md:405`](prep-m9-failure-mode-recovery-contract.md#L405)

- Recovery runbook: 8 operational procedures with copy-paste commands
  [`prep-m9-failure-mode-recovery-contract.md:432`](prep-m9-failure-mode-recovery-contract.md#L432)

**Cross-references**

- Constants summary table: 9 configurable constants with override mechanisms
  [`prep-m9-failure-mode-recovery-contract.md:393`](prep-m9-failure-mode-recovery-contract.md#L393)

- Story implementation mapping and PREP cross-reference tables
  [`prep-m9-failure-mode-recovery-contract.md:499`](prep-m9-failure-mode-recovery-contract.md#L499)
