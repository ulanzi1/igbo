// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  env: {
    DAILY_API_KEY: "test-api-key",
    DAILY_API_URL: "https://api.daily.co/v1",
  },
}));

import { DailyVideoService } from "./daily-video-service";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const apiUrl = "https://api.daily.co/v1";
const apiKey = "test-api-key";

const service = new DailyVideoService(apiUrl, apiKey);

const EVENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const END_TIME = new Date("2030-01-01T12:00:00Z");
const USER_ID = "user-abc-123";

beforeEach(() => {
  mockFetch.mockReset();
});

describe("DailyVideoService.createMeeting", () => {
  it("POSTs to /rooms with correct room name and properties", async () => {
    const roomName = `igbo-evt-${EVENT_ID.replace(/[^a-z0-9]/gi, "").slice(0, 60)}`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "room-id",
        name: roomName,
        url: `https://igbo.daily.co/${roomName}`,
        privacy: "public",
        properties: {},
      }),
    });

    const result = await service.createMeeting(EVENT_ID, END_TIME);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/rooms`);
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options.body as string) as {
      name: string;
      properties: {
        enable_knocking: boolean;
        enable_breakout_rooms: boolean;
        exp: number;
        enable_recording: string;
      };
    };
    expect(body.name).toBe(roomName);
    expect(body.properties.enable_knocking).toBe(true);
    expect(body.properties.enable_breakout_rooms).toBe(true);
    expect(body.properties.enable_recording).toBe("cloud");
    // exp should be endTime + 1 hour in unix seconds
    const expectedExp = Math.floor(END_TIME.getTime() / 1000) + 3600;
    expect(body.properties.exp).toBe(expectedExp);

    expect(result.roomName).toBe(roomName);
    expect(result.roomUrl).toBe(`https://igbo.daily.co/${roomName}`);
  });

  it("throws when Daily API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"error":"Bad request"}',
    });

    await expect(service.createMeeting(EVENT_ID, END_TIME)).rejects.toThrow("Daily API error 400");
  });

  it("throws when Daily API returns 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(service.createMeeting(EVENT_ID, END_TIME)).rejects.toThrow("Daily API error 500");
  });
});

describe("DailyVideoService.getMeetingToken", () => {
  const roomName = "igbo-evt-testroom";

  it("POSTs to /meeting-tokens with correct token properties", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test" }),
    });

    const result = await service.getMeetingToken(roomName, USER_ID, false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/meeting-tokens`);
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as {
      properties: {
        room_name: string;
        user_id: string;
        is_owner: boolean;
        exp: number;
      };
    };
    expect(body.properties.room_name).toBe(roomName);
    expect(body.properties.user_id).toBe(USER_ID);
    expect(body.properties.is_owner).toBe(false);
    // exp should be ~2h from now
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(body.properties.exp).toBeGreaterThan(nowSeconds + 7000);
    expect(body.properties.exp).toBeLessThan(nowSeconds + 7500);

    expect(result.token).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test");
    expect(result).not.toHaveProperty("roomUrl");
  });

  it("sets is_owner=true for owner tokens", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "owner-token" }),
    });

    await service.getMeetingToken(roomName, USER_ID, true);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      properties: { is_owner: boolean };
    };
    expect(body.properties.is_owner).toBe(true);
  });

  it("throws when Daily API returns error for token generation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"Unauthorized"}',
    });

    await expect(service.getMeetingToken(roomName, USER_ID, false)).rejects.toThrow(
      "Daily API error 401",
    );
  });
});
