/**
 * k6 feed pagination stress test (Story 12.6, Task 3.4)
 *
 * Each VU fetches 10 pages sequentially using cursor-based pagination.
 * Tests the most common query path under sustained load.
 *
 * Load profile (general):
 *   Ramp up:   0 → 50 VUs over 30s
 *   Sustained: 50 VUs for 2 minutes
 *   Spike:     50 → 200 VUs over 15s (NFR-SC3)
 *   Hold:      200 VUs for 1 minute
 *   Ramp down: 200 → 0 VUs over 30s
 *
 * Covers NFR-P8 (API p95 < 200ms) and NFR-SC5 (DB queries < 100ms via proxy).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { thresholds } from "../config/thresholds.js";

export const options = {
  thresholds,
  stages: [
    { duration: "30s", target: 50 },
    { duration: "2m", target: 50 },
    { duration: "15s", target: 200 },
    { duration: "1m", target: 200 },
    { duration: "30s", target: 0 },
  ],
};

const pageDuration = new Trend("feed_page_duration");
const paginationErrors = new Counter("pagination_errors");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export function setup() {
  const sessionCookies = [];

  for (let i = 1; i <= 20; i++) {
    const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`);
    let csrfToken = null;
    try {
      csrfToken = JSON.parse(csrfRes.body).csrfToken;
    } catch {
      /* ignore */
    }

    if (!csrfToken) {
      sessionCookies.push(null);
      continue;
    }

    const loginRes = http.post(
      `${BASE_URL}/api/auth/callback/credentials`,
      JSON.stringify({
        csrfToken,
        email: `loadtest-${i}@test.local`,
        password: "LoadTest123!",
        redirect: false,
        json: true,
      }),
      { headers: { "Content-Type": "application/json" }, redirects: 0 },
    );

    const setCookie = loginRes.headers["Set-Cookie"] || "";
    const match = setCookie.match(/(authjs\.session-token|next-auth\.session-token)=[^;]+/);
    sessionCookies.push(match ? match[0] : null);
  }

  return { sessionCookies };
}

export default function (data) {
  const userIndex = (__VU - 1) % 20;
  const sessionCookie = data.sessionCookies[userIndex];
  const headers = sessionCookie ? { Cookie: sessionCookie } : {};

  let cursor = null;

  // Fetch 10 pages sequentially
  for (let page = 0; page < 10; page++) {
    const url = cursor
      ? `${BASE_URL}/api/v1/feed?cursor=${encodeURIComponent(cursor)}`
      : `${BASE_URL}/api/v1/feed`;

    const res = http.get(url, { headers, tags: { type: "api" } });
    const ok = check(res, {
      [`feed page ${page + 1}: status 200 or 401`]: (r) => r.status === 200 || r.status === 401,
    });

    pageDuration.add(res.timings.duration);

    if (!ok) {
      paginationErrors.add(1);
      break;
    }

    // Extract cursor for next page
    if (res.status === 200) {
      try {
        const body = JSON.parse(res.body);
        cursor = body?.data?.nextCursor ?? body?.nextCursor ?? null;
      } catch {
        cursor = null;
      }
    }

    if (!cursor) break; // No more pages
    sleep(0.1);
  }

  sleep(1);
}
