// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

// Webhook route uses withApiHandler but is machine-to-machine (no CSRF Origin/Host).
// Use passthrough mock since Daily.co webhooks won't include CSRF headers.
vi.mock("@/server/api/middleware", () => ({
  withApiHandler: (handler: (req: Request) => Promise<Response>) => handler,
}));

vi.mock("@/lib/api-response", () => ({
  successResponse: vi.fn(
    (data: unknown, _meta?: unknown, status = 200) =>
      new Response(JSON.stringify({ data }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ),
  errorResponse: vi.fn(
    (problem: { status?: number; title: string }) =>
      new Response(JSON.stringify({ title: problem.title }), {
        status: problem.status ?? 500,
      }),
  ),
}));

vi.mock("@/env", () => ({
  env: { DAILY_WEBHOOK_SECRET: "test-secret" },
}));

const mockGetEventByRoomName = vi.fn();
const mockSetRecordingSourceUrl = vi.fn();
const mockRunJob = vi.fn();

vi.mock("@/db/queries/events", () => ({
  getEventByRoomName: (...args: unknown[]) => mockGetEventByRoomName(...args),
  setRecordingSourceUrl: (...args: unknown[]) => mockSetRecordingSourceUrl(...args),
}));

vi.mock("@/server/jobs/job-runner", () => ({
  runJob: (...args: unknown[]) => mockRunJob(...args),
}));

const ROOM_NAME = "igbo-evt-eventabceventabce";
const EVENT_ID = "event-abc";
const DOWNLOAD_LINK = "https://download.daily.co/recording.mp4";
const SECRET = "test-secret";

function makeSignature(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function makeRequest(body: unknown, opts?: { signature?: string; skipSig?: boolean }): Request {
  const rawBody = JSON.stringify(body);
  const sig = opts?.skipSig ? undefined : (opts?.signature ?? makeSignature(rawBody));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sig !== undefined) headers["x-webhook-signature"] = sig;
  return new Request("http://localhost/api/v1/webhooks/daily/recording-ready", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

beforeEach(() => {
  mockGetEventByRoomName.mockReset();
  mockSetRecordingSourceUrl.mockReset();
  mockRunJob.mockReset();
  mockSetRecordingSourceUrl.mockResolvedValue(undefined);
  mockRunJob.mockResolvedValue(undefined);
});

describe("POST /api/v1/webhooks/daily/recording-ready", () => {
  describe("signature validation", () => {
    it("returns 401 when signature is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest(
          {
            type: "recording.ready-to-download",
            room_name: ROOM_NAME,
            download_link: DOWNLOAD_LINK,
          },
          { skipSig: true },
        ),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 when signature is wrong", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest(
          {
            type: "recording.ready-to-download",
            room_name: ROOM_NAME,
            download_link: DOWNLOAD_LINK,
          },
          { signature: "deadbeef" },
        ),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("payload validation", () => {
    it("returns 400 when body is invalid JSON", async () => {
      const rawBody = "not-json";
      const sig = makeSignature(rawBody);
      const req = new Request("http://localhost/api/v1/webhooks/daily/recording-ready", {
        method: "POST",
        headers: { "x-webhook-signature": sig },
        body: rawBody,
      });
      const { POST } = await import("./route");
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when type field is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ room_name: ROOM_NAME }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when room_name field is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ type: "recording.ready-to-download" }));
      expect(res.status).toBe(400);
    });
  });

  describe("non-recording events", () => {
    it("returns 200 received:true for unrecognised event type without processing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ type: "other.event", room_name: ROOM_NAME }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { received: boolean } };
      expect(body.data.received).toBe(true);
      expect(mockGetEventByRoomName).not.toHaveBeenCalled();
    });
  });

  describe("recording.ready-to-download", () => {
    it("returns 400 when download_link is absent", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ type: "recording.ready-to-download", room_name: ROOM_NAME }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 when room_name does not map to an event", async () => {
      mockGetEventByRoomName.mockResolvedValue(null);
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          type: "recording.ready-to-download",
          room_name: "unknown-room",
          download_link: DOWNLOAD_LINK,
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 200 skipped:true when recording_url already set (idempotency)", async () => {
      mockGetEventByRoomName.mockResolvedValue({
        id: EVENT_ID,
        dailyRoomName: ROOM_NAME,
        recordingUrl: DOWNLOAD_LINK,
      });

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          type: "recording.ready-to-download",
          room_name: ROOM_NAME,
          download_link: DOWNLOAD_LINK,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { received: boolean; skipped: boolean } };
      expect(body.data.skipped).toBe(true);
      expect(mockSetRecordingSourceUrl).not.toHaveBeenCalled();
    });

    it("sets recording URL and enqueues mirror job on success", async () => {
      mockGetEventByRoomName.mockResolvedValue({
        id: EVENT_ID,
        dailyRoomName: ROOM_NAME,
        recordingUrl: null,
      });

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({
          type: "recording.ready-to-download",
          room_name: ROOM_NAME,
          download_link: DOWNLOAD_LINK,
        }),
      );
      expect(res.status).toBe(200);
      expect(mockSetRecordingSourceUrl).toHaveBeenCalledWith(EVENT_ID, DOWNLOAD_LINK);
      expect(mockRunJob).toHaveBeenCalledWith("recording-mirror");
    });
  });
});
