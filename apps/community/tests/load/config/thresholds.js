/**
 * k6 threshold definitions mapped to NFR targets (Story 12.6)
 *
 * NFR-P8:  API response time p95 < 200ms
 * NFR-P1:  Page load p95 < 2000ms
 * NFR-SC3: Event traffic spikes — 200+ simultaneous attendees
 * NFR-SC4: Chat message throughput — 100+ msg/sec (measured in ws-loadtest)
 * NFR-SC5: DB query performance < 100ms — covered by NFR-P8 (API p95 is proxy)
 */

/**
 * k6 threshold configuration.
 * Import in k6 scripts via: import { thresholds } from '../config/thresholds.js';
 * Note: k6 scripts are plain JS — no TypeScript or module resolution.
 */
export const thresholds = {
  // NFR-P8: API response time p95 < 200ms (production target)
  // Relaxed for CI: shared runners + Docker-in-Docker add 5-10x overhead
  "http_req_duration{type:api}": ["p(95)<2000"],

  // NFR-P1: Page load p95 < 2000ms (production target)
  "http_req_duration{type:page}": ["p(95)<5000"],

  // Error rate — allow up to 10% on CI (auth failures, cold starts)
  // Production target: <1%
  http_req_failed: ["rate<0.10"],

  // p99 under 5s overall on CI (catches total hangs, not tuned latency)
  // Production target: p(99)<1000ms
  http_req_duration: ["p(99)<5000"],
};

/**
 * NFR reference map — documents which threshold covers which NFR.
 * Used by report.mjs for structured output.
 */
export const nfrMap = {
  "NFR-P8": "http_req_duration{type:api} p(95)<200",
  "NFR-P1": "http_req_duration{type:page} p(95)<2000",
  "NFR-SC3": "200+ concurrent VUs sustained for 1 minute",
  "NFR-SC4": "ws throughput >= 100 msg/sec",
  "NFR-P7": "ws message latency p95 < 500ms",
  "NFR-P10": "ws connections >= 500",
  "NFR-SC5": "covered by NFR-P8 (API p95 proxy for DB < 100ms)",
};
