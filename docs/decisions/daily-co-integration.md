# ADR: Daily.co Video Meeting Integration Spike

**Date:** 2026-03-05
**Status:** Proposed — verify API shapes against live Daily.co docs before Story 7.3 implementation
**Owner:** Winston (Architect)
**Context:** Story 7.3 (Epic 7) requires video meeting integration. Daily.co REST API is the chosen provider. This spike documents the API shape, sandbox setup, CI mock strategy, and recording webhook payload so Story 7.3 can be written and implemented without API unknowns.

---

## Daily.co REST API — Core Operations

Base URL: `https://api.daily.co/v1`
Auth header: `Authorization: Bearer $DAILY_API_KEY`

### createMeeting — Create a Room

```ts
// POST https://api.daily.co/v1/rooms
const response = await fetch("https://api.daily.co/v1/rooms", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: `igbo-event-${eventId}`, // optional; auto-generated if omitted
    privacy: "private", // "public" | "private"
    properties: {
      exp: Math.floor(Date.now() / 1000) + 7200, // expires in 2 hours
      max_participants: 100,
      enable_recording: "cloud", // "cloud" | "local" | "none"
      enable_chat: true,
    },
  }),
});

// Success response shape:
interface DailyRoom {
  id: string;
  name: string;
  url: string; // e.g. "https://igbo.daily.co/igbo-event-abc123"
  privacy: "public" | "private";
  created_at: string; // ISO 8601
  config: {
    exp?: number;
    max_participants?: number;
    enable_recording?: "cloud" | "local" | "none";
    enable_chat?: boolean;
  };
}
```

### getMeetingToken — Participant Join Token

```ts
// POST https://api.daily.co/v1/meeting-tokens
const response = await fetch("https://api.daily.co/v1/meeting-tokens", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    properties: {
      room_name: room.name,
      user_id: userId,
      user_name: displayName,
      is_owner: isHost, // true for event organizer
      exp: Math.floor(Date.now() / 1000) + 7200,
      start_video_off: false,
      start_audio_off: false,
    },
  }),
});

// Success response shape:
interface DailyMeetingToken {
  token: string; // JWT — pass as `token` query param or Daily SDK prop
}
```

### deleteRoom — End a Meeting

```ts
// DELETE https://api.daily.co/v1/rooms/{name}
await fetch(`https://api.daily.co/v1/rooms/${room.name}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
});
// 200 { deleted: true, name: "igbo-event-abc123" }
```

---

## Embed Strategy (Story 7.3)

**Recommended: Daily Prebuilt (iframe)**

```tsx
// No npm package needed — just an iframe
<iframe
  src={`${room.url}?t=${token}`}
  allow="camera; microphone; fullscreen; speaker; display-capture"
  style={{ width: "100%", height: "600px", border: "none" }}
/>
```

Prebuilt provides a full-featured meeting UI (camera, mic, chat, screenshare, recording controls) with zero client JS bundle overhead.

**Future: Call Object (`@daily-co/daily-js`)** — full custom UI, larger bundle. Deferred post-v1.

---

## Sandbox Environment

1. Register at `https://www.daily.co/` — free tier supports up to 10 participants / 200 minutes per month.
2. Create a test domain (e.g., `igbo-dev.daily.co`) in the Daily.co dashboard.
3. Generate an API key under Settings → Developers.
4. Add to `.env.local`: `DAILY_API_KEY=your_test_key`
5. Test domain is fully isolated from production — safe for local development.

---

## CI Mock Strategy

All Daily.co API calls must go through a thin service wrapper so tests can mock them without needing `DAILY_API_KEY` in CI.

**Service wrapper (to be created in Story 7.3):**

```ts
// src/services/daily-service.ts
export async function createMeeting(eventId: string): Promise<DailyRoom> { ... }
export async function getMeetingToken(roomName: string, userId: string, isHost: boolean): Promise<string> { ... }
export async function deleteRoom(roomName: string): Promise<void> { ... }
```

**Test mock pattern:**

```ts
vi.mock("@/services/daily-service", () => ({
  createMeeting: vi.fn().mockResolvedValue({
    id: "room-abc",
    name: "igbo-event-test",
    url: "https://igbo-dev.daily.co/igbo-event-test",
    privacy: "private",
    created_at: "2026-01-01T00:00:00Z",
    config: { exp: 9999999999, enable_recording: "cloud" },
  }),
  getMeetingToken: vi.fn().mockResolvedValue("mock-daily-jwt"),
  deleteRoom: vi.fn().mockResolvedValue(undefined),
}));
```

Rule: Routes and services NEVER call `fetch("https://api.daily.co/...")` directly — always through the service wrapper.

---

## Recording Webhook Payload

Daily.co sends a POST to your configured webhook URL when a cloud recording is ready:

```ts
interface DailyRecordingWebhook {
  version: "v2";
  type: "recording.ready-to-download";
  id: string; // webhook event ID
  room_name: string;
  session_id: string;
  recording_id: string;
  duration: number; // seconds
  max_participants: number;
  start_ts: number; // unix timestamp (meeting start)
  status: "finished";
  s3key?: string; // if custom S3 bucket configured
  download_link?: string; // pre-signed URL, expires ~6 hours
  share_token?: string; // Daily.co hosted playback token
}
```

**Webhook signature verification** (`x-daily-signature` header):

```ts
import { createHmac } from "crypto";

function verifyDailySignature(body: string, signature: string): boolean {
  const expected = createHmac("sha256", process.env.DAILY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");
  return `sha256=${expected}` === signature;
}
```

Story 7.4 owns the recording webhook endpoint. Story 7.3 only sets `enable_recording: "cloud"` in `createMeeting`.

---

## Required Environment Variables

| Variable               | Used by   | Notes                            |
| ---------------------- | --------- | -------------------------------- |
| `DAILY_API_KEY`        | Story 7.3 | Daily.co REST API key            |
| `DAILY_WEBHOOK_SECRET` | Story 7.4 | Webhook HMAC verification secret |

---

## Story 7.3 Acceptance Criteria (no unknowns)

- `POST /api/v1/events/[eventId]/meeting` → calls `createMeeting`, stores `room.url` + `room.name` on the event row, returns room URL
- `GET /api/v1/events/[eventId]/meeting-token` → calls `getMeetingToken(roomName, userId, isHost)`, returns token; 403 if user has no RSVP
- Event detail page embeds `<iframe src={roomUrl}?t={token}>` when `now` is within event start/end time window
- Non-RSVP'd members see a "RSVP required to join" message instead of the iframe
- Event organizer sees an "End Meeting" button that calls `DELETE /api/v1/events/[eventId]/meeting` → `deleteRoom`
