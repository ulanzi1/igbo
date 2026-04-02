/**
 * k6 event spike simulation (Story 12.6, Task 3.5)
 *
 * Simulates a virtual event spike: 200+ simultaneous attendees all hitting
 * event detail + RSVP endpoints at once.
 *
 * Load profile (dedicated spike — skips initial ramp, goes straight to spike):
 *   Direct ramp: 0 → 200 VUs over 15s
 *   Hold:        200 VUs for 2 minutes
 *   Ramp down:   200 → 0 VUs over 30s
 *
 * Covers NFR-SC3 (event traffic spikes — 200+ simultaneous attendees, 3x normal).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { thresholds } from "../config/thresholds.js";

export const options = {
  thresholds,
  // Dedicated spike profile — no warm-up ramp
  stages: [
    { duration: "15s", target: 200 }, // direct ramp to spike
    { duration: "2m", target: 200 }, // hold spike for 2 minutes
    { duration: "30s", target: 0 }, // ramp down
  ],
};

const eventDetailDuration = new Trend("event_detail_duration");
const rsvpDuration = new Trend("rsvp_duration");
const spikeErrors = new Counter("spike_errors");

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export function setup() {
  const sessionCookies = [];
  let eventId = null;

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
    const cookie = match ? match[0] : null;
    sessionCookies.push(cookie);

    // Grab an event ID from the first authenticated user for detail/RSVP tests
    if (!eventId && cookie) {
      const eventsRes = http.get(`${BASE_URL}/api/v1/events`, {
        headers: { Cookie: cookie },
      });
      if (eventsRes.status === 200) {
        try {
          const body = JSON.parse(eventsRes.body);
          const events = body?.data?.items ?? body?.data ?? [];
          if (events.length > 0) eventId = events[0].id;
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { sessionCookies, eventId };
}

export default function (data) {
  const userIndex = (__VU - 1) % 20;
  const sessionCookie = data.sessionCookies[userIndex];
  const headers = sessionCookie
    ? { Cookie: sessionCookie, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  // ── Events listing (simulates attendees checking schedule) ─────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/events`, { headers, tags: { type: "api" } });
    const ok = check(res, {
      "events list: 200 or 401": (r) => r.status === 200 || r.status === 401,
    });
    if (!ok) spikeErrors.add(1);
  }

  sleep(0.2);

  // ── Event detail (simulates attendees viewing event page) ──────────────────
  if (data.eventId) {
    const res = http.get(`${BASE_URL}/api/v1/events/${data.eventId}`, {
      headers,
      tags: { type: "api" },
    });
    const ok = check(res, {
      "event detail: 200 or 401 or 404": (r) =>
        r.status === 200 || r.status === 401 || r.status === 404,
    });
    eventDetailDuration.add(res.timings.duration);
    if (!ok) spikeErrors.add(1);
  }

  sleep(0.1);

  // ── RSVP endpoint (simulates attendees RSVPing during spike) ───────────────
  if (data.eventId) {
    const res = http.post(
      `${BASE_URL}/api/v1/events/${data.eventId}/rsvp`,
      JSON.stringify({ status: "attending" }),
      { headers, tags: { type: "api" } },
    );
    const ok = check(res, {
      "rsvp: 200/201 or 401 or 409": (r) =>
        r.status === 200 || r.status === 201 || r.status === 401 || r.status === 409,
    });
    rsvpDuration.add(res.timings.duration);
    if (!ok) spikeErrors.add(1);
  }

  sleep(0.1);

  // ── Health check under spike ───────────────────────────────────────────────
  {
    const res = http.get(`${BASE_URL}/api/v1/health`, { tags: { type: "api" } });
    check(res, { "health under spike: 200": (r) => r.status === 200 });
  }

  sleep(0.3);
}
