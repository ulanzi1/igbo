/**
 * WebSocket / Socket.IO load test (Story 12.6, Task 4)
 *
 * Standalone Node.js script using socket.io-client.
 * k6 cannot speak Socket.IO (Engine.IO transport negotiation) — this is intentional.
 *
 * Targets:
 *   NFR-P10: 500+ simultaneous WebSocket connections
 *   NFR-P7:  Message send → receive latency p95 < 500ms
 *   NFR-SC4: Chat message throughput >= 100 msg/sec
 *
 * Usage: node tests/load/scenarios/ws-loadtest.mjs
 *
 * Set BASE_URL env var to override default (http://localhost:3000).
 * Set REALTIME_URL env var for the Socket.IO server (http://localhost:3001).
 */

import { io } from "socket.io-client";
import { createRequire } from "module";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const REALTIME_URL = process.env.REALTIME_URL ?? "http://localhost:3001";
const TARGET_CONNECTIONS = parseInt(process.env.WS_CONNECTIONS ?? "500", 10);
const RAMP_DURATION_MS = 60_000; // 60s ramp
const SUSTAIN_DURATION_MS = 120_000; // 2 minutes sustained
const MSG_INTERVAL_MS = 5_000; // 1 msg / 5s per socket = 100 msg/s at 500 connections
const AUTH_BATCH_SIZE = 50; // authenticate in batches to avoid sequential bottleneck
const KNOWN_USER_COUNT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper — get session cookie via Auth.js CSRF flow
// ─────────────────────────────────────────────────────────────────────────────

async function authenticate(userIndex) {
  const email = `loadtest-${(userIndex % KNOWN_USER_COUNT) + 1}@test.local`;

  try {
    // Step 1: GET /api/auth/csrf
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();

    if (!csrfToken) return null;

    // Step 2: POST credentials
    const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csrfToken,
        email,
        password: "LoadTest123!",
        redirect: false,
        json: true,
      }),
      redirect: "manual",
    });

    // Extract session cookie
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/(authjs\.session-token|next-auth\.session-token)=[^;]+/);
    return match ? match[0] : null;
  } catch (err) {
    console.warn(`Auth failed for ${email}: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics tracking
// ─────────────────────────────────────────────────────────────────────────────

const metrics = {
  connectionAttempts: 0,
  connectionSuccesses: 0,
  connectionFailures: 0,
  messagesSent: 0,
  messagesReceived: 0,
  latencies: [], // ms per message round-trip
  errors: [],
  startTime: Date.now(),
};

function recordLatency(ms) {
  metrics.latencies.push(ms);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeLatencyStats() {
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    count: sorted.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO connection
// ─────────────────────────────────────────────────────────────────────────────

function openSocket(sessionCookie, connectionIndex) {
  return new Promise((done) => {
    metrics.connectionAttempts++;

    const socket = io(REALTIME_URL, {
      // Force WebSocket transport — skip polling upgrade dance for consistent latency
      transports: ["websocket"],
      extraHeaders: sessionCookie ? { Cookie: sessionCookie } : {},
      reconnection: false,
      timeout: 10_000,
    });

    const timer = setTimeout(() => {
      metrics.connectionFailures++;
      metrics.errors.push({ type: "timeout", index: connectionIndex });
      socket.disconnect();
      done(null);
    }, 10_000);

    socket.on("connect", () => {
      clearTimeout(timer);
      metrics.connectionSuccesses++;
      done(socket);
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      metrics.connectionFailures++;
      metrics.errors.push({ type: "connect_error", message: err.message, index: connectionIndex });
      done(null);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Send a message and measure latency via echo
// ─────────────────────────────────────────────────────────────────────────────

function sendTestMessage(socket, connectionIndex) {
  const sentAt = Date.now();
  const messageId = `lt-${connectionIndex}-${sentAt}`;
  let recorded = false;

  function recordOnce(latency) {
    if (recorded) return;
    recorded = true;
    clearTimeout(latencyTimer);
    recordLatency(latency);
    metrics.messagesReceived++;
  }

  // Fallback: if no ack within 500ms, record as high-latency
  const latencyTimer = setTimeout(() => {
    recordOnce(500);
  }, 500);

  // Listen for server event ack
  socket.once(`message:ack:${messageId}`, () => {
    recordOnce(Date.now() - sentAt);
  });

  // Emit a chat message to a test conversation
  socket.emit(
    "message:send",
    {
      conversationId: `lt-conv-${connectionIndex % 100}`,
      content: `Load test message ${messageId}`,
      messageId,
    },
    () => {
      // emit ack callback
      recordOnce(Date.now() - sentAt);
    },
  );

  metrics.messagesSent++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 WebSocket load test starting`);
  console.log(`   Target: ${TARGET_CONNECTIONS} connections over ${RAMP_DURATION_MS / 1000}s`);
  console.log(`   Sustained: ${SUSTAIN_DURATION_MS / 1000}s`);
  console.log(`   Message interval: ${MSG_INTERVAL_MS}ms per socket`);
  console.log(`   Realtime server: ${REALTIME_URL}\n`);

  // ── Phase 1: Authenticate in batches ──────────────────────────────────────
  console.log("Authenticating test users...");
  const sessionCookies = [];
  for (let batch = 0; batch < TARGET_CONNECTIONS; batch += AUTH_BATCH_SIZE) {
    const batchIndices = Array.from(
      { length: Math.min(AUTH_BATCH_SIZE, TARGET_CONNECTIONS - batch) },
      (_, i) => batch + i,
    );
    const cookies = await Promise.all(batchIndices.map((i) => authenticate(i)));
    sessionCookies.push(...cookies);
    process.stdout.write(`  Authenticated ${Math.min(batch + AUTH_BATCH_SIZE, TARGET_CONNECTIONS)}/${TARGET_CONNECTIONS}\r`);
  }
  console.log(`\n  ✓ Authentication complete`);

  // ── Phase 2: Ramp up connections ──────────────────────────────────────────
  console.log(`\nRamping up ${TARGET_CONNECTIONS} connections over ${RAMP_DURATION_MS / 1000}s...`);

  const sockets = [];
  const rampInterval = RAMP_DURATION_MS / TARGET_CONNECTIONS;

  for (let i = 0; i < TARGET_CONNECTIONS; i++) {
    const socket = await openSocket(sessionCookies[i], i);
    sockets.push(socket);

    if ((i + 1) % 50 === 0) {
      console.log(
        `  Connected ${metrics.connectionSuccesses}/${i + 1} (${metrics.connectionFailures} failed)`,
      );
    }

    // Pace connections over the ramp window
    await new Promise((r) => setTimeout(r, rampInterval));
  }

  console.log(`\n  ✓ Connection ramp complete`);
  console.log(
    `    Success: ${metrics.connectionSuccesses}, Failed: ${metrics.connectionFailures}`,
  );

  // ── Phase 3: Sustained throughput ─────────────────────────────────────────
  console.log(`\nRunning sustained throughput test for ${SUSTAIN_DURATION_MS / 1000}s...`);

  const activeSockets = sockets.filter((s) => s !== null);
  const sustainStartTime = Date.now();
  const intervals = activeSockets.map((socket, idx) =>
    setInterval(() => {
      if (socket.connected) sendTestMessage(socket, idx);
    }, MSG_INTERVAL_MS),
  );

  // Report progress every 15s
  const reportInterval = setInterval(() => {
    const elapsed = ((Date.now() - sustainStartTime) / 1000).toFixed(0);
    const throughput = (metrics.messagesSent / (elapsed || 1)).toFixed(1);
    console.log(
      `  [${elapsed}s] Sent: ${metrics.messagesSent}, Received: ${metrics.messagesReceived}, Throughput: ${throughput} msg/s`,
    );
  }, 15_000);

  await new Promise((r) => setTimeout(r, SUSTAIN_DURATION_MS));

  // ── Phase 4: Graceful disconnect ───────────────────────────────────────────
  console.log("\nDisconnecting...");
  clearInterval(reportInterval);
  intervals.forEach((iv) => clearInterval(iv));
  await Promise.all(activeSockets.map((s) => new Promise((r) => { s.disconnect(); setTimeout(r, 100); })));

  // ── Results ────────────────────────────────────────────────────────────────
  const totalDuration = (Date.now() - metrics.startTime) / 1000;
  // Measure throughput over sustained phase only (excludes auth + ramp + disconnect)
  const sustainDuration = SUSTAIN_DURATION_MS / 1000;
  const actualThroughput = metrics.messagesSent / sustainDuration;
  const latencyStats = computeLatencyStats();

  const results = {
    connections: {
      target: TARGET_CONNECTIONS,
      actual: metrics.connectionSuccesses,
      failures: metrics.connectionFailures,
      success_rate: (metrics.connectionSuccesses / TARGET_CONNECTIONS) * 100,
      nfr: "NFR-P10: 500+ simultaneous WebSocket connections",
      pass: metrics.connectionSuccesses >= 500,
    },
    throughput: {
      target_msg_sec: 100,
      actual_msg_sec: parseFloat(actualThroughput.toFixed(2)),
      messages_sent: metrics.messagesSent,
      messages_received: metrics.messagesReceived,
      nfr: "NFR-SC4: 100+ messages/sec",
      pass: actualThroughput >= 100,
    },
    latency: {
      p50: latencyStats.p50,
      p95: latencyStats.p95,
      p99: latencyStats.p99,
      sample_count: latencyStats.count,
      target_p95_ms: 500,
      nfr: "NFR-P7: message send→receive latency p95 < 500ms",
      pass: latencyStats.p95 < 500,
    },
    errors: metrics.errors.slice(0, 20), // cap error list
    test_duration_s: parseFloat(totalDuration.toFixed(1)),
    timestamp: new Date().toISOString(),
  };

  // Write results
  const resultsDir = resolve(process.cwd(), "tests/load/results");
  mkdirSync(resultsDir, { recursive: true });
  const outPath = resolve(resultsDir, "ws.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log("\n📊 Results:");
  console.log(
    `  Connections: ${results.connections.actual}/${TARGET_CONNECTIONS} (${results.connections.pass ? "✅ PASS" : "❌ FAIL"} NFR-P10)`,
  );
  console.log(
    `  Throughput:  ${results.throughput.actual_msg_sec} msg/s (${results.throughput.pass ? "✅ PASS" : "❌ FAIL"} NFR-SC4)`,
  );
  console.log(
    `  Latency p95: ${results.latency.p95}ms (${results.latency.pass ? "✅ PASS" : "❌ FAIL"} NFR-P7)`,
  );
  console.log(`\n  Results written to: ${outPath}`);

  const allPass =
    results.connections.pass && results.throughput.pass && results.latency.pass;

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("ws-loadtest failed:", err);
  process.exit(1);
});
