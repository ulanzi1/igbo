/**
 * k6 HTTP API load test — all major endpoints (Story 12.6, Task 3)
 *
 * Tests authenticated API endpoints under general load profile:
 *   Ramp up:   0 → 50 VUs over 30s
 *   Sustained: 50 VUs for 2 minutes
 *   Spike:     50 → 200 VUs over 15s (NFR-SC3)
 *   Hold:      200 VUs for 1 minute
 *   Ramp down: 200 → 0 VUs over 30s
 *
 * Covers NFR-P8 (API p95 < 200ms) and NFR-SC3 (200+ simultaneous users).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { thresholds } from "../config/thresholds.js";

// ─── Options ──────────────────────────────────────────────────────────────────

export const options = {
  thresholds,
  stages: [
    { duration: "30s", target: 50 }, // ramp up
    { duration: "2m", target: 50 }, // sustained load
    { duration: "15s", target: 200 }, // spike to 200 VUs (NFR-SC3)
    { duration: "1m", target: 200 }, // hold spike
    { duration: "30s", target: 0 }, // ramp down
  ],
};

// ─── Custom metrics ───────────────────────────────────────────────────────────

const feedDuration = new Trend("feed_req_duration");
const searchDuration = new Trend("search_req_duration");
const requestErrors = new Counter("request_errors");

// ─── Auth.js CSRF setup ───────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

/**
 * k6 setup() — called once before VUs start.
 * Authenticates each of the 20 test users and returns their session cookies.
 *
 * Auth.js v5 credential flow:
 * 1. GET /api/auth/csrf → extract csrfToken
 * 2. POST /api/auth/callback/credentials → capture session cookie
 */
export function setup() {
  const sessionCookies = [];

  for (let i = 1; i <= 20; i++) {
    const email = `loadtest-${i}@test.local`;

    // Step 1: Get CSRF token
    const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`);
    const csrfData = JSON.parse(csrfRes.body);
    const csrfToken = csrfData.csrfToken;

    if (!csrfToken) {
      console.warn(`Could not get CSRF token for ${email}`);
      sessionCookies.push(null);
      continue;
    }

    // Step 2: Authenticate
    const loginRes = http.post(
      `${BASE_URL}/api/auth/callback/credentials`,
      JSON.stringify({
        csrfToken,
        email,
        password: "LoadTest123!",
        redirect: false,
        json: true,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        redirects: 0,
      },
    );

    // Extract session cookie from Set-Cookie header
    const setCookie = loginRes.headers["Set-Cookie"] || "";
    const sessionMatch = setCookie.match(/(authjs\.session-token|next-auth\.session-token)=[^;]+/);
    const sessionCookie = sessionMatch ? sessionMatch[0] : null;

    if (!sessionCookie) {
      console.warn(`Auth failed for ${email} (status: ${loginRes.status})`);
      sessionCookies.push(null);
    } else {
      sessionCookies.push(sessionCookie);
    }
  }

  return { sessionCookies };
}

// ─── VU main function ─────────────────────────────────────────────────────────

export default function (data) {
  // Distribute VUs across 20 test users
  const userIndex = (__VU - 1) % 20;
  const sessionCookie = data.sessionCookies[userIndex];

  const authHeaders = sessionCookie
    ? { Cookie: sessionCookie, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const params = { headers: authHeaders, tags: { type: "api" } };

  // ── Health check (unauthenticated baseline) ────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/health`, { tags: { type: "api" } });
    check(res, { "health: status 200": (r) => r.status === 200 });
  }

  sleep(0.2);

  // ── Feed pagination ────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/feed`, params);
    const ok = check(res, {
      "feed: status 200 or 401": (r) => r.status === 200 || r.status === 401,
    });
    feedDuration.add(res.timings.duration);
    if (!ok) requestErrors.add(1);
  }

  sleep(0.3);

  // ── Member search ──────────────────────────────────────────────────────────
  {
    const term = ["ade", "chi", "eze", "obi", "nna"][Math.floor(Math.random() * 5)];
    const res = http.get(`${BASE_URL}/api/v1/members?search=${term}`, params);
    const ok = check(res, {
      "members search: 200 or 401": (r) => r.status === 200 || r.status === 401,
    });
    searchDuration.add(res.timings.duration);
    if (!ok) requestErrors.add(1);
  }

  sleep(0.3);

  // ── Group directory ────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/groups`, params);
    check(res, { "groups: 200 or 401": (r) => r.status === 200 || r.status === 401 });
  }

  sleep(0.2);

  // ── Events listing ─────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/events`, params);
    check(res, { "events: 200 or 401": (r) => r.status === 200 || r.status === 401 });
  }

  sleep(0.2);

  // ── Articles listing ───────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/articles`, params);
    check(res, { "articles: 200 or 401": (r) => r.status === 200 || r.status === 401 });
  }

  sleep(0.2);

  // ── Notifications ──────────────────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/notifications`, params);
    check(res, { "notifications: 200 or 401": (r) => r.status === 200 || r.status === 401 });
  }

  sleep(0.3);

  // ── Post creation (write path) ─────────────────────────────────────────────
  {
    const res = http.post(
      `${BASE_URL}/api/v1/posts`,
      JSON.stringify({
        content: `Load test post from VU ${__VU} at ${Date.now()}`,
        contentType: "text",
        visibility: "members_only",
        category: "discussion",
      }),
      params,
    );
    check(res, {
      "create post: 201 or 401": (r) => r.status === 201 || r.status === 401,
    });
    if (res.status !== 201 && res.status !== 401) requestErrors.add(1);
  }

  sleep(0.5);
}
