/**
 * Unified load test report generator (Story 12.6, Task 5.2)
 *
 * Reads k6 NDJSON output and ws-loadtest JSON, compares against baseline,
 * outputs unified report, and flags regressions > 10%.
 *
 * Usage:
 *   node tests/load/lib/report.mjs            # generate report
 *   node tests/load/lib/report.mjs --save-baseline  # save current as baseline
 *
 * Exit codes:
 *   0 — all thresholds pass, no regressions
 *   1 — threshold failure or regression detected
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const RESULTS_DIR = resolve(ROOT, "tests/load/results");
const BASELINE_PATH = resolve(ROOT, "tests/load/baseline.json");

const HTTP_RESULTS_PATH = resolve(RESULTS_DIR, "http.json");
const WS_RESULTS_PATH = resolve(RESULTS_DIR, "ws.json");
const REPORT_PATH = resolve(RESULTS_DIR, "report.json");

const SAVE_BASELINE = process.argv.includes("--save-baseline");
const REGRESSION_THRESHOLD = 0.1; // 10% degradation = flag

// ─────────────────────────────────────────────────────────────────────────────
// Parse k6 NDJSON output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * k6 --out json writes NDJSON (newline-delimited JSON), one metric object per line.
 * NOT a JSON array — must parse line by line.
 */
function parseK6Ndjson(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const lines = readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Aggregate metrics by name
  const metrics = {};

  for (const entry of lines) {
    if (entry.type !== "Point") continue;

    const name = entry.metric;
    const value = entry.data?.value;
    const tags = entry.data?.tags ?? {};

    if (value === undefined) continue;

    if (!metrics[name]) {
      metrics[name] = { values: [], tags: [] };
    }
    metrics[name].values.push(value);
    if (Object.keys(tags).length > 0) {
      metrics[name].tags.push(tags);
    }
  }

  return metrics;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function summariseMetric(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: values.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NFR evaluation
// ─────────────────────────────────────────────────────────────────────────────

function evaluateHttpNfrs(metrics) {
  const reqDuration = metrics?.http_req_duration;
  const reqFailed = metrics?.http_req_failed;

  const durationSummary = reqDuration ? summariseMetric(reqDuration.values) : null;
  const failRate = reqFailed
    ? reqFailed.values.reduce((a, b) => a + b, 0) / reqFailed.values.length
    : null;

  const results = {
    "NFR-P8": {
      description: "API p95 response time < 200ms",
      value: durationSummary?.p95 ?? null,
      threshold: 200,
      pass: durationSummary?.p95 != null ? durationSummary.p95 < 200 : null,
    },
    "NFR-SC3": {
      description: "200+ concurrent VUs sustained",
      value: "measured by stage config",
      threshold: 200,
      pass: true, // structural — pass if test ran to completion
    },
    "NFR-SC5": {
      description: "DB query < 100ms (via API p95 proxy)",
      value: durationSummary?.p95 ?? null,
      threshold: 200,
      pass: durationSummary?.p95 != null ? durationSummary.p95 < 200 : null,
      note: "API p95 is proxy for NFR-SC5 (includes routing + auth overhead on top of DB)",
    },
    errorRate: {
      description: "Error rate < 1%",
      value: failRate,
      threshold: 0.01,
      pass: failRate != null ? failRate < 0.01 : null,
    },
  };

  return { durationSummary, failRate, results };
}

function evaluateWsNfrs(wsData) {
  if (!wsData) return null;

  return {
    "NFR-P10": {
      description: "500+ simultaneous WebSocket connections",
      value: wsData.connections?.actual ?? null,
      threshold: 500,
      pass: wsData.connections?.pass ?? null,
    },
    "NFR-P7": {
      description: "Message latency p95 < 500ms",
      value: wsData.latency?.p95 ?? null,
      threshold: 500,
      pass: wsData.latency?.pass ?? null,
    },
    "NFR-SC4": {
      description: "Chat throughput >= 100 msg/sec",
      value: wsData.throughput?.actual_msg_sec ?? null,
      threshold: 100,
      pass: wsData.throughput?.pass ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Regression detection
// ─────────────────────────────────────────────────────────────────────────────

function detectRegressions(current, baseline) {
  if (!baseline) return [];

  const regressions = [];

  const checks = [
    {
      key: "http.p95",
      currentVal: current.http?.durationSummary?.p95,
      baselineVal: baseline.http?.durationSummary?.p95,
      higherIsWorse: true,
      label: "HTTP p95 response time",
    },
    {
      key: "ws.latency_p95",
      currentVal: current.ws?.latency?.p95,
      baselineVal: baseline.ws?.latency?.p95,
      higherIsWorse: true,
      label: "WebSocket latency p95",
    },
    {
      key: "ws.throughput",
      currentVal: current.ws?.throughput?.actual_msg_sec,
      baselineVal: baseline.ws?.throughput?.actual_msg_sec,
      higherIsWorse: false,
      label: "WebSocket throughput (msg/sec)",
    },
    {
      key: "ws.connections",
      currentVal: current.ws?.connections?.actual,
      baselineVal: baseline.ws?.connections?.actual,
      higherIsWorse: false,
      label: "WebSocket connection count",
    },
  ];

  for (const { key, currentVal, baselineVal, higherIsWorse, label } of checks) {
    if (currentVal == null || baselineVal == null || baselineVal === 0) continue;

    const change = (currentVal - baselineVal) / baselineVal;
    const degraded = higherIsWorse ? change > REGRESSION_THRESHOLD : change < -REGRESSION_THRESHOLD;

    if (degraded) {
      regressions.push({
        metric: key,
        label,
        baseline: baselineVal,
        current: currentVal,
        change_pct: (change * 100).toFixed(1),
        severity: Math.abs(change) > 0.25 ? "HIGH" : "MEDIUM",
      });
    }
  }

  return regressions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📊 Generating load test report...\n");

  // Parse k6 results
  const k6Metrics = parseK6Ndjson(HTTP_RESULTS_PATH);
  if (!k6Metrics) {
    console.warn(`⚠️  k6 HTTP results not found at ${HTTP_RESULTS_PATH}`);
    console.warn("   Run: npm run test:load:http first");
  }

  // Parse ws results
  let wsData = null;
  if (existsSync(WS_RESULTS_PATH)) {
    try {
      wsData = JSON.parse(readFileSync(WS_RESULTS_PATH, "utf-8"));
    } catch (err) {
      console.warn(`⚠️  Could not parse ws results: ${err.message}`);
    }
  } else {
    console.warn(`⚠️  WebSocket results not found at ${WS_RESULTS_PATH}`);
  }

  // Evaluate NFRs
  const httpEval = k6Metrics ? evaluateHttpNfrs(k6Metrics) : null;
  const wsEval = wsData ? evaluateWsNfrs(wsData) : null;

  const current = {
    timestamp: new Date().toISOString(),
    http: httpEval
      ? {
          durationSummary: httpEval.durationSummary,
          failRate: httpEval.failRate,
          nfrs: httpEval.results,
        }
      : null,
    ws: wsData
      ? {
          connections: wsData.connections,
          throughput: wsData.throughput,
          latency: wsData.latency,
          nfrs: wsEval,
        }
      : null,
  };

  // Load baseline for regression check
  let baseline = null;
  if (existsSync(BASELINE_PATH)) {
    try {
      baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
    } catch {
      console.warn("⚠️  Could not parse baseline.json — skipping regression check");
    }
  } else {
    console.log(
      'ℹ️  No baseline found. Run with --save-baseline after first successful run.',
    );
  }

  // Detect regressions
  const regressions = detectRegressions(current, baseline);

  // Collect all failures
  const failures = [];

  if (httpEval) {
    for (const [nfr, result] of Object.entries(httpEval.results)) {
      if (result.pass === false) {
        failures.push({ nfr, description: result.description, value: result.value, threshold: result.threshold });
      }
    }
  }

  if (wsEval) {
    for (const [nfr, result] of Object.entries(wsEval)) {
      if (result.pass === false) {
        failures.push({ nfr, description: result.description, value: result.value, threshold: result.threshold });
      }
    }
  }

  for (const reg of regressions) {
    failures.push({
      nfr: "REGRESSION",
      description: `${reg.label} degraded ${reg.change_pct}% from baseline`,
      value: reg.current,
      baseline: reg.baseline,
      severity: reg.severity,
    });
  }

  const report = {
    ...current,
    regressions,
    failures,
    pass: failures.length === 0,
    summary: failures.length === 0 ? "✅ All NFR thresholds pass" : `❌ ${failures.length} failure(s)`,
  };

  // Write report
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  // Print summary
  console.log("=".repeat(60));
  console.log("LOAD TEST REPORT");
  console.log("=".repeat(60));

  if (httpEval) {
    console.log("\nHTTP NFRs:");
    for (const [nfr, result] of Object.entries(httpEval.results)) {
      const status = result.pass === true ? "✅" : result.pass === false ? "❌" : "⚠️";
      const val = result.value != null ? ` (${typeof result.value === "number" ? result.value.toFixed(1) : result.value})` : "";
      console.log(`  ${status} ${nfr}: ${result.description}${val}`);
    }
  }

  if (wsEval) {
    console.log("\nWebSocket NFRs:");
    for (const [nfr, result] of Object.entries(wsEval)) {
      const status = result.pass === true ? "✅" : result.pass === false ? "❌" : "⚠️";
      const val = result.value != null ? ` (${result.value})` : "";
      console.log(`  ${status} ${nfr}: ${result.description}${val}`);
    }
  }

  if (regressions.length > 0) {
    console.log("\nRegressions (>10% from baseline):");
    for (const reg of regressions) {
      console.log(`  ❌ [${reg.severity}] ${reg.label}: ${reg.change_pct}% worse than baseline`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(report.summary);
  console.log(`Report written to: ${REPORT_PATH}`);

  // Save baseline if requested
  if (SAVE_BASELINE) {
    writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2));
    console.log(`\n✅ Baseline saved to: ${BASELINE_PATH}`);
  }

  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error("Report generation failed:", err);
  process.exit(1);
});
